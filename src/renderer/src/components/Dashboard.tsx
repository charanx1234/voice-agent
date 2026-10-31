import React, { useState } from 'react';
import { X, Copy, Check, BellRing, Code2, FileText, List, Table2, Braces } from 'lucide-react';
import { DashboardArtifact, ReminderItem } from '@/shared/types';

interface DashboardProps {
  artifacts: DashboardArtifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  reminders: ReminderItem[];
  onCompleteReminder: (id: string) => void;
}

const KIND_ICONS: Record<string, React.ReactNode> = {
  code: <Code2 size={12} />,
  document: <FileText size={12} />,
  list: <List size={12} />,
  table: <Table2 size={12} />,
  markdown: <Braces size={12} />,
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Renders list/table artifacts from plain text without a markdown dependency. */
function renderArtifact(artifact: DashboardArtifact): React.ReactNode {
  const monoStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    lineHeight: 1.55,
    color: 'var(--text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    backgroundColor: 'color-mix(in srgb, var(--text) 4%, transparent)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '12px',
    margin: 0,
    overflowX: 'auto',
  };

  if (artifact.kind === 'code') {
    return <pre style={monoStyle}>{artifact.content}</pre>;
  }

  if (artifact.kind === 'list') {
    const items = artifact.content
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);

    return (
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '18px' }}>
        {items.map((item, index) => (
          <li key={index} style={{ color: 'var(--text)', fontSize: '0.82rem', lineHeight: 1.5 }}>
            {item}
          </li>
        ))}
      </ul>
    );
  }

  if (artifact.kind === 'table') {
    const rows = artifact.content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^\|?[\s:|-]+\|?$/.test(line))
      .map((line) => line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));

    if (rows.length === 0) {
      return <pre style={monoStyle}>{artifact.content}</pre>;
    }

    const [head, ...body] = rows;

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th
                  key={index}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    color: 'var(--muted)',
                    borderBottom: '1px solid var(--border-strong)',
                    fontWeight: 600,
                  }}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    style={{
                      padding: '6px 8px',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <pre style={{ ...monoStyle, fontFamily: 'var(--font-sans)', fontSize: '0.84rem' }}>{artifact.content}</pre>;
}

export const Dashboard: React.FC<DashboardProps> = ({
  artifacts,
  activeId,
  onSelect,
  onClose,
  reminders,
  onCompleteReminder,
}) => {
  const [copied, setCopied] = useState(false);
  const active = artifacts.find((artifact) => artifact.id === activeId) || artifacts[0] || null;

  const handleCopy = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <aside
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border)',
        backgroundColor: 'var(--bg-alt)',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Braces size={15} color="var(--accent)" />
          <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em' }}>
            DASHBOARD
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {active && (
            <button
              onClick={handleCopy}
              title="Copy content"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--muted)',
                padding: '3px 8px',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            title="Close dashboard"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Artifact tabs */}
      {artifacts.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '8px 12px',
            overflowX: 'auto',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {artifacts.map((artifact) => {
            const isActive = active?.id === artifact.id;
            return (
              <button
                key={artifact.id}
                onClick={() => onSelect(artifact.id)}
                title={artifact.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0,
                  maxWidth: '190px',
                  padding: '4px 9px',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  backgroundColor: isActive
                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                    : 'transparent',
                  border: `1px solid ${
                    isActive ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border)'
                  }`,
                  color: isActive ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {KIND_ICONS[artifact.kind]}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {artifact.title}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Artifact body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {active ? (
          <>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text)' }}>
              {active.title}
            </h3>
            {renderArtifact(active)}
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--muted-dim)',
              fontSize: '0.8rem',
            }}
          >
            No output yet.
          </div>
        )}
      </div>

      {/* Reminders */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 14px 12px 14px',
          maxHeight: '34%',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <BellRing size={13} color="var(--accent)" />
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--muted)' }}>
            REMINDERS
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--muted-dim)' }}>{reminders.length}</span>
        </div>

        {reminders.length === 0 ? (
          <span style={{ fontSize: '0.74rem', color: 'var(--muted-dim)' }}>No reminders.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'color-mix(in srgb, var(--text) 3%, transparent)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.76rem',
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {reminder.text}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--muted-dim)' }}>
                    {formatDue(reminder.dueAt)}
                  </div>
                </div>

                <button
                  onClick={() => onCompleteReminder(reminder.id)}
                  title="Mark done"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexShrink: 0,
                  }}
                >
                  <Check size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
