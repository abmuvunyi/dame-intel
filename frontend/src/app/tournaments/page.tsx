'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

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
    <div className="flex-1 w-full flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">Tournaments</h1>
        <button
          onClick={() => router.push('/')}
          className="text-[#c3c3c2] hover:text-white underline"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="w-full max-w-4xl bg-[#262421] border border-[#3c3a38] rounded-lg shadow-xl p-8">
        <h2 className="text-2xl font-bold mb-4 text-white">Upcoming Events</h2>

        {loading ? (
          <p>Loading...</p>
        ) : tournaments.length === 0 ? (
          <p className="text-[#c3c3c2]">No upcoming tournaments right now. Check back later!</p>
        ) : (
          <ul className="divide-y divide-[#3c3a38]">
            {tournaments.map((t) => (
              <li key={t.id} className="py-4 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-white">{t.name}</h3>
                  <p className="text-[#c3c3c2] text-sm">Format: {t.format} | Status: {t.status}</p>
                </div>
                <button
                  onClick={() => router.push(`/tournaments/${t.id}`)}
                  className="px-6 py-2 bg-[#739552] text-white font-bold rounded shadow-md hover:bg-[#81a55d] transition"
                >
                  View Details
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}