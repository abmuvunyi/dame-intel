'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, [pathname]); // Re-check on route change

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    router.push('/login');
  };

  return (
    <div className="w-64 bg-[#262421] text-white flex flex-col h-screen fixed left-0 top-0 shadow-xl z-50">
      <div className="p-6">
        <Link href="/" className="flex items-center space-x-2">
          {/* A simple placeholder logo, like chess.com pawn */}
          <div className="w-8 h-8 bg-green-500 rounded-sm flex items-center justify-center font-bold text-xl">D</div>
          <span className="text-2xl font-bold text-white tracking-tight">Draughts.com</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        <Link href="/" className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${pathname === '/' ? 'bg-[#3c3934]' : 'hover:bg-[#3c3934]'}`}>
          <span className="text-lg">🎮</span>
          <span className="font-semibold">Play</span>
        </Link>
        <Link href="/puzzles" className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${pathname === '/puzzles' ? 'bg-[#3c3934]' : 'hover:bg-[#3c3934]'}`}>
          <span className="text-lg">🧩</span>
          <span className="font-semibold">Puzzles</span>
        </Link>
        <Link href="/tournaments" className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${pathname === '/tournaments' ? 'bg-[#3c3934]' : 'hover:bg-[#3c3934]'}`}>
          <span className="text-lg">🏆</span>
          <span className="font-semibold">Tournaments</span>
        </Link>
        {isAuthenticated && (
            <Link href="/profile" className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${pathname === '/profile' ? 'bg-[#3c3934]' : 'hover:bg-[#3c3934]'}`}>
            <span className="text-lg">👤</span>
            <span className="font-semibold">Profile</span>
            </Link>
        )}
      </nav>

      <div className="p-4 mb-4">
        {isAuthenticated ? (
          <button onClick={handleLogout} className="w-full py-3 bg-[#3c3934] text-gray-300 font-semibold rounded-lg hover:bg-red-800 transition shadow">
            Log Out
          </button>
        ) : (
          <Link href="/login" className="w-full py-3 bg-[#769656] text-white text-center font-bold rounded-lg hover:bg-[#86a666] transition shadow block">
            Sign Up / Log In
          </Link>
        )}
      </div>
    </div>
  );
}
