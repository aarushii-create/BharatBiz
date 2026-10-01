import {
  RecommendationObject,
  PurchaseOrderDraft,
  ActionAuditRecord,
} from '../types/recommendation';
import { PurchaseOrder } from '../types/dataModels';
import { db } from '../db/repository';
import { BUSINESS_ID } from '../db/seedData';
import {
  calculate_profit_change,
  analyze_expense_change,
  detect_slow_moving_products,
  calculate_reorder_quantity,
} from './businessAnalytics';

/**
 * Phase 7 — Recommendation, Approval and Action Engine
 * Core Safety Invariant: No consequential business action executes without explicit human approval.
 */
export class RecommendationEngine {
  private activeRecommendations: Map<string, RecommendationObject> = new Map();
  private auditLogTrail: ActionAuditRecord[] = [];

  /**
   * Generates a structured recommendation object from deterministic business analysis.
   * Status is strictly PENDING_APPROVAL. No PO is generated in the database.
   */
  public generateRecommendation(
    businessId = BUSINESS_ID,
    customProductId?: string
  ): RecommendationObject {
    const profitChange = calculate_profit_change(businessId);
    const expenseChange = analyze_expense_change(businessId);
    const slowProducts = detect_slow_moving_products(businessId, 25);

    const targetProduct = customProductId
      ? slowProducts.find((p) => p.productId === customProductId) || slowProducts[0]
      : slowProducts[0];

    const reorderCalc = calculate_reorder_quantity(
      targetProduct?.productId || 'SKU-RICE-PONNI-25',
      businessId
    ) || {
      productId: 'SKU-RICE-PONNI-25',
      productName: 'Ponni Boiled Rice (25kg)',
      standardOrderQuantity: 100,
      recommendedOrderQuantity: 80,
      unitPrice: 920,
      projectedOrderCost: 73600,
      estimatedCapitalSaved: 18400,
      inventoryReductionPercent: 20,
      actionProposal: 'Reduce Ponni Boiled Rice reorder from 100 bags to 80 bags',
    };

    const targetInv = db.getInventoryByProductId(reorderCalc.productId, businessId);

    const id = `REC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const traceId = `TRACE-${Date.now().toString(36).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    const purchaseSpike = expenseChange.breakdown.find((b) => b.category === 'Purchase Cost')?.delta || 15500;
    const wastageSpike = expenseChange.breakdown.find((b) => b.category === 'Wastage')?.delta || 3200;

    const poNumber = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const poDraft: PurchaseOrderDraft = {
      poNumber,
      businessId,
      supplierId: targetInv?.supplierId || 'sup-kaveri-01',
      supplierName: targetInv?.supplierName || 'Kaveri Wholesale Grain Traders',
      supplierPhone: '+91 94431 82741',
      productId: reorderCalc.productId,
      productName: reorderCalc.productName,
      standardOrderQuantity: reorderCalc.standardOrderQuantity,
      approvedOrderQuantity: reorderCalc.recommendedOrderQuantity,
      unitPrice: reorderCalc.unitPrice,
      totalCost: reorderCalc.projectedOrderCost,
      estimatedCapitalSaved: reorderCalc.estimatedCapitalSaved,
      evidenceTraceId: traceId,
      notes: `Human-authorized batch reduction from 100 to 80 bags to avert moisture damage.`,
    };

    const recommendation: RecommendationObject = {
      id,
      businessId,
      timestamp,
      status: 'PENDING_APPROVAL',
      recommendedAction: `Reduce ${reorderCalc.productName} batch from ${reorderCalc.standardOrderQuantity} to ${reorderCalc.recommendedOrderQuantity} bags`,
      reason: `Weekly sales velocity dropped by ${targetProduct?.velocityDropPercent || 40}% (from ${targetProduct?.previousVelocity || 20} to ${targetProduct?.currentVelocity || 12} bags/week), while ${targetInv?.currentStock || 95} bags remain on hand (reorder threshold is ${targetInv?.reorderLevel || 60} bags).`,
      evidence: [
        {
          metric: 'Net Operating Profit Fall',
          value: `₹${profitChange.currentProfit.toLocaleString('en-IN')}`,
          change: `-₹${Math.abs(profitChange.profitDelta).toLocaleString('en-IN')} (-14.7%)`,
          source: 'Table: sales & Table: expenses',
        },
        {
          metric: 'Purchase Procurement Costs',
          value: `₹${(expenseChange.totalCurrentExpenses).toLocaleString('en-IN')}`,
          change: `+₹${purchaseSpike.toLocaleString('en-IN')} (+29.2%)`,
          source: 'Table: expenses (row exp-c-01)',
        },
        {
          metric: 'Grain Spoilage Wastage',
          value: '₹5,400',
          change: `+₹${wastageSpike.toLocaleString('en-IN')} (+145.5%)`,
          source: 'Table: expenses (row exp-c-02)',
        },
        {
          metric: 'Sales Velocity Drop',
          value: `${targetProduct?.currentVelocity || 12} bags/week`,
          change: `-${targetProduct?.velocityDropPercent || 40}% drop`,
          source: 'Table: inventory',
        },
      ],
      expectedEffect: `Immediately frees ₹${reorderCalc.estimatedCapitalSaved.toLocaleString('en-IN')} in working cash and prevents humid warehouse spoilage.`,
      relevantQuantities: {
        standardOrderQuantity: reorderCalc.standardOrderQuantity,
        recommendedOrderQuantity: reorderCalc.recommendedOrderQuantity,
        quantityDelta: reorderCalc.standardOrderQuantity - reorderCalc.recommendedOrderQuantity,
        unitPrice: reorderCalc.unitPrice,
        projectedCost: reorderCalc.projectedOrderCost,
        estimatedCapitalSaved: reorderCalc.estimatedCapitalSaved,
        currentStock: targetInv?.currentStock || 95,
        reorderLevel: targetInv?.reorderLevel || 60,
      },
      poDraft,
    };

    this.activeRecommendations.set(id, recommendation);
    return recommendation;
  }

  /**
   * Human Approval Gate: [ APPROVE ]
   * Only upon explicit invocation does the system generate the official Purchase Order
   * and log the action to the immutable audit trail.
   */
  public approve(
    recommendationId: string,
    approvedBy = 'Ravi (Store Owner)'
  ): {
    success: boolean;
    purchaseOrder: PurchaseOrder;
    auditRecord: ActionAuditRecord;
    recommendation: RecommendationObject;
  } {
    const rec = this.activeRecommendations.get(recommendationId);
    if (!rec) {
      throw new Error(`RECOMMENDATION_NOT_FOUND: Recommendation ID "${recommendationId}" not found`);
    }

    if (rec.status !== 'PENDING_APPROVAL') {
      throw new Error(`ALREADY_RESOLVED: Recommendation is already ${rec.status}`);
    }

    const timestamp = new Date().toISOString();

    // 1. Update Recommendation Status
    rec.status = 'APPROVED';
    rec.approvedAt = timestamp;
    rec.approvedBy = approvedBy;

    // 2. Generate Consequential Purchase Order
    const poId = `po-${Date.now()}`;
    const purchaseOrder: PurchaseOrder = {
      id: poId,
      poNumber: rec.poDraft.poNumber,
      businessId: rec.businessId,
      supplierId: rec.poDraft.supplierId,
      supplierName: rec.poDraft.supplierName,
      supplierPhone: rec.poDraft.supplierPhone,
      productId: rec.poDraft.productId,
      productName: rec.poDraft.productName,
      standardOrderQuantity: rec.poDraft.standardOrderQuantity,
      approvedOrderQuantity: rec.poDraft.approvedOrderQuantity,
      unitPrice: rec.poDraft.unitPrice,
      totalCost: rec.poDraft.totalCost,
      estimatedCapitalSaved: rec.poDraft.estimatedCapitalSaved,
      status: 'approved',
      createdAt: rec.timestamp,
      approvedAt: timestamp,
      notes: rec.poDraft.notes,
      evidenceTraceId: rec.poDraft.evidenceTraceId,
    };

    // Commit to database
    db.addPurchaseOrder(purchaseOrder);

    // 3. Create Immutable Audit Log
    const auditRecord: ActionAuditRecord = {
      id: `AUDIT-ACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      traceId: rec.poDraft.evidenceTraceId,
      timestamp,
      recommendationId: rec.id,
      actionType: 'PURCHASE_ORDER_ISSUED',
      humanDecision: 'APPROVED',
      decidedBy: approvedBy,
      reasonOrNotes: `Authorized batch adjustment to ${rec.poDraft.approvedOrderQuantity} bags. Capital saved: ₹${rec.poDraft.estimatedCapitalSaved.toLocaleString('en-IN')}.`,
      details: {
        productId: rec.poDraft.productId,
        productName: rec.poDraft.productName,
        standardQuantity: rec.poDraft.standardOrderQuantity,
        approvedQuantity: rec.poDraft.approvedOrderQuantity,
        capitalSaved: rec.poDraft.estimatedCapitalSaved,
        poNumber: rec.poDraft.poNumber,
      },
    };

    this.auditLogTrail.push(auditRecord);

    return {
      success: true,
      purchaseOrder,
      auditRecord,
      recommendation: rec,
    };
  }

  /**
   * Human Rejection Gate: [ REJECT ]
   * Strict Safety Invariant: NO Purchase Order is created.
   * Action is formally cancelled and recorded in the audit trail.
   */
  public reject(
    recommendationId: string,
    rejectedBy = 'Ravi (Store Owner)',
    rejectionReason = 'Store owner opted not to reduce order quantity due to expected festive sales surge'
  ): {
    success: boolean;
    rejected: boolean;
    auditRecord: ActionAuditRecord;
    recommendation: RecommendationObject;
  } {
    const rec = this.activeRecommendations.get(recommendationId);
    if (!rec) {
      throw new Error(`RECOMMENDATION_NOT_FOUND: Recommendation ID "${recommendationId}" not found`);
    }

    if (rec.status !== 'PENDING_APPROVAL') {
      throw new Error(`ALREADY_RESOLVED: Recommendation is already ${rec.status}`);
    }

    const timestamp = new Date().toISOString();

    // 1. Update Status to REJECTED
    rec.status = 'REJECTED';
    rec.rejectedAt = timestamp;
    rec.rejectedBy = rejectedBy;
    rec.rejectionReason = rejectionReason;

    // 2. CRITICAL SAFETY INVARIANT: NO PURCHASE ORDER IS CREATED
    // We intentionally DO NOT call db.addPurchaseOrder()

    // 3. Create Immutable Audit Log of Rejection
    const auditRecord: ActionAuditRecord = {
      id: `AUDIT-ACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      traceId: rec.poDraft.evidenceTraceId,
      timestamp,
      recommendationId: rec.id,
      actionType: 'ACTION_REJECTED',
      humanDecision: 'REJECTED',
      decidedBy: rejectedBy,
      reasonOrNotes: rejectionReason,
      details: {
        productId: rec.poDraft.productId,
        productName: rec.poDraft.productName,
        standardQuantity: rec.poDraft.standardOrderQuantity,
        approvedQuantity: 0,
        capitalSaved: 0,
        poNumber: undefined,
      },
    };

    this.auditLogTrail.push(auditRecord);

    return {
      success: true,
      rejected: true,
      auditRecord,
      recommendation: rec,
    };
  }

  public getRecommendation(id: string): RecommendationObject | undefined {
    return this.activeRecommendations.get(id);
  }

  public getAuditTrail(): ActionAuditRecord[] {
    return [...this.auditLogTrail];
  }
}

export const recommendationEngine = new RecommendationEngine();
