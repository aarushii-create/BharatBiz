import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { invokeInvestigation } from '../src/agents';
import { calculate_profit_change } from '../src/services/businessAnalytics';

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
const host = process.env.HOST || '0.0.0.0';
const baseDataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const dataPath = process.env.BB_DATA_PATH || path.resolve(baseDataDir, 'bharatbiz-data.json');
const sessions = new Map<string, string>();
const isProduction = (process.env.NODE_ENV || 'development').toLowerCase() === 'production';
const allowedOrigins = new Set([
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  process.env.APP_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
].filter((value): value is string => Boolean(value)));

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
  res.cookie('bb_session', token, {
    httpOnly: true,
    sameSite: (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax',
    secure: isProduction || process.env.COOKIE_SECURE === 'true',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function monthKey(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : undefined;
}

function total(records: any[], field: string): number {
  return records.reduce((result, record) => result + (typeof record[field] === 'number' ? record[field] : 0), 0);
}

function analyze(data: Record<DataKind, any[]>, query: string, language: string, businessId = 'biz-murugan-01'): Record<string, unknown> {
  const normalized = query.toLowerCase();
  const businessInvestigation = invokeInvestigation(query, language as any, businessId);

  const currentMonth = [...new Set(data.sales.map((sale) => monthKey(sale.date)).filter(Boolean))].sort().reverse()[0] as string | undefined;
  const previousMonth = [...new Set(data.sales.map((sale) => monthKey(sale.date)).filter(Boolean))].sort().reverse()[1] as string | undefined;
  const currentSales = data.sales.filter((sale) => monthKey(sale.date) === currentMonth);
  const previousSales = data.sales.filter((sale) => monthKey(sale.date) === previousMonth);
  const currentExpenses = data.expenses.filter((expense) => monthKey(expense.date) === currentMonth || (!expense.date && expense.period === 'current'));
  const previousExpenses = data.expenses.filter((expense) => monthKey(expense.date) === previousMonth || (!expense.date && expense.period === 'previous'));

  const currentRevenue = currentSales.reduce((sum, sale) => sum + (typeof sale.totalRevenue === 'number' ? sale.totalRevenue : 0), 0);
  const previousRevenue = previousSales.reduce((sum, sale) => sum + (typeof sale.totalRevenue === 'number' ? sale.totalRevenue : 0), 0);
  const currentExpenseTotal = currentExpenses.reduce((sum, expense) => sum + (typeof expense.amount === 'number' ? expense.amount : 0), 0);
  const previousExpenseTotal = previousExpenses.reduce((sum, expense) => sum + (typeof expense.amount === 'number' ? expense.amount : 0), 0);
  const currentProfit = currentRevenue - currentExpenseTotal;
  const previousProfit = previousRevenue - previousExpenseTotal;
  const profitDelta = currentProfit - previousProfit;
  const revenueDelta = currentRevenue - previousRevenue;
  const expenseDelta = currentExpenseTotal - previousExpenseTotal;

  const asksInventory = /reorder|stock|inventory|slow|selling|product|சரக்கு|கையிருப்பு|ஆர்டர்|स्टॉक|खरीद|ఆర్డర్/.test(normalized);
  const asksProfit = /profit|revenue|expense|cost|money|லாபம்|செலவு|मुनाफ़ा|खर्च|मुनाफा|లాభం/.test(normalized);

  const facts = {
    currentRevenue,
    previousRevenue,
    revenueDelta,
    currentExpenses: currentExpenseTotal,
    previousExpenses: previousExpenseTotal,
    expenseDelta,
    currentProfit,
    previousProfit,
    profitDelta,
  };

  const evidence = [
    { type: 'FACT', label: 'Revenue change', value: revenueDelta, formula: 'currentRevenue - previousRevenue', source: 'sales ledger' },
    { type: 'FACT', label: 'Expense change', value: expenseDelta, formula: 'currentExpenses - previousExpenses', source: 'expense ledger' },
    { type: 'CALCULATION', label: 'Profit change', value: profitDelta, formula: 'currentProfit - previousProfit', source: 'deterministic analytics' },
  ];

  const slowInventory = data.inventory
    .map((item) => ({ ...item, drop: item.previousSalesVelocityUnitsPerWeek > 0 ? ((item.previousSalesVelocityUnitsPerWeek - item.salesVelocityUnitsPerWeek) / item.previousSalesVelocityUnitsPerWeek) : 0 }))
    .filter((item) => item.drop >= 0.25)
    .sort((a, b) => b.drop - a.drop)[0];

  const action = slowInventory && data.inventory.length > 0
    ? {
        type: 'GENERATE_PURCHASE_ORDER',
        productId: slowInventory.productId,
        productName: slowInventory.productName,
        quantity: Math.max(0, Math.round((slowInventory.standardOrderQuantity || 0) * (1 - Math.min(0.5, slowInventory.drop * 0.5)))),
        requiresApproval: true,
      }
    : undefined;

  const recommendationText = action
    ? `Consider reducing the next purchase quantity for ${action.productName} based on measured velocity decline.`
    : 'No action recommendation is available from the current data.';

  return {
    query,
    language,
    intent: asksProfit ? 'profit_analysis' : asksInventory ? 'inventory_analysis' : 'general_business_health',
    facts,
    evidence,
    agentTrace: businessInvestigation.activity,
    evidenceQuality: businessInvestigation.evidenceQuality,
    decisionRoom: {
      summary: profitDelta < 0 ? `Profit was down by ₹${Math.abs(profitDelta).toLocaleString('en-IN')}.` : 'The current business picture is stable.',
      evidence: [
        `Revenue delta: ₹${revenueDelta.toLocaleString('en-IN')}`,
        `Expense delta: ₹${expenseDelta.toLocaleString('en-IN')}`,
        `Profit delta: ₹${profitDelta.toLocaleString('en-IN')}`,
      ],
      recommendation: recommendationText,
      approvalRequired: !!action?.requiresApproval,
    },
    explanation: asksProfit
      ? `Profit changed by ₹${Math.abs(profitDelta).toLocaleString('en-IN')} compared with the previous period. The current ledger shows revenue of ₹${currentRevenue.toLocaleString('en-IN')} and expenses of ₹${currentExpenseTotal.toLocaleString('en-IN')}.`
      : slowInventory
        ? `${slowInventory.productName} is moving slower than its prior baseline and merits review.`
        : 'The business data is available, but there is not yet enough actionable inventory evidence for a purchase recommendation.',
    recommendation: recommendationText,
    action,
  };
}

app.use((req, res, next) => {
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 25000);
  req.setTimeout(timeoutMs);
  res.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timed out.' });
    }
  });
  next();
});

app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again.' },
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS policy disallows this origin.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bharatbiz-ai', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bharatbiz-ai', timestamp: new Date().toISOString(), businessStore: 'active', mode: process.env.NODE_ENV || 'development' });
});

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
  const monthKeys = [...new Set([...data.sales.map((sale) => monthKey(sale.date)), ...data.expenses.map((expense) => monthKey(expense.date))].filter(Boolean))].sort() as string[];
  const trend = monthKeys.map((month) => { const monthSales = data.sales.filter((sale) => monthKey(sale.date) === month); const monthExpenses = data.expenses.filter((expense) => monthKey(expense.date) === month); const monthRevenue = total(monthSales, 'totalRevenue'); const monthExpenseTotal = total(monthExpenses, 'amount'); return { month, revenue: monthRevenue, expenses: monthExpenseTotal, profit: monthRevenue - monthExpenseTotal }; });
  const slowProducts = data.inventory.filter((item) => item.previousSalesVelocityUnitsPerWeek > 0 && item.salesVelocityUnitsPerWeek < item.previousSalesVelocityUnitsPerWeek).map((item) => ({ productName: item.productName, dropPercent: Math.round(((item.previousSalesVelocityUnitsPerWeek - item.salesVelocityUnitsPerWeek) / item.previousSalesVelocityUnitsPerWeek) * 100), currentStock: item.currentStock })).sort((a, b) => b.dropPercent - a.dropPercent).slice(0, 5);
  res.json({ hasData: data.sales.length > 0 || data.inventory.length > 0 || data.expenses.length > 0, metrics: { revenue: data.sales.length ? revenue : null, expenses: data.expenses.length ? expenses : null, profit: data.sales.length || data.expenses.length ? revenue - expenses : null, inventoryValue: data.inventory.length ? data.inventory.reduce((result, item) => result + (item.currentStock || 0) * (item.purchasePrice || 0), 0) : null }, counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length])), trend, slowProducts });
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

const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api\/).+/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.originalUrl}` });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled-error]', error);
  const statusCode = res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;
  res.status(statusCode).json({ error: 'The request could not be completed.' });
});
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, host, () => {
    console.log(`BharatBiz API listening on http://${host}:${port}`);
  });
}
