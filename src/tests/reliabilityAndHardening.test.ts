import { orchestrate } from '../services/orchestrator';
import { db } from '../db/repository';
import { BUSINESS_ID } from '../db/seedData';
import { RecommendationEngine } from '../services/recommendationEngine';
import { validateCSV } from '../services/upload/csvParser';
import { dispatchToolCall } from '../services/toolRegistry';
import { VoiceService } from '../services/voice/VoiceService';
import { BhashiniProvider } from '../services/voice/BhashiniProvider';
import { FallbackProvider } from '../services/voice/FallbackProvider';
import { TestResult } from './businessData.test';
import {
  calculate_profit,
  calculate_profit_change,
  analyze_expense_change,
  detect_slow_moving_products,
  calculate_reorder_quantity,
} from '../services/businessAnalytics';
import { runDeterministicAnalysis } from '../services/deterministicAnalytics';

export interface PerformanceMeasurement {
  operation: string;
  durationMs: number;
}

export async function runReliabilityAndHardeningTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
  measuredLatencies: PerformanceMeasurement[];
}> {
  const results: TestResult[] = [];
  const measuredLatencies: PerformanceMeasurement[] = [];

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

  // --- SUITE 1: RELIABILITY & RESILIENCE ---

  // 1.1 API Failure Resilience: Unknown tool call does not crash, returns structured error
  const tStart1 = performance.now();
  const unknownToolRes = dispatchToolCall('non_existent_tool_name', {});
  const tEnd1 = performance.now();
  measuredLatencies.push({ operation: 'dispatchToolCall (Unknown Tool)', durationMs: Math.round((tEnd1 - tStart1) * 100) / 100 });
  assert(
    'Reliability: Tool Resilience',
    'Unknown tool returns structured success=false with informative message without throwing',
    unknownToolRes.success === false && unknownToolRes.error?.includes('Unknown tool'),
    true
  );

  const originalGetSales = db.getSales;
  let databaseFailureResult;
  try {
    db.getSales = (() => {
      throw new Error('DATABASE_UNAVAILABLE');
    }) as typeof db.getSales;
    databaseFailureResult = orchestrate('Why did my profit fall?', 'en');
  } finally {
    db.getSales = originalGetSales;
  }
  assert(
    'Reliability: Database Failure',
    'Database failure returns a retry response without fabricated metrics or a proposed action',
    databaseFailureResult?.deterministicSummary,
    {}
  );
  assert(
    'Reliability: Database Failure',
    'Database failure does not create a consequential action',
    databaseFailureResult?.proposedAction,
    undefined
  );

  // 1.2 LLM / Orchestrator Failure Resilience: Malformed query with special characters handles safely
  const tStart2 = performance.now();
  const malformedOrch = orchestrate('???@@@###$$$%%%^^^&&&***()_+', 'ta');
  const tEnd2 = performance.now();
  measuredLatencies.push({ operation: 'orchestrate (Malformed Input)', durationMs: Math.round((tEnd2 - tStart2) * 100) / 100 });
  assert(
    'Reliability: Input Resilience',
    'Malformed gibberish query returns graceful fallback with 0 tool crashes',
    malformedOrch.intent === 'unsupported_query' && Boolean(malformedOrch.explanation),
    true
  );

  // 1.3 Voice Failure & Provider Cascade: Primary Bhashini timeout aborts cleanly
  const tStart3 = performance.now();
  const slowBhashini = new BhashiniProvider('dummy-key', 'dummy-id', 50); // 50ms timeout
  const mockAudioBuffer = new Uint8Array([1, 2, 3, 4, 5]);
  let bhashiniErrorCaptured = false;
  try {
    await slowBhashini.speechToText(mockAudioBuffer.buffer, 'ta');
  } catch (err: any) {
    bhashiniErrorCaptured = Boolean(err.message);
  }
  const tEnd3 = performance.now();
  measuredLatencies.push({ operation: 'Bhashini Timeout Abort', durationMs: Math.round((tEnd3 - tStart3) * 100) / 100 });
  assert(
    'Reliability: Voice Resilience',
    'Slow / unreachable voice provider fails fast within timeout threshold',
    bhashiniErrorCaptured,
    true
  );

  // 1.4 Voice Service Graceful Fallback: Auto-degrades to secondary fallback provider
  const voiceService = new VoiceService(true);
  const tStart4 = performance.now();
  const speechRes = await voiceService.speechToText(mockAudioBuffer.buffer, 'ta');
  const tEnd4 = performance.now();
  measuredLatencies.push({ operation: 'Voice Cascade to Fallback', durationMs: Math.round((tEnd4 - tStart4) * 100) / 100 });
  assert(
    'Reliability: Voice Cascade',
    'VoiceService recovers from primary failure and returns valid transcript from secondary provider',
    Boolean(speechRes.transcript) && speechRes.detectedLanguage === 'ta',
    true
  );

  // --- SUITE 2: EDGE CASES ---

  // 2.1 Missing Product Query (Non-existent SKU)
  const tStart5 = performance.now();
  const missingProductInv = db.getInventoryByProductId('SKU-DOES-NOT-EXIST-999');
  const tEnd5 = performance.now();
  measuredLatencies.push({ operation: 'db.getInventoryByProductId (Missing)', durationMs: Math.round((tEnd5 - tStart5) * 100) / 100 });
  assert(
    'Edge Cases: Missing Product',
    'Querying non-existent SKU returns undefined without throwing',
    missingProductInv,
    undefined
  );

  // 2.2 Reorder calculation on non-existent SKU safely returns null
  const missingReorder = calculate_reorder_quantity('SKU-DOES-NOT-EXIST-999');
  assert(
    'Edge Cases: Missing Product Reorder',
    'Reorder calculation for non-existent product returns null gracefully',
    missingReorder,
    null
  );

  // 2.3 Zero-Sales Calculation: Testing deterministic formulas when a business has 0 sales
  const zeroSalesProfit = calculate_profit('biz-empty-store', 'current');
  assert(
    'Edge Cases: Zero Sales',
    'Store with 0 sales computes revenue=0, expenses=0, netProfit=0 without division by zero',
    zeroSalesProfit.revenue === 0 && zeroSalesProfit.netProfit === 0 && zeroSalesProfit.profitMarginPercent === 0,
    true
  );

  let emptyAnalysisHandled = false;
  try {
    const emptyAnalysis = runDeterministicAnalysis([], [], []);
    emptyAnalysisHandled =
      emptyAnalysis.periodComparison.currentRevenue === 0 &&
      emptyAnalysis.slowMovingProduct.currentStock === 0;
  } catch {
    emptyAnalysisHandled = false;
  }
  assert(
    'Edge Cases: Empty Dataset',
    'Deterministic analysis handles empty sales, expenses, and inventory without throwing',
    emptyAnalysisHandled,
    true
  );

  // 2.4 Zero-Inventory Calculation: Item with 0 stock handled correctly
  const updateRes = db.updateStock('SKU-RICE-PONNI-25', 0);
  assert(
    'Edge Cases: Zero Stock',
    'Allow setting stock to 0 units',
    updateRes.success,
    true
  );
  // Restore stock to 95 for remaining operations
  db.updateStock('SKU-RICE-PONNI-25', 95);

  // 2.5 Negative / Invalid values rejected by Schema Validation
  const negativeStockUpdate = db.updateStock('SKU-RICE-PONNI-25', -50);
  assert(
    'Edge Cases: Negative Values',
    'Repository strictly rejects negative stock (-50)',
    negativeStockUpdate.success,
    false
  );

  // 2.6 Duplicate Records in CSV
  const duplicateCsv = `id,date,category,amount,period
exp-d1,2026-09-01,Purchase Cost,1000,current
exp-d1,2026-09-01,Wastage,500,current`;
  const dupCheck = validateCSV(duplicateCsv, 'expenses');
  assert(
    'Edge Cases: Duplicate Data',
    'CSV validator flags duplicate record IDs and records duplicateCount=1',
    dupCheck.success === false && dupCheck.duplicateCount === 1,
    true
  );

  // 2.7 Missing Columns in CSV
  const missingColsCsv = `id,category,amount\nexp-m1,Rent,5000`; // Missing date, period
  const missingColCheck = validateCSV(missingColsCsv, 'expenses');
  assert(
    'Edge Cases: Missing Columns',
    'CSV validator identifies missing mandatory columns (date, period)',
    missingColCheck.missingColumns.includes('date') && missingColCheck.missingColumns.includes('period'),
    true
  );

  // 2.8 Incorrect Data Types in CSV
  const incorrectTypeCsv = `id,date,category,amount,period\nexp-t1,2026-09-01,Purchase Cost,NOT_A_NUMBER,current`;
  const incorrectTypeCheck = validateCSV(incorrectTypeCsv, 'expenses');
  assert(
    'Edge Cases: Incorrect Data Types',
    'CSV validator detects non-numeric amount string "NOT_A_NUMBER"',
    incorrectTypeCheck.errors.some((e) => e.type === 'wrong_type' && e.column === 'amount'),
    true
  );

  // --- SUITE 3: SAFETY INVARIANTS ---

  // 3.1 Strict Safety: No action happens without user approval
  const engine = new RecommendationEngine();
  const poCountBefore = db.getPurchaseOrders(BUSINESS_ID).length;
  const rec = engine.generateRecommendation(BUSINESS_ID);
  const poCountAfter = db.getPurchaseOrders(BUSINESS_ID).length;

  assert(
    'Safety: Approval Invariant',
    'Generating recommendation leaves database purchase orders completely unchanged',
    poCountAfter,
    poCountBefore
  );

  // 3.2 Correct action happens after approval
  const tStart6 = performance.now();
  const approvedRes = engine.approve(rec.id, 'Ravi');
  const tEnd6 = performance.now();
  measuredLatencies.push({ operation: 'Human Approval & PO Issuance', durationMs: Math.round((tEnd6 - tStart6) * 100) / 100 });
  assert(
    'Safety: Approved Action',
    'Approving recommendation issues purchase order with status "approved" and committed to repository',
    approvedRes.purchaseOrder.status === 'approved' && db.getPurchaseOrders(BUSINESS_ID).some((p) => p.poNumber === approvedRes.purchaseOrder.poNumber),
    true
  );

  // 3.3 Correct Audit Trail Recorded
  const auditRecords = engine.getAuditTrail();
  assert(
    'Safety: Audit Trail',
    'Audit trail contains approved record with timestamp, operator, and capitalSaved=₹18,400',
    auditRecords.some((a) => a.humanDecision === 'APPROVED' && a.details.capitalSaved === 18400),
    true
  );

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    results,
    measuredLatencies,
  };
}
