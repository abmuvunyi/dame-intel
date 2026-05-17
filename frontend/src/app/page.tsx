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
      <div className="w-full max-w-7xl flex justify-end items-center mb-6">
        <div className="flex space-x-4">
          {isAuthenticated ? (
            <>
              <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-white bg-[#3d3b38] rounded hover:bg-[#262421] transition shadow">
                Log Out
              </button>
            </>
          ) : (
            <Link href="/login" className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 transition shadow">
              Sign Up / Log In
            </Link>
          )}
        </div>
      </div>

      <div className="w-full max-w-7xl flex-1 flex justify-center items-start">
        <GameBoard />
      </div>
    </main>
  );
}