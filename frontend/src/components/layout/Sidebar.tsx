'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Sidebar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    router.push('/');
  };

  return (
    <div className="w-64 bg-[#262421] text-white flex flex-col p-4 h-screen border-r border-[#3d3934] flex-shrink-0">
      <h1 className="text-3xl font-extrabold mb-8 text-white tracking-tight">
        Draughts.com
      </h1>

      <div className="flex flex-col space-y-2 flex-grow">
         <Link href="/" className={`px-4 py-3 text-lg font-medium text-white rounded transition flex items-center ${pathname === '/' ? 'bg-[#3d3934]' : 'hover:bg-[#3d3934]'}`}>
           Play
         </Link>
         <Link href="/puzzles" className={`px-4 py-3 text-lg font-medium text-white rounded transition flex items-center ${pathname === '/puzzles' ? 'bg-[#3d3934]' : 'hover:bg-[#3d3934]'}`}>
           Puzzles
         </Link>
         <Link href="/tournaments" className={`px-4 py-3 text-lg font-medium text-white rounded transition flex items-center ${pathname === '/tournaments' ? 'bg-[#3d3934]' : 'hover:bg-[#3d3934]'}`}>
           Tournaments
         </Link>
      </div>

      <div className="flex flex-col space-y-2 mt-auto">
        {isAuthenticated ? (
          <>
            <Link href="/profile" className="px-4 py-2 text-md font-medium text-white bg-slate-700 rounded hover:bg-slate-600 transition text-center shadow">
              Profile
            </Link>
            <button onClick={handleLogout} className="px-4 py-2 text-md font-medium text-slate-200 bg-[#3d3934] border border-transparent rounded hover:bg-[#4d4842] transition text-center shadow-sm">
              Log Out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="px-4 py-2 text-md font-medium text-white bg-[#81b64c] rounded hover:bg-[#a3d160] transition text-center shadow">
              Sign Up
            </Link>
            <Link href="/login" className="px-4 py-2 text-md font-medium text-white bg-[#3d3934] rounded hover:bg-[#4d4842] transition text-center shadow">
              Log In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
