import { ISpeechProvider, STTResult, TTSResult, VoiceProviderType } from '../../types/voice';
import { SupportedLanguage } from '../../types';
import { BhashiniProvider } from './BhashiniProvider';
import { FallbackProvider } from './FallbackProvider';
import { orchestrate } from '../orchestrator';

export interface VoiceLoopResult {
  transcript: string;
  detectedLanguage: SupportedLanguage;
  sttProvider: VoiceProviderType;
  sttFallbackTriggered: boolean;
  explanation: string;
  recommendation: string;
  ttsResult?: TTSResult;
  proposedAction?: any;
  error?: string;
}

export class VoiceService {
  private primaryProvider: ISpeechProvider;
  private fallbackProvider: ISpeechProvider;
  private preferBhashini: boolean;

  constructor(preferBhashini = true) {
    this.primaryProvider = new BhashiniProvider();
    this.fallbackProvider = new FallbackProvider();
    this.preferBhashini = preferBhashini;
  }

  public async getActiveProvider(): Promise<VoiceProviderType> {
    if (this.preferBhashini && (await this.primaryProvider.isAvailable())) {
      return 'bhashini';
    }
    return 'webspeech';
  }

  /**
   * Transcribe Audio with Automatic Provider Cascade
   * 1. Try Bhashini (Preferred Indian Language Provider)
   * 2. If failure/timeout/no-credentials, fallback to FallbackProvider
   * 3. If invalid/empty audio, throw descriptive error so UI triggers Text Fallback
   */
  public async speechToText(
    audioBlob: Blob | ArrayBuffer,
    language: SupportedLanguage = 'ta'
  ): Promise<STTResult> {
    if (!audioBlob) {
      throw new Error('INVALID_AUDIO: No audio buffer provided');
    }

    const byteLength = audioBlob instanceof Blob ? audioBlob.size : audioBlob.byteLength;
    if (byteLength === 0) {
      throw new Error('EMPTY_AUDIO_BUFFER: Audio input is 0 bytes');
    }

    // Attempt 1: Bhashini
    if (this.preferBhashini && (await this.primaryProvider.isAvailable())) {
      try {
        const res = await this.primaryProvider.speechToText(audioBlob, language);
        if (res.transcript && res.transcript.trim()) {
          return res;
        }
      } catch (err: any) {
        console.warn('Bhashini STT failed or timed out, falling back to WebSpeech:', err.message);
      }
    }

    // Attempt 2: Fallback Provider
    try {
      const res = await this.fallbackProvider.speechToText(audioBlob, language);
      return res;
    } catch (err: any) {
      throw new Error(`ALL_VOICE_PROVIDERS_FAILED: ${err?.message || 'Speech recognition unavailable'}`);
    }
  }

  /**
   * Text To Speech with Automatic Provider Cascade
   */
  public async textToSpeech(
    text: string,
    language: SupportedLanguage = 'ta'
  ): Promise<TTSResult> {
    if (!text || !text.trim()) {
      throw new Error('EMPTY_TEXT_INPUT: Cannot synthesize empty text');
    }

    // Attempt 1: Bhashini
    if (this.preferBhashini && (await this.primaryProvider.isAvailable())) {
      try {
        const res = await this.primaryProvider.textToSpeech(text, language);
        if (res.isSynthesizedSpeech) {
          return res;
        }
      } catch (err: any) {
        console.warn('Bhashini TTS failed, falling back to WebSpeech:', err.message);
      }
    }

    // Attempt 2: Fallback Provider
    return this.fallbackProvider.textToSpeech(text, language);
  }

  /**
   * Required End-to-End Multilingual Voice Loop:
   * User speaks Tamil -> STT -> Tamil transcript -> AI Orchestrator -> Business analysis -> Tamil response -> TTS -> Audio
   */
  public async executeEndToEndVoiceLoop(
    audioBlob: Blob | ArrayBuffer,
    language: SupportedLanguage = 'ta'
  ): Promise<VoiceLoopResult> {
    // 1. Speech-to-Text
    const stt = await this.speechToText(audioBlob, language);

    // 2. AI Orchestrator with Deterministic Business Analysis
    const decision = orchestrate(stt.transcript, language);

    // 3. Text-to-Speech Generation
    let ttsResult: TTSResult | undefined;
    try {
      ttsResult = await this.textToSpeech(decision.explanation, language);
    } catch (ttsErr: any) {
      console.warn('TTS playback preparation warning (degraded to visual text):', ttsErr.message);
    }

    return {
      transcript: stt.transcript,
      detectedLanguage: language,
      sttProvider: stt.providerUsed,
      sttFallbackTriggered: stt.fallbackTriggered,
      explanation: decision.explanation,
      recommendation: decision.recommendation,
      ttsResult,
      proposedAction: decision.proposedAction,
    };
  }
}

export const voiceService = new VoiceService();
