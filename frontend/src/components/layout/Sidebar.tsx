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
    window.location.reload();
  };

  const navItems = [
    { name: 'Play', href: '/', icon: '♟️' },
    { name: 'Puzzles', href: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', href: '/tournaments', icon: '🏆' },
    { name: 'Profile', href: '/profile', icon: '👤', reqAuth: true },
  ];

  return (
    <aside className="w-64 bg-[#262421] text-white flex flex-col h-screen sticky top-0 border-r border-[#3c3a38]">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-2xl font-black tracking-tighter text-white">Draughts.com</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => {
          if (item.reqAuth && !isAuthenticated) return null;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg text-lg font-semibold transition-colors duration-200 ${
                isActive ? 'bg-[#3c3a38] text-white' : 'text-[#c3c2c1] hover:bg-[#3c3a38] hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#3c3a38]">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-3 text-lg font-semibold text-[#c3c2c1] hover:bg-[#3c3a38] hover:text-white rounded-lg transition-colors"
          >
            <span className="text-xl">🚪</span>
            Log Out
          </button>
        ) : (
          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#81b64c] hover:bg-[#95c95e] text-white text-lg font-bold rounded-lg transition-colors shadow-lg shadow-[#81b64c]/20"
          >
            Sign In
          </Link>
        )}
      </div>
    </aside>
  );
}
