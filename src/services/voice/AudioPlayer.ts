export class AudioPlayer {
  private currentAudio: HTMLAudioElement | null = null;
  private isPlayingState = false;
  private onStateChangeListeners: ((isPlaying: boolean) => void)[] = [];

  public subscribe(listener: (isPlaying: boolean) => void): () => void {
    this.onStateChangeListeners.push(listener);
    return () => {
      this.onStateChangeListeners = this.onStateChangeListeners.filter((l) => l !== listener);
    };
  }

  private setPlaying(state: boolean): void {
    this.isPlayingState = state;
    this.onStateChangeListeners.forEach((l) => l(state));
  }

  public get isPlaying(): boolean {
    return this.isPlayingState;
  }

  public async play(audioUrlOrBase64: string): Promise<void> {
    this.stop();

    if (!audioUrlOrBase64) return;

    if (typeof Audio === 'undefined') {
      // In headless/test environment
      this.setPlaying(true);
      setTimeout(() => this.setPlaying(false), 500);
      return;
    }

    try {
      this.currentAudio = new Audio(audioUrlOrBase64);
      this.setPlaying(true);

      this.currentAudio.onended = () => {
        this.setPlaying(false);
        this.currentAudio = null;
      };

      this.currentAudio.onerror = (e) => {
        console.warn('Audio playback error:', e);
        this.setPlaying(false);
        this.currentAudio = null;
      };

      await this.currentAudio.play();
    } catch (err) {
      console.warn('Playback failed:', err);
      this.setPlaying(false);
    }
  }

  public stop(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {
        // ignore
      }
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
    }

    this.setPlaying(false);
  }
}

export const audioPlayer = new AudioPlayer();
