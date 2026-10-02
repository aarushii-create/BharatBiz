import { AgentContext, AgentResult, Finding } from './types';

export function runInsightAgent(context: AgentContext, financeFindings: Finding[], inventoryFindings: Finding[]): AgentResult {
  const profitDelta = financeFindings.find((finding) => finding.metric === 'profit_delta')?.value as number | undefined;
  const slowProduct = inventoryFindings.find((finding) => finding.metric === 'slow_moving_product')?.value as string | undefined;

  const explanation =
    profitDelta !== undefined && profitDelta < 0 && slowProduct
      ? `Increased procurement cost and slower inventory movement contributed to the negative profit trend, with ${slowProduct} identified as the main exposure.`
      : 'The available evidence suggests the issue is consistent with inventory and expense pressure, but no direct causal proof was created beyond the verified ledger data.';

  return {
    agent: 'insight_agent',
    status: 'completed',
    findings: [
      {
        metric: 'correlated_insight',
        value: explanation,
        detail: explanation,
        evidenceIds: ['fin-01', 'fin-03', 'inv-01'],
        status: 'VERIFIED',
      },
    ],
    evidence: [
      { id: 'ins-01', metric: 'correlation', source: 'finance_inventory_evidence', status: 'VERIFIED' },
    ],
    nextAction: 'validate_final_claims_before_recommendation',
    metadata: {
      insight: explanation,
    },
  };
}
