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
    router.push('/login');
  };

  const navItems = [
    { name: 'Play', href: '/' },
    { name: 'Puzzles', href: '/puzzles', requireAuth: true },
    { name: 'Tournaments', href: '/tournaments', requireAuth: true },
    { name: 'Profile', href: '/profile', requireAuth: true },
  ];

  return (
    <div className="w-64 h-screen bg-[#262421] text-gray-300 flex flex-col shadow-2xl border-r border-[#3d3b39]">
      <div className="p-6">
        <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#81b64c] to-[#a3d160] tracking-tight">
          Online Draughts
        </h1>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          if (item.requireAuth && !isAuthenticated) return null;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`block px-4 py-3 rounded-md text-sm font-semibold transition ${
                isActive
                  ? 'bg-[#81b64c] text-white shadow-md'
                  : 'hover:bg-[#3d3b39] hover:text-white'
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-[#3d3b39]">
        {isAuthenticated ? (
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-sm font-medium bg-[#3d3b39] hover:bg-[#4d4b49] text-gray-300 rounded shadow-sm transition"
          >
            Log Out
          </button>
        ) : (
          <Link href="/login" className="block text-center w-full px-4 py-2 text-sm font-medium bg-[#81b64c] hover:bg-[#a3d160] text-white rounded shadow-sm transition">
            Login / Register
          </Link>
        )}
      </div>
    </div>
  );
}
