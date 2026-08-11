'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { BoardState, Move, PieceColor } from '@/lib/draughts';
import Board from '@/components/game/Board';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const DURATION_SECONDS = 180;

interface RushPuzzle {
  id: number;
  turnToMove: PieceColor;
}

export default function PuzzleRushPage() {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [puzzle, setPuzzle] = useState<RushPuzzle | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [turn, setTurn] = useState<PieceColor | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  // Server-authoritative, same principle as the game clocks (Phase 5): this snapshot
  // is only ever set from a server response; the ticking display below it is local.
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(DURATION_SECONDS);
  const [displaySeconds, setDisplaySeconds] = useState(DURATION_SECONDS);
  const [ended, setEnded] = useState(false);
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null);
  const snapshotAt = useRef(Date.now());
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - snapshotAt.current) / 1000;
      setDisplaySeconds(Math.max(0, Math.round(timeLeftSeconds - elapsed)));
    }, 250);
    return () => clearInterval(interval);
  }, [timeLeftSeconds]);

  const loadLegalMoves = useCallback(async (puzzleId: number, atMoveIndex: number) => {
    const res = await axios.get(`${API_URL}/puzzles/${puzzleId}/legal-moves`, { params: { moveIndex: atMoveIndex } });
    setBoard(res.data.board);
    setTurn(res.data.turn);
    setLegalMoves(res.data.legalMoves);
  }, []);

  const start = useCallback(async () => {
    setEnded(false);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setMoveIndex(0);
    setLastMove(null);
    const token = localStorage.getItem('token');
    const res = await axios.post(
      `${API_URL}/puzzles/rush/start`,
      { durationSeconds: DURATION_SECONDS },
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );
    setSessionId(res.data.sessionId);
    setPuzzle(res.data.puzzle);
    setTimeLeftSeconds(res.data.timeLeftSeconds);
    snapshotAt.current = Date.now();
    await loadLegalMoves(res.data.puzzle.id, 0);
  }, [loadLegalMoves]);

  useEffect(() => {
    start();
  }, [start]);

  const handleMove = async (move: Move) => {
    if (!sessionId || !puzzle || ended) return;

    const res = await axios.post(`${API_URL}/puzzles/rush/${sessionId}/attempt`, { moveIndex, move });
    const result = res.data;

    setScore(result.score);
    setStreak(result.streak);
    setBestStreak(result.bestStreak);
    setTimeLeftSeconds(result.timeLeftSeconds);
    snapshotAt.current = Date.now();
    setFlash(result.correct ? 'correct' : 'wrong');
    setTimeout(() => setFlash(null), 400);

    if (result.ended) {
      setEnded(true);
      return;
    }

    if (result.nextPuzzle) {
      // Either solved (advance to a brand-new puzzle) or got it wrong (Storm mode
      // moves on immediately rather than ending the run — see puzzle-rush.service.ts).
      setPuzzle(result.nextPuzzle);
      setMoveIndex(0);
      setLastMove(null);
      await loadLegalMoves(result.nextPuzzle.id, 0);
    } else {
      // Correct, but a multi-move puzzle isn't finished yet — stay on it.
      setBoard(result.board);
      setTurn(result.turn);
      setLastMove(result.opponentMove ?? move);
      setMoveIndex(result.nextMoveIndex);
      await loadLegalMoves(puzzle.id, result.nextMoveIndex);
    }
  };

  if (ended) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <h1 className="text-4xl font-bold">⏱️ Time's up!</h1>
        <p className="text-2xl">Score: <span className="font-bold">{score}</span></p>
        <p className="text-lg text-gray-600">Best streak: {bestStreak}</p>
        <div className="flex gap-4 mt-4">
          <button onClick={start} className="px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
            Run it back
          </button>
          <button onClick={() => router.push('/puzzles')} className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
            Back to Puzzles
          </button>
        </div>
      </div>
    );
  }

  if (!board || !puzzle) return <div className="p-10 text-center">Starting Puzzle Storm...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 gap-4">
      <h1 className="text-3xl font-bold">Puzzle Storm 🔥</h1>
      <div className="flex gap-6 text-lg font-semibold">
        <span className={`px-4 py-1 rounded ${displaySeconds <= 20 ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200'}`}>⏱ {displaySeconds}s</span>
        <span>Score: {score}</span>
        <span>Streak: {streak} (best {bestStreak})</span>
      </div>

      <div className={`transition-colors rounded ${flash === 'correct' ? 'ring-4 ring-green-400' : flash === 'wrong' ? 'ring-4 ring-red-400' : ''}`}>
        <Board
          board={board}
          myColor={puzzle.turnToMove}
          currentTurn={turn}
          legalMoves={legalMoves}
          lastMove={lastMove}
          flipped={puzzle.turnToMove === PieceColor.DARK}
          onMove={handleMove}
        />
      </div>

      <button onClick={() => router.push('/puzzles')} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm">
        Quit run
      </button>
    </div>
  );
}
