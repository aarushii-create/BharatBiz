import fs from 'node:fs';
import path from 'node:path';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed production data.');
  process.exit(1);
}

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const dataPath = process.env.BB_DATA_PATH || path.resolve(dataDir, 'bharatbiz-data.json');

const store = {
  users: [],
  businesses: [],
  data: {
    'biz_test_seed': {
      sales: [
        { id: 'sale-seed-1', date: '2026-09-01', productId: 'rice-a', productName: 'Rice', category: 'Grains', quantity: 120, unitPrice: 120, totalRevenue: 14400 },
        { id: 'sale-seed-2', date: '2026-08-01', productId: 'rice-a', productName: 'Rice', category: 'Grains', quantity: 100, unitPrice: 120, totalRevenue: 12000 },
      ],
      inventory: [
        { id: 'inv-seed-1', productId: 'rice-a', productName: 'Rice', currentStock: 30, purchasePrice: 100, standardOrderQuantity: 120, salesVelocityUnitsPerWeek: 8, previousSalesVelocityUnitsPerWeek: 12 },
      ],
      expenses: [
        { id: 'exp-seed-1', date: '2026-09-02', category: 'Purchase Cost', amount: 8000, period: 'current' },
        { id: 'exp-seed-2', date: '2026-08-02', category: 'Purchase Cost', amount: 7000, period: 'previous' },
      ],
      purchases: [],
      invoices: [],
    },
  },
  recommendations: [],
  purchaseOrders: [],
  auditLogs: [],
};

fs.mkdirSync(path.dirname(dataPath), { recursive: true });
fs.writeFileSync(dataPath, JSON.stringify(store, null, 2), 'utf8');
console.log(`Seed test data written to ${dataPath}`);
