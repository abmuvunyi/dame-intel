'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    router.push('/');
  };

  const navItems = [
    { name: 'Play', path: '/', icon: '♟️' },
    { name: 'Puzzles', path: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', path: '/tournaments', icon: '🏆' },
    { name: 'Profile', path: '/profile', icon: '👤', reqAuth: true },
  ];

  return (
    <div className="w-16 md:w-48 lg:w-56 bg-[#262421] h-full flex flex-col border-r border-[#3d3a36] shadow-xl z-10 transition-all duration-300">
      <div className="flex items-center justify-center h-16 border-b border-[#3d3a36]">
        <Link href="/" className="text-xl md:text-2xl font-bold text-amber-500 hover:text-amber-400 transition-colors hidden md:block">
          Draughts.io
        </Link>
        <Link href="/" className="text-2xl font-bold text-amber-500 hover:text-amber-400 transition-colors md:hidden">
          D
        </Link>
      </div>

      <nav className="flex-1 py-4 flex flex-col gap-2 px-2 md:px-4">
        {navItems.map((item) => {
          if (item.reqAuth && !isAuthenticated) return null;
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.name}
              href={item.path}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg font-semibold transition-all group ${
                isActive
                  ? 'bg-[#3d3a36] text-white shadow-inner'
                  : 'text-[#c3c3c0] hover:bg-[#3d3a36] hover:text-white'
              }`}
            >
              <span className="text-xl md:text-2xl drop-shadow-sm group-hover:scale-110 transition-transform">{item.icon}</span>
              <span className="hidden md:block tracking-wide">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-2 md:p-4 border-t border-[#3d3a36] mt-auto">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#3d3a36] hover:bg-[#4d4944] text-[#c3c3c0] hover:text-white rounded-lg font-semibold transition-colors"
          >
            <span className="hidden md:block">Log Out</span>
            <span className="md:hidden">🚪</span>
          </button>
        ) : (
          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 text-white shadow-md hover:shadow-lg rounded-lg font-bold transition-all"
          >
            <span className="hidden md:block">Log In / Register</span>
            <span className="md:hidden">🔑</span>
          </Link>
        )}
      </div>
    </div>
  );
}
