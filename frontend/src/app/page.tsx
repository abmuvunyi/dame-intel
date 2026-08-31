'use client';
import GameBoard from "@/components/game/GameBoard";
import DashboardShell from "@/components/DashboardShell";
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
//
// Dark-theme pass: the top nav row this page used to render itself was replaced by
// DashboardShell's persistent sidebar (used across every redesigned page now) — this
// component only owns the two-column dashboard content below it.
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
    if (game.winner === 'DRAW') return { label: 'DRAW', className: 'text-slate-400' };
    const won = game.winner === myColorFor(game);
    return won ? { label: 'WIN', className: 'text-green-400' } : { label: 'LOSS', className: 'text-red-400' };
  };

  return (
    <DashboardShell>
      <div className="min-h-screen py-8 px-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400 tracking-tight">
            Online Draughts
          </h1>

          {isAuthenticated && profile && (
            <div className="flex flex-wrap items-center gap-3">
              <span title="Daily play streak — consecutive days with at least one completed game" className="flex items-center gap-1 px-3 py-1.5 bg-orange-950/40 border border-orange-800/60 text-orange-300 rounded-full text-sm font-semibold">
                🔥 {profile.currentStreak} Day{profile.currentStreak === 1 ? '' : 's'}
              </span>
              {rankInfo && (
                <span title="Global rank by rating" className="px-3 py-1.5 bg-indigo-950/40 border border-indigo-800/60 text-indigo-300 rounded-full text-sm font-semibold">
                  #{rankInfo.rank} of {rankInfo.totalPlayers}
                </span>
              )}
            </div>
          )}
        </div>

        {/* A fixed-width sidebar column + a fluid board column (instead of the old
            fractional 1-of-3/2-of-3 grid split) — the board now gets essentially all
            of whatever room is left after the sidebar, rather than being capped at
            two-thirds of the page regardless of how wide the sidebar's own content
            actually needs. `min-w-0` on the board card matters here for the same
            reason it does inside GameBoard.tsx itself: a grid/flex item's default
            min-width is its content's own intrinsic size, which would otherwise stop
            this column from ever shrinking down to what's actually available. */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          <div className="min-w-0 bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-800">
            <div className="p-4 sm:p-6">
              <GameBoard autoChallengeUserId={autoChallengeUserId} onAutoChallengeSent={() => setAutoChallengeUserId(null)} />
            </div>
          </div>

          {isAuthenticated && (
            <div className="flex flex-col gap-5">
              <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-5">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">Recommended Match</h2>
                {recommendedMatch ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-100">{recommendedMatch.username}</p>
                      <p className="text-xs text-slate-400">Rating {Math.round(recommendedMatch.rating)} · Similar skill · Online now</p>
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
                  <p className="text-sm text-slate-500">No similarly-rated players online right now.</p>
                )}
              </div>

              <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-5">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">Daily Puzzle</h2>
                {dailyPuzzle ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-100">Puzzle #{dailyPuzzle.id}</p>
                      <p className="text-xs text-slate-400">Rating {Math.round(dailyPuzzle.rating)} · Same for everyone today</p>
                    </div>
                    <button
                      onClick={() => router.push('/puzzles?daily=1')}
                      className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 transition"
                    >
                      Solve
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No puzzle available yet.</p>
                )}
              </div>

              <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-5">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">Recent Games</h2>
                {recentGames.length > 0 ? (
                  <ul className="divide-y divide-slate-700">
                    {recentGames.map((game) => {
                      const result = resultFor(game);
                      return (
                        <li key={game.id} className="py-2 flex items-center justify-between text-sm">
                          <div>
                            <span className={`font-bold uppercase ${result.className}`}>{result.label}</span>
                            <span className="text-slate-400 ml-2">vs {opponentFor(game)}</span>
                          </div>
                          <button onClick={() => router.push(`/analysis/${game.id}`)} className="text-green-400 hover:underline font-medium">
                            Review
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No games played yet — start one on the left!</p>
                )}
              </div>

              <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-5">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-3">Friends</h2>
                {friends.filter((f) => f.status === 'ACCEPTED').length > 0 ? (
                  <ul className="divide-y divide-slate-700">
                    {friends.filter((f) => f.status === 'ACCEPTED').map((f) => (
                      <li key={f.id} className="py-2 flex items-center gap-2 text-sm">
                        <span className={`w-2 h-2 rounded-full ${f.online ? 'bg-green-500' : 'bg-slate-600'}`} />
                        <span className="text-slate-300">{f.username}</span>
                        <span className="text-xs text-slate-500 ml-auto">{f.online ? 'Online' : 'Offline'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Add friends from your profile to see them here.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
