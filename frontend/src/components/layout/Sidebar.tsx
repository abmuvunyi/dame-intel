'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    router.push('/');
  };

  return (
    <div className="w-16 md:w-48 bg-[#262421] h-screen flex flex-col justify-between py-4 shadow-xl text-gray-300">
      <div className="flex flex-col space-y-2 px-2 md:px-4">
        <div className="mb-6 px-2 flex justify-center md:justify-start">
          <span className="text-xl md:text-2xl font-bold text-white tracking-tight hidden md:block">Draughts</span>
          <span className="text-xl font-bold text-white tracking-tight md:hidden">D</span>
        </div>

        <Link href="/" className="flex items-center space-x-3 p-2 rounded hover:bg-white/10 transition">
          <span className="text-xl">♟️</span>
          <span className="hidden md:block font-semibold">Play</span>
        </Link>
        <Link href="/puzzles" className="flex items-center space-x-3 p-2 rounded hover:bg-white/10 transition">
          <span className="text-xl">🧩</span>
          <span className="hidden md:block font-semibold">Puzzles</span>
        </Link>
        <Link href="/tournaments" className="flex items-center space-x-3 p-2 rounded hover:bg-white/10 transition">
          <span className="text-xl">🏆</span>
          <span className="hidden md:block font-semibold">Tournaments</span>
        </Link>
      </div>

      <div className="flex flex-col space-y-2 px-2 md:px-4">
        {isAuthenticated ? (
          <>
            <Link href="/profile" className="flex items-center space-x-3 p-2 rounded hover:bg-white/10 transition">
              <span className="text-xl">👤</span>
              <span className="hidden md:block font-semibold">Profile</span>
            </Link>
            <button onClick={handleLogout} className="flex items-center space-x-3 p-2 rounded hover:bg-white/10 transition text-left w-full">
              <span className="text-xl">🚪</span>
              <span className="hidden md:block font-semibold">Logout</span>
            </button>
          </>
        ) : (
          <Link href="/login" className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white p-2 rounded font-bold transition">
             <span className="hidden md:block">Sign Up / Login</span>
             <span className="md:hidden">🔑</span>
          </Link>
        )}
      </div>
    </div>
  );
}
