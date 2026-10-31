import React from 'react';

interface AudioVisualizerProps {
  frequencies: number[];
  isActive: boolean;
  color?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  frequencies,
  isActive,
  color = 'var(--accent)',
}) => {
  // Use 16 wave bars for a smooth, high-tech waveform
  const bars = Array.from({ length: 16 }).map((_, i) => {
    const freqIdx = i < 8 ? i : 15 - i;
    const rawVal = frequencies[freqIdx % frequencies.length] || 0;
    const height = isActive ? Math.max(3, Math.min(24, rawVal * 28 + (i % 2 === 0 ? 3 : 1))) : 2;
    return height;
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        height: '28px',
        margin: '2px 0 10px 0',
      }}
    >
      {bars.map((height, i) => (
        <div
          key={i}
          style={{
            width: '3px',
            height: `${height}px`,
            backgroundColor: color,
            borderRadius: '2px',
            opacity: isActive ? 0.85 : 0.2,
            transition: 'height 0.08s ease, opacity 0.3s ease',
            boxShadow: isActive ? `0 0 8px ${color}88` : 'none',
          }}
        />
      ))}
    </div>
  );
};

