'use client';

import { useState, useEffect } from 'react';

// Display-only countdown. As of Phase 5 the seconds it's fed (`initialTime`) come
// from the server's authoritative clock (see game.gateway.ts's clocks/turnStartedAt
// and GameBoard.tsx's displayClocks) and reset to a fresh server snapshot on every
// move — but this component still doesn't know or enforce anything on its own; the
// server's own flag-fall timer is what actually ends the game on timeout, not this.
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
