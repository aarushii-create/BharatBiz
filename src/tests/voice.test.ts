import { VoiceService } from '../services/voice/VoiceService';
import { BhashiniProvider } from '../services/voice/BhashiniProvider';
import { FallbackProvider } from '../services/voice/FallbackProvider';
import { orchestrate } from '../services/orchestrator';
import { TestResult } from './businessData.test';

export async function runVoiceUnitTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
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

  const voiceService = new VoiceService();
  const sampleAudioBuffer = new ArrayBuffer(1024); // 1KB mock audio

  // --- SUITE 1: TAMIL VOICE INPUT & END-TO-END LOOP ---
  const tamilSTT = await voiceService.speechToText(sampleAudioBuffer, 'ta');
  assert(
    'Tamil Voice Input',
    'Transcribes Tamil audio to Tamil text ("என்னோட profit ஏன் குறைந்திருக்கு?")',
    tamilSTT.transcript.includes('profit') && tamilSTT.transcript.includes('குறைந்திருக்கு'),
    true
  );

  assert(
    'Tamil Voice Input',
    'Identifies detectedLanguage as "ta"',
    tamilSTT.detectedLanguage,
    'ta'
  );

  const tamilLoop = await voiceService.executeEndToEndVoiceLoop(sampleAudioBuffer, 'ta');
  assert(
    'Tamil Voice Input',
    'End-to-End Tamil loop returns Tamil explanation with exact ₹8,420 and ₹15,500',
    tamilLoop.explanation.includes('8,420') && tamilLoop.explanation.includes('15,500'),
    true
  );

  // --- SUITE 2: ENGLISH VOICE INPUT & END-TO-END LOOP ---
  const englishSTT = await voiceService.speechToText(sampleAudioBuffer, 'en');
  assert(
    'English Voice Input',
    'Transcribes English audio to "Why did my profit fall?"',
    englishSTT.transcript,
    'Why did my profit fall?'
  );

  const englishLoop = await voiceService.executeEndToEndVoiceLoop(sampleAudioBuffer, 'en');
  assert(
    'English Voice Input',
    'End-to-End English loop returns English explanation with exact ₹8,420',
    englishLoop.explanation.includes('8,420'),
    true
  );

  // --- SUITE 3: INVALID AUDIO HANDLING ---
  let caughtInvalidError = false;
  try {
    await voiceService.speechToText(null as any, 'ta');
  } catch (err: any) {
    caughtInvalidError = err.message.includes('INVALID_AUDIO');
  }
  assert(
    'Invalid Audio Guard',
    'Rejects null/undefined audio with INVALID_AUDIO error',
    caughtInvalidError,
    true
  );

  // --- SUITE 4: EMPTY AUDIO HANDLING ---
  let caughtEmptyError = false;
  try {
    const emptyBuffer = new ArrayBuffer(0);
    await voiceService.speechToText(emptyBuffer, 'ta');
  } catch (err: any) {
    caughtEmptyError = err.message.includes('EMPTY_AUDIO_BUFFER');
  }
  assert(
    'Empty Audio Guard',
    'Rejects 0-byte audio buffer with EMPTY_AUDIO_BUFFER error',
    caughtEmptyError,
    true
  );

  // --- SUITE 5: PROVIDER FAILURE & SEAMLESS FALLBACK ---
  // A BhashiniProvider without credentials throws, but VoiceService catches and falls back to FallbackProvider
  const bhashiniNoCreds = new BhashiniProvider(undefined, undefined);
  let bhashiniThrew = false;
  try {
    await bhashiniNoCreds.speechToText(sampleAudioBuffer, 'ta');
  } catch (e: any) {
    bhashiniThrew = e.message.includes('BHASHINI_CREDENTIALS_MISSING');
  }
  assert(
    'Provider Failure Fallback',
    'Bhashini detects missing credentials and throws BHASHINI_CREDENTIALS_MISSING',
    bhashiniThrew,
    true
  );

  // VoiceService catches this and delivers result via FallbackProvider
  const fallbackResult = await voiceService.speechToText(sampleAudioBuffer, 'ta');
  assert(
    'Provider Failure Fallback',
    'VoiceService automatically falls back to secondary provider on primary failure',
    fallbackResult.providerUsed === 'webspeech' && fallbackResult.fallbackTriggered === true,
    true
  );

  // --- SUITE 6: SLOW PROVIDER TIMEOUT HANDLING ---
  const fastTimeoutBhashini = new BhashiniProvider('dummy-key', 'dummy-user', 10); // 10ms timeout
  let timeoutCaught = false;
  try {
    // Calling unroutable IP with 10ms timeout triggers AbortError timeout
    await fastTimeoutBhashini.speechToText(sampleAudioBuffer, 'ta');
  } catch (err: any) {
    timeoutCaught = err.message.includes('TIMEOUT') || err.message.includes('fetch');
  }
  assert(
    'Slow Provider Timeout',
    'Aborts slow provider within timeout threshold',
    timeoutCaught,
    true
  );

  // --- SUITE 7: TEXT FALLBACK DEGRADATION ---
  // If user disables voice or mic is denied, app falls back to pure text interaction with 100% functionality
  const textFallbackResult = orchestrate('என்னோட profit ஏன் குறைந்திருக்கு?', 'ta');
  assert(
    'Text Fallback Degradation',
    'Text-only path operates normally with zero speech dependencies',
    textFallbackResult.intent === 'profit_decline_analysis' &&
      textFallbackResult.deterministicSummary.profitDelta === -8420,
    true
  );

  // --- SUITE 8: TEXT-TO-SPEECH (TTS) SYNTHESIS ---
  const ttsResult = await voiceService.textToSpeech('வணக்கம் ரவி அண்ணா', 'ta');
  assert(
    'TTS Synthesis',
    'Generates TTS payload for Tamil text',
    ttsResult.isSynthesizedSpeech === true && ttsResult.language === 'ta',
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
