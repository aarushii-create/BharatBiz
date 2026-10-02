import { BUSINESS_ID } from '../db/seedData';
import { createInvestigationPlan, invokeInvestigation } from '../agents';
import { calculate_profit_change } from '../services/businessAnalytics';

export function runAgentFrameworkTests() {
  const results = [
    {
      suite: 'agent framework',
      name: 'Supervisor selects finance and inventory agents for profit queries',
      actual: createInvestigationPlan('Why did my profit decrease?', 'en').requiredAgents,
      expected: ['finance_agent', 'inventory_agent'],
      passed: (() => {
        const plan = createInvestigationPlan('Why did my profit decrease?', 'en');
        return plan.requiredAgents.includes('finance_agent') && plan.requiredAgents.includes('inventory_agent');
      })(),
      error: undefined,
    },
    {
      suite: 'agent framework',
      name: 'Investigation uses deterministic analytics and validates evidence',
      actual: undefined,
      expected: 'VERIFIED',
      passed: (() => {
        const investigation = invokeInvestigation('Why did my profit decrease?', 'en', BUSINESS_ID);
        return investigation.status === 'completed' && investigation.evidenceQuality === 'VERIFIED' && investigation.metrics.profitDelta === calculate_profit_change(BUSINESS_ID).profitDelta;
      })(),
      error: undefined,
    },
  ];

  return {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    results,
  };
}
