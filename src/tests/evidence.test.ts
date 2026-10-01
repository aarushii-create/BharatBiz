import { generateEvidenceGraph, verifyEvidenceGraphIntegrity } from '../services/evidenceEngine';
import { TestResult } from './businessData.test';
import { BUSINESS_ID } from '../db/seedData';

export function runEvidenceUnitTests(): {
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

  const graph = generateEvidenceGraph(BUSINESS_ID);
  const integrity = verifyEvidenceGraphIntegrity(graph);

  // --- SUITE 1: EVIDENCE SCHEMA INTEGRITY ---
  assert(
    'Evidence Schema & Structure',
    'Graph contains all 7 core causal nodes',
    graph.nodes.length,
    7
  );

  assert(
    'Evidence Schema & Structure',
    'Integrity verification passes with zero missing fields',
    integrity.valid,
    true
  );

  assert(
    'Evidence Schema & Structure',
    'Every node has metric, value, change, source, calculation, relationshipToConclusion',
    graph.nodes.every(
      (n) =>
        n.metric &&
        n.value &&
        n.change &&
        n.source &&
        n.calculation &&
        n.relationshipToConclusion
    ),
    true
  );

  // --- SUITE 2: DETERMINISTIC TRUTH VERIFICATION ---
  const revenueNode = graph.nodes.find((n) => n.id === 'ev-revenue');
  assert(
    'Deterministic Source Truth',
    'Revenue node originates from Table: sales and equals ₹1,42,800',
    revenueNode?.source.includes('Table: sales') && revenueNode?.numericValue === 142800,
    true
  );

  const purchaseNode = graph.nodes.find((n) => n.id === 'ev-purchase');
  assert(
    'Deterministic Source Truth',
    'Purchase Cost node originates from Table: expenses with delta +₹15,500',
    purchaseNode?.source.includes('Table: expenses') && purchaseNode?.change.includes('15,500'),
    true
  );

  const wastageNode = graph.nodes.find((n) => n.id === 'ev-wastage');
  assert(
    'Deterministic Source Truth',
    'Wastage node originates from Table: expenses with delta +₹3,200',
    wastageNode?.source.includes('Table: expenses') && wastageNode?.change.includes('3,200'),
    true
  );

  const deliveryNode = graph.nodes.find((n) => n.id === 'ev-delivery');
  assert(
    'Deterministic Source Truth',
    'Delivery node originates from Table: expenses with delta +₹1,720',
    deliveryNode?.source.includes('Table: expenses') && deliveryNode?.change.includes('1,720'),
    true
  );

  const profitNode = graph.nodes.find((n) => n.id === 'ev-profit');
  assert(
    'Deterministic Source Truth',
    'Profit node captures exact deterministic delta -₹8,420',
    profitNode?.numericValue,
    -8420
  );

  const skuNode = graph.nodes.find((n) => n.id === 'ev-sku-slow');
  assert(
    'Deterministic Source Truth',
    'Slow-moving SKU node captures 40% velocity drop from Table: inventory',
    skuNode?.source.includes('Table: inventory') && skuNode?.numericValue === 40,
    true
  );

  const recommendationNode = graph.nodes.find((n) => n.id === 'ev-recommendation');
  assert(
    'Deterministic Source Truth',
    'Recommendation node captures 80 bags order saving ₹18,400',
    recommendationNode?.value.includes('80 Bags') && recommendationNode?.numericValue === 18400,
    true
  );

  // --- SUITE 3: BACKWARD TRACEABILITY TO RAW LEDGER ---
  assert(
    'Backward Traceability',
    'Recommendation traces backward to Root Cause SKU',
    graph.backwardTracePath[0] === 'ev-recommendation' && graph.backwardTracePath[1] === 'ev-sku-slow',
    true
  );

  assert(
    'Backward Traceability',
    'Root Cause SKU traces backward to Net Profit Impact',
    graph.backwardTracePath[2] === 'ev-profit',
    true
  );

  assert(
    'Backward Traceability',
    'Net Profit Impact traces backward to Expense Ledger surges',
    graph.backwardTracePath.includes('ev-purchase') &&
      graph.backwardTracePath.includes('ev-wastage') &&
      graph.backwardTracePath.includes('ev-delivery'),
    true
  );

  // --- SUITE 4: CAUSAL GRAPH EDGES ---
  assert(
    'Causal Graph Connectivity',
    'All edges reference valid node IDs',
    graph.edges.every(
      (e) =>
        graph.nodes.some((n) => n.id === e.fromNodeId) &&
        graph.nodes.some((n) => n.id === e.toNodeId)
    ),
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
