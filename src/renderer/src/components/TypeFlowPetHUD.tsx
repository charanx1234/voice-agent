import React, { useState, useEffect } from 'react';
import { Keyboard, Pause, Play, X, Check, AlertCircle } from 'lucide-react';
import { TypingProgress } from '@/services/typeflow/types';

export const TypeFlowPetHUD: React.FC = () => {
  const [progress, setProgress] = useState<TypingProgress | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.fridayAPI?.onTypeFlowProgress) {
      const unsub = window.fridayAPI.onTypeFlowProgress((p: TypingProgress) => {
        setProgress(p);
        if (p.status === 'typing' || p.status === 'paused') {
          setVisible(true);
        } else if (p.status === 'completed' || p.status === 'cancelled' || p.status === 'error') {
          setVisible(true);
          const t = setTimeout(() => setVisible(false), 2500);
          return () => clearTimeout(t);
        }
      });
      return () => unsub();
    }
  }, []);

  if (!visible || !progress) return null;

  const isTyping = progress.status === 'typing';
  const isPaused = progress.status === 'paused';
  const isDone = progress.status === 'completed';

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        border: '1px solid rgba(59, 130, 246, 0.35)',
        borderRadius: '20px',
        padding: '4px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        zIndex: 9999,
        fontSize: '0.72rem',
        color: '#f8fafc',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'auto',
      }}
    >
      <Keyboard size={13} color="#60a5fa" />
      <span>
        {isDone ? 'Typed!' : isPaused ? 'Paused' : `${progress.percent}%`}
      </span>

      {isTyping && (
        <button
          onClick={() => window.fridayAPI?.typeFlowPause?.()}
          style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0 }}
          title="Pause typing"
        >
          <Pause size={12} />
        </button>
      )}

      {isPaused && (
        <button
          onClick={() => window.fridayAPI?.typeFlowResume?.()}
          style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 0 }}
          title="Resume typing"
        >
          <Play size={12} />
        </button>
      )}

      {(isTyping || isPaused) && (
        <button
          onClick={() => window.fridayAPI?.typeFlowCancel?.()}
          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
          title="Cancel typing"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
