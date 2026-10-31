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
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import {
  ChatMessage,
  FridaySettings,
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
    theme: 'midnight',
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

  // Load initial settings and restore the previous conversation
  useEffect(() => {
    if (window.fridayAPI) {
      const api = window.fridayAPI;

      const bootstrap = async () => {
        const loaded = await api.getSettings();
        setSettings(loaded);
        setIsMuted(loaded.soundMuted);
        document.documentElement.setAttribute('data-theme', loaded.theme);

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

      return () => {
        cleanupConfirmations();
      };
    }
  }, [setIsMuted]);

  // Handle saving settings
  const handleSaveSettings = async (updates: Partial<FridaySettings>) => {
    if (window.fridayAPI) {
      await window.fridayAPI.saveSettings(updates);
      const refreshed = await window.fridayAPI.getSettings();
      setSettings(refreshed);
      if (refreshed.theme) {
        document.documentElement.setAttribute('data-theme', refreshed.theme);
      }
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-primary)',
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
          backgroundColor: 'rgba(12, 18, 29, 0.85)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={15} color="#00e5ff" />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', color: '#f8fafc' }}>
            FRIDAY
          </span>
          <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
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
              color: '#94a3b8',
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
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Missing API Key Banner */}
      {!settings.hasCustomKey && (
        <div
          onClick={() => setSettingsOpen(true)}
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.74rem',
            color: '#f59e0b',
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
