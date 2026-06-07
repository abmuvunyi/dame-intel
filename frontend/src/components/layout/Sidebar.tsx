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
    router.push('/');
  };

  const navItems = [
    { name: 'Play', path: '/' },
    { name: 'Puzzles', path: '/puzzles' },
    { name: 'Tournaments', path: '/tournaments' },
    { name: 'Profile', path: '/profile' },
  ];

  return (
    <div className="w-64 bg-[#262522] h-screen flex flex-col justify-between border-r border-[#3c3a37] text-[#c3c3c2] flex-shrink-0 sticky top-0">
      <div>
        <div className="p-6">
          <Link href="/">
            <h1 className="text-2xl font-extrabold text-white tracking-tight cursor-pointer">
              Draughts.com
            </h1>
          </Link>
        </div>

        <nav className="flex flex-col mt-4 space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/' && pathname?.startsWith(item.path));
            return (
              <Link
                key={item.name}
                href={item.path}
                className={`px-4 py-3 rounded-lg font-bold text-lg transition-colors flex items-center ${
                  isActive
                    ? 'bg-[#43413d] text-white'
                    : 'hover:bg-[#3c3a37] hover:text-white'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-[#3c3a37]">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full px-4 py-3 rounded-lg font-bold text-lg text-left transition-colors hover:bg-[#3c3a37] hover:text-white"
          >
            Log Out
          </button>
        ) : (
          <Link
            href="/login"
            className="block w-full px-4 py-3 rounded-lg font-bold text-lg text-left transition-colors hover:bg-[#3c3a37] hover:text-white"
          >
            Sign Up / Log In
          </Link>
        )}
      </div>
    </div>
  );
}
