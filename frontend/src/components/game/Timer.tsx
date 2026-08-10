'use client';

import { useState, useEffect } from 'react';

// Client-only countdown display. There is no server-side time control yet (see
// GameBoard.tsx's COSMETIC_CLOCK_SECONDS comment / STATUS.md Phase 4 notes) — this
// component doesn't know or care where its time comes from, so it'll work unchanged
// once a real server-authoritative clock (Phase 5) starts feeding it.
interface TimerProps {
  initialTime: number; // in seconds
  isActive: boolean;
  onTimeout?: () => void;
  increment?: number;
}

export default function Timer({ initialTime, isActive, onTimeout }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialTime);

  useEffect(() => {
    setTimeLeft(initialTime);
  }, [initialTime]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timeLeft <= 0) {
      if (onTimeout) onTimeout();
    }
    return () => clearInterval(interval);
  }, [isActive]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = timeLeft < 30;

  return (
    <div className={`px-4 py-2 rounded font-mono text-2xl font-bold ${isActive ? (isLowTime ? 'bg-red-500 text-white animate-pulse' : 'bg-yellow-400 text-slate-900') : 'bg-slate-200 text-slate-500'}`}>
      {formatTime(timeLeft)}
    </div>
  );
}
