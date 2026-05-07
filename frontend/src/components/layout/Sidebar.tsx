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
  };

  const navLinks = [
    { name: 'Play', href: '/' },
    { name: 'Puzzles', href: '/puzzles' },
    { name: 'Tournaments', href: '/tournaments' },
    { name: 'Profile', href: '/profile', authRequired: true },
  ];

  return (
    <aside className="w-64 bg-[#262421] text-[#989795] flex flex-col h-screen fixed left-0 top-0 border-r border-[#3c3b39]">
      <div className="p-6">
        <Link href="/" className="text-2xl font-extrabold text-white tracking-tight flex items-center space-x-2">
          <span>Draughts.com</span>
        </Link>
      </div>

      <nav className="flex-1 mt-6">
        <ul className="space-y-1">
          {navLinks.map((link) => {
            if (link.authRequired && !isAuthenticated) return null;

            const isActive = pathname === link.href;
            return (
              <li key={link.name}>
                <Link
                  href={link.href}
                  className={`flex items-center px-6 py-3 text-lg font-bold transition-colors ${
                    isActive
                      ? 'bg-[#3c3b39] text-white border-l-4 border-green-500'
                      : 'hover:bg-[#3c3b39] hover:text-white border-l-4 border-transparent'
                  }`}
                >
                  {link.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-6">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full py-3 px-4 bg-[#3c3b39] text-white font-bold rounded hover:bg-[#4c4b49] transition text-center"
          >
            Log Out
          </button>
        ) : (
          <Link
            href="/login"
            className="w-full py-3 px-4 bg-green-600 text-white font-bold rounded hover:bg-green-700 transition block text-center shadow-[0_4px_0_rgba(21,128,61,1)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(21,128,61,1)]"
          >
            Log In
          </Link>
        )}
      </div>
    </aside>
  );
}
