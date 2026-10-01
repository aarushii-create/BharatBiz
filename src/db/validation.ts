import {
  Product,
  Sale,
  Inventory,
  Expense,
  Supplier,
  PurchaseOrder,
  ExpenseCategory,
  StockStatus,
} from '../types/dataModels';

export interface ValidationResult<T> {
  valid: boolean;
  errors: string[];
  data?: T;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Purchase Cost',
  'Wastage',
  'Delivery Expense',
  'Rent',
  'Electricity',
  'Packaging',
  'Other',
];

const STOCK_STATUSES: StockStatus[] = ['optimal', 'low', 'overstocked', 'critical'];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateProduct(input: any): ValidationResult<Product> {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a valid object'] };
  }

  if (!input.id || typeof input.id !== 'string') errors.push('Missing or invalid "id"');
  if (!input.businessId || typeof input.businessId !== 'string') errors.push('Missing or invalid "businessId"');
  if (!input.sku || typeof input.sku !== 'string') errors.push('Missing or invalid "sku"');
  if (!input.name || typeof input.name !== 'string') errors.push('Missing or invalid "name"');
  if (!input.category || typeof input.category !== 'string') errors.push('Missing or invalid "category"');
  if (typeof input.purchasePrice !== 'number' || input.purchasePrice < 0) {
    errors.push('Invalid "purchasePrice": must be a non-negative number');
  }
  if (typeof input.sellingPrice !== 'number' || input.sellingPrice < 0) {
    errors.push('Invalid "sellingPrice": must be a non-negative number');
  }
  if (typeof input.reorderLevel !== 'number' || input.reorderLevel < 0) {
    errors.push('Invalid "reorderLevel": must be a non-negative number');
  }
  if (typeof input.standardOrderQuantity !== 'number' || input.standardOrderQuantity <= 0) {
    errors.push('Invalid "standardOrderQuantity": must be a positive number');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: input as Product };
}

export function validateSale(input: any): ValidationResult<Sale> {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a valid object'] };
  }

  if (!input.id || typeof input.id !== 'string') errors.push('Missing or invalid "id"');
  if (!input.businessId || typeof input.businessId !== 'string') errors.push('Missing or invalid "businessId"');
  if (!input.productId || typeof input.productId !== 'string') errors.push('Missing or invalid "productId"');
  if (!input.productName || typeof input.productName !== 'string') errors.push('Missing or invalid "productName"');
  if (!input.date || !DATE_REGEX.test(input.date)) errors.push('Invalid "date": must be YYYY-MM-DD format');
  if (typeof input.quantity !== 'number' || input.quantity <= 0) {
    errors.push('Invalid "quantity": must be a positive number');
  }
  if (typeof input.unitPrice !== 'number' || input.unitPrice < 0) {
    errors.push('Invalid "unitPrice": must be a non-negative number');
  }
  if (typeof input.totalRevenue !== 'number' || input.totalRevenue < 0) {
    errors.push('Invalid "totalRevenue": must be a non-negative number');
  }
  if (input.period !== 'current' && input.period !== 'previous') {
    errors.push('Invalid "period": must be either "current" or "previous"');
  }

  // Cross-field arithmetic verification
  if (typeof input.quantity === 'number' && typeof input.unitPrice === 'number' && typeof input.totalRevenue === 'number') {
    const expected = input.quantity * input.unitPrice;
    if (Math.abs(expected - input.totalRevenue) > 0.01) {
      errors.push(`Total revenue mismatch: expected ${expected}, got ${input.totalRevenue}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: input as Sale };
}

export function validateInventory(input: any): ValidationResult<Inventory> {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a valid object'] };
  }

  if (!input.id || typeof input.id !== 'string') errors.push('Missing or invalid "id"');
  if (!input.businessId || typeof input.businessId !== 'string') errors.push('Missing or invalid "businessId"');
  if (!input.productId || typeof input.productId !== 'string') errors.push('Missing or invalid "productId"');
  if (!input.productName || typeof input.productName !== 'string') errors.push('Missing or invalid "productName"');
  if (typeof input.currentStock !== 'number' || input.currentStock < 0) {
    errors.push('Invalid "currentStock": must be a non-negative number');
  }
  if (typeof input.reorderLevel !== 'number' || input.reorderLevel < 0) {
    errors.push('Invalid "reorderLevel": must be a non-negative number');
  }
  if (typeof input.salesVelocityUnitsPerWeek !== 'number' || input.salesVelocityUnitsPerWeek < 0) {
    errors.push('Invalid "salesVelocityUnitsPerWeek": must be non-negative');
  }
  if (!STOCK_STATUSES.includes(input.stockStatus)) {
    errors.push(`Invalid "stockStatus": must be one of ${STOCK_STATUSES.join(', ')}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: input as Inventory };
}

export function validateExpense(input: any): ValidationResult<Expense> {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a valid object'] };
  }

  if (!input.id || typeof input.id !== 'string') errors.push('Missing or invalid "id"');
  if (!input.businessId || typeof input.businessId !== 'string') errors.push('Missing or invalid "businessId"');
  if (!input.date || !DATE_REGEX.test(input.date)) errors.push('Invalid "date": must be YYYY-MM-DD format');
  if (!EXPENSE_CATEGORIES.includes(input.category)) {
    errors.push(`Invalid "category": must be one of [${EXPENSE_CATEGORIES.join(', ')}]`);
  }
  if (typeof input.amount !== 'number' || input.amount < 0) {
    errors.push('Invalid "amount": must be a non-negative number');
  }
  if (input.period !== 'current' && input.period !== 'previous') {
    errors.push('Invalid "period": must be either "current" or "previous"');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: input as Expense };
}

export function validateSupplier(input: any): ValidationResult<Supplier> {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a valid object'] };
  }

  if (!input.id || typeof input.id !== 'string') errors.push('Missing or invalid "id"');
  if (!input.businessId || typeof input.businessId !== 'string') errors.push('Missing or invalid "businessId"');
  if (!input.name || typeof input.name !== 'string') errors.push('Missing or invalid "name"');
  if (typeof input.leadTimeDays !== 'number' || input.leadTimeDays < 0) {
    errors.push('Invalid "leadTimeDays": must be non-negative');
  }
  if (!Array.isArray(input.productsSupplied)) {
    errors.push('Invalid "productsSupplied": must be an array of product names');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: input as Supplier };
}

export function validatePurchaseOrder(input: any): ValidationResult<PurchaseOrder> {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a valid object'] };
  }

  if (!input.id || typeof input.id !== 'string') errors.push('Missing or invalid "id"');
  if (!input.poNumber || typeof input.poNumber !== 'string') errors.push('Missing or invalid "poNumber"');
  if (!input.businessId || typeof input.businessId !== 'string') errors.push('Missing or invalid "businessId"');
  if (!input.supplierId || typeof input.supplierId !== 'string') errors.push('Missing or invalid "supplierId"');
  if (typeof input.approvedOrderQuantity !== 'number' || input.approvedOrderQuantity <= 0) {
    errors.push('Invalid "approvedOrderQuantity": must be a positive number');
  }
  if (typeof input.unitPrice !== 'number' || input.unitPrice <= 0) {
    errors.push('Invalid "unitPrice": must be a positive number');
  }
  if (typeof input.totalCost !== 'number' || input.totalCost < 0) {
    errors.push('Invalid "totalCost": must be a non-negative number');
  }

  // Cost verification
  if (typeof input.approvedOrderQuantity === 'number' && typeof input.unitPrice === 'number' && typeof input.totalCost === 'number') {
    const expected = input.approvedOrderQuantity * input.unitPrice;
    if (Math.abs(expected - input.totalCost) > 0.01) {
      errors.push(`Total cost mismatch: expected ${expected}, got ${input.totalCost}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: input as PurchaseOrder };
}
