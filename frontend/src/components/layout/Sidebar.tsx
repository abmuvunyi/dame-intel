'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Gamepad2,
  Puzzle,
  Trophy,
  Users,
  Settings,
  LogOut,
  User,
  ShieldAlert,
  Menu,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem('token'));
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  const navItems = [
    { name: 'Play', href: '/', icon: Gamepad2 },
    { name: 'Puzzles', href: '/puzzles', icon: Puzzle },
    { name: 'Tournaments', href: '/tournaments', icon: Trophy },
    { name: 'Watch', href: '/watch', icon: Users },
    { name: 'Clubs', href: '/clubs', icon: Users },
  ];

  return (
    <>
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-[#262421] text-[#989795] rounded hover:text-white transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <div className={`
        fixed top-0 left-0 h-full w-40 bg-[#262421] text-[#989795]
        flex flex-col border-r border-[#3c3a38] z-40 transition-transform duration-300
        md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-4 flex items-center justify-center mb-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-br from-[#739552] to-[#86a865] group-hover:from-white group-hover:to-gray-300 transition-all">
              Draughts.com
            </div>
          </Link>
        </div>

        <nav className="flex-1 flex flex-col gap-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded font-bold transition-colors
                  ${isActive ? 'bg-[#3c3a38] text-white' : 'hover:bg-[#32302e] hover:text-white'}
                `}
                onClick={() => setIsOpen(false)}
              >
                <Icon size={20} className={isActive ? 'text-[#739552]' : ''} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-[#3c3a38]">
          {isAuthenticated ? (
            <div className="flex flex-col gap-1">
              <Link
                href="/profile"
                className={`
                  flex items-center gap-3 px-3 py-2 rounded font-bold transition-colors
                  ${pathname.startsWith('/profile') ? 'bg-[#3c3a38] text-white' : 'hover:bg-[#32302e] hover:text-white'}
                `}
                onClick={() => setIsOpen(false)}
              >
                <User size={20} />
                <span>Profile</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2 rounded font-bold hover:bg-[#32302e] hover:text-white transition-colors text-left"
              >
                <LogOut size={20} />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-3 px-3 py-2 rounded font-bold bg-[#739552] text-white hover:bg-[#86a865] transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <LogOut size={20} className="rotate-180" />
              <span>Sign Up / Log In</span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
