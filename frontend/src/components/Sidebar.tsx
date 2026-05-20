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
  ];

  if (isAuthenticated) {
    navLinks.push({ name: 'Profile', href: '/profile' });
  }

  return (
    <div className="bg-[#262522] text-white w-64 min-h-screen flex flex-col py-6 shadow-xl border-r border-[#3e3e3c]">
      <div className="flex items-center justify-center mb-10">
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400 tracking-tight">
          Online Draughts
        </h2>
      </div>

      <nav className="flex-1 flex flex-col gap-2 px-4">
        {navLinks.map((link) => (
          <Link
            key={link.name}
            href={link.href}
            className={`px-4 py-3 rounded-lg text-lg font-semibold transition-colors ${
              pathname === link.href ? 'bg-[#3b3a38]' : 'hover:bg-[#32312f]'
            }`}
          >
            {link.name}
          </Link>
        ))}
      </nav>

      <div className="px-4 mt-auto">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 rounded-lg text-lg font-semibold text-gray-300 hover:text-white hover:bg-[#32312f] transition-colors"
          >
            Log Out
          </button>
        ) : (
          <Link
            href="/login"
            className="block text-center px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-bold shadow transition"
          >
            Sign Up / Login
          </Link>
        )}
      </div>
    </div>
  );
}
