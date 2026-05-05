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
    { name: 'Play', path: '/', icon: '♙' },
    { name: 'Puzzles', path: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', path: '/tournaments', icon: '🏆' },
    { name: 'Profile', path: '/profile', icon: '👤' },
  ];

  return (
    <div className="w-40 md:w-56 h-screen bg-[#262421] text-[#c3c2c1] flex flex-col fixed left-0 top-0 border-r border-[#312e2b] z-50">
      <div className="p-4 flex items-center justify-center border-b border-[#312e2b]">
        <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">Draughts.com</h1>
      </div>

      <nav className="flex-1 py-4 flex flex-col space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.name}
              href={item.path}
              className={`flex items-center space-x-3 px-6 py-3 transition-colors duration-150 ${
                isActive
                  ? 'bg-[#312e2b] text-white border-l-4 border-[#7fa650]'
                  : 'hover:bg-[#312e2b] hover:text-white border-l-4 border-transparent'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-bold text-sm md:text-base">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#312e2b]">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-[#312e2b] hover:bg-[#3c3935] text-white rounded font-semibold transition"
          >
            <span>Log Out</span>
          </button>
        ) : (
          <div className="flex flex-col space-y-2">
            <Link
              href="/login"
              className="w-full text-center px-4 py-2 bg-[#7fa650] hover:bg-[#8cb758] text-white rounded font-bold shadow-lg transition"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="w-full text-center px-4 py-2 bg-[#312e2b] hover:bg-[#3c3935] text-white rounded font-bold transition"
            >
              Log In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
