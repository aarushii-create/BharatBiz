import { SupportedLanguage } from './index';

export type BusinessIntentType =
  | 'profit_decline_analysis'
  | 'slow_moving_products_analysis'
  | 'low_stock_analysis'
  | 'expense_surge_analysis'
  | 'reorder_recommendation'
  | 'general_business_health'
  | 'unsupported_query';

export interface BusinessContext {
  mentionedProducts: string[];
  mentionedCategories: string[];
  timeframe: 'current_month' | 'previous_month' | 'comparison' | 'all_time';
  sentiment: 'negative' | 'neutral' | 'inquiry';
  rawQuery: string;
}

export interface ToolCallDeclaration {
  toolName: string;
  parameters: Record<string, any>;
  justification: string;
}

export interface ToolExecutionOutput {
  toolName: string;
  parameters: Record<string, any>;
  executionTimestamp: string;
  executionDurationMs: number;
  success: boolean;
  result?: any;
  error?: string;
}

export interface OrchestrationPlan {
  traceId: string;
  rawQuery: string;
  language: SupportedLanguage;
  intent: BusinessIntentType;
  confidenceScore: number;
  context: BusinessContext;
  plannedToolCalls: ToolCallDeclaration[];
}

export interface GroundedOrchestrationResult {
  traceId: string;
  query: string;
  language: SupportedLanguage;
  intent: BusinessIntentType;
  context: BusinessContext;
  toolCallsExecuted: ToolExecutionOutput[];
  deterministicSummary: {
    profitDelta?: number;
    revenueDelta?: number;
    expenseDelta?: number;
    primarySlowMovingSku?: string;
    velocityDropPercent?: number;
    topExpenseSpikeCategory?: string;
    topExpenseSpikeAmount?: number;
    lowStockSkus?: string[];
  };
  explanation: string;
  recommendation: string;
  proposedAction?: {
    actionType: 'GENERATE_PURCHASE_ORDER' | 'NOTIFY_LOW_STOCK' | 'REVIEW_EXPENSES';
    requiresApproval: boolean;
    payload: any;
  };
}
