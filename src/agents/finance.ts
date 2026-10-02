import {
  analyze_expense_change,
  calculate_profit_change,
} from '../services/businessAnalytics';
import { AgentContext, AgentResult } from './types';

export function runFinanceAgent(context: AgentContext): AgentResult {
  const profitChange = calculate_profit_change(context.businessId);
  const expenseChange = analyze_expense_change(context.businessId);

  const findings = [
    {
      metric: 'profit_delta',
      value: profitChange.profitDelta,
      detail: `Net operating profit moved by ₹${Math.abs(profitChange.profitDelta).toLocaleString('en-IN')} compared with the previous period.`,
      evidenceIds: ['fin-01', 'fin-02'],
      status: 'VERIFIED' as const,
    },
    {
      metric: 'expense_delta',
      value: expenseChange.netExpenseDelta,
      detail: `Total expense delta is ₹${expenseChange.netExpenseDelta.toLocaleString('en-IN')} across the expense ledger.`,
      evidenceIds: ['fin-03'],
      status: 'VERIFIED' as const,
    },
  ];

  return {
    agent: 'finance_agent',
    status: 'completed',
    findings,
    evidence: [
      { id: 'fin-01', metric: 'current_profit', source: 'business_ledger', status: 'VERIFIED' },
      { id: 'fin-02', metric: 'previous_profit', source: 'business_ledger', status: 'VERIFIED' },
      { id: 'fin-03', metric: 'expense_breakdown', source: 'expense_ledger', status: 'VERIFIED' },
    ],
    nextAction: 'compare_profit_with_inventory_to_confirm_root_cause',
    metadata: {
      profitDelta: profitChange.profitDelta,
      revenueDelta: profitChange.revenueDelta,
      expenseDelta: expenseChange.netExpenseDelta,
      topExpenseCategory: expenseChange.topContributors[0]?.category || 'Unknown',
    },
  };
}
