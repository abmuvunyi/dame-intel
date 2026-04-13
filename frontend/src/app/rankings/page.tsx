'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RankingsPage() {
  const [rankings, setRankings] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rankRes, statsRes] = await Promise.all([
          axios.get(`${API_URL}/users/rankings`),
          axios.get(`${API_URL}/users/stats`)
        ]);
        setRankings(rankRes.data);
        setStats(statsRes.data);
      } catch (err) {
        console.error("Failed to fetch rankings", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-10 text-center">Loading rankings...</div>;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-4xl font-black text-slate-800 mb-8 text-center">Global Leaderboard</h1>

      <div className="grid md:grid-cols-3 gap-8 mb-12">
        {rankings.slice(0, 3).map((player, i) => (
          <div key={player.id} className="bg-white rounded-2xl shadow-lg p-6 border-b-4 border-blue-500 text-center transform hover:-translate-y-2 transition">
            <div className="text-4xl mb-2">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
            <div className="font-bold text-xl text-slate-800">{player.username}</div>
            <div className="text-blue-600 font-black text-2xl">{player.rating}</div>
            <div className="text-xs text-slate-400 mt-2 uppercase tracking-widest">{player.wins}W - {player.losses}L</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 mb-12">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="p-4 text-center w-16">Rank</th>
              <th className="p-4">Player</th>
              <th className="p-4">Rating</th>
              <th className="p-4 hidden sm:table-cell">Games</th>
              <th className="p-4">Win Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rankings.map((player, i) => (
              <tr key={player.id} className="hover:bg-blue-50 transition">
                <td className="p-4 text-center font-bold text-slate-400">#{i + 1}</td>
                <td className="p-4 font-bold text-slate-700">{player.username}</td>
                <td className="p-4 font-black text-blue-600">{player.rating}</td>
                <td className="p-4 hidden sm:table-cell text-slate-500">{player.gamesPlayed}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${player.gamesPlayed > 0 ? (player.wins / player.gamesPlayed * 100) : 0}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-bold text-slate-600">
                      {player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800 rounded-2xl p-8 text-white">
        <h3 className="text-xl font-bold mb-6">Rating Distribution</h3>
        <div className="flex items-end gap-2 h-48">
          {stats.sort((a,b) => parseInt(a.bucket) - parseInt(b.bucket)).map(s => (
            <div key={s.bucket} className="flex-1 flex flex-col items-center gap-2 group">
              <div
                className="w-full bg-blue-500 rounded-t hover:bg-blue-400 transition-all relative"
                style={{ height: `${Math.max(10, (s.count / Math.max(...stats.map(x => x.count))) * 100)}%` }}
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-slate-800 text-[10px] px-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                  {s.count} players
                </div>
              </div>
              <span className="text-[10px] text-slate-400 rotate-45 sm:rotate-0 mt-2">{s.bucket.split('-')[0]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
