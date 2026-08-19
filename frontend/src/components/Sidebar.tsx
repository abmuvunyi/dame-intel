'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Play, Puzzle, Trophy, Users, User, Settings, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem('token'));
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    window.location.href = '/';
  };

  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Play', href: '/', icon: Play },
    { name: 'Puzzles', href: '/puzzles', icon: Puzzle },
    { name: 'Tournaments', href: '/tournaments', icon: Trophy },
    { name: 'Clubs', href: '/clubs', icon: Users },
  ];

  return (
    <div className="w-64 bg-[#262421] h-screen flex flex-col justify-between fixed left-0 top-0 border-r border-[#3c3a38] z-50 overflow-y-auto">
      <div>
        <div className="p-6">
          <Link href="/" className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span className="text-[#739552]">Online</span>Draughts
          </Link>
        </div>
        <nav className="mt-2 flex flex-col gap-1 px-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg font-bold text-[15px] transition-colors ${
                  isActive ? 'bg-[#3c3a38] text-white' : 'text-[#c3c3c2] hover:bg-[#33312e] hover:text-white'
                }`}
              >
                <Icon size={22} strokeWidth={2.5} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-[#3c3a38] flex flex-col gap-2">
        {isAuthenticated ? (
          <>
            <Link href="/profile" className="flex items-center gap-4 px-4 py-3 rounded-lg font-bold text-[#c3c3c2] hover:bg-[#33312e] hover:text-white transition-colors text-[15px]">
              <User size={22} strokeWidth={2.5} />
              Profile
            </Link>
            <button onClick={handleLogout} className="flex items-center gap-4 px-4 py-3 rounded-lg font-bold text-[#c3c3c2] hover:bg-[#33312e] hover:text-white transition-colors text-[15px] w-full text-left">
              <LogOut size={22} strokeWidth={2.5} />
              Log Out
            </button>
          </>
        ) : (
          <Link href="/login" className="flex items-center justify-center gap-2 px-4 py-3 bg-[#739552] hover:bg-[#81a55d] text-white rounded-lg font-bold text-[15px] transition-colors shadow-md shadow-[#00000040]">
            Sign Up / Login
          </Link>
        )}
      </div>
    </div>
  );
}
