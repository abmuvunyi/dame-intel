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
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    router.push('/login');
  };

  const navItems = [
    { name: 'Play', href: '/', icon: '♟️' },
    { name: 'Puzzles', href: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', href: '/tournaments', icon: '🏆' },
    { name: 'Profile', href: '/profile', icon: '👤' },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen flex flex-col p-4 fixed left-0 top-0 bottom-0 shadow-xl z-10">
      <div className="flex items-center space-x-3 mb-8 px-2 mt-4">
        <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center font-bold text-lg">
          OD
        </div>
        <h1 className="text-xl font-bold tracking-wider">Draughts.com</h1>
      </div>

      <nav className="flex-1 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-green-600 text-white shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-semibold">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="pt-8 mt-auto border-t border-slate-800 space-y-4">
        {!isAuthenticated ? (
          <Link
            href="/login"
            className="w-full block text-center bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Login / Sign Up
          </Link>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full text-center bg-transparent border border-slate-600 hover:bg-slate-800 text-slate-300 font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Log Out
          </button>
        )}
      </div>
    </div>
  );
}