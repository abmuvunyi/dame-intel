'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    window.location.href = '/';
  };

  const navItems = [
    { name: 'Play', path: '/' },
    { name: 'Puzzles', path: '/puzzles' },
    { name: 'Tournaments', path: '/tournaments' },
    { name: 'Profile', path: '/profile' },
  ];

  return (
    <div className="w-64 h-screen bg-[#262421] text-[#989795] flex flex-col border-r border-[#403d39] shrink-0 sticky top-0">
      <div className="p-6">
        <Link href="/" className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-[#81b64c]">
             <path d="M4 18v2h16v-2H4zm1.4-8L3 16h18l-2.4-6-4.6 2.5L12 5l-2 7.5L5.4 10z"/>
           </svg>
           Draughts
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.name}
              href={item.path}
              className={`block px-4 py-3 rounded text-lg font-bold transition-colors duration-150 ${
                isActive
                  ? 'bg-[#3c3935] text-white shadow-sm'
                  : 'hover:bg-[#3c3935] hover:text-white'
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#403d39] mb-4">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 rounded text-lg font-bold hover:bg-[#3c3935] hover:text-white transition-colors duration-150"
          >
            Log Out
          </button>
        ) : (
          <Link
            href="/login"
            className="block w-full text-center px-4 py-3 bg-[#81b64c] hover:bg-[#95c961] text-white rounded text-lg font-bold transition shadow"
          >
            Log In / Sign Up
          </Link>
        )}
      </div>
    </div>
  );
}
