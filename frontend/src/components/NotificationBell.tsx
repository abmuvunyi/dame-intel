'use client';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const POLL_INTERVAL_MS = 30_000;

interface Notification {
  id: number;
  type: string;
  message: string;
  data: any;
  read: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  // 'light' (default) preserves this component's original look for pages that
  // haven't been moved onto the dark dashboard shell yet; 'dark' matches the shell's
  // navy/slate surfaces. Not a full theme system — just enough to avoid a light
  // bell-dropdown looking broken bolted onto a dark page, or vice versa, while the
  // rest of the app is redesigned incrementally rather than all at once.
  variant?: 'light' | 'dark';
}

// Phase 13: the one place all four trigger points (friend requests, challenges,
// tournament starts, correspondence turn reminders — see NotificationsService.notify's
// callers) surface to a logged-in user. Renders nothing at all if there's no token,
// same "quietly absent for anonymous visitors" convention puzzles.tsx and profile
// page use for auth-gated UI.
export default function NotificationBell({ variant = 'light' }: NotificationBellProps) {
  const [token, setToken] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setToken(localStorage.getItem('token'));
  }, []);

  const authHeaders = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

  const fetchUnreadCount = async (t: string) => {
    try {
      const res = await axios.get(`${API_URL}/notifications/unread-count`, authHeaders(t));
      setUnreadCount(res.data.count);
    } catch {
      // Non-fatal — the bell just shows no badge until the next successful poll.
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchUnreadCount(token);
    const interval = setInterval(() => fetchUnreadCount(token), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token]);

  // Close on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openDropdown = async () => {
    if (!token) return;
    setOpen((prev) => !prev);
    if (open) return; // toggling closed — no fetch needed
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/notifications`, authHeaders(token));
      setNotifications(res.data);
    } catch {
      // Non-fatal — dropdown just stays empty.
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id: number) => {
    if (!token) return;
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await axios.post(`${API_URL}/notifications/${id}/read`, null, authHeaders(token));
    } catch {
      // Best-effort — a failed mark-read just means it'll show unread again next fetch.
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await axios.post(`${API_URL}/notifications/read-all`, null, authHeaders(token));
    } catch {
      // Best-effort, same as markRead above.
    }
  };

  if (!token) return null;

  const dark = variant === 'dark';

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={openDropdown}
        aria-label="Notifications"
        className={
          dark
            ? 'relative px-3 py-2 text-slate-200 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 transition'
            : 'relative px-3 py-2 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition shadow-sm'
        }
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center text-xs font-bold text-white bg-red-600 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // The 'dark' variant lives in DashboardShell's sidebar, always pinned near
        // the bottom of the viewport — opening downward (like the light variant,
        // which sits in a normal page header) would clip most of the dropdown below
        // the screen edge. Opens upward instead.
        <div className={
          dark
            ? 'absolute left-0 bottom-full mb-2 w-80 max-h-96 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-50'
            : 'absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-2xl z-50'
        }>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
            <span className={`font-semibold ${dark ? 'text-slate-100' : 'text-slate-800'}`}>Notifications</span>
            {notifications.some((n) => !n.read) && (
              <button onClick={markAllRead} className={`text-xs hover:underline font-medium ${dark ? 'text-green-400' : 'text-blue-600'}`}>
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <p className={`p-4 text-sm text-center ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Loading...</p>
          ) : notifications.length === 0 ? (
            <p className={`p-4 text-sm text-center ${dark ? 'text-slate-400' : 'text-slate-500'}`}>No notifications yet.</p>
          ) : (
            <ul className={`divide-y ${dark ? 'divide-slate-700' : 'divide-slate-100'}`}>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`px-4 py-3 text-sm cursor-pointer ${dark
                    ? `hover:bg-slate-700 ${n.read ? 'text-slate-400' : 'text-slate-100 font-medium bg-green-900/20'}`
                    : `hover:bg-slate-50 ${n.read ? 'text-slate-500' : 'text-slate-900 font-medium bg-blue-50/50'}`
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dark ? 'bg-green-400' : 'bg-blue-600'}`} />}
                    <div>
                      <p>{n.message}</p>
                      <p className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
