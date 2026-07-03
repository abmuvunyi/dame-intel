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
    <aside className="w-64 min-h-screen bg-[#262421] text-gray-300 flex flex-col shadow-2xl border-r border-[#3c3a37]">
      <div className="p-6">
        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <span className="text-green-500 text-3xl">♟</span> Draughts
        </h2>
      </div>

      <nav className="flex-1 mt-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3 rounded-md transition font-bold text-[15px] ${
                  pathname === item.href
                    ? 'bg-[#3c3a37] text-white'
                    : 'hover:bg-[#3c3a37] hover:text-white'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-[#3c3a37] mb-4">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 text-sm font-semibold rounded-md hover:bg-[#3c3a37] hover:text-white transition flex items-center gap-4"
          >
             <span className="text-xl">🚪</span> Log Out
          </button>
        ) : (
          <Link
            href="/login"
            className="w-full block text-center bg-[#81b64c] hover:bg-[#8cc254] text-white font-bold py-3 rounded-lg shadow-lg transition"
          >
            Sign In
          </Link>
        )}
      </div>
    </aside>
  );
}
