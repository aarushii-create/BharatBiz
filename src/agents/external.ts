import { AgentContext, AgentResult } from './types';

export function runExternalSignalAgent(context: AgentContext): AgentResult {
  return {
    agent: 'external_signal_agent',
    status: 'completed',
    findings: [
      {
        metric: 'external_context',
        value: 'unavailable',
        detail: 'External signals were not enabled for this business context, so the analysis remains grounded in internal records.',
        evidenceIds: [],
        status: 'PARTIAL',
      },
    ],
    evidence: [],
    nextAction: 'continue_with_internal_business_evidence_only',
    metadata: {
      externalSignalsAvailable: false,
      sourceNotes: 'No external provider configured for this run.',
    },
  };
}
