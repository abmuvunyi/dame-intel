'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export enum PieceColor {
  LIGHT = 'L',
  DARK = 'D',
}
export enum PieceType {
  MAN = 'M',
  KING = 'K',
}

export default function PuzzlesPage() {
  const [puzzle, setPuzzle] = useState<any>(null);
  const [selectedPos, setSelectedPos] = useState<any>(null);
  const [status, setStatus] = useState<string>('Loading puzzle...');
  const [solved, setSolved] = useState<boolean>(false);
  const router = useRouter();

  const loadRandomPuzzle = async () => {
    try {
      setStatus('Loading puzzle...');
      setSolved(false);
      setSelectedPos(null);
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/puzzles/random`);
      setPuzzle(res.data);
      setStatus(`Puzzle #${res.data.id} - Difficulty: ${res.data.difficulty} - Find the best move for ${res.data.turnToMove === 'L' ? 'Light' : 'Dark'}`);
    } catch (err) {
      setStatus('Failed to load puzzle.');
    }
  };

  useEffect(() => {
    loadRandomPuzzle();
  }, []);

  const handleSquareClick = (r: number, c: number) => {
    if (!puzzle || solved) return;

    if (selectedPos) {
      // Trying to move
      const move = {
        from: { row: selectedPos.row, col: selectedPos.col },
        to: { row: r, col: c }
      };

      const correct = puzzle.correctMove;
      if (move.from.row === correct.from.row && move.from.col === correct.from.col &&
          move.to.row === correct.to.row && move.to.col === correct.to.col) {

        // Apply move locally just to show it
        const newBoard = JSON.parse(JSON.stringify(puzzle.board));
        newBoard[move.to.row][move.to.col] = newBoard[move.from.row][move.from.col];
        newBoard[move.from.row][move.from.col] = null;

        // Remove captured pieces if any
        if (correct.captured) {
           for (const cap of correct.captured) {
              newBoard[cap.row][cap.col] = null;
           }
        }

        setPuzzle({ ...puzzle, board: newBoard });
        setSolved(true);
        setStatus('Correct! You solved the puzzle.');
      } else {
        setStatus('Incorrect move. Try again!');
        setSelectedPos(null);
      }
    } else {
      // Select piece
      const piece = puzzle.board[r][c];
      if (piece && piece.color === puzzle.turnToMove) {
        setSelectedPos({ row: r, col: c });
      }
    }
  };

  if (!puzzle) return <div className="p-10 text-center">{status}</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10">
      <h1 className="text-3xl font-bold mb-4">Draughts Puzzles</h1>
      <p className="text-lg mb-6">{status}</p>

      <div className="border-4 border-gray-800 p-1 bg-gray-200 shadow-xl mb-6">
        {puzzle.board.map((row: any[], r: number) => (
          <div key={r} className="flex">
            {row.map((cell: any, c: number) => {
              const isDarkSquare = (r + c) % 2 !== 0;
              const isSelected = selectedPos?.row === r && selectedPos?.col === c;

              let squareBg = isDarkSquare ? 'bg-amber-900' : 'bg-amber-200';
              if (isSelected) squareBg = 'bg-yellow-400';

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleSquareClick(r, c)}
                  className={`w-16 h-16 flex items-center justify-center ${squareBg} cursor-pointer transition-colors`}
                >
                  {cell && (
                    <div className={`
                      w-12 h-12 rounded-full shadow-md flex items-center justify-center text-white font-bold
                      ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-4 border-slate-300 text-slate-800' : 'bg-slate-800 border-4 border-slate-900 text-slate-200'}
                      ${cell.type === PieceType.KING ? 'ring-2 ring-yellow-500' : ''}
                    `}>
                      {cell.type === PieceType.KING && 'K'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        {solved && (
          <button
            onClick={loadRandomPuzzle}
            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Next Puzzle
          </button>
        )}
        <button
          onClick={() => router.push('/')}
          className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}