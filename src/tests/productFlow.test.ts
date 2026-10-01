import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { validateCSV } from '../services/upload/csvParser';
import { TestResult } from './businessData.test';

export async function runProductFlowTests(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];
  const assert = (name: string, actual: any, expected: any) => {
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ suite: 'Product API Integration', name, actual, expected, passed, error: passed ? undefined : `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}` });
  };
  const dataPath = path.join(os.tmpdir(), `bharatbiz-test-${Date.now()}.json`);
  process.env.NODE_ENV = 'test';
  process.env.BB_DATA_PATH = dataPath;
  const { app } = await import('../../server/index');
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  let cookieA = '';
  let cookieB = '';
  async function request(pathname: string, options: RequestInit = {}, cookie = '') {
    const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } });
    const setCookie = response.headers.get('set-cookie');
    return { response, body: await response.json().catch(() => undefined), setCookie };
  }
  try {
    const first = await request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: 'Owner A', email: `a-${Date.now()}@test.local`, password: 'password123', businessName: 'Business A' }) });
    const second = await request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: 'Owner B', email: `b-${Date.now()}@test.local`, password: 'password123', businessName: 'Business B' }) });
    cookieA = first.setCookie?.split(';')[0] || '';
    cookieB = second.setCookie?.split(';')[0] || '';
    const empty = await request('/api/dashboard', {}, cookieA);
    assert('New account starts with an empty dashboard', empty.body?.hasData, false);

    const sales = await request('/api/import/sales', { method: 'POST', body: JSON.stringify({ rows: [{ id: 'sale-a', date: '2026-09-01', productId: 'rice-a', productName: 'Rice', category: 'Grains', quantity: 2, unitPrice: 100, totalRevenue: 200 }, { id: 'sale-a-prev', date: '2026-08-01', productId: 'rice-a', productName: 'Rice', category: 'Grains', quantity: 1, unitPrice: 100, totalRevenue: 100 }] }) }, cookieA);
    const expenses = await request('/api/import/expenses', { method: 'POST', body: JSON.stringify({ rows: [{ id: 'expense-a', date: '2026-09-02', category: 'Rent', amount: 50, period: 'current' }, { id: 'expense-a-prev', date: '2026-08-02', category: 'Rent', amount: 25, period: 'previous' }] }) }, cookieA);
    assert('Validated sales import accepts records', sales.body?.accepted, 2);
    assert('Validated expense import accepts records', expenses.body?.accepted, 2);

    const dashboard = await request('/api/dashboard', {}, cookieA);
    assert('Dashboard revenue comes from imported records', dashboard.body?.metrics.revenue, 300);
    const privateAudit = await request('/api/audit', {}, cookieB);
    assert('Business B cannot see Business A activity', privateAudit.body?.length, 0);

    const answer = await request('/api/ask', { method: 'POST', body: JSON.stringify({ query: 'Why did my profit change?', language: 'en' }) }, cookieA);
    assert('Analysis uses stored business data', answer.body?.facts?.profitDelta, 75);
    assert('No action is proposed without actionable inventory evidence', answer.body?.recommendationId, undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
  }
  const passed = results.filter((result) => result.passed).length;
  return { total: results.length, passed, failed: results.length - passed, results };
}

export function validatePurchaseCsvFixture() {
  return validateCSV('id,date,supplierName,productId,productName,quantity,unitPrice,totalCost\npurchase-1,2026-09-01,Supplier,rice-a,Rice,2,100,200', 'purchases');
}