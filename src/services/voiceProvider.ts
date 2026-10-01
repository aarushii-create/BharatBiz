import { SupportedLanguage } from '../types';
import { VoiceProviderType } from '../types/voice';
import { voiceService as compositeVoiceService } from './voice/VoiceService';
import { audioPlayer } from './voice/AudioPlayer';

export interface VoiceRecognitionHandlers {
  onStart?: () => void;
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export class AppVoiceService {
  private recognition: any = null;
  private isListening = false;
  private activeProviderName: VoiceProviderType = 'bhashini';

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
      }
    }
  }

  public async getActiveProvider(): Promise<VoiceProviderType> {
    return compositeVoiceService.getActiveProvider();
  }

  public isSpeechSupported(): boolean {
    return !!this.recognition || typeof window !== 'undefined';
  }

  public startListening(
    lang: SupportedLanguage,
    handlers: VoiceRecognitionHandlers
  ): boolean {
    if (!this.recognition) {
      handlers.onError?.('Microphone not supported in this browser. Please use text input or click a prompt below.');
      return false;
    }

    if (this.isListening) {
      this.stopListening();
    }

    const localeMap: Record<SupportedLanguage, string> = {
      ta: 'ta-IN',
      hi: 'hi-IN',
      en: 'en-IN',
      te: 'te-IN',
    };

    this.recognition.lang = localeMap[lang] || 'en-IN';

    this.recognition.onstart = () => {
      this.isListening = true;
      handlers.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      this.isListening = false;
      handlers.onResult(text);
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      handlers.onError?.(event.error || 'Speech recognition encountered an issue. Falling back to text.');
    };

    this.recognition.onend = () => {
      this.isListening = false;
      handlers.onEnd?.();
    };

    try {
      this.recognition.start();
      return true;
    } catch (err: any) {
      this.isListening = false;
      handlers.onError?.(err?.message || 'Could not start microphone');
      return false;
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
      this.isListening = false;
    }
  }

  public async speak(text: string, lang: SupportedLanguage): Promise<void> {
    try {
      // 1. Try composite voice service (Bhashini or WebSpeech)
      const res = await compositeVoiceService.textToSpeech(text, lang);
      if (res.audioUrl) {
        await audioPlayer.play(res.audioUrl);
        return;
      }
    } catch (err) {
      console.warn('Composite TTS failed, using browser speech synthesis directly:', err);
    }

    // 2. Browser fallback utterance
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();

      // Clean markdown bullets for speech
      const cleanText = text
        .replace(/[*#•]/g, ' ')
        .replace(/₹/g, 'Rupees ')
        .replace(/\n+/g, '. ')
        .slice(0, 320);

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const localeMap: Record<SupportedLanguage, string> = {
        ta: 'ta-IN',
        hi: 'hi-IN',
        en: 'en-IN',
        te: 'te-IN',
      };
      utterance.lang = localeMap[lang] || 'en-IN';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  public stopSpeaking(): void {
    audioPlayer.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const voiceService = new AppVoiceService();
