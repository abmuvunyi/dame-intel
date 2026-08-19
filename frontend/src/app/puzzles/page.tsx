'use client';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
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

export default function PuzzlesPage() {
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
    loadRandomPuzzle();
    loadMyRating();
  }, [loadRandomPuzzle, loadMyRating]);

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

  if (!puzzle || !board) return <div className="p-10 text-center text-[#c3c3c2]">{status}</div>;

  return (
    <div className="flex-1 w-full flex flex-col items-center py-10 gap-4">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold text-white">Draughts Puzzles</h1>
        {myRating !== null && (
          <span className="px-3 py-1 bg-[#262421] text-[#739552] border border-[#3c3a38] rounded-full text-sm font-bold">
            Puzzle rating: {myRating}
          </span>
        )}
      </div>
      <p className="text-lg text-[#c3c3c2] text-center max-w-lg">{status}</p>

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
          <button onClick={loadRandomPuzzle} className="px-6 py-2 bg-[#739552] text-white font-bold rounded shadow-md hover:bg-[#81a55d] transition">
            Next Puzzle
          </button>
        )}
        <button onClick={() => router.push('/puzzles/rush')} className="px-6 py-2 bg-[#b64b1f] text-white font-bold rounded shadow-md hover:bg-[#c95322] transition">
          Puzzle Storm 🔥
        </button>
        <button onClick={() => router.push('/')} className="px-6 py-2 bg-[#3c3a38] text-white font-bold rounded shadow-md hover:bg-[#4d4a48] transition">
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
