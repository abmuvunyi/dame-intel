'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Play', icon: '♟️' },
    { href: '/puzzles', label: 'Puzzles', icon: '🧩' },
    { href: '/tournaments', label: 'Tournaments', icon: '🏆' },
    { href: '/profile', label: 'Profile', icon: '👤' },
  ];

  return (
    <div className="w-16 md:w-48 flex-shrink-0 bg-[#262421] border-r border-[#3d3b38] flex flex-col items-center md:items-start py-6">
      <div className="md:px-6 mb-8 w-full flex justify-center md:justify-start">
        <span className="font-bold text-xl tracking-wider text-green-500 hidden md:inline">Draughts</span>
        <span className="font-bold text-xl text-green-500 md:hidden">D</span>
      </div>

      <nav className="flex flex-col w-full gap-2 px-2">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                isActive
                  ? 'bg-[#3d3b38] text-white font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-[#3d3b38]'
              }`}
            >
              <span className="text-xl">{link.icon}</span>
              <span className="hidden md:inline">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto w-full px-4 md:px-6 flex flex-col gap-2">
         {/* Settings / Login placeholders */}
      </div>
    </div>
  );
}
