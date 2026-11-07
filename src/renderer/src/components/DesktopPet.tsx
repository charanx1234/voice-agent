import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Mic,
  Send,
  Volume2,
  VolumeX,
  Maximize2,
  X,
  FileText,
  Bell,
  Monitor,
  Globe,
  Settings as SettingsIcon,
  Copy,
  Check,
} from 'lucide-react';
import {
  ChatMessage,
  FaceExpression,
  FridaySettings,
  PersonalityMode,
  PetCompanionState,
  RobotState,
  VoiceSessionState,
} from '@/shared/types';
import '../styles/desktopPet.css';

const DEFAULT_STATE: PetCompanionState = {
  robotState: 'idle',
  voiceSessionState: 'STANDBY',
  amplitude: 0,
  expression: 'neutral',
  mood: 'calm',
  soundMuted: false,
  handsFreeEnabled: true,
  isSpeaking: false,
};

// Feature coordinates on the 290x297 reference coordinate space
const LEFT_EYE = { cx: 99, cy: 110, rx: 32, ry: 26 };
const RIGHT_EYE = { cx: 191, cy: 110, rx: 32, ry: 26 };
const MOUTH = { cx: 145, cy: 135 };

export const DesktopPet: React.FC = () => {
  const [petState, setPetState] = useState<PetCompanionState>(DEFAULT_STATE);
  const [isBlinking, setIsBlinking] = useState(false);
  const [eyeShift, setEyeShift] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);
  const [settings, setSettings] = useState<Partial<FridaySettings>>({
    personalityMode: 'moderate',
    soundMuted: false,
    speechSpeed: 1.0,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Centralized Audio / Mouth reactive state
  const [liveAmplitude, setLiveAmplitude] = useState<number>(0);
  const [mouthOpenness, setMouthOpenness] = useState<number>(0);
  const [micLevel, setMicLevel] = useState<number>(0);

  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const activeReqIdRef = useRef<string | null>(null);

  // Auto-scroll chat area when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // Window expand/collapse coordinator
  const toggleExpanded = (expand?: boolean) => {
    const next = expand !== undefined ? expand : !isExpanded;
    setIsExpanded(next);
    if (window.fridayAPI?.petSetExpanded) {
      window.fridayAPI.petSetExpanded(next);
    }
  };

  // 1. Subscribe to Centralized Voice Session Events & Background State
  useEffect(() => {
    let unmount = false;

    // Load initial settings and pet state
    if (window.fridayAPI?.getSettings) {
      window.fridayAPI.getSettings().then((s) => {
        if (!unmount && s) setSettings(s);
      });
    }

    if (window.fridayAPI?.loadConversation) {
      window.fridayAPI.loadConversation(12).then((history) => {
        if (!unmount && Array.isArray(history)) setMessages(history);
      });
    }

    if (window.fridayAPI?.petGetState) {
      window.fridayAPI.petGetState().then((state) => {
        if (!unmount && state) setPetState(state);
      });
    }

    if (window.fridayAPI?.petGetExpanded) {
      window.fridayAPI.petGetExpanded().then((exp) => {
        if (!unmount && exp !== undefined) setIsExpanded(Boolean(exp));
      });
    }

    // Central Voice State Machine subscription
    const cleanups: (() => void)[] = [];

    if (window.fridayAPI?.onVoiceStateChanged) {
      const cleanupVoice = window.fridayAPI.onVoiceStateChanged((st: any) => {
        if (!unmount && st) {
          setPetState((prev) => ({
            ...prev,
            robotState: st.robotState || prev.robotState,
            voiceSessionState: st.sessionState || prev.voiceSessionState,
            expression: st.expression || prev.expression,
            mood: st.mood || prev.mood,
            isSpeaking: Boolean(st.isSpeaking),
            isVerifiedSpeaker: st.isVerifiedSpeaker !== undefined ? st.isVerifiedSpeaker : prev.isVerifiedSpeaker,
          }));

          // When wake-word triggers, smoothly expand so user sees live conversation
          if (st.sessionState === 'WAKE_DETECTED' || st.sessionState === 'WAKE_WORD_DETECTED') {
            setIsExpanded(true);
            window.fridayAPI?.petSetExpanded?.(true);
          }
        }
      });
      cleanups.push(cleanupVoice);
    }

    // Centralized Mouth / Lip-Sync broadcast subscription
    if (window.fridayAPI?.onVoiceMouthUpdate) {
      const cleanupMouth = window.fridayAPI.onVoiceMouthUpdate((data) => {
        if (!unmount && data) {
          setMouthOpenness(data.mouthOpenness || 0);
          setLiveAmplitude(data.amplitude || 0);
        }
      });
      cleanups.push(cleanupMouth);
    }

    // Live microphone input level subscription
    if (window.fridayAPI?.onVoiceLevelUpdate) {
      const cleanupLevel = window.fridayAPI.onVoiceLevelUpdate((lvl) => {
        if (!unmount) setMicLevel(lvl || 0);
      });
      cleanups.push(cleanupLevel);
    }

    // Pet state changed (e.g. muted status, position reset)
    if (window.fridayAPI?.onPetStateChanged) {
      const cleanupState = window.fridayAPI.onPetStateChanged((state) => {
        if (!unmount && state) setPetState((prev) => ({ ...prev, ...state }));
      });
      cleanups.push(cleanupState);
    }

    // Screen understanding status
    if (window.fridayAPI?.onScreenAnalysisState) {
      const cleanupScreen = window.fridayAPI.onScreenAnalysisState((active) => {
        if (!unmount) setIsAnalyzingScreen(active);
      });
      cleanups.push(cleanupScreen);
    }

    // Synchronized chat messages across windows
    if (window.fridayAPI?.onChatMessageBroadcast) {
      const cleanupChat = window.fridayAPI.onChatMessageBroadcast((msg) => {
        if (!unmount && msg) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      });
      cleanups.push(cleanupChat);
    }

    // Response streaming subscription
    if (window.fridayAPI?.onResponseStream) {
      const cleanupStream = window.fridayAPI.onResponseStream((event) => {
        if (!unmount && event) {
          if (event.type === 'delta' && event.text) {
            setStreamingText((prev) => prev + event.text);
          } else if (event.type === 'complete') {
            setStreamingText('');
          }
        }
      });
      cleanups.push(cleanupStream);
    }

    return () => {
      unmount = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  // Natural spontaneous blinking: independent organic timer
  useEffect(() => {
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let doubleBlinkTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        setIsBlinking(true);
        closeTimer = setTimeout(() => {
          setIsBlinking(false);

          if (Math.random() < 0.18) {
            doubleBlinkTimer = setTimeout(() => {
              setIsBlinking(true);
              closeTimer = setTimeout(() => setIsBlinking(false), 90);
            }, 100);
          }
          scheduleBlink();
        }, 110 + Math.random() * 40);
      }, 2500 + Math.random() * 4000);
    };

    scheduleBlink();
    return () => {
      if (blinkTimer) clearTimeout(blinkTimer);
      if (closeTimer) clearTimeout(closeTimer);
      if (doubleBlinkTimer) clearTimeout(doubleBlinkTimer);
    };
  }, []);

  // Curious eye shifts when thinking or listening
  const activeRobotState = petState.robotState;
  useEffect(() => {
    if (activeRobotState === 'thinking') {
      const interval = setInterval(() => {
        setEyeShift({
          x: (Math.random() - 0.5) * 5,
          y: -2 + (Math.random() - 0.5) * 3,
        });
      }, 1400);
      return () => clearInterval(interval);
    } else if (activeRobotState === 'listening') {
      setEyeShift({ x: 1.5, y: -1 });
    } else {
      setEyeShift({ x: 0, y: 0 });
    }
    return undefined;
  }, [activeRobotState]);

  // Click vs Drag detection: delegates directly to Centralized Voice Manager or Expands
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      mouseDownRef.current = { x: e.screenX, y: e.screenY, time: Date.now() };
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 0 && mouseDownRef.current) {
      const dx = Math.abs(e.screenX - mouseDownRef.current.x);
      const dy = Math.abs(e.screenY - mouseDownRef.current.y);
      const dt = Date.now() - mouseDownRef.current.time;

      mouseDownRef.current = null;

      // Click detected (quick release with minimal movement)
      if (dx < 6 && dy < 6 && dt < 450) {
        if (!isExpanded) {
          toggleExpanded(true);
        } else {
          // Trigger centralized microphone / interruption handler
          if (window.fridayAPI?.voiceTriggerMic) {
            window.fridayAPI.voiceTriggerMic();
          }
        }
      }
    }
  };

  const handleDoubleClick = () => {
    if (window.fridayAPI?.petToggleMain) {
      window.fridayAPI.petToggleMain();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.fridayAPI?.petOpenContextMenu) {
      window.fridayAPI.petOpenContextMenu();
    }
  };

  // Submit a message to the unified AI brain and tools
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    window.fridayAPI?.broadcastChatMessage?.(userMsg);
    setInputText('');
    setStreamingText('');

    const reqId = `pet_${Date.now()}`;
    activeReqIdRef.current = reqId;

    try {
      const res = await window.fridayAPI?.sendMessage({
        message: text,
        conversationHistory: messages,
        personalityMode: (settings.personalityMode as PersonalityMode) || 'moderate',
        language: settings.preferredLanguage || 'en-IN',
        requestId: reqId,
      });

      if (res && res.text) {
        const assistMsg: ChatMessage = {
          id: `msg_${Date.now()}_a`,
          role: 'assistant',
          text: res.text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistMsg]);
        window.fridayAPI?.broadcastChatMessage?.(assistMsg);
        setStreamingText('');

        // Neural speech playback if not muted
        if (!settings.soundMuted && window.fridayAPI?.synthesizeSpeech) {
          window.fridayAPI.synthesizeSpeech({
            text: res.text,
            languageCode: settings.preferredLanguage || 'en-IN',
            voice: settings.ttsVoice,
            accent: settings.voiceAccent,
            rate: settings.speechSpeed || 1.0,
          });
        }
      }
    } catch (err: any) {
      console.error('[FRIDAY Pet] Send message error:', err);
    }
  };

  // Switch personality mode immediately
  const handleSwitchPersonality = (mode: PersonalityMode) => {
    setSettings((prev) => ({ ...prev, personalityMode: mode }));
    window.fridayAPI?.saveSettings?.({ personalityMode: mode });
  };

  // Toggle sound mute
  const handleToggleMute = () => {
    const next = !settings.soundMuted;
    setSettings((prev) => ({ ...prev, soundMuted: next }));
    window.fridayAPI?.saveSettings?.({ soundMuted: next });
    window.fridayAPI?.updatePetState?.({ soundMuted: next });
  };

  // Trigger quick capabilities
  const handleTriggerCapability = async (type: string) => {
    if (type === 'screen') {
      setIsAnalyzingScreen(true);
      await handleSendMessage('Please analyze what is currently visible on my screen.');
      setIsAnalyzingScreen(false);
    } else if (type === 'notes') {
      setInputText('Take a note: ');
    } else if (type === 'reminders') {
      setInputText('Remind me in 10 minutes to ');
    } else if (type === 'web') {
      await handleSendMessage('Please read and summarize the active website or browser page.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    if (window.fridayAPI?.copyText) {
      window.fridayAPI.copyText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Determine effective visual state for Aura and Body animation
  const isSpeaking = activeRobotState === 'speaking' || activeRobotState === 'laughing' || petState.isSpeaking;

  const effectiveAuraState = useMemo(() => {
    if (isAnalyzingScreen) return 'screen';
    if (petState.voiceSessionState === 'WAKE_DETECTED') return 'wake_detected';
    if (petState.voiceSessionState === 'INTERRUPTED' || activeRobotState === 'interrupted') return 'interrupted';
    if (
      activeRobotState === 'error' ||
      petState.voiceSessionState === 'TASK_UNSUPPORTED' ||
      petState.voiceSessionState === 'PERMISSION_REQUIRED' ||
      petState.voiceSessionState === 'MICROPHONE_ERROR' ||
      petState.voiceSessionState === 'PROVIDER_ERROR' ||
      petState.voiceSessionState === 'NETWORK_ERROR'
    ) {
      return 'error';
    }
    if (isSpeaking) return 'speaking';
    if (activeRobotState === 'listening') return 'listening';
    if (activeRobotState === 'thinking') return 'thinking';
    if (
      petState.expression === 'happy' ||
      petState.expression === 'laugh' ||
      petState.expression === 'laughing'
    ) {
      return 'happy';
    }
    return 'idle';
  }, [
    activeRobotState,
    isAnalyzingScreen,
    isSpeaking,
    petState.expression,
    petState.voiceSessionState,
  ]);

  // Audio-reactive mouth dimensions from centralized mouth stream
  const mouthAmplitude = Math.max(0, Math.min(1, mouthOpenness || liveAmplitude || petState.amplitude));
  const mouthWidth = 7 + mouthAmplitude * 10;
  const mouthHeight = isSpeaking ? 3 + mouthAmplitude * 15 : 0;

  // Render character component
  const renderPetCharacter = (sizePx: number = 180) => (
    <div
      className="pet-draggable-container"
      style={{ width: `${sizePx}px`, height: `${sizePx * 1.024}px` }}
      title="FRIDAY Pet — Click to interact, Double-click to open dashboard, Drag to move, Right-click for menu"
    >
      <div className="pet-wrapper">
        {/* Subtle Ambient Aura for Screen Scanning / Listening / Thinking / Speaking / Error */}
        <div className={`pet-aura aura-${effectiveAuraState}`} aria-hidden="true" />

        {/* Exact Character Art Base (Preserved Approved 3D Character) */}
        <img
          className={`pet-character-art state-${effectiveAuraState}`}
          src="./assets/friday-pet@2x.png"
          alt="FRIDAY Desktop Pet"
          draggable={false}
        />

        {/* Overlay for Natural Blinking, Eye Shift, and Audio-Reactive Speech */}
        <svg
          className={`pet-face-svg state-${effectiveAuraState}`}
          viewBox="0 0 290 297"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Eyelids during natural blink */}
          {isBlinking && (
            <g className="pet-blink-eyelids">
              <ellipse
                className="pet-eyelid"
                cx={LEFT_EYE.cx}
                cy={LEFT_EYE.cy}
                rx={LEFT_EYE.rx}
                ry={LEFT_EYE.ry}
                fill="#ffffff"
              />
              <ellipse
                className="pet-eyelid"
                cx={RIGHT_EYE.cx}
                cy={RIGHT_EYE.cy}
                rx={RIGHT_EYE.rx}
                ry={RIGHT_EYE.ry}
                fill="#ffffff"
              />
            </g>
          )}

          {/* Sleeping / Relaxed half-closed eyelids */}
          {activeRobotState === 'sleeping' && !isBlinking && (
            <g className="pet-sleep-eyelids" opacity="0.85">
              <path
                d={`M ${LEFT_EYE.cx - 28} ${LEFT_EYE.cy} Q ${LEFT_EYE.cx} ${LEFT_EYE.cy + 18} ${LEFT_EYE.cx + 28} ${LEFT_EYE.cy}`}
                stroke="#222"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d={`M ${RIGHT_EYE.cx - 28} ${RIGHT_EYE.cy} Q ${RIGHT_EYE.cx} ${RIGHT_EYE.cy + 18} ${RIGHT_EYE.cx + 28} ${RIGHT_EYE.cy}`}
                stroke="#222"
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
              />
            </g>
          )}

          {/* Audio-Reactive Speaking Mouth Opening */}
          {isSpeaking && mouthHeight > 1 && (
            <ellipse
              className="pet-speaking-mouth"
              cx={MOUTH.cx}
              cy={MOUTH.cy}
              rx={mouthWidth}
              ry={mouthHeight}
              fill="#111827"
            />
          )}
        </svg>

        {/* Subtle Mute Indicator if muted */}
        {settings.soundMuted && (
          <div className="pet-badge-muted" title="FRIDAY audio output is muted">
            ✕
          </div>
        )}

        {/* Unverified Speaker Indicator badge when security gate triggers */}
        {petState.isVerifiedSpeaker === false && (
          <div
            className="pet-badge-muted"
            style={{ background: '#f59e0b', bottom: '8px', left: '8px' }}
            title="Speaker not verified"
          >
            ⚠
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="pet-interactive-shell"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* 1. COMPACT MODE VIEW */}
      {!isExpanded ? (
        <div className="pet-root">
          <div
            className="pet-hover-trigger"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(true);
            }}
          >
            ✦ Click to open
          </div>
          {renderPetCharacter(180)}
        </div>
      ) : (
        /* 2. EXPANDED PET-FIRST COMPANION INTERFACE */
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
          <div className="pet-companion-card">
            {/* Header */}
            <div className="pet-card-header app-drag">
              <div className="pet-card-header-left">
                <div className={`pet-status-dot ${activeRobotState}`} />
                <span className="pet-title">FRIDAY</span>
              </div>

              {/* Personality Modes Switcher */}
              <div className="pet-personality-group app-no-drag">
                <button
                  type="button"
                  className={`pet-personality-btn ${settings.personalityMode === 'simple' ? 'active simple' : ''}`}
                  onClick={() => handleSwitchPersonality('simple')}
                  title="Simple Mode: Succinct, direct responses"
                >
                  Simple
                </button>
                <button
                  type="button"
                  className={`pet-personality-btn ${settings.personalityMode === 'moderate' ? 'active' : ''}`}
                  onClick={() => handleSwitchPersonality('moderate')}
                  title="Moderate Mode: Balanced, helpful assistant"
                >
                  Moderate
                </button>
                <button
                  type="button"
                  className={`pet-personality-btn ${settings.personalityMode === 'roast' ? 'active roast' : ''}`}
                  onClick={() => handleSwitchPersonality('roast')}
                  title="Roast Mode: Sarcastic, playful banter"
                >
                  Roast
                </button>
              </div>

              {/* Header Action Buttons */}
              <div className="pet-header-actions app-no-drag">
                <button
                  type="button"
                  className="pet-icon-btn"
                  onClick={() => setSettingsDrawerOpen(!settingsDrawerOpen)}
                  title="Quick Settings"
                >
                  <SettingsIcon size={14} />
                </button>
                <button
                  type="button"
                  className="pet-icon-btn"
                  onClick={() => window.fridayAPI?.petShowMain?.()}
                  title="Open Full Dashboard"
                >
                  <Maximize2 size={13} />
                </button>
                <button
                  type="button"
                  className="pet-icon-btn"
                  onClick={() => toggleExpanded(false)}
                  title="Minimize to Compact Pet"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* In-Card Settings Drawer */}
            {settingsDrawerOpen && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'rgba(0, 0, 0, 0.45)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.74rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Speech Rate: {settings.speechSpeed || 1.0}x</span>
                  <input
                    type="range"
                    min="0.8"
                    max="1.5"
                    step="0.1"
                    value={settings.speechSpeed || 1.0}
                    onChange={(e) => {
                      const spd = parseFloat(e.target.value);
                      setSettings((prev) => ({ ...prev, speechSpeed: spd }));
                      window.fridayAPI?.saveSettings?.({ speechSpeed: spd });
                    }}
                    style={{ width: '80px', cursor: 'pointer' }}
                  />
                </div>
                <button
                  type="button"
                  className="pet-personality-btn"
                  onClick={() => window.fridayAPI?.petShowMain?.()}
                  style={{ textDecoration: 'underline' }}
                >
                  All Settings
                </button>
              </div>
            )}

            {/* Conversation Messages Feed */}
            <div className="pet-chat-area" ref={chatScrollRef}>
              {messages.length === 0 && (
                <div
                  style={{
                    margin: 'auto',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '0.74rem',
                    padding: '16px',
                  }}
                >
                  <Sparkles size={20} color="#9ca3af" style={{ margin: '0 auto 6px' }} />
                  <div>FRIDAY is ready. Speak or type below.</div>
                </div>
              )}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`pet-chat-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{m.text}</span>
                    {m.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(m.text, m.id)}
                        className="pet-icon-btn"
                        style={{ padding: '1px', opacity: 0.7 }}
                        title="Copy message"
                      >
                        {copiedId === m.id ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming Live Response */}
              {streamingText && (
                <div className="pet-chat-bubble assistant" style={{ background: 'rgba(56, 189, 248, 0.08)' }}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{streamingText}</span>
                </div>
              )}

              {/* Live Voice Activity / Listening Box */}
              {activeRobotState === 'listening' && (
                <div className="pet-live-transcript-box">
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#38bdf8',
                      boxShadow: '0 0 8px #38bdf8',
                    }}
                  />
                  <span>Listening to your voice... (speak or release to submit)</span>
                </div>
              )}
            </div>

            {/* Quick Capabilities Bar */}
            <div className="pet-tools-bar">
              <button
                type="button"
                className="pet-tool-chip"
                onClick={() => handleTriggerCapability('screen')}
                title="Capture and analyze screen"
              >
                <Monitor size={11} />
                <span>Screen</span>
              </button>
              <button
                type="button"
                className="pet-tool-chip"
                onClick={() => handleTriggerCapability('web')}
                title="Website reading assistance"
              >
                <Globe size={11} />
                <span>Web</span>
              </button>
              <button
                type="button"
                className="pet-tool-chip"
                onClick={() => handleTriggerCapability('notes')}
                title="Take a quick note"
              >
                <FileText size={11} />
                <span>Note</span>
              </button>
              <button
                type="button"
                className="pet-tool-chip"
                onClick={() => handleTriggerCapability('reminders')}
                title="Set a reminder"
              >
                <Bell size={11} />
                <span>Reminder</span>
              </button>
            </div>

            {/* Bottom Text & Voice Input Bar */}
            <div className="pet-input-container">
              <input
                type="text"
                className="pet-input-field"
                placeholder="Ask FRIDAY anything..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button
                type="button"
                className="pet-send-btn"
                onClick={() => handleSendMessage()}
                title="Send message"
              >
                <Send size={13} />
              </button>
              <button
                type="button"
                className={`pet-mic-btn ${activeRobotState === 'listening' ? 'active' : ''}`}
                onClick={() => window.fridayAPI?.voiceTriggerMic?.()}
                title={activeRobotState === 'listening' ? 'Stop listening' : 'Start speaking'}
              >
                <Mic size={14} />
              </button>
              <button
                type="button"
                className="pet-icon-btn"
                onClick={handleToggleMute}
                title={settings.soundMuted ? 'Unmute voice' : 'Mute voice'}
              >
                {settings.soundMuted ? <VolumeX size={15} color="#ef4444" /> : <Volume2 size={15} />}
              </button>
            </div>
          </div>

          {/* Footer with Floating Desktop Pet Character */}
          <div className="pet-footer-character">
            {renderPetCharacter(136)}
          </div>
        </div>
      )}
    </div>
  );
};
