'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function Profile() {
  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const [profileRes, historyRes] = await Promise.all([
           axios.get('http://localhost:3001/auth/profile', {
             headers: { Authorization: `Bearer ${token}` }
           }),
           axios.get('http://localhost:3001/history/my-games', {
             headers: { Authorization: `Bearer ${token}` }
           })
        ]);

        setProfile(profileRes.data);
        setHistory(historyRes.data);
      } catch (err) {
        localStorage.removeItem('token');
        router.push('/login');
      }
    };

    fetchProfile();
  }, [router]);

  if (!profile) return <div className="text-center p-10">Loading profile...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10">
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-8 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-800">{profile.username}</h1>
          <p className="text-xl text-blue-600 font-semibold mt-2">Rating: {profile.rating}</p>
        </div>
        <div className="flex gap-4">
          <div className="text-center p-4 bg-gray-100 rounded">
            <p className="text-2xl font-bold text-green-600">{profile.wins}</p>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Wins</p>
          </div>
          <div className="text-center p-4 bg-gray-100 rounded">
            <p className="text-2xl font-bold text-gray-600">{profile.draws}</p>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Draws</p>
          </div>
          <div className="text-center p-4 bg-gray-100 rounded">
            <p className="text-2xl font-bold text-red-600">{profile.losses}</p>
            <p className="text-xs text-gray-500 uppercase tracking-widest">Losses</p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Match History ({profile.gamesPlayed} games)</h2>

        {history.length === 0 ? (
          <p className="text-gray-500">No matches played yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {history.map((game, i) => {
              const myColor = game.lightPlayer?.id === profile.id ? 'LIGHT' : (game.darkPlayer?.id === profile.id ? 'DARK' : 'SPECTATOR');
              const isWin = game.winner === myColor;
              const isDraw = game.winner === 'DRAW';
              const resultColor = isWin ? 'text-green-600' : (isDraw ? 'text-gray-600' : 'text-red-600');
              const opponent = myColor === 'LIGHT' ? (game.darkPlayer?.username || 'AI') : (game.lightPlayer?.username || 'AI');

              return (
                <li key={i} className="py-4 flex justify-between items-center hover:bg-gray-50 px-2 rounded">
                  <div>
                    <span className={`font-bold uppercase ${resultColor}`}>{isWin ? 'WIN' : (isDraw ? 'DRAW' : 'LOSS')}</span>
                    <span className="text-gray-600 ml-3">vs {opponent}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(game.playedAt).toLocaleDateString()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        className="mt-6 text-gray-500 hover:text-gray-800 underline"
        onClick={() => router.push('/')}
      >
        Back to Dashboard
      </button>
    </div>
  );
}