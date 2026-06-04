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
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    router.push('/');
  };

  const navItems = [
    { name: 'Play', href: '/', icon: '♟️' },
    { name: 'Puzzles', href: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', href: '/tournaments', icon: '🏆' },
    { name: 'Profile', href: '/profile', icon: '👤' },
  ];

  return (
    <div className="w-64 h-screen bg-[#302e2b] text-white flex flex-col fixed left-0 top-0 overflow-y-auto z-50">
      <div className="p-6">
        <Link href="/" className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 tracking-tight block mb-8">
          Draughts.com
        </Link>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                  isActive
                    ? 'bg-[#4c4a48] text-white'
                    : 'text-gray-300 hover:bg-[#3c3a38] hover:text-white'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-6 space-y-4">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-[#4c4a48] hover:bg-[#5c5a58] text-white rounded font-semibold transition"
          >
            <span>Log Out</span>
          </button>
        ) : (
          <>
            <Link
              href="/login"
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-[#81b64c] hover:bg-[#8fd053] text-white rounded-lg font-bold transition shadow-lg"
            >
              <span>Sign Up</span>
            </Link>
            <Link
              href="/login"
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-[#4c4a48] hover:bg-[#5c5a58] text-white rounded-lg font-bold transition shadow"
            >
              <span>Log In</span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
