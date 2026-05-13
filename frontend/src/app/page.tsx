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

  return (
    <main className="min-h-screen flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl flex justify-between items-center mb-6">
        <h1 className="text-4xl font-extrabold text-[#7fa650] tracking-tight">
          Online Draughts
        </h1>

        <div className="flex space-x-4">
          {isAuthenticated ? (
            <>
              <Link href="/tournaments" className="px-4 py-2 text-sm font-medium text-white bg-[#7fa650] rounded hover:bg-[#95bb66] transition shadow">
                Tournaments
              </Link>
              <Link href="/puzzles" className="px-4 py-2 text-sm font-medium text-white bg-[#7fa650] rounded hover:bg-[#95bb66] transition shadow">
                Train / Puzzles
              </Link>
              <Link href="/profile" className="px-4 py-2 text-sm font-medium text-white bg-[#454341] rounded hover:bg-[#52504e] transition shadow">
                My Profile
              </Link>
              <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-red-700 rounded hover:bg-red-700 transition shadow-sm">
                Log Out
              </button>
            </>
          ) : (
            <Link href="/login" className="px-6 py-2 text-sm font-medium text-white bg-[#7fa650] rounded hover:bg-[#95bb66] transition shadow">
              Login / Register
            </Link>
          )}
        </div>
      </div>

      <div className="w-full max-w-5xl bg-[#262421] rounded-xl shadow-2xl overflow-hidden border border-[#302e2b]">
        <div className="p-8">
          <GameBoard />
        </div>
      </div>
    </main>
  );
}