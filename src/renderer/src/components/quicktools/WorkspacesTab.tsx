import React, { useState, useEffect } from 'react';
import { Play, Plus, Trash2, CheckCircle2, AlertCircle, Laptop, Layers, Clock } from 'lucide-react';
import { WorkspaceConfig } from '@/shared/types';

export const WorkspacesTab: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
  const [isLaunchingId, setIsLaunchingId] = useState<string | null>(null);
  const [launchStatus, setLaunchStatus] = useState<{ id: string; message: string; isError?: boolean } | null>(null);

  // New Workspace State
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [app1Id, setApp1Id] = useState('code');
  const [app1Pos, setApp1Pos] = useState<'left' | 'right' | 'center' | 'maximize'>('left');
  const [app2Id, setApp2Id] = useState('chrome');
  const [app2Pos, setApp2Pos] = useState<'left' | 'right' | 'center' | 'maximize'>('right');

  const loadWorkspaces = async () => {
    if (!window.fridayAPI) return;
    try {
      const list = await window.fridayAPI.quickToolsListWorkspaces();
      setWorkspaces(list);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const handleLaunch = async (ws: WorkspaceConfig) => {
    if (!window.fridayAPI) return;
    setIsLaunchingId(ws.id);
    setLaunchStatus(null);
    try {
      const res = await window.fridayAPI.quickToolsLaunchWorkspace(ws.id);
      setLaunchStatus({
        id: ws.id,
        message: res.success
          ? `Launched ${ws.name} (${res.launchedCount} apps opened & positioned).`
          : `Failed: ${res.errors.join(', ')}`,
        isError: !res.success,
      });
      setTimeout(() => setLaunchStatus(null), 5000);
    } catch (err: any) {
      setLaunchStatus({
        id: ws.id,
        message: 'Launch failed: ' + (err?.message || 'unknown error'),
        isError: true,
      });
    } finally {
      setIsLaunchingId(null);
    }
  };

  const handleSaveWorkspace = async () => {
    if (!newName.trim() || !window.fridayAPI) return;
    try {
      await window.fridayAPI.quickToolsSaveWorkspace({
        name: newName.trim(),
        description: newDesc.trim() || 'Custom user workspace',
        apps: [
          { appId: app1Id, name: app1Id.toUpperCase(), layoutPosition: app1Pos, launchDelayMs: 0 },
          { appId: app2Id, name: app2Id.toUpperCase(), layoutPosition: app2Pos, launchDelayMs: 1200 },
        ],
      });
      setNewName('');
      setNewDesc('');
      setIsCreating(false);
      loadWorkspaces();
    } catch (err) {
      console.error('Failed to save workspace:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.fridayAPI) return;
    try {
      await window.fridayAPI.quickToolsDeleteWorkspace(id);
      loadWorkspaces();
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header & Create Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
            One-Click Productivity Workspaces
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            Launch your complete workflow with apps arranged automatically.
          </div>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '8px',
            background: isCreating ? 'transparent' : 'var(--accent)',
            border: isCreating ? '1px solid var(--border)' : 'none',
            color: isCreating ? 'var(--muted)' : '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          {isCreating ? 'Cancel' : 'New Workspace'}
        </button>
      </div>

      {/* Create Workspace Form */}
      {isCreating && (
        <div
          style={{
            padding: '14px',
            borderRadius: '10px',
            background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
            border: '1px solid var(--accent)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Create New Workspace</div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Workspace Name (e.g. Design & Review)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.82rem',
              }}
            />
            <input
              type="text"
              placeholder="Short description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={app1Id}
                onChange={(e) => setApp1Id(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                }}
              >
                <option value="code">VS Code</option>
                <option value="chrome">Google Chrome</option>
                <option value="notepad">Notepad</option>
                <option value="spotify">Spotify</option>
                <option value="calculator">Calculator</option>
              </select>
              <select
                value={app1Pos}
                onChange={(e) => setApp1Pos(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                }}
              >
                <option value="left">Left Half</option>
                <option value="right">Right Half</option>
                <option value="center">Centered</option>
                <option value="maximize">Maximized</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={app2Id}
                onChange={(e) => setApp2Id(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                }}
              >
                <option value="chrome">Google Chrome</option>
                <option value="code">VS Code</option>
                <option value="notepad">Notepad</option>
                <option value="spotify">Spotify</option>
                <option value="calculator">Calculator</option>
              </select>
              <select
                value={app2Pos}
                onChange={(e) => setApp2Pos(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                }}
              >
                <option value="right">Right Half</option>
                <option value="left">Left Half</option>
                <option value="center">Centered</option>
                <option value="maximize">Maximized</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={() => setIsCreating(false)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveWorkspace}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save Workspace
            </button>
          </div>
        </div>
      )}

      {/* Workspaces List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {workspaces.map((ws) => {
          const isCurrentLaunching = isLaunchingId === ws.id;
          const status = launchStatus?.id === ws.id ? launchStatus : null;

          return (
            <div
              key={ws.id}
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'color-mix(in srgb, var(--surface) 50%, transparent)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                    }}
                  >
                    <Layers size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>{ws.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{ws.description}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {!['ws_coding', 'ws_study', 'ws_clean'].includes(ws.id) && (
                    <button
                      onClick={() => handleDelete(ws.id)}
                      title="Delete workspace"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: '6px',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}

                  <button
                    onClick={() => handleLaunch(ws)}
                    disabled={isCurrentLaunching}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 16px',
                      borderRadius: '8px',
                      background: 'var(--accent)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Play size={13} fill="#fff" />
                    {isCurrentLaunching ? 'Launching...' : 'Launch'}
                  </button>
                </div>
              </div>

              {/* Apps in Workspace Chips */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {ws.apps.map((app, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: '0.72rem',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Laptop size={11} style={{ color: 'var(--accent)' }} />
                    {app.name} ({app.layoutPosition})
                  </span>
                ))}
              </div>

              {status && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    color: status.isError ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)',
                    marginTop: '2px',
                  }}
                >
                  {status.isError ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
                  <span>{status.message}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
