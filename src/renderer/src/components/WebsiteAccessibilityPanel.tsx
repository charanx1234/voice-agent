import React, { useState } from 'react';
import {
  Globe,
  X,
  Play,
  Pause,
  Square,
  FastForward,
  Rewind,
  ArrowRight,
  ExternalLink,
  Search,
  Volume2,
  ShieldCheck,
  Languages,
} from 'lucide-react';
import { WebsiteAccessibilityState } from '@/shared/types';

interface WebsiteAccessibilityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  accessibilityState: WebsiteAccessibilityState;
  onToggleEnabled: () => void;
  onOpenUrl: (url: string) => void;
  onExecuteCommand: (command: string) => void;
  onSetReadingSpeed: (speed: number) => void;
  onStopReading: () => void;
}

export const WebsiteAccessibilityPanel: React.FC<WebsiteAccessibilityPanelProps> = ({
  isOpen,
  onClose,
  accessibilityState,
  onToggleEnabled,
  onOpenUrl,
  onExecuteCommand,
  onSetReadingSpeed,
  onStopReading,
}) => {
  const [urlInput, setUrlInput] = useState('');

  if (!isOpen) return null;

  const handleOpenUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onOpenUrl(urlInput.trim());
      setUrlInput('');
    }
  };

  const sampleUrls = [
    { name: 'Wikipedia (Informational)', url: 'https://en.wikipedia.org/wiki/Web_accessibility' },
    { name: 'Hacker News (Links & Headers)', url: 'https://news.ycombinator.com' },
    { name: 'W3C Accessible Form (Forms & Fields)', url: 'https://www.w3.org/WAI/demos/bad/before/home.html' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(94vw, 560px)',
          maxHeight: '90vh',
          backgroundColor: 'var(--surface, #121212)',
          border: '1px solid var(--border-strong, #333333)',
          borderRadius: '16px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text, #ffffff)',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border, #262626)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: accessibilityState.enabled ? '#ffffff' : '#222222',
                color: accessibilityState.enabled ? '#000000' : '#888888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Globe size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Website Accessibility Assistant
              </h2>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted, #888888)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: accessibilityState.connected ? '#10b981' : '#6b7280',
                  }}
                />
                {accessibilityState.connected
                  ? `Connected: ${accessibilityState.browserName}`
                  : 'Ready to connect browser'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={onToggleEnabled}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: accessibilityState.enabled ? '#ffffff' : '#444444',
                backgroundColor: accessibilityState.enabled ? '#ffffff' : 'transparent',
                color: accessibilityState.enabled ? '#000000' : '#aaaaaa',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {accessibilityState.enabled ? 'Enabled' : 'Disabled'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted, #888888)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Active Website Status Card */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg, #0a0a0a)',
              borderRadius: '10px',
              border: '1px solid var(--border, #262626)',
            }}
          >
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--muted, #888888)', letterSpacing: '0.5px' }}>
              Current Website
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '2px', wordBreak: 'break-word' }}>
              {accessibilityState.currentTitle || 'No page open yet'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted, #888888)', marginTop: '2px', wordBreak: 'break-all' }}>
              {accessibilityState.currentUrl || 'about:blank'}
            </div>

            {accessibilityState.currentElement && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                  borderLeft: '3px solid #ffcc00',
                  fontSize: '0.76rem',
                }}
              >
                <span style={{ fontWeight: 600, color: '#ffcc00' }}>Active Focus: </span>
                <span style={{ textTransform: 'uppercase', fontSize: '0.7rem', opacity: 0.8 }}>
                  [{accessibilityState.currentElement.type}]
                </span>{' '}
                {accessibilityState.currentElement.label || accessibilityState.currentElement.text}
              </div>
            )}
          </div>

          {/* Quick URL Input */}
          <form onSubmit={handleOpenUrl} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Enter website URL (e.g. en.wikipedia.org)..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border, #333333)',
                backgroundColor: 'var(--bg, #0a0a0a)',
                color: 'var(--text, #ffffff)',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #444',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ExternalLink size={14} /> Open
            </button>
          </form>

          {/* Sample Pages for Quick Testing */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {sampleUrls.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onOpenUrl(s.url)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '14px',
                  fontSize: '0.72rem',
                  border: '1px solid var(--border, #333333)',
                  backgroundColor: 'transparent',
                  color: 'var(--muted, #888888)',
                  cursor: 'pointer',
                }}
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* Reading Controls & Status */}
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--bg, #0a0a0a)',
              borderRadius: '10px',
              border: '1px solid var(--border, #262626)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600 }}>
                <Volume2 size={16} /> Reading Controls
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor:
                    accessibilityState.readingStatus === 'reading'
                      ? 'rgba(16, 185, 129, 0.2)'
                      : accessibilityState.readingStatus === 'paused'
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(255, 255, 255, 0.08)',
                  color:
                    accessibilityState.readingStatus === 'reading'
                      ? '#10b981'
                      : accessibilityState.readingStatus === 'paused'
                        ? '#f59e0b'
                        : '#888888',
                }}
              >
                Status: {accessibilityState.readingStatus.toUpperCase()}
              </div>
            </div>

            {/* Reading Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => onExecuteCommand('read page')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #444',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Play size={14} /> Read Page
              </button>
              <button
                onClick={() => onExecuteCommand('summarize')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #444',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                Summarize
              </button>
              <button
                onClick={() =>
                  accessibilityState.readingStatus === 'paused'
                    ? onExecuteCommand('resume')
                    : onExecuteCommand('pause')
                }
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #444',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {accessibilityState.readingStatus === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                {accessibilityState.readingStatus === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={onStopReading}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #ef4444',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Square size={14} /> Stop
              </button>
            </div>

            {/* Reading Speed Control */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--muted, #888888)' }}>
                Reading Speed ({accessibilityState.readingSpeed}x):
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[0.75, 1.0, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => onSetReadingSpeed(speed)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      border: '1px solid',
                      borderColor: accessibilityState.readingSpeed === speed ? '#ffffff' : '#333333',
                      backgroundColor:
                        accessibilityState.readingSpeed === speed ? '#ffffff' : 'transparent',
                      color: accessibilityState.readingSpeed === speed ? '#000000' : '#888888',
                      cursor: 'pointer',
                    }}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Element Navigation Quick Bar */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg, #0a0a0a)',
              borderRadius: '10px',
              border: '1px solid var(--border, #262626)',
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '8px' }}>
              Element Navigation
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <button
                onClick={() => onExecuteCommand('previous heading')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                Prev Heading
              </button>
              <button
                onClick={() => onExecuteCommand('next heading')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                Next Heading
              </button>
              <button
                onClick={() => onExecuteCommand('next paragraph')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                Next Paragraph
              </button>
              <button
                onClick={() => onExecuteCommand('scroll down')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                Scroll Down
              </button>
              <button
                onClick={() => onExecuteCommand('find search box')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                Find Search
              </button>
              <button
                onClick={() => onExecuteCommand('go back')}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #333',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                }}
              >
                Go Back
              </button>
            </div>
          </div>

          {/* Voice Command Feedback & Multilingual Guide */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg, #0a0a0a)',
              borderRadius: '10px',
              border: '1px solid var(--border, #262626)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 600 }}>
              <Languages size={15} /> Natural Voice Commands (English, Telugu, Hinglish)
            </div>
            <div
              style={{
                marginTop: '6px',
                fontSize: '0.73rem',
                color: 'var(--muted, #888888)',
                lineHeight: 1.5,
              }}
            >
              • <strong>English:</strong> "Read this page", "Next heading", "Click login button", "Search for Java", "Scroll down", "Stop reading"<br />
              • <strong>Telugu:</strong> "ఈ పేజీని చదువు", "తర్వాతి హెడ్డింగ్", "లాగిన్ బటన్ క్లిక్ చేయి", "క్రిందికి స్క్రోల్ చేయి", "చదవడం ఆపు"<br />
              • <strong>Hinglish:</strong> "Ye page padho", "Next heading pe jao", "Login button click karo", "Neeche scroll karo", "Padhna band karo"
            </div>

            {accessibilityState.lastCommand && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  fontSize: '0.74rem',
                }}
              >
                <span style={{ color: 'var(--muted, #888888)' }}>Last Command: </span>
                <span style={{ fontWeight: 600 }}>"{accessibilityState.lastCommand}"</span>
              </div>
            )}
          </div>

          {/* Privacy & Security Note */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.7rem',
              color: 'var(--muted, #888888)',
            }}
          >
            <ShieldCheck size={16} />
            <span>
              Privacy First: FRIDAY never captures passwords, cookies, or sensitive tokens. Password autofill is strictly blocked.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
