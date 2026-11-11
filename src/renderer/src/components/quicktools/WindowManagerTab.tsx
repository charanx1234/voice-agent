import React, { useState, useEffect } from 'react';
import { Columns, Maximize2, Minimize2, Move, RefreshCw, Layout, AppWindow, CheckCircle2, AlertCircle } from 'lucide-react';
import { WindowInfo } from '@/shared/types';

export const WindowManagerTab: React.FC = () => {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const loadWindows = async () => {
    if (!window.fridayAPI) return;
    setIsLoading(true);
    try {
      const list = await window.fridayAPI.quickToolsListWindows();
      setWindows(list);
    } catch (err: any) {
      setStatusMessage({ text: 'Failed to list windows: ' + (err?.message || 'error'), isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWindows();
  }, []);

  const handleAction = async (action: 'split_left' | 'split_right' | 'maximize' | 'minimize' | 'restore' | 'center', target?: string) => {
    if (!window.fridayAPI) return;
    try {
      const res = await window.fridayAPI.quickToolsApplyWindowLayout({
        action,
        windowTarget: target,
      });
      setStatusMessage({ text: res.message, isError: !res.success });
      setTimeout(() => setStatusMessage(null), 4000);
      loadWindows();
    } catch (err: any) {
      setStatusMessage({ text: 'Action failed: ' + (err?.message || 'error'), isError: true });
    }
  };

  const handleSideBySide = async (app1: string, app2: string) => {
    if (!window.fridayAPI) return;
    try {
      const res = await window.fridayAPI.quickToolsApplyWindowLayout({
        action: 'split_left',
        windowTarget: app1,
        secondTarget: app2,
      });
      setStatusMessage({ text: res.message, isError: !res.success });
      setTimeout(() => setStatusMessage(null), 4000);
      loadWindows();
    } catch (err: any) {
      setStatusMessage({ text: 'Side-by-side failed: ' + (err?.message || 'error'), isError: true });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Quick Layout Presets */}
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
          Quick Window Presets
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          <button
            onClick={() => handleAction('split_left')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Columns size={15} style={{ color: 'var(--accent)' }} />
            Snap Left
          </button>

          <button
            onClick={() => handleAction('split_right')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Columns size={15} style={{ transform: 'scaleX(-1)', color: 'var(--accent)' }} />
            Snap Right
          </button>

          <button
            onClick={() => handleSideBySide('Chrome', 'Code')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Layout size={15} style={{ color: 'var(--accent)' }} />
            Chrome | Code
          </button>

          <button
            onClick={() => handleAction('maximize')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Maximize2 size={15} style={{ color: 'var(--accent)' }} />
            Maximize
          </button>

          <button
            onClick={() => handleAction('center')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Move size={15} style={{ color: 'var(--accent)' }} />
            Center
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '8px',
            background: statusMessage.isError
              ? 'color-mix(in srgb, var(--error, #ef4444) 15%, transparent)'
              : 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)',
            border: `1px solid ${statusMessage.isError ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)'}`,
            fontSize: '0.85rem',
            color: 'var(--text)',
          }}
        >
          {statusMessage.isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Active Windows List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
            Detected Windows ({windows.length})
          </div>
          <button
            onClick={loadWindows}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            <RefreshCw size={13} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        {windows.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: '0.85rem',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--surface) 30%, transparent)',
            }}
          >
            {isLoading ? 'Scanning open windows...' : 'No application windows detected.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
            {windows.map((win) => (
              <div
                key={win.handle}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, marginRight: '12px' }}>
                  <AppWindow size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {win.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      {win.processName} • ID: {win.handle}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleAction('split_left', win.title)}
                    title="Snap to Left Half"
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
                      border: '1px solid var(--border)',
                      fontSize: '0.72rem',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    Snap L
                  </button>
                  <button
                    onClick={() => handleAction('split_right', win.title)}
                    title="Snap to Right Half"
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
                      border: '1px solid var(--border)',
                      fontSize: '0.72rem',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    Snap R
                  </button>
                  <button
                    onClick={() => handleAction('maximize', win.title)}
                    title="Maximize Window"
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
                      border: '1px solid var(--border)',
                      fontSize: '0.72rem',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    Max
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
