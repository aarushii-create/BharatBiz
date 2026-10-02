import { SupportedLanguage } from '../types';
import { calculate_profit_change } from '../services/businessAnalytics';
import { createInvestigationPlan } from './supervisor';
import { runFinanceAgent } from './finance';
import { runInventoryAgent } from './inventory';
import { runExternalSignalAgent } from './external';
import { runInsightAgent } from './insight';
import { runVerificationAgent } from './verification';
import { AgentContext, InvestigationResult } from './types';

export { createInvestigationPlan } from './supervisor';

export function invokeInvestigation(
  question: string,
  language: SupportedLanguage,
  businessId = 'biz-murugan-01',
  userId = 'system-user'
): InvestigationResult {
  const plan = createInvestigationPlan(question, language, businessId);
  const context: AgentContext = {
    businessId,
    userId,
    question,
    language,
    investigationId: plan.investigationId,
  };

  const finance = runFinanceAgent(context);
  const inventory = runInventoryAgent(context);
  const external = runExternalSignalAgent(context);
  const insight = runInsightAgent(context, finance.findings, inventory.findings);
  const verification = runVerificationAgent(context, finance.findings, inventory.findings);

  const profitDelta = calculate_profit_change(businessId).profitDelta;
  const recommendation = profitDelta < 0
    ? 'Reduce the next purchase quantity for the slowest-moving SKU to avoid excess working capital and spoilage.'
    : 'No immediate order reduction is required from the current evidence.';

  const explanation = profitDelta < 0
    ? `The ledger confirms a profit decline of ₹${Math.abs(profitDelta).toLocaleString('en-IN')}. Purchase costs increased while the slowest-moving product is still carrying excess stock.`
    : 'The business data available does not show a profit decline or urgent inventory risk.';

  const activity: InvestigationResult['activity'] = [
    { agent: 'Supervisor Agent', status: 'complete', detail: `Planned ${plan.requiredAgents.length} specialist checks.` },
    { agent: 'Finance Agent', status: 'complete', detail: `Calculated the retail profit delta at ₹${profitDelta.toLocaleString('en-IN')}.` },
    { agent: 'Inventory Agent', status: 'complete', detail: `Reviewed inventory risk and reorder constraints.` },
    { agent: 'External Signal Agent', status: external.status === 'completed' ? 'complete' : 'blocked', detail: external.findings[0]?.detail || 'No external context provided.' },
    { agent: 'Insight Agent', status: 'complete', detail: insight.findings[0]?.detail || 'Findings correlated.' },
    { agent: 'Verification Agent', status: verification.status === 'completed' ? 'complete' : 'blocked', detail: verification.findings[0]?.detail || 'Verification pending.' },
  ];

  return {
    investigationId: plan.investigationId,
    status: verification.status === 'completed' ? 'completed' : 'needs_more_data',
    evidenceQuality: verification.metadata?.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PARTIAL',
    requiredAgents: plan.requiredAgents,
    intent: plan.intent,
    recommendation,
    explanation,
    action: {
      productName: String(inventory.metadata?.slowMovingProduct ?? 'General stock review'),
      quantity: Number(inventory.metadata?.reorderQty ?? 0),
      requiresApproval: profitDelta < 0,
    },
    metrics: {
      revenueDelta: calculate_profit_change(businessId).revenueDelta,
      expenseDelta: calculate_profit_change(businessId).expenseDelta,
      profitDelta,
      slowMovingProduct: inventory.metadata?.slowMovingProduct as string | undefined,
      reorderQty: Number(inventory.metadata?.reorderQty ?? 0),
    },
    findings: [...finance.findings, ...inventory.findings, ...insight.findings, ...verification.findings],
    activity,
  };
}
