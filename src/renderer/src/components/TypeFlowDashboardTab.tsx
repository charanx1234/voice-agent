import React, { useState, useEffect } from 'react';
import {
  Keyboard,
  FileText,
  Play,
  Pause,
  XCircle,
  Copy,
  Check,
  Sparkles,
  BookOpen,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { TypeFlowTemplate, TypeFlowHistoryItem, TypingProgress } from '@/services/typeflow/types';

export const TypeFlowDashboardTab: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'overview' | 'selected' | 'typing' | 'templates' | 'history' | 'settings'>('overview');
  const [clipboardText, setClipboardText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectedApp, setSelectedApp] = useState('');
  const [aiExplanation, setAiExplanation] = useState('');
  const [typingInput, setTypingInput] = useState('');
  const [templates, setTemplates] = useState<TypeFlowTemplate[]>([]);
  const [history, setHistory] = useState<TypeFlowHistoryItem[]>([]);
  const [progress, setProgress] = useState<TypingProgress | null>(null);
  const [speedWpm, setSpeedWpm] = useState(60);
  const [isTyping, setIsTyping] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadState();

    if (window.fridayAPI?.onTypeFlowProgress) {
      const unsub = window.fridayAPI.onTypeFlowProgress((p: TypingProgress) => {
        setProgress(p);
        if (p.status === 'typing') setIsTyping(true);
        else if (p.status === 'completed' || p.status === 'cancelled' || p.status === 'error') {
          setIsTyping(false);
          loadState();
        }
      });
      return () => unsub();
    }
  }, []);

  const loadState = async () => {
    try {
      if (window.fridayAPI?.typeFlowGetState) {
        const res = await window.fridayAPI.typeFlowGetState();
        if (res.success) {
          if (res.templates) setTemplates(res.templates);
          if (res.history) setHistory(res.history);
          if (res.context) {
            setSelectedText(res.context.selectedText || '');
            setSelectedApp(res.context.targetProcess || '');
          }
        }
      }
    } catch (e) {
      console.warn('Could not load TypeFlow state:', e);
    }
  };

  const handleReadSelection = async () => {
    setStatusMessage('Reading selected text via accessibility tree...');
    try {
      if (window.fridayAPI?.typeFlowReadSelection) {
        const res = await window.fridayAPI.typeFlowReadSelection();
        if (res.success && res.result?.text) {
          setSelectedText(res.result.text);
          setSelectedApp(res.result.application || '');
          setStatusMessage(`Captured from ${res.result.application}`);
        } else {
          setStatusMessage(res.error || 'No selected text exposed by target application.');
        }
      }
    } catch (e: any) {
      setStatusMessage(`Error reading selection: ${e.message}`);
    }
  };

  const handleExplain = async () => {
    if (!selectedText) {
      setStatusMessage('Please select some text first.');
      return;
    }
    setStatusMessage('FRIDAY AI analyzing selected text...');
    try {
      if (window.fridayAPI?.typeFlowExplainSelection) {
        const res = await window.fridayAPI.typeFlowExplainSelection();
        if (res.success && res.explanation) {
          setAiExplanation(res.explanation);
          setStatusMessage('AI Explanation generated.');
        } else {
          setStatusMessage(res.error || 'Explanation generation failed.');
        }
      }
    } catch (e: any) {
      setStatusMessage(`Error generating explanation: ${e.message}`);
    }
  };

  const handleTypeClipboard = async () => {
    setStatusMessage('Typing clipboard content into focused application...');
    try {
      if (window.fridayAPI?.typeFlowTypeClipboard) {
        const res = await window.fridayAPI.typeFlowTypeClipboard({ speedWpm });
        if (res.success) {
          setStatusMessage('Clipboard text typed successfully.');
        } else {
          setStatusMessage(res.error || 'Typing failed.');
        }
      }
    } catch (e: any) {
      setStatusMessage(`Error: ${e.message}`);
    }
  };

  const handleTypeText = async (textToType: string) => {
    if (!textToType.trim()) return;
    setStatusMessage('Typing into focused application...');
    try {
      if (window.fridayAPI?.typeFlowTypeText) {
        const res = await window.fridayAPI.typeFlowTypeText(textToType, { speedWpm });
        if (res.success) {
          setStatusMessage('Typing completed.');
        } else {
          setStatusMessage(res.error || 'Typing failed.');
        }
      }
    } catch (e: any) {
      setStatusMessage(`Error: ${e.message}`);
    }
  };

  const handlePause = async () => {
    await window.fridayAPI?.typeFlowPause?.();
    setStatusMessage('Paused.');
  };

  const handleResume = async () => {
    await window.fridayAPI?.typeFlowResume?.();
    setStatusMessage('Resumed.');
  };

  const handleCancel = async () => {
    await window.fridayAPI?.typeFlowCancel?.();
    setIsTyping(false);
    setStatusMessage('Cancelled.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px', color: 'var(--text)' }}>
      {/* TypeFlow Top Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveSection('overview')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            background: activeSection === 'overview' ? 'var(--primary, #3b82f6)' : 'transparent',
            color: activeSection === 'overview' ? '#fff' : 'var(--text)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveSection('selected')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            background: activeSection === 'selected' ? 'var(--primary, #3b82f6)' : 'transparent',
            color: activeSection === 'selected' ? '#fff' : 'var(--text)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Selected Text & AI
        </button>
        <button
          onClick={() => setActiveSection('typing')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            background: activeSection === 'typing' ? 'var(--primary, #3b82f6)' : 'transparent',
            color: activeSection === 'typing' ? '#fff' : 'var(--text)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Typing Engine
        </button>
        <button
          onClick={() => setActiveSection('templates')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            background: activeSection === 'templates' ? 'var(--primary, #3b82f6)' : 'transparent',
            color: activeSection === 'templates' ? '#fff' : 'var(--text)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Templates
        </button>
        <button
          onClick={() => setActiveSection('history')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            background: activeSection === 'history' ? 'var(--primary, #3b82f6)' : 'transparent',
            color: activeSection === 'history' ? '#fff' : 'var(--text)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          History
        </button>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div style={{ padding: '6px 12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', fontSize: '0.78rem' }}>
          {statusMessage}
        </div>
      )}

      {/* Progress Bar when active */}
      {progress && progress.status === 'typing' && (
        <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', fontSize: '0.78rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Typing: {progress.typedChars} / {progress.totalChars} chars</span>
            <span>{progress.percent}%</span>
          </div>
          <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress.percent}%`, background: '#10b981', transition: 'width 0.1s' }} />
          </div>
        </div>
      )}

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: 'var(--card-bg, rgba(255,255,255,0.03))', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Keyboard size={16} /> Smart Clipboard Typing (F1)
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Press <strong>F1</strong> anywhere on Windows to type your clipboard text smoothly into the currently focused editor. Preserves indentation, code formatting, and unicode characters.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleTypeClipboard}
                disabled={isTyping}
                style={{ padding: '8px 16px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Play size={14} /> Type Clipboard Now
              </button>
              {isTyping && (
                <>
                  <button onClick={handlePause} style={{ padding: '8px 12px', borderRadius: '6px', background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.82rem' }}>
                    <Pause size={14} />
                  </button>
                  <button onClick={handleCancel} style={{ padding: '8px 12px', borderRadius: '6px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.82rem' }}>
                    <XCircle size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ background: 'var(--card-bg, rgba(255,255,255,0.03))', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={16} /> Intelligent Selected Text Reader
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Select any text or code on Windows with your mouse, then say <em>"Hey Friday, read the selected text"</em> or <em>"Friday, explain this question"</em>.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleReadSelection}
                style={{ padding: '8px 16px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.82rem' }}
              >
                Read Current Mouse Selection
              </button>
              <button
                onClick={handleExplain}
                style={{ padding: '8px 16px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.2)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.4)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={14} /> Explain Selected Text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Text & AI Section */}
      {activeSection === 'selected' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Active Selection {selectedApp && `(${selectedApp})`}</span>
            <button onClick={handleReadSelection} style={{ padding: '4px 8px', borderRadius: '4px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.75rem' }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          <textarea
            value={selectedText}
            onChange={(e) => setSelectedText(e.target.value)}
            placeholder="No text currently captured. Select text with your cursor in any window and click Refresh or say 'Hey Friday, read the selected text'."
            rows={5}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: '0.8rem', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleExplain} style={{ padding: '8px 16px', borderRadius: '6px', background: '#8b5cf6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} /> Explain & Generate Answer
            </button>
            <button onClick={() => handleTypeText(selectedText)} style={{ padding: '8px 16px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.82rem' }}>
              Type This Text
            </button>
          </div>

          {aiExplanation && (
            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#c084fc' }}>AI Generated Explanation & Answer</span>
                <button
                  onClick={() => handleTypeText(aiExplanation)}
                  style={{ padding: '4px 8px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  Type Answer Into Editor
                </button>
              </div>
              <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {aiExplanation}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Typing Engine Section */}
      {activeSection === 'typing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '0.8rem' }}>Typing Speed (WPM):</label>
            <input
              type="range"
              min={20}
              max={150}
              value={speedWpm}
              onChange={(e) => setSpeedWpm(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '0.8rem', width: '40px' }}>{speedWpm} WPM</span>
          </div>

          <textarea
            value={typingInput}
            onChange={(e) => setTypingInput(e.target.value)}
            placeholder="Enter custom text to type directly into the focused application..."
            rows={6}
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: '0.8rem' }}
          />

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleTypeText(typingInput)}
              disabled={isTyping}
              style={{ padding: '8px 16px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
            >
              Start Typing Text
            </button>
            <button
              onClick={handleTypeClipboard}
              disabled={isTyping}
              style={{ padding: '8px 16px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              Type Clipboard (F1)
            </button>
          </div>
        </div>
      )}

      {/* Templates Section */}
      {activeSection === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Reusable Productivity Templates</span>
          {templates.map((tpl) => (
            <div key={tpl.id} style={{ padding: '10px', background: 'var(--card-bg, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{tpl.title}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tpl.category}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tpl.content}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button
                  onClick={() => handleTypeText(tpl.content)}
                  style={{ padding: '4px 8px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  Type Template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History Section */}
      {activeSection === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Recent TypeFlow Sessions</span>
            <button
              onClick={async () => {
                await window.fridayAPI?.typeFlowClearHistory?.();
                setHistory([]);
              }}
              style={{ padding: '4px 8px', borderRadius: '4px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontSize: '0.72rem' }}
            >
              Clear History
            </button>
          </div>
          {history.length === 0 ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>
              No typing history yet.
            </div>
          ) : (
            history.map((h) => (
              <div key={h.id} style={{ padding: '8px', background: 'var(--card-bg, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 600 }}>{h.targetProcess || 'Unknown App'}</span>
                  <span style={{ color: h.status === 'completed' ? '#10b981' : '#ef4444' }}>{h.status}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {h.charCount} chars • {new Date(h.timestamp).toLocaleTimeString()} • {h.durationMs}ms
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
