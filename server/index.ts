import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type DataKind = 'sales' | 'inventory' | 'expenses' | 'purchases' | 'invoices';
type RecommendationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  businessId: string;
}

interface Business {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

interface Recommendation {
  id: string;
  businessId: string;
  createdAt: string;
  status: RecommendationStatus;
  query: string;
  intent: string;
  evidence: unknown[];
  recommendation: string;
  action?: Record<string, unknown>;
}

interface Store {
  users: User[];
  businesses: Business[];
  data: Record<string, Record<DataKind, any[]>>;
  recommendations: Recommendation[];
  purchaseOrders: any[];
  auditLogs: any[];
}

export const app = express();
const port = Number(process.env.PORT || 4000);
const dataPath = process.env.BB_DATA_PATH || path.resolve(process.cwd(), 'server/data.json');
const sessions = new Map<string, string>();

function emptyStore(): Store {
  return { users: [], businesses: [], data: {}, recommendations: [], purchaseOrders: [], auditLogs: [] };
}

function readStore(): Store {
  if (!fs.existsSync(dataPath)) return emptyStore();
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Store;
  } catch {
    throw new Error('The application data store is unreadable.');
  }
}

let store = readStore();

function writeStore(): void {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  const temporaryPath = `${dataPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temporaryPath, dataPath);
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) return false;
  const expected = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(digest, 'hex'));
}

function safeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...publicValue } = user;
  return publicValue;
}

function getCookie(req: Request, name: string): string | undefined {
  const header = req.header('cookie') || '';
  return header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function businessData(businessId: string): Record<DataKind, any[]> {
  if (!store.data[businessId]) {
    store.data[businessId] = { sales: [], inventory: [], expenses: [], purchases: [], invoices: [] };
  }
  return store.data[businessId];
}

function currentUser(req: Request): User | undefined {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '') || getCookie(req, 'bb_session');
  const userId = token ? sessions.get(token) : undefined;
  return userId ? store.users.find((user) => user.id === userId) : undefined;
}

function requireUser(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please log in to continue.' });
    return;
  }
  res.locals.user = user;
  next();
}

function setSession(res: Response, userId: string): void {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, userId);
  res.cookie('bb_session', token, { httpOnly: true, sameSite: 'lax' });
}

function monthKey(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : undefined;
}

function total(records: any[], field: string): number {
  return records.reduce((result, record) => result + (typeof record[field] === 'number' ? record[field] : 0), 0);
}

function analyze(data: Record<DataKind, any[]>, query: string, language: string): Record<string, unknown> {
  const normalized = query.toLowerCase();
  const months = [...new Set(data.sales.map((sale) => monthKey(sale.date)).filter(Boolean))].sort().reverse() as string[];
  const currentMonth = months[0];
  const previousMonth = months[1];
  const currentSales = data.sales.filter((sale) => monthKey(sale.date) === currentMonth);
  const previousSales = data.sales.filter((sale) => monthKey(sale.date) === previousMonth);
  const expensesFor = (month: string | undefined) => data.expenses.filter((expense) => monthKey(expense.date) === month || (!expense.date && expense.period === (month === currentMonth ? 'current' : 'previous')));
  const currentExpenses = expensesFor(currentMonth);
  const previousExpenses = expensesFor(previousMonth);
  const currentRevenue = total(currentSales, 'totalRevenue');
  const previousRevenue = total(previousSales, 'totalRevenue');
  const currentExpenseTotal = total(currentExpenses, 'amount');
  const previousExpenseTotal = total(previousExpenses, 'amount');
  const facts = {
    currentRevenue,
    previousRevenue,
    revenueDelta: currentRevenue - previousRevenue,
    currentExpenses: currentExpenseTotal,
    previousExpenses: previousExpenseTotal,
    expenseDelta: currentExpenseTotal - previousExpenseTotal,
    currentProfit: currentRevenue - currentExpenseTotal,
    previousProfit: previousRevenue - previousExpenseTotal,
    profitDelta: currentRevenue - currentExpenseTotal - (previousRevenue - previousExpenseTotal),
  };
  const evidence = [
    { type: 'FACT', label: 'Current revenue', value: currentRevenue, source: 'sales' },
    { type: 'FACT', label: 'Previous revenue', value: previousRevenue, source: 'sales' },
    { type: 'CALCULATION', label: 'Current profit', value: facts.currentProfit, formula: 'revenue - expenses', source: 'sales + expenses' },
    { type: 'CALCULATION', label: 'Previous profit', value: facts.previousProfit, formula: 'revenue - expenses', source: 'sales + expenses' },
  ];
  const asksInventory = /reorder|stock|inventory|slow|selling|product|சரக்கு|கையிருப்பு|ஆர்டர்|स्टॉक|खरीद|ఆర్డర్/.test(normalized);
  const asksProfit = /profit|revenue|expense|cost|money|லாபம்|செலவு|முனாபா|खर्च|मुनाफ़ा|లాభం/.test(normalized);
  if (asksProfit && (currentSales.length === 0 || currentExpenses.length === 0)) return { query, language, intent: 'insufficient_data', facts: {}, evidence: [], explanation: 'There is not enough sales and expense data to calculate profit yet.', recommendation: 'Upload sales and expense data before asking for a profit comparison.' };
  if (asksInventory && data.inventory.length === 0) return { query, language, intent: 'insufficient_data', facts: {}, evidence: [], explanation: 'There is no inventory data for this business yet.', recommendation: 'Upload inventory data before asking for stock or reorder recommendations.' };
  const slow = data.inventory.map((item) => ({ ...item, drop: item.previousSalesVelocityUnitsPerWeek > 0 ? (item.previousSalesVelocityUnitsPerWeek - item.salesVelocityUnitsPerWeek) / item.previousSalesVelocityUnitsPerWeek : 0 })).filter((item) => item.drop >= 0.25).sort((a, b) => b.drop - a.drop)[0];
  const contributors = ['Purchase Cost', 'Wastage', 'Delivery Expense'].map((category) => ({ category, delta: total(currentExpenses.filter((item) => item.category === category), 'amount') - total(previousExpenses.filter((item) => item.category === category), 'amount') })).filter((item) => item.delta !== 0);
  const explanation = asksProfit ? `Profit changed by ₹${Math.abs(facts.profitDelta).toLocaleString('en-IN')} compared with the previous period. ${contributors.length ? `Recorded expense changes: ${contributors.map((item) => `${item.category} ₹${item.delta.toLocaleString('en-IN')}`).join(', ')}.` : 'No categorized expense changes were found.'}` : slow ? `${slow.productName} has a measured sales-velocity decline of ${Math.round(slow.drop * 100)}%.` : 'I found business data, but need a more specific question about sales, expenses, profit, or inventory.';
  const recommendation = slow ? `Consider reducing the next purchase quantity for ${slow.productName} based on its measured velocity decline.` : 'No action recommendation is available from the current data.';
  const action = slow ? { type: 'GENERATE_PURCHASE_ORDER', productId: slow.productId, productName: slow.productName, quantity: Math.max(0, Math.round((slow.standardOrderQuantity || 0) * (1 - slow.drop * 0.5))), requiresApproval: true } : undefined;
  return { query, language, intent: asksProfit ? 'profit_analysis' : 'inventory_analysis', facts, evidence: [...evidence, ...contributors.map((item) => ({ type: 'FACT', label: item.category, value: item.delta, source: 'expenses' }))], explanation, recommendation, action };
}

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.post('/api/auth/signup', (req, res) => {
  if (typeof req.body?.email !== 'string' || !/^\S+@\S+\.\S+$/.test(req.body.email) || typeof req.body?.password !== 'string' || req.body.password.length < 8) return res.status(400).json({ error: 'Use a valid email and a password with at least 8 characters.' });
  const email = req.body.email.toLowerCase().trim();
  if (store.users.some((user) => user.email === email)) return res.status(409).json({ error: 'An account with that email already exists.' });
  if (typeof req.body.name !== 'string' || !req.body.name.trim() || typeof req.body.businessName !== 'string' || !req.body.businessName.trim()) return res.status(400).json({ error: 'Name and business name are required.' });
  const user: User = { id: newId('usr'), name: req.body.name.trim(), email, passwordHash: hashPassword(req.body.password), businessId: newId('biz') };
  const business: Business = { id: user.businessId, name: req.body.businessName.trim(), ownerId: user.id, createdAt: new Date().toISOString() };
  store.users.push(user); store.businesses.push(business); businessData(user.businessId); writeStore(); setSession(res, user.id);
  res.status(201).json({ user: safeUser(user), business });
});

app.post('/api/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const user = store.users.find((candidate) => candidate.email === email);
  if (!user || !verifyPassword(req.body?.password || '', user.passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  setSession(res, user.id); res.json({ user: safeUser(user), business: store.businesses.find((business) => business.id === user.businessId) });
});

app.post('/api/auth/logout', (req, res) => { const token = req.header('authorization')?.replace(/^Bearer\s+/i, '') || getCookie(req, 'bb_session'); if (token) sessions.delete(token); res.clearCookie('bb_session'); res.status(204).end(); });
app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: safeUser(res.locals.user), business: store.businesses.find((business) => business.id === res.locals.user.businessId) }));

app.get('/api/dashboard', requireUser, (req, res) => {
  const data = businessData(res.locals.user.businessId); const revenue = total(data.sales, 'totalRevenue'); const expenses = total(data.expenses, 'amount');
  res.json({ hasData: data.sales.length > 0 || data.inventory.length > 0 || data.expenses.length > 0, metrics: { revenue: data.sales.length ? revenue : null, expenses: data.expenses.length ? expenses : null, profit: data.sales.length || data.expenses.length ? revenue - expenses : null, inventoryValue: data.inventory.length ? data.inventory.reduce((result, item) => result + (item.currentStock || 0) * (item.purchasePrice || 0), 0) : null }, counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length])) });
});

app.get('/api/data', requireUser, (req, res) => res.json(businessData(res.locals.user.businessId)));

app.post('/api/import/:kind', requireUser, (req, res) => {
  const kind = req.params.kind as DataKind;
  if (!['sales', 'inventory', 'expenses', 'purchases', 'invoices'].includes(kind) || !Array.isArray(req.body?.rows)) return res.status(400).json({ error: 'Unsupported dataset or rows.' });
  const data = businessData(res.locals.user.businessId); const existingIds = new Set(data[kind].map((row) => row.id)); const accepted: any[] = []; const rejected: any[] = [];
  for (const row of req.body.rows) { if (!row || typeof row.id !== 'string' || !row.id.trim() || existingIds.has(row.id)) rejected.push({ row, reason: 'Missing or duplicate record id.' }); else { existingIds.add(row.id); accepted.push({ ...row, businessId: res.locals.user.businessId, importedAt: new Date().toISOString() }); } }
  data[kind].push(...accepted); writeStore(); res.status(201).json({ accepted: accepted.length, rejected: rejected.length, errors: rejected });
});

app.post('/api/ask', requireUser, (req, res) => {
  if (typeof req.body?.query !== 'string' || !req.body.query.trim()) return res.status(400).json({ error: 'Ask a business question.' });
  const result = analyze(businessData(res.locals.user.businessId), req.body.query.trim(), req.body.language || 'en');
  const recommendation = result.action ? { id: newId('rec'), businessId: res.locals.user.businessId, createdAt: new Date().toISOString(), status: 'PENDING' as RecommendationStatus, query: req.body.query.trim(), intent: result.intent as string, evidence: result.evidence as unknown[], recommendation: result.recommendation as string, action: result.action as Record<string, unknown> } : undefined;
  if (recommendation) { store.recommendations.push(recommendation); }
  store.auditLogs.push({ id: newId('audit'), userId: res.locals.user.id, businessId: res.locals.user.businessId, createdAt: new Date().toISOString(), query: req.body.query.trim(), intent: result.intent, tools: ['tenant_scoped_deterministic_analysis'], evidence: result.evidence, recommendation: result.recommendation, approval: 'PENDING' }); writeStore();
  res.json({ ...result, recommendationId: recommendation?.id });
});

app.get('/api/recommendations', requireUser, (req, res) => res.json(store.recommendations.filter((item) => item.businessId === res.locals.user.businessId)));
app.get('/api/purchase-orders', requireUser, (req, res) => res.json(store.purchaseOrders.filter((item) => item.businessId === res.locals.user.businessId)));
app.get('/api/audit', requireUser, (req, res) => res.json(store.auditLogs.filter((item) => item.businessId === res.locals.user.businessId)));

app.post('/api/recommendations/:recommendationId/approve', requireUser, (req, res) => {
  const recommendation = store.recommendations.find((item) => item.id === req.params.recommendationId && item.businessId === res.locals.user.businessId);
  if (!recommendation) return res.status(404).json({ error: 'Recommendation not found.' });
  if (recommendation.status !== 'PENDING') return res.status(409).json({ error: 'Recommendation has already been resolved.' });
  recommendation.status = 'APPROVED'; const order = { id: newId('po'), businessId: res.locals.user.businessId, ...recommendation.action, status: 'approved', createdAt: new Date().toISOString(), approvedBy: res.locals.user.id };
  store.purchaseOrders.push(order); store.auditLogs.push({ id: newId('audit'), userId: res.locals.user.id, businessId: res.locals.user.businessId, createdAt: new Date().toISOString(), query: recommendation.query, intent: recommendation.intent, recommendation: recommendation.recommendation, approval: 'APPROVED', action: order }); writeStore(); res.json({ recommendation, order });
});

app.post('/api/recommendations/:recommendationId/reject', requireUser, (req, res) => {
  const recommendation = store.recommendations.find((item) => item.id === req.params.recommendationId && item.businessId === res.locals.user.businessId);
  if (!recommendation) return res.status(404).json({ error: 'Recommendation not found.' });
  if (recommendation.status !== 'PENDING') return res.status(409).json({ error: 'Recommendation has already been resolved.' });
  recommendation.status = 'REJECTED'; store.auditLogs.push({ id: newId('audit'), userId: res.locals.user.id, businessId: res.locals.user.businessId, createdAt: new Date().toISOString(), query: recommendation.query, intent: recommendation.intent, recommendation: recommendation.recommendation, approval: 'REJECTED', reason: req.body?.reason || 'Rejected by user' }); writeStore(); res.json({ recommendation });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(500).json({ error: 'The request could not be completed.' }); });
if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`BharatBiz API listening on http://localhost:${port}`));
