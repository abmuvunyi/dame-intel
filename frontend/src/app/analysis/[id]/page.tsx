'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';
import { PieceColor, PieceType } from '@/lib/draughts';

// Simplified local engine state just for replaying moves
class ReplayEngine {
  public board: any[][];
  public currentTurn: PieceColor;
  private readonly BOARD_SIZE: number;

  constructor(rules: { boardSize?: number } = {}) {
    this.BOARD_SIZE = rules.boardSize || 8;
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

// Move-classification presentation (Phase 11) — mirrors move-classification.ts's five
// bands on the backend exactly; kept here rather than shared since this is the only
// place classification labels get rendered as UI, and the mapping is trivial.
const CLASSIFICATION_STYLE: Record<string, { label: string, dot: string, badge: string }> = {
  BEST: { label: 'Best', dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' },
  GOOD: { label: 'Good', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800' },
  INACCURACY: { label: 'Inaccuracy', dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-800' },
  MISTAKE: { label: 'Mistake', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' },
  BLUNDER: { label: 'Blunder', dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' },
};

export default function AnalysisPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [game, setGame] = useState<any>(null);
  const [boardStates, setBoardStates] = useState<any[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // Phase 11: the automated post-game review (move classifications + accuracy),
  // computed asynchronously server-side — see GameReviewService. Separate from
  // `evaluations` above, which is this page's own pre-existing on-demand "Run Engine"
  // query for whatever position is currently showing.
  const [review, setReview] = useState<any>(null);

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

  // Fetches the stored review and, while it's still PENDING (the async pass hasn't
  // finished yet — or NOT_STARTED, if this page loaded before the gateway even
  // triggered it), polls every 3s until it lands. Stops polling once COMPLETED or
  // FAILED — this is meant to catch "I opened the game review right after the game
  // ended", not run forever.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const fetchReview = async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/game-review/${id}`);
        if (cancelled) return;
        setReview(res.data);
        if (res.data.status === 'COMPLETED' || res.data.status === 'FAILED') {
          if (interval) clearInterval(interval);
        }
      } catch {
        // Not fatal — the page still works without review data, just without the
        // classification/accuracy panel.
      }
    };

    fetchReview();
    interval = setInterval(fetchReview, 3000);
    return () => { cancelled = true; if (interval) clearInterval(interval); };
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
  // moveReviews are indexed against `moves` (0-based); boardStates[0] is the pre-move
  // starting position, so the review for the move that produced boardStates[N] is
  // moveIndex N-1.
  const currentMoveReview = currentMoveIndex > 0
    ? review?.moveReviews?.find((m: any) => m.moveIndex === currentMoveIndex - 1)
    : null;

  return (
    <div className="flex-1 w-full flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Analysis Board</h1>
          <p className="text-[#c3c3c2] mt-2">
            {game.lightPlayer?.username || 'AI'} (Light) vs {game.darkPlayer?.username || 'AI'} (Dark)
          </p>
        </div>
        <button
          onClick={() => router.push('/profile')}
          className="text-[#c3c3c2] hover:text-white underline font-bold"
        >
          Back to Profile
        </button>
      </div>

      {/* Automated post-game review (Phase 11) — computed once, server-side, shown
          instantly here rather than recomputed on every view. */}
      <div className="w-full max-w-5xl mb-6">
        {!review || review.status === 'NOT_STARTED' || review.status === 'PENDING' ? (
          <div className="bg-[#262421] border border-[#3c3a38] rounded-lg shadow p-4 text-sm text-[#c3c3c2] flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
            Post-game analysis {review?.status === 'PENDING' ? 'in progress' : 'not started yet'}...
          </div>
        ) : review.status === 'FAILED' ? (
          <div className="bg-[#262421] border border-[#3c3a38] rounded-lg shadow p-4 text-sm text-[#b64b1f]">
            Post-game analysis failed: {review.errorMessage || 'unknown error'}
          </div>
        ) : (
          <div className="bg-[#262421] border border-[#3c3a38] rounded-lg shadow p-4 flex gap-8">
            <div>
              <p className="text-xs text-[#c3c3c2] uppercase tracking-wide">Light accuracy</p>
              <p className="text-2xl font-bold text-white">
                {review.lightAccuracy !== null ? `${review.lightAccuracy}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#c3c3c2] uppercase tracking-wide">Dark accuracy</p>
              <p className="text-2xl font-bold text-white">
                {review.darkAccuracy !== null ? `${review.darkAccuracy}%` : '—'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8">

        {/* Left side: Board */}
        <div className="flex flex-col items-center">
            <div className="border-4 border-slate-800 p-1 bg-slate-200 shadow-xl mb-4 bg-[#302e2b]">
              {currentBoard.map((row: any[], r: number) => (
                <div key={r} className="flex">
                  {row.map((cell: any, c: number) => {
                    const isDarkSquare = (r + c) % 2 !== 0;
                    let squareBg = isDarkSquare ? 'bg-[#739552]' : 'bg-[#ebecd0]';

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
               <button onClick={prevMove} disabled={currentMoveIndex === 0} className="px-6 py-2 bg-[#3c3a38] text-white font-bold rounded shadow-md hover:bg-[#4d4a48] transition disabled:opacity-50 disabled:cursor-not-allowed">Previous Move</button>
               <button onClick={nextMove} disabled={currentMoveIndex === boardStates.length - 1} className="px-6 py-2 bg-[#3c3a38] text-white font-bold rounded shadow-md hover:bg-[#4d4a48] transition disabled:opacity-50 disabled:cursor-not-allowed">Next Move</button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <p className="font-bold text-white">Move {currentMoveIndex} of {boardStates.length - 1}</p>
              {currentMoveReview && (
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CLASSIFICATION_STYLE[currentMoveReview.classification].badge}`}>
                  {CLASSIFICATION_STYLE[currentMoveReview.classification].label}
                </span>
              )}
            </div>

            {/* Move-by-move classification strip — click any dot to jump straight to
                that position. Only rendered once the review has real data. */}
            {review?.moveReviews && review.moveReviews.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1 max-w-md justify-center">
                {review.moveReviews.map((mr: any) => (
                  <button
                    key={mr.moveIndex}
                    title={`Move ${mr.moveIndex + 1}: ${CLASSIFICATION_STYLE[mr.classification].label}`}
                    onClick={() => { setCurrentMoveIndex(mr.moveIndex + 1); setEvaluations([]); }}
                    className={`w-3 h-3 rounded-full ${CLASSIFICATION_STYLE[mr.classification].dot} ${currentMoveIndex === mr.moveIndex + 1 ? 'ring-2 ring-offset-1 ring-slate-500' : ''}`}
                  />
                ))}
              </div>
            )}
        </div>

        {/* Right side: Engine */}
        <div className="flex-1 bg-[#262421] p-6 rounded-lg shadow border border-[#3c3a38] h-fit">
           <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
               Engine Evaluation
               <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="ml-auto px-4 py-1 text-sm bg-[#739552] text-white font-bold rounded shadow-md hover:bg-[#81a55d] transition disabled:opacity-50 disabled:cursor-not-allowed"
               >
                   {isAnalyzing ? 'Analyzing...' : 'Run Engine'}
               </button>
           </h2>

           {evaluations.length > 0 ? (
               <div className="space-y-3 mt-4">
                   <p className="text-sm text-[#c3c3c2] mb-2">Best calculated moves for {boardStates[currentMoveIndex].turn === 'L' ? 'Light' : 'Dark'} at Depth 4:</p>
                   {evaluations.slice(0, 5).map((ev, idx) => (
                       <div key={idx} className="flex justify-between items-center p-3 bg-[#302e2b] rounded border border-[#3c3a38]">
                           <div className="font-mono text-sm text-white">
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
               <p className="text-[#858482] italic mt-10 text-center">Click 'Run Engine' to see evaluations for this position.</p>
           )}
        </div>

      </div>
    </div>
  );
}