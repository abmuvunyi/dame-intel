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
        const res = await axios.get('http://localhost:3001/tournaments');
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
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800">Tournaments</h1>
        <button
          onClick={() => router.push('/')}
          className="text-blue-600 hover:underline"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-8">
        <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>

        {loading ? (
          <p>Loading...</p>
        ) : tournaments.length === 0 ? (
          <p className="text-gray-500">No upcoming tournaments right now. Check back later!</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {tournaments.map((t) => (
              <li key={t.id} className="py-4 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-blue-800">{t.name}</h3>
                  <p className="text-gray-600 text-sm">Format: {t.format} | Status: {t.status}</p>
                </div>
                <button
                  onClick={() => router.push(`/tournaments/${t.id}`)}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition"
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