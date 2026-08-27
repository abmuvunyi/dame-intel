'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

export default function Profile() {
  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [newFriendName, setNewFriendName] = useState('');
  const [activeTab, setActiveTab] = useState<'history' | 'friends'>('history');
  // Phase 11: per-game accuracy from the automated post-game review, keyed by game
  // id. Fetched once history loads — already computed server-side (not recomputed
  // here), so this is just N cheap lookups, not N re-analyses.
  const [reviews, setReviews] = useState<Record<number, any>>({});
  const router = useRouter();

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const [profileRes, historyRes, friendsRes] = await Promise.all([
           axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/profile`, {
             headers: { Authorization: `Bearer ${token}` }
           }),
           axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/history/my-games`, {
             headers: { Authorization: `Bearer ${token}` }
           }),
           axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/friends`, {
             headers: { Authorization: `Bearer ${token}` }
           })
        ]);

        setProfile(profileRes.data);
        setHistory(historyRes.data);
        setFriends(friendsRes.data);
      } catch (err) {
        localStorage.removeItem('token');
        router.push('/login');
      }
    };

    fetchProfile();
  }, [router]);

  useEffect(() => {
    if (history.length === 0) return;
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    Promise.all(history.map(g => axios.get(`${API}/game-review/${g.id}`).then(r => [g.id, r.data] as const).catch(() => [g.id, null] as const)))
      .then(entries => {
        const map: Record<number, any> = {};
        for (const [gameId, data] of entries) if (data) map[gameId] = data;
        setReviews(map);
      });
  }, [history]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/friends/add`, { username: newFriendName }, {
         headers: { Authorization: `Bearer ${token}` }
      });
      setNewFriendName('');
      alert('Friend request sent!');
    } catch(err: any) {
      alert(err.response?.data?.message || 'Error sending request');
    }
  };

  const handleAcceptFriend = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/friends/accept/${id}`, {}, {
         headers: { Authorization: `Bearer ${token}` }
      });
      // Update local state
      setFriends(friends.map(f => f.id === id ? { ...f, status: 'ACCEPTED' } : f));
    } catch(err: any) {
      alert('Error accepting request');
    }
  };

  const handleDeclineFriend = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/friends/decline/${id}`, {}, {
         headers: { Authorization: `Bearer ${token}` }
      });
      setFriends(friends.filter(f => f.id !== id));
    } catch(err: any) {
      alert(err.response?.data?.message || 'Error declining request');
    }
  };

  if (!profile) {
    return (
      <DashboardShell>
        <div className="min-h-screen flex items-center justify-center text-slate-400">Loading profile...</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="min-h-screen flex flex-col items-center py-10 px-4">
        <div className="w-full max-w-4xl bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8 mb-6 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-slate-100">{profile.username}</h1>
            <p className="text-xl text-green-400 font-semibold mt-2">Rating: {profile.rating}</p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="text-center p-4 bg-slate-900 rounded">
              <p className="text-2xl font-bold text-green-400">{profile.wins}</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest">Wins</p>
            </div>
            <div className="text-center p-4 bg-slate-900 rounded">
              <p className="text-2xl font-bold text-slate-300">{profile.draws}</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest">Draws</p>
            </div>
            <div className="text-center p-4 bg-slate-900 rounded">
              <p className="text-2xl font-bold text-red-400">{profile.losses}</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest">Losses</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-4xl bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-8">
          <div className="flex space-x-6 border-b border-slate-700 mb-6">
             <button
               className={`pb-2 font-semibold ${activeTab === 'history' ? 'border-b-2 border-green-500 text-green-400' : 'text-slate-400 hover:text-slate-200'}`}
               onClick={() => setActiveTab('history')}
             >
               Match History ({profile.gamesPlayed})
             </button>
             <button
               className={`pb-2 font-semibold ${activeTab === 'friends' ? 'border-b-2 border-green-500 text-green-400' : 'text-slate-400 hover:text-slate-200'}`}
               onClick={() => setActiveTab('friends')}
             >
               Friends ({friends.length})
             </button>
          </div>

          {activeTab === 'history' && (
            <>
              {history.length === 0 ? (
                <p className="text-slate-400">No matches played yet.</p>
              ) : (
                <ul className="divide-y divide-slate-700">
                  {history.map((game, i) => {
                    const myColor = game.lightPlayer?.id === profile.id ? 'LIGHT' : (game.darkPlayer?.id === profile.id ? 'DARK' : 'SPECTATOR');
                    const isWin = game.winner === myColor;
                    const isDraw = game.winner === 'DRAW';
                    const resultColor = isWin ? 'text-green-400' : (isDraw ? 'text-slate-400' : 'text-red-400');
                    const opponent = myColor === 'LIGHT' ? (game.darkPlayer?.username || 'AI') : (game.lightPlayer?.username || 'AI');
                    // Phase 11: my own accuracy from the automated review, if it's
                    // ready. Undefined (not yet fetched/computed) and null (side never
                    // moved) both just render nothing — no "0%" false signal either way.
                    const gameReview = reviews[game.id];
                    const myAccuracy = gameReview?.status === 'COMPLETED'
                      ? (myColor === 'LIGHT' ? gameReview.lightAccuracy : myColor === 'DARK' ? gameReview.darkAccuracy : null)
                      : null;

                    return (
                      <li key={i} className="py-4 flex justify-between items-center hover:bg-slate-700/50 px-2 rounded">
                        <div>
                          <span className={`font-bold uppercase ${resultColor}`}>{isWin ? 'WIN' : (isDraw ? 'DRAW' : 'LOSS')}</span>
                          <span className="text-slate-400 ml-3">vs {opponent}</span>
                          {myAccuracy !== null && (
                            <span className="ml-3 text-xs font-medium px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                              {myAccuracy}% accuracy
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-slate-500">
                            {new Date(game.playedAt).toLocaleDateString()}
                          </span>
                          <button
                             onClick={() => router.push(`/analysis/${game.id}`)}
                             className="px-3 py-1 bg-green-900/40 text-green-300 text-sm font-medium rounded hover:bg-green-900/60 transition"
                          >
                             Analyze
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {activeTab === 'friends' && (
            <>
              <form onSubmit={handleAddFriend} className="mb-6 flex space-x-2">
                <input
                  type="text"
                  placeholder="Add friend by username..."
                  value={newFriendName}
                  onChange={e => setNewFriendName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 p-2 rounded flex-grow"
                  required
                />
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition">Add</button>
              </form>

              <ul className="divide-y divide-slate-700">
                {friends.length === 0 && <p className="text-slate-400">No friends added yet.</p>}
                {friends.map((f, i) => (
                  <li key={i} className="py-3 flex justify-between items-center">
                    <span className="font-medium flex items-center gap-2 text-slate-200">
                      {f.status === 'ACCEPTED' && (
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${f.online ? 'bg-green-500' : 'bg-slate-600'}`}
                          title={f.online ? 'Online' : 'Offline'}
                        />
                      )}
                      {f.username}
                    </span>
                    {f.status === 'ACCEPTED' ? (
                       <span className={`text-sm font-semibold ${f.online ? 'text-green-400' : 'text-slate-500'}`}>
                         {f.online ? 'Online' : 'Offline'}
                       </span>
                    ) : f.isIncomingRequest ? (
                       <div className="flex gap-2">
                         <button
                           onClick={() => handleAcceptFriend(f.id)}
                           className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition"
                         >
                           Accept
                         </button>
                         <button
                           onClick={() => handleDeclineFriend(f.id)}
                           className="px-3 py-1 bg-slate-700 text-slate-200 rounded text-sm hover:bg-slate-600 transition"
                         >
                           Decline
                         </button>
                       </div>
                    ) : (
                       <span className="text-slate-500 text-sm">Request Sent</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-6 pt-4 border-t border-slate-700">
                <a href="/clubs" className="text-sm text-green-400 hover:underline">Browse Clubs →</a>
              </div>
            </>
          )}
        </div>

        <button
          className="mt-6 text-slate-500 hover:text-slate-200 underline transition"
          onClick={() => router.push('/')}
        >
          Back to Dashboard
        </button>
      </div>
    </DashboardShell>
  );
}
