export type RecommendationStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface EvidenceReference {
  metric: string;
  value: string;
  change: string;
  source: string;
}

export interface RelevantQuantities {
  standardOrderQuantity: number;
  recommendedOrderQuantity: number;
  quantityDelta: number;
  unitPrice: number;
  projectedCost: number;
  estimatedCapitalSaved: number;
  currentStock: number;
  reorderLevel: number;
}

export interface PurchaseOrderDraft {
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
  evidenceTraceId: string;
  notes: string;
}

export interface RecommendationObject {
  id: string;
  businessId: string;
  timestamp: string;
  status: RecommendationStatus;
  recommendedAction: string;
  reason: string;
  evidence: EvidenceReference[];
  expectedEffect: string;
  relevantQuantities: RelevantQuantities;
  poDraft: PurchaseOrderDraft;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

export interface ActionAuditRecord {
  id: string;
  traceId: string;
  timestamp: string;
  recommendationId: string;
  actionType: 'PURCHASE_ORDER_ISSUED' | 'ACTION_REJECTED';
  humanDecision: 'APPROVED' | 'REJECTED';
  decidedBy: string;
  reasonOrNotes: string;
  details: {
    productId?: string;
    productName?: string;
    standardQuantity?: number;
    approvedQuantity?: number;
    capitalSaved?: number;
    poNumber?: string;
  };
}
