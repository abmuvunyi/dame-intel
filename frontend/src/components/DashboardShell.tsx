'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import NotificationBell from './NotificationBell';

// chess.com-style persistent left icon sidebar, shared across every authenticated
// dark-themed page — the single biggest structural change in matching chess.com's
// actual look, replacing the old pattern of each page duplicating its own top-nav
// link row. Emoji icons, not an icon library, matching this codebase's existing
// convention (🔔 notifications, 🔥 streak, ⇅ flip board, etc.) — no new dependency.
const NAV_ITEMS = [
  { href: '/', label: 'Play', icon: '♟️' },
  { href: '/puzzles', label: 'Puzzles', icon: '🧩' },
  { href: '/tournaments', label: 'Tournaments', icon: '🏆' },
  { href: '/watch', label: 'Watch', icon: '👁️' },
  { href: '/clubs', label: 'Clubs', icon: '👥' },
  { href: '/rankings', label: 'Rankings', icon: '📊' },
];

interface DashboardShellProps {
  children: React.ReactNode;
  // Most pages fetch their own data and don't need the shell itself to know whether
  // someone's logged in — but the sidebar's bottom section (bell, profile, log out)
  // only makes sense for an authenticated visitor, same "quietly absent" rule the
  // rest of the app's auth-gated UI already follows.
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem('token'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
      active ? 'bg-green-600/20 text-green-400' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex">
      {/* sticky + h-screen: pinned to the actual viewport, not stretched to match
          main's content height. Without this, a tall page (e.g. the home dashboard's
          embedded game board) pushes mt-auto's bottom section (Premium/Profile/bell/
          Log Out) below the fold — a real bug caught by inspecting a live screenshot,
          not just checking the DOM for the elements' existence. */}
      <aside className="w-16 lg:w-56 bg-slate-950 border-r border-slate-800 flex flex-col py-6 shrink-0 sticky top-0 h-screen overflow-y-auto">
        <Link href="/" className="px-3 lg:px-6 mb-8 flex items-center gap-2 justify-center lg:justify-start">
          <span className="text-2xl">🐴</span>
          <span className="hidden lg:inline text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500 whitespace-nowrap">
            Dame Intel
          </span>
        </Link>

        <nav className="flex-1 flex flex-col gap-1 px-2 lg:px-3">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(pathname === item.href)} title={item.label}>
              <span className="text-lg mx-auto lg:mx-0">{item.icon}</span>
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          ))}
        </nav>

        {isAuthenticated && (
          <div className="px-2 lg:px-3 flex flex-col gap-1 mt-auto pt-4 border-t border-slate-800">
            <Link href="/membership" className={linkClass(pathname === '/membership')} title="Premium">
              <span className="text-lg mx-auto lg:mx-0">💎</span>
              <span className="hidden lg:inline">Premium</span>
            </Link>
            <Link href="/profile" className={linkClass(pathname === '/profile')} title="Profile">
              <span className="text-lg mx-auto lg:mx-0">👤</span>
              <span className="hidden lg:inline">Profile</span>
            </Link>
            <div className="flex items-center justify-center lg:justify-start gap-2 px-1 lg:px-3 py-2">
              <NotificationBell variant="dark" />
              <button
                onClick={handleLogout}
                title="Log Out"
                className="hidden lg:inline text-xs text-slate-500 hover:text-slate-200 transition ml-1"
              >
                Log Out
              </button>
            </div>
          </div>
        )}
        {!isAuthenticated && (
          <div className="px-2 lg:px-3 mt-auto pt-4 border-t border-slate-800">
            <Link href="/login" className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition">
              <span className="lg:hidden">🔑</span>
              <span className="hidden lg:inline">Login / Register</span>
            </Link>
          </div>
        )}
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
