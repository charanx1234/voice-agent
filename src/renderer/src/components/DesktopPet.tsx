import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatMessage,
  FaceExpression,
  FridaySettings,
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

// Dimensions for the eye expression overlays
const EYES_BOX = {
  x: 71,
  y: 73,
  width: 148,
  height: 74,
};

export const DesktopPet: React.FC = () => {
  const [petState, setPetState] = useState<PetCompanionState>(DEFAULT_STATE);
  const [isBlinking, setIsBlinking] = useState(false);
  const [eyeShift, setEyeShift] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);
  const [settings, setSettings] = useState<Partial<FridaySettings>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Centralized Audio / Mouth reactive state
  const [liveAmplitude, setLiveAmplitude] = useState<number>(0);
  const [mouthOpenness, setMouthOpenness] = useState<number>(0);
  const [micLevel, setMicLevel] = useState<number>(0);

  const mouseDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // 1. Subscribe to Centralized Voice Session Events
  useEffect(() => {
    let unmount = false;

    // Load initial settings and pet state
    if (window.fridayAPI?.getSettings) {
      window.fridayAPI.getSettings().then((s) => {
        if (!unmount && s) setSettings(s);
      });
    }

    if (window.fridayAPI?.loadConversation) {
      window.fridayAPI.loadConversation(15).then((history) => {
        if (!unmount && Array.isArray(history)) setMessages(history);
      });
    }

    if (window.fridayAPI?.petGetState) {
      window.fridayAPI.petGetState().then((state) => {
        if (!unmount && state) setPetState(state);
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

  // Click vs Drag detection: delegates directly to Centralized Voice Manager
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
        // Trigger centralized microphone / interruption handler
        if (window.fridayAPI?.voiceTriggerMic) {
          window.fridayAPI.voiceTriggerMic();
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

  // Determine appropriate Expression Eyes asset
  const eyeAsset = useMemo(() => {
    const expr = petState.expression;
    const vState = petState.voiceSessionState;

    if (
      vState === 'TASK_UNSUPPORTED' ||
      vState === 'PERMISSION_REQUIRED' ||
      vState === 'MICROPHONE_ERROR' ||
      vState === 'PROVIDER_ERROR' ||
      vState === 'NETWORK_ERROR' ||
      activeRobotState === 'error' ||
      expr === 'not-happy' ||
      expr === 'not_happy' ||
      expr === 'confused'
    ) {
      return './assets/expressions/not-happy_eyes.png';
    }
    if (expr === 'happy' || expr === 'excited') {
      return './assets/expressions/happy_eyes.png';
    }
    if (expr === 'sad') {
      return './assets/expressions/sad_eyes.png';
    }
    if (expr === 'angry') {
      return './assets/expressions/angry_eyes.png';
    }
    if (expr === 'sarcastic') {
      return './assets/expressions/sarcastic_eyes.png';
    }
    if (expr === 'satisfied' || expr === 'sleepy') {
      return './assets/expressions/satisfied_eyes.png';
    }
    if (expr === 'laugh' || expr === 'laughing') {
      return './assets/expressions/laugh_eyes.png';
    }
    if (expr === 'crying') {
      return './assets/expressions/crying_eyes.png';
    }
    if (activeRobotState === 'listening' || vState === 'WAKE_DETECTED' || expr === 'smile') {
      return './assets/expressions/smile_eyes.png';
    }

    // Default neutral: natural character eyes
    return null;
  }, [activeRobotState, petState.expression, petState.voiceSessionState]);

  // Audio-reactive mouth dimensions from centralized mouth stream
  const mouthAmplitude = Math.max(0, Math.min(1, mouthOpenness || liveAmplitude || petState.amplitude));
  const mouthWidth = 7 + mouthAmplitude * 10;
  const mouthHeight = isSpeaking ? 3 + mouthAmplitude * 15 : 0;

  return (
    <div
      className="pet-root"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div
        className="pet-draggable-container"
        title="FRIDAY Pet — Click to speak, Double-click to open dashboard, Drag to move, Right-click for menu"
      >
        <div className="pet-wrapper">
          {/* Subtle Ambient Aura for Screen Scanning / Listening / Thinking / Speaking / Error */}
          <div
            className={`pet-aura aura-${effectiveAuraState}`}
            aria-hidden="true"
          />

          {/* Exact Character Art Base (Preserved 3D Character) */}
          <img
            className={`pet-character-art state-${effectiveAuraState}`}
            src="./assets/friday-pet@2x.png"
            alt="FRIDAY Desktop Pet"
            draggable={false}
          />

          {/* Overlay for Expressions, Natural Blinking, Eye Shift, and Audio-Reactive Speech */}
          <svg
            className={`pet-face-svg state-${effectiveAuraState}`}
            viewBox="0 0 290 297"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Expression Eyes Overlay */}
            {eyeAsset && !isBlinking && (
              <image
                href={eyeAsset}
                x={EYES_BOX.x + eyeShift.x}
                y={EYES_BOX.y + eyeShift.y}
                width={EYES_BOX.width}
                height={EYES_BOX.height}
                preserveAspectRatio="xMidYMid meet"
                opacity="0.94"
              />
            )}

            {/* Eyelids during blink */}
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
          {petState.soundMuted && (
            <div className="pet-badge-muted" title="FRIDAY is muted">
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
    </div>
  );
};
