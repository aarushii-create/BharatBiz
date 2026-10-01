import { db } from '../db/repository';
import {
  Sale,
  Inventory,
  Expense,
  ExpenseCategory,
  StockStatus,
  ProfitCalculationResult,
  ProfitChangeResult,
  SlowMovingProductResult,
  LowStockResult,
  ExpenseChangeResult,
  ExpenseCategoryAnalysis,
  ReorderQuantityResult,
} from '../types/dataModels';
import { BUSINESS_ID } from '../db/seedData';

/**
 * PHASE 2 — DETERMINISTIC BUSINESS ANALYTICS FUNCTIONS
 * Strictly mathematical calculations on structured data.
 * Zero LLM dependency for numbers.
 */

export interface GetSalesOptions {
  period?: 'current' | 'previous';
  productId?: string;
}

export interface GetSalesResult {
  sales: Sale[];
  totalRevenue: number;
  totalUnitsSold: number;
  count: number;
}

export function get_sales(
  businessId = BUSINESS_ID,
  options?: GetSalesOptions
): GetSalesResult {
  let list = db.getSales(businessId, options?.period);
  if (options?.productId) {
    list = list.filter((s) => s.productId === options.productId);
  }

  const totalRevenue = list.reduce((sum, s) => sum + s.totalRevenue, 0);
  const totalUnitsSold = list.reduce((sum, s) => sum + s.quantity, 0);

  return {
    sales: list,
    totalRevenue,
    totalUnitsSold,
    count: list.length,
  };
}

export interface GetInventoryOptions {
  category?: string;
  status?: StockStatus;
}

export interface GetInventoryResult {
  inventory: Inventory[];
  totalUnitsInStock: number;
  totalValuationAtCost: number;
  totalValuationAtRetail: number;
  count: number;
}

export function get_inventory(
  businessId = BUSINESS_ID,
  options?: GetInventoryOptions
): GetInventoryResult {
  let list = db.getInventory(businessId);
  if (options?.category) {
    list = list.filter((i) => i.category === options.category);
  }
  if (options?.status) {
    list = list.filter((i) => i.stockStatus === options.status);
  }

  const totalUnitsInStock = list.reduce((sum, i) => sum + i.currentStock, 0);
  const totalValuationAtCost = list.reduce((sum, i) => sum + i.currentStock * i.purchasePrice, 0);
  const totalValuationAtRetail = list.reduce((sum, i) => sum + i.currentStock * i.sellingPrice, 0);

  return {
    inventory: list,
    totalUnitsInStock,
    totalValuationAtCost,
    totalValuationAtRetail,
    count: list.length,
  };
}

export interface GetExpensesOptions {
  period?: 'current' | 'previous';
  category?: ExpenseCategory;
}

export interface GetExpensesResult {
  expenses: Expense[];
  totalAmount: number;
  count: number;
}

export function get_expenses(
  businessId = BUSINESS_ID,
  options?: GetExpensesOptions
): GetExpensesResult {
  let list = db.getExpenses(businessId, options?.period);
  if (options?.category) {
    list = list.filter((e) => e.category === options.category);
  }

  const totalAmount = list.reduce((sum, e) => sum + e.amount, 0);

  return {
    expenses: list,
    totalAmount,
    count: list.length,
  };
}

/**
 * Calculates deterministic profit for a specific period:
 * Net Profit = Revenue - Total Expenses
 */
export function calculate_profit(
  businessId = BUSINESS_ID,
  period: 'current' | 'previous' = 'current'
): ProfitCalculationResult {
  const salesResult = get_sales(businessId, { period });
  const expensesResult = get_expenses(businessId, { period });

  const revenue = salesResult.totalRevenue;
  const expenses = expensesResult.totalAmount;
  const netProfit = revenue - expenses;
  const profitMarginPercent = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

  return {
    businessId,
    period,
    revenue,
    expenses,
    netProfit,
    profitMarginPercent,
    salesCount: salesResult.count,
    expenseCount: expensesResult.count,
  };
}

/**
 * Compares current vs previous period profit:
 * Profit Delta = Current Profit - Previous Profit
 * Verified target: Exactly -₹8,420 for Sri Murugan Provisions
 */
export function calculate_profit_change(
  businessId = BUSINESS_ID,
  currentPeriod: 'current' = 'current',
  previousPeriod: 'previous' = 'previous'
): ProfitChangeResult {
  const current = calculate_profit(businessId, currentPeriod);
  const previous = calculate_profit(businessId, previousPeriod);

  const profitDelta = current.netProfit - previous.netProfit;
  const revenueDelta = current.revenue - previous.revenue;
  const expenseDelta = current.expenses - previous.expenses;

  const percentageChange =
    previous.netProfit !== 0
      ? Math.round(((current.netProfit - previous.netProfit) / Math.abs(previous.netProfit)) * 1000) / 10
      : 0;

  let status: 'increased' | 'decreased' | 'unchanged' = 'unchanged';
  if (profitDelta < 0) status = 'decreased';
  else if (profitDelta > 0) status = 'increased';

  return {
    businessId,
    currentRevenue: current.revenue,
    previousRevenue: previous.revenue,
    revenueDelta,
    currentExpenses: current.expenses,
    previousExpenses: previous.expenses,
    expenseDelta,
    currentProfit: current.netProfit,
    previousProfit: previous.netProfit,
    profitDelta,
    percentageChange,
    status,
  };
}

/**
 * Detects slow-moving products where sales velocity dropped by at least thresholdPercent
 */
export function detect_slow_moving_products(
  businessId = BUSINESS_ID,
  thresholdPercent = 25
): SlowMovingProductResult[] {
  const inventoryList = db.getInventory(businessId);
  const results: SlowMovingProductResult[] = [];

  for (const item of inventoryList) {
    if (item.previousSalesVelocityUnitsPerWeek > 0) {
      const dropUnits = item.previousSalesVelocityUnitsPerWeek - item.salesVelocityUnitsPerWeek;
      const dropPercent = Math.round((dropUnits / item.previousSalesVelocityUnitsPerWeek) * 100);

      if (dropPercent >= thresholdPercent) {
        const weeksSupply =
          item.salesVelocityUnitsPerWeek > 0
            ? Math.round((item.currentStock / item.salesVelocityUnitsPerWeek) * 10) / 10
            : 999;

        results.push({
          productId: item.productId,
          productName: item.productName,
          category: item.category,
          currentStock: item.currentStock,
          reorderLevel: item.reorderLevel,
          currentVelocity: item.salesVelocityUnitsPerWeek,
          previousVelocity: item.previousSalesVelocityUnitsPerWeek,
          velocityDropUnits: dropUnits,
          velocityDropPercent: dropPercent,
          weeksOfSupplyOnHand: weeksSupply,
          isOverstocked: item.currentStock > item.reorderLevel,
        });
      }
    }
  }

  // Sort by highest velocity drop percent
  return results.sort((a, b) => b.velocityDropPercent - a.velocityDropPercent);
}

/**
 * Detects low-stock products where currentStock <= reorderLevel
 */
export function detect_low_stock(businessId = BUSINESS_ID): LowStockResult[] {
  const inventoryList = db.getInventory(businessId);
  const lowItems: LowStockResult[] = [];

  for (const item of inventoryList) {
    if (item.currentStock <= item.reorderLevel) {
      const stockDeficit = item.reorderLevel - item.currentStock;
      const daysOfSupply =
        item.salesVelocityUnitsPerWeek > 0
          ? Math.round((item.currentStock / (item.salesVelocityUnitsPerWeek / 7)) * 10) / 10
          : 0;

      lowItems.push({
        productId: item.productId,
        productName: item.productName,
        category: item.category,
        currentStock: item.currentStock,
        reorderLevel: item.reorderLevel,
        stockDeficit,
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        daysOfSupplyRemaining: daysOfSupply,
        urgency: item.currentStock <= item.reorderLevel * 0.5 ? 'critical' : 'moderate',
      });
    }
  }

  return lowItems.sort((a, b) => a.daysOfSupplyRemaining - b.daysOfSupplyRemaining);
}

/**
 * Analyzes expense changes across categories between current and previous periods
 */
export function analyze_expense_change(
  businessId = BUSINESS_ID,
  currentPeriod: 'current' = 'current',
  previousPeriod: 'previous' = 'previous'
): ExpenseChangeResult {
  const currentExpenses = db.getExpenses(businessId, currentPeriod);
  const previousExpenses = db.getExpenses(businessId, previousPeriod);

  const totalCurrent = currentExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalPrevious = previousExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netDelta = totalCurrent - totalPrevious;

  // Aggregate by category
  const categories: ExpenseCategory[] = [
    'Purchase Cost',
    'Wastage',
    'Delivery Expense',
    'Rent',
    'Electricity',
    'Packaging',
    'Other',
  ];

  const breakdown: ExpenseCategoryAnalysis[] = [];

  for (const cat of categories) {
    const curCatSum = currentExpenses
      .filter((e) => e.category === cat)
      .reduce((sum, e) => sum + e.amount, 0);
    const prevCatSum = previousExpenses
      .filter((e) => e.category === cat)
      .reduce((sum, e) => sum + e.amount, 0);

    const delta = curCatSum - prevCatSum;
    const percentageChange =
      prevCatSum > 0 ? Math.round((delta / prevCatSum) * 1000) / 10 : curCatSum > 0 ? 100 : 0;
    const contribution =
      netDelta > 0 && delta > 0 ? Math.round((delta / netDelta) * 1000) / 10 : 0;

    if (curCatSum > 0 || prevCatSum > 0) {
      breakdown.push({
        category: cat,
        currentAmount: curCatSum,
        previousAmount: prevCatSum,
        delta,
        percentageChange,
        contributionToExpenseSurgePercent: contribution,
      });
    }
  }

  // Sort contributors by highest positive increase
  const topContributors = [...breakdown]
    .filter((b) => b.delta > 0)
    .sort((a, b) => b.delta - a.delta);

  return {
    businessId,
    totalCurrentExpenses: totalCurrent,
    totalPreviousExpenses: totalPrevious,
    netExpenseDelta: netDelta,
    breakdown,
    topContributors,
  };
}

/**
 * Calculates evidence-grounded reorder quantity for a given product
 */
export function calculate_reorder_quantity(
  productId: string,
  businessId = BUSINESS_ID
): ReorderQuantityResult | null {
  const item = db.getInventoryByProductId(productId, businessId);
  const product = db.getProductBySku(productId, businessId) || db.getProductById(productId, businessId);
  if (!item) return null;

  const standardOrderQuantity = product?.standardOrderQuantity || 100;
  let recommendedOrderQuantity = standardOrderQuantity;
  let adjustmentReason = 'Standard routine replenishment';

  // Check if velocity dropped
  if (item.previousSalesVelocityUnitsPerWeek > 0) {
    const drop =
      (item.previousSalesVelocityUnitsPerWeek - item.salesVelocityUnitsPerWeek) /
      item.previousSalesVelocityUnitsPerWeek;

    if (drop >= 0.25) {
      // Overstocked or velocity drop: Reduce order
      // Reduction factor = standard * (1 - drop * 0.5)
      // e.g. 100 * (1 - 0.40 * 0.5) = 80 units
      const reductionPercent = drop * 0.5;
      recommendedOrderQuantity = Math.round(standardOrderQuantity * (1 - reductionPercent));
      adjustmentReason = `Sales velocity dropped ${Math.round(drop * 100)}% with ${item.currentStock} units currently on hand. Reduced by ${standardOrderQuantity - recommendedOrderQuantity} units to avoid inventory lockup and spoilage.`;
    }
  }

  const estimatedCapitalSaved = (standardOrderQuantity - recommendedOrderQuantity) * item.purchasePrice;
  const projectedOrderCost = recommendedOrderQuantity * item.purchasePrice;

  return {
    productId: item.productId,
    productName: item.productName,
    supplierId: item.supplierId,
    supplierName: item.supplierName,
    unitPrice: item.purchasePrice,
    currentStock: item.currentStock,
    reorderLevel: item.reorderLevel,
    standardOrderQuantity,
    recommendedOrderQuantity,
    adjustmentReason,
    estimatedCapitalSaved,
    projectedOrderCost,
  };
}
