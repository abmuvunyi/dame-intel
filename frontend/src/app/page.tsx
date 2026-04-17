'use client';

import GameBoard from "@/components/game/GameBoard";
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export default function Home() {
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  const [activeGame, setActiveGame] = useState<{
    mode: 'multiplayer' | 'ai' | 'spectate';
    variant: '8x8' | '10x10';
    aiDifficulty?: number;
    roomId?: string; // For spectating or direct joins
  } | null>(null);

  useEffect(() => {
    // Only connect a temporary socket for the dashboard to fetch active games
    // GameBoard will handle its own connection when active
    if (!activeGame) {
      const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');
      setSocket(newSocket);

      newSocket.on('connect', () => {
         newSocket.emit('getActiveGames');
      });

      newSocket.on('activeGamesList', (games: any[]) => {
         setActiveGames(games);
      });

      return () => {
         newSocket.disconnect();
      };
    } else {
      setSocket(null);
    }
  }, [activeGame]);

  // If a game is active, show the GameBoard
  if (activeGame) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-6 px-4">
        <GameBoard
           initialSettings={{
              boardSize: activeGame.variant === '10x10' ? 10 : 8,
              forceMajorityCapture: activeGame.variant === '10x10' ? true : false, // Standard 8x8 doesn't strictly force majority in some rules, but let's default based on variant
              mode: activeGame.mode,
              aiDifficulty: activeGame.aiDifficulty,
              roomIdToSpectate: activeGame.roomId
           }}
           onBack={() => setActiveGame(null)}
        />
      </div>
    );
  }

  // Otherwise, show the Play Dashboard
  return (
    <div className="min-h-full bg-gray-50 flex flex-col items-center p-6 md:p-12">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-extrabold text-slate-800 mb-2 tracking-tight">Play Draughts</h1>
        <p className="text-slate-500 mb-8">Choose a game mode and start playing.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Online Multiplayer Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="bg-blue-600 p-6 text-white">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <span>🌍</span> Play Online
              </h2>
              <p className="text-blue-100 mt-1">Match with players around the world</p>
            </div>
            <div className="p-6 space-y-4">
              <button
                onClick={() => setActiveGame({ mode: 'multiplayer', variant: '8x8' })}
                className="w-full py-4 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-semibold text-slate-700 transition flex items-center justify-between"
              >
                <div className="flex flex-col text-left">
                  <span>Standard (8x8)</span>
                  <span className="text-xs font-normal text-slate-500">Classic rules</span>
                </div>
                <span className="text-2xl text-slate-400">→</span>
              </button>

              <button
                onClick={() => setActiveGame({ mode: 'multiplayer', variant: '10x10' })}
                className="w-full py-4 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-semibold text-slate-700 transition flex items-center justify-between"
              >
                <div className="flex flex-col text-left">
                  <span>International (10x10)</span>
                  <span className="text-xs font-normal text-slate-500">Flying kings, majority capture</span>
                </div>
                <span className="text-2xl text-slate-400">→</span>
              </button>
            </div>
          </div>

          {/* Computer / AI Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="bg-slate-800 p-6 text-white">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <span>🤖</span> Play Computer
              </h2>
              <p className="text-slate-300 mt-1">Practice against AI opponents</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Standard (8x8)</h3>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(level => (
                    <button
                      key={`8x8-ai-${level}`}
                      onClick={() => setActiveGame({ mode: 'ai', variant: '8x8', aiDifficulty: level })}
                      className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition"
                    >
                      Lvl {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">International (10x10)</h3>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(level => (
                    <button
                      key={`10x10-ai-${level}`}
                      onClick={() => setActiveGame({ mode: 'ai', variant: '10x10', aiDifficulty: level })}
                      className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition"
                    >
                      Lvl {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Games Section */}
        {activeGames.length > 0 && (
          <div className="mt-12 w-full max-w-4xl">
            <h3 className="text-2xl font-bold mb-6 text-slate-800 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Live Games
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeGames.map((game, i) => (
                <div key={i} className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow transition">
                   <div className="flex flex-col">
                      <span className="font-semibold text-slate-700">{game.player1} vs {game.player2}</span>
                      <span className="text-xs text-slate-500">{game.spectatorsCount} spectator{game.spectatorsCount !== 1 && 's'}</span>
                   </div>
                   <button
                     onClick={() => setActiveGame({ mode: 'spectate', variant: '8x8', roomId: game.roomId })} // Variant doesn't strictly matter for spectator join request
                     className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg font-medium text-sm hover:bg-green-100 transition"
                   >
                     Watch 👀
                   </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
