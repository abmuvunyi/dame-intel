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
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl flex justify-between items-center mb-6">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-amber-600 tracking-tight">
          Online Draughts
        </h1>

        <div className="flex space-x-4">
          {isAuthenticated ? (
            <>
              <Link href="/profile" className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded hover:bg-slate-900 transition shadow">
                My Profile
              </Link>
              <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition shadow-sm">
                Log Out
              </button>
            </>
          ) : (
            <Link href="/login" className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition shadow">
              Login / Register
            </Link>
          )}
        </div>
      </div>

      <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <GameBoard />
        </div>
      </div>
    </main>
  );
}