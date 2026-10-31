import { describe, it, expect } from 'vitest';
import { detectLanguageFromText, SUPPORTED_LANGUAGES } from '../src/services/voice/languages';

describe('Multilingual Indian Language Detection & Config', () => {
  it('has valid definitions for Telugu, Hindi, Tamil, Kannada, and Indian English', () => {
    expect(SUPPORTED_LANGUAGES['te-IN']).toBeDefined();
    expect(SUPPORTED_LANGUAGES['hi-IN']).toBeDefined();
    expect(SUPPORTED_LANGUAGES['ta-IN']).toBeDefined();
    expect(SUPPORTED_LANGUAGES['kn-IN']).toBeDefined();
    expect(SUPPORTED_LANGUAGES['en-IN']).toBeDefined();
  });

  it('detects Telugu script accurately', () => {
    const sampleTelugu = 'నమస్కారం, ఈ రోజు వాతావరణం ఎలా ఉంది?';
    expect(detectLanguageFromText(sampleTelugu)).toBe('te-IN');
  });

  it('detects Hindi/Devanagari script accurately', () => {
    const sampleHindi = 'नमस्ते, आज का दिन कैसा है?';
    expect(detectLanguageFromText(sampleHindi)).toBe('hi-IN');
  });

  it('detects Tamil script accurately', () => {
    const sampleTamil = 'வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?';
    expect(detectLanguageFromText(sampleTamil)).toBe('ta-IN');
  });

  it('detects Kannada script accurately', () => {
    const sampleKannada = 'ನಮಸ್ಕಾರ, ಇವತ್ತಿನ ದಿನ ಹೇಗಿದೆ?';
    expect(detectLanguageFromText(sampleKannada)).toBe('kn-IN');
  });

  it('returns default code for Latin script', () => {
    const sampleEnglish = 'Hello, how can I help you today?';
    expect(detectLanguageFromText(sampleEnglish, 'en-IN')).toBe('en-IN');
  });
});

