'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem('token'));
  }, [pathname]);

  const navItems = [
    { name: 'Play', href: '/', icon: '♟️' },
    { name: 'Puzzles', href: '/puzzles', icon: '🧩' },
    { name: 'Rankings', href: '/rankings', icon: '🏆' },
    { name: 'Tournaments', href: '/tournaments', icon: '⚔️' },
    { name: 'Profile', href: '/profile', icon: '👤' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-20 md:w-32 bg-[#262421] text-[#bababa] flex flex-col items-center py-4 z-50 border-r border-[#312e2b]">
      <div className="mb-8">
         <Link href="/">
           <div className="w-12 h-12 bg-amber-600 rounded-lg flex items-center justify-center text-2xl font-black text-white shadow-lg">
             D
           </div>
         </Link>
      </div>

      <nav className="flex-1 w-full flex flex-col items-center gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                w-full flex flex-col items-center py-3 px-1 transition-colors
                ${isActive ? 'bg-[#312e2b] text-white border-l-4 border-amber-600' : 'hover:bg-[#2b2926] hover:text-white'}
              `}
            >
              <span className="text-2xl mb-1">{item.icon}</span>
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-tighter">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto w-full flex flex-col items-center gap-4 pb-4">
        {!isAuthenticated ? (
          <Link href="/login" className="w-full flex flex-col items-center py-3 hover:bg-[#2b2926] transition-colors">
            <span className="text-xl mb-1">🔑</span>
            <span className="text-[10px] font-bold uppercase">Login</span>
          </Link>
        ) : (
          <button
            onClick={() => {
              localStorage.removeItem('token');
              window.location.href = '/login';
            }}
            className="w-full flex flex-col items-center py-3 hover:bg-[#2b2926] transition-colors"
          >
            <span className="text-xl mb-1">🚪</span>
            <span className="text-[10px] font-bold uppercase">Logout</span>
          </button>
        )}
      </div>
    </aside>
  );
}
