'use client';

import GameBoard from "@/components/game/GameBoard";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  // Settings
  const [boardSize, setBoardSize] = useState<8 | 10>(8);
  const [timeControl, setTimeControl] = useState('blitz');
  const [playMode, setPlayMode] = useState<'pvp' | 'ai'>('pvp');

  // We rely on GameBoard to handle its own initialSettings or we can pass it if supported.
  // GameBoard manages its own state for matchmaking/AI, let's see if it takes props.
  const [isPlaying, setIsPlaying] = useState(false);
  // Based on memory, GameBoard supports `initialSettings` prop
  const [initialSettings, setInitialSettings] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  const handlePlayClick = () => {
    setInitialSettings({
      boardSize,
      timeControl,
      mode: playMode,
    });
    setIsPlaying(true);
  };

  // When GameBoard wants to exit, we can add a callback or it handles it.
  // Let's render GameBoard directly if isPlaying is true.

  return (
    <main className="min-h-screen bg-[#302e2b] flex items-center justify-center p-4">
      {isPlaying ? (
        <div className="w-full h-full flex flex-col items-center">
          <button
            onClick={() => setIsPlaying(false)}
            className="mb-4 bg-[#454341] hover:bg-[#52504e] text-white px-4 py-2 rounded font-semibold self-start ml-[5%]"
          >
            ← Back to Dashboard
          </button>
          <div className="flex-1 w-full flex justify-center items-center">
            {/* We'll pass initialSettings if GameBoard supports it. If it doesn't, we'll see soon. */}
            <GameBoard initialSettings={initialSettings} onBack={() => setIsPlaying(false)} />
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-5xl h-[600px] bg-[#262421] rounded-lg overflow-hidden shadow-2xl">
          {/* Left side - Decorative board or image */}
          <div className="flex-1 hidden md:flex items-center justify-center bg-[#302e2b] border-r border-[#3e3b38]">
             {/* A placeholder for a chess.com-style board graphic */}
             <div className="w-[400px] h-[400px] bg-[#739552] flex flex-wrap shadow-lg">
                {Array.from({ length: 64 }).map((_, i) => {
                  const isLight = (Math.floor(i / 8) + (i % 8)) % 2 === 0;
                  return (
                    <div key={i} className={`w-[12.5%] h-[12.5%] ${isLight ? 'bg-[#ebecd0]' : 'bg-[#739552]'}`} />
                  )
                })}
             </div>
          </div>

          {/* Right side - Play Controls */}
          <div className="flex-1 flex flex-col p-8 text-white">
            <h1 className="text-4xl font-bold mb-8 text-center">Play Draughts</h1>

            <div className="space-y-6 flex-1">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">Variant</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBoardSize(8)}
                    className={`py-3 rounded font-bold transition-colors ${boardSize === 8 ? 'bg-[#81b64c] text-white' : 'bg-[#3e3b38] text-gray-300 hover:bg-[#454341]'}`}
                  >
                    8x8 American
                  </button>
                  <button
                    onClick={() => setBoardSize(10)}
                    className={`py-3 rounded font-bold transition-colors ${boardSize === 10 ? 'bg-[#81b64c] text-white' : 'bg-[#3e3b38] text-gray-300 hover:bg-[#454341]'}`}
                  >
                    10x10 International
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">Time Control</label>
                <select
                  value={timeControl}
                  onChange={(e) => setTimeControl(e.target.value)}
                  className="w-full bg-[#3e3b38] border border-[#52504e] text-white rounded p-3 font-semibold focus:outline-none focus:border-[#81b64c]"
                >
                  <option value="bullet">Bullet (2+1)</option>
                  <option value="blitz">Blitz (5+3)</option>
                  <option value="rapid">Rapid (10+5)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">Opponent</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPlayMode('pvp')}
                    className={`py-3 rounded font-bold transition-colors ${playMode === 'pvp' ? 'bg-[#81b64c] text-white' : 'bg-[#3e3b38] text-gray-300 hover:bg-[#454341]'}`}
                  >
                    Play Human
                  </button>
                  <button
                    onClick={() => setPlayMode('ai')}
                    className={`py-3 rounded font-bold transition-colors ${playMode === 'ai' ? 'bg-[#81b64c] text-white' : 'bg-[#3e3b38] text-gray-300 hover:bg-[#454341]'}`}
                  >
                    Play Computer
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handlePlayClick}
              className="mt-8 w-full bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold text-2xl py-6 rounded-lg shadow-[0_5px_0_#537a2f] active:shadow-[0_0px_0_#537a2f] active:translate-y-[5px] transition-all flex items-center justify-center gap-3"
            >
              <Play fill="currentColor" size={32} />
              Play
            </button>
          </div>
        </div>
      )}
    </main>
  );
}