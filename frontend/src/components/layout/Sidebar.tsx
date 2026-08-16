'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Play, Trophy, Swords, Puzzle, Users, User, LogOut, Menu, X } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // For mobile layout

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    window.location.href = '/';
  };

  const navItems = [
    { href: '/', label: 'Play', icon: <Play size={20} /> },
    { href: '/puzzles', label: 'Puzzles', icon: <Puzzle size={20} /> },
    { href: '/tournaments', label: 'Tournaments', icon: <Trophy size={20} /> },
    { href: '/watch', label: 'Watch', icon: <Swords size={20} /> },
    { href: '/clubs', label: 'Clubs', icon: <Users size={20} /> },
    { href: '/rankings', label: 'Rankings', icon: <Users size={20} /> }, // Can change icon
  ];

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-[#262421] text-[#b3b3b2] rounded"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar Container */}
      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#262421] text-[#b3b3b2] transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        {/* Logo Area */}
        <div className="p-6">
          <Link href="/" onClick={() => setIsOpen(false)} className="flex items-center gap-2">
            <span className="text-2xl font-black text-white tracking-tight">Draughts<span className="text-[#81b64c]">.com</span></span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg font-bold transition-colors ${
                  isActive
                    ? 'bg-[#3c3934] text-white'
                    : 'hover:bg-[#3c3934] hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Area (Auth/Profile) */}
        <div className="p-4 border-t border-[#3c3934]">
          {isAuthenticated ? (
            <div className="space-y-2">
              <Link
                href="/profile"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg font-bold transition-colors ${
                  pathname === '/profile' ? 'bg-[#3c3934] text-white' : 'hover:bg-[#3c3934] hover:text-white'
                }`}
              >
                <User size={20} />
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-lg font-bold transition-colors hover:bg-[#3c3934] hover:text-white text-left"
              >
                <LogOut size={20} />
                Log Out
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#4b4847] hover:bg-[#5c5957] text-white rounded-lg font-bold transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#81b64c] hover:bg-[#a3d160] text-white rounded-lg font-bold transition-colors shadow-[0_4px_0_rgba(0,0,0,0.2)]"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
