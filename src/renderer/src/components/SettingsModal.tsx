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
  Mic,
  Activity,
  Play,
  Square,
  ShieldCheck,
  Zap,
  Sparkles,
} from 'lucide-react';
import { voiceFlowController } from '@/services/voiceflow/voiceflowController';
import { voiceFlowHistory } from '@/services/voiceflow/voiceflowHistory';
import { VoiceFlowMode, VoiceFlowHistoryItem } from '@/services/voiceflow/types';
import { AiProviderId, AiProviderStatus, ElevenLabsUsage, EnrolledSpeakerProfile, FridaySettings } from '@/shared/types';
import { speakerVerificationService } from '@/services/voice/speakerVerification';
import { AudioPipeline } from '@/services/voice/audioPipeline';
import { SUPPORTED_LANGUAGES } from '@/services/voice/languages';
import {
  ACCENTS,
  LANGUAGE_VOICES,
  LANGUAGE_VOICE_LABELS,
  getAccent,
} from '@/services/voice/voiceCatalog';
import { VoiceOption } from '@/services/voice/voiceManager';
import { ENVIRONMENT_PRESETS, inferEnvironmentFromSettings } from '@/services/voice/listeningEnvironment';
import type { ListeningEnvironment } from '@/services/voice/listeningEnvironment';

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
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(settings.elevenLabsVoiceId || '');
  const [elevenLabsModel, setElevenLabsModel] = useState<FridaySettings['elevenLabsModel']>(
    settings.elevenLabsModel || 'eleven_flash_v2_5'
  );
  const [elevenLabsStability, setElevenLabsStability] = useState(settings.elevenLabsStability ?? 0.42);
  const [elevenLabsSimilarityBoost, setElevenLabsSimilarityBoost] = useState(
    settings.elevenLabsSimilarityBoost ?? 0.78
  );
  const [elevenLabsStyle, setElevenLabsStyle] = useState(settings.elevenLabsStyle ?? 0.18);
  const [elevenLabsSpeakerBoost, setElevenLabsSpeakerBoost] = useState(
    settings.elevenLabsSpeakerBoost !== false
  );
  const [elevenLabsUsage, setElevenLabsUsage] = useState<ElevenLabsUsage | null>(null);
  const [themeMode, setThemeMode] = useState<FridaySettings['themeMode']>(
    settings.themeMode || 'auto'
  );
  const [personalityMode, setPersonalityMode] = useState<FridaySettings['personalityMode']>(
    settings.personalityMode || 'moderate'
  );
  const [handsFreeEnabled, setHandsFreeEnabled] = useState(settings.handsFreeEnabled !== false);
  const [handsFreeSilenceTimeoutMs, setHandsFreeSilenceTimeoutMs] = useState(
    settings.handsFreeSilenceTimeoutMs || 25_000
  );
  const [approvedFolders, setApprovedFolders] = useState<string[]>(settings.approvedFolders || []);
  const [confirmations, setConfirmations] = useState(settings.requireToolConfirmations);

  // Voice Isolation & Speaker Verification Settings
  const [noiseSuppression, setNoiseSuppression] = useState<'off' | 'standard' | 'strong'>(
    settings.noiseSuppression || 'standard'
  );
  const [echoCancellation, setEchoCancellation] = useState(settings.echoCancellation !== false);
  const [autoGainControl, setAutoGainControl] = useState(settings.autoGainControl !== false);
  const [vadSensitivity, setVadSensitivity] = useState<'low' | 'medium' | 'high'>(
    settings.vadSensitivity || 'medium'
  );
  const [listeningEnvironment, setListeningEnvironment] = useState<'quiet' | 'noisy' | 'very_noisy'>(
    settings.listeningEnvironment ||
      inferEnvironmentFromSettings(settings.noiseSuppression, settings.vadSensitivity) ||
      'quiet'
  );
  const [speakerVerificationEnabled, setSpeakerVerificationEnabled] = useState(
    Boolean(settings.speakerVerificationEnabled)
  );
  const [enrolledProfile, setEnrolledProfile] = useState<EnrolledSpeakerProfile | undefined>(
    settings.enrolledVoiceProfile
  );
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState(settings.microphoneDeviceId || '');
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [liveMicLevel, setLiveMicLevel] = useState<number>(0);
  const [isEnrollingVoice, setIsEnrollingVoice] = useState<boolean>(false);
  const [enrollStatus, setEnrollStatus] = useState<string | null>(null);
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micTestCountdown, setMicTestCountdown] = useState<number>(0);
  const [micTestResult, setMicTestResult] = useState<{
    snrDb: number;
    peakLevel: number;
    noiseFloor: number;
    voiceDetected: boolean;
    transcript?: string;
    sttLatencyMs?: number;
    micName?: string;
    clipping?: boolean;
    pipelineLatencyMs?: number;
  } | null>(null);

  const [providerId, setProviderId] = useState<AiProviderId>(settings.aiProvider || 'gemini');
  const [fallbackProviderId, setFallbackProviderId] = useState<AiProviderId | 'none'>(settings.fallbackAiProvider || 'none');
  const [providerApiKey, setProviderApiKey] = useState(settings.apiKey || '');
  const [providerModel, setProviderModel] = useState(settings.modelName || 'gemini-3.1-pro-preview');
  const [providerBaseUrl, setProviderBaseUrl] = useState('');
  const [providerStatus, setProviderStatus] = useState<AiProviderStatus | null>(null);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // FRIDAY VoiceFlow Settings State
  const [vfEnabled, setVfEnabled] = useState(true);
  const [vfMode, setVfMode] = useState<VoiceFlowMode>('natural');
  const [vfDirect, setVfDirect] = useState(false);
  const [vfModel, setVfModel] = useState<'tiny' | 'base' | 'small' | 'turbo'>('base');
  const [vfLanguage, setVfLanguage] = useState('auto');
  const [vfShortcut, setVfShortcut] = useState(true);
  const [vfRestoreClipboard, setVfRestoreClipboard] = useState(true);
  const [vfHistory, setVfHistory] = useState<VoiceFlowHistoryItem[]>([]);

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
      setElevenLabsVoiceId(settings.elevenLabsVoiceId || '');
      setElevenLabsModel(settings.elevenLabsModel || 'eleven_flash_v2_5');
      setElevenLabsStability(settings.elevenLabsStability ?? 0.42);
      setElevenLabsSimilarityBoost(settings.elevenLabsSimilarityBoost ?? 0.78);
      setElevenLabsStyle(settings.elevenLabsStyle ?? 0.18);
      setElevenLabsSpeakerBoost(settings.elevenLabsSpeakerBoost !== false);
      setElevenLabsUsage(null);
      setThemeMode(settings.themeMode || 'auto');
      setPersonalityMode(settings.personalityMode || 'moderate');
      setHandsFreeEnabled(settings.handsFreeEnabled !== false);
      setHandsFreeSilenceTimeoutMs(settings.handsFreeSilenceTimeoutMs || 25_000);
      setNoiseSuppression(settings.noiseSuppression || 'standard');
      setEchoCancellation(settings.echoCancellation !== false);
      setAutoGainControl(settings.autoGainControl !== false);
      setVadSensitivity(settings.vadSensitivity || 'medium');
      setListeningEnvironment(
        settings.listeningEnvironment ||
          inferEnvironmentFromSettings(settings.noiseSuppression, settings.vadSensitivity) ||
          'quiet'
      );
      setSpeakerVerificationEnabled(Boolean(settings.speakerVerificationEnabled));
      setEnrolledProfile(settings.enrolledVoiceProfile);
      setMicrophoneDeviceId(settings.microphoneDeviceId || '');
      setApprovedFolders(settings.approvedFolders || []);
      setConfirmations(settings.requireToolConfirmations);
      setTestResult(null);
      setMicTestResult(null);
      setEnrollStatus(null);
      void window.fridayAPI?.getElevenLabsUsage().then(setElevenLabsUsage);

      // Enumerate audio input devices
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const inputs = devices.filter((d) => d.kind === 'audioinput');
          setAudioInputDevices(inputs);
        }).catch(() => {});
      }

      if (window.fridayAPI?.getAiProviders) {
        window.fridayAPI.getAiProviders().then((st) => {
          if (st) {
            setProviderStatus(st);
            const active = st.activeProvider || 'gemini';
            setProviderId(active);
            setFallbackProviderId(st.fallbackProvider || 'none');
            const cfg = st.providers[active];
            if (cfg) {
              setProviderApiKey(cfg.apiKey || '');
              setProviderModel(cfg.model || '');
              setProviderBaseUrl(cfg.baseUrl || '');
            }
          }
        });
      }

      // Load VoiceFlow preferences and history
      try {
        const vf = voiceFlowController.getSettings();
        setVfEnabled(vf.enabled);
        setVfMode(vf.mode);
        setVfDirect(vf.directTranscription);
        setVfModel(vf.model);
        setVfLanguage(vf.language);
        setVfShortcut(vf.shortcutEnabled);
        setVfRestoreClipboard(vf.restoreClipboard);
        setVfHistory(voiceFlowHistory.getHistory().slice(0, 5));
      } catch {}
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  // Voice Enrollment Routine
  const handleEnrollVoice = async () => {
    setIsEnrollingVoice(true);
    setEnrollStatus('Please say: "Hey Friday, this is my voice."');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: microphoneDeviceId ? { exact: microphoneDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const samples: Float32Array[] = [];
      const buffer = new Float32Array(analyser.fftSize);

      const interval = setInterval(() => {
        analyser.getFloatTimeDomainData(buffer);
        const slice = new Float32Array(buffer.length);
        slice.set(buffer);
        samples.push(slice);
      }, 30);

      // Record for 3.5 seconds
      setTimeout(async () => {
        clearInterval(interval);
        stream.getTracks().forEach((t) => t.stop());

        let totalLength = 0;
        for (const s of samples) totalLength += s.length;
        const pcm = new Float32Array(totalLength);
        let offset = 0;
        for (const s of samples) {
          pcm.set(s, offset);
          offset += s.length;
        }

        const profile = speakerVerificationService.createProfile(pcm, ctx.sampleRate);
        await ctx.close().catch(() => {});

        setEnrolledProfile(profile);
        setSpeakerVerificationEnabled(true);
        if (window.fridayAPI?.enrollSpeakerVoice) {
          await window.fridayAPI.enrollSpeakerVoice(profile);
        }
        await onSaveSettings({ enrolledVoiceProfile: profile, speakerVerificationEnabled: true });

        setEnrollStatus('Voice profile enrolled successfully!');
        setIsEnrollingVoice(false);
        setTimeout(() => setEnrollStatus(null), 3000);
      }, 3500);
    } catch (err: any) {
      setEnrollStatus(`Enrollment failed: ${err.message || 'Microphone error'}`);
      setIsEnrollingVoice(false);
    }
  };

  const handleClearEnrollment = async () => {
    setEnrolledProfile(undefined);
    setSpeakerVerificationEnabled(false);
    if (window.fridayAPI?.clearSpeakerProfile) {
      await window.fridayAPI.clearSpeakerProfile();
    }
    await onSaveSettings({ enrolledVoiceProfile: undefined, speakerVerificationEnabled: false });
    setEnrollStatus('Enrolled voice profile cleared.');
    setTimeout(() => setEnrollStatus(null), 2500);
  };

  // Functional Microphone Test with Real-time Diagnostics
  const handleTestMicrophone = async () => {
    setIsTestingMic(true);
    setMicTestResult(null);
    setMicTestCountdown(3);

    const timer = setInterval(() => {
      setMicTestCountdown((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    const testStartTime = Date.now();
    try {
      const pipeline = new AudioPipeline({
        noiseSuppression,
        echoCancellation,
        autoGainControl,
        vadSensitivity,
        listeningEnvironment,
        deviceId: microphoneDeviceId || undefined,
      });

      const res = await pipeline.testMicrophone(3000);
      const pipelineLatencyMs = Math.max(8, Math.round((Date.now() - testStartTime - 3000) / 4));
      clearInterval(timer);
      pipeline.stop();

      const matchedDevice = audioInputDevices.find((d) => d.deviceId === microphoneDeviceId);
      const micName = matchedDevice?.label || (microphoneDeviceId ? `Microphone (${microphoneDeviceId.slice(0, 8)})` : 'Default Windows Recording Device');

      let transcript = '';
      let sttLatencyMs = 0;
      if (res.playbackBase64 && window.fridayAPI?.transcribeSpeech) {
        const sttStart = Date.now();
        try {
          const tr = await window.fridayAPI.transcribeSpeech(res.playbackBase64, res.mimeType);
          sttLatencyMs = Date.now() - sttStart;
          transcript = tr.text || '(No speech detected in sample)';
        } catch {
          transcript = '(Transcription offline or unavailable)';
        }
      }

      setIsTestingMic(false);
      setMicTestResult({
        snrDb: res.snrDb,
        peakLevel: res.peakLevel,
        noiseFloor: res.noiseFloor,
        voiceDetected: res.voiceDetected,
        transcript,
        sttLatencyMs,
        micName,
        clipping: res.peakLevel >= 0.98,
        pipelineLatencyMs,
      });

      // Play back test audio so the user hears their processed, noise-suppressed speech
      if (res.playbackBase64) {
        const audio = new Audio(`data:${res.mimeType || 'audio/webm'};base64,${res.playbackBase64}`);
        audio.play().catch(() => {});
      }
    } catch (err: any) {
      clearInterval(timer);
      setIsTestingMic(false);
      setEnrollStatus(`Microphone test failed: ${err?.message || 'Access error'}`);
    }
  };

  const handleSelectProvider = (id: AiProviderId) => {
    setProviderId(id);
    setTestResult(null);
    if (providerStatus?.providers[id]) {
      const cfg = providerStatus.providers[id];
      setProviderApiKey(cfg.apiKey || '');
      setProviderModel(cfg.model || '');
      setProviderBaseUrl(cfg.baseUrl || '');
    }
  };

  const handleSave = async () => {
    if (window.fridayAPI?.saveProviderConfig) {
      await window.fridayAPI.saveProviderConfig(providerId, {
        apiKey: providerApiKey,
        model: providerModel,
        baseUrl: providerBaseUrl,
      });
      await window.fridayAPI.setAiProvider(
        providerId,
        fallbackProviderId === 'none' ? undefined : fallbackProviderId
      );
    }

    await onSaveSettings({
      apiKey: providerId === 'gemini' ? providerApiKey : apiKeyInput,
      aiProvider: providerId,
      fallbackAiProvider: fallbackProviderId === 'none' ? undefined : fallbackProviderId,
      preferredLanguage: language,
      voiceId,
      voiceAccent,
      ttsVoice,
      speechSpeed,
      speechVolume,
      pitch,
      ttsEngine,
      elevenLabsVoiceId,
      elevenLabsModel,
      elevenLabsStability,
      elevenLabsSimilarityBoost,
      elevenLabsStyle,
      elevenLabsSpeakerBoost,
      themeMode,
      personalityMode,
      handsFreeEnabled,
      handsFreeSilenceTimeoutMs,
      noiseSuppression,
      echoCancellation,
      autoGainControl,
      vadSensitivity,
      speakerVerificationEnabled,
      enrolledVoiceProfile: enrolledProfile,
      microphoneDeviceId,
      listeningEnvironment,
      desktopPetEnabled: settings.desktopPetEnabled !== false,
      approvedFolders,
      requireToolConfirmations: confirmations,
    });

    // Save VoiceFlow settings
    try {
      voiceFlowController.updateSettings({
        enabled: vfEnabled,
        mode: vfMode,
        directTranscription: vfDirect,
        model: vfModel,
        language: vfLanguage,
        shortcutEnabled: vfShortcut,
        restoreClipboard: vfRestoreClipboard,
      });
    } catch {}

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleTestKey = async () => {
    setIsTesting(true);
    setTestResult(null);
    if (window.fridayAPI?.saveProviderConfig && window.fridayAPI?.testProviderConnection) {
      await window.fridayAPI.saveProviderConfig(providerId, {
        apiKey: providerApiKey,
        model: providerModel,
        baseUrl: providerBaseUrl,
      });
      const res = await window.fridayAPI.testProviderConnection(providerId);
      setTestResult(res);
    } else {
      const res = await onTestConnection(apiKeyInput.includes('...') ? undefined : apiKeyInput);
      setTestResult(res);
    }
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

          {/* Section: Personality */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--muted)',
              }}
            >
              PERSONALITY MODE
            </label>
            <select
              value={personalityMode}
              onChange={(event) => setPersonalityMode(event.target.value as FridaySettings['personalityMode'])}
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
              <option value="simple" style={{ background: 'var(--surface)' }}>Simple — caring and gentle</option>
              <option value="moderate" style={{ background: 'var(--surface)' }}>Moderate — warm and firm</option>
              <option value="roast" style={{ background: 'var(--surface)' }}>Roast — blunt and sarcastic</option>
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted-dim)' }}>
              Personality changes wording and delivery only. Tools and decisions stay the same.
            </span>
          </div>

          {/* Section: Hands-free microphone */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--muted)',
              }}
            >
              HANDS-FREE MICROPHONE
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={handsFreeEnabled}
                onChange={(event) => setHandsFreeEnabled(event.target.checked)}
              />
              Keep wake-word detection available in standby
            </label>
            <label style={{ fontSize: '0.7rem', color: 'var(--muted-dim)' }}>
              Return to standby after {Math.round(handsFreeSilenceTimeoutMs / 1000)} seconds of silence
            </label>
            <input
              type="range"
              min={5_000}
              max={120_000}
              step={5_000}
              value={handsFreeSilenceTimeoutMs}
              onChange={(event) => setHandsFreeSilenceTimeoutMs(Number(event.target.value))}
              disabled={!handsFreeEnabled}
            />
            <span style={{ fontSize: '0.68rem', color: 'var(--muted-dim)' }}>
              Microphone access is visible in the status bar and can be disabled here at any time.
            </span>
          </div>

          {/* Section: Voice Isolation & Audio Pipeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
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
              <Mic size={14} color="var(--accent)" />
              <span>VOICE ISOLATION & AUDIO PIPELINE</span>
            </label>

            {/* Microphone Input Device Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Microphone Device</label>
              <select
                className="settings-select"
                value={microphoneDeviceId}
                onChange={(e) => setMicrophoneDeviceId(e.target.value)}
              >
                <option value="">Default Microphone</option>
                {audioInputDevices.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label || `Microphone ${dev.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Microphone Level Meter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--muted)' }}>
                <span>Live Microphone Input Level</span>
                <span>{Math.round(liveMicLevel * 100)}%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.round(liveMicLevel * 100))}%`,
                    height: '100%',
                    background: liveMicLevel > 0.8 ? '#ef4444' : liveMicLevel > 0.5 ? '#eab308' : '#10b981',
                    transition: 'width 0.08s ease',
                  }}
                />
              </div>
            </div>

            

            {/* Listening Environment Preset */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>Listening Environment</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                {(['quiet', 'noisy', 'very_noisy'] as const).map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => {
                      setListeningEnvironment(env);
                      const preset = ENVIRONMENT_PRESETS[env];
                      setNoiseSuppression(preset.noiseSuppression);
                      setVadSensitivity(preset.vadSensitivity);
                    }}
                    style={{
                      padding: '7px 4px',
                      fontSize: '0.72rem',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: listeningEnvironment === env ? 'var(--accent)' : 'var(--border-subtle)',
                      background: listeningEnvironment === env ? 'rgba(56, 189, 248, 0.15)' : 'var(--surface-sunken)',
                      color: listeningEnvironment === env ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: listeningEnvironment === env ? 600 : 400,
                      lineHeight: 1.3,
                      textAlign: 'center',
                    }}
                  >
                    {ENVIRONMENT_PRESETS[env].label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '0.66rem', color: 'var(--muted-dim)' }}>
                {ENVIRONMENT_PRESETS[listeningEnvironment].description}
              </span>
            </div>
            {/* Noise Suppression Selector (Off / Standard / Strong) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Noise Suppression</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                {(['off', 'standard', 'strong'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setNoiseSuppression(mode)}
                    style={{
                      padding: '6px',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: noiseSuppression === mode ? 'var(--accent)' : 'var(--border-subtle)',
                      background: noiseSuppression === mode ? 'rgba(56, 189, 248, 0.15)' : 'var(--surface-sunken)',
                      color: noiseSuppression === mode ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: noiseSuppression === mode ? 600 : 400,
                    }}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '0.66rem', color: 'var(--muted-dim)' }}>
                {noiseSuppression === 'off'
                  ? 'Raw microphone capture without noise filtering.'
                  : noiseSuppression === 'strong'
                    ? 'Aggressive vocal bandpass (100Hz–3.4kHz), multi-band noise gating & spectral expander.'
                    : 'Balanced WebRTC noise cancellation with vocal enhancement.'}
              </span>
            </div>

            {/* Echo Cancellation & Gain Control Toggles */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={echoCancellation}
                  onChange={(e) => setEchoCancellation(e.target.checked)}
                />
                Echo Cancellation (AEC)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={autoGainControl}
                  onChange={(e) => setAutoGainControl(e.target.checked)}
                />
                Auto Gain Control (AGC)
              </label>
            </div>

            {/* Voice Activity Detection Sensitivity */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Voice Detection Sensitivity</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                {(['low', 'medium', 'high'] as const).map((sens) => (
                  <button
                    key={sens}
                    type="button"
                    onClick={() => setVadSensitivity(sens)}
                    style={{
                      padding: '5px',
                      fontSize: '0.72rem',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: vadSensitivity === sens ? 'var(--accent)' : 'var(--border-subtle)',
                      background: vadSensitivity === sens ? 'rgba(56, 189, 248, 0.15)' : 'var(--surface-sunken)',
                      color: vadSensitivity === sens ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: vadSensitivity === sens ? 600 : 400,
                    }}
                  >
                    {sens.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Microphone Test Button & Diagnostics Output */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                type="button"
                onClick={handleTestMicrophone}
                disabled={isTestingMic}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  background: isTestingMic ? 'rgba(234, 179, 8, 0.2)' : 'var(--surface-raised)',
                  color: isTestingMic ? '#eab308' : 'var(--text)',
                  cursor: isTestingMic ? 'wait' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                }}
              >
                {isTestingMic ? (
                  <>
                    <Activity size={14} className="animate-spin" />
                    <span>Testing microphone... {micTestCountdown}s</span>
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    <span>Test Microphone & Audio Pipeline (3s playback)</span>
                  </>
                )}
              </button>

              {micTestResult && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    fontSize: '0.72rem',
                    color: 'var(--text)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Audio Diagnostics & Pipeline Verification</span>
                    <span style={{ fontSize: '0.66rem', color: '#10b981', fontWeight: 500 }}>Playing Processed Audio</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.7rem', color: 'var(--muted)' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Microphone:</span> <span style={{ color: 'var(--text)' }}>{micTestResult.micName}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Device Status:</span> <span style={{ color: '#10b981', fontWeight: 600 }}>● Active & Streaming</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Peak Input:</span> <span style={{ color: micTestResult.clipping ? '#ef4444' : 'var(--text)', fontWeight: micTestResult.clipping ? 700 : 400 }}>{Math.round(micTestResult.peakLevel * 100)}%{micTestResult.clipping ? ' (CLIPPING! Reduce gain)' : ''}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Noise Floor:</span> <span style={{ color: 'var(--text)' }}>{micTestResult.noiseFloor}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Signal-to-Noise:</span> <span style={{ color: micTestResult.snrDb > 10 ? '#10b981' : '#eab308', fontWeight: 600 }}>{micTestResult.snrDb} dB</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>VAD State:</span> <span style={{ color: micTestResult.voiceDetected ? '#10b981' : '#64748b' }}>{micTestResult.voiceDetected ? 'Speech Present' : 'Silence / Ambient'}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Noise Filter:</span> <span style={{ color: 'var(--text)' }}>{noiseSuppression.toUpperCase()}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Echo Cancel:</span> <span style={{ color: echoCancellation ? '#10b981' : '#64748b' }}>{echoCancellation ? 'Enabled' : 'Disabled'}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Audio Latency:</span> <span style={{ color: 'var(--text)' }}>~{micTestResult.pipelineLatencyMs || 15} ms</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>STT Latency:</span> <span style={{ color: 'var(--text)' }}>{micTestResult.sttLatencyMs ? `${micTestResult.sttLatencyMs} ms` : 'N/A'}</span></div>
                  </div>

                  {micTestResult.transcript && (
                    <div style={{ marginTop: '4px', padding: '6px 8px', borderRadius: '4px', background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', fontSize: '0.72rem' }}>
                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Recognized Speech: </span>
                      <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>"{micTestResult.transcript}"</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section: Speaker Verification */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text)' }}>
                  <ShieldCheck size={14} color="var(--accent)" />
                  <span>Speaker Verification</span>
                </label>
                <input
                  type="checkbox"
                  checked={speakerVerificationEnabled}
                  onChange={(e) => setSpeakerVerificationEnabled(e.target.checked)}
                />
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--muted-dim)' }}>
                Blocks desktop actions if the speaker voice does not match your enrolled voice biometric signature.
              </span>

              {/* Enrollment Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                {enrolledProfile ? (
                  <>
                    <span style={{ fontSize: '0.72rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={12} /> Voice Enrolled ({enrolledProfile.pitchMean}Hz pitch)
                    </span>
                    <button
                      type="button"
                      onClick={handleClearEnrollment}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.68rem',
                        borderRadius: '4px',
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#ef4444',
                        cursor: 'pointer',
                      }}
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted-dim)' }}>No voice enrolled yet.</span>
                )}

                <button
                  type="button"
                  onClick={handleEnrollVoice}
                  disabled={isEnrollingVoice}
                  style={{
                    marginLeft: 'auto',
                    padding: '5px 10px',
                    fontSize: '0.72rem',
                    borderRadius: '5px',
                    border: '1px solid var(--accent)',
                    background: isEnrollingVoice ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: 'var(--accent)',
                    cursor: isEnrollingVoice ? 'wait' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {isEnrollingVoice ? 'Recording (say test phrase)...' : enrolledProfile ? 'Re-enroll Voice' : 'Enroll My Voice'}
                </button>
              </div>

              {enrollStatus && (
                <div style={{ fontSize: '0.68rem', color: 'var(--accent)', marginTop: '2px' }}>
                  {enrollStatus}
                </div>
              )}
            </div>
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

          {/* Section: Modular AI Provider & Models */}
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
              <Key size={14} color="var(--accent)" />
              <span>AI PROVIDER & INTELLIGENCE</span>
            </label>

            {/* Provider Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted-dim)' }}>Primary Provider:</span>
              <select
                value={providerId}
                onChange={(e) => handleSelectProvider(e.target.value as AiProviderId)}
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                  borderRadius: '10px',
                  padding: '7px 10px',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="gemini">Google Gemini (Native Multimodal & Tools)</option>
                <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                <option value="anthropic">Anthropic Claude (Claude 3.5 Sonnet / Haiku)</option>
                <option value="openrouter">OpenRouter (Unified Multi-Model Gateway)</option>
                <option value="deepseek">DeepSeek (DeepSeek-Chat, Reasoner)</option>
                <option value="groq">Groq (Ultra-Fast Llama 3.3, Mixtral)</option>
                <option value="mistral">Mistral AI (Mistral Large, Codestral)</option>
                <option value="custom">Custom Endpoint (OpenAI Compatible)</option>
              </select>
            </div>

            {/* Model Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted-dim)' }}>Model Name:</span>
              <input
                type="text"
                value={providerModel}
                onChange={(e) => setProviderModel(e.target.value)}
                placeholder="e.g. gemini-3.1-pro-preview, gemini-3.5-flash, gpt-4o"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                  borderRadius: '10px',
                  padding: '7px 10px',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
            </div>

            {/* API Key */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted-dim)' }}>API Key:</span>
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
                  value={providerApiKey}
                  onChange={(e) => setProviderApiKey(e.target.value)}
                  placeholder={`Paste your ${providerId.toUpperCase()} API key`}
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
            </div>

            {/* Custom Base URL (if custom or openrouter) */}
            {(providerId === 'custom' || providerId === 'openrouter') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted-dim)' }}>API Base URL:</span>
                <input
                  type="text"
                  value={providerBaseUrl}
                  onChange={(e) => setProviderBaseUrl(e.target.value)}
                  placeholder="e.g. https://api.openrouter.ai/api/v1"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                    borderRadius: '10px',
                    padding: '7px 10px',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {/* Smart Fallback Provider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted-dim)' }}>Smart Fallback Provider (if primary is down):</span>
              <select
                value={fallbackProviderId}
                onChange={(e) => setFallbackProviderId(e.target.value as any)}
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                  borderRadius: '10px',
                  padding: '7px 10px',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="none">None (Fail immediately)</option>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="groq">Groq</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTesting}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  color: 'var(--accent)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: isTesting ? 'default' : 'pointer',
                }}
              >
                {isTesting ? 'Testing Provider...' : `Test ${providerId.toUpperCase()} Connection`}
              </button>
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
                Automatic — ElevenLabs, Edge, Gemini, then system
              </option>
              <option value="elevenlabs" style={{ background: 'var(--surface)' }}>
                ElevenLabs Flash (low-latency, expressive)
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

          {/* Section: ElevenLabs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)' }}>
              ELEVENLABS VOICE
            </label>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted-dim)' }}>
              The API key stays in the backend environment as <code>ELEVENLABS_API_KEY</code>. It is never stored in FRIDAY settings or sent to the renderer.
            </span>
            <input
              value={elevenLabsVoiceId}
              onChange={(event) => setElevenLabsVoiceId(event.target.value)}
              placeholder="ElevenLabs voice ID"
              style={{
                background: 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '9px',
                padding: '8px 10px',
                color: 'var(--text)',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            />
            <select
              value={elevenLabsModel}
              onChange={(event) => setElevenLabsModel(event.target.value as FridaySettings['elevenLabsModel'])}
              style={{
                background: 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '9px',
                padding: '7px 10px',
                color: 'var(--text)',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            >
              <option value="eleven_flash_v2_5" style={{ background: 'var(--surface)' }}>Flash v2.5 — fastest</option>
              <option value="eleven_multilingual_v2" style={{ background: 'var(--surface)' }}>Multilingual v2 — richer long-form delivery</option>
            </select>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Stability {elevenLabsStability.toFixed(2)}
              <input type="range" min="0" max="1" step="0.01" value={elevenLabsStability} onChange={(event) => setElevenLabsStability(Number(event.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </label>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Similarity {elevenLabsSimilarityBoost.toFixed(2)}
              <input type="range" min="0" max="1" step="0.01" value={elevenLabsSimilarityBoost} onChange={(event) => setElevenLabsSimilarityBoost(Number(event.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </label>
            <label style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Expressiveness {elevenLabsStyle.toFixed(2)}
              <input type="range" min="0" max="1" step="0.01" value={elevenLabsStyle} onChange={(event) => setElevenLabsStyle(Number(event.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'var(--muted)' }}>
              <input type="checkbox" checked={elevenLabsSpeakerBoost} onChange={(event) => setElevenLabsSpeakerBoost(event.target.checked)} />
              Speaker boost
            </label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.7rem', color: 'var(--muted-dim)' }}>
              <span>
                {elevenLabsUsage?.available
                  ? `${elevenLabsUsage.remainingCharacters?.toLocaleString() || 0} characters remaining`
                  : settings.elevenLabsConfigured
                  ? elevenLabsUsage?.error || 'Usage unavailable'
                  : 'Backend key not configured'}
              </span>
              <button type="button" onClick={() => void window.fridayAPI?.getElevenLabsUsage().then(setElevenLabsUsage)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.7rem' }}>
                Refresh usage
              </button>
            </div>
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

          {/* Section: FRIDAY VoiceFlow (Local AI Dictation) */}
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
              <Zap size={14} color="var(--accent)" />
              <span>FRIDAY VOICEFLOW (ALWAYS-READY DICTATION)</span>
            </label>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '10px 12px',
                backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
                borderRadius: '10px',
              }}
            >
              {/* Enabled Switch */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={vfEnabled}
                  onChange={(e) => setVfEnabled(e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span>Enable FRIDAY VoiceFlow</span>
              </label>

              <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                Activation: Say <em>"Friday, type this"</em>, click the desktop pet, or press <em>Ctrl+Alt+Space</em>.
              </div>

              {vfEnabled && (
                <>
                  {/* Mode selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--muted)', fontWeight: 600 }}>AI Enhancement Mode:</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                      {(['natural', 'professional', 'concise', 'code', 'verbatim'] as const).map((m) => {
                        const active = vfMode === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setVfMode(m)}
                            style={{
                              padding: '5px 6px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              cursor: 'pointer',
                              backgroundColor: active
                                ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                                : 'color-mix(in srgb, var(--text) 4%, transparent)',
                              border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                              color: active ? 'var(--accent)' : 'var(--muted)',
                            }}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Direct transcription toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--muted)', marginTop: '2px' }}>
                    <input
                      type="checkbox"
                      checked={vfDirect}
                      onChange={(e) => setVfDirect(e.target.checked)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span>Direct transcription only (bypass AI enhancement)</span>
                  </label>

                  {/* Model & Language row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>Speech Model:</span>
                      <select
                        value={vfModel}
                        onChange={(e) => setVfModel(e.target.value as any)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--surface-2)',
                          border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
                          color: 'var(--text)',
                          fontSize: '0.74rem',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="base">base (Balanced, ~140MB)</option>
                        <option value="tiny">tiny (Ultra-fast, ~75MB)</option>
                        <option value="small">small (High accuracy, ~480MB)</option>
                        <option value="turbo">turbo (Large v3 Turbo)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>Language:</span>
                      <select
                        value={vfLanguage}
                        onChange={(e) => setVfLanguage(e.target.value)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--surface-2)',
                          border: '1px solid color-mix(in srgb, var(--text) 12%, transparent)',
                          color: 'var(--text)',
                          fontSize: '0.74rem',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="auto">Auto (English, Telugu, Mixed)</option>
                        <option value="en">English (en)</option>
                        <option value="te">Telugu (te)</option>
                      </select>
                    </div>
                  </div>

                  {/* Clipboard Restoration & Shortcut */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--muted)' }}>
                      <input
                        type="checkbox"
                        checked={vfRestoreClipboard}
                        onChange={(e) => setVfRestoreClipboard(e.target.checked)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span>Restore user clipboard snapshot after paste</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--muted)' }}>
                      <input
                        type="checkbox"
                        checked={vfShortcut}
                        onChange={(e) => setVfShortcut(e.target.checked)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span>Enable global shortcut (Ctrl+Alt+Space)</span>
                    </label>
                  </div>

                  {/* History Preview */}
                  {vfHistory.length > 0 && (
                    <div style={{ marginTop: '6px', borderTop: '1px solid color-mix(in srgb, var(--text) 8%, transparent)', paddingTop: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)' }}>Recent Dictations:</span>
                        <button
                          type="button"
                          onClick={() => {
                            voiceFlowHistory.clear();
                            setVfHistory([]);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--muted)',
                            fontSize: '0.68rem',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Clear
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                        {vfHistory.map((h) => (
                          <div
                            key={h.id}
                            style={{
                              padding: '4px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'color-mix(in srgb, var(--text) 3%, transparent)',
                              fontSize: '0.7rem',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                              <span>{h.targetApp || 'App'}</span>
                              <span style={{ textTransform: 'capitalize' }}>{h.mode} • {h.latencyMs}ms</span>
                            </div>
                            <div style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {h.enhancedText || h.rawTranscript}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
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
