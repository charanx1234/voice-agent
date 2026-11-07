import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Minus, X, Sparkles, AlertCircle, Copy, Check, AlertTriangle } from 'lucide-react';
import { RobotCharacter } from './components/RobotCharacter';
import { AudioVisualizer } from './components/AudioVisualizer';
import { ControlBar } from './components/ControlBar';
import { TranscriptView } from './components/TranscriptView';
import { SettingsModal } from './components/SettingsModal';
import { ToolConfirmModal } from './components/ToolConfirmModal';
import { ToolShortcutsPanel } from './components/ToolShortcutsPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { Dashboard } from './components/Dashboard';
import { WebsiteAccessibilityPanel } from './components/WebsiteAccessibilityPanel';
import { VoiceDiagnosticsPanel } from './components/VoiceDiagnosticsPanel';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import { useHandsFree } from './hooks/useHandsFree';
import {
  ChatMessage,
  ConversationMood,
  DashboardArtifact,
  FaceExpression,
  FridaySettings,
  PersonalityMode,
  ReminderItem,
  ToolConfirmationPayload,
  VoiceDiagnosticsData,
  VoiceProsodySummary,
  VoiceSessionState,
  WebsiteAccessibilityState,
} from '@/shared/types';
import { pickGreeting } from '@/services/voice/greetings';
import { isLikelySilence } from '@/services/voice/micErrors';
import { applyMoodToSpeech } from '@/services/ai/mood';
import { selectFaceExpression } from '@/services/ai/faceExpressions';
import { takeCompleteSpeechChunks } from '@/services/voice/speechText';
import { copyTextToClipboard } from './utils/clipboard';
import { playWakeChime } from './utils/audioChime';
import { voiceTiming } from './utils/voiceTiming';
import { validateVoiceAction } from '@/services/agent/voiceActionGuard';
import { voiceSessionManager } from '@/services/voice/voiceSession';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<FridaySettings>({
    apiKey: '',
    hasCustomKey: false,
    preferredLanguage: 'te-IN',
    speechSpeed: 1.0,
    speechVolume: 1.0,
    pitch: 0,
    ttsEngine: 'auto',
    voiceId: 'default',
    voiceAccent: 'en-IN',
    ttsVoice: 'en-IN-NeerjaExpressiveNeural',
    elevenLabsVoiceId: '',
    elevenLabsModel: 'eleven_flash_v2_5',
    elevenLabsStability: 0.42,
    elevenLabsSimilarityBoost: 0.78,
    elevenLabsStyle: 0.18,
    elevenLabsSpeakerBoost: true,
    elevenLabsConfigured: false,
    ttsProvider: 'auto',
    themeMode: 'auto',
    approvedFolders: [],
    requireToolConfirmations: {
      notes: false,
      folderSearch: true,
      webResearch: false,
      launchApps: true,
    },
    modelName: 'gemini-3.1-pro-preview',
    soundMuted: false,
    memoryEnabled: true,
    personalityMode: 'moderate',
    handsFreeEnabled: true,
    handsFreeSilenceTimeoutMs: 25_000,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [artifacts, setArtifacts] = useState<DashboardArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ToolConfirmationPayload | null>(null);
  const [currentMood, setCurrentMood] = useState<ConversationMood>('calm');
  const [faceExpression, setFaceExpression] = useState<FaceExpression>('neutral');
  const [streamCopyStatus, setStreamCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isTextModeActive, setIsTextModeActive] = useState(false);
  const [voiceSessionState, setVoiceSessionState] = useState<VoiceSessionState>('STANDBY');
  const voiceSessionStateRef = useRef<VoiceSessionState>('STANDBY');
  voiceSessionStateRef.current = voiceSessionState;
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const diagnosticsOpenRef = useRef(false);
  diagnosticsOpenRef.current = diagnosticsOpen;
  const lastDiagUpdateRef = useRef(0);
  const [voiceDiagnostics, setVoiceDiagnostics] = useState<VoiceDiagnosticsData>({
    selectedMicDevice: 'Default Microphone',
    micPermissionStatus: 'granted',
    streamStatus: 'inactive',
    trackStatus: {
      label: 'Microphone',
      readyState: 'live',
      enabled: true,
      muted: false,
    },
    audioFormat: '16-bit Mono WAV (16,000 Hz)',
    sampleRate: 48000,
    liveLevel: 0,
    peakLevel: 0,
    ambientNoiseFloor: 0.02,
    isSpeechDetected: false,
    capturedDurationMs: 0,
    audioBufferSizeKb: 0,
    sessionState: 'STANDBY',
    sttStatus: 'idle',
    sttModel: 'gemini-2.5-flash',
    sttTranscript: '',
    geminiStatus: 'idle',
    ttsStatus: 'idle',
    lastError: null,
  });
  const [accessibilityState, setAccessibilityState] = useState<WebsiteAccessibilityState>({
    enabled: false,
    connected: false,
    browserName: 'Accessible Browser',
    currentUrl: 'about:blank',
    currentTitle: 'No page loaded',
    readingStatus: 'idle',
    readingSpeed: 1.0,
    currentElement: null,
    currentIndex: -1,
    totalElements: 0,
    lastCommand: '',
    statusMessage: 'Website Accessibility is ready.',
    language: 'en',
  });

  const {
    robotState,
    setRobotState,
    amplitude,
    frequencies,
    isListening,
    isMuted,
    setIsMuted,
    voices,
    startListening,
    stopListening,
    speakResponse,
    enqueueSpeech,
    interrupt,
  } = useVoiceAssistant();

  useEffect(() => {
    if (!window.fridayAPI?.onAccessibilityStateChanged) return undefined;
    return window.fridayAPI.onAccessibilityStateChanged((st) => setAccessibilityState(st));
  }, []);

  // Sync conversation messages across windows (Desktop Pet & Dashboard)
  useEffect(() => {
    if (!window.fridayAPI?.onChatMessageBroadcast) return undefined;
    return window.fridayAPI.onChatMessageBroadcast((msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });
  }, []);

  // Hands-free (wake word) state, read from timers/callbacks via refs.
  const robotStateRef = useRef(robotState);
  robotStateRef.current = robotState;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const requestIdRef = useRef(0);
  const activeStreamIdRef = useRef<string | null>(null);
  const streamBufferRef = useRef('');
  const streamedResponseRef = useRef('');
  const streamedSpeechQueuedRef = useRef(false);
  const streamSpeechOptionsRef = useRef<any>({});
  const standbyPendingRef = useRef(false);
  const streamCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goStandbyRef = useRef<() => void>(() => undefined);
  const handsFreeRef = useRef<{
    mode: 'off' | 'standby' | 'active';
    wake: () => void;
    goStandby: () => void;
    cancelActiveUtterance: () => void;
    finalizeCurrentUtterance: () => void;
  }>({
    mode: 'off',
    wake: () => undefined,
    goStandby: () => undefined,
    cancelActiveUtterance: () => undefined,
    finalizeCurrentUtterance: () => undefined,
  });

  // State transitions also drive the face when no response-specific emotion
  // has been selected. Speaking keeps the selected conversational expression
  // until playback ends, then returns smoothly to neutral.
  useEffect(() => {
    if (robotState === 'idle') setFaceExpression('neutral');
    else if (robotState === 'listening') setFaceExpression('curious');
    else if (robotState === 'interrupted') setFaceExpression('surprised');
    else if (robotState === 'error') setFaceExpression('sad');
  }, [robotState]);

  // Sync state with floating desktop pet
  useEffect(() => {
    if (!window.fridayAPI?.updatePetState) return;
    const sessionState =
      robotState === 'speaking'
        ? 'SPEAKING'
        : robotState === 'thinking'
          ? 'PROCESSING'
          : robotState === 'listening'
            ? 'LISTENING'
            : robotState === 'interrupted'
              ? 'INTERRUPTED'
              : robotState === 'error'
                ? 'TASK_UNSUPPORTED'
                : 'STANDBY';

    window.fridayAPI.updatePetState({
      robotState,
      voiceSessionState: sessionState,
      amplitude,
      expression: faceExpression,
      mood: currentMood,
      soundMuted: isMuted,
      handsFreeEnabled: settings.handsFreeEnabled,
      isSpeaking: robotState === 'speaking' || robotState === 'laughing',
    });

    if (window.fridayAPI?.updateVoiceState) {
      window.fridayAPI.updateVoiceState({
        sessionState,
        expression: faceExpression,
        mood: currentMood,
        isSpeaking: robotState === 'speaking' || robotState === 'laughing',
      });
    }
  }, [robotState, amplitude, faceExpression, currentMood, isMuted, settings.handsFreeEnabled]);

  // Listen for pet mic trigger click or interrupt
  useEffect(() => {
    if (!window.fridayAPI?.onVoiceTriggerMic) return undefined;
    return window.fridayAPI.onVoiceTriggerMic(() => {
      if (robotStateRef.current === 'speaking') {
        interrupt();
      } else if (robotStateRef.current === 'listening') {
        handsFreeRef.current.goStandby();
      } else {
        handsFreeRef.current.wake();
      }
    });
  }, [interrupt]);

  useEffect(() => {
    if (!window.fridayAPI?.onVoiceInterrupt) return undefined;
    return window.fridayAPI.onVoiceInterrupt(() => {
      interrupt();
    });
  }, [interrupt]);

  useEffect(() => () => {
    if (streamCopyTimerRef.current) clearTimeout(streamCopyTimerRef.current);
  }, []);

  const copyStreamingResponse = useCallback(async () => {
    const text = streamedResponseRef.current;
    if (!text.trim()) return;

    try {
      await copyTextToClipboard(text);
      setStreamCopyStatus('copied');
      if (streamCopyTimerRef.current) clearTimeout(streamCopyTimerRef.current);
      streamCopyTimerRef.current = setTimeout(() => setStreamCopyStatus('idle'), 1500);
    } catch {
      setStreamCopyStatus('error');
      if (streamCopyTimerRef.current) clearTimeout(streamCopyTimerRef.current);
      streamCopyTimerRef.current = setTimeout(() => setStreamCopyStatus('idle'), 1800);
    }
  }, []);

  useEffect(() => {
    if (!window.fridayAPI?.onResponseStream) return undefined;
    return window.fridayAPI.onResponseStream((event) => {
      if (!event.requestId || event.requestId !== activeStreamIdRef.current) return;
      if (event.type === 'delta' && event.text) {
        if (event.requestId) voiceTiming.recordFirstToken(event.requestId);
        streamedResponseRef.current += event.text;
        setStreamingResponse(streamedResponseRef.current);
        streamBufferRef.current += event.text;

        // Continuously update facial expression to match incoming emotional cues in stream
        const activeExpr = selectFaceExpression({
          state: 'speaking',
          mood: currentMood,
          personalityMode: settings.personalityMode,
          text: streamedResponseRef.current,
        });
        setFaceExpression(activeExpr);

        const extracted = takeCompleteSpeechChunks(streamBufferRef.current);
        streamBufferRef.current = extracted.remainder;
        for (const chunk of extracted.complete) {
          streamedSpeechQueuedRef.current = true;
          enqueueSpeech(chunk, streamSpeechOptionsRef.current);
        }
      }
    });
  }, [enqueueSpeech, currentMood, settings.personalityMode]);

  // Keep face expression in sync with robotState, mood, and personality mode when not speaking
  useEffect(() => {
    if (robotState === 'speaking') return;
    const lastMsg = messages[messages.length - 1]?.text || '';
    const restingExpr = selectFaceExpression({
      state: robotState,
      mood: currentMood,
      personalityMode: settings.personalityMode,
      text: lastMsg,
    });
    setFaceExpression(restingExpr);
  }, [robotState, currentMood, settings.personalityMode, messages]);

  /** Applies the resolved theme: 'auto' mirrors the Windows light/dark setting. */
  const applyTheme = useCallback((mode: FridaySettings['themeMode'] = 'auto') => {
    const prefersDark =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true;
    const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-mode', mode);
  }, []);

  // Follow the OS theme live while the user is on "Auto".
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const mode = document.documentElement.getAttribute('data-theme-mode') || 'auto';
      if (mode === 'auto') applyTheme('auto');
    };

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [applyTheme]);

  // Load initial settings and restore the previous conversation
  useEffect(() => {
    if (window.fridayAPI) {
      const api = window.fridayAPI;

      const bootstrap = async () => {
        const loaded = await api.getSettings();
        setSettings(loaded);
        setIsMuted(loaded.soundMuted);
        setHandsFreeEnabled(loaded.handsFreeEnabled !== false);
        applyTheme(loaded.themeMode);

        // Restore the persisted transcript so context survives a restart.
        const stored = await api.loadConversation(50);
        if (stored.length > 0) {
          setMessages(stored);
        } else {
          // Time-of-day greeting that never repeats the previous line, even across restarts.
          let lastGreeting: string | null = null;
          try {
            lastGreeting = window.localStorage.getItem('friday:lastGreeting');
          } catch {
            lastGreeting = null;
          }

          const greeting = pickGreeting(new Date(), lastGreeting);
          try {
            window.localStorage.setItem('friday:lastGreeting', greeting.key);
          } catch {
            // storage unavailable; rotation simply resets next launch
          }

          setMessages([
            {
              id: `msg_welcome_${Date.now()}`,
              role: 'assistant',
              text: greeting.text,
              timestamp: Date.now(),
              language: loaded.preferredLanguage,
            },
          ]);
        }

        const stats = await api.getMemoryStats();
        setMemoryCount(stats.total);

        const pendingReminders = await api.listReminders(false);
        if (api.accessibilityGetState) {
          api.accessibilityGetState().then(setAccessibilityState).catch(() => undefined);
        }
        setReminders(pendingReminders);
      };

      bootstrap().catch((err) => {
        console.error('[FRIDAY] Startup failed:', err?.message);
      });

      // Listen for tool confirmation events
      const cleanupConfirmations = api.onToolConfirmationRequired(
        (payload) => {
          setPendingConfirmation(payload);
        }
      );

      // Visual output from a voice turn: open/refresh the dashboard without leaving voice mode.
      const cleanupArtifacts = api.onDashboardArtifact((artifact) => {
        setArtifacts((previous) => [artifact, ...previous].slice(0, 8));
        setActiveArtifactId(artifact.id);
        setDashboardOpen(true);
        api.setDashboardOpen(true);
      });

      // A reminder fired: speak it and keep it in the transcript.
      const cleanupReminderFired = api.onReminderFired((reminder) => {
        setMessages((previous) => [
          ...previous,
          {
            id: `msg_reminder_${Date.now()}`,
            role: 'assistant',
            text: `Reminder: ${reminder.text}`,
            timestamp: Date.now(),
          },
        ]);
        speakResponse(`Reminder: ${reminder.text}`);
      });

      const cleanupReminders = api.onRemindersChanged((list) => {
        setReminders(list);
      });

      return () => {
        cleanupConfirmations();
        cleanupArtifacts();
        cleanupReminderFired();
        cleanupReminders();
      };
    }
  }, [setIsMuted, applyTheme]);

  // Handle saving settings
  const handleSaveSettings = async (updates: Partial<FridaySettings>) => {
    if (window.fridayAPI) {
      await window.fridayAPI.saveSettings(updates);
      const refreshed = await window.fridayAPI.getSettings();
      setSettings(refreshed);
      if (updates.handsFreeEnabled !== undefined) {
        setHandsFreeEnabled(refreshed.handsFreeEnabled !== false);
      }
      applyTheme(refreshed.themeMode);
    }
  };

  // Clear both the visible transcript and its persisted copy
  const handleClearHistory = async () => {
    setMessages([]);
    if (window.fridayAPI) {
      await window.fridayAPI.clearConversation();
    }
  };

  // Handle sending a typed or spoken message
  const handleSendMessage = useCallback(
    async (
      text: string,
      audioBase64?: string,
      audioMimeType?: string,
      prosody?: VoiceProsodySummary,
      turnId?: string,
      source: 'TEXT' | 'VOICE' = audioBase64 ? 'VOICE' : 'TEXT'
    ) => {
      const activeTurn = turnId || `turn_${Date.now()}_${++requestIdRef.current}`;
      activeStreamIdRef.current = activeTurn;
      let resolvedText = (text || '').trim();

      if (source === 'TEXT') {
        handsFreeRef.current?.cancelActiveUtterance?.();
        voiceSessionManager.startSession('TEXT');
      }

      // If speech transcript was not available from the browser, transcribe the audio first
      if (!resolvedText && audioBase64 && window.fridayAPI?.transcribeSpeech) {
        setRobotState('thinking');
        setVoiceSessionState('TRANSCRIBING');
        setVoiceDiagnostics((prev) => ({
          ...prev,
          sttStatus: 'requesting',
          sessionState: 'TRANSCRIBING',
          sttModel: 'gemini-2.5-flash',
        }));
        voiceTiming.recordTranscriptionStart(activeTurn);

        const sttStart = Date.now();
        let isTimedOut = false;
        const sttTimeout = setTimeout(() => {
          isTimedOut = true;
          console.warn('[App] STT request timed out after 12 seconds');
          setVoiceDiagnostics((prev) => ({
            ...prev,
            sttStatus: 'timeout',
            lastError: 'Speech transcription timed out after 12s.',
            sessionState: 'ERROR',
          }));
        }, 12000);

        try {
          const res = await window.fridayAPI.transcribeSpeech(audioBase64, audioMimeType);
          clearTimeout(sttTimeout);
          const sttDuration = Date.now() - sttStart;
          voiceTiming.recordTranscriptionEnd(activeTurn);

          if (activeStreamIdRef.current !== activeTurn) return; // Interrupted/superseded

          if (res?.success && res.text) {
            resolvedText = res.text.trim();
            setVoiceSessionState('TRANSCRIPT_RECEIVED');
            setVoiceDiagnostics((prev) => ({
              ...prev,
              sttStatus: 'completed',
              sttLatencyMs: sttDuration,
              sttTranscript: resolvedText,
              sessionState: 'TRANSCRIPT_RECEIVED',
            }));
          } else if (res?.error) {
            console.error('[App] STT returned error:', res.error);
            setVoiceDiagnostics((prev) => ({
              ...prev,
              sttStatus: 'error',
              lastError: res.error || 'Speech transcription failed',
              sessionState: 'ERROR',
            }));
            setRobotState('error');
            setVoiceSessionState('ERROR');
            appendNotice(`Speech recognition failed: ${res.error}`, true);
            return;
          } else {
            console.warn('[App] STT returned empty result');
            setVoiceDiagnostics((prev) => ({
              ...prev,
              sttStatus: 'completed',
              sttLatencyMs: sttDuration,
              sttTranscript: '',
            }));
          }
        } catch (err: any) {
          clearTimeout(sttTimeout);
          console.error('[App] Live speech transcription exception:', err);
          const errMsg = err?.message || 'Speech recognition network error';
          setVoiceDiagnostics((prev) => ({
            ...prev,
            sttStatus: 'error',
            lastError: errMsg,
            sessionState: 'ERROR',
          }));
          setRobotState('error');
          setVoiceSessionState('ERROR');
          appendNotice(`Speech recognition error: ${errMsg}`, true);
          return;
        }

        // If transcription produced explicit silence, return to standby cleanly without submitting
        if (resolvedText.toUpperCase() === 'SILENCE') {
          console.info('[App] Audio contained only ambient silence. Returning to standby.');
          setRobotState('idle');
          setVoiceSessionState('STANDBY');
          return;
        }

        // If user spoke but no speech words could be discerned:
        if (!resolvedText) {
          console.warn('[App] No discernable speech found in audio.');
          setRobotState('idle');
          setVoiceSessionState('STANDBY');
          appendNotice(
            settings.preferredLanguage?.startsWith('te')
              ? 'నాకు మాటలు స్పష్టంగా వినిపించలేదు. దయచేసి మైక్రోఫోన్‌కు దగ్గరగా మాట్లాడండి.'
              : 'I could not hear any clear speech. Please speak closer to the microphone.',
            true
          );
          return;
        }
      }

      if (activeStreamIdRef.current !== activeTurn) return;

      if (!resolvedText && !audioBase64) {
        setRobotState('idle');
        setVoiceSessionState('STANDBY');
        return;
      }

      // Strict Voice Action Protection: Block foreign assistant prompts and hallucinated background noise
      if (source === 'VOICE') {
        const actionCheck = validateVoiceAction(resolvedText, 'VOICE');
        if (!actionCheck.allowed) {
          setRobotState('idle');
          setVoiceSessionState('STANDBY');

          if (actionCheck.isForeignAssistant) {
            const foreignMsg = settings.preferredLanguage?.startsWith('te')
              ? 'ఆ కమాండ్ వేరే అసిస్టెంట్‌కి (Google/Siri/Alexa) ఉద్దేశించినది కాబట్టి నేను ఎటువంటి డెస్క్‌టాప్ యాక్షన్ చేయలేదు.'
              : 'That command was addressed to another assistant (Google/Siri/Alexa). Desktop actions were blocked for security.';
            const assistMsg: ChatMessage = {
              id: `msg_${Date.now()}_foreign`,
              role: 'assistant',
              text: foreignMsg,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistMsg]);
            window.fridayAPI?.broadcastChatMessage?.(assistMsg);
            void speakRef.current(foreignMsg, {
              languageCode: settings.preferredLanguage,
              voice: settings.ttsVoice,
              accent: settings.voiceAccent,
            });
            voiceSessionManager.log({
              source: 'VOICE',
              turnId: activeTurn,
              sttResult: resolvedText,
              actionDecision: { executed: false, reason: 'Blocked foreign assistant command' },
            });
            return;
          }

          // Discard noise / hallucinated background speech silently
          voiceSessionManager.log({
            source: 'VOICE',
            turnId: activeTurn,
            sttResult: resolvedText,
            actionDecision: { executed: false, reason: actionCheck.reason },
          });
          return;
        }
      }

      // Handle UNCLEAR speech in noisy environments
      if (resolvedText.toUpperCase() === 'UNCLEAR') {
        setRobotState('idle');
        setVoiceSessionState('STANDBY');
        const unclearMsg = settings.preferredLanguage?.startsWith('te')
          ? 'నాకు స్పష్టంగా వినిపించలేదు. దయచేసి మళ్ళీ చెప్పండి.'
          : 'I could not hear that clearly due to background noise. Could you please repeat?';
        const assistMsg: ChatMessage = {
          id: `msg_${Date.now()}_unclear`,
          role: 'assistant',
          text: unclearMsg,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistMsg]);
        window.fridayAPI?.broadcastChatMessage?.(assistMsg);
        void speakRef.current(unclearMsg, {
          languageCode: settings.preferredLanguage,
          voice: settings.ttsVoice,
          accent: settings.voiceAccent,
        });
        return;
      }

      // Handle incomplete commands (e.g. "Friday, open..." or "open...")
      const incompleteMatch = resolvedText.match(/^(?:(?:hey|hi|ok|okay)?\s*friday[,:\s]+)?(open|launch|search|play|read|start)[.\s…]*$/i);
      if (incompleteMatch) {
        setRobotState('idle');
        setVoiceSessionState('STANDBY');
        const verb = incompleteMatch[1].toLowerCase();
        let promptQuestion = `What would you like me to ${verb}?`;
        if (verb === 'open' || verb === 'launch') {
          promptQuestion = settings.preferredLanguage?.startsWith('te')
            ? 'మీరు ఏ అప్లికేషన్ ఓపెన్ చేయాలనుకుంటున్నారు?'
            : 'Which application would you like me to open?';
        } else if (verb === 'search') {
          promptQuestion = settings.preferredLanguage?.startsWith('te')
            ? 'మీరు దేని గురించి సెర్చ్ చేయాలనుకుంటున్నారు?'
            : 'What would you like me to search for?';
        } else if (verb === 'play') {
          promptQuestion = settings.preferredLanguage?.startsWith('te')
            ? 'ఏ పాట లేదా సంగీతం ప్లే చేయాలి?'
            : 'What song or music would you like me to play?';
        }

        const incompleteMsg: ChatMessage = {
          id: `msg_${Date.now()}_incomplete`,
          role: 'assistant',
          text: promptQuestion,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, incompleteMsg]);
        window.fridayAPI?.broadcastChatMessage?.(incompleteMsg);
        void speakRef.current(promptQuestion, {
          languageCode: settings.preferredLanguage,
          voice: settings.ttsVoice,
          accent: settings.voiceAccent,
        });
        return;
      }

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        text: resolvedText || '🎤 Spoken message',
        timestamp: Date.now(),
        isVoice: source === 'VOICE',
      };

      setMessages((prev) => [...prev, userMsg]);
      window.fridayAPI?.broadcastChatMessage?.(userMsg);
      setLiveTranscript('');
      setStreamingResponse('');
      setStreamCopyStatus('idle');
      setRobotState('thinking');
      setVoiceSessionState('THINKING');
      setFaceExpression(
        selectFaceExpression({
          state: 'thinking',
          mood: currentMood,
          personalityMode: settings.personalityMode,
          text: resolvedText,
        })
      );
      streamBufferRef.current = '';
      streamedResponseRef.current = '';
      streamedSpeechQueuedRef.current = false;
       const initialMoodSpeech = applyMoodToSpeech(
         settings.speechSpeed,
         settings.pitch,
         currentMood,
         settings.personalityMode
       );
      // Check if website accessibility handles the voice command
      const isAccessibilityIntent =
        accessibilityState.enabled ||
        /\b(accessibility|website|web page|active tab|read (this )?page|summarize (this )?website|next heading|previous heading|next paragraph|scroll (down|up)|click (the )?\w+|find (the )?search|fill (in )?\w+|stop reading|chaduvu|saramsam|heading|nokku|padho|batao)\b/i.test(resolvedText);

      if (isAccessibilityIntent && window.fridayAPI?.accessibilityExecuteCommand) {
        try {
          const a11yResult = await window.fridayAPI.accessibilityExecuteCommand(resolvedText, {
            language: settings.preferredLanguage,
          });

          if (a11yResult && a11yResult.speechText) {
            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}_a`,
              role: 'assistant',
              text: a11yResult.speechText,
              timestamp: Date.now(),
              language: settings.preferredLanguage,
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setRobotState('speaking');
            setVoiceSessionState('SPEAKING');
            setFaceExpression(
              selectFaceExpression({
                state: 'speaking',
                mood: currentMood,
                personalityMode: settings.personalityMode,
                text: a11yResult.speechText,
              })
            );
            if (!settings.soundMuted) {
              await speakResponse(a11yResult.speechText, streamSpeechOptionsRef.current);
            }
            setRobotState('idle');
            setVoiceSessionState('STANDBY');
            return;
          }
        } catch (err) {
          console.warn('[WebsiteAccessibility] Command execution error:', err);
        }
      }

      streamSpeechOptionsRef.current = {
        languageCode: settings.preferredLanguage,
        rate: initialMoodSpeech.rate,
        volume: settings.speechVolume,
        pitch: initialMoodSpeech.pitch,
        voiceId: settings.voiceId,
        voice: settings.ttsVoice,
        accent: settings.voiceAccent,
        engine: settings.ttsEngine,
        elevenLabsVoiceId: settings.elevenLabsVoiceId,
        elevenLabsModel: settings.elevenLabsModel,
        elevenLabsStability: settings.elevenLabsStability,
        elevenLabsSimilarityBoost: settings.elevenLabsSimilarityBoost,
        elevenLabsStyle: settings.elevenLabsStyle,
        elevenLabsSpeakerBoost: settings.elevenLabsSpeakerBoost,
        onChunkStart: (chunkText: string) => {
          voiceTiming.recordFirstTtsAudio(activeTurn);
          setRobotState('speaking');
          setVoiceSessionState('SPEAKING');
          const chunkExpr = selectFaceExpression({
            state: 'speaking',
            mood: currentMood,
            personalityMode: settings.personalityMode,
            text: chunkText,
          });
          setFaceExpression(chunkExpr);
        },
      };

      try {
        if (!window.fridayAPI) {
          throw new Error('Electron API bridge unavailable');
        }

        voiceTiming.recordAiStart(activeTurn);
        const response = await window.fridayAPI.sendMessage({
          message: resolvedText,
          audioBase64: resolvedText ? undefined : audioBase64,
          audioMimeType,
          conversationHistory: messagesRef.current,
          language: settings.preferredLanguage,
          prosody,
          requestId: activeTurn,
        });

        // User interrupted (barge-in) while this was in flight: drop the stale reply.
        if (activeTurn !== activeStreamIdRef.current || response.cancelled) return;
        voiceTiming.recordAiComplete(activeTurn);

        const failed = Boolean(response.error);
        const assistantMsg: ChatMessage = {
          id: `msg_${Date.now()}_a`,
          role: 'assistant',
          text: response.text,
          timestamp: Date.now(),
          language: response.detectedLanguage,
          toolCalls: response.toolCalls,
          isError: failed,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        window.fridayAPI?.broadcastChatMessage?.(assistantMsg);
        setStreamingResponse('');
        activeStreamIdRef.current = null;

        // An accent switch must apply to this very reply, so refresh settings
        // before speaking and speak with the freshly saved voice.
        let effectiveSettings = settings;
        if (
          response.toolCalls?.some(
            (call) => call.toolName === 'set_voice_accent' || call.toolName === 'set_personality_mode'
          )
        ) {
          try {
            const fresh = await window.fridayAPI.getSettings();
            setSettings(fresh);
            effectiveSettings = fresh;
          } catch {
            // fall back to the cached settings
          }
        }

        // Failures are shown as errors, never spoken as if they were answers.
        if (failed) {
          setRobotState('error');
          const failedDesktopAction = response.toolCalls?.some((call) => call.toolName === 'launch_allowed_app');
          if (failedDesktopAction && !isMuted && response.text) {
            await speakResponse(response.text, {
              languageCode: effectiveSettings.preferredLanguage,
              rate: effectiveSettings.speechSpeed,
              volume: effectiveSettings.speechVolume,
              pitch: effectiveSettings.pitch,
              voiceId: effectiveSettings.voiceId,
              voice: effectiveSettings.ttsVoice,
              accent: effectiveSettings.voiceAccent,
              engine: effectiveSettings.ttsEngine,
            });
          }
          setTimeout(() => setRobotState('idle'), 1200);
          return;
        }

        const mood = response.mood || 'calm';
        setCurrentMood(mood);
        setFaceExpression(
          selectFaceExpression({
            state: 'speaking',
            mood,
            personalityMode: effectiveSettings.personalityMode,
            text: response.text,
          })
        );
        const moodSpeech = applyMoodToSpeech(
          effectiveSettings.speechSpeed,
          effectiveSettings.pitch,
          mood,
          effectiveSettings.personalityMode
        );

        const speechOptions = {
          languageCode: response.detectedLanguage || effectiveSettings.preferredLanguage,
          rate: moodSpeech.rate,
          volume: effectiveSettings.speechVolume,
          pitch: moodSpeech.pitch,
          voiceId: effectiveSettings.voiceId,
          voice: effectiveSettings.ttsVoice,
          accent: effectiveSettings.voiceAccent,
          engine: effectiveSettings.ttsEngine,
          elevenLabsVoiceId: effectiveSettings.elevenLabsVoiceId,
          elevenLabsModel: effectiveSettings.elevenLabsModel,
          elevenLabsStability: effectiveSettings.elevenLabsStability,
          elevenLabsSimilarityBoost: effectiveSettings.elevenLabsSimilarityBoost,
          elevenLabsStyle: effectiveSettings.elevenLabsStyle,
          elevenLabsSpeakerBoost: effectiveSettings.elevenLabsSpeakerBoost,
          onChunkStart: (chunkText: string) => {
            const chunkExpr = selectFaceExpression({
              state: 'speaking',
              mood,
              personalityMode: effectiveSettings.personalityMode,
              text: chunkText,
            });
            setFaceExpression(chunkExpr);
          },
        };
        streamSpeechOptionsRef.current = speechOptions;

        // Streamed sentence audio is already queued while Gemini was generating.
        // Flush the final incomplete phrase, or use the legacy full-response path
        // when the provider returned no stream text.
        if (!isMuted) {
          if (streamedSpeechQueuedRef.current) {
            if (streamBufferRef.current.trim()) {
              enqueueSpeech(streamBufferRef.current, speechOptions);
            }
          } else {
            await speakResponse(response.text, { ...speechOptions, audioBase64: response.audioBase64 });
          }
        }
        setRobotState('idle');
        setVoiceSessionState('STANDBY');

        // The model called enter_standby ("go offline"): go quiet after the farewell.
        if (standbyPendingRef.current) {
          standbyPendingRef.current = false;
          goStandbyRef.current();
        }
      } catch (err: any) {
        setRobotState('error');
        setFaceExpression('sad');
        const errorMsg: ChatMessage = {
          id: `msg_${Date.now()}_err`,
          role: 'assistant',
          text: `Error: ${err.message || 'Failed to communicate with Gemini.'}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    },
    [messages, settings, isMuted, currentMood, speakResponse, enqueueSpeech, setRobotState]
  );

  // Visible feedback for voice problems, instead of a silent "Service Error" badge.
  const appendNotice = useCallback((text: string, isError = false) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}_notice`,
        role: 'assistant',
        text,
        timestamp: Date.now(),
        isError,
      },
    ]);
  }, []);

  // Toggle microphone
  const handleToggleMic = async () => {
    // Hands-free owns the persistent microphone session. A mic click wakes it
    // instead of creating a second competing MediaStream.
    if (handsFreeEnabled && handsFreeRef.current.mode !== 'off') {
      if (handsFreeRef.current.mode === 'standby') {
        handsFreeRef.current.wake();
        setRobotState('listening');
        setVoiceSessionState('LISTENING');
        setFaceExpression('curious');
      } else {
        // User clicked mic while listening/speaking: finalize and submit utterance immediately
        handsFreeRef.current.finalizeCurrentUtterance();
      }
      return;
    }

    if (isListening) {
      // User finished speaking: stop recorder and send to Gemini
      const { audioBase64, mimeType, recognizedText, peakLevel, prosody } = await stopListening();
      setLiveTranscript('');

      if (!audioBase64) {
        setRobotState('idle');
        appendNotice(
          'I could not hear anything — no audio was captured. Check that your microphone is connected and not muted, then try again.',
          true
        );
        return;
      }

      const minQualityPeak = settings.audioQualityThreshold || 0.03;
      if (!recognizedText && (isLikelySilence(peakLevel) || peakLevel < minQualityPeak)) {
        setRobotState('idle');
        appendNotice(
          'I could not hear any speech clearly. Please speak closer to the microphone.',
          true
        );
        return;
      }

      // When local/browser recognition produced a final transcript, send text
      // directly instead of making Gemini decode the same audio again. Audio
      // remains the fallback when recognition is unavailable.
      handleSendMessage(recognizedText, recognizedText ? undefined : audioBase64, mimeType, prosody);
    } else {
      // User tapped mic to speak
      try {
        await startListening(
          settings.preferredLanguage,
          (transcript) => setLiveTranscript(transcript),
          {
            deviceId: settings.microphoneDeviceId,
            noiseSuppression: settings.noiseSuppression,
            echoCancellation: settings.echoCancellation,
            autoGainControl: settings.autoGainControl,
          }
        );
      } catch (err: any) {
        setRobotState('error');
        appendNotice(err?.message || 'Could not start the microphone.', true);
        setTimeout(() => setRobotState('idle'), 1800);
      }
    }
  };

  // Show how long the microphone has been recording.
  useEffect(() => {
    if (!isListening) {
      setRecordingSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    setRecordingSeconds(0);
    const timer = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);

    return () => clearInterval(timer);
  }, [isListening]);

  // ---- Hands-free: always-on wake word, barge-in and standby ----
  const [handsFreeEnabled, setHandsFreeEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('friday:handsFree') !== 'off';
    } catch {
      return true;
    }
  });

  const sendRef = useRef(handleSendMessage);
  sendRef.current = handleSendMessage;
  const speakRef = useRef(speakResponse);
  speakRef.current = speakResponse;

  const handsFree = useHandsFree({
    enabled: handsFreeEnabled,
    isMicMuted,
    isTextModeActive,
    language: settings.preferredLanguage,
    silenceTimeoutMs: settings.handsFreeSilenceTimeoutMs,
    noiseSuppression: settings.noiseSuppression || 'standard',
    echoCancellation: settings.echoCancellation !== false,
    autoGainControl: settings.autoGainControl !== false,
    vadSensitivity: settings.vadSensitivity || 'medium',
    listeningEnvironment: settings.listeningEnvironment || 'quiet',
    speakerVerificationEnabled: settings.speakerVerificationEnabled,
    enrolledVoiceProfile: settings.enrolledVoiceProfile,
    deviceId: settings.microphoneDeviceId,
    onLevel: (lvl) => {
      if (window.fridayAPI?.updateVoiceLevel) {
        window.fridayAPI.updateVoiceLevel(lvl);
      }
    },
    isSpeaking: () => robotStateRef.current === 'speaking',
    isBusy: () => robotStateRef.current === 'thinking',
    onBargeIn: () => {
      // Invalidate any in-flight reply and stop talking so we hear the user first.
      const cancelledTurn = activeStreamIdRef.current;
      requestIdRef.current += 1;
      standbyPendingRef.current = false;
      voiceTiming.recordInterruption();
      window.fridayAPI?.cancelResponse(cancelledTurn || undefined);
      window.fridayAPI?.cancelSpeech();
      activeStreamIdRef.current = null;
      streamBufferRef.current = '';
      setStreamingResponse('');
      interrupt();
      voiceTiming.recordPlaybackCancelled();
      if (window.fridayAPI?.voiceInterrupt) {
        window.fridayAPI.voiceInterrupt();
      }
      setRobotState('interrupted');
      setVoiceSessionState('INTERRUPTED');
      setFaceExpression('surprised');
      setTimeout(() => {
        if (robotStateRef.current === 'interrupted') {
          setRobotState('listening');
          setVoiceSessionState('LISTENING');
          setFaceExpression('curious');
        }
      }, 180);
    },
    onSpeechActivity: (speaking) => {
      if (speaking) {
        setRobotState('listening');
        setVoiceSessionState('SPEECH_DETECTED');
        setVoiceDiagnostics((prev) => ({ ...prev, sessionState: 'SPEECH_DETECTED', isSpeechDetected: true }));
      } else {
        setVoiceDiagnostics((prev) => ({ ...prev, isSpeechDetected: false }));
      }
    },
    onDiagnostics: (diag) => {
      if (!diagnosticsOpenRef.current) return;
      const now = Date.now();
      if (now - lastDiagUpdateRef.current < 200) return;
      lastDiagUpdateRef.current = now;
      setVoiceDiagnostics((prev) => ({
        ...prev,
        ...diag,
        sessionState: voiceSessionStateRef.current,
      }));
    },
    onTranscript: (text) => setLiveTranscript(text),
    onUtterance: ({ audioBase64, mimeType, peakLevel, durationMs, recognizedText, prosody, isVerifiedSpeaker, turnId }) => {
      setVoiceSessionState('PROCESSING_AUDIO');
      setVoiceDiagnostics((prev) => ({
        ...prev,
        sessionState: 'PROCESSING_AUDIO',
        capturedDurationMs: durationMs,
        peakLevel,
      }));
      const minPeak = settings.audioQualityThreshold || 0.03;
      if (isLikelySilence(peakLevel) || peakLevel < minPeak) return;
      if (settings.speakerVerificationEnabled && isVerifiedSpeaker === false) {
        const text = "I heard speech, but it doesn't match your enrolled voice. Desktop actions were blocked for security.";
        const msg: ChatMessage = {
          id: `msg_${Date.now()}_unverified`,
          role: 'assistant',
          text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, msg]);
        window.fridayAPI?.broadcastChatMessage?.(msg);
        setFaceExpression('not-happy');
        void speakRef.current(text, {
          languageCode: settings.preferredLanguage,
          voice: settings.ttsVoice,
          accent: settings.voiceAccent,
        });
        return;
      }
      const resolvedTurn = turnId || `turn_${Date.now()}_${++requestIdRef.current}`;
      voiceTiming.startTurn(resolvedTurn, Date.now() - (prosody?.durationMs || 500));
      voiceTiming.recordSpeechEnd(resolvedTurn);
      void sendRef.current(
        recognizedText,
        recognizedText ? undefined : audioBase64,
        mimeType,
        prosody,
        resolvedTurn
      );
    },
    onWake: (command) => {
      setVoiceSessionState('WAKE_WORD_DETECTED');
      if (command) {
        void sendRef.current(command);
      } else {
        // Instant silent wake-up: show visual aura, switch robot & pet state to listening, play subtle chime, stay completely silent
        setRobotState('listening');
        setVoiceSessionState('LISTENING');
        setFaceExpression('excited');
        playWakeChime();
        void window.fridayAPI?.syncDesktopPetState({
          state: 'LISTENING',
          robotState: 'listening',
          expression: 'excited',
        });
      }
    },
    onError: (message) => appendNotice(message, true),
  });
  handsFreeRef.current = handsFree;
  goStandbyRef.current = handsFree.goStandby;

  // "Go offline": the model calls enter_standby; go quiet once the farewell is spoken.
  useEffect(() => {
    if (!window.fridayAPI?.onStandbyRequested) return undefined;
    return window.fridayAPI.onStandbyRequested(() => {
      standbyPendingRef.current = true;
    });
  }, []);

  const handleToggleHandsFree = () => {
    const next = !handsFreeEnabled;
    setHandsFreeEnabled(next);
    void handleSaveSettings({ handsFreeEnabled: next });
    try {
      window.localStorage.setItem('friday:handsFree', next ? 'on' : 'off');
    } catch {
      // storage unavailable; preference simply resets next launch
    }
  };

  const handleToolResponse = (confirmed: boolean) => {
    if (pendingConfirmation && window.fridayAPI) {
      window.fridayAPI.respondToolConfirmation(pendingConfirmation.id, confirmed);
      setPendingConfirmation(null);
    }
  };

  const handleOpenFile = (filePath: string) => {
    if (window.fridayAPI) {
      window.fridayAPI.openPathInExplorer(filePath);
    }
  };

  const handleCloseDashboard = () => {
    setDashboardOpen(false);
    window.fridayAPI?.setDashboardOpen(false);
  };

  const handleToggleDashboard = () => {
    const nextOpen = !dashboardOpen;
    setDashboardOpen(nextOpen);
    window.fridayAPI?.setDashboardOpen(nextOpen);
  };

  const handleCompleteReminder = async (id: string) => {
    if (!window.fridayAPI) return;
    await window.fridayAPI.completeReminder(id);
    const list = await window.fridayAPI.listReminders(false);
    setReminders(list);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Sleek Custom Titlebar */}
      <div
        className="app-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '38px',
          padding: '0 12px',
          backgroundColor: 'color-mix(in srgb, var(--surface) 85%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--text) 6%, transparent)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={15} color="var(--accent)" />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text)' }}>
            FRIDAY
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--muted-dim)', fontWeight: 500 }}>
            AI ASSISTANT
          </span>
        </div>

        {/* Window controls (Minimize, Close) */}
        <div
          className="app-no-drag"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <button
            onClick={() => window.fridayAPI?.minimizeWindow()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => window.fridayAPI?.closeWindow()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Companion column: voice keeps running here while the dashboard updates */}
        <div
          style={{
            flex: dashboardOpen ? '0 0 460px' : '1 1 auto',
            width: dashboardOpen ? 460 : '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {/* Missing API Key Banner */}
          {!settings.hasCustomKey && (
            <div
              onClick={() => setSettingsOpen(true)}
              style={{
                backgroundColor: 'color-mix(in srgb, var(--warning) 15%, transparent)',
                borderBottom: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.74rem',
                color: 'var(--warning)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={14} />
                <span>Click here to enter your Google Gemini API key to activate FRIDAY</span>
              </div>
              <span style={{ textDecoration: 'underline', fontWeight: 600 }}>Configure</span>
            </div>
          )}

          {/* Main Companion Body */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              padding: '6px 0',
              overflow: 'hidden',
            }}
          >
            {/* Animated Robot Character */}
            <RobotCharacter
              state={handsFree.mode === 'standby' ? 'sleeping' : robotState}
              amplitude={amplitude}
              frequencies={frequencies}
              mood={currentMood}
              expression={handsFree.mode === 'standby' ? 'sleepy' : faceExpression}
              onClick={() => {
                requestIdRef.current += 1;
                window.fridayAPI?.cancelResponse(activeStreamIdRef.current || undefined);
                activeStreamIdRef.current = null;
                setStreamingResponse('');
                interrupt();
              }}
            />

            {/* Live Audio Visualizer */}
            <AudioVisualizer
              frequencies={frequencies}
              isActive={isListening || robotState === 'speaking'}
            />
            {liveTranscript && (
              <div
                style={{
                  maxWidth: '84%',
                  marginTop: '10px',
                  color: 'var(--muted)',
                  fontSize: '0.78rem',
                  textAlign: 'center',
                  lineHeight: 1.4,
                }}
              >
                {liveTranscript}
              </div>
            )}
            {streamingResponse && (
              <div
                style={{
                  maxWidth: '88%',
                  marginTop: '10px',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{streamingResponse}</span>
                <button
                  type="button"
                  onClick={() => void copyStreamingResponse()}
                  title={streamCopyStatus === 'error' ? 'Clipboard access failed' : 'Copy response so far'}
                  aria-label={streamCopyStatus === 'error' ? 'Copy failed' : streamCopyStatus === 'copied' ? 'Copied' : 'Copy response so far'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    flexShrink: 0,
                    padding: '2px 4px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: streamCopyStatus === 'error' ? 'var(--danger)' : streamCopyStatus === 'copied' ? 'var(--success)' : 'var(--muted-dim)',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                  }}
                >
                  {streamCopyStatus === 'error' ? <AlertTriangle size={11} /> : streamCopyStatus === 'copied' ? <Check size={11} /> : <Copy size={11} />}
                  <span>{streamCopyStatus === 'error' ? 'Copy failed' : streamCopyStatus === 'copied' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Conversation Transcript (Collapsible) */}
          {transcriptOpen && (
            <TranscriptView
              messages={messages}
              streamingResponse={streamingResponse}
              onClearHistory={handleClearHistory}
              onOpenFile={handleOpenFile}
            />
          )}

          {/* Bottom Control Bar */}
          <ControlBar
            state={robotState}
            voiceSessionState={voiceSessionState}
            isListening={isListening}
            isMuted={isMuted}
            hasApiKey={settings.hasCustomKey}
            messageCount={messages.length}
            memoryCount={memoryCount}
            transcriptOpen={transcriptOpen}
            recordingSeconds={recordingSeconds}
            handsFreeMode={handsFree.mode}
            personalityMode={settings.personalityMode}
            currentMood={currentMood}
            onToggleHandsFree={handleToggleHandsFree}
            onToggleMic={handleToggleMic}
            isMicMuted={isMicMuted}
            onToggleMicMute={() => {
              const next = !isMicMuted;
              setIsMicMuted(next);
              voiceSessionManager.setMicMuted(next);
            }}
            onTextFocus={() => setIsTextModeActive(true)}
            onTextBlur={() => setIsTextModeActive(false)}
            onSendMessage={(txt) => {
              setIsTextModeActive(false);
              handleSendMessage(txt, undefined, undefined, undefined, undefined, 'TEXT');
            }}
            onToggleMute={() => {
              const next = !isMuted;
              setIsMuted(next);
              handleSaveSettings({ soundMuted: next });
            }}
            onToggleTranscript={() => setTranscriptOpen(!transcriptOpen)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenMemory={() => setMemoryOpen(true)}
            dashboardOpen={dashboardOpen}
            dashboardCount={artifacts.length}
            onToggleDashboard={handleToggleDashboard}
            accessibilityOpen={accessibilityOpen}
            accessibilityActive={accessibilityState.enabled}
            onToggleAccessibility={() => setAccessibilityOpen(!accessibilityOpen)}
            diagnosticsOpen={diagnosticsOpen}
            onOpenDiagnostics={() => setDiagnosticsOpen(!diagnosticsOpen)}
          />
        </div>

        {dashboardOpen && (
          <Dashboard
            artifacts={artifacts}
            activeId={activeArtifactId}
            onSelect={setActiveArtifactId}
            onClose={handleCloseDashboard}
            reminders={reminders}
            onCompleteReminder={handleCompleteReminder}
          />
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        voices={voices}
        onSaveSettings={handleSaveSettings}
        onTestConnection={(override) => window.fridayAPI.testGeminiConnection(override)}
        onTestVoice={(text) =>
          speakResponse(text, {
            languageCode: settings.preferredLanguage,
            rate: settings.speechSpeed,
            volume: settings.speechVolume,
            pitch: settings.pitch,
            voiceId: settings.voiceId,
            voice: settings.ttsVoice,
            accent: settings.voiceAccent,
            engine: settings.ttsEngine,
            elevenLabsVoiceId: settings.elevenLabsVoiceId,
            elevenLabsModel: settings.elevenLabsModel,
            elevenLabsStability: settings.elevenLabsStability,
            elevenLabsSimilarityBoost: settings.elevenLabsSimilarityBoost,
            elevenLabsStyle: settings.elevenLabsStyle,
            elevenLabsSpeakerBoost: settings.elevenLabsSpeakerBoost,
          })
        }
        onSelectApprovedFolder={() => window.fridayAPI.selectApprovedFolder()}
      />

      {/* Tool Permission Confirmation Modal */}
      <ToolConfirmModal
        request={pendingConfirmation}
        onRespond={handleToolResponse}
      />

      {/* Tool Shortcuts Panel */}
      <ToolShortcutsPanel
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        onAskFriday={(prompt) => handleSendMessage(prompt)}
      />

      {/* Long-Term Memory Panel */}
      <MemoryPanel
        isOpen={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        memoryEnabled={settings.memoryEnabled !== false}
        onToggleMemory={(enabled) => handleSaveSettings({ memoryEnabled: enabled })}
        onChanged={setMemoryCount}
      />

      {/* Website Accessibility Assistant Panel */}
      <WebsiteAccessibilityPanel
        isOpen={accessibilityOpen}
        onClose={() => setAccessibilityOpen(false)}
        accessibilityState={accessibilityState}
        onToggleEnabled={async () => {
          if (window.fridayAPI) {
            const next = await window.fridayAPI.accessibilitySetEnabled(!accessibilityState.enabled);
            setAccessibilityState(next);
          }
        }}
        onOpenUrl={(url) => window.fridayAPI?.accessibilityOpenUrl(url)}
        onExecuteCommand={(cmd) => handleSendMessage(cmd)}
        onSetReadingSpeed={(spd) => window.fridayAPI?.accessibilitySetReadingSpeed(spd)}
        onStopReading={() => {
          window.fridayAPI?.accessibilityStopReading();
          interrupt();
        }}
      />

      {/* Real-time Voice Diagnostics Panel */}
      <VoiceDiagnosticsPanel
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        diagnostics={voiceDiagnostics}
      />
    </div>
  );
};

