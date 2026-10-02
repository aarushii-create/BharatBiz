import fs from 'node:fs';
import path from 'node:path';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to populate production data.');
  process.exit(1);
}

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const dataPath = process.env.BB_DATA_PATH || path.resolve(dataDir, 'bharatbiz-data.json');

const demoStore = {
  users: [],
  businesses: [],
  data: {
    'biz_demo': {
      sales: [
        { id: 'demo-sale-1', date: '2026-09-01', productId: 'demo-rice', productName: 'Rice', category: 'Grains', quantity: 70, unitPrice: 150, totalRevenue: 10500 },
      ],
      inventory: [
        { id: 'demo-inv-1', productId: 'demo-rice', productName: 'Rice', currentStock: 45, purchasePrice: 120, standardOrderQuantity: 80, salesVelocityUnitsPerWeek: 11, previousSalesVelocityUnitsPerWeek: 15 },
      ],
      expenses: [
        { id: 'demo-exp-1', date: '2026-09-02', category: 'Purchase Cost', amount: 6500, period: 'current' },
        { id: 'demo-exp-2', date: '2026-08-02', category: 'Purchase Cost', amount: 4800, period: 'previous' },
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
fs.writeFileSync(dataPath, JSON.stringify(demoStore, null, 2), 'utf8');
console.log(`Demo data written to ${dataPath}`);
