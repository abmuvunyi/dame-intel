'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';
import { PieceColor, PieceType } from '@/components/game/GameBoard';

import { GameVariant } from '@/components/game/GameBoard';

// Simplified local engine state just for replaying moves
class ReplayEngine {
  public board: any[][];
  public currentTurn: PieceColor;
  private readonly BOARD_SIZE: number;

  constructor(rules: { variant?: GameVariant } = {}) {
    this.BOARD_SIZE = rules.variant === GameVariant.INTERNATIONAL ? 10 : 8;
    this.board = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));

    const rowsOfPieces = this.BOARD_SIZE === 10 ? 4 : 3;

    for (let row = 0; row < rowsOfPieces; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 !== 0) this.board[row][col] = { color: PieceColor.DARK, type: PieceType.MAN };
      }
    }
    for (let row = this.BOARD_SIZE - rowsOfPieces; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 !== 0) this.board[row][col] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      }
    }
    this.currentTurn = PieceColor.LIGHT;
  }

  makeMove(move: any) {
    const piece = this.board[move.from.row][move.from.col];
    this.board[move.to.row][move.to.col] = piece;
    this.board[move.from.row][move.from.col] = null;

    if (move.captured) {
       for(const cap of move.captured) {
           this.board[cap.row][cap.col] = null;
       }
    }

    if (piece.type === PieceType.MAN) {
      if (piece.color === PieceColor.LIGHT && move.to.row === 0) piece.type = PieceType.KING;
      if (piece.color === PieceColor.DARK && move.to.row === this.BOARD_SIZE - 1) piece.type = PieceType.KING;
    }
    this.currentTurn = this.currentTurn === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
  }
}

export default function AnalysisPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [game, setGame] = useState<any>(null);
  const [boardStates, setBoardStates] = useState<any[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const fetchGame = async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/history/game/${id}`);
        setGame(res.data);

        // Pre-compute all states
        const rules = typeof res.data.rules === 'string' ? JSON.parse(res.data.rules) : (res.data.rules || {});
        const engine = new ReplayEngine(rules);
        const states = [{ board: JSON.parse(JSON.stringify(engine.board)), turn: engine.currentTurn, moveInfo: null }];

        let moveArray = [];
        try {
            moveArray = typeof res.data.moves === 'string' ? JSON.parse(res.data.moves) : res.data.moves;
        } catch(e) {}

        if (Array.isArray(moveArray)) {
            for (const move of moveArray) {
              engine.makeMove(move);
              states.push({
                 board: JSON.parse(JSON.stringify(engine.board)),
                 turn: engine.currentTurn,
                 moveInfo: move
              });
            }
        }
        setBoardStates(states);
      } catch (err) {
        console.error(err);
      }
    };
    if (id) fetchGame();
  }, [id]);

  const handleAnalyze = async () => {
    if (!boardStates[currentMoveIndex]) return;
    setIsAnalyzing(true);
    try {
      const state = boardStates[currentMoveIndex];
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/analysis`, {
        board: state.board,
        turn: state.turn,
        depth: 4
      });
      setEvaluations(res.data);
    } catch(err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const nextMove = () => {
      if (currentMoveIndex < boardStates.length - 1) {
          setCurrentMoveIndex(currentMoveIndex + 1);
          setEvaluations([]); // Clear evals when moving
      }
  };

  const prevMove = () => {
      if (currentMoveIndex > 0) {
          setCurrentMoveIndex(currentMoveIndex - 1);
          setEvaluations([]);
      }
  };

  // Automatically analyze the new board state whenever the move index changes
  useEffect(() => {
      handleAnalyze();
  }, [currentMoveIndex]);

  if (!game || boardStates.length === 0) return <div className="p-10 text-center">Loading game data...</div>;

  const currentBoard = boardStates[currentMoveIndex].board;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Analysis Board</h1>
          <p className="text-gray-600 mt-2">
            {game.lightPlayer?.username || 'AI'} (Light) vs {game.darkPlayer?.username || 'AI'} (Dark)
          </p>
        </div>
        <button
          onClick={() => router.push('/profile')}
          className="text-blue-600 hover:underline font-medium"
        >
          Back to Profile
        </button>
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8">

        {/* Left side: Board */}
        <div className="flex flex-col items-center">
            <div className="border-4 border-gray-800 p-1 bg-gray-200 shadow-xl mb-4">
              {currentBoard.map((row: any[], r: number) => (
                <div key={r} className="flex">
                  {row.map((cell: any, c: number) => {
                    const isDarkSquare = (r + c) % 2 !== 0;
                    let squareBg = isDarkSquare ? 'bg-amber-900' : 'bg-amber-200';

                    // Highlight the best move calculated by the engine if available
                    const bestMove = evaluations.length > 0 ? evaluations[0].move : null;
                    const isBestMoveFrom = bestMove && bestMove.from.row === r && bestMove.from.col === c;
                    const isBestMoveTo = bestMove && bestMove.to.row === r && bestMove.to.col === c;

                    if (isBestMoveFrom) squareBg = 'bg-blue-400';
                    if (isBestMoveTo) squareBg = 'bg-green-400 opacity-90';

                    // Dynamically adjust sizes for 10x10 boards
                    const is10x10 = currentBoard.length === 10;
                    const cellClass = is10x10 ? 'w-12 h-12' : 'w-16 h-16';
                    const pieceClass = is10x10 ? 'w-10 h-10 border-2' : 'w-12 h-12 border-4';
                    const stackClass = is10x10 ? 'w-10 h-10 border-2 absolute -top-1 -left-1' : 'w-12 h-12 border-4 absolute -top-1.5 -left-1.5';

                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`${cellClass} flex items-center justify-center ${squareBg} relative`}
                      >
                        {cell && (
                          <div className={`
                            ${pieceClass} rounded-full shadow-md flex items-center justify-center text-white font-bold
                            ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-300' : 'bg-slate-800 border-slate-900'}
                            ${cell.type === PieceType.KING ? 'absolute bottom-1 right-1' : ''}
                          `}>
                            {/* Stacked piece visual for King */}
                            {cell.type === PieceType.KING && (
                              <div className={`
                                ${stackClass} rounded-full shadow-md
                                ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-300' : 'bg-slate-800 border-slate-900'}
                              `} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex gap-4">
               <button onClick={prevMove} disabled={currentMoveIndex === 0} className="px-6 py-2 bg-gray-800 text-white rounded disabled:opacity-50">Previous Move</button>
               <button onClick={nextMove} disabled={currentMoveIndex === boardStates.length - 1} className="px-6 py-2 bg-gray-800 text-white rounded disabled:opacity-50">Next Move</button>
            </div>
            <p className="mt-4 font-medium text-gray-700">Move {currentMoveIndex} of {boardStates.length - 1}</p>
        </div>

        {/* Right side: Engine */}
        <div className="flex-1 bg-white p-6 rounded-lg shadow border border-gray-200 h-fit">
           <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
               Engine Evaluation
               <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="ml-auto px-4 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
               >
                   {isAnalyzing ? 'Analyzing...' : 'Run Engine'}
               </button>
           </h2>

           {evaluations.length > 0 ? (
               <div className="space-y-3 mt-4">
                   <p className="text-sm text-gray-500 mb-2">Best calculated moves for {boardStates[currentMoveIndex].turn === 'L' ? 'Light' : 'Dark'} at Depth 4:</p>
                   {evaluations.slice(0, 5).map((ev, idx) => (
                       <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded border">
                           <div className="font-mono text-sm text-gray-800">
                               ({ev.move.from.row},{ev.move.from.col}) → ({ev.move.to.row},{ev.move.to.col})
                               {ev.move.captured && ev.move.captured.length > 0 && <span className="text-red-500 font-bold ml-2">x{ev.move.captured.length}</span>}
                           </div>
                           <div className={`font-bold ${ev.evaluation > 0 ? 'text-green-600' : (ev.evaluation < 0 ? 'text-red-600' : 'text-gray-500')}`}>
                               {ev.evaluation > 0 ? '+' : ''}{ev.evaluation.toFixed(1)}
                           </div>
                       </div>
                   ))}
               </div>
           ) : (
               <p className="text-gray-500 italic mt-10 text-center">Click 'Run Engine' to see evaluations for this position.</p>
           )}
        </div>

      </div>
    </div>
  );
}