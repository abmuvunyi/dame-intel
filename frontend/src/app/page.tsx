'use client';

import { useState } from 'react';
import GameBoard from "@/components/game/GameBoard";

export type TimeControl = {
  label: string;
  minutes: number;
  increment: number; // in seconds
  type: 'Bullet' | 'Blitz' | 'Rapid';
};

const TIME_CONTROLS: TimeControl[] = [
  { label: '1 min', minutes: 1, increment: 0, type: 'Bullet' },
  { label: '1 | 1', minutes: 1, increment: 1, type: 'Bullet' },
  { label: '2 | 1', minutes: 2, increment: 1, type: 'Bullet' },
  { label: '3 min', minutes: 3, increment: 0, type: 'Blitz' },
  { label: '3 | 2', minutes: 3, increment: 2, type: 'Blitz' },
  { label: '5 min', minutes: 5, increment: 0, type: 'Blitz' },
  { label: '10 min', minutes: 10, increment: 0, type: 'Rapid' },
  { label: '15 | 10', minutes: 15, increment: 10, type: 'Rapid' },
  { label: '30 min', minutes: 30, increment: 0, type: 'Rapid' },
];

export default function Home() {
  const [boardSize, setBoardSize] = useState<8 | 10>(8);
  const [selectedTime, setSelectedTime] = useState<TimeControl>(TIME_CONTROLS[5]); // Default 5 min

  return (
    <main className="min-h-screen bg-gray-50 flex py-10 px-4 justify-center">
      <div className="w-full max-w-7xl flex flex-col lg:flex-row gap-8">

        {/* Play Dashboard (Variant & Time Selection) */}
        <div className="w-full lg:w-80 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Play Draughts</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Variant</label>
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setBoardSize(8)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${boardSize === 8 ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}
                  >
                    Standard (8x8)
                  </button>
                  <button
                    onClick={() => setBoardSize(10)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${boardSize === 10 ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}
                  >
                    International (10x10)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Time Control</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_CONTROLS.map((tc) => (
                    <button
                      key={tc.label}
                      onClick={() => setSelectedTime(tc)}
                      className={`p-2 rounded-lg text-sm font-bold border-2 transition ${
                        selectedTime.label === tc.label
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {tc.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Game Board Component Area */}
        <div className="flex-1">
          <GameBoard
            key={`${boardSize}-${selectedTime.label}`}
            initialSettings={{
              boardSize,
              timeControl: selectedTime,
              forceMajorityCapture: true
            }}
          />
        </div>

      </div>
    </main>
  );
}