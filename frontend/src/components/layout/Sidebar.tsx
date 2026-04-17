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
  }, [pathname]); // Re-check on navigation

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    router.push('/');
  };

  const navItems = [
    { name: 'Play', path: '/', icon: '♙' },
    { name: 'Puzzles', path: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', path: '/tournaments', icon: '🏆' },
    { name: 'Profile', path: '/profile', icon: '👤' },
  ];

  return (
    <aside className="w-20 md:w-48 bg-slate-900 text-slate-300 flex flex-col items-center md:items-start h-full shadow-xl z-10 transition-all duration-300">
      <div className="p-4 md:p-6 w-full flex justify-center md:justify-start items-center space-x-2 border-b border-slate-800">
        <span className="text-2xl font-bold text-amber-500">D</span>
        <span className="hidden md:inline text-xl font-bold text-white tracking-tight">Draughts</span>
      </div>

      <nav className="flex-1 w-full py-6 space-y-2 flex flex-col px-2 md:px-4">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.name}
              href={item.path}
              className={`flex items-center space-x-3 w-full p-3 rounded-lg transition-colors group
                ${isActive ? 'bg-slate-800 text-white shadow-inner' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <span className={`text-xl ${isActive ? 'text-amber-500' : 'text-slate-400 group-hover:text-amber-500 transition-colors'}`}>
                {item.icon}
              </span>
              <span className="hidden md:block font-medium">
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="w-full p-4 border-t border-slate-800 flex flex-col gap-2">
         {isAuthenticated ? (
           <button
             onClick={handleLogout}
             className="flex items-center justify-center md:justify-start space-x-3 w-full p-3 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
           >
             <span className="text-xl">🚪</span>
             <span className="hidden md:block font-medium text-sm">Log Out</span>
           </button>
         ) : (
           <Link
             href="/login"
             className="flex items-center justify-center md:justify-start space-x-3 w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
           >
             <span className="text-xl">🔐</span>
             <span className="hidden md:block font-medium text-sm">Log In</span>
           </Link>
         )}
      </div>
    </aside>
  );
}
