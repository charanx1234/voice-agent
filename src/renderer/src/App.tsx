import React, { useState, useEffect, useCallback } from 'react';
import { Minus, X, Sparkles, AlertCircle } from 'lucide-react';
import { RobotCharacter } from './components/RobotCharacter';
import { AudioVisualizer } from './components/AudioVisualizer';
import { ControlBar } from './components/ControlBar';
import { TranscriptView } from './components/TranscriptView';
import { SettingsModal } from './components/SettingsModal';
import { ToolConfirmModal } from './components/ToolConfirmModal';
import { ToolShortcutsPanel } from './components/ToolShortcutsPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { Dashboard } from './components/Dashboard';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import {
  ChatMessage,
  DashboardArtifact,
  FridaySettings,
  ReminderItem,
  ToolConfirmationPayload,
} from '@/shared/types';
import { pickGreeting } from '@/services/voice/greetings';
import { isLikelySilence } from '@/services/voice/micErrors';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<FridaySettings>({
    apiKey: '',
    hasCustomKey: false,
    preferredLanguage: 'te-IN',
    speechSpeed: 1.0,
    speechVolume: 1.0,
    voiceId: 'default',
    ttsProvider: 'auto',
    themeMode: 'auto',
    approvedFolders: [],
    requireToolConfirmations: {
      notes: false,
      folderSearch: true,
      webResearch: false,
      launchApps: true,
    },
    modelName: 'gemini-3.5-flash-lite',
    soundMuted: false,
    memoryEnabled: true,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [artifacts, setArtifacts] = useState<DashboardArtifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ToolConfirmationPayload | null>(null);

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
    interrupt,
  } = useVoiceAssistant();

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
    async (text: string, audioBase64?: string, audioMimeType?: string) => {
      if (!text && !audioBase64) return;

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        text: text || 'Voice message',
        timestamp: Date.now(),
        isVoice: Boolean(audioBase64),
      };

      setMessages((prev) => [...prev, userMsg]);
      setRobotState('thinking');

      try {
        if (!window.fridayAPI) {
          throw new Error('Electron API bridge unavailable');
        }

        const response = await window.fridayAPI.sendMessage({
          message: text,
          audioBase64,
          audioMimeType,
          conversationHistory: messages,
          language: settings.preferredLanguage,
        });

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

        // Failures are shown as errors, never spoken as if they were answers.
        if (failed) {
          setRobotState('error');
          setTimeout(() => setRobotState('idle'), 1200);
          return;
        }

        // Speak response aloud
        if (!isMuted) {
          await speakResponse(response.text, {
            languageCode: response.detectedLanguage || settings.preferredLanguage,
            rate: settings.speechSpeed,
            volume: settings.speechVolume,
            voiceId: settings.voiceId,
            audioBase64: response.audioBase64,
          });
        } else {
          setRobotState('idle');
        }
      } catch (err: any) {
        setRobotState('error');
        const errorMsg: ChatMessage = {
          id: `msg_${Date.now()}_err`,
          role: 'assistant',
          text: `Error: ${err.message || 'Failed to communicate with Gemini.'}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    },
    [messages, settings, isMuted, speakResponse, setRobotState]
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
    if (isListening) {
      // User finished speaking: stop recorder and send to Gemini
      const { audioBase64, mimeType, recognizedText, peakLevel } = await stopListening();

      if (!audioBase64) {
        setRobotState('idle');
        appendNotice(
          'I could not hear anything — no audio was captured. Check that your microphone is connected and not muted, then try again.',
          true
        );
        return;
      }

      if (!recognizedText && isLikelySilence(peakLevel)) {
        setRobotState('idle');
        appendNotice(
          'I could not hear anything. Your microphone may be muted, or another app may be using it. Please try again.',
          true
        );
        return;
      }

      handleSendMessage(recognizedText, audioBase64, mimeType);
    } else {
      // User tapped mic to speak
      try {
        await startListening(settings.preferredLanguage);
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
            AI COMPANION
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
              state={robotState}
              amplitude={amplitude}
              frequencies={frequencies}
              onClick={interrupt}
            />

            {/* Live Audio Visualizer */}
            <AudioVisualizer
              frequencies={frequencies}
              isActive={isListening || robotState === 'speaking'}
            />
          </div>

          {/* Conversation Transcript (Collapsible) */}
          {transcriptOpen && (
            <TranscriptView
              messages={messages}
              onClearHistory={handleClearHistory}
              onOpenFile={handleOpenFile}
            />
          )}

          {/* Bottom Control Bar */}
          <ControlBar
            state={robotState}
            isListening={isListening}
            isMuted={isMuted}
            hasApiKey={settings.hasCustomKey}
            messageCount={messages.length}
            memoryCount={memoryCount}
            transcriptOpen={transcriptOpen}
            recordingSeconds={recordingSeconds}
            onToggleMic={handleToggleMic}
            onSendMessage={(txt) => handleSendMessage(txt)}
            onToggleMute={() => {
              const next = !isMuted;
              setIsMuted(next);
              handleSaveSettings({ soundMuted: next });
            }}
            onToggleTranscript={() => setTranscriptOpen(!transcriptOpen)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenMemory={() => setMemoryOpen(true)}
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
            voiceId: settings.voiceId,
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
    </div>
  );
};
