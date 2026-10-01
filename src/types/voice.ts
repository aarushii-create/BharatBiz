import { SupportedLanguage } from './index';

export type VoiceProviderType = 'bhashini' | 'webspeech' | 'fallback_text';

export interface STTResult {
  transcript: string;
  confidence: number;
  detectedLanguage: SupportedLanguage;
  providerUsed: VoiceProviderType;
  durationMs: number;
  fallbackTriggered: boolean;
}

export interface TTSResult {
  text: string;
  language: SupportedLanguage;
  audioUrl?: string;
  audioBuffer?: ArrayBuffer;
  providerUsed: VoiceProviderType;
  isSynthesizedSpeech: boolean;
  durationMs: number;
}

export interface VoiceProviderConfig {
  bhashiniApiKey?: string;
  bhashiniUserId?: string;
  bhashiniPipelineId?: string;
  timeoutMs?: number;
  primaryLanguage?: SupportedLanguage;
  fallbackLanguage?: SupportedLanguage;
}

export interface ISpeechProvider {
  readonly name: VoiceProviderType;
  readonly isPrimary: boolean;
  isAvailable(): Promise<boolean>;
  speechToText(audioBlob: Blob | ArrayBuffer, language: SupportedLanguage): Promise<STTResult>;
  textToSpeech(text: string, language: SupportedLanguage): Promise<TTSResult>;
  detectLanguage?(audioOrText: string | Blob): Promise<SupportedLanguage>;
}
