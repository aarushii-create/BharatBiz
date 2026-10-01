import { identifyIntentAndPlan, orchestrate } from '../services/orchestrator';
import { TestResult } from './businessData.test';

export function runOrchestratorUnitTests(): {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];

  function assert(
    suite: string,
    name: string,
    actual: any,
    expected: any,
    comparator?: (a: any, b: any) => boolean
  ) {
    const passed = comparator
      ? comparator(actual, expected)
      : JSON.stringify(actual) === JSON.stringify(expected);

    results.push({
      suite,
      name,
      passed,
      expected,
      actual,
      error: passed ? undefined : `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
    });
  }

  // --- SUITE 1: INTENT IDENTIFICATION & TOOL SELECTION ---
  const q1 = identifyIntentAndPlan('Why did my profit fall?', 'en');
  assert(
    'Intent & Tool Selection',
    'English "Why did my profit fall?" maps to profit_decline_analysis',
    q1.intent,
    'profit_decline_analysis'
  );
  assert(
    'Intent & Tool Selection',
    'Calls calculate_profit_change, analyze_expense_change, and detect_slow_moving_products',
    q1.plannedToolCalls.map((t) => t.toolName),
    ['calculate_profit_change', 'analyze_expense_change', 'detect_slow_moving_products']
  );

  const q2 = identifyIntentAndPlan('என்னோட profit ஏன் குறைந்திருக்கு?', 'ta');
  assert(
    'Intent & Tool Selection',
    'Tamil "என்னோட profit ஏன் குறைந்திருக்கு?" maps to profit_decline_analysis',
    q2.intent,
    'profit_decline_analysis'
  );

  const q3 = identifyIntentAndPlan('दुकान में कौन सा सामान सबसे धीमे बिक रहा है?', 'hi');
  assert(
    'Intent & Tool Selection',
    'Hindi "सामान धीमे बिक रहा है" maps to slow_moving_products_analysis',
    q3.intent,
    'slow_moving_products_analysis'
  );
  assert(
    'Intent & Tool Selection',
    'Calls detect_slow_moving_products and get_inventory',
    q3.plannedToolCalls.map((t) => t.toolName),
    ['detect_slow_moving_products', 'get_inventory']
  );

  const q4 = identifyIntentAndPlan('Which products are running out of stock?', 'en');
  assert(
    'Intent & Tool Selection',
    'English "running out of stock" maps to low_stock_analysis',
    q4.intent,
    'low_stock_analysis'
  );
  assert(
    'Intent & Tool Selection',
    'Calls detect_low_stock and get_inventory',
    q4.plannedToolCalls.map((t) => t.toolName),
    ['detect_low_stock', 'get_inventory']
  );

  const q5 = identifyIntentAndPlan('दुकान का खर्च कहाँ बढ़ गया?', 'hi');
  assert(
    'Intent & Tool Selection',
    'Hindi "दुकान का खर्च कहाँ बढ़ गया" maps to expense_surge_analysis',
    q5.intent,
    'expense_surge_analysis'
  );

  const q6 = identifyIntentAndPlan('What inventory should I reorder?', 'en');
  assert(
    'Intent & Tool Selection',
    'English "What should I reorder" maps to reorder_recommendation',
    q6.intent,
    'reorder_recommendation'
  );

  const q7 = identifyIntentAndPlan('What is the weather forecast for Chennai tomorrow?', 'en');
  assert(
    'Intent & Tool Selection',
    'Out of domain query maps to unsupported_query with 0 tools planned',
    q7.intent,
    'unsupported_query'
  );
  assert(
    'Intent & Tool Selection',
    'Zero deterministic tools planned for unsupported question',
    q7.plannedToolCalls.length,
    0
  );

  // --- SUITE 2: STRUCTURED ORCHESTRATION PIPELINE ---
  const resProfit = orchestrate('Why did my profit fall?', 'en');
  assert(
    'Structured Execution',
    'All planned tools execute successfully',
    resProfit.toolCallsExecuted.every((t) => t.success),
    true
  );

  assert(
    'Structured Execution',
    'Deterministic profit delta matches exactly -₹8,420 (no fabricated math)',
    resProfit.deterministicSummary.profitDelta,
    -8420
  );

  assert(
    'Structured Execution',
    'Primary slow moving SKU identified as Ponni Boiled Rice (25kg)',
    resProfit.deterministicSummary.primarySlowMovingSku,
    'Ponni Boiled Rice (25kg)'
  );

  assert(
    'Structured Execution',
    'Velocity drop percent matches 40%',
    resProfit.deterministicSummary.velocityDropPercent,
    40
  );

  assert(
    'Structured Execution',
    'Explanation is grounded in exact figures: ₹8,420, ₹15,500, ₹3,200',
    resProfit.explanation.includes('8,420') &&
      resProfit.explanation.includes('15,500') &&
      resProfit.explanation.includes('3,200'),
    true
  );

  assert(
    'Structured Execution',
    'Generates proposed Purchase Order action with approval gate required',
    resProfit.proposedAction?.actionType === 'GENERATE_PURCHASE_ORDER' &&
      resProfit.proposedAction.requiresApproval === true,
    true
  );

  assert(
    'Structured Execution',
    'Proposed PO adjusts quantity from standard 100 to 80 bags, saving ₹18,400',
    resProfit.proposedAction?.payload.approvedOrderQuantity === 80 &&
      resProfit.proposedAction.payload.estimatedCapitalSaved === 18400,
    true
  );

  // --- SUITE 3: MULTILINGUAL VERIFICATION ---
  const resHindi = orchestrate('मेरा मुनाफ़ा (profit) क्यों कम हुआ?', 'hi');
  assert(
    'Multilingual Grounding',
    'Hindi response is grounded with exact -₹8,420 and ₹15,500 without translation hallucinations',
    resHindi.explanation.includes('8,420') && resHindi.explanation.includes('15,500'),
    true
  );

  const resTamil = orchestrate('என்னோட profit ஏன் குறைந்திருக்கு?', 'ta');
  assert(
    'Multilingual Grounding',
    'Tamil response is grounded with exact -₹8,420 and ₹15,500 without translation hallucinations',
    resTamil.explanation.includes('8,420') && resTamil.explanation.includes('15,500'),
    true
  );

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    results,
  };
}
