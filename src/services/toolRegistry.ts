import {
  calculate_profit,
  calculate_profit_change,
  detect_slow_moving_products,
  detect_low_stock,
  analyze_expense_change,
  calculate_reorder_quantity,
  get_sales,
  get_inventory,
  get_expenses,
} from './businessAnalytics';
import { ToolExecutionOutput } from '../types/orchestrator';
import { BUSINESS_ID } from '../db/seedData';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  execute: (args: Record<string, any>) => any;
}

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  calculate_profit_change: {
    name: 'calculate_profit_change',
    description: 'Computes current vs previous period profit, revenue delta, expense delta, and net profit change deterministically.',
    parameters: {
      type: 'object',
      properties: {
        businessId: { type: 'string', description: 'Business ID (defaults to active store)' },
        currentPeriod: { type: 'string', description: 'Period name for current analysis (e.g. current)' },
        previousPeriod: { type: 'string', description: 'Period name for previous analysis (e.g. previous)' },
      },
    },
    execute: (args) =>
      calculate_profit_change(
        args.businessId || BUSINESS_ID,
        args.currentPeriod || 'current',
        args.previousPeriod || 'previous'
      ),
  },

  analyze_expense_change: {
    name: 'analyze_expense_change',
    description: 'Analyzes category-by-category changes in operating expenses, identifying top surges (e.g. purchase cost, wastage, demurrage).',
    parameters: {
      type: 'object',
      properties: {
        businessId: { type: 'string', description: 'Business ID' },
        currentPeriod: { type: 'string', description: 'Current period' },
        previousPeriod: { type: 'string', description: 'Previous period' },
      },
    },
    execute: (args) =>
      analyze_expense_change(
        args.businessId || BUSINESS_ID,
        args.currentPeriod || 'current',
        args.previousPeriod || 'previous'
      ),
  },

  detect_slow_moving_products: {
    name: 'detect_slow_moving_products',
    description: 'Finds products whose weekly sales velocity has dropped by at least thresholdPercent, exposing overstocked capital.',
    parameters: {
      type: 'object',
      properties: {
        businessId: { type: 'string', description: 'Business ID' },
        thresholdPercent: { type: 'number', description: 'Percentage velocity drop threshold (e.g. 25)' },
      },
    },
    execute: (args) =>
      detect_slow_moving_products(
        args.businessId || BUSINESS_ID,
        typeof args.thresholdPercent === 'number' ? args.thresholdPercent : 25
      ),
  },

  detect_low_stock: {
    name: 'detect_low_stock',
    description: 'Scans inventory to find items where current stock is less than or equal to reorder level, calculating stock deficit and days of supply.',
    parameters: {
      type: 'object',
      properties: {
        businessId: { type: 'string', description: 'Business ID' },
      },
    },
    execute: (args) => detect_low_stock(args.businessId || BUSINESS_ID),
  },

  calculate_reorder_quantity: {
    name: 'calculate_reorder_quantity',
    description: 'Calculates the mathematically optimized reorder quantity for a product, reducing orders for slow-moving items to preserve capital.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Target SKU or Product ID' },
        businessId: { type: 'string', description: 'Business ID' },
      },
      required: ['productId'],
    },
    execute: (args) => {
      if (!args.productId) throw new Error('Missing required parameter: productId');
      return calculate_reorder_quantity(args.productId, args.businessId || BUSINESS_ID);
    },
  },

  calculate_profit: {
    name: 'calculate_profit',
    description: 'Calculates revenue, total expenses, net profit, and profit margin for a single period.',
    parameters: {
      type: 'object',
      properties: {
        businessId: { type: 'string', description: 'Business ID' },
        period: { type: 'string', description: 'Period to analyze', enum: ['current', 'previous'] },
      },
    },
    execute: (args) => calculate_profit(args.businessId || BUSINESS_ID, args.period || 'current'),
  },

  get_sales: {
    name: 'get_sales',
    description: 'Retrieves sales transaction records and aggregates revenue.',
    parameters: {
      type: 'object',
      properties: {
        businessId: { type: 'string', description: 'Business ID' },
        period: { type: 'string', description: 'Period filter', enum: ['current', 'previous'] },
        productId: { type: 'string', description: 'Optional product filter' },
      },
    },
    execute: (args) => get_sales(args.businessId || BUSINESS_ID, args),
  },

  get_inventory: {
    name: 'get_inventory',
    description: 'Retrieves current stock levels, unit purchase/selling prices, and valuation.',
    parameters: {
      type: 'object',
      properties: {
        businessId: { type: 'string', description: 'Business ID' },
        category: { type: 'string', description: 'Category filter' },
      },
    },
    execute: (args) => get_inventory(args.businessId || BUSINESS_ID, args),
  },

  get_expenses: {
    name: 'get_expenses',
    description: 'Retrieves itemized expenses and sums total operational costs.',
    parameters: {
      type: 'object',
      properties: {
        businessId: { type: 'string', description: 'Business ID' },
        period: { type: 'string', description: 'Period filter', enum: ['current', 'previous'] },
      },
    },
    execute: (args) => get_expenses(args.businessId || BUSINESS_ID, args),
  },
};

/**
 * Tool Dispatcher: Executes requested deterministic tool with strict error handling
 */
export function dispatchToolCall(
  toolName: string,
  parameters: Record<string, any> = {}
): ToolExecutionOutput {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    return {
      toolName,
      parameters,
      executionTimestamp: timestamp,
      executionDurationMs: 0,
      success: false,
      error: `Unknown tool "${toolName}". Available tools: ${Object.keys(TOOL_REGISTRY).join(', ')}`,
    };
  }

  try {
    const result = tool.execute(parameters);
    const duration = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      toolName,
      parameters,
      executionTimestamp: timestamp,
      executionDurationMs: duration,
      success: true,
      result,
    };
  } catch (err: any) {
    const duration = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      toolName,
      parameters,
      executionTimestamp: timestamp,
      executionDurationMs: duration,
      success: false,
      error: err?.message || 'Tool execution failed',
    };
  }
}
