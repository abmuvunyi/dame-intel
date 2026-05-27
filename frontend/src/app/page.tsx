'use client';
import GameBoard from "@/components/game/GameBoard";
import { useEffect, useState } from 'react';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  return (
    <main className="min-h-screen bg-[#302e2b] text-white flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-5xl flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Play Draughts
        </h1>
      </div>

      <div className="w-full max-w-5xl bg-[#262421] rounded shadow-2xl overflow-hidden border border-[#403d39]">
        <div className="p-4 md:p-8">
          <GameBoard />
        </div>
      </div>
    </main>
  );
}
