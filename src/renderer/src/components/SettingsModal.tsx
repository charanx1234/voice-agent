import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Globe,
  Sliders,
  FolderOpen,
  Shield,
  Volume2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Moon,
} from 'lucide-react';
import { FridaySettings } from '@/shared/types';
import { SUPPORTED_LANGUAGES } from '@/services/voice/languages';
import {
  ACCENTS,
  LANGUAGE_VOICES,
  LANGUAGE_VOICE_LABELS,
  getAccent,
} from '@/services/voice/voiceCatalog';
import { VoiceOption } from '@/services/voice/voiceManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: FridaySettings;
  voices: VoiceOption[];
  onSaveSettings: (updates: Partial<FridaySettings>) => Promise<void>;
  onTestConnection: (apiKeyOverride?: string) => Promise<{ success: boolean; message: string }>;
  onTestVoice: (text: string) => void;
  onSelectApprovedFolder: () => Promise<string | null>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  voices,
  onSaveSettings,
  onTestConnection,
  onTestVoice,
  onSelectApprovedFolder,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [language, setLanguage] = useState(settings.preferredLanguage || 'te-IN');
  const [voiceId, setVoiceId] = useState(settings.voiceId || 'default');
  const [voiceAccent, setVoiceAccent] = useState<FridaySettings['voiceAccent']>(
    settings.voiceAccent || 'en-IN'
  );
  const [ttsVoice, setTtsVoice] = useState(
    settings.ttsVoice || 'en-IN-NeerjaExpressiveNeural'
  );
  const [sampleBusy, setSampleBusy] = useState(false);
  const [speechSpeed, setSpeechSpeed] = useState(settings.speechSpeed || 1.0);
  const [speechVolume, setSpeechVolume] = useState(settings.speechVolume || 1.0);
  const [pitch, setPitch] = useState(settings.pitch ?? 0);
  const [ttsEngine, setTtsEngine] = useState<FridaySettings['ttsEngine']>(
    settings.ttsEngine || 'auto'
  );
  const [themeMode, setThemeMode] = useState<FridaySettings['themeMode']>(
    settings.themeMode || 'auto'
  );
  const [approvedFolders, setApprovedFolders] = useState<string[]>(settings.approvedFolders || []);
  const [confirmations, setConfirmations] = useState(settings.requireToolConfirmations);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(settings.apiKey || '');
      setLanguage(settings.preferredLanguage || 'te-IN');
      setVoiceId(settings.voiceId || 'default');
      setVoiceAccent(settings.voiceAccent || 'en-IN');
      setTtsVoice(settings.ttsVoice || 'en-IN-NeerjaExpressiveNeural');
      setSampleBusy(false);
      setSpeechSpeed(settings.speechSpeed || 1.0);
      setSpeechVolume(settings.speechVolume || 1.0);
      setPitch(settings.pitch ?? 0);
      setTtsEngine(settings.ttsEngine || 'auto');
      setThemeMode(settings.themeMode || 'auto');
      setApprovedFolders(settings.approvedFolders || []);
      setConfirmations(settings.requireToolConfirmations);
      setTestResult(null);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = async () => {
    await onSaveSettings({
      apiKey: apiKeyInput,
      preferredLanguage: language,
      voiceId,
      voiceAccent,
      ttsVoice,
      speechSpeed,
      speechVolume,
      pitch,
      ttsEngine,
      themeMode,
      approvedFolders,
      requireToolConfirmations: confirmations,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleTestKey = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await onTestConnection(apiKeyInput.includes('...') ? undefined : apiKeyInput);
    setTestResult(res);
    setIsTesting(false);
  };

  const handleAddFolder = async () => {
    const selected = await onSelectApprovedFolder();
    if (selected && !approvedFolders.includes(selected)) {
      const updated = [...approvedFolders, selected];
      setApprovedFolders(updated);
      onSaveSettings({ approvedFolders: updated });
    }
  };

  const handleRemoveFolder = (folderPath: string) => {
    const updated = approvedFolders.filter((f) => f !== folderPath);
    setApprovedFolders(updated);
    onSaveSettings({ approvedFolders: updated });
  };

  const langConfig = SUPPORTED_LANGUAGES[language] || SUPPORTED_LANGUAGES['te-IN'];
  const englishLanguage = language.toLowerCase().startsWith('en');
  const accentGroup = getAccent(voiceAccent);
  const accentVoices = accentGroup.voices;

  /** Plays the currently selected (possibly unsaved) voice so users can audition accents. */
  const handlePlaySample = async () => {
    if (!window.fridayAPI || sampleBusy) return;

    setSampleBusy(true);
    try {
      const sampleText = englishLanguage
        ? `Hi, I'm FRIDAY. This is my ${accentGroup.shortLabel} English voice.`
        : langConfig.sampleGreeting;

      const result = await window.fridayAPI.synthesizeSpeech({
        text: sampleText,
        language: englishLanguage ? voiceAccent : language,
        voice: englishLanguage ? ttsVoice : LANGUAGE_VOICES[language],
        accent: voiceAccent,
        rate: speechSpeed,
        pitch,
        volume: speechVolume,
      });

      await new Promise<void>((resolve) => {
        const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch {
      // a failed sample must never block the settings dialog
    } finally {
      setSampleBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'color-mix(in srgb, var(--overlay) 82%, transparent)',
        backdropFilter: 'blur(10px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          maxHeight: '88vh',
          backgroundColor: 'var(--surface)',
          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          borderRadius: '18px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 40px color-mix(in srgb, var(--shadow-color) 70%, transparent), 0 0 20px color-mix(in srgb, var(--accent) 10%, transparent)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="var(--accent)" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>FRIDAY Settings</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            padding: '16px 18px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Section: Appearance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Moon size={14} color="var(--accent)" />
              <span>APPEARANCE</span>
            </label>

            <div style={{ display: 'flex', gap: '6px' }}>
              {(['auto', 'light', 'dark'] as const).map((mode) => {
                const active = themeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemeMode(mode)}
                    style={{
                      flex: 1,
                      padding: '7px 8px',
                      borderRadius: '9px',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: active
                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                        : 'color-mix(in srgb, var(--text) 4%, transparent)',
                      border: `1px solid ${
                        active
                          ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
                          : 'color-mix(in srgb, var(--text) 10%, transparent)'
                      }`,
                      color: active ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {mode === 'auto' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}
                  </button>
                );
              })}
            </div>

            <span style={{ fontSize: '0.7rem', color: 'var(--muted-dim)' }}>
              Auto follows your Windows theme.
            </span>
          </div>

          {/* Section: Diagnostics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FolderOpen size={14} color="var(--accent)" />
              <span>DIAGNOSTICS</span>
            </label>

            <button
              type="button"
              onClick={() => window.fridayAPI?.openLogsFolder()}
              style={{
                alignSelf: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '8px',
                backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                color: 'var(--muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <FolderOpen size={13} color="var(--accent)" />
              <span>Open Logs Folder</span>
            </button>

            <span style={{ fontSize: '0.68rem', color: 'var(--muted-dim)' }}>
              Backend logs are written to a file, so no terminal window is needed.
            </span>
          </div>

          {/* Section: Gemini API Key */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Key size={14} color="var(--accent)" />
              <span>GOOGLE GEMINI API KEY</span>
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'color-mix(in srgb, var(--text) 4%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '10px',
                padding: '6px 10px',
              }}
            >
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Paste your API key"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{ background: 'none', border: 'none', color: 'var(--muted-dim)', cursor: 'pointer' }}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTesting}
                style={{
                  padding: '5px 10px',
                  borderRadius: '8px',
                  backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  color: 'var(--accent)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: isTesting ? 'default' : 'pointer',
                }}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '0.73rem',
                  color: 'var(--muted-dim)',
                  alignSelf: 'center',
                  textDecoration: 'underline',
                }}
              >
                Get free API key
              </a>
            </div>

            {testResult && (
              <div
                style={{
                  marginTop: '4px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  backgroundColor: testResult.success ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'color-mix(in srgb, var(--danger) 12%, transparent)',
                  border: `1px solid ${testResult.success ? 'var(--success)' : 'var(--danger)'}44`,
                  color: testResult.success ? 'var(--success)' : 'var(--danger)',
                  fontSize: '0.74rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {testResult.success ? <Check size={14} /> : <AlertCircle size={14} />}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Section: Multilingual Voice & Language */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Globe size={14} color="var(--accent)" />
              <span>PREFERRED INDIAN LANGUAGE</span>
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: 'var(--text)',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            >
              {Object.values(SUPPORTED_LANGUAGES).map((l) => (
                <option key={l.code} value={l.code} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                  {l.name} — {l.nativeName}
                </option>
              ))}
            </select>

            {/* Accent selector (English only) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--muted-dim)' }}>
                ENGLISH ACCENT
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {ACCENTS.map((accent) => {
                  const active = voiceAccent === accent.id;
                  const disabled = !englishLanguage;
                  return (
                    <button
                      key={accent.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setVoiceAccent(accent.id);
                        setTtsVoice(accent.defaultVoice);
                      }}
                      title={accent.label}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '9px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: disabled ? 'default' : 'pointer',
                        opacity: disabled ? 0.45 : 1,
                        backgroundColor: active
                          ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                          : 'color-mix(in srgb, var(--text) 4%, transparent)',
                        border: `1px solid ${
                          active
                            ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
                            : 'color-mix(in srgb, var(--text) 10%, transparent)'
                        }`,
                        color: active ? 'var(--accent)' : 'var(--muted)',
                      }}
                    >
                      {accent.shortLabel}
                    </button>
                  );
                })}
              </div>
              {!englishLanguage && (
                <span style={{ fontSize: '0.68rem', color: 'var(--muted-dim)' }}>
                  Accent applies to English. {langConfig.name} uses{' '}
                  {LANGUAGE_VOICE_LABELS[language] || 'its own voice'}.
                </span>
              )}
            </div>

            {/* Voice selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--muted-dim)' }}>VOICE</label>
              {englishLanguage ? (
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                    borderRadius: '10px',
                    padding: '7px 10px',
                    color: 'var(--text)',
                    fontSize: '0.78rem',
                    outline: 'none',
                  }}
                >
                  <optgroup label="Female">
                    {accentVoices
                      .filter((voice) => voice.gender === 'female')
                      .map((voice) => (
                        <option key={voice.id} value={voice.id} style={{ background: 'var(--surface)' }}>
                          {voice.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Male">
                    {accentVoices
                      .filter((voice) => voice.gender === 'male')
                      .map((voice) => (
                        <option key={voice.id} value={voice.id} style={{ background: 'var(--surface)' }}>
                          {voice.label}
                        </option>
                      ))}
                  </optgroup>
                </select>
              ) : (
                <select
                  value={LANGUAGE_VOICES[language] || ''}
                  disabled
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                    borderRadius: '10px',
                    padding: '7px 10px',
                    color: 'var(--muted)',
                    fontSize: '0.78rem',
                    outline: 'none',
                  }}
                >
                  <option value={LANGUAGE_VOICES[language] || ''} style={{ background: 'var(--surface)' }}>
                    {LANGUAGE_VOICE_LABELS[language] || 'Default voice'}
                  </option>
                </select>
              )}
            </div>

            {/* Sample playback */}
            <button
              type="button"
              onClick={handlePlaySample}
              disabled={sampleBusy}
              style={{
                alignSelf: 'flex-start',
                marginTop: '2px',
                padding: '4px 10px',
                borderRadius: '8px',
                backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                color: 'var(--accent)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: sampleBusy ? 'default' : 'pointer',
                opacity: sampleBusy ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Volume2 size={13} color="var(--accent)" />
              <span>{sampleBusy ? 'Playing…' : 'Play Sample'}</span>
            </button>

            {/* System fallback voice */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.68rem', color: 'var(--muted-dim)' }}>
                SYSTEM FALLBACK VOICE
              </label>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--text) 4%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
                  borderRadius: '9px',
                  padding: '6px 9px',
                  color: 'var(--muted)',
                  fontSize: '0.72rem',
                  outline: 'none',
                }}
              >
                <option value="default" style={{ background: 'var(--surface)' }}>
                  Automatic (best match for {langConfig.name})
                </option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id} style={{ background: 'var(--surface)' }}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section: Speech Speed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted)' }}>
              <span>Speech Speed</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{speechSpeed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.4"
              step="0.05"
              value={speechSpeed}
              onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
              style={{ accentColor: 'var(--accent)' }}
            />
          </div>

          {/* Section: Pitch */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted)' }}>
              <span>Pitch</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {pitch > 0 ? `+${pitch}` : pitch} st
              </span>
            </div>
            <input
              type="range"
              min="-3"
              max="3"
              step="0.5"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              style={{ accentColor: 'var(--accent)' }}
            />
          </div>

          {/* Section: Voice engine */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)' }}>
              VOICE ENGINE
            </label>
            <select
              value={ttsEngine}
              onChange={(e) => setTtsEngine(e.target.value as FridaySettings['ttsEngine'])}
              style={{
                backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '10px',
                padding: '7px 10px',
                color: 'var(--text)',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            >
              <option value="auto" style={{ background: 'var(--surface)' }}>
                Automatic — neural (Edge), then Gemini, then system
              </option>
              <option value="edge" style={{ background: 'var(--surface)' }}>
                Edge neural voices (free)
              </option>
              <option value="gemini" style={{ background: 'var(--surface)' }}>
                Gemini TTS (uses your API key)
              </option>
              <option value="system" style={{ background: 'var(--surface)' }}>
                System voice (offline)
              </option>
            </select>
          </div>

          {/* Section: Approved Project Folders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <FolderOpen size={14} color="var(--accent)" />
                <span>APPROVED PROJECT FOLDERS</span>
              </label>
              <button
                type="button"
                onClick={handleAddFolder}
                style={{
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  color: 'var(--accent)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Plus size={12} />
                <span>Add Folder</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {approvedFolders.length === 0 ? (
                <div style={{ fontSize: '0.73rem', color: 'var(--muted-dim)', fontStyle: 'italic' }}>
                  No folders approved. FRIDAY will only search folders you explicitly add here.
                </div>
              ) : (
                approvedFolders.map((fPath) => (
                  <div
                    key={fPath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'color-mix(in srgb, var(--text) 3%, transparent)',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      fontSize: '0.72rem',
                      color: 'var(--muted)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                      {fPath}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFolder(fPath)}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section: Security & Confirmations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Shield size={14} color="var(--accent)" />
              <span>PERMISSIONS & CONFIRMATIONS</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.76rem', color: 'var(--muted)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={confirmations.launchApps}
                  onChange={(e) => setConfirmations({ ...confirmations, launchApps: e.target.checked })}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span>Ask confirmation before opening applications</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={confirmations.folderSearch}
                  onChange={(e) => setConfirmations({ ...confirmations, folderSearch: e.target.checked })}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span>Ask confirmation before searching approved folders</span>
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer with Save Button */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
              color: 'var(--muted)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '6px 18px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent)',
              border: 'none',
              color: 'var(--bg)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isSaved && <Check size={14} />}
            <span>{isSaved ? 'Saved!' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
