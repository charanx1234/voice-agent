import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';
import { ToolConfirmationPayload } from '@/shared/types';

interface ToolConfirmModalProps {
  request: ToolConfirmationPayload | null;
  onRespond: (confirmed: boolean) => void;
}

export const ToolConfirmModal: React.FC<ToolConfirmModalProps> = ({ request, onRespond }) => {
  if (!request) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'color-mix(in srgb, var(--overlay) 85%, transparent)',
        backdropFilter: 'blur(8px)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--warning)',
          borderRadius: '16px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 12px 30px color-mix(in srgb, var(--shadow-color) 60%, transparent), 0 0 20px color-mix(in srgb, var(--warning) 15%, transparent)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'color-mix(in srgb, var(--warning) 15%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--warning)',
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)' }}>
              Action Permission Required
            </h4>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              Tool: {request.toolName}
            </span>
          </div>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: '1.5' }}>
          {request.description}
        </p>

        {request.details && Object.keys(request.details).length > 0 && (
          <div
            style={{
              backgroundColor: 'color-mix(in srgb, var(--shadow-color) 35%, transparent)',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '0.74rem',
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(request.details, null, 2)}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button
            type="button"
            onClick={() => onRespond(false)}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)',
              border: '1px solid color-mix(in srgb, var(--text) 15%, transparent)',
              color: 'var(--muted)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <X size={14} />
            <span>Deny</span>
          </button>
          <button
            type="button"
            onClick={() => onRespond(true)}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent)',
              border: 'none',
              color: 'var(--bg)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Check size={14} />
            <span>Allow</span>
          </button>
        </div>
      </div>
    </div>
  );
};
