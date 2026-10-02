import { SupportedLanguage } from '../types';

export type AgentName =
  | 'supervisor_agent'
  | 'finance_agent'
  | 'inventory_agent'
  | 'external_signal_agent'
  | 'insight_agent'
  | 'verification_agent'
  | 'recommendation_agent'
  | 'action_agent';

export interface EvidenceRef {
  id: string;
  metric: string;
  source: string;
  status: 'VERIFIED' | 'PARTIAL' | 'INSUFFICIENT_DATA';
}

export interface Finding {
  metric: string;
  value: number | string;
  detail: string;
  evidenceIds: string[];
  status: 'VERIFIED' | 'PARTIAL' | 'INSUFFICIENT_DATA';
}

export interface AgentContext {
  businessId: string;
  userId: string;
  question: string;
  language: SupportedLanguage;
  investigationId: string;
  previousFindings?: Finding[];
}

export interface AgentResult {
  agent: AgentName;
  status: 'completed' | 'needs_more_data' | 'failed';
  findings: Finding[];
  evidence: EvidenceRef[];
  nextAction?: string;
  metadata?: Record<string, unknown>;
}

export interface InvestigationPlan {
  investigationId: string;
  intent: string;
  requiredAgents: AgentName[];
  investigationSteps: string[];
  evidenceQuality: 'VERIFIED' | 'PARTIAL' | 'INSUFFICIENT_DATA';
}

export interface InvestigationResult {
  investigationId: string;
  status: 'completed' | 'needs_more_data' | 'failed';
  evidenceQuality: 'VERIFIED' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  requiredAgents: AgentName[];
  intent: string;
  recommendation: string;
  explanation: string;
  action?: {
    productName: string;
    quantity: number;
    requiresApproval: boolean;
  };
  metrics: {
    revenueDelta: number;
    expenseDelta: number;
    profitDelta: number;
    slowMovingProduct?: string;
    reorderQty?: number;
  };
  findings: Finding[];
  activity: Array<{ agent: string; status: 'complete' | 'blocked'; detail: string }>;
}
