import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Settings,
  MessageSquare,
  Wrench,
  Brain,
  Sparkles,
  LayoutDashboard,
  Globe,
  Activity,
} from 'lucide-react';
import { RobotState, VoiceSessionState } from '@/shared/types';
import { formatRecordingDuration } from '@/services/voice/micErrors';

interface ControlBarProps {
  state: RobotState;
  voiceSessionState?: VoiceSessionState;
  isListening: boolean;
  isMuted: boolean;
  isMicMuted?: boolean;
  hasApiKey: boolean;
  messageCount: number;
  memoryCount: number;
  transcriptOpen: boolean;
  recordingSeconds?: number;
  handsFreeMode?: 'off' | 'standby' | 'active';
  personalityMode?: 'simple' | 'moderate' | 'roast';
  currentMood?: string;
  onToggleHandsFree?: () => void;
  onToggleMic: () => void;
  onToggleMicMute?: () => void;
  onTextFocus?: () => void;
  onTextBlur?: () => void;
  onSendMessage: (text: string) => void;
  onToggleMute: () => void;
  onToggleTranscript: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenMemory: () => void;
  dashboardOpen?: boolean;
  dashboardCount?: number;
  onToggleDashboard?: () => void;
  accessibilityOpen?: boolean;
  accessibilityActive?: boolean;
  onToggleAccessibility?: () => void;
  diagnosticsOpen?: boolean;
  onOpenDiagnostics?: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  state,
  voiceSessionState,
  isListening,
  isMuted,
  isMicMuted = false,
  hasApiKey,
  messageCount,
  memoryCount,
  transcriptOpen,
  recordingSeconds = 0,
  handsFreeMode = 'off',
  onToggleHandsFree,
  personalityMode = 'moderate',
  currentMood = 'calm',
  onToggleMic,
  onToggleMicMute,
  onTextFocus,
  onTextBlur,
  onSendMessage,
  onToggleMute,
  onToggleTranscript,
  onOpenSettings,
  onOpenShortcuts,
  onOpenMemory,
  dashboardOpen = false,
  dashboardCount = 0,
  onToggleDashboard,
  accessibilityOpen = false,
  accessibilityActive = false,
  onToggleAccessibility,
  diagnosticsOpen = false,
  onOpenDiagnostics,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getStatusBadge = () => {
    // Explicit 9 pipeline states
    if (state === 'error' || voiceSessionState === 'ERROR' || voiceSessionState === 'MICROPHONE_ERROR' || voiceSessionState === 'TASK_UNSUPPORTED') {
      return { label: 'Service Error', color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' };
    }
    if (state === 'speaking') {
      return { label: 'Speaking', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 15%, transparent)' };
    }
    if (state === 'interrupted' || voiceSessionState === 'INTERRUPTED') {
      return { label: 'Interrupted', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 15%, transparent)' };
    }
    if (voiceSessionState === 'SPEECH_DETECTED') {
      return { label: 'Speech Detected', color: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 20%, transparent)' };
    }
    if (voiceSessionState === 'PROCESSING_AUDIO') {
      return { label: 'Processing Audio', color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 18%, transparent)' };
    }
    if (voiceSessionState === 'TRANSCRIBING') {
      return { label: 'Transcribing Voice...', color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 18%, transparent)' };
    }
    if (voiceSessionState === 'TRANSCRIPT_RECEIVED') {
      return { label: 'Transcript Received', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 18%, transparent)' };
    }
    if (state === 'thinking' || voiceSessionState === 'THINKING' || voiceSessionState === 'PROCESSING') {
      return { label: 'Thinking...', color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 15%, transparent)' };
    }
    if (state === 'listening' || isListening || voiceSessionState === 'LISTENING') {
      return {
        label:
          recordingSeconds > 0
            ? `Listening (MIC ACTIVE - ${formatRecordingDuration(recordingSeconds)})`
            : 'Listening (MIC ACTIVE)',
        color: 'var(--accent)',
        bg: 'color-mix(in srgb, var(--accent) 15%, transparent)',
      };
    }
    if (handsFreeMode === 'active') {
      return {
        label: isListening
          ? (recordingSeconds > 0
            ? `Listening (MIC ACTIVE - ${formatRecordingDuration(recordingSeconds)})`
            : 'Listening (MIC ACTIVE)')
          : 'Listening (Always Ready)',
        color: 'var(--accent)',
        bg: 'color-mix(in srgb, var(--accent) 15%, transparent)',
      };
    }
    if (handsFreeMode === 'standby' || voiceSessionState === 'STANDBY') {
      return { label: 'Ready (Say "Hey Friday")', color: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 15%, transparent)' };
    }
    return { label: 'Idle', color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 10%, transparent)' };
  };

  const status = getStatusBadge();
  const personalityLabel =
    personalityMode === 'simple' ? 'Simple · caring' : personalityMode === 'roast' ? 'Roast · sarcastic' : 'Moderate · firm';

  return (
    <div style={{ width: '100%', padding: '0 16px 14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Top Status & Utility Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: status.bg,
              padding: '4px 10px',
              borderRadius: '16px',
              border: `1px solid ${status.color}33`,
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: status.color,
                boxShadow: `0 0 8px ${status.color}`,
                animation: isListening || state === 'speaking' ? 'pulse 1.4s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: status.color }}>
              {status.label}
            </span>
          </div>
          <span
            style={{
              fontSize: '0.66rem',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
              borderRadius: '10px',
              padding: '3px 7px',
            }}
            title="FRIDAY's current personality mode"
          >
            {personalityLabel}
          </span>
          {isMicMuted ? (
            <span style={{ fontSize: '0.66rem', color: 'var(--danger, #ef4444)', fontWeight: 600 }} title="Microphone is muted">
              MIC MUTED
            </span>
          ) : handsFreeMode !== 'off' ? (
            <span
              style={{
                fontSize: '0.66rem',
                color: isListening || handsFreeMode === 'active' ? 'var(--accent)' : 'var(--muted-dim)',
                fontWeight: isListening || handsFreeMode === 'active' ? 600 : 400,
              }}
              title="Microphone state"
            >
              {isListening || handsFreeMode === 'active' ? 'MIC ACTIVE (LISTENING)' : 'MIC READY'} · {currentMood}
            </span>
          ) : null}
        </div>

        {/* Action icons (Shortcuts, Transcript, Mute, Settings) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Parallel dashboard toggle: chat and voice stay active in the left pane. */}
          {onToggleDashboard && (
            <button
              onClick={onToggleDashboard}
              title={dashboardOpen ? 'Close dashboard' : 'Open dashboard'}
              aria-label={dashboardOpen ? 'Close dashboard' : 'Open dashboard'}
              style={{
                background: dashboardOpen
                  ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                  : 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: dashboardOpen
                  ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)'
                  : '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '10px',
                padding: '6px 8px',
                color: dashboardOpen ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
              }}
            >
              <LayoutDashboard size={14} />
              {dashboardCount > 0 && <span>{dashboardCount}</span>}
            </button>
          )}

          {/* Website Accessibility Assistant Button */}
          {onToggleAccessibility && (
            <button
              onClick={onToggleAccessibility}
              title="Website Accessibility Assistant"
              style={{
                background: accessibilityOpen || accessibilityActive
                  ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                  : 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: accessibilityOpen || accessibilityActive
                  ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)'
                  : '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '10px',
                padding: '6px 8px',
                color: accessibilityOpen || accessibilityActive ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                position: 'relative',
              }}
            >
              <Globe size={14} />
              {accessibilityActive && (
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                  }}
                />
              )}
            </button>
          )}

          {/* Shortcuts Tool Button */}
          <button
            onClick={onOpenShortcuts}
            title="Agent Tools & Shortcuts"
            style={{
              background: 'color-mix(in srgb, var(--text) 5%, transparent)',
              border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: 'var(--muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
            }}
          >
            <Wrench size={14} />
            <span>Tools</span>
          </button>

          {/* Memory Button */}
          <button
            onClick={onOpenMemory}
            title="Long-term memory"
            style={{
              background: memoryCount > 0 ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'color-mix(in srgb, var(--text) 5%, transparent)',
              border: memoryCount > 0 ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: memoryCount > 0 ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
            }}
          >
            <Brain size={14} />
            {memoryCount > 0 && <span>{memoryCount}</span>}
          </button>

          {/* Transcript toggle */}
          <button
            onClick={onToggleTranscript}
            title="Toggle Transcript"
            style={{
              background: transcriptOpen ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'color-mix(in srgb, var(--text) 5%, transparent)',
              border: transcriptOpen ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: transcriptOpen ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
            }}
          >
            <MessageSquare size={14} />
            {messageCount > 0 && <span>{messageCount}</span>}
          </button>

          {/* Microphone Mute */}
          {onToggleMicMute && (
            <button
              onClick={onToggleMicMute}
              title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
              style={{
                background: isMicMuted ? 'color-mix(in srgb, var(--danger, #ef4444) 18%, transparent)' : 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: isMicMuted ? '1px solid color-mix(in srgb, var(--danger, #ef4444) 50%, transparent)' : '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '10px',
                padding: '6px 8px',
                color: isMicMuted ? 'var(--danger, #ef4444)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {isMicMuted ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          )}

          {/* Sound Mute */}
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute voice' : 'Mute voice'}
            style={{
              background: isMuted ? 'color-mix(in srgb, var(--danger) 15%, transparent)' : 'color-mix(in srgb, var(--text) 5%, transparent)',
              border: isMuted ? '1px solid color-mix(in srgb, var(--danger) 40%, transparent)' : '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: isMuted ? 'var(--danger)' : 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {/* Voice Diagnostics Button */}
          {onOpenDiagnostics && (
            <button
              onClick={onOpenDiagnostics}
              title="Voice Pipeline Real-time Diagnostics"
              style={{
                background: diagnosticsOpen ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'color-mix(in srgb, var(--text) 5%, transparent)',
                border: diagnosticsOpen ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
                borderRadius: '10px',
                padding: '6px 8px',
                color: diagnosticsOpen ? 'var(--accent)' : 'var(--muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Activity size={15} />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            title="Settings"
            style={{
              background: !hasApiKey ? 'color-mix(in srgb, var(--warning) 20%, transparent)' : 'color-mix(in srgb, var(--text) 5%, transparent)',
              border: !hasApiKey ? '1px solid var(--warning)' : '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: !hasApiKey ? 'var(--warning)' : 'var(--muted)',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <Settings size={15} />
            {!hasApiKey && (
              <span
                style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--warning)',
                }}
              />
            )}
          </button>
        </div>
      </div>

      {onToggleHandsFree && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={onToggleHandsFree}
            title={handsFreeMode === 'off' ? 'Turn on hands-free (say "Hey Friday")' : 'Turn off hands-free'}
            style={{
              background: 'none',
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              borderRadius: '12px',
              padding: '2px 10px',
              fontSize: '0.7rem',
              color: handsFreeMode === 'off' ? 'var(--muted)' : 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            {handsFreeMode === 'off' ? 'Hands-free: off' : 'Hands-free: on (Always listening)'}
          </button>
        </div>
      )}

      {/* Main Microphone Button */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
        <button
          onClick={onToggleMic}
          title={
            state === 'listening' || isListening
              ? 'Listening (Click to submit or speak to FRIDAY)'
              : 'Microphone active (Say "Hey Friday" or click to talk)'
          }
          style={{
            position: 'relative',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: (state === 'listening' || isListening || handsFreeMode === 'active')
              ? 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)'
              : 'linear-gradient(135deg, var(--surface) 0%, var(--surface) 100%)',
            border: (state === 'listening' || isListening || handsFreeMode === 'active') ? '2px solid var(--text)' : '2px solid color-mix(in srgb, var(--accent) 35%, transparent)',
            color: (state === 'listening' || isListening || handsFreeMode === 'active') ? 'var(--bg)' : 'var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: (state === 'listening' || isListening || handsFreeMode === 'active')
              ? '0 0 25px color-mix(in srgb, var(--accent) 70%, transparent), inset 0 0 10px color-mix(in srgb, var(--text) 60%, transparent)'
              : '0 4px 16px color-mix(in srgb, var(--shadow-color) 40%, transparent)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {state === 'listening' || isListening ? <MicOff size={28} /> : <Mic size={28} />}
        </button>
      </div>

      {/* Text input with send button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
          border: '1px solid color-mix(in srgb, var(--text) 10%, transparent)',
          borderRadius: '16px',
          padding: '6px 10px 6px 14px',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onFocus={onTextFocus}
          onBlur={onTextBlur}
          onKeyDown={handleKeyDown}
          placeholder=""
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: '0.88rem',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          title="Send message"
          style={{
            background: inputText.trim() ? 'var(--accent)' : 'color-mix(in srgb, var(--text) 5%, transparent)',
            border: 'none',
            borderRadius: '10px',
            width: '32px',
            height: '32px',
            color: inputText.trim() ? 'var(--bg)' : 'var(--muted-dim)',
            cursor: inputText.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
};
