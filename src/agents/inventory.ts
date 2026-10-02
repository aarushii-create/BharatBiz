import {
  calculate_reorder_quantity,
  detect_low_stock,
  detect_slow_moving_products,
} from '../services/businessAnalytics';
import { AgentContext, AgentResult } from './types';

export function runInventoryAgent(context: AgentContext): AgentResult {
  const slow = detect_slow_moving_products(context.businessId, 25);
  const lowStock = detect_low_stock(context.businessId);
  const primaryProduct = slow[0];
  const reorder = primaryProduct ? calculate_reorder_quantity(primaryProduct.productId, context.businessId) : null;

  const findings: AgentResult['findings'] = [
    {
      metric: 'slow_moving_product',
      value: primaryProduct ? `${primaryProduct.productName} (${primaryProduct.velocityDropPercent}%)` : 'No slow-moving products found',
      detail: primaryProduct
        ? `${primaryProduct.productName} is moving ${primaryProduct.velocityDropPercent}% slower than the previous period.`
        : 'Current inventory velocity is stable.',
      evidenceIds: ['inv-01'],
      status: primaryProduct ? 'VERIFIED' : 'INSUFFICIENT_DATA',
    },
    {
      metric: 'reorder_quantity',
      value: reorder?.recommendedOrderQuantity ?? 0,
      detail: reorder
        ? `The recommended order quantity is ${reorder.recommendedOrderQuantity} units based on the current inventory risk.`
        : 'No reorder recommendation is available from the current data.',
      evidenceIds: ['inv-02'],
      status: reorder ? 'VERIFIED' : 'INSUFFICIENT_DATA',
    },
    {
      metric: 'low_stock_items',
      value: lowStock.length,
      detail: lowStock.length > 0 ? `${lowStock.length} product(s) are below or near their reorder threshold.` : 'No urgent stockout risk is present in the current inventory.',
      evidenceIds: ['inv-03'],
      status: 'VERIFIED',
    },
  ];

  return {
    agent: 'inventory_agent',
    status: 'completed',
    findings,
    evidence: [
      { id: 'inv-01', metric: 'inventory_velocity', source: 'inventory_ledger', status: 'VERIFIED' },
      { id: 'inv-02', metric: 'reorder_calc', source: 'inventory_reorder_logic', status: reorder ? 'VERIFIED' : 'INSUFFICIENT_DATA' },
      { id: 'inv-03', metric: 'stock_risk', source: 'inventory_ledger', status: 'VERIFIED' },
    ],
    nextAction: 'check_if_reorder_quantity_is_supported_by_evidence',
    metadata: {
      slowMovingProduct: primaryProduct?.productName,
      reorderQty: reorder?.recommendedOrderQuantity,
      lowStockCount: lowStock.length,
    },
  };
}
