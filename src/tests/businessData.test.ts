import { db } from '../db/repository';
import {
  get_sales,
  get_inventory,
  get_expenses,
  calculate_profit,
  calculate_profit_change,
  detect_slow_moving_products,
  detect_low_stock,
  analyze_expense_change,
  calculate_reorder_quantity,
} from '../services/businessAnalytics';
import {
  validateProduct,
  validateSale,
  validateExpense,
  validateInventory,
} from '../db/validation';
import { BUSINESS_ID } from '../db/seedData';

export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
  error?: string;
}

export function runAllUnitTests(): {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];

  // Reset database to ensure clean state
  db.resetToSeed();

  function assert(
    suite: string,
    name: string,
    actual: any,
    expected: any,
    comparator?: (a: any, b: any) => boolean
  ) {
    const passed = comparator
      ? comparator(actual, expected)
      : JSON.stringify(actual) === JSON.stringify(expected);

    results.push({
      suite,
      name,
      passed,
      expected,
      actual,
      error: passed ? undefined : `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    });
  }

  // --- SUITE 1: SALES & REVENUE DETERMINISM ---
  const currentSales = get_sales(BUSINESS_ID, { period: 'current' });
  assert(
    'Deterministic Sales',
    'Known Current Period Revenue matches ₹1,42,800',
    currentSales.totalRevenue,
    142800
  );

  const previousSales = get_sales(BUSINESS_ID, { period: 'previous' });
  assert(
    'Deterministic Sales',
    'Known Previous Period Revenue matches ₹1,42,500',
    previousSales.totalRevenue,
    142500
  );

  // --- SUITE 2: EXPENSES DETERMINISM ---
  const currentExpenses = get_expenses(BUSINESS_ID, { period: 'current' });
  assert(
    'Deterministic Expenses',
    'Known Current Period Total Expenses matches ₹94,100',
    currentExpenses.totalAmount,
    94100
  );

  const previousExpenses = get_expenses(BUSINESS_ID, { period: 'previous' });
  assert(
    'Deterministic Expenses',
    'Known Previous Period Total Expenses matches ₹85,380',
    previousExpenses.totalAmount,
    85380
  );

  // --- SUITE 3: DETERMINISTIC PROFIT CALCULATION ---
  const curProfit = calculate_profit(BUSINESS_ID, 'current');
  assert(
    'Profit Calculation',
    'Current Period Net Profit = 142,800 - 94,100 = ₹48,700',
    curProfit.netProfit,
    48700
  );

  const prevProfit = calculate_profit(BUSINESS_ID, 'previous');
  assert(
    'Profit Calculation',
    'Previous Period Net Profit = 142,500 - 85,380 = ₹57,120',
    prevProfit.netProfit,
    57120
  );

  // --- SUITE 4: PROFIT CHANGE (THE SIGNATURE ₹8,420 DELTA) ---
  const profitChange = calculate_profit_change(BUSINESS_ID);
  assert(
    'Profit Change Delta',
    'Calculated Profit Delta matches expected -₹8,420 exactly',
    profitChange.profitDelta,
    -8420
  );

  assert(
    'Profit Change Delta',
    'Revenue Delta is +₹300 (Stable)',
    profitChange.revenueDelta,
    300
  );

  assert(
    'Profit Change Delta',
    'Status is classified as "decreased"',
    profitChange.status,
    'decreased'
  );

  // --- SUITE 5: EXPENSE SPIKE BREAKDOWN ---
  const expenseAnalysis = analyze_expense_change(BUSINESS_ID);
  const purchaseCostContrib = expenseAnalysis.breakdown.find(
    (b) => b.category === 'Purchase Cost'
  );
  assert(
    'Expense Spike Breakdown',
    'Purchase Cost increased by +₹15,500',
    purchaseCostContrib?.delta,
    15500
  );

  const wastageContrib = expenseAnalysis.breakdown.find(
    (b) => b.category === 'Wastage'
  );
  assert(
    'Expense Spike Breakdown',
    'Wastage increased by +₹3,200',
    wastageContrib?.delta,
    3200
  );

  const deliveryContrib = expenseAnalysis.breakdown.find(
    (b) => b.category === 'Delivery Expense'
  );
  assert(
    'Expense Spike Breakdown',
    'Delivery Expense increased by +₹1,720',
    deliveryContrib?.delta,
    1720
  );

  // --- SUITE 6: SLOW-MOVING SKU DETECTION ---
  const slowItems = detect_slow_moving_products(BUSINESS_ID, 25);
  assert(
    'Slow Moving Products',
    'Identifies Ponni Boiled Rice (25kg) as primary slow moving product',
    slowItems[0]?.productId,
    'SKU-RICE-PONNI-25'
  );

  assert(
    'Slow Moving Products',
    'Detects exact 40% velocity drop (from 20 to 12 bags/week)',
    slowItems[0]?.velocityDropPercent,
    40
  );

  assert(
    'Slow Moving Products',
    'Flags product as overstocked (95 bags > 60 reorder level)',
    slowItems[0]?.isOverstocked,
    true
  );

  // --- SUITE 7: LOW STOCK DETECTION ---
  const lowItems = detect_low_stock(BUSINESS_ID);
  assert(
    'Low Stock Detection',
    'Identifies Premium Toor Dal (10kg) with stock 18 <= reorder level 20',
    lowItems[0]?.productId,
    'SKU-DAL-TOOR-10'
  );

  assert(
    'Low Stock Detection',
    'Calculates stock deficit of 2 units',
    lowItems[0]?.stockDeficit,
    2
  );

  // --- SUITE 8: EVIDENCE-BASED REORDER QUANTITY ---
  const reorder = calculate_reorder_quantity('SKU-RICE-PONNI-25', BUSINESS_ID);
  assert(
    'Reorder Quantity Calculation',
    'Recommends reduced batch of 80 bags instead of standard 100 bags',
    reorder?.recommendedOrderQuantity,
    80
  );

  assert(
    'Reorder Quantity Calculation',
    'Calculates direct working capital saved: 20 bags * ₹920 = ₹18,400',
    reorder?.estimatedCapitalSaved,
    18400
  );

  assert(
    'Reorder Quantity Calculation',
    'Calculates projected order cost: 80 bags * ₹920 = ₹73,600',
    reorder?.projectedOrderCost,
    73600
  );

  // --- SUITE 9: DATA VALIDATION & ERROR GUARDS ---
  const invalidNegativePriceProduct = validateProduct({
    id: 'test-p',
    businessId: BUSINESS_ID,
    sku: 'TEST',
    name: 'Invalid Item',
    category: 'Grains',
    purchasePrice: -100, // Invalid!
    sellingPrice: 200,
    supplierId: 'sup-01',
    reorderLevel: 10,
    standardOrderQuantity: 50,
  });
  assert(
    'Validation Layer',
    'Rejects product with negative purchase price',
    invalidNegativePriceProduct.valid,
    false
  );

  const invalidSaleMath = validateSale({
    id: 'sale-test',
    businessId: BUSINESS_ID,
    productId: 'prod-01',
    productName: 'Item',
    date: '2026-09-01',
    quantity: 10,
    unitPrice: 100,
    totalRevenue: 500, // Mismatch! 10 * 100 should be 1000
    period: 'current',
  });
  assert(
    'Validation Layer',
    'Detects and rejects arithmetic mismatch between quantity, unitPrice, and totalRevenue',
    invalidSaleMath.valid,
    false
  );

  const invalidCategoryExpense = validateExpense({
    id: 'exp-test',
    businessId: BUSINESS_ID,
    date: '2026-09-01',
    category: 'NonExistentCategory' as any,
    amount: 5000,
    period: 'current',
  });
  assert(
    'Validation Layer',
    'Rejects expense with unauthorized category',
    invalidCategoryExpense.valid,
    false
  );

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    results,
  };
}
