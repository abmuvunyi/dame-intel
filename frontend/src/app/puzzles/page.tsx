'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { BoardState, Move, PieceColor } from '@/lib/draughts';
import Board from '@/components/game/Board';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PublicPuzzle {
  id: number;
  difficulty: number;
  board: BoardState;
  turnToMove: PieceColor;
  boardSize: number;
  status: string;
  rating: number;
}

// useSearchParams() requires a Suspense boundary somewhere above it in the App
// Router (same reason GameBoard.tsx/membership/page.tsx wrap their own use of it) —
// this reads the ?daily=1 param the home dashboard's Daily Puzzle card links here with.
export default function PuzzlesPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading puzzle...</div>}>
      <PuzzlesPageInner />
    </Suspense>
  );
}

function PuzzlesPageInner() {
  const searchParams = useSearchParams();
  const wantsDaily = searchParams.get('daily') === '1';
  const [puzzle, setPuzzle] = useState<PublicPuzzle | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [turn, setTurn] = useState<PieceColor | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [status, setStatus] = useState<string>('Loading puzzle...');
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [myRating, setMyRating] = useState<number | null>(null);
  const router = useRouter();

  // The server never sends the solution — only the starting position and, on
  // request, the real legal moves at the current ply (see puzzles.service.ts's
  // getLegalMoves). Every attempted move is validated server-side against the real
  // rules engine, never compared against a value already sitting in the browser.
  const loadLegalMoves = useCallback(async (puzzleId: number, atMoveIndex: number) => {
    const res = await axios.get(`${API_URL}/puzzles/${puzzleId}/legal-moves`, { params: { moveIndex: atMoveIndex } });
    setBoard(res.data.board);
    setTurn(res.data.turn);
    setLegalMoves(res.data.legalMoves);
  }, []);

  const loadRandomPuzzle = useCallback(async () => {
    try {
      setStatus('Loading puzzle...');
      setSolved(false);
      setFailed(false);
      setLastMove(null);
      setMoveIndex(0);
      const res = await axios.get<PublicPuzzle>(`${API_URL}/puzzles/random`);
      setPuzzle(res.data);
      setStatus(`Puzzle #${res.data.id} (rating ${Math.round(res.data.rating)}) — Find the best move for ${res.data.turnToMove === 'L' ? 'Light' : 'Dark'}`);
      await loadLegalMoves(res.data.id, 0);
    } catch (err) {
      setStatus('Failed to load puzzle.');
    }
  }, [loadLegalMoves]);

  // The home dashboard's Daily Puzzle card links here with ?daily=1 — same shared
  // puzzle every visitor gets today (see PuzzlesService.getDailyPuzzle), free
  // regardless of membership tier. Falls back to a random puzzle if, for whatever
  // reason, no daily puzzle is available (e.g. a brand-new install with zero
  // published puzzles yet) rather than showing a dead end.
  const loadDailyPuzzle = useCallback(async () => {
    try {
      setStatus('Loading today\'s puzzle...');
      setSolved(false);
      setFailed(false);
      setLastMove(null);
      setMoveIndex(0);
      const res = await axios.get<PublicPuzzle | null>(`${API_URL}/puzzles/daily`);
      if (!res.data) {
        await loadRandomPuzzle();
        return;
      }
      setPuzzle(res.data);
      setStatus(`Daily Puzzle #${res.data.id} (rating ${Math.round(res.data.rating)}) — Find the best move for ${res.data.turnToMove === 'L' ? 'Light' : 'Dark'}`);
      await loadLegalMoves(res.data.id, 0);
    } catch (err) {
      setStatus('Failed to load the daily puzzle.');
    }
  }, [loadLegalMoves, loadRandomPuzzle]);

  const loadMyRating = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/puzzles/rating`, { headers: { Authorization: `Bearer ${token}` } });
      setMyRating(Math.round(res.data.rating));
    } catch {
      // not logged in / no rating yet — fine, just don't show one
    }
  }, []);

  useEffect(() => {
    if (wantsDaily) {
      loadDailyPuzzle();
    } else {
      loadRandomPuzzle();
    }
    loadMyRating();
    // Deliberately only on mount — this reads the ?daily=1 param once to decide how
    // to open, the same way a page load would; it doesn't need to re-trigger every
    // time loadRandomPuzzle/loadDailyPuzzle's own identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMove = async (move: Move) => {
    if (!puzzle || solved || failed) return;
    const token = localStorage.getItem('token');

    try {
      const res = await axios.post(
        `${API_URL}/puzzles/${puzzle.id}/attempt`,
        { moveIndex, move },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      const result = res.data;

      if (!result.correct) {
        setFailed(true);
        setStatus('Incorrect. That was not the best move.');
        loadMyRating();
        return;
      }

      setBoard(result.board);
      setTurn(result.turn);
      setLastMove(result.opponentMove ?? move); // animate whichever move the board actually last reflects
      setMoveIndex(result.nextMoveIndex);

      if (result.solved) {
        setSolved(true);
        setLegalMoves([]);
        setStatus('Correct! You solved the puzzle.');
        loadMyRating();
      } else {
        setStatus('Correct so far — keep going!');
        await loadLegalMoves(puzzle.id, result.nextMoveIndex);
      }
    } catch (err) {
      setStatus('Something went wrong submitting that move.');
    }
  };

  if (!puzzle || !board) return <div className="p-10 text-center">{status}</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 gap-4">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">Draughts Puzzles</h1>
        {myRating !== null && (
          <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-semibold">
            Puzzle rating: {myRating}
          </span>
        )}
      </div>
      <p className="text-lg text-center max-w-lg">{status}</p>

      <Board
        board={board}
        myColor={solved || failed ? null : puzzle.turnToMove}
        currentTurn={solved || failed ? null : turn}
        legalMoves={legalMoves}
        lastMove={lastMove}
        flipped={puzzle.turnToMove === PieceColor.DARK}
        onMove={handleMove}
      />

      <div className="flex gap-4 mt-2">
        {(solved || failed) && (
          <button onClick={loadRandomPuzzle} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            Next Puzzle
          </button>
        )}
        <button onClick={() => router.push('/puzzles/rush')} className="px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
          Puzzle Storm 🔥
        </button>
        <button onClick={() => router.push('/')} className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
