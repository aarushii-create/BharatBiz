/**
 * Phase 4 — Structured Evidence Representation
 * Connects business data to recommendations through an auditable causal DAG.
 */

export type EvidenceImpactType = 'negative' | 'positive' | 'neutral' | 'actionable';

export type EvidenceCategoryType =
  | 'revenue'
  | 'expense_surge'
  | 'profit_impact'
  | 'inventory_velocity'
  | 'recommendation';

export interface EvidenceNodeData {
  id: string;
  metric: string;
  value: string;
  numericValue: number;
  change: string;
  impact: EvidenceImpactType;
  category: EvidenceCategoryType;
  source: string; // Exact table, query, and period
  calculation: string; // Exact mathematical formula
  relationshipToConclusion: string; // Causal relationship description
  sourceRowIds?: string[];
}

export interface EvidenceEdge {
  fromNodeId: string;
  toNodeId: string;
  relationship: string; // e.g. "causes", "contributes_to", "correlates_with", "justifies"
}

export interface EvidenceGraph {
  traceId: string;
  businessId: string;
  timestamp: string;
  query: string;
  nodes: EvidenceNodeData[];
  edges: EvidenceEdge[];
  summaryConclusion: {
    profitDelta: number;
    recommendedOrderQty: number;
    standardOrderQty: number;
    capitalSaved: number;
    targetSku: string;
  };
  backwardTracePath: string[]; // Order of node IDs from Conclusion back to Raw Data
}
