import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const dataPath = process.env.BB_DATA_PATH || path.resolve(dataDir, 'bharatbiz-data.json');

function ensureStore() {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify({
      users: [],
      businesses: [],
      data: {},
      recommendations: [],
      purchaseOrders: [],
      auditLogs: [],
    }, null, 2), 'utf8');
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Record<string, unknown>;
  const next = {
    users: Array.isArray(raw.users) ? raw.users : [],
    businesses: Array.isArray(raw.businesses) ? raw.businesses : [],
    data: raw.data && typeof raw.data === 'object' ? raw.data as Record<string, any> : {},
    recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : [],
    purchaseOrders: Array.isArray(raw.purchaseOrders) ? raw.purchaseOrders : [],
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
  };

  fs.writeFileSync(dataPath, JSON.stringify(next, null, 2), 'utf8');
  console.log(`Migration complete: ${dataPath}`);
}

ensureStore();
