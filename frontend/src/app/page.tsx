'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import GameBoard from '@/components/game/GameBoard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('play'); // 'play', 'custom', 'ai'
  const [showGame, setShowGame] = useState(false);
  const [gameSettings, setGameSettings] = useState<any>({
    boardSize: 8,
    timeControl: { initial: 600, increment: 5 },
    mode: 'multiplayer'
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    if (token) {
      axios.get(`${API_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => setUser(res.data)).catch(() => setIsAuthenticated(false));
    }
  }, []);

  const timeControls = [
    { name: 'Bullet', time: '1 min', icon: '⚡', initial: 60, increment: 0 },
    { name: 'Blitz', time: '3 min', icon: '🔥', initial: 180, increment: 2 },
    { name: 'Rapid', time: '10 min', icon: '⏲️', initial: 600, increment: 5 },
    { name: 'Classical', time: '30 min', icon: '🐢', initial: 1800, increment: 10 },
  ];

  const handleStartGame = (settings: any) => {
    setGameSettings({ ...gameSettings, ...settings });
    setShowGame(true);
  };

  if (showGame) {
    return (
      <main className="min-h-screen bg-[#312e2b] p-4">
        <GameBoard
          onBack={() => setShowGame(false)}
          initialSettings={gameSettings}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#312e2b] flex flex-col items-center justify-center p-6 text-white">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-12 items-center">

        {/* Left Side: Call to Action */}
        <div className="space-y-8">
          <h1 className="text-6xl font-black leading-tight">
            Play Draughts <br/> <span className="text-[#81b64c]">Online</span>
          </h1>
          <div className="flex items-center gap-4 text-slate-400">
            <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#312e2b] bg-slate-700"></div>
              ))}
            </div>
            <span className="font-bold text-sm">Join 1,245 players online now</span>
          </div>

          <button
            onClick={() => setShowGame(true)}
            className="w-full py-6 bg-[#81b64c] hover:bg-[#a3d16e] text-white text-3xl font-black rounded-2xl shadow-[0_8px_0_rgb(69,98,41)] active:shadow-none active:translate-y-2 transition-all flex items-center justify-center gap-4"
          >
            <span>Play Online</span>
            <span className="text-4xl">➡️</span>
          </button>

          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setShowGame(true)} className="bg-[#45423e] p-4 rounded-xl font-bold hover:bg-[#524f4a] transition flex items-center gap-3">
              <span className="text-2xl">🤖</span> Play Computer
            </button>
            <button onClick={() => setShowGame(true)} className="bg-[#45423e] p-4 rounded-xl font-bold hover:bg-[#524f4a] transition flex items-center gap-3">
              <span className="text-2xl">🤝</span> Play a Friend
            </button>
          </div>
        </div>

        {/* Right Side: Quick Play Menu */}
        <div className="bg-[#262421] rounded-2xl p-6 shadow-2xl border border-[#3c3934]">
          <div className="flex border-b border-[#3c3934] mb-6">
            <button
              onClick={() => setActiveTab('play')}
              className={`pb-4 px-6 font-bold transition-colors ${activeTab === 'play' ? 'text-white border-b-4 border-[#81b64c]' : 'text-slate-500 hover:text-white'}`}
            >
              New Game
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`pb-4 px-6 font-bold transition-colors ${activeTab === 'custom' ? 'text-white border-b-4 border-[#81b64c]' : 'text-slate-500 hover:text-white'}`}
            >
              Custom
            </button>
          </div>

          {activeTab === 'play' ? (
            <div className="grid grid-cols-2 gap-3">
              {timeControls.map(tc => (
                <button
                  key={tc.name}
                  onClick={() => handleStartGame({ timeControl: { initial: tc.initial, increment: tc.increment } })}
                  className="bg-[#312e2b] p-6 rounded-xl border-2 border-transparent hover:border-[#81b64c] transition group"
                >
                  <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">{tc.icon}</div>
                  <div className="font-black text-lg">{tc.time}</div>
                  <div className="text-xs text-slate-500 uppercase font-bold">{tc.name}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-6 py-4">
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-500 uppercase">Board Size</label>
                 <div className="grid grid-cols-2 gap-2">
                   <button
                     onClick={() => setGameSettings({...gameSettings, boardSize: 8})}
                     className={`p-3 rounded-lg border-2 font-bold transition ${gameSettings.boardSize === 8 ? 'bg-[#312e2b] border-[#81b64c]' : 'bg-[#1a1917] border-transparent hover:border-[#81b64c]'}`}
                   >
                     8x8 Standard
                   </button>
                   <button
                     onClick={() => setGameSettings({...gameSettings, boardSize: 10})}
                     className={`p-3 rounded-lg border-2 font-bold transition ${gameSettings.boardSize === 10 ? 'bg-[#312e2b] border-[#81b64c]' : 'bg-[#1a1917] border-transparent hover:border-[#81b64c]'}`}
                   >
                     10x10 International
                   </button>
                 </div>
               </div>
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-500 uppercase">Visual Theme</label>
                 <div className="grid grid-cols-3 gap-2">
                   {['Classic', 'Wood', 'Ocean'].map(t => (
                     <button
                       key={t}
                       onClick={() => setGameSettings({...gameSettings, boardTheme: t.toLowerCase()})}
                       className={`py-2 rounded-lg border font-bold text-xs transition ${gameSettings.boardTheme === t.toLowerCase() ? 'bg-[#81b64c] border-white' : 'bg-[#1a1917] border-[#3c3934] hover:border-[#81b64c]'}`}
                     >
                       {t}
                     </button>
                   ))}
                 </div>
               </div>
               <div className="space-y-2">
                 <label className="text-xs font-black text-slate-500 uppercase">Opponent</label>
                 <select className="w-full bg-[#312e2b] border-2 border-transparent p-3 rounded-lg font-bold focus:border-[#81b64c] outline-none">
                    <option>Random Matchmaking</option>
                    <option>Friendly (Unrated)</option>
                 </select>
               </div>
               <button
                 onClick={() => setShowGame(true)}
                 className="w-full py-4 bg-[#81b64c] text-white text-xl font-black rounded-xl"
               >
                 Create Challenge
               </button>
            </div>
          )}

          {user && (
            <div className="mt-8 pt-6 border-t border-[#3c3934] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#81b64c] rounded-lg flex items-center justify-center font-black">
                  {user.username[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-bold">{user.username}</div>
                  <div className="text-xs text-slate-400">Rating: <span className="text-white font-mono">{user.rating}</span></div>
                </div>
              </div>
              <div className="text-xs font-bold text-[#81b64c] bg-[#81b64c]/10 px-3 py-1 rounded-full uppercase">
                Online
              </div>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
