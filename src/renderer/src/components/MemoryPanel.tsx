import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Plus,
  Search,
  Trash2,
  Pencil,
  Brain,
  Check,
  AlertTriangle,
  Database,
  Archive,
  History,
  Activity,
  FolderGit2,
  Shield,
  Download,
  RefreshCw,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  AlertCircle,
  Eye,
} from 'lucide-react';
import {
  FimaStats,
  MemoryActivityItem,
  MemoryHistoryItem,
  MemoryInputPayload,
  MemoryItem,
  MemoryKind,
  MemoryStatus,
  ProjectInputPayload,
  ProjectItem,
  ProjectStatus,
} from '@/shared/types';

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  memoryEnabled: boolean;
  onToggleMemory: (enabled: boolean) => void;
  onChanged?: (count: number) => void;
}

type TabKey = 'overview' | 'explorer' | 'projects' | 'activity' | 'privacy';

interface Draft {
  kind: MemoryKind;
  title: string;
  content: string;
  subject: string;
  importance: number;
  projectId?: string;
  status?: MemoryStatus;
}

const EMPTY_DRAFT: Draft = {
  kind: 'fact',
  title: '',
  content: '',
  subject: '',
  importance: 3,
  status: 'active',
};

const KIND_LABELS: Record<MemoryKind, string> = {
  preference: 'Preference',
  personal: 'Personal',
  project: 'Project',
  fact: 'Fact',
  instruction: 'Instruction',
};

const KIND_COLORS: Record<MemoryKind, string> = {
  preference: 'var(--info, #38bdf8)',
  personal: 'var(--accent, #a855f7)',
  project: 'var(--success, #22c55e)',
  fact: 'var(--muted, #94a3b8)',
  instruction: 'var(--warning, #f59e0b)',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--success, #22c55e)',
  temporary: 'var(--info, #38bdf8)',
  outdated: 'var(--muted-dim, #64748b)',
  superseded: 'var(--muted-dim, #64748b)',
  archived: 'var(--muted-dim, #64748b)',
  pending_review: 'var(--warning, #f59e0b)',
};

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  proposed: 'Proposed',
  planned: 'Planned',
  in_progress: 'In Progress',
  implemented: 'Implemented',
  verified: 'Verified',
  failed: 'Failed',
  deprecated: 'Deprecated',
  archived: 'Archived',
};

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  isOpen,
  onClose,
  memoryEnabled,
  onToggleMemory,
  onChanged,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [activities, setActivities] = useState<MemoryActivityItem[]>([]);
  const [fimaStats, setFimaStats] = useState<FimaStats | null>(null);

  // Explorer filters & state
  const [query, setQuery] = useState('');
  const [filterKind, setFilterKind] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'importance' | 'oldest'>('newest');

  // Loading & interaction states
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Drafts & modals
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<MemoryHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Project modal
  const [projectDraft, setProjectDraft] = useState<ProjectInputPayload | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [confirmingProjectId, setConfirmingProjectId] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    if (!window.fridayAPI) return;
    setLoading(true);
    try {
      const [allMemories, allProjects, stats, acts] = await Promise.all([
        window.fridayAPI.listMemories({ limit: 300 }),
        window.fridayAPI.listProjects ? window.fridayAPI.listProjects() : Promise.resolve([]),
        window.fridayAPI.getFimaStats ? window.fridayAPI.getFimaStats() : null,
        window.fridayAPI.getMemoryActivity ? window.fridayAPI.getMemoryActivity(50) : Promise.resolve([]),
      ]);

      setItems(allMemories);
      setProjects(allProjects);
      if (stats) setFimaStats(stats);
      setActivities(acts);
      onChanged?.(allMemories.length);
    } catch (err: any) {
      console.warn('[MemoryPanel] refresh failed:', err?.message);
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setFeedback('');
      void refreshAll();
    }
  }, [isOpen, refreshAll]);

  // Debounced semantic search in Explorer
  useEffect(() => {
    if (!isOpen || activeTab !== 'explorer') return undefined;
    const clean = query.trim();
    if (!clean) {
      void refreshAll();
      return undefined;
    }

    const timer = setTimeout(async () => {
      if (!window.fridayAPI) return;
      setLoading(true);
      try {
        const hits = await window.fridayAPI.searchMemories(clean, 30);
        setItems(hits);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, isOpen, activeTab, refreshAll]);

  // View memory history / audit trail
  const toggleHistory = async (memoryId: string) => {
    if (expandedHistoryId === memoryId) {
      setExpandedHistoryId(null);
      setHistoryItems([]);
      return;
    }

    setExpandedHistoryId(memoryId);
    setHistoryLoading(true);
    try {
      if (window.fridayAPI?.getMemoryHistory) {
        const history = await window.fridayAPI.getMemoryHistory(memoryId);
        setHistoryItems(history);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!isOpen) return null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const saveDraft = async () => {
    if (!draft || !window.fridayAPI) return;
    if (!draft.title.trim() || !draft.content.trim()) {
      setError('Title and content are required.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const payload: MemoryInputPayload = {
        kind: draft.kind,
        title: draft.title.trim(),
        content: draft.content.trim(),
        subject: draft.subject.trim(),
        importance: draft.importance,
        projectId: draft.projectId || undefined,
        status: draft.status || 'active',
      };

      if (editingId) {
        await window.fridayAPI.updateMemory(editingId, payload);
        setFeedback('Memory updated.');
      } else {
        await window.fridayAPI.createMemory(payload);
        setFeedback('Memory created.');
      }

      setDraft(null);
      setEditingId(null);
      void refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to save memory.');
    } finally {
      setBusy(false);
    }
  };

  const removeMemory = async (id: string) => {
    if (!window.fridayAPI) return;
    setBusy(true);
    try {
      await window.fridayAPI.deleteMemory(id);
      setConfirmingId(null);
      setFeedback('Memory deleted.');
      void refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete memory.');
    } finally {
      setBusy(false);
    }
  };

  const archiveMemory = async (id: string) => {
    if (!window.fridayAPI?.archiveMemory) return;
    setBusy(true);
    try {
      await window.fridayAPI.archiveMemory(id);
      setFeedback('Memory archived.');
      void refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to archive memory.');
    } finally {
      setBusy(false);
    }
  };

  const saveProject = async () => {
    if (!projectDraft || !window.fridayAPI) return;
    if (!projectDraft.name?.trim()) {
      setError('Project name is required.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (editingProjectId && window.fridayAPI.updateProject) {
        await window.fridayAPI.updateProject(editingProjectId, projectDraft);
        setFeedback('Project updated.');
      } else if (window.fridayAPI.createProject) {
        await window.fridayAPI.createProject(projectDraft);
        setFeedback('Project created.');
      }
      setProjectDraft(null);
      setEditingProjectId(null);
      void refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to save project.');
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!window.fridayAPI?.deleteProject) return;
    setBusy(true);
    try {
      await window.fridayAPI.deleteProject(id);
      setConfirmingProjectId(null);
      setFeedback('Project deleted.');
      void refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete project.');
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    if (!window.fridayAPI?.exportMemories) return;
    try {
      const json = await window.fridayAPI.exportMemories();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `friday-memories-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback('Memories exported successfully.');
    } catch (err: any) {
      setError(err?.message || 'Export failed.');
    }
  };

  const clearCategory = async (cat: string) => {
    if (!window.fridayAPI?.clearMemoryCategory) return;
    setBusy(true);
    try {
      const count = await window.fridayAPI.clearMemoryCategory(cat as any);
      setFeedback(`Cleared ${count} items from ${cat}.`);
      void refreshAll();
    } catch (err: any) {
      setError(err?.message || 'Clear failed.');
    } finally {
      setBusy(false);
    }
  };

  // ── Explorer Filtered List ─────────────────────────────────────────────────
  const filteredItems = items
    .filter((m) => {
      if (filterKind !== 'all' && m.kind !== filterKind) return false;
      if (filterStatus !== 'all' && (m.status || 'active') !== filterStatus) return false;
      if (filterProject !== 'all' && m.projectId !== filterProject) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'importance') return b.importance - a.importance;
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '880px',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg, #0f172a)',
          border: '1px solid var(--border, #1e293b)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          color: 'var(--text, #f8fafc)',
        }}
      >
        {/* ── Top Header ──────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border, #1e293b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'color-mix(in srgb, var(--bg, #0f172a) 90%, black)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'color-mix(in srgb, var(--accent, #a855f7) 20%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent, #a855f7)',
              }}
            >
              <Brain size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                  FRIDAY Intelligent Memory
                </h2>
                <span
                  style={{
                    fontSize: '0.62rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'color-mix(in srgb, var(--accent, #a855f7) 18%, transparent)',
                    color: 'var(--accent, #a855f7)',
                    fontWeight: 700,
                  }}
                >
                  FIMA V1
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--muted, #94a3b8)', margin: '2px 0 0 0' }}>
                Context-aware, self-maintaining memory architecture
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                color: memoryEnabled ? 'var(--success, #22c55e)' : 'var(--muted, #94a3b8)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={(e) => onToggleMemory(e.target.checked)}
                style={{ accentColor: 'var(--accent, #a855f7)', cursor: 'pointer' }}
              />
              {memoryEnabled ? 'Memory Enabled' : 'Memory Paused'}
            </label>

            <button
              onClick={() => void refreshAll()}
              title="Refresh"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted, #94a3b8)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
              }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted, #94a3b8)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Navigation Tabs ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            padding: '0 20px',
            borderBottom: '1px solid var(--border, #1e293b)',
            gap: '8px',
            backgroundColor: 'color-mix(in srgb, var(--bg, #0f172a) 95%, black)',
          }}
        >
          {[
            { key: 'overview', label: 'Overview', icon: <Layers size={13} /> },
            { key: 'explorer', label: `Explorer (${items.length})`, icon: <Search size={13} /> },
            { key: 'projects', label: `Projects (${projects.length})`, icon: <FolderGit2 size={13} /> },
            { key: 'activity', label: 'Activity Log', icon: <Activity size={13} /> },
            { key: 'privacy', label: 'Privacy & Control', icon: <Shield size={13} /> },
          ].map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key as TabKey);
                  setError('');
                  setFeedback('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isSelected ? '2px solid var(--accent, #a855f7)' : '2px solid transparent',
                  color: isSelected ? 'var(--text, #f8fafc)' : 'var(--muted, #94a3b8)',
                  fontSize: '0.78rem',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Notifications / Alerts ──────────────────────────────────────────── */}
        {feedback && (
          <div
            style={{
              padding: '6px 20px',
              backgroundColor: 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)',
              color: 'var(--success, #22c55e)',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{feedback}</span>
            <button
              onClick={() => setFeedback('')}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '6px 20px',
              backgroundColor: 'color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)',
              color: 'var(--danger, #ef4444)',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* ── Tab Content ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* 1. OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Stat Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '12px',
                }}
              >
                {[
                  {
                    label: 'Active Memories',
                    value: fimaStats?.totalActive ?? items.length,
                    icon: <Check size={16} color="var(--success, #22c55e)" />,
                  },
                  {
                    label: 'Projects',
                    value: fimaStats?.projectCount ?? projects.length,
                    icon: <FolderGit2 size={16} color="var(--accent, #a855f7)" />,
                  },
                  {
                    label: 'Temporary / Working',
                    value: fimaStats?.totalTemporary ?? 0,
                    icon: <Clock size={16} color="var(--info, #38bdf8)" />,
                  },
                  {
                    label: 'Outdated / Superseded',
                    value: (fimaStats?.totalOutdated ?? 0) + (fimaStats?.totalArchived ?? 0),
                    icon: <Archive size={16} color="var(--muted, #94a3b8)" />,
                  },
                  {
                    label: 'Pending Review',
                    value: fimaStats?.totalPendingReview ?? 0,
                    icon: <AlertTriangle size={16} color="var(--warning, #f59e0b)" />,
                    highlight: (fimaStats?.totalPendingReview ?? 0) > 0,
                  },
                  {
                    label: '24h Activity',
                    value: fimaStats?.activityLast24h ?? activities.length,
                    icon: <Sparkles size={16} color="var(--accent, #a855f7)" />,
                  },
                ].map((stat, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '14px',
                      backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 30%, transparent)',
                      border: `1px solid ${
                        stat.highlight ? 'var(--warning, #f59e0b)' : 'var(--border, #1e293b)'
                      }`,
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--muted, #94a3b8)' }}>{stat.label}</span>
                      {stat.icon}
                    </div>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{stat.value}</span>
                  </div>
                ))}
              </div>

              {/* Memory Intelligence Status */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'color-mix(in srgb, var(--accent, #a855f7) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent, #a855f7) 20%, transparent)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    backgroundColor: 'color-mix(in srgb, var(--accent, #a855f7) 20%, transparent)',
                    color: 'var(--accent, #a855f7)',
                  }}
                >
                  <Brain size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 600 }}>
                    Memory Intelligence Gate Active
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted, #94a3b8)', lineHeight: 1.5 }}>
                    FRIDAY continuously evaluates every exchange. Greetings, emotional states, and temporary queries are
                    automatically filtered out. Useful preferences, personal facts, and project milestones are
                    saved or updated with conflict detection.
                  </p>
                </div>
              </div>

              {/* Category Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted, #94a3b8)' }}>
                  MEMORY CATEGORIES
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(['preference', 'personal', 'project', 'instruction', 'fact'] as MemoryKind[]).map((kind) => {
                    const count = items.filter((m) => m.kind === kind).length;
                    return (
                      <div
                        key={kind}
                        onClick={() => {
                          setFilterKind(kind);
                          setActiveTab('explorer');
                        }}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 40%, transparent)',
                          border: '1px solid var(--border, #1e293b)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: KIND_COLORS[kind],
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{KIND_LABELS[kind]}</span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: 'color-mix(in srgb, var(--text, #fff) 10%, transparent)',
                          }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Actions Bar */}
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 20%, transparent)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)' }}>
                  Need to add a permanent preference or instruction manually?
                </span>
                <button
                  onClick={() => {
                    setDraft({ ...EMPTY_DRAFT });
                    setActiveTab('explorer');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    backgroundColor: 'var(--accent, #a855f7)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={13} />
                  <span>Add Memory</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. EXPLORER TAB */}
          {activeTab === 'explorer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Search & Actions Bar */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div
                  style={{
                    flex: 1,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      color: 'var(--muted, #94a3b8)',
                    }}
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search memories semantically or by keyword..."
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 34px',
                      backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 40%, transparent)',
                      border: '1px solid var(--border, #1e293b)',
                      borderRadius: '8px',
                      color: 'var(--text, #f8fafc)',
                      fontSize: '0.78rem',
                      outline: 'none',
                    }}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted, #94a3b8)',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => {
                    setDraft({ ...EMPTY_DRAFT });
                    setEditingId(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: 'var(--accent, #a855f7)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Plus size={14} />
                  <span>New Memory</span>
                </button>
              </div>

              {/* Filters row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                  fontSize: '0.72rem',
                  color: 'var(--muted, #94a3b8)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Filter size={12} />
                  <span>Filters:</span>
                </div>

                {/* Kind Filter */}
                <select
                  value={filterKind}
                  onChange={(e) => setFilterKind(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg, #0f172a)',
                    border: '1px solid var(--border, #1e293b)',
                    borderRadius: '6px',
                    color: 'var(--text, #f8fafc)',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                  }}
                >
                  <option value="all">All Categories</option>
                  <option value="preference">Preference</option>
                  <option value="personal">Personal</option>
                  <option value="project">Project</option>
                  <option value="instruction">Instruction</option>
                  <option value="fact">Fact</option>
                </select>

                {/* Status Filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg, #0f172a)',
                    border: '1px solid var(--border, #1e293b)',
                    borderRadius: '6px',
                    color: 'var(--text, #f8fafc)',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="temporary">Temporary</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="outdated">Outdated</option>
                  <option value="superseded">Superseded</option>
                  <option value="archived">Archived</option>
                </select>

                {/* Project Filter */}
                {projects.length > 0 && (
                  <select
                    value={filterProject}
                    onChange={(e) => setFilterProject(e.target.value)}
                    style={{
                      backgroundColor: 'var(--bg, #0f172a)',
                      border: '1px solid var(--border, #1e293b)',
                      borderRadius: '6px',
                      color: 'var(--text, #f8fafc)',
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                    }}
                  >
                    <option value="all">All Projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Sort Filter */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    style={{
                      backgroundColor: 'var(--bg, #0f172a)',
                      border: '1px solid var(--border, #1e293b)',
                      borderRadius: '6px',
                      color: 'var(--text, #f8fafc)',
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                    }}
                  >
                    <option value="newest">Newest First</option>
                    <option value="importance">Highest Importance</option>
                    <option value="oldest">Oldest First</option>
                  </select>
                </div>
              </div>

              {/* Draft editor modal / form */}
              {draft && (
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 35%, transparent)',
                    border: '1px solid var(--accent, #a855f7)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>
                      {editingId ? 'Edit Memory' : 'New Memory'}
                    </h4>
                    <button
                      onClick={() => setDraft(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted, #94a3b8)', cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Category</label>
                      <select
                        value={draft.kind}
                        onChange={(e) => setDraft({ ...draft, kind: e.target.value as MemoryKind })}
                        style={{
                          width: '100%',
                          marginTop: '4px',
                          padding: '6px 10px',
                          backgroundColor: 'var(--bg, #0f172a)',
                          border: '1px solid var(--border, #1e293b)',
                          borderRadius: '6px',
                          color: 'var(--text, #f8fafc)',
                          fontSize: '0.75rem',
                        }}
                      >
                        <option value="preference">Preference</option>
                        <option value="personal">Personal</option>
                        <option value="project">Project</option>
                        <option value="instruction">Instruction</option>
                        <option value="fact">Fact</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Status</label>
                      <select
                        value={draft.status || 'active'}
                        onChange={(e) => setDraft({ ...draft, status: e.target.value as MemoryStatus })}
                        style={{
                          width: '100%',
                          marginTop: '4px',
                          padding: '6px 10px',
                          backgroundColor: 'var(--bg, #0f172a)',
                          border: '1px solid var(--border, #1e293b)',
                          borderRadius: '6px',
                          color: 'var(--text, #f8fafc)',
                          fontSize: '0.75rem',
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="temporary">Temporary</option>
                        <option value="outdated">Outdated</option>
                        <option value="superseded">Superseded</option>
                        <option value="archived">Archived</option>
                        <option value="pending_review">Pending Review</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Title</label>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      placeholder="e.g. Communication preference or Current goal"
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg, #0f172a)',
                        border: '1px solid var(--border, #1e293b)',
                        borderRadius: '6px',
                        color: 'var(--text, #f8fafc)',
                        fontSize: '0.75rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Content (Concise statement)</label>
                    <textarea
                      value={draft.content}
                      onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                      rows={3}
                      placeholder="e.g. User prefers concise answers without fluff."
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg, #0f172a)',
                        border: '1px solid var(--border, #1e293b)',
                        borderRadius: '6px',
                        color: 'var(--text, #f8fafc)',
                        fontSize: '0.75rem',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>
                        Importance (1-5): {draft.importance}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={draft.importance}
                        onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })}
                        style={{ width: '100%', marginTop: '6px', accentColor: 'var(--accent, #a855f7)' }}
                      />
                    </div>

                    {projects.length > 0 && (
                      <div>
                        <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Link to Project</label>
                        <select
                          value={draft.projectId || ''}
                          onChange={(e) => setDraft({ ...draft, projectId: e.target.value || undefined })}
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '6px 10px',
                            backgroundColor: 'var(--bg, #0f172a)',
                            border: '1px solid var(--border, #1e293b)',
                            borderRadius: '6px',
                            color: 'var(--text, #f8fafc)',
                            fontSize: '0.75rem',
                          }}
                        >
                          <option value="">(None)</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                    <button
                      onClick={() => setDraft(null)}
                      style={{
                        padding: '6px 12px',
                        background: 'none',
                        border: '1px solid var(--border, #1e293b)',
                        borderRadius: '6px',
                        color: 'var(--muted, #94a3b8)',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveDraft}
                      disabled={busy}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: 'var(--accent, #a855f7)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {editingId ? 'Update Memory' : 'Save Memory'}
                    </button>
                  </div>
                </div>
              )}

              {/* Memory Cards List */}
              {filteredItems.length === 0 ? (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--muted, #94a3b8)',
                    fontSize: '0.8rem',
                  }}
                >
                  No memories match your query or filters.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredItems.map((memory) => {
                    const status = memory.status || 'active';
                    const isHistoryOpen = expandedHistoryId === memory.id;

                    return (
                      <div
                        key={memory.id}
                        style={{
                          padding: '14px',
                          backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 25%, transparent)',
                          border: `1px solid ${
                            status === 'pending_review'
                              ? 'var(--warning, #f59e0b)'
                              : 'var(--border, #1e293b)'
                          }`,
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: '0.62rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: `color-mix(in srgb, ${KIND_COLORS[memory.kind]} 15%, transparent)`,
                                color: KIND_COLORS[memory.kind],
                                fontWeight: 700,
                                textTransform: 'uppercase',
                              }}
                            >
                              {memory.kind}
                            </span>

                            {status !== 'active' && (
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: `color-mix(in srgb, ${STATUS_COLORS[status]} 15%, transparent)`,
                                  color: STATUS_COLORS[status],
                                  fontWeight: 600,
                                }}
                              >
                                {status.replace(/_/g, ' ')}
                              </span>
                            )}

                            {memory.projectId && (
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'color-mix(in srgb, var(--accent, #a855f7) 15%, transparent)',
                                  color: 'var(--accent, #a855f7)',
                                }}
                              >
                                {projects.find((p) => p.id === memory.projectId)?.name || 'Project'}
                              </span>
                            )}

                            <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{memory.title}</h4>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.66rem', color: 'var(--warning, #f59e0b)' }}>
                              {'★'.repeat(memory.importance)}
                              {'☆'.repeat(5 - memory.importance)}
                            </span>

                            <button
                              onClick={() => toggleHistory(memory.id)}
                              title="Audit History"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: isHistoryOpen ? 'var(--accent, #a855f7)' : 'var(--muted, #94a3b8)',
                                cursor: 'pointer',
                                padding: '4px',
                              }}
                            >
                              <History size={13} />
                            </button>

                            <button
                              onClick={() => {
                                setDraft({
                                  kind: memory.kind,
                                  title: memory.title,
                                  content: memory.content,
                                  subject: memory.subject,
                                  importance: memory.importance,
                                  projectId: memory.projectId,
                                  status: (memory.status as MemoryStatus) || 'active',
                                });
                                setEditingId(memory.id);
                              }}
                              title="Edit"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--muted, #94a3b8)',
                                cursor: 'pointer',
                                padding: '4px',
                              }}
                            >
                              <Pencil size={13} />
                            </button>

                            {status === 'active' && (
                              <button
                                onClick={() => archiveMemory(memory.id)}
                                title="Archive"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--muted, #94a3b8)',
                                  cursor: 'pointer',
                                  padding: '4px',
                                }}
                              >
                                <Archive size={13} />
                              </button>
                            )}

                            {confirmingId === memory.id ? (
                              <button
                                onClick={() => removeMemory(memory.id)}
                                disabled={busy}
                                style={{
                                  background: 'none',
                                  border: '1px solid var(--danger, #ef4444)',
                                  borderRadius: '4px',
                                  color: 'var(--danger, #ef4444)',
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  cursor: 'pointer',
                                }}
                              >
                                Confirm?
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmingId(memory.id)}
                                title="Delete"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--danger, #ef4444)',
                                  cursor: 'pointer',
                                  padding: '4px',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.76rem',
                            lineHeight: 1.5,
                            color: 'var(--text, #f8fafc)',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {memory.content}
                        </p>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.65rem',
                            color: 'var(--muted-dim, #64748b)',
                          }}
                        >
                          <span>
                            Updated {new Date(memory.updatedAt || memory.createdAt).toLocaleDateString()}
                            {memory.version ? ` • v${memory.version}` : ''}
                            {memory.source ? ` • source: ${memory.source}` : ''}
                          </span>

                          {typeof memory.score === 'number' && query.trim() && (
                            <span style={{ color: 'var(--accent, #a855f7)', fontWeight: 600 }}>
                              {(memory.score * 100).toFixed(0)}% relevance
                            </span>
                          )}
                        </div>

                        {/* Audit Trail / History view */}
                        {isHistoryOpen && (
                          <div
                            style={{
                              marginTop: '8px',
                              padding: '10px',
                              backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 40%, black)',
                              borderRadius: '8px',
                              border: '1px solid var(--border, #1e293b)',
                            }}
                          >
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted, #94a3b8)' }}>
                              Audit Trail / Changelog
                            </span>
                            {historyLoading ? (
                              <div style={{ fontSize: '0.7rem', color: 'var(--muted, #94a3b8)', padding: '6px 0' }}>
                                Loading history...
                              </div>
                            ) : historyItems.length === 0 ? (
                              <div style={{ fontSize: '0.7rem', color: 'var(--muted, #94a3b8)', padding: '6px 0' }}>
                                Initial version (created on {new Date(memory.createdAt).toLocaleDateString()}).
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                {historyItems.map((h) => (
                                  <div
                                    key={h.id}
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'color-mix(in srgb, var(--bg, #0f172a) 60%, transparent)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '2px',
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{h.action}</span>
                                      <span style={{ color: 'var(--muted-dim, #64748b)' }}>
                                        {new Date(h.createdAt).toLocaleTimeString()}
                                      </span>
                                    </div>
                                    {h.reason && <div style={{ color: 'var(--muted, #94a3b8)' }}>{h.reason}</div>}
                                    {h.oldContent && (
                                      <div style={{ color: 'var(--danger, #ef4444)', textDecoration: 'line-through' }}>
                                        {h.oldContent.slice(0, 100)}
                                      </div>
                                    )}
                                    {h.newContent && (
                                      <div style={{ color: 'var(--success, #22c55e)' }}>
                                        {h.newContent.slice(0, 100)}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. PROJECTS TAB */}
          {activeTab === 'projects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Project Memory</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>
                    Dedicated memory for individual ongoing projects, tracking architecture, decisions, and progress.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setProjectDraft({
                      name: '',
                      description: '',
                      objective: '',
                      techStack: [],
                      status: 'in_progress',
                    });
                    setEditingProjectId(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: 'var(--accent, #a855f7)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  <span>New Project</span>
                </button>
              </div>

              {/* Project Editor Modal */}
              {projectDraft && (
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 35%, transparent)',
                    border: '1px solid var(--accent, #a855f7)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>
                      {editingProjectId ? 'Edit Project' : 'Create Project'}
                    </h4>
                    <button
                      onClick={() => setProjectDraft(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--muted, #94a3b8)', cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Project Name</label>
                      <input
                        type="text"
                        value={projectDraft.name}
                        onChange={(e) => setProjectDraft({ ...projectDraft, name: e.target.value })}
                        placeholder="e.g. FRIDAY Desktop Companion"
                        style={{
                          width: '100%',
                          marginTop: '4px',
                          padding: '6px 10px',
                          backgroundColor: 'var(--bg, #0f172a)',
                          border: '1px solid var(--border, #1e293b)',
                          borderRadius: '6px',
                          color: 'var(--text, #f8fafc)',
                          fontSize: '0.75rem',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Status</label>
                      <select
                        value={projectDraft.status || 'in_progress'}
                        onChange={(e) =>
                          setProjectDraft({ ...projectDraft, status: e.target.value as ProjectStatus })
                        }
                        style={{
                          width: '100%',
                          marginTop: '4px',
                          padding: '6px 10px',
                          backgroundColor: 'var(--bg, #0f172a)',
                          border: '1px solid var(--border, #1e293b)',
                          borderRadius: '6px',
                          color: 'var(--text, #f8fafc)',
                          fontSize: '0.75rem',
                        }}
                      >
                        <option value="proposed">Proposed</option>
                        <option value="planned">Planned</option>
                        <option value="in_progress">In Progress</option>
                        <option value="implemented">Implemented</option>
                        <option value="verified">Verified</option>
                        <option value="failed">Failed</option>
                        <option value="deprecated">Deprecated</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Description</label>
                    <input
                      type="text"
                      value={projectDraft.description || ''}
                      onChange={(e) => setProjectDraft({ ...projectDraft, description: e.target.value })}
                      placeholder="High-level description of what the project does"
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg, #0f172a)',
                        border: '1px solid var(--border, #1e293b)',
                        borderRadius: '6px',
                        color: 'var(--text, #f8fafc)',
                        fontSize: '0.75rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>Objective / Goal</label>
                    <input
                      type="text"
                      value={projectDraft.objective || ''}
                      onChange={(e) => setProjectDraft({ ...projectDraft, objective: e.target.value })}
                      placeholder="Core goal or completion criterion"
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg, #0f172a)',
                        border: '1px solid var(--border, #1e293b)',
                        borderRadius: '6px',
                        color: 'var(--text, #f8fafc)',
                        fontSize: '0.75rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>
                      Tech Stack (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={(projectDraft.techStack || []).join(', ')}
                      onChange={(e) =>
                        setProjectDraft({
                          ...projectDraft,
                          techStack: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="e.g. Electron, React, TypeScript, Python, SQLite"
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg, #0f172a)',
                        border: '1px solid var(--border, #1e293b)',
                        borderRadius: '6px',
                        color: 'var(--text, #f8fafc)',
                        fontSize: '0.75rem',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                    <button
                      onClick={() => setProjectDraft(null)}
                      style={{
                        padding: '6px 12px',
                        background: 'none',
                        border: '1px solid var(--border, #1e293b)',
                        borderRadius: '6px',
                        color: 'var(--muted, #94a3b8)',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveProject}
                      disabled={busy}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: 'var(--accent, #a855f7)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {editingProjectId ? 'Update Project' : 'Create Project'}
                    </button>
                  </div>
                </div>
              )}

              {/* Project Cards */}
              {projects.length === 0 ? (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--muted, #94a3b8)',
                    fontSize: '0.8rem',
                  }}
                >
                  No projects defined yet. Create your first project to maintain separate context across conversations!
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                  {projects.map((project) => {
                    const linkedMemories = items.filter((m) => m.projectId === project.id);
                    return (
                      <div
                        key={project.id}
                        style={{
                          padding: '16px',
                          backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 25%, transparent)',
                          border: '1px solid var(--border, #1e293b)',
                          borderRadius: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span
                              style={{
                                fontSize: '0.62rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'color-mix(in srgb, var(--accent, #a855f7) 18%, transparent)',
                                color: 'var(--accent, #a855f7)',
                                fontWeight: 700,
                              }}
                            >
                              {PROJECT_STATUS_LABELS[project.status] || project.status}
                            </span>
                            <h4 style={{ margin: '6px 0 0 0', fontSize: '0.9rem', fontWeight: 700 }}>
                              {project.name}
                            </h4>
                          </div>

                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => {
                                setProjectDraft({
                                  name: project.name,
                                  description: project.description,
                                  objective: project.objective,
                                  techStack: project.techStack,
                                  status: project.status,
                                });
                                setEditingProjectId(project.id);
                              }}
                              title="Edit"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--muted, #94a3b8)',
                                cursor: 'pointer',
                                padding: '4px',
                              }}
                            >
                              <Pencil size={13} />
                            </button>

                            {confirmingProjectId === project.id ? (
                              <button
                                onClick={() => deleteProject(project.id)}
                                disabled={busy}
                                style={{
                                  background: 'none',
                                  border: '1px solid var(--danger, #ef4444)',
                                  borderRadius: '4px',
                                  color: 'var(--danger, #ef4444)',
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  cursor: 'pointer',
                                }}
                              >
                                Delete?
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmingProjectId(project.id)}
                                title="Delete"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--danger, #ef4444)',
                                  cursor: 'pointer',
                                  padding: '4px',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {project.description && (
                          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted, #94a3b8)', lineHeight: 1.45 }}>
                            {project.description}
                          </p>
                        )}

                        {project.objective && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text, #f8fafc)' }}>
                            <span style={{ color: 'var(--muted-dim, #64748b)' }}>Goal: </span>
                            {project.objective}
                          </div>
                        )}

                        {project.techStack && project.techStack.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {project.techStack.map((tech, i) => (
                              <span
                                key={i}
                                style={{
                                  fontSize: '0.62rem',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 50%, transparent)',
                                  color: 'var(--muted, #94a3b8)',
                                }}
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: 'auto',
                            paddingTop: '8px',
                            borderTop: '1px solid var(--border, #1e293b)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontSize: '0.68rem', color: 'var(--muted, #94a3b8)' }}>
                            {linkedMemories.length} linked memories
                          </span>

                          <button
                            onClick={() => {
                              setFilterProject(project.id);
                              setActiveTab('explorer');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent, #a855f7)',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <span>Explore</span>
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. ACTIVITY LOG TAB */}
          {activeTab === 'activity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Memory Activity Log</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>
                  Transparent audit log of why memories were saved, updated, merged, ignored, or retrieved.
                </p>
              </div>

              {activities.length === 0 ? (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--muted, #94a3b8)',
                    fontSize: '0.8rem',
                  }}
                >
                  No memory activity logged yet. Start chatting with FRIDAY to see automatic memory management in action!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activities.map((act) => {
                    const actionColors: Record<string, string> = {
                      saved: 'var(--success, #22c55e)',
                      updated: 'var(--info, #38bdf8)',
                      merged: 'var(--accent, #a855f7)',
                      archived: 'var(--muted, #94a3b8)',
                      deleted: 'var(--danger, #ef4444)',
                      conflict_detected: 'var(--warning, #f59e0b)',
                      retrieved: 'var(--info, #38bdf8)',
                      ignored: 'var(--muted-dim, #64748b)',
                    };

                    const color = actionColors[act.action] || 'var(--muted, #94a3b8)';

                    return (
                      <div
                        key={act.id}
                        style={{
                          padding: '10px 14px',
                          backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 20%, transparent)',
                          border: '1px solid var(--border, #1e293b)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                          <span
                            style={{
                              fontSize: '0.62rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                              color,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {act.action.replace(/_/g, ' ')}
                          </span>

                          <span style={{ fontSize: '0.74rem', color: 'var(--text, #f8fafc)', lineHeight: 1.4 }}>
                            {act.reason || 'Memory operation'}
                          </span>
                        </div>

                        <span style={{ fontSize: '0.65rem', color: 'var(--muted-dim, #64748b)', whiteSpace: 'nowrap' }}>
                          {new Date(act.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. PRIVACY & CONTROL TAB */}
          {activeTab === 'privacy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Privacy & Data Controls</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>
                  All memories are stored locally in SQLite on your device. You have complete control over what is kept.
                </p>
              </div>

              {/* Master Memory Switch */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 25%, transparent)',
                  border: '1px solid var(--border, #1e293b)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Automatic Memory Intelligence</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>
                    When enabled, FRIDAY automatically identifies useful facts and ignores temporary chatter.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={memoryEnabled}
                  onChange={(e) => onToggleMemory(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent, #a855f7)', cursor: 'pointer' }}
                />
              </div>

              {/* Data Export */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 25%, transparent)',
                  border: '1px solid var(--border, #1e293b)',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Export Memory Archive</h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--muted, #94a3b8)' }}>
                    Export your complete memory database and project profiles as a JSON file.
                  </p>
                </div>
                <button
                  onClick={exportAll}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: 'color-mix(in srgb, var(--accent, #a855f7) 18%, transparent)',
                    border: '1px solid var(--accent, #a855f7)',
                    borderRadius: '8px',
                    color: 'var(--accent, #a855f7)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Download size={14} />
                  <span>Export JSON</span>
                </button>
              </div>

              {/* Category Cleanups */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted, #94a3b8)' }}>
                  SELECTIVE CLEANUP
                </h4>

                <div
                  style={{
                    padding: '14px 16px',
                    backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 20%, transparent)',
                    border: '1px solid var(--border, #1e293b)',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Clean Outdated & Superseded Memories</span>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: 'var(--muted, #94a3b8)' }}>
                      Permanently purges memories that have been replaced by newer information.
                    </p>
                  </div>
                  <button
                    onClick={() => clearCategory('outdated')}
                    disabled={busy}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: '1px solid var(--border, #1e293b)',
                      borderRadius: '6px',
                      color: 'var(--muted, #94a3b8)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    Purge Outdated
                  </button>
                </div>

                <div
                  style={{
                    padding: '14px 16px',
                    backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 20%, transparent)',
                    border: '1px solid var(--border, #1e293b)',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Clear Temporary Working Memory</span>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: 'var(--muted, #94a3b8)' }}>
                      Clears session-scoped temporary tasks and troubleshooting notes.
                    </p>
                  </div>
                  <button
                    onClick={() => clearCategory('temporary')}
                    disabled={busy}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: '1px solid var(--border, #1e293b)',
                      borderRadius: '6px',
                      color: 'var(--muted, #94a3b8)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clear Temporary
                  </button>
                </div>

                <div
                  style={{
                    padding: '14px 16px',
                    backgroundColor: 'color-mix(in srgb, var(--border, #1e293b) 20%, transparent)',
                    border: '1px solid var(--border, #1e293b)',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Reset Rolling Conversation Transcript</span>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: 'var(--muted, #94a3b8)' }}>
                      Clears the rolling chat transcript without deleting curated long-term memories.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (window.fridayAPI?.clearConversation) {
                        await window.fridayAPI.clearConversation();
                        setFeedback('Conversation transcript cleared.');
                      }
                    }}
                    disabled={busy}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: '1px solid var(--danger, #ef4444)',
                      borderRadius: '6px',
                      color: 'var(--danger, #ef4444)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clear Transcript
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border, #1e293b)',
            fontSize: '0.68rem',
            color: 'var(--muted-dim, #64748b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'color-mix(in srgb, var(--bg, #0f172a) 95%, black)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={12} />
            <span>SQLite Embedded (sql.js WASM) • Zero external database dependencies</span>
          </div>
          <span>FRIDAY Intelligent Memory Architecture V1</span>
        </div>
      </div>
    </div>
  );
};
