/**
 * Phase 2 — Structured Domain Data Models
 * Every record is scoped with business_id for multi-business readiness.
 */

export interface Product {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  category: string;
  unit: string; // e.g. "25kg bag", "5L can", "10kg bag", "500g pack"
  purchasePrice: number;
  sellingPrice: number;
  supplierId: string;
  reorderLevel: number;
  standardOrderQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  id: string;
  businessId: string;
  date: string; // YYYY-MM-DD
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalRevenue: number;
  period: 'current' | 'previous';
}

export type StockStatus = 'optimal' | 'low' | 'overstocked' | 'critical';

export interface Inventory {
  id: string;
  businessId: string;
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  reorderLevel: number;
  purchasePrice: number;
  sellingPrice: number;
  supplierId: string;
  supplierName: string;
  salesVelocityUnitsPerWeek: number;
  previousSalesVelocityUnitsPerWeek: number;
  stockStatus: StockStatus;
  lastRestockedDate: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | 'Purchase Cost'
  | 'Wastage'
  | 'Delivery Expense'
  | 'Rent'
  | 'Electricity'
  | 'Packaging'
  | 'Other';

export interface Expense {
  id: string;
  businessId: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  period: 'current' | 'previous';
  notes?: string;
}

export interface Supplier {
  id: string;
  businessId: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  leadTimeDays: number;
  productsSupplied: string[];
}

export type PurchaseOrderStatus = 'pending_approval' | 'approved' | 'rejected' | 'fulfilled';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  productId: string;
  productName: string;
  standardOrderQuantity: number;
  approvedOrderQuantity: number;
  unitPrice: number;
  totalCost: number;
  estimatedCapitalSaved: number;
  status: PurchaseOrderStatus;
  createdAt: string;
  approvedAt?: string;
  notes: string;
  evidenceTraceId: string;
}

// Structured Output Interfaces for Deterministic Business Functions

export interface ProfitCalculationResult {
  businessId: string;
  period: 'current' | 'previous';
  revenue: number;
  expenses: number;
  netProfit: number;
  profitMarginPercent: number;
  salesCount: number;
  expenseCount: number;
}

export interface ProfitChangeResult {
  businessId: string;
  currentRevenue: number;
  previousRevenue: number;
  revenueDelta: number;
  currentExpenses: number;
  previousExpenses: number;
  expenseDelta: number;
  currentProfit: number;
  previousProfit: number;
  profitDelta: number; // e.g. -8420
  percentageChange: number;
  status: 'increased' | 'decreased' | 'unchanged';
}

export interface SlowMovingProductResult {
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  reorderLevel: number;
  currentVelocity: number;
  previousVelocity: number;
  velocityDropUnits: number;
  velocityDropPercent: number; // e.g. 40%
  weeksOfSupplyOnHand: number;
  isOverstocked: boolean;
}

export interface LowStockResult {
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  reorderLevel: number;
  stockDeficit: number;
  supplierId: string;
  supplierName: string;
  daysOfSupplyRemaining: number;
  urgency: 'critical' | 'moderate';
}

export interface ExpenseCategoryAnalysis {
  category: ExpenseCategory;
  currentAmount: number;
  previousAmount: number;
  delta: number;
  percentageChange: number;
  contributionToExpenseSurgePercent: number;
}

export interface ExpenseChangeResult {
  businessId: string;
  totalCurrentExpenses: number;
  totalPreviousExpenses: number;
  netExpenseDelta: number;
  breakdown: ExpenseCategoryAnalysis[];
  topContributors: ExpenseCategoryAnalysis[];
}

export interface ReorderQuantityResult {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  currentStock: number;
  reorderLevel: number;
  standardOrderQuantity: number;
  recommendedOrderQuantity: number;
  adjustmentReason: string;
  estimatedCapitalSaved: number;
  projectedOrderCost: number;
}
