import React, { useEffect, useState } from 'react';
import { RobotState } from '@/shared/types';
import '../styles/robot.css';

interface RobotCharacterProps {
  state: RobotState;
  amplitude: number; // 0.0 to 1.0 driven by real audio playback/mic
  frequencies?: number[];
  onClick?: () => void;
}

export const RobotCharacter: React.FC<RobotCharacterProps> = ({
  state,
  amplitude,
  frequencies = [0, 0, 0, 0, 0],
  onClick,
}) => {
  const [isBlinking, setIsBlinking] = useState(false);

  // Natural spontaneous blinking when idle or speaking
  useEffect(() => {
    if (state === 'error' || state === 'thinking') return;

    let timeoutId: NodeJS.Timeout;

    const scheduleBlink = () => {
      const nextBlinkMs = 2800 + Math.random() * 3500;
      timeoutId = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 160);
      }, nextBlinkMs);
    };

    scheduleBlink();
    return () => clearTimeout(timeoutId);
  }, [state]);

  // Compute mouth equalizer bar heights based on live amplitude
  // Base height: 4px when quiet, up to 28px when speaking loudly
  const mouthBars = [0, 1, 2, 3, 4].map((index) => {
    if (state === 'speaking') {
      const freqVal = frequencies[index] || amplitude;
      const barHeight = Math.max(4, Math.min(26, freqVal * 28 + Math.random() * 4));
      return barHeight;
    }
    if (state === 'listening') {
      return 4 + Math.sin(Date.now() / 200 + index) * 2;
    }
    if (state === 'thinking') {
      return 3 + Math.sin(Date.now() / 150 + index * 0.8) * 3;
    }
    return 3; // idle subtle bar
  });

  // Eye scaling for expressions
  let eyeScaleY = isBlinking ? 0.1 : 1.0;
  let eyeScaleX = 1.0;

  if (state === 'listening') {
    eyeScaleY = isBlinking ? 0.1 : 1.15;
    eyeScaleX = 1.1;
  } else if (state === 'thinking') {
    eyeScaleY = 0.85;
    eyeScaleX = 0.95;
  } else if (state === 'speaking') {
    eyeScaleY = isBlinking ? 0.1 : 1.05;
  } else if (state === 'interrupted') {
    eyeScaleY = 1.25;
    eyeScaleX = 1.2;
  } else if (state === 'error') {
    eyeScaleY = 0.7;
    eyeScaleX = 0.9;
  }

  return (
    <div
      className={`robot-stage state-${state}`}
      onClick={onClick}
      title="Click to interact with FRIDAY"
      style={{ cursor: 'pointer' }}
    >
      <div className="robot-head-container">
        <svg
          viewBox="0 0 240 240"
          width="200"
          height="200"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Robot Head Metallic Gradient */}
            <linearGradient id="chassisGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1a2233" />
              <stop offset="50%" stopColor="#111724" />
              <stop offset="100%" stopColor="#0a0e17" />
            </linearGradient>

            {/* Screen Glass Gradient */}
            <linearGradient id="screenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#080c14" />
              <stop offset="100%" stopColor="#0d1422" />
            </linearGradient>

            {/* Cyan Eye Glow Filter */}
            <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Left Ear Antenna */}
          <g>
            <rect x="22" y="98" width="12" height="28" rx="5" className="robot-antenna" />
            <circle cx="28" cy="98" r="6" className="robot-antenna" />
            <circle cx="28" cy="98" r="6" fill="none" className="antenna-ring" />
          </g>

          {/* Right Ear Antenna */}
          <g>
            <rect x="206" y="98" width="12" height="28" rx="5" className="robot-antenna" />
            <circle cx="212" cy="98" r="6" className="robot-antenna" />
            <circle cx="212" cy="98" r="6" fill="none" className="antenna-ring" />
          </g>

          {/* Top Head Antenna */}
          <g>
            <line
              x1="120"
              y1="40"
              x2="120"
              y2="18"
              stroke="#2e3e5c"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle
              cx="120"
              cy="16"
              r="7"
              fill={state === 'error' ? '#f43f5e' : state === 'listening' ? '#00e5ff' : '#00b4d8'}
              filter="url(#cyanGlow)"
            />
          </g>

          {/* Main Chassis Head Shell */}
          <rect
            x="38"
            y="42"
            width="164"
            height="146"
            rx="38"
            fill="url(#chassisGrad)"
            className="robot-chassis"
          />

          {/* Inner Visor / Glass Screen */}
          <rect
            x="52"
            y="60"
            width="136"
            height="110"
            rx="24"
            fill="url(#screenGrad)"
            className="robot-screen"
          />

          {/* Screen subtle reflective highlight */}
          <path
            d="M 64 68 Q 120 74 176 68"
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Eyes Group with Dynamic Expressions */}
          <g transform="translate(120, 105)">
            {/* Left Eye */}
            <g transform={`translate(-36, 0) scale(${eyeScaleX}, ${eyeScaleY})`}>
              <ellipse
                cx="0"
                cy="0"
                rx="14"
                ry="18"
                className="robot-eye"
              />
              {/* Pupil / inner specular gleam */}
              {!isBlinking && (
                <circle cx="-3" cy="-4" r="4" fill="#ffffff" opacity="0.9" />
              )}
            </g>

            {/* Right Eye */}
            <g transform={`translate(36, 0) scale(${eyeScaleX}, ${eyeScaleY})`}>
              <ellipse
                cx="0"
                cy="0"
                rx="14"
                ry="18"
                className="robot-eye"
              />
              {/* Pupil / inner specular gleam */}
              {!isBlinking && (
                <circle cx="-3" cy="-4" r="4" fill="#ffffff" opacity="0.9" />
              )}
            </g>
          </g>

          {/* Expressive Mouth LED Equalizer Bars */}
          <g transform="translate(120, 145)">
            {mouthBars.map((height, i) => {
              const xPos = (i - 2) * 11 - 3;
              const yPos = -height / 2;
              return (
                <rect
                  key={i}
                  x={xPos}
                  y={yPos}
                  width="6"
                  height={height}
                  rx="3"
                  className="mouth-bar"
                />
              );
            })}
          </g>

          {/* Cute subtle blush accents when idle/speaking */}
          {(state === 'idle' || state === 'speaking') && (
            <g opacity="0.25">
              <circle cx="72" cy="128" r="6" fill="#00e5ff" filter="url(#cyanGlow)" />
              <circle cx="168" cy="128" r="6" fill="#00e5ff" filter="url(#cyanGlow)" />
            </g>
          )}
        </svg>
      </div>

      {/* Floating Floor Shadow */}
      <div className="robot-shadow" />
    </div>
  );
};
