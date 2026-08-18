'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Phase 12's moderator review queue. No admin-role system exists anywhere in this
// codebase — reaching this page just requires being logged in (same as every other
// "admin" surface already built: Phase 7's puzzle admin, Phase 8b's tournament
// lifecycle). It isn't linked from any nav; a real deployment would gate this behind
// an actual role before ever surfacing it in navigation.
export default function ModerationQueue() {
  const [flags, setFlags] = useState<any[]>([]);
  const [showReviewed, setShowReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [tempBanDays, setTempBanDays] = useState(7);
  const router = useRouter();

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const fetchFlags = async () => {
    if (!token) { router.push('/login'); return; }
    setLoading(true);
    try {
      const res = await axios.get(`${API}/anticheat/admin/flags`, {
        headers: authHeaders,
        params: showReviewed ? {} : { reviewed: 'false' },
      });
      setFlags(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFlags(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showReviewed]);

  const handleAction = async (flagId: number, action: string) => {
    if (!authHeaders) return;
    try {
      await axios.post(`${API}/anticheat/admin/flags/${flagId}/review`, {
        action,
        note: note || undefined,
        tempBanDays: action === 'TEMP_BAN' ? tempBanDays : undefined,
      }, { headers: authHeaders });
      setActioningId(null);
      setNote('');
      fetchFlags();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to apply action');
    }
  };

  const flagTypeLabel = (t: string) => t === 'ENGINE_CORRELATION' ? 'Engine Correlation' : t === 'MOVE_TIMING' ? 'Move Timing' : t;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-800">Moderation Queue</h1>
          <p className="text-sm text-gray-500 mt-1">Automated anti-cheat flags — every action here is a deliberate human decision, never automatic.</p>
        </div>
        <button onClick={() => router.push('/')} className="text-blue-600 hover:underline">Back to Dashboard</button>
      </div>

      <div className="w-full max-w-5xl flex justify-end mb-4">
        <label className="text-sm text-gray-600 flex items-center gap-2">
          <input type="checkbox" checked={showReviewed} onChange={e => setShowReviewed(e.target.checked)} />
          Show reviewed flags too
        </label>
      </div>

      <div className="w-full max-w-5xl bg-white rounded-lg shadow-xl p-8">
        {loading ? (
          <p>Loading...</p>
        ) : flags.length === 0 ? (
          <p className="text-gray-500">No flags to review right now.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {flags.map((f) => (
              <li key={f.id} className="py-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">
                      {f.user?.username ?? `user #${f.user?.id}`}
                      <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800 align-middle">
                        {flagTypeLabel(f.flagType)}
                      </span>
                      {f.reviewed && (
                        <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-800 align-middle">
                          Reviewed: {f.moderatorAction}
                        </span>
                      )}
                    </h3>
                    <p className="text-gray-600 text-sm mt-1">{f.reason}</p>
                    <p className="text-gray-400 text-xs mt-1">
                      score={f.score?.toFixed?.(3) ?? f.score} · sample size={f.sampleSize}
                      {f.gameId !== null && f.gameId !== undefined && <> · <a href={`/analysis/${f.gameId}`} className="underline">view game #{f.gameId}</a></>}
                      {' · '}{new Date(f.createdAt).toLocaleString()}
                    </p>
                    {f.moderatorNote && <p className="text-gray-500 text-xs mt-1 italic">Moderator note: {f.moderatorNote}</p>}
                  </div>

                  {!f.reviewed && (
                    <button
                      onClick={() => setActioningId(actioningId === f.id ? null : f.id)}
                      className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 shrink-0"
                    >
                      {actioningId === f.id ? 'Cancel' : 'Review'}
                    </button>
                  )}
                </div>

                {actioningId === f.id && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded p-4 flex flex-col gap-3">
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Moderator note (optional)"
                      className="border p-2 rounded text-sm"
                      rows={2}
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Temp ban days:</label>
                      <input
                        type="number" min={1} value={tempBanDays}
                        onChange={e => setTempBanDays(parseInt(e.target.value) || 1)}
                        className="border rounded p-1 w-16 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => handleAction(f.id, 'DISMISS')} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Dismiss</button>
                      <button onClick={() => handleAction(f.id, 'WARN')} className="px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded text-sm hover:bg-yellow-200">Warn</button>
                      <button onClick={() => handleAction(f.id, 'RATING_RESET_FLAG')} className="px-3 py-1.5 bg-orange-100 text-orange-800 rounded text-sm hover:bg-orange-200">Flag for Rating Reset</button>
                      <button onClick={() => handleAction(f.id, 'TEMP_BAN')} className="px-3 py-1.5 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200">Temp Ban</button>
                      <button onClick={() => handleAction(f.id, 'PERMA_BAN')} className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700">Perma Ban</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
