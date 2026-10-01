import { RecommendationEngine } from '../services/recommendationEngine';
import { db } from '../db/repository';
import { BUSINESS_ID } from '../db/seedData';
import { TestResult } from './businessData.test';

export function runApprovalUnitTests(): {
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

  const engine = new RecommendationEngine();

  // --- SUITE 1: CRITICAL INVARIANT: NO APPROVAL -> ACTION MUST NOT HAPPEN ---
  const initialPOCount = db.getPurchaseOrders(BUSINESS_ID).length;
  const initialApprovedPOCount = db.getPurchaseOrders(BUSINESS_ID).filter((p) => p.status === 'approved').length;

  // Step 1: AI analyzes business and generates recommendation
  const recommendation = engine.generateRecommendation(BUSINESS_ID);

  assert(
    'Approval Safety Invariant',
    'AI generates recommendation with status PENDING_APPROVAL',
    recommendation.status,
    'PENDING_APPROVAL'
  );

  // Step 2: VERIFY ACTION DID NOT HAPPEN IN DATABASE
  const postRecPOCount = db.getPurchaseOrders(BUSINESS_ID).length;
  const postRecApprovedCount = db.getPurchaseOrders(BUSINESS_ID).filter((p) => p.status === 'approved').length;

  assert(
    'Approval Safety Invariant',
    'CRITICAL: Without approval, NO Purchase Order is added to database',
    postRecPOCount,
    initialPOCount
  );

  assert(
    'Approval Safety Invariant',
    'CRITICAL: Without approval, approved PO count remains strictly 0',
    postRecApprovedCount,
    initialApprovedPOCount
  );

  // --- SUITE 2: USER APPROVES -> ACTION HAPPENS ---
  const approveResult = engine.approve(recommendation.id, 'Ravi (Store Owner)');

  assert(
    'Human Approval Execution',
    'Approve returns success=true',
    approveResult.success,
    true
  );

  assert(
    'Human Approval Execution',
    'Recommendation status transitions to APPROVED',
    approveResult.recommendation.status,
    'APPROVED'
  );

  assert(
    'Human Approval Execution',
    'Generated Purchase Order status is "approved"',
    approveResult.purchaseOrder.status,
    'approved'
  );

  assert(
    'Human Approval Execution',
    'Purchase Order is now committed into the database repository',
    db.getPurchaseOrders(BUSINESS_ID).some((po) => po.poNumber === approveResult.purchaseOrder.poNumber),
    true
  );

  assert(
    'Human Approval Execution',
    'Audit record logs humanDecision as APPROVED',
    approveResult.auditRecord.humanDecision,
    'APPROVED'
  );

  assert(
    'Human Approval Execution',
    'Audit record captures exact capital saved: ₹18,400',
    approveResult.auditRecord.details.capitalSaved,
    18400
  );

  // --- SUITE 3: USER REJECTS -> ACTION STRICTLY CANCELLED ---
  const rec2 = engine.generateRecommendation(BUSINESS_ID);
  const poCountBeforeReject = db.getPurchaseOrders(BUSINESS_ID).length;

  const rejectResult = engine.reject(
    rec2.id,
    'Ravi (Store Owner)',
    'Diwali festival coming; expect high rice turnover'
  );

  assert(
    'Human Rejection Workflow',
    'Reject returns rejected=true and success=true',
    rejectResult.success && rejectResult.rejected,
    true
  );

  assert(
    'Human Rejection Workflow',
    'Recommendation status transitions to REJECTED',
    rejectResult.recommendation.status,
    'REJECTED'
  );

  assert(
    'Human Rejection Workflow',
    'CRITICAL: NO Purchase Order was added to the database repository on rejection',
    db.getPurchaseOrders(BUSINESS_ID).length,
    poCountBeforeReject
  );

  assert(
    'Human Rejection Workflow',
    'Audit log captures rejection reason "Diwali festival coming; expect high rice turnover"',
    rejectResult.auditRecord.reasonOrNotes.includes('Diwali'),
    true
  );

  // --- SUITE 4: RECOMMENDATION SCHEMA & RELEVANT QUANTITIES ---
  assert(
    'Recommendation Schema',
    'Contains recommendedAction, reason, evidence, expectedEffect, relevantQuantities',
    Boolean(
      recommendation.recommendedAction &&
        recommendation.reason &&
        recommendation.evidence.length > 0 &&
        recommendation.expectedEffect &&
        recommendation.relevantQuantities
    ),
    true
  );

  assert(
    'Relevant Quantities',
    'Quantities specify reduction from 100 to 80 bags',
    recommendation.relevantQuantities.standardOrderQuantity === 100 &&
      recommendation.relevantQuantities.recommendedOrderQuantity === 80,
    true
  );

  assert(
    'Relevant Quantities',
    'Direct working capital saved equals ₹18,400',
    recommendation.relevantQuantities.estimatedCapitalSaved,
    18400
  );

  // --- SUITE 5: RE-RESOLUTION GUARD ---
  let duplicateApprovalBlocked = false;
  try {
    engine.approve(recommendation.id, 'Ravi');
  } catch (err: any) {
    duplicateApprovalBlocked = err.message.includes('ALREADY_RESOLVED');
  }
  assert(
    'Re-resolution Guard',
    'Prevents duplicate approval of already resolved recommendation',
    duplicateApprovalBlocked,
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
