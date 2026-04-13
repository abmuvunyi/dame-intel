'use client';

import { useState, useEffect } from 'react';

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
          if (prev <= 1) {
            clearInterval(interval);
            if (onTimeout) onTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, onTimeout]);

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
