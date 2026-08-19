'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';

export default function TournamentDetails() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [tournament, setTournament] = useState<any>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState(false);

  const fetchDetails = async () => {
    try {
      const [tRes, sRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tournaments/${id}`),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tournaments/${id}/standings`)
      ]);
      setTournament(tRes.data);
      setStandings(sRes.data);

      // Check if current user is in standings
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const profile = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/profile`, { headers: { Authorization: `Bearer ${token}` }});
          if (sRes.data.some((p: any) => p.user.id === profile.data.id)) {
            setJoined(true);
          }
        } catch(e) {}
      }
    } catch (err) {
      setError('Failed to load tournament');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetails();
  }, [id]);

  const handleJoin = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tournaments/${id}/join`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJoined(true);
      fetchDetails(); // Refresh standings
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to join tournament');
    }
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;
  if (error || !tournament) return <div className="p-10 text-center text-red-500">{error}</div>;

  return (
    <div className="flex-1 w-full flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">{tournament.name}</h1>
          <p className="text-[#c3c3c2] mt-2">Format: {tournament.format} | Status: {tournament.status}</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/tournaments')}
            className="px-4 py-2 text-[#c3c3c2] hover:text-white border border-[#3c3a38] rounded bg-[#3c3a38] font-bold shadow-sm transition"
          >
            Back
          </button>
          {!joined && tournament.status === 'UPCOMING' && (
            <button
              onClick={handleJoin}
              className="px-6 py-2 bg-[#739552] text-white font-bold rounded shadow-md hover:bg-[#81a55d] transition"
            >
              Join Tournament
            </button>
          )}
          {joined && tournament.status === 'UPCOMING' && (
             <span className="px-6 py-2 bg-[#302e2b] text-[#c3c3c2] font-bold rounded border border-[#3c3a38]">
               Registered (Waiting to Start)
             </span>
          )}
          {joined && tournament.status === 'IN_PROGRESS' && (
             <button
               onClick={() => router.push(`/?tournamentId=${tournament.id}`)}
               className="px-6 py-2 bg-[#739552] text-white font-bold rounded shadow-md hover:bg-[#81a55d] transition"
             >
               Play Match
             </button>
          )}
        </div>
      </div>

      <div className="w-full max-w-4xl bg-[#262421] border border-[#3c3a38] rounded-lg shadow-xl p-8">
        <h2 className="text-2xl font-bold mb-4 text-white">Current Standings</h2>

        {standings.length === 0 ? (
          <p className="text-[#c3c3c2]">No players registered yet.</p>
        ) : (
          <div className="overflow-hidden border border-[#3c3a38] rounded-lg">
            <table className="min-w-full divide-y divide-[#3c3a38]">
              <thead className="bg-[#3c3a38]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-[#c3c3c2] uppercase tracking-wider">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-[#c3c3c2] uppercase tracking-wider">Player</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-[#c3c3c2] uppercase tracking-wider">Score</th>
                </tr>
              </thead>
              <tbody className="bg-[#262421] divide-y divide-[#3c3a38]">
                {standings.map((player, index) => (
                  <tr key={player.id} className={index % 2 === 0 ? 'bg-[#262421]' : 'bg-[#302e2b]'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">#{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#c3c3c2]">{player.user.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-white">{player.score} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}