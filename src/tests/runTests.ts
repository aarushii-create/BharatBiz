import { runAllUnitTests as runDataLayerTests } from './businessData.test';
import { runOrchestratorUnitTests } from './orchestrator.test';
import { runEvidenceUnitTests } from './evidence.test';
import { runVoiceUnitTests } from './voice.test';
import { runUploadUnitTests } from './upload.test';
import { runApprovalUnitTests } from './approval.test';
import { runReliabilityAndHardeningTests } from './reliabilityAndHardening.test';
import { runProductFlowTests, validatePurchaseCsvFixture } from './productFlow.test';

async function main() {
  const overallStartTime = performance.now();

  console.log('=====================================================');
  console.log('  BHARATBIZ AI — SYSTEM VERIFICATION SUITE');
  console.log('  Phase 2: Business Data Layer (Deterministic Truth)');
  console.log('  Phase 3: AI Orchestrator & Tool Calling (Intent/Tools)');
  console.log('  Phase 4: Evidence Engine & Causal Traceability (Lineage)');
  console.log('  Phase 5: Multilingual Voice System (Tamil / Fallback)');
  console.log('  Phase 6: Data Upload & Multimodal Input (CSV / OCR)');
  console.log('  Phase 7: Recommendation, Approval & Action Engine (Safety)');
  console.log('  Phase 9: Reliability, Hardening & Edge Cases (Robustness)');
  console.log('=====================================================\n');

  // 1. Run Data Layer Tests
  console.log('--- SECTION 1: BUSINESS DATA LAYER TESTS ---');
  const dataLayerSuite = runDataLayerTests();

  let currentSuite = '';
  for (const test of dataLayerSuite.results) {
    if (test.suite !== currentSuite) {
      currentSuite = test.suite;
      console.log(`\n📦 ${currentSuite.toUpperCase()}`);
    }
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}: ${test.name}`);
    if (!test.passed) {
      console.log(`     Error: ${test.error}`);
    }
  }

  // 2. Run Orchestrator & Tool Calling Tests
  console.log('\n\n--- SECTION 2: AI ORCHESTRATOR & TOOL CALLING TESTS ---');
  const orchestratorSuite = runOrchestratorUnitTests();

  currentSuite = '';
  for (const test of orchestratorSuite.results) {
    if (test.suite !== currentSuite) {
      currentSuite = test.suite;
      console.log(`\n🤖 ${currentSuite.toUpperCase()}`);
    }
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}: ${test.name}`);
    if (!test.passed) {
      console.log(`     Error: ${test.error}`);
    }
  }

  // 3. Run Evidence Engine Tests
  console.log('\n\n--- SECTION 3: EVIDENCE ENGINE & TRACEABILITY TESTS ---');
  const evidenceSuite = runEvidenceUnitTests();

  currentSuite = '';
  for (const test of evidenceSuite.results) {
    if (test.suite !== currentSuite) {
      currentSuite = test.suite;
      console.log(`\n🔍 ${currentSuite.toUpperCase()}`);
    }
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}: ${test.name}`);
    if (!test.passed) {
      console.log(`     Error: ${test.error}`);
    }
  }

  // 4. Run Multilingual Voice System Tests
  console.log('\n\n--- SECTION 4: MULTILINGUAL VOICE SYSTEM TESTS ---');
  const voiceSuite = await runVoiceUnitTests();

  currentSuite = '';
  for (const test of voiceSuite.results) {
    if (test.suite !== currentSuite) {
      currentSuite = test.suite;
      console.log(`\n🎙️ ${currentSuite.toUpperCase()}`);
    }
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}: ${test.name}`);
    if (!test.passed) {
      console.log(`     Error: ${test.error}`);
    }
  }

  // 5. Run Data Upload & Multimodal OCR Tests
  console.log('\n\n--- SECTION 5: DATA UPLOAD & MULTIMODAL INPUT TESTS ---');
  const uploadSuite = await runUploadUnitTests();

  currentSuite = '';
  for (const test of uploadSuite.results) {
    if (test.suite !== currentSuite) {
      currentSuite = test.suite;
      console.log(`\n📂 ${currentSuite.toUpperCase()}`);
    }
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}: ${test.name}`);
    if (!test.passed) {
      console.log(`     Error: ${test.error}`);
    }
  }

  // 6. Run Recommendation & Approval Engine Tests
  console.log('\n\n--- SECTION 6: RECOMMENDATION & APPROVAL TESTS ---');
  const approvalSuite = runApprovalUnitTests();

  currentSuite = '';
  for (const test of approvalSuite.results) {
    if (test.suite !== currentSuite) {
      currentSuite = test.suite;
      console.log(`\n⚖️ ${currentSuite.toUpperCase()}`);
    }
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}: ${test.name}`);
    if (!test.passed) {
      console.log(`     Error: ${test.error}`);
    }
  }

  // 7. Run Phase 9: Reliability, Hardening & Edge Cases
  console.log('\n\n--- SECTION 7: RELIABILITY, HARDENING & MEASURED METRICS ---');
  const reliabilitySuite = await runReliabilityAndHardeningTests();

  currentSuite = '';
  for (const test of reliabilitySuite.results) {
    if (test.suite !== currentSuite) {
      currentSuite = test.suite;
      console.log(`\n🛡️ ${currentSuite.toUpperCase()}`);
    }
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}: ${test.name}`);
    if (!test.passed) {
      console.log(`     Error: ${test.error}`);
    }
  }

  console.log('\n\n--- SECTION 8: PRODUCT FLOW INTEGRATION TESTS ---');
  const productSuite = await runProductFlowTests();
  const purchaseFixture = validatePurchaseCsvFixture();
  productSuite.results.push({ suite: 'Product Data Import', name: 'Purchase CSV validates with real schema', actual: purchaseFixture.validRows.length, expected: 1, passed: purchaseFixture.success && purchaseFixture.validRows.length === 1, error: purchaseFixture.success ? undefined : purchaseFixture.errors.map((error) => error.message).join('; ') });
  productSuite.total += 1;
  if (purchaseFixture.success && purchaseFixture.validRows.length === 1) productSuite.passed += 1;
  else productSuite.failed += 1;
  currentSuite = '';
  for (const test of productSuite.results) {
    if (test.suite !== currentSuite) { currentSuite = test.suite; console.log(`\n🔐 ${currentSuite.toUpperCase()}`); }
    const symbol = test.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${symbol}: ${test.name}`);
    if (!test.passed) console.log(`     Error: ${test.error}`);
  }

  const overallEndTime = performance.now();
  const overallDuration = Math.round((overallEndTime - overallStartTime) * 100) / 100;

  console.log('\n\n--- MEASURED REAL-TIME SYSTEM PERFORMANCE ---');
  console.log(`⏱️ Total Test Suite Execution Duration: ${overallDuration} ms`);
  console.log('⏱️ Measured Operation Latencies:');
  for (const m of reliabilitySuite.measuredLatencies) {
    console.log(`   • ${m.operation}: ${m.durationMs} ms`);
  }

  console.log('\n--- UNMEASURED ATTRIBUTES (EXPLICIT NOTICE) ---');
  console.log('• User Network Bandwidth: Not measured');
  console.log('• Long-term hardware storage degradation: Not measured');
  console.log('• Subjective voice naturalness score: Not measured (simulated/standard TTS APIs used)');

  const grandTotal =
    dataLayerSuite.total +
    orchestratorSuite.total +
    evidenceSuite.total +
    voiceSuite.total +
    uploadSuite.total +
    approvalSuite.total +
    reliabilitySuite.total +
    productSuite.total;
  const grandPassed =
    dataLayerSuite.passed +
    orchestratorSuite.passed +
    evidenceSuite.passed +
    voiceSuite.passed +
    uploadSuite.passed +
    approvalSuite.passed +
    reliabilitySuite.passed +
    productSuite.passed;
  const grandFailed =
    dataLayerSuite.failed +
    orchestratorSuite.failed +
    evidenceSuite.failed +
    voiceSuite.failed +
    uploadSuite.failed +
    approvalSuite.failed +
    reliabilitySuite.failed +
    productSuite.failed;

  console.log('\n=====================================================');
  console.log(`GRAND SUMMARY: ${grandPassed}/${grandTotal} tests passed (${grandFailed} failed)`);
  console.log('=====================================================');

  if (grandFailed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 100% of tests passed! Multi-phase deterministic safety architecture verified.\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
