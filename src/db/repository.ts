import {
  Product,
  Sale,
  Inventory,
  Expense,
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../types/dataModels';
import {
  SEED_PRODUCTS,
  SEED_SALES,
  SEED_INVENTORY,
  SEED_EXPENSES,
  SEED_SUPPLIERS,
  SEED_PURCHASE_ORDERS,
  BUSINESS_ID,
} from './seedData';
import {
  validateProduct,
  validateSale,
  validateInventory,
  validateExpense,
  validateSupplier,
  validatePurchaseOrder,
} from './validation';

/**
 * In-Memory Structured Business Database & Repository
 * Fully scoped by `business_id` to ensure business isolation.
 */
class BusinessDataRepository {
  private products: Product[] = [];
  private sales: Sale[] = [];
  private inventory: Inventory[] = [];
  private expenses: Expense[] = [];
  private suppliers: Supplier[] = [];
  private purchaseOrders: PurchaseOrder[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.resetToSeed();
  }

  public resetToSeed(): void {
    this.products = JSON.parse(JSON.stringify(SEED_PRODUCTS));
    this.sales = JSON.parse(JSON.stringify(SEED_SALES));
    this.inventory = JSON.parse(JSON.stringify(SEED_INVENTORY));
    this.expenses = JSON.parse(JSON.stringify(SEED_EXPENSES));
    this.suppliers = JSON.parse(JSON.stringify(SEED_SUPPLIERS));
    this.purchaseOrders = JSON.parse(JSON.stringify(SEED_PURCHASE_ORDERS));
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('Listener notification error:', e);
      }
    }
  }

  // --- PRODUCTS DAL ---
  public getProducts(businessId = BUSINESS_ID): Product[] {
    return this.products.filter((p) => p.businessId === businessId);
  }

  public getProductById(id: string, businessId = BUSINESS_ID): Product | undefined {
    return this.products.find((p) => p.id === id && p.businessId === businessId);
  }

  public getProductBySku(sku: string, businessId = BUSINESS_ID): Product | undefined {
    return this.products.find((p) => p.sku === sku && p.businessId === businessId);
  }

  public addProduct(product: unknown): { success: boolean; data?: Product; errors?: string[] } {
    const val = validateProduct(product);
    if (!val.valid || !val.data) return { success: false, errors: val.errors };

    this.products.push(val.data);
    this.notify();
    return { success: true, data: val.data };
  }

  // --- SALES DAL ---
  public getSales(businessId = BUSINESS_ID, period?: 'current' | 'previous'): Sale[] {
    let list = this.sales.filter((s) => s.businessId === businessId);
    if (period) {
      list = list.filter((s) => s.period === period);
    }
    return list;
  }

  public addSale(sale: unknown): { success: boolean; data?: Sale; errors?: string[] } {
    const val = validateSale(sale);
    if (!val.valid || !val.data) return { success: false, errors: val.errors };

    this.sales.push(val.data);
    this.notify();
    return { success: true, data: val.data };
  }

  // --- INVENTORY DAL ---
  public getInventory(businessId = BUSINESS_ID): Inventory[] {
    return this.inventory.filter((i) => i.businessId === businessId);
  }

  public getInventoryByProductId(productId: string, businessId = BUSINESS_ID): Inventory | undefined {
    return this.inventory.find((i) => i.productId === productId && i.businessId === businessId);
  }

  public updateStock(
    productId: string,
    newStock: number,
    businessId = BUSINESS_ID
  ): { success: boolean; errors?: string[] } {
    if (newStock < 0) return { success: false, errors: ['Stock cannot be negative'] };

    const item = this.getInventoryByProductId(productId, businessId);
    if (!item) return { success: false, errors: ['Inventory item not found'] };

    item.currentStock = newStock;
    item.updatedAt = new Date().toISOString();
    this.notify();
    return { success: true };
  }

  public addInventoryItem(item: unknown): { success: boolean; data?: Inventory; errors?: string[] } {
    const val = validateInventory(item);
    if (!val.valid || !val.data) return { success: false, errors: val.errors };

    this.inventory.push(val.data);
    this.notify();
    return { success: true, data: val.data };
  }

  // --- EXPENSES DAL ---
  public getExpenses(businessId = BUSINESS_ID, period?: 'current' | 'previous'): Expense[] {
    let list = this.expenses.filter((e) => e.businessId === businessId);
    if (period) {
      list = list.filter((e) => e.period === period);
    }
    return list;
  }

  public addExpense(expense: unknown): { success: boolean; data?: Expense; errors?: string[] } {
    const val = validateExpense(expense);
    if (!val.valid || !val.data) return { success: false, errors: val.errors };

    this.expenses.push(val.data);
    this.notify();
    return { success: true, data: val.data };
  }

  // --- SUPPLIERS DAL ---
  public getSuppliers(businessId = BUSINESS_ID): Supplier[] {
    return this.suppliers.filter((s) => s.businessId === businessId);
  }

  public getSupplierById(id: string, businessId = BUSINESS_ID): Supplier | undefined {
    return this.suppliers.find((s) => s.id === id && s.businessId === businessId);
  }

  public addSupplier(supplier: unknown): { success: boolean; data?: Supplier; errors?: string[] } {
    const val = validateSupplier(supplier);
    if (!val.valid || !val.data) return { success: false, errors: val.errors };

    this.suppliers.push(val.data);
    this.notify();
    return { success: true, data: val.data };
  }

  // --- PURCHASE ORDERS DAL ---
  public getPurchaseOrders(businessId = BUSINESS_ID): PurchaseOrder[] {
    return this.purchaseOrders.filter((po) => po.businessId === businessId);
  }

  public getPurchaseOrderById(id: string, businessId = BUSINESS_ID): PurchaseOrder | undefined {
    return this.purchaseOrders.find((po) => po.id === id && po.businessId === businessId);
  }

  public addPurchaseOrder(po: unknown): { success: boolean; data?: PurchaseOrder; errors?: string[] } {
    const val = validatePurchaseOrder(po);
    if (!val.valid || !val.data) return { success: false, errors: val.errors };

    this.purchaseOrders.push(val.data);
    this.notify();
    return { success: true, data: val.data };
  }

  // --- BULK INGESTION SETTERS ---
  public setSales(sales: Sale[]): void {
    this.sales = [...sales];
    this.notify();
  }

  public setInventory(inventory: Inventory[]): void {
    this.inventory = [...inventory];
    this.notify();
  }

  public setExpenses(expenses: Expense[]): void {
    this.expenses = [...expenses];
    this.notify();
  }

  public updatePOStatus(
    id: string,
    status: PurchaseOrderStatus,
    businessId = BUSINESS_ID
  ): { success: boolean; errors?: string[] } {
    const po = this.getPurchaseOrderById(id, businessId);
    if (!po) return { success: false, errors: ['Purchase order not found'] };

    po.status = status;
    if (status === 'approved') {
      po.approvedAt = new Date().toISOString();
    }
    this.notify();
    return { success: true };
  }
}

export const db = new BusinessDataRepository();
