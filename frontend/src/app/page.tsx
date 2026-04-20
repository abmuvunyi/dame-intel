'use client';
import GameBoard from "@/components/game/GameBoard";
import type { TimeControl } from "@/components/game/GameBoard";
import { useState } from 'react';

const TIME_CONTROLS = [
  { label: '1 min', minutes: 1, increment: 0, type: 'Bullet' },
  { label: '3 min', minutes: 3, increment: 0, type: 'Blitz' },
  { label: '5 min', minutes: 5, increment: 0, type: 'Blitz' },
  { label: '10 min', minutes: 10, increment: 0, type: 'Rapid' },
  { label: '15 | 10', minutes: 15, increment: 10, type: 'Rapid' },
  { label: '30 min', minutes: 30, increment: 0, type: 'Rapid' },
];

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [boardSize, setBoardSize] = useState(8);
  const [selectedTime, setSelectedTime] = useState(TIME_CONTROLS[3]);

  if (isPlaying) {
    const timeControl: TimeControl = {
      initialMinutes: selectedTime.minutes,
      incrementSeconds: selectedTime.increment
    };

    return (
      <GameBoard
        key={`${boardSize}-${selectedTime.label}`}
        initialSettings={{ boardSize, timeControl }}
        onBack={() => setIsPlaying(false)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col items-center">
      <div className="bg-[#262421] p-8 rounded-xl shadow-2xl w-full max-w-md mt-10 text-center">
        <h2 className="text-3xl font-bold mb-6 text-white">Play Draughts</h2>

        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Variant</h3>
          <div className="flex bg-[#3b3836] rounded-lg p-1">
            <button
              onClick={() => setBoardSize(8)}
              className={`flex-1 py-2 rounded-md font-bold transition-colors ${boardSize === 8 ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-[#4a4745]'}`}
            >
              8x8 Standard
            </button>
            <button
              onClick={() => setBoardSize(10)}
              className={`flex-1 py-2 rounded-md font-bold transition-colors ${boardSize === 10 ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-[#4a4745]'}`}
            >
              10x10 International
            </button>
          </div>
        </div>

        <div className="mb-8">
           <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Time Control</h3>
           <div className="grid grid-cols-3 gap-2">
             {TIME_CONTROLS.map((tc, i) => (
               <button
                 key={i}
                 onClick={() => setSelectedTime(tc)}
                 className={`py-3 rounded-lg border-2 transition-all ${selectedTime.label === tc.label ? 'border-green-500 bg-[#3b3836] text-white' : 'border-[#3b3836] bg-transparent text-slate-300 hover:border-[#4a4745]'}`}
               >
                 <div className="font-bold">{tc.label}</div>
                 <div className="text-xs text-slate-500">{tc.type}</div>
               </button>
             ))}
           </div>
        </div>

        <button
          onClick={() => setIsPlaying(true)}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-bold text-xl py-4 rounded-lg shadow-[0_4px_0_rgb(22,101,52)] hover:shadow-[0_2px_0_rgb(22,101,52)] hover:translate-y-[2px] transition-all"
        >
          Play
        </button>
      </div>
    </div>
  );
}