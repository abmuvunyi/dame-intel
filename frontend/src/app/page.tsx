'use client';

import GameBoard from "@/components/game/GameBoard";
import { useState } from 'react';

const TIME_CONTROLS = [
  { id: 'bullet', label: '1 min', icon: '⚡' },
  { id: 'blitz', label: '3 min', icon: '🔥' },
  { id: 'rapid', label: '10 min', icon: '⏱️' },
];

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [boardSize, setBoardSize] = useState(8);
  const [forceMajorityCapture, setForceMajorityCapture] = useState(true);
  const [selectedTime, setSelectedTime] = useState(TIME_CONTROLS[1]); // Default to blitz
  const [selectedAiLevel, setSelectedAiLevel] = useState<number | null>(null);

  const startOnlineGame = () => {
    setSelectedAiLevel(null);
    setIsPlaying(true);
  };

  const startAiGame = (level: number) => {
    setSelectedAiLevel(level);
    setIsPlaying(true);
  };

  if (isPlaying) {
    return (
      <div className="min-h-screen p-4 flex justify-center bg-[#312e2b]">
        <GameBoard
          key={`${boardSize}-${selectedTime.id}-${selectedAiLevel}`}
          initialSettings={{
            boardSize,
            forceMajorityCapture,
            aiDifficulty: selectedAiLevel || undefined,
            timeControl: selectedTime.id
          }}
          onBack={() => setIsPlaying(false)}
        />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#312e2b] flex flex-col items-center justify-center py-10 px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">

        {/* Left side: Hero Graphics / Branding */}
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-48 h-48 md:w-64 md:h-64 bg-[#262421] rounded-2xl shadow-2xl border-4 border-[#3d3a36] flex items-center justify-center p-4">
            {/* Simple CSS board representation */}
            <div className="grid grid-cols-4 grid-rows-4 w-full h-full gap-1 p-1 bg-[#3d3a36]">
               {[...Array(16)].map((_, i) => (
                 <div key={i} className={`rounded-sm ${(Math.floor(i/4) + i%4) % 2 === 0 ? 'bg-[#764b36]' : 'bg-[#e5d0aa]'}`}></div>
               ))}
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            Play Draughts <br/><span className="text-amber-500">Online</span>
          </h1>
          <p className="text-[#c3c3c0] text-lg">Over 1,000,000 games played today!</p>
        </div>

        {/* Right side: Play Dashboard Menu */}
        <div className="bg-[#262421] p-6 rounded-xl shadow-2xl border border-[#3d3a36] flex flex-col space-y-6">

          <div className="space-y-4">
            <h2 className="text-white text-xl font-bold border-b border-[#3d3a36] pb-2">Game Type</h2>
            <div className="flex bg-[#161512] rounded-lg p-1">
              <button
                onClick={() => setBoardSize(8)}
                className={`flex-1 py-2 font-bold rounded text-sm transition-colors ${boardSize === 8 ? 'bg-[#3d3a36] text-white shadow' : 'text-[#c3c3c0] hover:text-white'}`}
              >
                8x8 Standard
              </button>
              <button
                onClick={() => setBoardSize(10)}
                className={`flex-1 py-2 font-bold rounded text-sm transition-colors ${boardSize === 10 ? 'bg-[#3d3a36] text-white shadow' : 'text-[#c3c3c0] hover:text-white'}`}
              >
                10x10 Int'l
              </button>
            </div>
          </div>

          <div className="space-y-4">
             <h2 className="text-white text-xl font-bold border-b border-[#3d3a36] pb-2">Time Control</h2>
             <div className="grid grid-cols-3 gap-2">
                {TIME_CONTROLS.map(tc => (
                  <button
                    key={tc.id}
                    onClick={() => setSelectedTime(tc)}
                    className={`flex flex-col items-center justify-center py-3 rounded-lg border-2 transition-all ${
                      selectedTime.id === tc.id
                        ? 'border-amber-500 bg-[#3d3a36] text-white'
                        : 'border-[#3d3a36] text-[#c3c3c0] hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    <span className="text-2xl mb-1">{tc.icon}</span>
                    <span className="font-bold">{tc.label}</span>
                  </button>
                ))}
             </div>
          </div>

          <div className="space-y-3 pt-4">
             <button
               onClick={startOnlineGame}
               className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-extrabold text-xl rounded-xl shadow-lg hover:shadow-green-900/50 transition-all flex items-center justify-center gap-3"
             >
               <span className="text-3xl">♟️</span> Play Online
             </button>

             <div className="bg-[#161512] p-4 rounded-xl border border-[#3d3a36] space-y-3">
                <div className="text-center font-bold text-[#c3c3c0]">Play vs Computer</div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => startAiGame(lvl)}
                      className="py-2 bg-[#3d3a36] hover:bg-[#4d4944] text-white font-bold rounded-lg transition-colors text-sm"
                    >
                      Lvl {lvl}
                    </button>
                  ))}
                </div>
             </div>
          </div>

        </div>
      </div>
    </main>
  );
}