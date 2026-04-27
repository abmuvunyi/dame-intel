'use client';
import GameBoard from "@/components/game/GameBoard";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [boardSize, setBoardSize] = useState(8);
  const [forceMajorityCapture, setForceMajorityCapture] = useState(true);
  const timeControls = [
    { label: '3 min', minutes: 3, increment: 0 },
    { label: '3 | 2', minutes: 3, increment: 2 },
    { label: '5 min', minutes: 5, increment: 0 },
    { label: '10 min', minutes: 10, increment: 0 },
    { label: '15 | 10', minutes: 15, increment: 10 },
  ];
  const [selectedTime, setSelectedTime] = useState(timeControls[3]);

  return (
    <main className="min-h-screen bg-[#1b1916] text-white flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-6xl flex justify-between items-center mb-6">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 tracking-tight">
          Online Draughts
        </h1>

        <div className="flex space-x-4">
          {isAuthenticated ? (
            <>
              <Link href="/tournaments" className="px-4 py-2 text-sm font-medium bg-slate-800 rounded hover:bg-slate-700 transition shadow">
                Tournaments
              </Link>
              <Link href="/puzzles" className="px-4 py-2 text-sm font-medium bg-slate-800 rounded hover:bg-slate-700 transition shadow">
                Train / Puzzles
              </Link>
              <Link href="/profile" className="px-4 py-2 text-sm font-medium bg-slate-800 rounded hover:bg-slate-700 transition shadow">
                My Profile
              </Link>
              <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium bg-red-900 rounded hover:bg-red-800 transition shadow-sm">
                Log Out
              </button>
            </>
          ) : (
            <Link href="/login" className="px-6 py-2 text-sm font-medium bg-green-600 rounded hover:bg-green-700 transition shadow">
              Login / Register
            </Link>
          )}
        </div>
      </div>

      <div className="w-full max-w-6xl bg-[#262421] rounded-xl shadow-2xl overflow-hidden border border-slate-800 flex min-h-[600px]">
        {isPlaying ? (
          <div className="w-full p-4">
             <GameBoard
               key={`${boardSize}-${selectedTime.label}`}
               initialSettings={{ boardSize, forceMajorityCapture, timeControl: { minutes: selectedTime.minutes, increment: selectedTime.increment } }}
               onBack={() => setIsPlaying(false)}
             />
          </div>
        ) : (
          <div className="flex w-full">
            {/* Left side empty board visual for dashboard */}
            <div className="hidden md:flex flex-1 items-center justify-center p-8 border-r border-slate-700">
               <div className="w-96 h-96 bg-cover bg-center opacity-20" style={{backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")'}} />
               <div className="absolute text-slate-500 font-bold text-2xl">Select a Game Mode</div>
            </div>

            {/* Right side controls */}
            <div className="w-full md:w-[400px] p-8 flex flex-col space-y-6">
               <h2 className="text-2xl font-bold text-white text-center">Play Draughts</h2>

               <div className="space-y-4">
                 <div className="bg-[#312e2b] p-4 rounded-lg shadow-inner flex flex-col space-y-4 border border-slate-700">
                    <h4 className="text-md font-bold text-slate-300 border-b border-slate-600 pb-2">Game Rules</h4>

                    <label className="text-sm flex justify-between items-center text-slate-300 font-semibold">
                       Variant:
                       <select
                          value={boardSize}
                          onChange={e => setBoardSize(parseInt(e.target.value))}
                          className="ml-2 border border-slate-600 rounded px-2 py-1 text-sm bg-[#262421] text-white focus:outline-none focus:border-green-500"
                       >
                         <option value={8}>8x8 (Standard)</option>
                         <option value={10}>10x10 (International)</option>
                       </select>
                    </label>

                    <label className="text-sm flex justify-between items-center text-slate-300 font-semibold cursor-pointer">
                       <span>Force Majority Capture</span>
                       <input
                          type="checkbox"
                          checked={forceMajorityCapture}
                          onChange={e => setForceMajorityCapture(e.target.checked)}
                          className="rounded bg-[#262421] border-slate-600 w-4 h-4 accent-green-600"
                       />
                    </label>
                 </div>

                 <div className="bg-[#312e2b] p-4 rounded-lg shadow-inner flex flex-col space-y-4 border border-slate-700">
                    <h4 className="text-md font-bold text-slate-300 border-b border-slate-600 pb-2">Time Control</h4>
                    <div className="grid grid-cols-3 gap-2">
                       {timeControls.map(tc => (
                         <button
                           key={tc.label}
                           onClick={() => setSelectedTime(tc)}
                           className={`py-2 px-1 text-xs font-bold rounded transition ${selectedTime.label === tc.label ? 'bg-green-600 text-white' : 'bg-[#262421] text-slate-400 hover:bg-slate-700 border border-slate-600'}`}
                         >
                           {tc.label}
                         </button>
                       ))}
                    </div>
                 </div>

                 <button
                   onClick={() => setIsPlaying(true)}
                   className="w-full px-6 py-4 bg-green-600 text-white text-xl font-bold rounded-lg shadow hover:bg-green-500 transition transform hover:scale-[1.02]"
                 >
                   Play
                 </button>
               </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}