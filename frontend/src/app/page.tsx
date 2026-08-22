'use client';
import GameBoard from "@/components/game/GameBoard";
import NotificationBell from "@/components/NotificationBell";
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Profile {
  id: number;
  username: string;
  rating: number;
  currentStreak: number;
}

interface RankInfo {
  rank: number;
  totalPlayers: number;
}

interface RecommendedMatch {
  id: number;
  username: string;
  rating: number;
}

interface DailyPuzzle {
  id: number;
  difficulty: number;
  rating: number;
}

interface RecentGame {
  id: number;
  lightPlayer: { id: number, username: string } | null;
  darkPlayer: { id: number, username: string } | null;
  winner: string;
  playedAt: string;
}

interface Friend {
  id: number;
  friendId: number;
  username: string;
  status: string;
  online: boolean;
}

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

// Home-dashboard redesign: every widget below is backed by a real endpoint — no
// placeholder numbers. Chess.com-inspired features with no real backing data yet
// (weekly league/division standings, lesson content) were deliberately left out
// rather than faked; see STATUS.md for the full list of what's real vs. out of scope.
export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rankInfo, setRankInfo] = useState<RankInfo | null>(null);
  const [recommendedMatch, setRecommendedMatch] = useState<RecommendedMatch | null>(null);
  const [dailyPuzzle, setDailyPuzzle] = useState<DailyPuzzle | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [autoChallengeUserId, setAutoChallengeUserId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    if (!token) return;

    axios.get<Profile>(`${API_URL}/auth/profile`, authHeaders(token))
      .then((res) => setProfile(res.data))
      .catch(() => { localStorage.removeItem('token'); setIsAuthenticated(false); });

    axios.get<RankInfo>(`${API_URL}/users/rank`, authHeaders(token)).then((res) => setRankInfo(res.data)).catch(() => {});
    axios.get<RecommendedMatch | null>(`${API_URL}/users/recommended-match`, authHeaders(token)).then((res) => setRecommendedMatch(res.data)).catch(() => {});
    axios.get<RecentGame[]>(`${API_URL}/history/my-games`, authHeaders(token)).then((res) => setRecentGames(res.data.slice(0, 5))).catch(() => {});
    axios.get<Friend[]>(`${API_URL}/friends`, authHeaders(token)).then((res) => setFriends(res.data)).catch(() => {});
  }, []);

  // Daily puzzle is free for everyone regardless of login state — fetched
  // unconditionally, matching /puzzles/daily's own no-auth-required design.
  useEffect(() => {
    axios.get<DailyPuzzle | null>(`${API_URL}/puzzles/daily`).then((res) => setDailyPuzzle(res.data)).catch(() => {});
  }, []);


  const handleChallengeRecommended = useCallback(() => {
    if (recommendedMatch) setAutoChallengeUserId(recommendedMatch.id);
  }, [recommendedMatch]);

  const myColorFor = (game: RecentGame) => (game.lightPlayer?.id === profile?.id ? 'LIGHT' : 'DARK');
  const opponentFor = (game: RecentGame) => (myColorFor(game) === 'LIGHT' ? game.darkPlayer?.username ?? 'AI' : game.lightPlayer?.username ?? 'AI');
  const resultFor = (game: RecentGame) => {
    if (game.winner === 'DRAW') return { label: 'DRAW', className: 'text-slate-500' };
    const won = game.winner === myColorFor(game);
    return won ? { label: 'WIN', className: 'text-green-600' } : { label: 'LOSS', className: 'text-red-500' };
  };

  return (
    <main className="min-h-screen bg-[#302e2b] flex flex-col items-center py-8 px-4 md:px-8">
      <div className="w-full max-w-6xl flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-4xl font-extrabold text-[#739552] tracking-tight">
          Play Draughts
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          {isAuthenticated && (
            <>
              {profile && (
                <span title="Daily play streak" className="flex items-center gap-1 px-3 py-1.5 bg-[#3c3a38] text-white rounded text-sm font-semibold">
                  🔥 {profile.currentStreak}
                </span>
              )}
              {rankInfo && (
                <span title="Global rank" className="px-3 py-1.5 bg-[#3c3a38] text-white rounded text-sm font-semibold">
                  #{rankInfo.rank}
                </span>
              )}
              <NotificationBell />
            </>
          )}
        </div>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-[#262421] rounded shadow-lg overflow-hidden">
          <div className="p-8">
            <GameBoard autoChallengeUserId={autoChallengeUserId} onAutoChallengeSent={() => setAutoChallengeUserId(null)} />
          </div>
        </div>

        {isAuthenticated && (
          <div className="flex flex-col gap-5">
            <div className="bg-[#262421] rounded shadow-lg p-5">
              <h2 className="text-sm font-bold text-[#989795] uppercase tracking-wide mb-3">Recommended Match</h2>
              {recommendedMatch ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{recommendedMatch.username}</p>
                    <p className="text-xs text-[#989795]">Rating {Math.round(recommendedMatch.rating)} · Similar skill · Online now</p>
                  </div>
                  <button
                    onClick={handleChallengeRecommended}
                    disabled={autoChallengeUserId !== null}
                    className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {autoChallengeUserId === recommendedMatch.id ? 'Sending...' : 'Challenge'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[#989795]">No similarly-rated players online right now.</p>
              )}
            </div>

            <div className="bg-[#262421] rounded shadow-lg p-5">
              <h2 className="text-sm font-bold text-[#989795] uppercase tracking-wide mb-3">Daily Puzzle</h2>
              {dailyPuzzle ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">Puzzle #{dailyPuzzle.id}</p>
                    <p className="text-xs text-[#989795]">Rating {Math.round(dailyPuzzle.rating)} · Same for everyone today</p>
                  </div>
                  <button
                    onClick={() => router.push('/puzzles?daily=1')}
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 transition"
                  >
                    Solve
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[#989795]">No puzzle available yet.</p>
              )}
            </div>

            <div className="bg-[#262421] rounded shadow-lg p-5">
              <h2 className="text-sm font-bold text-[#989795] uppercase tracking-wide mb-3">Recent Games</h2>
              {recentGames.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {recentGames.map((game) => {
                    const result = resultFor(game);
                    return (
                      <li key={game.id} className="py-2 flex items-center justify-between text-sm">
                        <div>
                          <span className={`font-bold uppercase ${result.className}`}>{result.label}</span>
                          <span className="text-gray-300 ml-2">vs {opponentFor(game)}</span>
                        </div>
                        <button onClick={() => router.push(`/analysis/${game.id}`)} className="text-blue-600 hover:underline font-medium">
                          Review
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-[#989795]">No games played yet — start one on the left!</p>
              )}
            </div>

            <div className="bg-[#262421] rounded shadow-lg p-5">
              <h2 className="text-sm font-bold text-[#989795] uppercase tracking-wide mb-3">Friends</h2>
              {friends.filter((f) => f.status === 'ACCEPTED').length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {friends.filter((f) => f.status === 'ACCEPTED').map((f) => (
                    <li key={f.id} className="py-2 flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${f.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-white">{f.username}</span>
                      <span className="text-xs text-[#989795] ml-auto">{f.online ? 'Online' : 'Offline'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#989795]">Add friends from your profile to see them here.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
