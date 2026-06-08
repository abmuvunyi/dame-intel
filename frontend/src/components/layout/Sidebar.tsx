'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Play', href: '/', icon: '♟️' },
    { name: 'Puzzles', href: '/puzzles', icon: '🧩' },
    { name: 'Tournaments', href: '/tournaments', icon: '🏆' },
    { name: 'Profile', href: '/profile', icon: '👤' },
  ];

  return (
    <div className="w-16 md:w-48 bg-[#262421] text-gray-300 flex flex-col h-screen fixed left-0 top-0 overflow-y-auto z-10 border-r border-[#3c3a37]">
      <div className="p-4 hidden md:block">
        <h2 className="text-xl font-bold text-white tracking-tight">Draughts.com</h2>
      </div>
      <nav className="flex-1 mt-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center p-4 hover:bg-[#322e2b] transition-colors ${
                isActive ? 'bg-[#322e2b] border-l-4 border-[#769656] text-white' : 'border-l-4 border-transparent'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="ml-3 hidden md:block font-semibold">{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-[#3c3a37]">
        <button className="flex items-center text-gray-400 hover:text-white transition-colors">
          <span className="text-xl">⚙️</span>
          <span className="ml-3 hidden md:block font-semibold text-sm">Settings</span>
        </button>
      </div>
    </div>
  );
}
