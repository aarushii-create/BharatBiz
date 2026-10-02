import { SupportedLanguage } from '../types';
import { InvestigationPlan } from './types';

export function createInvestigationPlan(
  question: string,
  language: SupportedLanguage,
  businessId = 'biz-murugan-01'
): InvestigationPlan {
  const normalized = question.toLowerCase();
  const investigationId = `INV-${Date.now().toString(36).toUpperCase()}`;

  if (/(profit|loss|decrease|fall|decrease| net|margin|लाभ|मुनाफ|कमी|उत्पादन|लागत|குறை|లాభం)/.test(normalized)) {
    return {
      investigationId,
      intent: 'PROFIT_DROP_ANALYSIS',
      requiredAgents: ['finance_agent', 'inventory_agent', 'verification_agent', 'recommendation_agent'],
      investigationSteps: [
        'compare_profit_and_expense_periods',
        'inspect_slow_moving_inventory',
        'verify_evidence_chain',
        'recommend_purchase_correction',
      ],
      evidenceQuality: 'VERIFIED',
    };
  }

  if (/(reorder|stock|inventory|slow|dead stock|unsold|स्टॉक|खरीद|क़ीमत|சரக்கு|ఆర్డర్)/.test(normalized)) {
    return {
      investigationId,
      intent: 'INVENTORY_HEALTH_ANALYSIS',
      requiredAgents: ['inventory_agent', 'verification_agent', 'recommendation_agent'],
      investigationSteps: ['inspect_inventory_velocity', 'evaluate_reorder_risk', 'validate_stock_evidence'],
      evidenceQuality: 'VERIFIED',
    };
  }

  return {
    investigationId,
    intent: 'GENERAL_BUSINESS_HEALTH',
    requiredAgents: ['finance_agent', 'verification_agent'],
    investigationSteps: ['review_revenue_and_expense_baseline', 'check_data_quality', 'summarize_findings'],
    evidenceQuality: 'PARTIAL',
  };
}
