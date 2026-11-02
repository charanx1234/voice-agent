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
} from 'lucide-react';
import { RobotState } from '@/shared/types';
import { formatRecordingDuration } from '@/services/voice/micErrors';

interface ControlBarProps {
  state: RobotState;
  isListening: boolean;
  isMuted: boolean;
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
  onSendMessage: (text: string) => void;
  onToggleMute: () => void;
  onToggleTranscript: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenMemory: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  state,
  isListening,
  isMuted,
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
  onSendMessage,
  onToggleMute,
  onToggleTranscript,
  onOpenSettings,
  onOpenShortcuts,
  onOpenMemory,
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
    switch (state) {
      case 'listening':
        return {
          label:
            recordingSeconds > 0
              ? `Listening… ${formatRecordingDuration(recordingSeconds)}`
              : 'Listening...',
          color: 'var(--accent)',
          bg: 'color-mix(in srgb, var(--accent) 15%, transparent)',
        };
      case 'thinking':
        return { label: 'Thinking...', color: 'var(--info)', bg: 'color-mix(in srgb, var(--info) 15%, transparent)' };
      case 'speaking':
        return { label: 'Speaking...', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 15%, transparent)' };
      case 'interrupted':
        return { label: 'Interrupted', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 15%, transparent)' };
      case 'error':
        return { label: 'Service Error', color: 'var(--danger)', bg: 'color-mix(in srgb, var(--danger) 15%, transparent)' };
      default:
        if (handsFreeMode === 'standby') {
          return { label: 'Standby \u2014 say "Hey Friday"', color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 10%, transparent)' };
        }
        return { label: 'FRIDAY Ready', color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 10%, transparent)' };
    }
  };

  const status = getStatusBadge();

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
          {handsFreeMode !== 'off' && (
            <span style={{ fontSize: '0.66rem', color: 'var(--muted-dim)' }} title="Microphone access is active">
              MIC ACTIVE · {personalityMode.toUpperCase()} · {currentMood}
            </span>
          )}
        </div>

        {/* Action icons (Shortcuts, Transcript, Mute, Settings) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
            {handsFreeMode === 'off' ? 'Hands-free: off' : handsFreeMode === 'standby' ? 'Hands-free: standby' : 'Hands-free: on'}
          </button>
        </div>
      )}

      {/* Main Microphone Button */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
        <button
          onClick={onToggleMic}
          title={isListening ? 'Stop listening' : 'Start speaking to FRIDAY'}
          style={{
            position: 'relative',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: isListening
              ? 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)'
              : 'linear-gradient(135deg, var(--surface) 0%, var(--surface) 100%)',
            border: isListening ? '2px solid var(--text)' : '2px solid color-mix(in srgb, var(--accent) 35%, transparent)',
            color: isListening ? 'var(--bg)' : 'var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isListening
              ? '0 0 25px color-mix(in srgb, var(--accent) 70%, transparent), inset 0 0 10px color-mix(in srgb, var(--text) 60%, transparent)'
              : '0 4px 16px color-mix(in srgb, var(--shadow-color) 40%, transparent)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {isListening ? <MicOff size={28} /> : <Mic size={28} />}
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
