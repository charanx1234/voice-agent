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
        backgroundColor: 'rgba(4, 7, 13, 0.85)',
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
          backgroundColor: '#0f172a',
          border: '1px solid #f59e0b',
          borderRadius: '16px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(245, 158, 11, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc' }}>
              Action Permission Required
            </h4>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              Tool: {request.toolName}
            </span>
          </div>
        </div>

        <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.5' }}>
          {request.description}
        </p>

        {request.details && Object.keys(request.details).length > 0 && (
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '0.74rem',
              color: '#94a3b8',
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
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#94a3b8',
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
              backgroundColor: '#00e5ff',
              border: 'none',
              color: '#0a0e17',
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
