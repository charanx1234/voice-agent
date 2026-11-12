import React, { useEffect, useState } from 'react';
import {
  Mic,
  Sparkles,
  Check,
  X,
  AlertCircle,
  FileCode,
  Briefcase,
  Zap,
  AlignLeft,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import {
  voiceFlowController,
  VoiceFlowEventMeta,
} from '@/services/voiceflow/voiceflowController';
import { VoiceFlowMode, VoiceFlowState } from '@/services/voiceflow/types';

const MODE_CONFIG: Record<
  VoiceFlowMode,
  { label: string; icon: React.FC<{ size?: number; className?: string }> }
> = {
  natural: { label: 'Natural', icon: Sparkles },
  professional: { label: 'Professional', icon: Briefcase },
  concise: { label: 'Concise', icon: Zap },
  code: { label: 'Code', icon: FileCode },
  verbatim: { label: 'Verbatim', icon: AlignLeft },
};

export const VoiceFlowHUD: React.FC = () => {
  const [state, setState] = useState<VoiceFlowState>('IDLE_READY');
  const [meta, setMeta] = useState<VoiceFlowEventMeta>({});
  const [level, setLevel] = useState<number>(0);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);

  useEffect(() => {
    const unsubState = voiceFlowController.subscribeState((newState, newMeta) => {
      setState(newState);
      if (newMeta) setMeta(newMeta);
    });

    const unsubLevel = voiceFlowController.subscribeLevel((newLevel) => {
      setLevel(newLevel);
    });

    return () => {
      unsubState();
      unsubLevel();
    };
  }, []);

  if (state === 'IDLE_READY') {
    return null;
  }

  const currentMode = meta.mode || voiceFlowController.getSettings().mode;
  const CurrentModeIcon = MODE_CONFIG[currentMode]?.icon || Sparkles;
  const targetProcess = meta.target?.process
    ? meta.target.process.replace(/\.exe$/i, '')
    : meta.target?.title
    ? meta.target.title.substring(0, 20)
    : undefined;

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    voiceFlowController.cancel();
  };

  const handleSelectMode = (newMode: VoiceFlowMode, e: React.MouseEvent) => {
    e.stopPropagation();
    voiceFlowController.setMode(newMode);
    setModeMenuOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '32px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 18px',
        borderRadius: '9999px',
        background: 'rgba(10, 10, 12, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(56, 189, 248, 0.15)',
        color: '#ffffff',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        fontSize: '0.86rem',
        userSelect: 'none',
        pointerEvents: 'auto',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        maxWidth: '92vw',
      }}
    >
      {/* 1. Status Icon & Waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {state === 'RECORDING' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 10px #ef4444',
                animation: 'pulse 1.2s infinite ease-in-out',
              }}
            />
            {/* Dynamic VU Meter bars */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '18px' }}>
              {[0.4, 0.8, 1.2, 0.9, 0.5].map((multiplier, i) => {
                const barHeight = Math.max(4, Math.min(18, Math.round(level * 22 * multiplier)));
                return (
                  <div
                    key={i}
                    style={{
                      width: '3px',
                      height: `${barHeight}px`,
                      background: level > 0.05 ? '#38bdf8' : 'rgba(255, 255, 255, 0.3)',
                      borderRadius: '2px',
                      transition: 'height 0.06s ease-out, background 0.1s ease',
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {state === 'TRANSCRIBING' && (
          <Loader2 size={16} className="animate-spin" style={{ color: '#38bdf8' }} />
        )}

        {state === 'ENHANCING' && (
          <Sparkles size={16} style={{ color: '#a855f7', animation: 'spin 3s linear infinite' }} />
        )}

        {state === 'INSERTING' && (
          <Loader2 size={16} className="animate-spin" style={{ color: '#22c55e' }} />
        )}

        {state === 'COMPLETED' && (
          <Check size={16} style={{ color: '#22c55e', strokeWidth: 3 }} />
        )}

        {state === 'ERROR' && (
          <AlertCircle size={16} style={{ color: '#ef4444' }} />
        )}

        {state === 'CANCELLED' && (
          <X size={16} style={{ color: '#94a3b8' }} />
        )}

        {/* Status text */}
        <span style={{ fontWeight: 500, letterSpacing: '-0.01em' }}>
          {state === 'ACTIVATED' && 'Ready...'}
          {state === 'RECORDING' && 'Listening... speak naturally'}
          {state === 'TRANSCRIBING' && 'Transcribing...'}
          {state === 'ENHANCING' && 'Enhancing with FRIDAY AI...'}
          {state === 'INSERTING' && `Inserting into ${targetProcess || 'app'}...`}
          {state === 'COMPLETED' && 'Done!'}
          {state === 'ERROR' && (meta.error || 'VoiceFlow error')}
          {state === 'CANCELLED' && 'Cancelled'}
        </span>
      </div>

      {/* 2. Target Application Badge */}
      {targetProcess && (
        <div
          style={{
            padding: '2px 8px',
            borderRadius: '9999px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '0.72rem',
            color: '#94a3b8',
            maxWidth: '120px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`Target Application: ${targetProcess}`}
        >
          {targetProcess}
        </div>
      )}

      {/* 3. Mode Switcher Dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setModeMenuOpen(!modeMenuOpen);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 9px',
            borderRadius: '9999px',
            background: 'rgba(56, 189, 248, 0.14)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
            fontSize: '0.74rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          title="Change VoiceFlow Enhancement Mode"
        >
          <CurrentModeIcon size={12} />
          <span>{MODE_CONFIG[currentMode]?.label}</span>
          <ChevronDown size={11} style={{ opacity: 0.7 }} />
        </button>

        {modeMenuOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '8px',
              background: '#0d0f14',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '4px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              minWidth: '130px',
              zIndex: 100000,
            }}
          >
            {(Object.keys(MODE_CONFIG) as VoiceFlowMode[]).map((modeKey) => {
              const item = MODE_CONFIG[modeKey];
              const ItemIcon = item.icon;
              const isSelected = modeKey === currentMode;
              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={(e) => handleSelectMode(modeKey, e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    border: 'none',
                    color: isSelected ? '#38bdf8' : '#e2e8f0',
                    fontSize: '0.75rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <ItemIcon size={13} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Instant Cancel Button */}
      <button
        type="button"
        onClick={handleCancel}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.1)',
          border: 'none',
          color: '#ffffff',
          cursor: 'pointer',
          padding: 0,
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.35)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
        title="Cancel VoiceFlow Dictation"
      >
        <X size={14} />
      </button>
    </div>
  );
};
