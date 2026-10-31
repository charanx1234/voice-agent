import { AudioAnalyser } from './audioAnalyser';
import { SUPPORTED_LANGUAGES } from './languages';

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  isDefault: boolean;
}

export class VoiceManager {
  private analyser: AudioAnalyser;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private isSpeaking = false;
  private availableVoices: SpeechSynthesisVoice[] = [];
  private onStateChangeCallback?: (isSpeaking: boolean) => void;

  constructor(analyser: AudioAnalyser) {
    this.analyser = analyser;
    this.initVoices();
  }

  private initVoices(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        this.availableVoices = window.speechSynthesis.getVoices();
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }

  public setOnStateChange(cb: (isSpeaking: boolean) => void): void {
    this.onStateChangeCallback = cb;
  }

  public getVoices(): VoiceOption[] {
    if (this.availableVoices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.availableVoices = window.speechSynthesis.getVoices();
    }
    return this.availableVoices.map((v) => ({
      id: v.voiceURI,
      name: `${v.name} (${v.lang})`,
      lang: v.lang,
      isDefault: v.default,
    }));
  }

  /**
   * Finds the most natural voice for a given language code
   */
  public findBestVoice(languageCode: string, voiceIdPreference?: string): SpeechSynthesisVoice | null {
    if (this.availableVoices.length === 0) {
      this.availableVoices = window.speechSynthesis.getVoices();
    }

    // 1. Direct voice URI match if user selected one
    if (voiceIdPreference && voiceIdPreference !== 'default') {
      const direct = this.availableVoices.find((v) => v.voiceURI === voiceIdPreference);
      if (direct) return direct;
    }

    const config = SUPPORTED_LANGUAGES[languageCode];
    const preferredNames = config ? config.preferredVoices : [];

    // 2. Search by preferred names in config
    for (const pref of preferredNames) {
      const found = this.availableVoices.find(
        (v) =>
          v.name.toLowerCase().includes(pref.toLowerCase()) ||
          v.lang.toLowerCase().startsWith(pref.toLowerCase())
      );
      if (found) return found;
    }

    // 3. Fallback: match by language prefix (e.g. 'te', 'hi', 'ta', 'kn', 'en')
    const prefix = languageCode.split('-')[0].toLowerCase();
    const langMatch = this.availableVoices.find((v) =>
      v.lang.toLowerCase().startsWith(prefix)
    );
    if (langMatch) return langMatch;

    // 4. Fallback: Indian English or Default
    const indianEnglish = this.availableVoices.find((v) =>
      v.lang.toLowerCase().includes('en-in') || v.name.toLowerCase().includes('india')
    );
    if (indianEnglish) return indianEnglish;

    return this.availableVoices.find((v) => v.default) || this.availableVoices[0] || null;
  }

  /**
   * Speaks the provided text aloud using speech synthesis
   */
  public speak(
    text: string,
    options: {
      languageCode?: string;
      rate?: number;
      volume?: number;
      voiceId?: string;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    } = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stop(); // Stop any ongoing speech first

      if (!text || text.trim().length === 0) {
        resolve();
        return;
      }

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        console.warn('[VoiceManager] Speech synthesis not supported in this browser.');
        resolve();
        return;
      }

      // Clean markdown characters from spoken text so it reads naturally
      const spokenText = text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
        .replace(/#+\s/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/[•\-\*]\s/g, '')
        .trim();

      const utterance = new SpeechSynthesisUtterance(spokenText);
      const targetLang = options.languageCode || 'te-IN';
      utterance.lang = targetLang;
      utterance.rate = options.rate !== undefined ? options.rate : 1.0;
      utterance.volume = options.volume !== undefined ? options.volume : 1.0;

      const voice = this.findBestVoice(targetLang, options.voiceId);
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.currentUtterance = utterance;
        if (this.onStateChangeCallback) this.onStateChangeCallback(true);
        if (options.onStart) options.onStart();

        // Drive mouth animation
        this.analyser.simulateSpeakingAnimation(() => this.isSpeaking);
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.analyser.disconnect();
        if (this.onStateChangeCallback) this.onStateChangeCallback(false);
        if (options.onEnd) options.onEnd();
        resolve();
      };

      utterance.onerror = (e) => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.analyser.disconnect();
        if (this.onStateChangeCallback) this.onStateChangeCallback(false);
        if (options.onError) options.onError(e);
        resolve(); // Don't throw unhandled promise rejection
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Plays a base64 encoded audio track (e.g. from Gemini audio generation)
   */
  public playAudioBuffer(
    base64Data: string,
    mimeType = 'audio/mp3',
    onEnd?: () => void
  ): Promise<void> {
    return new Promise((resolve) => {
      this.stop();

      const audioSrc = `data:${mimeType};base64,${base64Data}`;
      const audio = new Audio(audioSrc);
      this.currentAudioElement = audio;
      this.isSpeaking = true;

      if (this.onStateChangeCallback) this.onStateChangeCallback(true);

      audio.onplay = () => {
        this.analyser.connectAudioElement(audio);
      };

      audio.onended = () => {
        this.isSpeaking = false;
        this.currentAudioElement = null;
        this.analyser.disconnect();
        if (this.onStateChangeCallback) this.onStateChangeCallback(false);
        if (onEnd) onEnd();
        resolve();
      };

      audio.onerror = () => {
        this.isSpeaking = false;
        this.currentAudioElement = null;
        this.analyser.disconnect();
        if (this.onStateChangeCallback) this.onStateChangeCallback(false);
        resolve();
      };

      audio.play().catch(() => {
        this.isSpeaking = false;
        this.analyser.disconnect();
        resolve();
      });
    });
  }

  /**
   * Immediate interruption / barge-in: stops audio playback and synthesis immediately
   */
  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.currentTime = 0;
      this.currentAudioElement = null;
    }
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.analyser.disconnect();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(false);
    }
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}

