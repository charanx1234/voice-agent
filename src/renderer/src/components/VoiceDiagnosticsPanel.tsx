import React from 'react';
import { X, Activity, Mic, Volume2, Cpu, AlertTriangle, CheckCircle, Radio } from 'lucide-react';
import { VoiceDiagnosticsData } from '@/shared/types';

interface VoiceDiagnosticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics: VoiceDiagnosticsData;
}

export const VoiceDiagnosticsPanel: React.FC<VoiceDiagnosticsPanelProps> = ({
  isOpen,
  onClose,
  diagnostics,
}) => {
  if (!isOpen) return null;

  const isLive = diagnostics.streamStatus === 'active';
  const levelPct = Math.min(100, Math.round(diagnostics.liveLevel * 100));
  const peakPct = Math.min(100, Math.round(diagnostics.peakLevel * 100));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid #334155',
            backgroundColor: '#1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color="#38bdf8" />
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              FRIDAY Voice Pipeline Real-time Diagnostics
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                backgroundColor: isLive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: isLive ? '#4ade80' : '#f87171',
                border: `1px solid ${isLive ? '#22c55e' : '#ef4444'}`,
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {isLive ? 'Live Monitoring' : 'Stream Inactive'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            fontSize: '0.82rem',
          }}
        >
          {/* Section 1: Microphone & Audio Stream */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '12px',
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#38bdf8', marginBottom: '8px' }}>
              <Mic size={15} />
              <span>1. Microphone & Stream Acquisition</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Device: </span>
                <span style={{ fontWeight: 500 }}>{diagnostics.selectedMicDevice}</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Permission: </span>
                <span style={{ color: '#4ade80', fontWeight: 600 }}>{diagnostics.micPermissionStatus}</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Track State: </span>
                <span style={{ color: diagnostics.trackStatus.readyState === 'live' ? '#4ade80' : '#f87171' }}>
                  {diagnostics.trackStatus.readyState} (enabled: {String(diagnostics.trackStatus.enabled)}, muted: {String(diagnostics.trackStatus.muted)})
                </span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Audio Format: </span>
                <span>{diagnostics.audioFormat}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Real-time Audio Level & VAD */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '12px',
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#38bdf8', marginBottom: '8px' }}>
              <Radio size={15} />
              <span>2. Audio Capture & Voice Activity Detection (VAD)</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#94a3b8' }}>Live Audio Input Level:</span>
                  <span style={{ fontWeight: 600 }}>{levelPct}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${levelPct}%`,
                      height: '100%',
                      backgroundColor: levelPct > 75 ? '#ef4444' : levelPct > 30 ? '#eab308' : '#22c55e',
                      transition: 'width 0.08s ease',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '4px' }}>
                <div>
                  <span style={{ color: '#94a3b8' }}>Speech Detected: </span>
                  <span
                    style={{
                      color: diagnostics.isSpeechDetected ? '#4ade80' : '#94a3b8',
                      fontWeight: diagnostics.isSpeechDetected ? 700 : 400,
                    }}
                  >
                    {diagnostics.isSpeechDetected ? '● SPEECH ACTIVE' : '○ Ambient / Quiet'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Ambient Noise Floor: </span>
                  <span>{diagnostics.ambientNoiseFloor.toFixed(3)}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Capture Duration: </span>
                  <span>{diagnostics.capturedDurationMs} ms</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>PCM Buffer Size: </span>
                  <span>{diagnostics.audioBufferSizeKb} KB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Speech-to-Text & AI Status */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '12px',
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#38bdf8', marginBottom: '8px' }}>
              <Cpu size={15} />
              <span>3. Speech-to-Text (STT) & Gemini AI Pipeline</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Session State: </span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{diagnostics.sessionState}</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>STT Provider & Model: </span>
                <span>{diagnostics.sttModel}</span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>STT Status: </span>
                <span
                  style={{
                    color:
                      diagnostics.sttStatus === 'completed'
                        ? '#4ade80'
                        : diagnostics.sttStatus === 'requesting'
                        ? '#eab308'
                        : diagnostics.sttStatus === 'error'
                        ? '#f87171'
                        : '#94a3b8',
                    fontWeight: 600,
                  }}
                >
                  {diagnostics.sttStatus}
                  {diagnostics.sttLatencyMs ? ` (${diagnostics.sttLatencyMs}ms)` : ''}
                </span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Gemini AI Status: </span>
                <span style={{ fontWeight: 600 }}>{diagnostics.geminiStatus}</span>
              </div>
            </div>

            {/* Recognized Transcript Display */}
            <div style={{ marginTop: '10px' }}>
              <span style={{ color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                Latest Recognized Transcript:
              </span>
              <div
                style={{
                  backgroundColor: '#0f172a',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  color: diagnostics.sttTranscript ? '#f8fafc' : '#64748b',
                  fontStyle: diagnostics.sttTranscript ? 'normal' : 'italic',
                }}
              >
                {diagnostics.sttTranscript || 'No voice transcript received yet.'}
              </div>
            </div>
          </div>

          {/* Section 4: Text-to-Speech & Errors */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '12px',
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#38bdf8', marginBottom: '8px' }}>
              <Volume2 size={15} />
              <span>4. Speech Synthesis (TTS) & Error Monitor</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>TTS State: </span>
                <span style={{ color: diagnostics.ttsStatus === 'speaking' ? '#4ade80' : '#94a3b8', fontWeight: 600 }}>
                  {diagnostics.ttsStatus}
                </span>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Last Error: </span>
                <span style={{ color: diagnostics.lastError ? '#f87171' : '#4ade80' }}>
                  {diagnostics.lastError ? diagnostics.lastError : 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid #334155',
            backgroundColor: '#1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.74rem',
            color: '#94a3b8',
          }}
        >
          <span>Real-time voice stream sampling at 16kHz Mono.</span>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#38bdf8',
              color: '#0f172a',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
