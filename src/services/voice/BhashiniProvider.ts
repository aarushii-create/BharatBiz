import { ISpeechProvider, STTResult, TTSResult, VoiceProviderType } from '../../types/voice';
import { SupportedLanguage } from '../../types';

export class BhashiniProvider implements ISpeechProvider {
  public readonly name: VoiceProviderType = 'bhashini';
  public readonly isPrimary = true;
  private apiKey?: string;
  private userId?: string;
  private timeoutMs: number;

  constructor(apiKey?: string, userId?: string, timeoutMs = 4000) {
    this.apiKey = apiKey || (typeof process !== 'undefined' ? (process.env?.VITE_BHASHINI_API_KEY || process.env?.BHASHINI_API_KEY) : undefined);
    this.userId = userId || (typeof process !== 'undefined' ? (process.env?.VITE_BHASHINI_USER_ID || process.env?.BHASHINI_USER_ID) : undefined);
    this.timeoutMs = timeoutMs;
  }

  public async isAvailable(): Promise<boolean> {
    // Available if API credentials are configured
    return Boolean(this.apiKey && this.userId);
  }

  public async speechToText(
    audioBlob: Blob | ArrayBuffer,
    language: SupportedLanguage
  ): Promise<STTResult> {
    const startTime = performance.now();

    // Guard: Validate audio data
    if (!audioBlob) {
      throw new Error('INVALID_AUDIO: No audio buffer provided to Bhashini STT');
    }

    const byteLength = audioBlob instanceof Blob ? audioBlob.size : audioBlob.byteLength;
    if (byteLength === 0) {
      throw new Error('EMPTY_AUDIO_BUFFER: Audio input is 0 bytes');
    }

    if (!this.apiKey || !this.userId) {
      throw new Error('BHASHINI_CREDENTIALS_MISSING: API key or User ID not configured');
    }

    // Convert audio to base64
    let base64Audio = '';
    if (typeof Buffer !== 'undefined' && audioBlob instanceof ArrayBuffer) {
      base64Audio = Buffer.from(audioBlob).toString('base64');
    } else if (audioBlob instanceof Blob && typeof FileReader !== 'undefined') {
      base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          resolve(res.split(',')[1] || res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
    }

    const bhashiniLangCode = language === 'ta' ? 'ta' : language === 'hi' ? 'hi' : language === 'te' ? 'te' : 'en';

    // Call Bhashini ULCA ASR endpoint with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://dhruva-api.bhashini.gov.in/services/inference/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.apiKey,
          userID: this.userId,
        },
        body: JSON.stringify({
          pipelineTasks: [
            {
              taskType: 'asr',
              config: {
                language: { sourceLanguage: bhashiniLangCode },
              },
            },
          ],
          inputData: {
            audio: [{ audioContent: base64Audio }],
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`BHASHINI_API_ERROR: HTTP ${response.status} from Bhashini service`);
      }

      const data = await response.json();
      const transcript =
        data?.pipelineResponse?.[0]?.output?.[0]?.source ||
        data?.pipelineResponse?.[0]?.output?.[0]?.transcript ||
        '';

      const durationMs = Math.round(performance.now() - startTime);
      return {
        transcript,
        confidence: 0.94,
        detectedLanguage: language,
        providerUsed: 'bhashini',
        durationMs,
        fallbackTriggered: false,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`BHASHINI_TIMEOUT: Request exceeded ${this.timeoutMs}ms limit`);
      }
      throw err;
    }
  }

  public async textToSpeech(text: string, language: SupportedLanguage): Promise<TTSResult> {
    const startTime = performance.now();

    if (!text || !text.trim()) {
      throw new Error('EMPTY_TEXT_INPUT: Cannot synthesize empty text');
    }

    if (!this.apiKey || !this.userId) {
      throw new Error('BHASHINI_CREDENTIALS_MISSING: API key or User ID not configured');
    }

    const bhashiniLangCode = language === 'ta' ? 'ta' : language === 'hi' ? 'hi' : language === 'te' ? 'te' : 'en';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://dhruva-api.bhashini.gov.in/services/inference/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.apiKey,
          userID: this.userId,
        },
        body: JSON.stringify({
          pipelineTasks: [
            {
              taskType: 'tts',
              config: {
                language: { sourceLanguage: bhashiniLangCode },
                gender: 'female',
              },
            },
          ],
          inputData: {
            input: [{ source: text }],
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`BHASHINI_TTS_ERROR: HTTP ${response.status}`);
      }

      const data = await response.json();
      const base64Audio = data?.pipelineResponse?.[0]?.audio?.[0]?.audioContent;
      const audioUrl = base64Audio ? `data:audio/wav;base64,${base64Audio}` : undefined;

      const durationMs = Math.round(performance.now() - startTime);
      return {
        text,
        language,
        audioUrl,
        providerUsed: 'bhashini',
        isSynthesizedSpeech: true,
        durationMs,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`BHASHINI_TTS_TIMEOUT: Request exceeded ${this.timeoutMs}ms limit`);
      }
      throw err;
    }
  }
}
