import React, { useEffect, useMemo, useState } from 'react';
import { ConversationMood, FaceExpression, RobotState } from '@/shared/types';
import '../styles/robot.css';

const FACE_WIDTH = 1448;
const FACE_HEIGHT = 1086;
const MOUTH_CENTER = { x: 728, y: 640 };

const EXPRESSIONS = [
  'happy',
  'sad',
  'crying',
  'angry',
  'satisfied',
  'sarcastic',
  'laugh',
  'smile',
  'not-happy',
] as const;

interface RobotCharacterProps {
  state: RobotState;
  amplitude: number;
  frequencies?: number[];
  onClick?: () => void;
  mood?: ConversationMood;
  expression?: FaceExpression;
}

function resolveExpression(expr?: FaceExpression, state?: RobotState): string {
  if (expr === 'laughing') return 'laugh';
  if (expr === 'not_happy') return 'not-happy';
  if (expr === 'excited') return 'happy';
  if (expr === 'curious' || expr === 'thinking') return 'smile';
  if (expr === 'surprised') return 'happy';
  if (expr === 'confused') return 'not-happy';
  if (expr === 'sleepy') return 'satisfied';
  if (expr === 'neutral') return 'smile';
  if (expr && (EXPRESSIONS as readonly string[]).includes(expr)) return expr;
  if (state === 'error') return 'sad';
  if (state === 'laughing') return 'laugh';
  return 'smile';
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
  const activeExpression = resolveExpression(expression, state);
  const isSpeaking = state === 'speaking' || state === 'laughing';
  const level = isSpeaking ? clamp(amplitude, 0, 1) : 0;

  // Natural spontaneous blinking: smooth closure independent of speech
  useEffect(() => {
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let secondBlinkTimer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      blinkTimer = setTimeout(() => {
        setIsBlinking(true);
        closeTimer = setTimeout(() => {
          setIsBlinking(false);
          if (Math.random() < 0.15) {
            secondBlinkTimer = setTimeout(() => {
              setIsBlinking(true);
              closeTimer = setTimeout(() => setIsBlinking(false), 95);
            }, 110);
          }
          schedule();
        }, 110 + Math.random() * 45);
      }, 2600 + Math.random() * 3800);
    };

    schedule();
    return () => {
      if (blinkTimer) clearTimeout(blinkTimer);
      if (closeTimer) clearTimeout(closeTimer);
      if (secondBlinkTimer) clearTimeout(secondBlinkTimer);
    };
  }, []);

  // Audio-reactive original small black oval mouth animation
  const mouth = useMemo(() => {
    const speechOpen = isSpeaking
      ? level * 0.82 + (frequencies[0] || level) * 0.22
      : 0;

    const openness = clamp(speechOpen, 0, 1);
    const lowFreq = frequencies[0] || level;
    const highFreq = frequencies[4] || level;
    const rounded = lowFreq >= highFreq;

    return {
      rx: 32 + openness * (rounded ? 18 : 25),
      ry: 18 + openness * (rounded ? 34 : 46),
      rotate: rounded ? 0 : clamp((highFreq - lowFreq) * 10, -3, 3),
    };
  }, [frequencies, isSpeaking, level]);

  return (
    <div
      className={`robot-stage state-${state} expression-${activeExpression}`}
      onClick={onClick}
      title="Click to interact with FRIDAY"
      style={{ cursor: 'pointer' }}
    >
      <div className="friday-face-container">
        {/* Render all 9 approved expression faces with smooth crossfade */}
        {EXPRESSIONS.map((expr) => (
          <img
            key={expr}
            className={`friday-face-layer ${expr === activeExpression ? 'active' : ''}`}
            src={`./assets/expressions/face_${expr}.png`}
            alt={`FRIDAY ${expr}`}
            draggable={false}
          />
        ))}

        {/* SVG Interactive Overlay for Blinking, Animated Tears, and TTS Mouth */}
        <svg
          className="friday-face-overlay"
          viewBox={`0 0 ${FACE_WIDTH} ${FACE_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Subtle animated tears for Crying expression */}
          {activeExpression === 'crying' && (
            <g className="face-tears" fill="#58a6ff" opacity="0.88">
              <path
                className="tear-drop tear-left"
                d="M 540 600 C 532 618, 528 640, 540 662 C 552 640, 548 618, 540 600 Z"
              />
              <path
                className="tear-drop tear-right"
                d="M 915 600 C 907 618, 903 640, 915 662 C 927 640, 923 618, 915 600 Z"
              />
            </g>
          )}

          {/* Natural spontaneous blinking mask (soft white eyelid) */}
          {isBlinking && (
            <g className="face-blink-mask" aria-hidden="true">
              <ellipse className="face-blink-eye" cx="540" cy="516" rx="98" ry="102" />
              <ellipse className="face-blink-eye" cx="915" cy="516" rx="98" ry="102" />
            </g>
          )}

          {/* Original Small Black Oval Mouth animated during TTS playback */}
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

      {/* Floating Floor Shadow */}
      <div className="robot-shadow" />
    </div>
  );
};
