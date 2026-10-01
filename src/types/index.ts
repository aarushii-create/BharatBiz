export type SupportedLanguage = 'ta' | 'hi' | 'en' | 'te';

export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  speechLocale: string;
}

export interface SaleRecord {
  id: string;
  businessId: string;
  date: string;
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalRevenue: number;
}

export interface InventoryItem {
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
  stockStatus: 'optimal' | 'low' | 'overstocked' | 'critical';
}

export interface ExpenseRecord {
  id: string;
  businessId: string;
  date: string;
  category: 'Purchase Cost' | 'Wastage' | 'Delivery Expense' | 'Rent' | 'Electricity' | 'Packaging' | 'Other';
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
  status: 'pending_approval' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
  notes: string;
  evidenceTraceId: string;
}

export interface EvidenceNode {
  id: string;
  title: string;
  metric: string;
  change: string;
  impact: 'neutral' | 'negative' | 'positive';
  description: string;
  category: 'revenue' | 'purchase_cost' | 'wastage' | 'delivery' | 'inventory';
}

export interface DeterministicAnalysisResult {
  periodComparison: {
    currentRevenue: number;
    previousRevenue: number;
    revenueDelta: number;
    currentExpenses: number;
    previousExpenses: number;
    expenseDelta: number;
    currentProfit: number;
    previousProfit: number;
    profitDelta: number; // e.g. -8420
  };
  expenseBreakdown: {
    purchaseCostIncrease: number; // e.g. +15500
    wastageIncrease: number;      // e.g. +3200
    deliveryIncrease: number;     // e.g. +1720
    otherDelta: number;
  };
  slowMovingProduct: {
    productId: string;
    productName: string;
    currentStock: number;
    velocityDropPercent: number; // e.g. 40%
    standardOrderQty: number;   // e.g. 100
    recommendedOrderQty: number;// e.g. 80
    unitPrice: number;          // e.g. 920
    estimatedSavings: number;   // e.g. 18400
  };
  evidenceChain: EvidenceNode[];
}

export interface AssistantDecision {
  traceId: string;
  query: string;
  language: SupportedLanguage;
  intent: 'profit_decline' | 'slow_moving_inventory' | 'reorder_recommendation' | 'general_health';
  analysis: DeterministicAnalysisResult;
  explanation: string;
  recommendation: string;
  proposedAction: {
    actionType: 'GENERATE_PURCHASE_ORDER';
    requiresApproval: boolean;
    poDraft: Omit<PurchaseOrder, 'id' | 'status' | 'createdAt'>;
  };
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  language: SupportedLanguage;
  query: string;
  intent: string;
  toolsInvoked: string[];
  deterministicFindings: string;
  recommendation: string;
  humanApproval: 'PENDING' | 'APPROVED' | 'REJECTED';
  actionExecuted: string;
  poNumber?: string;
}
