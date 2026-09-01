'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { PieceColor } from '@/lib/draughts';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Opponent = { type: 'ai'; difficulty: number } | { type: 'human'; userId: number; username: string } | null;

interface GameOverModalProps {
  winner: PieceColor | 'DRAW';
  reason?: string;
  gameId: number | null;
  myColor: PieceColor | null; // null = spectator
  opponent: Opponent;
  onClose: () => void;
  onRematch: (opponent: Opponent) => void;
  onNewGame: () => void;
}

interface MoveReview {
  moveIndex: number;
  mover: PieceColor;
  classification: 'BEST' | 'GOOD' | 'INACCURACY' | 'MISTAKE' | 'BLUNDER';
}

interface GameReview {
  status: string;
  lightAccuracy: number | null;
  darkAccuracy: number | null;
  moveReviews: MoveReview[] | null;
}

const CLASSIFICATION_ORDER: MoveReview['classification'][] = ['BEST', 'GOOD', 'INACCURACY', 'MISTAKE', 'BLUNDER'];
const CLASSIFICATION_STYLE: Record<string, { label: string; dot: string }> = {
  BEST: { label: 'Best', dot: 'bg-green-500' },
  GOOD: { label: 'Good', dot: 'bg-blue-500' },
  INACCURACY: { label: 'Inaccuracies', dot: 'bg-yellow-500' },
  MISTAKE: { label: 'Mistakes', dot: 'bg-orange-500' },
  BLUNDER: { label: 'Blunders', dot: 'bg-red-500' },
};

// The chess.com-style post-game screen: pops up the instant the game ends (the
// result itself is known immediately) and fills in a compact accuracy/move-quality
// summary once the async post-game review lands (same polling pattern the analysis
// page already uses) — a SUMMARY, not the full per-move breakdown that page shows;
// this is meant to be glanced at before deciding whether to dig into the full review
// at all.
export default function GameOverModal({ winner, reason, gameId, myColor, opponent, onClose, onRematch, onNewGame }: GameOverModalProps) {
  const [review, setReview] = useState<GameReview | null>(null);
  // A real gap this session found live: a game resigned/abandoned with zero moves
  // played never even gets a PENDING row (GameReviewService.analyzeCompletedGame
  // returns early for a 0-move game, before creating one — see its own comment), so
  // its status stays NOT_STARTED forever. Without a cap, this modal would then poll
  // "Analyzing the game..." indefinitely for a game that will never have anything to
  // analyze. Capped, not infinite, polling — after this many attempts (~30s), give up
  // and show a plain "no stats" message instead of a spinner that never resolves.
  const MAX_POLL_ATTEMPTS = 10;
  const [pollTimedOut, setPollTimedOut] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    let attempts = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    const fetchReview = async () => {
      attempts += 1;
      try {
        const res = await axios.get(`${API_URL}/game-review/${gameId}`);
        if (cancelled) return;
        setReview(res.data);
        if (res.data.status === 'COMPLETED' || res.data.status === 'FAILED') {
          if (interval) clearInterval(interval);
        }
      } catch {
        // Not fatal — the modal still works with just the result, no stats panel.
      }
      if (attempts >= MAX_POLL_ATTEMPTS && interval) {
        clearInterval(interval);
        if (!cancelled) setPollTimedOut(true);
      }
    };

    fetchReview();
    interval = setInterval(fetchReview, 3000);
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [gameId]);

  const resultHeadline = (() => {
    if (winner === 'DRAW') return "It's a Draw";
    if (myColor === null) return `${winner === PieceColor.LIGHT ? 'Light' : 'Dark'} Won`; // spectator
    return winner === myColor ? 'You Won!' : 'You Lost';
  })();

  const resultColor = winner === 'DRAW' ? 'text-slate-300' : (myColor === null || winner === myColor) ? 'text-green-400' : 'text-red-400';

  // Counts per classification for the SIDE THE VIEWER PLAYED (if they played at all;
  // a spectator sees the combined counts for both sides instead, since there's no
  // "their own" side to single out).
  const relevantReviews = review?.moveReviews?.filter(mr => myColor === null || mr.mover === myColor) ?? [];
  const counts = CLASSIFICATION_ORDER.map(c => ({ c, n: relevantReviews.filter(mr => mr.classification === c).length }))
    .filter(({ n }) => n > 0);

  const myAccuracy = myColor === PieceColor.DARK ? review?.darkAccuracy : review?.lightAccuracy;
  const canRematch = opponent !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" data-testid="game-over-modal">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-500 hover:text-slate-200 text-xl leading-none"
          aria-label="Close"
        >
          ×
        </button>

        <h2 className={`text-3xl font-extrabold text-center mb-1 ${resultColor}`}>{resultHeadline}</h2>
        {reason && (
          <p className="text-center text-sm text-slate-400 mb-4 capitalize">{reason.replace('-', ' ')}</p>
        )}
        {!reason && <div className="mb-4" />}

        {(!review || review.status === 'NOT_STARTED' || review.status === 'PENDING') && !pollTimedOut ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-4">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
            Analyzing the game...
          </div>
        ) : (!review || review.status !== 'COMPLETED') ? (
          <p className="text-center text-sm text-slate-500 py-4">
            No stats available for this game — likely too short to analyze.
          </p>
        ) : review.status === 'COMPLETED' ? (
          <div className="bg-slate-900/60 rounded-lg p-4 mb-2">
            <div className="flex justify-around mb-3">
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Light</p>
                <p className="text-xl font-bold text-slate-100">{review.lightAccuracy != null ? `${review.lightAccuracy}%` : '—'}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Dark</p>
                <p className="text-xl font-bold text-slate-100">{review.darkAccuracy != null ? `${review.darkAccuracy}%` : '—'}</p>
              </div>
            </div>
            {myColor !== null && myAccuracy != null && (
              <p className="text-center text-xs text-slate-400 mb-3">Your accuracy: <span className="font-semibold text-slate-200">{myAccuracy}%</span></p>
            )}
            {counts.length > 0 && (
              <div className="flex flex-col gap-1">
                {counts.map(({ c, n }) => (
                  <div key={c} className="flex items-center gap-2 text-sm">
                    <span className={`w-2 h-2 rounded-full ${CLASSIFICATION_STYLE[c].dot}`} />
                    <span className="text-slate-300">{CLASSIFICATION_STYLE[c].label}</span>
                    <span className="ml-auto text-slate-400 font-mono">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 mt-4">
          {gameId != null && (
            <a
              href={`/analysis/${gameId}`}
              className="w-full text-center px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
            >
              Game Review
            </a>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onRematch(opponent)}
              disabled={!canRematch}
              title={canRematch ? undefined : 'No known opponent to rematch (anonymous or already left)'}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700 text-slate-100 rounded-lg text-sm font-semibold transition"
            >
              Rematch
            </button>
            <button
              onClick={onNewGame}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg text-sm font-semibold transition"
            >
              New (10+5)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
