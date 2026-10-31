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
          color: '#00e5ff',
          bg: 'rgba(0, 229, 255, 0.15)',
        };
      case 'thinking':
        return { label: 'Thinking...', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
      case 'speaking':
        return { label: 'Speaking...', color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)' };
      case 'interrupted':
        return { label: 'Interrupted', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' };
      case 'error':
        return { label: 'Service Error', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' };
      default:
        return { label: 'FRIDAY Ready', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };
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
        {/* Status indicator */}
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

        {/* Action icons (Shortcuts, Transcript, Mute, Settings) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Shortcuts Tool Button */}
          <button
            onClick={onOpenShortcuts}
            title="Agent Tools & Shortcuts"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: '#94a3b8',
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
              background: memoryCount > 0 ? 'rgba(167, 139, 250, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              border: memoryCount > 0 ? '1px solid rgba(167, 139, 250, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: memoryCount > 0 ? '#a78bfa' : '#94a3b8',
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
              background: transcriptOpen ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: transcriptOpen ? '1px solid rgba(0, 229, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: transcriptOpen ? '#00e5ff' : '#94a3b8',
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
              background: isMuted ? 'rgba(244, 63, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: isMuted ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: isMuted ? '#f43f5e' : '#94a3b8',
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
              background: !hasApiKey ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: !hasApiKey ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '6px 8px',
              color: !hasApiKey ? '#f59e0b' : '#94a3b8',
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
                  backgroundColor: '#f59e0b',
                }}
              />
            )}
          </button>
        </div>
      </div>

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
              ? 'linear-gradient(135deg, #00e5ff 0%, #0077b6 100%)'
              : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            border: isListening ? '2px solid #ffffff' : '2px solid rgba(0, 229, 255, 0.35)',
            color: isListening ? '#0a0e17' : '#00e5ff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isListening
              ? '0 0 25px rgba(0, 229, 255, 0.7), inset 0 0 10px rgba(255, 255, 255, 0.6)'
              : '0 4px 16px rgba(0, 0, 0, 0.4)',
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
          background: 'rgba(17, 24, 39, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '6px 10px 6px 14px',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type in Telugu, Hindi, English, etc..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f8fafc',
            fontSize: '0.88rem',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          title="Send message"
          style={{
            background: inputText.trim() ? '#00e5ff' : 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            borderRadius: '10px',
            width: '32px',
            height: '32px',
            color: inputText.trim() ? '#0a0e17' : '#475569',
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
