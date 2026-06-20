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
    <div className="w-64 h-full bg-[#262421] text-gray-300 flex flex-col justify-between border-r border-[#3c3a38]">
      <div>
        <div className="p-6">
          <Link href="/">
            <h1 className="text-2xl font-extrabold text-white tracking-tight cursor-pointer">
              Draughts.com
            </h1>
          </Link>
        </div>

        <nav className="flex flex-col space-y-2 px-4 mt-4">
          <Link href="/" className="px-4 py-3 rounded-md hover:bg-[#3c3a38] hover:text-white transition font-bold flex items-center gap-3">
             <span className="text-xl">♙</span> Play
          </Link>
          <Link href="/puzzles" className="px-4 py-3 rounded-md hover:bg-[#3c3a38] hover:text-white transition font-bold flex items-center gap-3">
            <span className="text-xl">🎯</span> Puzzles
          </Link>
          <Link href="/tournaments" className="px-4 py-3 rounded-md hover:bg-[#3c3a38] hover:text-white transition font-bold flex items-center gap-3">
             <span className="text-xl">🏆</span> Tournaments
          </Link>
          {isAuthenticated && (
            <Link href="/profile" className="px-4 py-3 rounded-md hover:bg-[#3c3a38] hover:text-white transition font-bold flex items-center gap-3">
              <span className="text-xl">👤</span> Profile
            </Link>
          )}
        </nav>
      </div>

      <div className="p-4 border-t border-[#3c3a38]">
        {isAuthenticated ? (
          <button onClick={handleLogout} className="w-full py-3 bg-[#3c3a38] hover:bg-[#4a4744] text-white font-bold rounded-md transition shadow flex items-center justify-center gap-2">
             Log Out
          </button>
        ) : (
          <Link href="/login" className="block w-full py-3 bg-[#81b64c] hover:bg-[#8cc453] text-white text-center font-bold rounded-md transition shadow">
             Sign Up / Log In
          </Link>
        )}
      </div>
    </div>
  );
}