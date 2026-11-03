import { AudioAnalyser } from './audioAnalyser';
import { SUPPORTED_LANGUAGES } from './languages';
import { chunkForSpeech, cleanForSpeech, pickSystemVoice } from './speechText';

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  isDefault: boolean;
}

export type SpeechEngine = 'auto' | 'elevenlabs' | 'edge' | 'gemini' | 'system';

export interface SpeakOptions {
  languageCode?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceId?: string;
  /** Explicit neural voice id from the catalogue. */
  voice?: string;
  /** English accent fallback when no explicit voice is chosen. */
  accent?: string;
  engine?: SpeechEngine;
  elevenLabsVoiceId?: string;
  elevenLabsModel?: 'eleven_flash_v2_5' | 'eleven_multilingual_v2';
  elevenLabsStability?: number;
  elevenLabsSimilarityBoost?: number;
  elevenLabsStyle?: number;
  elevenLabsSpeakerBoost?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

interface SynthesisResponse {
  audioBase64: string;
  mimeType: string;
  voice: string;
  engine: 'elevenlabs' | 'edge' | 'gemini';
}

interface QueuedSpeech {
  text: string;
  options: SpeakOptions;
}

/**
 * Voice output: neural TTS (Edge, then Gemini) with real waveform lip-sync,
 * pipelined sentence playback, and a female-preferring system fallback.
 */
export class VoiceManager {
  private analyser: AudioAnalyser;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private finishCurrentAudio: (() => void) | null = null;
  private isSpeaking = false;
  private availableVoices: SpeechSynthesisVoice[] = [];
  private onStateChangeCallback?: (isSpeaking: boolean) => void;
  private generation = 0;
  private speechQueue: QueuedSpeech[] = [];
  private queueRunning = false;

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

  private emitState(speaking: boolean): void {
    this.isSpeaking = speaking;
    this.onStateChangeCallback?.(speaking);
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

  /** Best female system voice for the language (used only by the fallback path). */
  public findBestVoice(languageCode: string, voiceIdPreference?: string): SpeechSynthesisVoice | null {
    if (this.availableVoices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.availableVoices = window.speechSynthesis.getVoices();
    }

    const preferred = this.availableVoices.find((v) => v.voiceURI === voiceIdPreference);
    if (preferred) return preferred;

    return pickSystemVoice(
      this.availableVoices.map((v) => ({ name: v.name, lang: v.lang, default: v.default, voice: v })),
      languageCode
    )?.voice || null;
  }

  /**
   * Speaks text aloud. Neural synthesis is attempted first; if it fails the
   * system voice is used so the user always hears an answer.
   */
  public async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    this.stop();

    const spoken = cleanForSpeech(text);
    if (!spoken) return;

    const generation = this.generation;
    const language = options.languageCode || 'te-IN';

    this.emitState(true);
    options.onStart?.();

    try {
      const wantsNeural = (options.engine || 'auto') !== 'system' && Boolean(window.fridayAPI?.synthesizeSpeech);

      if (wantsNeural) {
        try {
          await this.speakNeural(spoken, language, options, generation);
          return;
        } catch (err: any) {
          if (generation !== this.generation) return;
          console.warn('[VoiceManager] Neural speech failed, using system voice:', err?.message);
        }
      }

      await this.speakSystem(spoken, language, options);
    } catch (err: any) {
      options.onError?.(err);
    } finally {
      if (generation === this.generation) {
        this.analyser.disconnect();
        this.emitState(false);
        options.onEnd?.();
      }
    }
  }

  /** Queues complete sentences so the first streamed sentence can play immediately. */
  public enqueueSpeech(text: string, options: SpeakOptions = {}): void {
    const spoken = cleanForSpeech(text);
    if (!spoken) return;
    this.speechQueue.push({ text: spoken, options });
    if (this.queueRunning) return;

    this.queueRunning = true;
    const generation = this.generation;
    void this.drainSpeechQueue(generation);
  }

  private async drainSpeechQueue(generation: number): Promise<void> {
    this.emitState(true);
    try {
      while (this.speechQueue.length > 0 && generation === this.generation) {
        const item = this.speechQueue.shift();
        if (!item) break;

        try {
          const wantsNeural =
            (item.options.engine || 'auto') !== 'system' &&
            Boolean(window.fridayAPI?.synthesizeSpeech);
          if (wantsNeural) {
            try {
              await this.speakNeural(item.text, item.options.languageCode || 'te-IN', item.options, generation);
              continue;
            } catch (err: any) {
              if (generation !== this.generation) return;
              console.warn('[VoiceManager] Streamed neural speech failed:', err?.message);
            }
          }
          await this.speakSystem(item.text, item.options.languageCode || 'te-IN', item.options);
        } catch (err: any) {
          item.options.onError?.(err);
        }
      }
    } finally {
      if (generation === this.generation) {
        this.analyser.disconnect();
        this.emitState(false);
      }
      this.queueRunning = false;
    }
  }

  /** Synthesizes chunk N+1 while chunk N plays, so speech starts after one round-trip. */
  private async speakNeural(
    text: string,
    language: string,
    options: SpeakOptions,
    generation: number
  ): Promise<void> {
    const chunks = chunkForSpeech(text);
    if (chunks.length === 0) return;

    const request = (chunk: string): Promise<SynthesisResponse> =>
      window.fridayAPI.synthesizeSpeech({
        text: chunk,
        language,
        rate: options.rate,
        pitch: options.pitch,
        volume: options.volume,
        voice: options.voice,
        accent: options.accent,
        elevenLabsVoiceId: options.elevenLabsVoiceId,
        elevenLabsModel: options.elevenLabsModel,
        elevenLabsStability: options.elevenLabsStability,
        elevenLabsSimilarityBoost: options.elevenLabsSimilarityBoost,
        elevenLabsStyle: options.elevenLabsStyle,
        elevenLabsSpeakerBoost: options.elevenLabsSpeakerBoost,
      });

    let pending = request(chunks[0]);

    for (let index = 0; index < chunks.length; index++) {
      const result = await pending;
      if (generation !== this.generation) return;

      pending = index + 1 < chunks.length ? request(chunks[index + 1]) : Promise.resolve(result);

      await this.playBase64(result.audioBase64, result.mimeType, generation);
      if (generation !== this.generation) return;
    }
  }

  private async playBase64(
    audioBase64: string,
    mimeType: string,
    generation: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
      this.currentAudioElement = audio;

      audio.onplay = () => {
        // Real audio drives the mouth bars instead of a simulation.
        this.analyser.connectAudioElement(audio);
      };

      const finish = () => {
        if (this.currentAudioElement === audio) this.currentAudioElement = null;
        if (this.finishCurrentAudio === finish) this.finishCurrentAudio = null;
        resolve();
      };

      this.finishCurrentAudio = finish;

      audio.onended = finish;
      audio.onerror = finish;

      audio.play().catch(finish);
    });
  }

  private speakSystem(text: string, language: string, options: SpeakOptions): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }

      // For English, prefer the system voice that matches the chosen accent.
      const systemLanguage =
        options.accent && language.toLowerCase().startsWith('en') ? options.accent : language;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = systemLanguage;
      utterance.rate = options.rate ?? 1.0;
      utterance.volume = options.volume ?? 1.0;

      const voice = this.findBestVoice(systemLanguage, options.voiceId);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        this.currentUtterance = utterance;
        this.analyser.simulateSpeakingAnimation(() => this.isSpeaking, text, utterance.rate);
      };

      const finish = () => {
        this.currentUtterance = null;
        this.analyser.disconnect();
        resolve();
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      window.speechSynthesis.speak(utterance);
    });
  }

  /** Plays a base64 audio clip generated elsewhere (e.g. Gemini audio replies). */
  public async playAudioBuffer(
    base64Data: string,
    mimeType = 'audio/mp3',
    onEnd?: () => void
  ): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.emitState(true);

    try {
      await this.playBase64(base64Data, mimeType, generation);
    } finally {
      if (generation === this.generation) {
        this.analyser.disconnect();
        this.emitState(false);
        onEnd?.();
      }
    }
  }

  /** Immediate interruption / barge-in: cancels synthesis and playback. */
  public stop(): void {
    this.generation++;
    this.speechQueue = [];
    this.analyser.disconnect();

    try {
      window.fridayAPI?.cancelSpeech();
    } catch {
      // bridge unavailable
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    const currentAudio = this.currentAudioElement;
    if (currentAudio) {
      this.finishCurrentAudio?.();
      currentAudio.pause();
      currentAudio.currentTime = 0;
      this.currentAudioElement = null;
    }

    this.finishCurrentAudio = null;

    this.currentUtterance = null;
    if (this.isSpeaking) this.emitState(false);
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}
