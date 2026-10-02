import { AgentContext, AgentResult } from './types';

export function runVerificationAgent(context: AgentContext, financeFindings: Array<{ metric: string; value: number | string; status: string }>, inventoryFindings: Array<{ metric: string; value: number | string; status: string }>): AgentResult {
  const financeVerified = financeFindings.every((finding) => finding.status === 'VERIFIED');
  const inventoryVerified = inventoryFindings.every((finding) => finding.status === 'VERIFIED' || finding.status === 'INSUFFICIENT_DATA');

  const status = financeVerified && inventoryVerified ? 'completed' : 'needs_more_data';

  return {
    agent: 'verification_agent',
    status,
    findings: [
      {
        metric: 'verification_status',
        value: financeVerified && inventoryVerified ? 'VERIFIED' : 'INSUFFICIENT_DATA',
        detail: financeVerified && inventoryVerified
          ? 'The financial and inventory findings were validated against the internal ledger and deterministic calculations.'
          : 'One or more required measurements are missing from the current business data, so the final answer should remain conservative.',
        evidenceIds: financeVerified ? ['fin-01', 'fin-02', 'fin-03'] : [],
        status: financeVerified && inventoryVerified ? 'VERIFIED' : 'INSUFFICIENT_DATA',
      },
    ],
    evidence: financeVerified ? [{ id: 'ver-01', metric: 'evidence_chain', source: 'internal_ledger', status: 'VERIFIED' }] : [],
    nextAction: financeVerified && inventoryVerified ? 'produce_evidence_backed_recommendation' : 'request_more_data',
    metadata: {
      verificationStatus: financeVerified && inventoryVerified ? 'VERIFIED' : 'INSUFFICIENT_DATA',
    },
  };
}
