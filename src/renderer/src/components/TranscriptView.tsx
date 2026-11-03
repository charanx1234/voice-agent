import React, { useRef, useEffect, useState } from 'react';
import { Trash2, Mic, Bot, User, Copy, Check, CheckCircle2, XCircle, Folder, ExternalLink, AlertTriangle } from 'lucide-react';
import { ChatMessage } from '@/shared/types';
import { copyTextToClipboard } from '../utils/clipboard';

interface TranscriptViewProps {
  messages: ChatMessage[];
  /** Text received so far for the assistant message currently being generated. */
  streamingResponse?: string;
  onClearHistory: () => void;
  onOpenFile?: (filePath: string) => void;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  messages,
  streamingResponse = '',
  onClearHistory,
  onOpenFile,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingResponse]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  const copyMessage = async (id: string, text: string) => {
    if (!text) return;

    try {
      await copyTextToClipboard(text);

      setCopyErrorId(null);
      setCopiedId(id);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setCopiedId(null);
      setCopyErrorId(id);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setCopyErrorId(null), 1800);
    }
  };

  const renderCopyButton = (id: string, text: string) => (
    <button
      type="button"
      onClick={() => void copyMessage(id, text)}
      title={copyErrorId === id ? 'Clipboard access failed' : 'Copy response'}
      aria-label={copyErrorId === id ? 'Copy failed' : copiedId === id ? 'Copied' : 'Copy response'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '1px 4px',
        border: 'none',
        borderRadius: '4px',
        background: 'transparent',
        color: copyErrorId === id ? 'var(--danger)' : copiedId === id ? 'var(--success)' : 'var(--muted-dim)',
        cursor: 'pointer',
        fontSize: '0.68rem',
      }}
    >
      {copyErrorId === id ? <AlertTriangle size={11} /> : copiedId === id ? <Check size={11} /> : <Copy size={11} />}
      <span>{copyErrorId === id ? 'Copy failed' : copiedId === id ? 'Copied' : 'Copy'}</span>
    </button>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '260px',
        backgroundColor: 'color-mix(in srgb, var(--surface) 95%, transparent)',
        borderTop: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderBottom: '1px solid color-mix(in srgb, var(--text) 6%, transparent)',
          fontSize: '0.8rem',
          color: 'var(--muted)',
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>CONVERSATION TRANSCRIPT</span>
        {messages.length > 0 && (
          <button
            onClick={onClearHistory}
            title="Clear conversation"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
            }}
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Messages list */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.length === 0 && !streamingResponse.trim() ? (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--muted-dim)',
              fontSize: '0.82rem',
              padding: '24px 0',
            }}
          >
            No messages yet.
          </div>
        ) : (
          <>
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  gap: '4px',
                }}
              >
                {/* Role / timestamp header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.72rem',
                    color: 'var(--muted-dim)',
                  }}
                >
                  {isUser ? (
                    <>
                      <span>You</span>
                      {msg.isVoice && <Mic size={11} color="var(--accent)" />}
                    </>
                  ) : msg.isError ? (
                    <>
                      <AlertTriangle size={12} color="var(--danger)" />
                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>ERROR</span>
                    </>
                  ) : (
                    <>
                      <Bot size={12} color="var(--accent)" />
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>FRIDAY</span>
                    </>
                  )}
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {!isUser && renderCopyButton(msg.id, msg.text)}
                </div>

                {/* Bubble */}
                <div
                  style={{
                    maxWidth: '88%',
                    backgroundColor: isUser
                      ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                      : msg.isError
                      ? 'color-mix(in srgb, var(--danger) 10%, transparent)'
                      : 'color-mix(in srgb, var(--surface) 85%, transparent)',
                    border: isUser
                      ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
                      : msg.isError
                      ? '1px solid color-mix(in srgb, var(--danger) 35%, transparent)'
                      : '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
                    borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    padding: '8px 12px',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                    lineHeight: '1.45',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.text}

                  {/* Render Tool Cards if tool was executed */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {msg.toolCalls.map((tool, idx) => (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--surface) 70%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--text) 6%, transparent)',
                            borderRadius: '8px',
                            padding: '6px 8px',
                            fontSize: '0.75rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--info)' }}>
                            {tool.status === 'completed' && <CheckCircle2 size={13} color="var(--success)" />}
                            {tool.status === 'rejected' && <XCircle size={13} color="var(--warning)" />}
                            {tool.status === 'failed' && <XCircle size={13} color="var(--danger)" />}
                            <span>Action: {tool.toolName}</span>
                          </div>

                          {/* Matching search files */}
                          {tool.result?.matches && Array.isArray(tool.result.matches) && (
                            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {tool.result.matches.slice(0, 3).map((m: any, mIdx: number) => (
                                <div
                                  key={mIdx}
                                  onClick={() => onOpenFile && onOpenFile(m.filePath)}
                                  style={{
                                    color: 'var(--accent)',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <Folder size={11} />
                                  <span>{m.fileName}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Web search links */}
                          {tool.result?.results && Array.isArray(tool.result.results) && (
                            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {tool.result.results.slice(0, 2).map((w: any, wIdx: number) => (
                                <a
                                  key={wIdx}
                                  href={w.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    color: 'var(--accent)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <ExternalLink size={11} />
                                  <span style={{ textDecoration: 'underline' }}>{w.title}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {streamingResponse.trim() && (
            <div
              key="streaming-assistant-response"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '4px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.72rem',
                  color: 'var(--muted-dim)',
                }}
              >
                <Bot size={12} color="var(--accent)" />
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>FRIDAY</span>
                <span>generating…</span>
                {renderCopyButton('streaming-assistant-response', streamingResponse)}
              </div>
              <div
                style={{
                  maxWidth: '88%',
                  backgroundColor: 'color-mix(in srgb, var(--surface) 85%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--text) 8%, transparent)',
                  borderRadius: '14px 14px 14px 2px',
                  padding: '8px 12px',
                  color: 'var(--text)',
                  fontSize: '0.85rem',
                  lineHeight: '1.45',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {streamingResponse}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
};
