'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, Puzzle, Trophy, Eye, Users, User, LogOut, LogIn } from 'lucide-react';

export default function Sidebar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('token');
      setIsAuthenticated(!!token);
    };
    checkAuth();
    // In a real app, you might want to listen to storage events or use a global state manager
    window.addEventListener('storage', checkAuth);
    return () => window.removeEventListener('storage', checkAuth);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    window.dispatchEvent(new Event('storage'));
    router.push('/');
  };

  const navItems = [
    { name: 'Play', href: '/', icon: Home },
    { name: 'Puzzles', href: '/puzzles', icon: Puzzle },
    { name: 'Tournaments', href: '/tournaments', icon: Trophy },
    { name: 'Watch', href: '/watch', icon: Eye },
    { name: 'Clubs', href: '/clubs', icon: Users },
  ];

  return (
    <div className="flex flex-col h-screen w-56 bg-[#262522] text-[#c3c2c1] border-r border-[#3e3d3b]">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-2 mb-8 group">
           <div className="text-2xl font-bold text-white group-hover:text-green-500 transition-colors">Draughts.com</div>
        </Link>
        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                  isActive
                    ? 'bg-[#3c3a38] text-white font-semibold'
                    : 'hover:bg-[#3c3a38] hover:text-white'
                }`}
              >
                <Icon size={20} className={isActive ? 'text-green-500' : ''} />
                <span>{item.name}</span>
              </Link>
            );
          })}

          <div className="my-6 border-t border-[#3e3d3b]"></div>

          {isAuthenticated ? (
             <Link
                href="/profile"
                className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                  pathname.startsWith('/profile')
                    ? 'bg-[#3c3a38] text-white font-semibold'
                    : 'hover:bg-[#3c3a38] hover:text-white'
                }`}
              >
                <User size={20} className={pathname.startsWith('/profile') ? 'text-green-500' : ''} />
                <span>Profile</span>
              </Link>
          ) : (
            <Link
                href="/login"
                className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                  pathname.startsWith('/login')
                    ? 'bg-[#3c3a38] text-white font-semibold'
                    : 'hover:bg-[#3c3a38] hover:text-white'
                }`}
              >
                <LogIn size={20} className={pathname.startsWith('/login') ? 'text-green-500' : ''} />
                <span>Login</span>
              </Link>
          )}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-[#3e3d3b]">
         {isAuthenticated && (
           <button
             onClick={handleLogout}
             className="flex items-center gap-3 px-4 py-3 w-full rounded-md transition-colors hover:bg-[#3c3a38] hover:text-white text-left"
           >
             <LogOut size={20} />
             <span>Log Out</span>
           </button>
         )}
      </div>
    </div>
  );
}
