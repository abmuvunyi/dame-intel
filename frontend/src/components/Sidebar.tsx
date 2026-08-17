'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Play,
  Puzzle,
  Trophy,
  Eye,
  Users,
  User,
  LogOut
} from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem('token'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    router.push('/login');
  };

  const navItems = [
    { name: 'Play', href: '/', icon: Play },
    { name: 'Puzzles', href: '/puzzles', icon: Puzzle },
    { name: 'Tournaments', href: '/tournaments', icon: Trophy },
    { name: 'Watch', href: '/watch', icon: Eye },
    { name: 'Clubs', href: '/clubs', icon: Users },
  ];

  return (
    <div className="flex flex-col h-screen w-40 bg-[#262421] text-gray-300 fixed left-0 top-0 py-4 shadow-xl z-50">
      <div className="flex justify-center mb-8 px-4">
        <h1 className="text-xl font-bold text-white whitespace-nowrap text-center">Draughts</h1>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive
                  ? 'bg-[#373531] text-white font-medium shadow-sm'
                  : 'hover:bg-[#373531] hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-2 mt-auto flex flex-col gap-1 border-t border-[#373531] pt-4">
        {isAuthenticated ? (
          <>
            <Link
              href="/profile"
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                pathname === '/profile'
                  ? 'bg-[#373531] text-white font-medium shadow-sm'
                  : 'hover:bg-[#373531] hover:text-white'
              }`}
            >
              <User className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Profile</span>
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-[#373531] hover:text-red-400 text-left"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Log out</span>
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              pathname === '/login'
                ? 'bg-[#373531] text-white font-medium shadow-sm'
                : 'hover:bg-[#373531] hover:text-white'
            }`}
          >
            <User className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">Log in</span>
          </Link>
        )}
      </div>
    </div>
  );
}
