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
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    window.location.href = '/';
  };

  const navItems = [
    { name: 'Play', href: '/', icon: '♟️' },
    { name: 'Puzzles', href: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', href: '/tournaments', icon: '🏆' },
    ...(isAuthenticated ? [{ name: 'Profile', href: '/profile', icon: '👤' }] : []),
  ];

  return (
    <div className="w-16 md:w-48 bg-[#272522] flex flex-col h-screen py-4 shrink-0 shadow-lg">
      <div className="mb-8 px-2 md:px-4 hidden md:block">
        <h2 className="text-xl font-black text-white italic tracking-tight flex items-center gap-2">
          <span>Draughts.com</span>
        </h2>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors font-bold text-sm md:text-base ${
                isActive
                  ? 'bg-[#43403c] text-white'
                  : 'text-[#c3c3c2] hover:bg-[#34322f] hover:text-white'
              }`}
            >
              <span className="text-xl md:text-lg">{item.icon}</span>
              <span className="hidden md:inline">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-2 mt-auto">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-2.5 rounded-lg text-[#c3c3c2] hover:bg-[#34322f] hover:text-white transition-colors font-bold text-sm md:text-base"
          >
            <span className="text-xl md:text-lg">🚪</span>
            <span className="hidden md:inline">Log Out</span>
          </button>
        ) : (
          <Link
            href="/login"
            className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-2.5 rounded-lg bg-[#81b64c] hover:bg-[#95c562] text-white transition-colors font-bold text-sm md:text-base shadow-[0_3px_0_0_#537e2b] mb-1"
          >
            <span className="text-xl md:text-lg">🔑</span>
            <span className="hidden md:inline">Log In</span>
          </Link>
        )}
      </div>
    </div>
  );
}
