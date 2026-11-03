import React, { useEffect, useMemo, useState } from 'react';
import { ConversationMood, FaceExpression, RobotState } from '@/shared/types';
import '../styles/robot.css';

const FACE_WIDTH = 1448;
const FACE_HEIGHT = 1086;
const MOUTH_CENTER = { x: 727, y: 666 };

interface RobotCharacterProps {
  state: RobotState;
  amplitude: number;
  frequencies?: number[];
  onClick?: () => void;
  mood?: ConversationMood;
  expression?: FaceExpression;
}

function fallbackExpression(state: RobotState, mood: ConversationMood): FaceExpression {
  if (state === 'thinking') return 'thinking';
  if (state === 'listening') return 'curious';
  if (state === 'interrupted') return 'surprised';
  if (state === 'error') return 'sad';
  if (state === 'sleeping') return 'sleepy';
  if (state === 'laughing') return 'laughing';
  if (mood === 'enthusiastic') return 'excited';
  if (mood === 'playful') return 'happy';
  return 'neutral';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const RobotCharacter: React.FC<RobotCharacterProps> = ({
  state,
  amplitude,
  frequencies = [0, 0, 0, 0, 0],
  onClick,
  mood = 'calm',
  expression,
}) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [gazeOffset, setGazeOffset] = useState({ x: 0, y: 0 });
  const activeExpression = expression || fallbackExpression(state, mood);
  const isSpeaking = state === 'speaking' || state === 'laughing';
  const level = isSpeaking ? clamp(amplitude, 0, 1) : 0;

  // Realistic blinking is independent from speech and intentionally irregular.
  // The face artwork remains untouched; only a soft face-colour lid is added.
  useEffect(() => {
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let secondBlinkTimer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      blinkTimer = setTimeout(() => {
        setIsBlinking(true);
        closeTimer = setTimeout(() => {
          setIsBlinking(false);
          if (Math.random() < 0.14) {
            secondBlinkTimer = setTimeout(() => {
              setIsBlinking(true);
              closeTimer = setTimeout(() => setIsBlinking(false), 105);
            }, 115);
          }
          schedule();
        }, 115 + Math.random() * 55);
      }, 2400 + Math.random() * 4300);
    };

    schedule();
    return () => {
      if (blinkTimer) clearTimeout(blinkTimer);
      if (closeTimer) clearTimeout(closeTimer);
      if (secondBlinkTimer) clearTimeout(secondBlinkTimer);
    };
  }, []);

  // Tiny, infrequent gaze shifts keep the highlights alive without moving or
  // distorting the original eye artwork. Thinking naturally looks upward.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleGaze = () => {
      timer = setTimeout(() => {
        setGazeOffset({ x: Math.round((Math.random() - 0.5) * 8), y: Math.round((Math.random() - 0.5) * 6) });
        resetTimer = setTimeout(() => {
          setGazeOffset({ x: 0, y: 0 });
          scheduleGaze();
        }, 520 + Math.random() * 360);
      }, 1800 + Math.random() * 2800);
    };
    scheduleGaze();
    return () => {
      if (timer) clearTimeout(timer);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, []);

  const mouth = useMemo(() => {
    // The supplied image's black oval is the neutral mouth. It stretches in
    // place; no lips or replacement facial feature is introduced.
    const expressionOpen =
      activeExpression === 'happy' || activeExpression === 'sarcastic'
        ? 0.2
        : activeExpression === 'surprised' || activeExpression === 'excited'
          ? 0.72
          : activeExpression === 'laughing'
            ? 0.68
            : 0;
    const speechOpen = isSpeaking ? 0.12 + level * 0.88 : 0;
    const openness = Math.max(expressionOpen, speechOpen);
    const lowFrequency = frequencies[0] || level;
    const highFrequency = frequencies[4] || level;
    const rounded = lowFrequency >= highFrequency;

    return {
      rx: 37 + openness * (rounded ? 20 : 28),
      ry: 26 + openness * (rounded ? 38 : 52),
      // A slightly wider mouth for open vowels and a rounder one for lower
      // energy sounds makes amplitude-driven speech less repetitive.
      rotate: rounded ? 0 : clamp((highFrequency - lowFrequency) * 12, -4, 4),
    };
  }, [activeExpression, frequencies, isSpeaking, level]);

  const eyebrowPaths = useMemo(() => {
    switch (activeExpression) {
      case 'sad':
        return { left: 'M 448 398 Q 535 347 625 382', right: 'M 819 382 Q 909 347 1000 398' };
      case 'angry':
        return { left: 'M 448 392 Q 535 438 625 430', right: 'M 819 430 Q 909 438 1000 392' };
      case 'confused':
        return { left: 'M 448 375 Q 535 340 625 382', right: 'M 819 405 Q 910 430 1000 397' };
      case 'sarcastic':
        return { left: 'M 448 365 Q 535 325 625 365', right: 'M 819 410 Q 910 425 1000 410' };
      case 'curious':
      case 'excited':
        return { left: 'M 448 365 Q 535 320 625 360', right: 'M 819 360 Q 909 320 1000 365' };
      case 'thinking':
        return { left: 'M 448 380 Q 535 342 625 372', right: 'M 819 372 Q 909 342 1000 380' };
      case 'happy':
      case 'laughing':
        return { left: 'M 448 380 Q 535 350 625 380', right: 'M 819 380 Q 909 350 1000 380' };
      default:
        return null;
    }
  }, [activeExpression]);

  return (
    <div
      className={`robot-stage state-${state} expression-${activeExpression}`}
      onClick={onClick}
      title="Click to interact with FRIDAY"
      style={{ cursor: 'pointer' }}
    >
      <div className="friday-face-container">
        <img
          className="friday-face-image"
          src="./assets/friday-face.png"
          alt="FRIDAY"
          draggable={false}
        />
        <svg
          className="friday-face-overlay"
          viewBox={`0 0 ${FACE_WIDTH} ${FACE_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="faceShade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
              <stop offset="1" stopColor="#eeeeee" stopOpacity="0.96" />
            </linearGradient>
          </defs>

          {isBlinking && (
            <g className="face-blink-lids">
              <ellipse cx="540" cy="516" rx="94" ry="97" fill="url(#faceShade)" />
              <ellipse cx="915" cy="516" rx="94" ry="97" fill="url(#faceShade)" />
            </g>
          )}

          <g className="face-expression-lids">
            <path className="face-lid face-lid-happy" d="M 443 526 Q 540 585 637 526 L 637 625 L 443 625 Z" fill="url(#faceShade)" />
            <path className="face-lid face-lid-happy" d="M 818 526 Q 915 585 1012 526 L 1012 625 L 818 625 Z" fill="url(#faceShade)" />
            <path className="face-lid face-lid-sleepy" d="M 443 468 Q 540 515 637 468 L 637 565 Q 540 520 443 565 Z" fill="url(#faceShade)" />
            <path className="face-lid face-lid-sleepy" d="M 818 468 Q 915 515 1012 468 L 1012 565 Q 915 520 818 565 Z" fill="url(#faceShade)" />
            <path className="face-lid face-lid-angry" d="M 438 418 L 640 476 L 640 410 L 438 370 Z" fill="url(#faceShade)" />
            <path className="face-lid face-lid-angry" d="M 813 476 L 1015 418 L 1015 370 L 813 410 Z" fill="url(#faceShade)" />
          </g>

          {eyebrowPaths && (
            <g className="face-eyebrows" fill="none" stroke="#070707" strokeWidth="15" strokeLinecap="round">
              <path d={eyebrowPaths.left} />
              <path d={eyebrowPaths.right} />
            </g>
          )}

          {(gazeOffset.x !== 0 || gazeOffset.y !== 0 || activeExpression === 'thinking' || activeExpression === 'curious') && (
            <g className="face-gaze-highlights">
              <ellipse cx="500" cy="465" rx="20" ry="19" fill="#050505" />
              <ellipse cx="872" cy="466" rx="20" ry="19" fill="#050505" />
              <g transform={`translate(${gazeOffset.x} ${gazeOffset.y + (activeExpression === 'thinking' ? -10 : activeExpression === 'curious' ? -4 : 0)})`}>
                <ellipse cx="500" cy="465" rx="17" ry="16" fill="#ffffff" />
                <ellipse cx="872" cy="466" rx="17" ry="16" fill="#ffffff" />
              </g>
            </g>
          )}

          <ellipse
            className="face-mouth-opening"
            cx={MOUTH_CENTER.x}
            cy={MOUTH_CENTER.y}
            rx={mouth.rx}
            ry={mouth.ry}
            transform={`rotate(${mouth.rotate} ${MOUTH_CENTER.x} ${MOUTH_CENTER.y})`}
          />
        </svg>
      </div>
      <div className="robot-shadow" />
    </div>
  );
};
