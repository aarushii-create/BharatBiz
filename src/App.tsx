import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, Session } from './services/api';
import { validateCSV } from './services/upload/csvParser';

type Tab = 'dashboard' | 'ask' | 'data' | 'purchases' | 'activity';
type Dataset = 'sales' | 'inventory' | 'expenses' | 'purchases';

interface Dashboard {
  hasData: boolean;
  metrics: { revenue: number | null; expenses: number | null; profit: number | null; inventoryValue: number | null };
  counts: Record<string, number>;
  trend: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  slowProducts: Array<{ productName: string; dropPercent: number; currentStock: number }>;
}

interface Answer {
  explanation: string;
  recommendation: string;
  facts: Record<string, number | string | undefined>;
  evidence: Array<{ type: string; label: string; value: number; source: string; formula?: string }>;
  agentTrace?: Array<{ agent: string; status: string; detail: string }>;
  recommendationId?: string;
  action?: { productName: string; quantity: number; requiresApproval: boolean };
  evidenceQuality?: 'VERIFIED' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  decisionRoom?: {
    summary: string;
    evidence: string[];
    recommendation: string;
    approvalRequired: boolean;
  };
}

const money = (value: number | null | undefined) => value === null || value === undefined ? 'Not enough data' : `₹${value.toLocaleString('en-IN')}`;

function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', businessName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { onAuthenticated(await apiRequest<Session>(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) })); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to continue.'); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-stone-100 px-4 py-10 text-stone-900"><div className="mx-auto max-w-md border border-stone-300 bg-white p-8 shadow-sm"><div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">BharatBiz AI</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Run your business with clarity.</h1><p className="mt-3 text-sm leading-6 text-stone-600">Connect your own business data, ask questions, and review every recommended action before it happens.</p></div><form onSubmit={submit} className="space-y-4">{mode === 'signup' && <><label className="block text-sm font-medium">Your name<input required className="mt-1 w-full border border-stone-300 p-3" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="block text-sm font-medium">Business name<input required className="mt-1 w-full border border-stone-300 p-3" value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label></>}<label className="block text-sm font-medium">Email<input required type="email" className="mt-1 w-full border border-stone-300 p-3" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="block text-sm font-medium">Password<input required minLength={8} type="password" className="mt-1 w-full border border-stone-300 p-3" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>{error && <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}<button disabled={busy} className="w-full bg-stone-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button></form><button className="mt-5 text-sm text-amber-800 underline" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'Create a new business account' : 'I already have an account'}</button></div></main>;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [data, setData] = useState<Record<string, any[]>>({ sales: [], inventory: [], expenses: [], purchases: [] });
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState('en');
  const [notice, setNotice] = useState('');
  const [uploadDataset, setUploadDataset] = useState<Dataset>('sales');
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);

  async function refresh() {
    if (!session) return;
    const [nextDashboard, nextData, nextOrders, nextActivity] = await Promise.all([apiRequest<Dashboard>('/api/dashboard'), apiRequest<Record<string, any[]>>('/api/data'), apiRequest<any[]>('/api/purchase-orders'), apiRequest<any[]>('/api/audit')]);
    setDashboard(nextDashboard); setData(nextData); setOrders(nextOrders); setActivity(nextActivity);
  }

  useEffect(() => { apiRequest<Session>('/api/auth/me').then(setSession).catch(() => undefined).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (session) refresh().catch((error) => setNotice(error.message)); }, [session]);

  async function ask(event: FormEvent) {
    event.preventDefault(); if (!question.trim()) return; setNotice('');
    try { setAnswer(await apiRequest<Answer>('/api/ask', { method: 'POST', body: JSON.stringify({ query: question, language }) })); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to analyze this question.'); }
  }

  async function approve(recommendationId: string) {
    try { await apiRequest(`/api/recommendations/${recommendationId}/approve`, { method: 'POST', body: '{}' }); setNotice('Purchase order approved and recorded.'); setAnswer(null); await refresh(); setTab('purchases'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Approval failed.'); }
  }

  async function reject(recommendationId: string) {
    try { await apiRequest(`/api/recommendations/${recommendationId}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Rejected by business owner.' }) }); setNotice('Recommendation rejected.'); setAnswer(null); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Rejection failed.'); }
  }

  async function importFile(file: File) {
    setUploadErrors([]); setPreviewRows([]); const result = validateCSV(await file.text(), uploadDataset, file.name);
    if (!result.success) { setUploadErrors(result.errors.map((error) => error.message)); return; }
    setPreviewRows(result.validRows);
  }

  async function confirmImport() {
    try { const result = await apiRequest<{ accepted: number; rejected: number }>('/api/import/' + uploadDataset, { method: 'POST', body: JSON.stringify({ rows: previewRows }) }); setNotice(`${result.accepted} records imported${result.rejected ? `, ${result.rejected} rejected` : ''}.`); setPreviewRows([]); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Import failed.'); }
  }

  function downloadReport() {
    if (!answer) return;
    const report = [`BharatBiz AI business report`, `Business: ${session?.business.name}`, `Question: ${question}`, `Evidence quality: ${answer.evidenceQuality ?? 'VERIFIED'}`, '', `Explanation`, answer.explanation, '', `Recommendation`, answer.recommendation, '', `Decision room`, answer.decisionRoom?.summary ?? '', ...(answer.decisionRoom?.evidence ?? []), '', `Evidence`, ...answer.evidence.map((item) => `${item.label}: ${money(item.value)} (${item.source}${item.formula ? `; ${item.formula}` : ''})`)].join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([report], { type: 'text/plain' })); link.download = 'bharatbiz-business-report.txt'; link.click(); URL.revokeObjectURL(link.href);
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-stone-100 text-stone-600">Loading your workspace…</div>;
  if (!session) return <AuthScreen onAuthenticated={setSession} />;

  const metricCards = [['Revenue', dashboard?.metrics.revenue], ['Expenses', dashboard?.metrics.expenses], ['Profit', dashboard?.metrics.profit], ['Inventory value', dashboard?.metrics.inventoryValue]] as const;
  return <div className="min-h-screen bg-stone-100 text-stone-900"><header className="border-b border-stone-300 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">BharatBiz AI</p><p className="text-sm text-stone-600">{session.business.name}</p></div><div className="flex items-center gap-3"><span className="hidden text-sm text-stone-600 sm:block">{session.user.name}</span><button className="border border-stone-300 px-3 py-2 text-sm" onClick={async () => { await apiRequest('/api/auth/logout', { method: 'POST' }); setSession(null); }}>Log out</button></div></div></header><nav className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">{([['dashboard', 'Dashboard'], ['ask', 'Ask AI'], ['data', 'Business data'], ['purchases', 'Purchases'], ['activity', 'Activity']] as [Tab, string][]).map(([value, label]) => <button key={value} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${tab === value ? 'border-amber-600 text-stone-900' : 'border-transparent text-stone-500'}`} onClick={() => setTab(value)}>{label}</button>)}</div></nav><main className="mx-auto max-w-7xl p-4 sm:p-6">{notice && <div className="mb-5 flex items-center justify-between border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span>{notice}</span><button onClick={() => setNotice('')}>Dismiss</button></div>}
      {tab === 'dashboard' && <section><div className="mb-8"><p className="text-sm font-medium text-amber-700">Business overview</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Good to see you, {session.user.name}.</h1><p className="mt-2 text-stone-600">Your dashboard reflects data stored for {session.business.name}.</p></div>{!dashboard?.hasData ? <EmptyState title="Connect your business data to get started" text="Upload sales, inventory, or expense records. Your dashboard will update from the records you confirm." action={() => setTab('data')} label="Add business data" /> : <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metricCards.map(([label, value]) => <div className="border border-stone-300 bg-white p-5" key={label}><p className="text-sm text-stone-500">{label}</p><p className="mt-3 text-2xl font-semibold">{money(value)}</p></div>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]"><div className="border border-stone-300 bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Performance trend</h2><span className="text-xs text-stone-500">Stored monthly records</span></div>{dashboard.trend.length === 0 ? <p className="mt-6 text-sm text-stone-500">Not enough dated records for a trend yet.</p> : <div className="mt-6 space-y-4">{dashboard.trend.map((point) => { const peak = Math.max(...dashboard.trend.map((item) => Math.max(item.revenue, item.expenses)), 1); return <div key={point.month}><div className="mb-1 flex justify-between text-xs text-stone-500"><span>{point.month}</span><span>Profit {money(point.profit)}</span></div><div className="flex h-3 gap-1"><div className="bg-amber-500" style={{ width: `${Math.max(2, point.revenue / peak * 100)}%` }} title={`Revenue ${money(point.revenue)}`} /><div className="bg-stone-700" style={{ width: `${Math.max(2, point.expenses / peak * 100)}%` }} title={`Expenses ${money(point.expenses)}`} /></div></div> })}</div>}<div className="mt-5 flex gap-4 text-xs text-stone-500"><span><i className="mr-1 inline-block h-2 w-2 bg-amber-500" />Revenue</span><span><i className="mr-1 inline-block h-2 w-2 bg-stone-700" />Expenses</span></div></div><div className="border border-stone-300 bg-white p-5"><h2 className="font-semibold">Inventory watch</h2>{dashboard.slowProducts.length === 0 ? <p className="mt-6 text-sm text-stone-500">No slow-moving products identified from current records.</p> : <div className="mt-4 space-y-4">{dashboard.slowProducts.map((item) => <div key={item.productName} className="border-l-2 border-amber-500 pl-3"><p className="text-sm font-medium">{item.productName}</p><p className="mt-1 text-xs text-stone-500">Velocity down {item.dropPercent}% · {item.currentStock} units on hand</p></div>)}</div>}</div></div><div className="mt-6 border border-stone-300 bg-white p-5"><h2 className="font-semibold">Your records</h2><div className="mt-4 flex flex-wrap gap-5 text-sm text-stone-600">{Object.entries(dashboard.counts).map(([key, value]) => <span key={key}><strong className="text-stone-900">{value}</strong> {key}</span>)}</div></div></>}</section>}
      {tab === 'ask' && <section className="max-w-4xl"><p className="text-sm font-medium text-amber-700">Business assistant</p><h1 className="mt-1 text-3xl font-semibold">Ask about your business</h1><p className="mt-2 text-stone-600">Answers use only the records stored in your business workspace.</p><form onSubmit={ask} className="mt-6 flex flex-col gap-3 sm:flex-row"><input className="min-h-12 flex-1 border border-stone-300 bg-white px-4" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about profit, expenses, inventory, or reorder needs" /><select className="border border-stone-300 bg-white px-3" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="ta">Tamil</option><option value="hi">Hindi</option><option value="te">Telugu</option></select><button className="bg-stone-900 px-5 py-3 font-semibold text-white">Ask</button></form>{answer && <div className="mt-8 space-y-5"><div className="border border-stone-300 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">AI explanation</p><button className="border border-stone-300 px-3 py-2 text-xs" onClick={downloadReport}>Download report</button></div><p className="mt-3 whitespace-pre-line leading-7">{answer.explanation}</p><p className="mt-4 border-l-2 border-amber-500 pl-4 font-medium">{answer.recommendation}</p></div>{answer.agentTrace && <div className="border border-stone-300 bg-white p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Analysis trail</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{answer.agentTrace.map((step) => <div className="border border-stone-200 p-3" key={step.agent}><div className="flex justify-between gap-3"><span className="text-sm font-semibold">{step.agent}</span><span className={`text-xs uppercase ${step.status === 'blocked' ? 'text-red-700' : 'text-emerald-700'}`}>{step.status}</span></div><p className="mt-1 text-xs leading-5 text-stone-500">{step.detail}</p></div>)}</div></div>}<div className="border border-stone-300 bg-white p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">Facts and calculations</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{answer.evidence.map((item, index) => <div className="border border-stone-200 p-3" key={`${item.label}-${index}`}><p className="text-sm font-medium">{item.label}</p><p className="mt-1 text-lg font-semibold">{money(item.value)}</p><p className="mt-1 text-xs text-stone-500">Source: {item.source}{item.formula ? ` · ${item.formula}` : ''}</p></div>)}</div></div>{answer.action && answer.recommendationId && <div className="border border-amber-300 bg-amber-50 p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Recommended action · approval required</p><h2 className="mt-2 text-xl font-semibold">Review purchase order for {answer.action.productName}</h2><p className="mt-2 text-stone-700">Proposed quantity: <strong>{answer.action.quantity}</strong>. Nothing has been ordered.</p><div className="mt-5 flex gap-3"><button className="bg-stone-900 px-4 py-3 font-semibold text-white" onClick={() => approve(answer.recommendationId!)}>Approve & generate PO</button><button className="border border-stone-400 px-4 py-3" onClick={() => reject(answer.recommendationId!)}>Reject</button></div></div>}</div>}</section>}
      {tab === 'data' && <section className="max-w-4xl"><p className="text-sm font-medium text-amber-700">Business data</p><h1 className="mt-1 text-3xl font-semibold">Add your records</h1><p className="mt-2 text-stone-600">Files are validated and previewed before they are saved to your business.</p><div className="mt-6 border border-stone-300 bg-white p-6"><div className="flex flex-wrap gap-3"><select className="border border-stone-300 px-3 py-2" value={uploadDataset} onChange={(event) => { setUploadDataset(event.target.value as Dataset); setUploadErrors([]); setPreviewRows([]); }}><option value="sales">Sales CSV</option><option value="inventory">Inventory CSV</option><option value="expenses">Expenses CSV</option><option value="purchases">Purchases CSV</option></select><label className="cursor-pointer bg-stone-900 px-4 py-2 font-semibold text-white">Choose CSV<input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} /></label></div>{uploadErrors.length > 0 && <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">The file needs attention</p>{uploadErrors.map((error) => <p key={error} className="mt-1">{error}</p>)}</div>}{previewRows.length > 0 && <div className="mt-5"><p className="font-semibold">Preview · {previewRows.length} valid rows</p><div className="mt-3 max-h-56 overflow-auto border border-stone-200 p-3 text-xs"><pre>{JSON.stringify(previewRows.slice(0, 3), null, 2)}</pre></div><button className="mt-4 bg-amber-600 px-4 py-3 font-semibold text-white" onClick={confirmImport}>Confirm import</button></div>}</div><div className="mt-6 grid gap-4 sm:grid-cols-4">{(['sales', 'inventory', 'expenses', 'purchases'] as Dataset[]).map((kind) => <div className="border border-stone-300 bg-white p-5" key={kind}><p className="text-sm capitalize text-stone-500">{kind}</p><p className="mt-2 text-2xl font-semibold">{data[kind]?.length || 0}</p><p className="text-sm text-stone-500">stored records</p></div>)}</div></section>}
      {tab === 'purchases' && <section><p className="text-sm font-medium text-amber-700">Purchases</p><h1 className="mt-1 text-3xl font-semibold">Purchase orders</h1>{orders.length === 0 ? <EmptyState title="No purchase orders yet" text="Evidence-backed purchase orders appear here after you approve a recommendation." /> : <div className="mt-6 space-y-3">{orders.map((order) => <div className="border border-stone-300 bg-white p-5" key={order.id}><div className="flex justify-between"><strong>{order.productName}</strong><span className="text-sm uppercase text-emerald-700">{order.status}</span></div><p className="mt-2 text-sm text-stone-600">Quantity: {order.quantity} · Created {new Date(order.createdAt).toLocaleString()}</p></div>)}</div>}</section>}
      {tab === 'activity' && <section><p className="text-sm font-medium text-amber-700">Activity</p><h1 className="mt-1 text-3xl font-semibold">Business history</h1>{activity.length === 0 ? <EmptyState title="No activity yet" text="Questions, approvals, and other business actions will appear here." /> : <div className="mt-6 space-y-3">{activity.map((entry) => <div className="border border-stone-300 bg-white p-5" key={entry.id}><div className="flex flex-wrap justify-between gap-2"><strong>{entry.approval || entry.intent}</strong><span className="text-sm text-stone-500">{new Date(entry.createdAt).toLocaleString()}</span></div><p className="mt-2 text-sm text-stone-700">{entry.query || entry.recommendation || 'Business action recorded.'}</p></div>)}</div>}</section>}
    </main></div>;
}

function EmptyState({ title, text, action, label }: { title: string; text: string; action?: () => void; label?: string }) { return <div className="mt-6 border border-dashed border-stone-400 bg-white p-10 text-center"><h2 className="text-xl font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-600">{text}</p>{action && <button className="mt-5 bg-stone-900 px-4 py-3 font-semibold text-white" onClick={action}>{label}</button>}</div>; }

export default App;