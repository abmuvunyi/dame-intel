'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

export default function TournamentsList() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tournaments`);
        setTournaments(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTournaments();
  }, []);

  return (
    <DashboardShell>
      <div className="min-h-screen py-10 px-4 flex flex-col items-center">
        <div className="w-full max-w-4xl flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-slate-100">Tournaments</h1>
          <button
            onClick={() => router.push('/')}
            className="text-green-400 hover:underline"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="w-full max-w-4xl bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8">
          <h2 className="text-2xl font-semibold mb-4 text-slate-100">Upcoming Events</h2>

          {loading ? (
            <p className="text-slate-400">Loading...</p>
          ) : tournaments.length === 0 ? (
            <p className="text-slate-400">No upcoming tournaments right now. Check back later!</p>
          ) : (
            <ul className="divide-y divide-slate-700">
              {tournaments.map((t) => (
                <li key={t.id} className="py-4 flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold text-green-400">{t.name}</h3>
                    <p className="text-slate-400 text-sm">Format: {t.format} | Status: {t.status}</p>
                  </div>
                  <button
                    onClick={() => router.push(`/tournaments/${t.id}`)}
                    className="px-6 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700 transition"
                  >
                    View Details
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
