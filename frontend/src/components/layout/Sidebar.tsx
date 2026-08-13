'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Play, Trophy, Users, Puzzle, User, Settings, LogOut, Info } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Play', icon: <Play size={24} />, href: '/' },
    { name: 'Puzzles', icon: <Puzzle size={24} />, href: '/puzzles' },
    { name: 'Learn', icon: <Info size={24} />, href: '#' },
    { name: 'Watch', icon: <Home size={24} />, href: '/watch' },
    { name: 'Tournaments', icon: <Trophy size={24} />, href: '/tournaments' },
    { name: 'Rankings', icon: <Users size={24} />, href: '/rankings' },
    { name: 'Profile', icon: <User size={24} />, href: '/profile' },
  ];

  return (
    <div className="w-[80px] lg:w-[150px] bg-[#262421] text-[#989795] flex flex-col items-center lg:items-start h-screen sticky top-0 border-r border-[#3a3835]">
      {/* Logo Area */}
      <div className="py-4 w-full flex justify-center lg:justify-start lg:pl-6 cursor-pointer">
        <Link href="/">
          <div className="text-[#81b64c] text-3xl font-extrabold flex items-center gap-2">
            <span className="lg:hidden text-2xl">D</span>
            <span className="hidden lg:block text-2xl">Draughts</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 w-full flex flex-col gap-2 mt-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col lg:flex-row items-center lg:justify-start gap-2 py-3 px-0 lg:px-6 w-full cursor-pointer transition-colors duration-200
                ${isActive ? 'bg-[#312e2b] text-white border-l-4 border-[#81b64c]' : 'hover:bg-[#312e2b] hover:text-white border-l-4 border-transparent'}
              `}
            >
              <div className={isActive ? 'text-[#81b64c]' : ''}>{item.icon}</div>
              <span className="text-[10px] lg:text-[15px] font-bold mt-1 lg:mt-0">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="w-full mb-4 flex flex-col gap-2">
         <div className="flex flex-col lg:flex-row items-center lg:justify-start gap-2 py-3 px-0 lg:px-6 w-full cursor-pointer hover:bg-[#312e2b] hover:text-white transition-colors duration-200">
           <Settings size={24} />
           <span className="hidden lg:block text-[15px] font-bold">Settings</span>
         </div>
      </div>
    </div>
  );
}
