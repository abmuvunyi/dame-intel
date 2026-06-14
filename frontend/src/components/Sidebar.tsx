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
    { name: 'Play', href: '/', icon: '♙' },
    { name: 'Puzzles', href: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', href: '/tournaments', icon: '🏆' },
    { name: 'Profile', href: '/profile', icon: '👤' },
  ];

  return (
    <div className="w-64 bg-[#262421] text-[#c3c3c2] flex flex-col h-screen fixed left-0 top-0 border-r border-[#3e3b38]">
      <div className="p-6">
        <Link href="/" className="text-2xl font-bold text-white flex items-center gap-2">
          <span className="text-green-500 text-3xl">♙</span> Online Draughts
        </Link>
      </div>

      <nav className="flex-1 mt-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-4 px-6 py-3 text-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-[#3e3b38] text-white border-l-4 border-green-500'
                      : 'hover:bg-[#3e3b38] hover:text-white border-l-4 border-transparent'
                  }`}
                >
                  <span className="text-xl w-6 text-center">{item.icon}</span>
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-[#3e3b38]">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-2 text-md font-medium text-[#c3c3c2] hover:text-white hover:bg-[#3e3b38] rounded transition"
          >
            <span className="text-xl w-6 text-center">⎋</span>
            Log Out
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <Link
              href="/login"
              className="w-full text-center py-2 px-4 bg-[#41403e] hover:bg-[#52504e] text-white rounded font-medium transition"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="w-full text-center py-2 px-4 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition"
            >
              Log In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}