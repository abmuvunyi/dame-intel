'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PieceColor, PieceType } from '@/lib/draughts';
import EvalBar from '@/components/game/EvalBar';
import EvalGraph from '@/components/game/EvalGraph';
import { API_BASE } from '@/lib/api';

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
  // Phase 13: the analysis endpoint now caps search depth by membership tier (see
  // analysis.controller.ts) and reports back what actually ran, rather than always
  // honoring the requested depth — surfaced here so a capped free-tier user sees why
  // and gets a path to upgrade, instead of a silently shallower engine line.
  const [depthInfo, setDepthInfo] = useState<{ depthUsed: number, depthCapped: boolean, maxDepth: number } | null>(null);
  // Free's analysisMaxDepth is 0 (billing/plans.ts) — the endpoint refuses outright
  // (403) rather than clamping, so the on-demand "Run Engine" panel needs its own
  // locked state distinct from "haven't clicked Run Engine yet".
  const [analysisLocked, setAnalysisLocked] = useState(false);
  // Phase 11: the automated post-game review (move classifications + accuracy),
  // computed asynchronously server-side — see GameReviewService. Separate from
  // `evaluations` above, which is this page's own pre-existing on-demand "Run Engine"
  // query for whatever position is currently showing.
  const [review, setReview] = useState<any>(null);
  // A short engine-vs-engine continuation being previewed on the board — either
  // "why the recommended move is best" (GameReview.MoveReview.recommendedLine) or
  // "how a mistake gets punished" (...punishmentLine), both computed server-side by
  // GameReviewService so this page never has to run its own extra searches. Distinct
  // from `currentMoveIndex`/boardStates (the REAL game) — this is a hypothetical
  // overlay, stepped through independently and clearly labeled as such.
  const [previewLine, setPreviewLine] = useState<{ moves: any[]; label: string } | null>(null);
  const [previewPly, setPreviewPly] = useState(0);

  const exitPreview = () => { setPreviewLine(null); setPreviewPly(0); };

  useEffect(() => {
    const fetchGame = async () => {
      try {
        const res = await axios.get(`${API_BASE}/history/game/${id}`);
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

    const fetchReview = async () => {
      try {
        // Signed-in players send their token: the whole review (not just the
        // engine's "best continuation"/"punishment" lines) requires a plan with
        // fullGameReview — Plus, Premium, or an active trial of either.
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_BASE}/game-review/${id}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
        if (cancelled) return;
        setReview(res.data);
        if (['COMPLETED', 'FAILED', 'LOCKED'].includes(res.data.status)) {
          if (interval) clearInterval(interval);
        }
      } catch {
        // Not fatal — the page still works without review data, just without the
        // classification/accuracy panel.
      }
    };

    // fetchReview only touches `interval` after its first await, by which point
    // this const is initialised.
    const interval = setInterval(fetchReview, 3000);
    void fetchReview();
    return () => { cancelled = true; clearInterval(interval); };
  }, [id]);

  const handleAnalyze = async () => {
    if (!boardStates[currentMoveIndex]) return;
    setIsAnalyzing(true);
    try {
      const state = boardStates[currentMoveIndex];
      // Ask for the Premium ceiling (8) regardless of who's asking — the endpoint
      // itself clamps this down to whatever the caller's actual plan allows
      // (billing/plans.ts's entitlements.analysisMaxDepth) and reports back what it
      // really used, so there's no benefit to under-requesting here. Free/anonymous
      // callers get refused outright (403) rather than clamped, since Free's own
      // ceiling is 0 — handled below.
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE}/analysis`,
        { board: state.board, turn: state.turn, depth: 8 },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      setEvaluations(res.data.evaluations);
      setDepthInfo({ depthUsed: res.data.depthUsed, depthCapped: res.data.depthCapped, maxDepth: res.data.maxDepth });
      setAnalysisLocked(false);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setAnalysisLocked(true);
      } else {
        console.error(err);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const nextMove = () => {
      if (currentMoveIndex < boardStates.length - 1) {
          setCurrentMoveIndex(currentMoveIndex + 1);
          setEvaluations([]); // Clear evals when moving
          setDepthInfo(null);
          exitPreview();
      }
  };

  const prevMove = () => {
      if (currentMoveIndex > 0) {
          setCurrentMoveIndex(currentMoveIndex - 1);
          setEvaluations([]);
          setDepthInfo(null);
          exitPreview();
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

  // The eval bar's reading for whatever position is currently showing: the starting
  // position is a known, symmetric 0 (no move has been made yet to have a stored
  // review for); every later position's evaluation is the LIGHT-normalized value
  // GameReviewService already computed and stored alongside that move's
  // classification — see game-review.entity.ts's MoveReview.evaluation. `null` (not
  // 0) whenever the review genuinely isn't ready yet, so the bar can tell "even
  // position" apart from "no data yet" instead of defaulting to a misleading 50/50.
  const currentEvaluation: number | null = currentMoveIndex === 0
    ? 0
    : (currentMoveReview ? currentMoveReview.evaluation : null);

  // Auto-surface the engine's own best move the moment a review is available and the
  // move about to be played FROM this position wasn't it — the same "here's what you
  // should play instead" signal chess.com shows automatically on a mistake/blunder,
  // not gated behind manually clicking "Run Engine". Deliberately keyed by
  // moveIndex === currentMoveIndex (the move this position is ABOUT to produce), not
  // currentMoveReview above (moveIndex === currentMoveIndex - 1, the move that
  // already produced this position) — that review's bestMove is a move from the
  // PREVIOUS position, and would overlay onto totally unrelated squares here. Falls
  // back to the on-demand evaluations panel's own top pick otherwise (e.g. review not
  // ready yet, this is the final position with no next move, or the move actually
  // played from here WAS best and there's nothing to point out).
  const upcomingMoveReview = review?.moveReviews?.find((m: any) => m.moveIndex === currentMoveIndex);
  const reviewBestMove = upcomingMoveReview && upcomingMoveReview.classification !== 'BEST'
    ? upcomingMoveReview.bestMove
    : null;

  // Both preview lines start from the SAME position: recommendedLine is "the move
  // that should be played FROM here" (upcomingMoveReview, keyed like reviewBestMove
  // above), and punishmentLine is "what follows the move that just produced this
  // position" (currentMoveReview, keyed like the classification badge below) — the
  // position right after a mistake is exactly the position currently on screen.
  const canShowBestContinuation = !!upcomingMoveReview?.recommendedLine?.length;
  const canShowPunishment = !!currentMoveReview?.punishmentLine?.length
    && (currentMoveReview.classification === 'MISTAKE' || currentMoveReview.classification === 'BLUNDER');

  const startPreview = (moves: any[], label: string) => {
    setPreviewLine({ moves, label });
    setPreviewPly(0);
  };

  // Applies the first `previewPly` moves of the active preview line on top of the
  // CURRENT position (not the real game state) — a hypothetical overlay, computed
  // fresh on every render rather than stored, since it only ever depends on what's
  // already in memory.
  const previewBoard = (() => {
    if (!previewLine) return null;
    const rules = typeof game.rules === 'string' ? JSON.parse(game.rules) : (game.rules || {});
    const engine = new ReplayEngine(rules);
    engine.board = JSON.parse(JSON.stringify(boardStates[currentMoveIndex].board));
    engine.currentTurn = boardStates[currentMoveIndex].turn;
    for (let i = 0; i < previewPly; i++) engine.makeMove(previewLine.moves[i]);
    return engine.board;
  })();

  // Matches the board's own rendered size (see cellClass below: 80px cells for 8x8,
  // 64px cells for 10x10, plus the board's own 4px border + 4px padding per side) so
  // the eval bar sits flush against the board rather than floating at some unrelated
  // height.
  const is10x10Board = currentBoard.length === 10;
  const boardHeightPx = is10x10Board ? 10 * 64 + 16 : 8 * 80 + 16;

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

      {/* Automated post-game review (Phase 11) — computed once, server-side, shown
          instantly here rather than recomputed on every view. Product decision
          (2026-09): the whole review (not just the best-move/punishment lines) now
          requires a paid plan — see game-review.controller.ts. */}
      <div className="w-full max-w-5xl mb-6">
        {review?.status === 'LOCKED' ? (
          <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              Game review (accuracy, move-by-move classifications, and the eval bar) requires a {review.requiresPlan === 'PREMIUM' ? 'Premium' : 'Plus'} plan.
            </p>
            <Link href="/membership" className="shrink-0 px-4 py-1.5 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 transition">
              Upgrade
            </Link>
          </div>
        ) : !review || review.status === 'NOT_STARTED' || review.status === 'PENDING' ? (
          <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-500 flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
            Post-game analysis {review?.status === 'PENDING' ? 'in progress' : 'not started yet'}...
          </div>
        ) : review.status === 'FAILED' ? (
          <div className="bg-white rounded-lg shadow p-4 text-sm text-red-600">
            Post-game analysis failed: {review.errorMessage || 'unknown error'}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-4 flex gap-8">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Light accuracy</p>
              <p className="text-2xl font-bold text-slate-700">
                {review.lightAccuracy !== null ? `${review.lightAccuracy}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Dark accuracy</p>
              <p className="text-2xl font-bold text-slate-900">
                {review.darkAccuracy !== null ? `${review.darkAccuracy}%` : '—'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8">

        {/* Left side: Eval bar + Board */}
        <div className="flex flex-col items-center">
          <div className="flex items-start gap-3">
            <EvalBar evaluation={currentEvaluation} heightPx={boardHeightPx} />
            <div>
            <div className={`border-4 p-1 shadow-xl mb-4 ${previewLine ? 'border-purple-600 bg-purple-100' : 'border-gray-800 bg-gray-200'}`}>
              {(previewBoard ?? currentBoard).map((row: any[], r: number) => (
                <div key={r} className="flex">
                  {row.map((cell: any, c: number) => {
                    const isDarkSquare = (r + c) % 2 !== 0;
                    let squareBg = isDarkSquare ? 'bg-amber-900' : 'bg-amber-200';

                    // While previewing a hypothetical line, highlight whichever ply
                    // is ABOUT to be played next in it (so stepping through reads the
                    // same way the real best-move highlight does); otherwise prefer
                    // the stored review's own best move (available immediately, no
                    // click needed — see reviewBestMove above), falling back to the
                    // on-demand "Run Engine" panel's own top pick.
                    const bestMove = previewLine
                      ? (previewPly < previewLine.moves.length ? previewLine.moves[previewPly] : null)
                      : (reviewBestMove || (evaluations.length > 0 ? evaluations[0].move : null));
                    const isBestMoveFrom = bestMove && bestMove.from.row === r && bestMove.from.col === c;
                    const isBestMoveTo = bestMove && bestMove.to.row === r && bestMove.to.col === c;

                    if (isBestMoveFrom) squareBg = previewLine ? 'bg-purple-400' : 'bg-blue-400';
                    if (isBestMoveTo) squareBg = previewLine ? 'bg-purple-300 opacity-90' : 'bg-green-400 opacity-90';

                    // Board/king visual pass (matches Board.tsx's own treatment):
                    // a bigger board (12/16 -> 16/20) and a king shown as a gold
                    // ring + crown glyph rather than a second stacked disc of the
                    // same color, which read as just another man at a glance.
                    const is10x10 = currentBoard.length === 10;
                    const cellClass = is10x10 ? 'w-16 h-16' : 'w-20 h-20';
                    const pieceClass = is10x10 ? 'w-[52px] h-[52px] border-2' : 'w-16 h-16 border-4';
                    const isKing = cell?.type === PieceType.KING;

                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`${cellClass} flex items-center justify-center ${squareBg} relative`}
                      >
                        {cell && (
                          <div className={`
                            ${pieceClass} rounded-full shadow-md flex items-center justify-center text-white font-bold
                            ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-300' : 'bg-slate-800 border-slate-900'}
                            ${isKing ? 'ring-4 ring-amber-400 shadow-amber-400/70 shadow-lg' : ''}
                          `}>
                            {isKing && (
                              <span className="pointer-events-none select-none leading-none text-2xl">👑</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            </div>
          </div>

            <div className="flex gap-4">
               <button onClick={prevMove} disabled={currentMoveIndex === 0} className="px-6 py-2 bg-gray-800 text-white rounded disabled:opacity-50">Previous Move</button>
               <button onClick={nextMove} disabled={currentMoveIndex === boardStates.length - 1} className="px-6 py-2 bg-gray-800 text-white rounded disabled:opacity-50">Next Move</button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <p className="font-medium text-gray-700">Move {currentMoveIndex} of {boardStates.length - 1}</p>
              {currentMoveReview && (
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${CLASSIFICATION_STYLE[currentMoveReview.classification].badge}`}>
                  {CLASSIFICATION_STYLE[currentMoveReview.classification].label}
                </span>
              )}
            </div>

            {/* "Best move" / "how this gets punished" previews — a real, engine-
                followed continuation (computed once, server-side, by
                GameReviewService), not a generated explanation: this codebase has no
                honest way to produce natural-language tactical reasoning, so showing
                the actual line the engine expects, move by move, is the concrete
                stand-in for "why". */}
            {!previewLine && (canShowBestContinuation || canShowPunishment) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {canShowBestContinuation && (
                  <button
                    onClick={() => startPreview(upcomingMoveReview.recommendedLine, 'Engine’s suggested continuation')}
                    className="px-3 py-1.5 text-xs font-semibold bg-purple-100 text-purple-800 rounded hover:bg-purple-200 transition"
                  >
                    Show Best Continuation
                  </button>
                )}
                {canShowPunishment && (
                  <button
                    onClick={() => startPreview(currentMoveReview.punishmentLine, 'How this could be punished')}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-800 rounded hover:bg-red-200 transition"
                  >
                    See How This Gets Punished
                  </button>
                )}
              </div>
            )}

            {previewLine && (
              <div className="mt-2 w-full max-w-md bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-purple-800">{previewLine.label}</p>
                  <button onClick={exitPreview} className="text-xs text-purple-600 hover:underline font-medium">
                    Exit preview
                  </button>
                </div>
                <p className="text-[11px] text-purple-500 mb-2">
                  A hypothetical engine-vs-engine line from here — not necessarily what actually happened next in the game.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewPly(p => Math.max(0, p - 1))}
                    disabled={previewPly === 0}
                    className="px-3 py-1 text-xs bg-purple-700 text-white rounded disabled:opacity-40"
                  >
                    ← Back
                  </button>
                  <span className="text-xs text-purple-700 font-mono">{previewPly} / {previewLine.moves.length}</span>
                  <button
                    onClick={() => setPreviewPly(p => Math.min(previewLine.moves.length, p + 1))}
                    disabled={previewPly === previewLine.moves.length}
                    className="px-3 py-1 text-xs bg-purple-700 text-white rounded disabled:opacity-40"
                  >
                    Forward →
                  </button>
                </div>
              </div>
            )}

            {/* Full-game evaluation graph — the eval bar's reading plotted across
                every ply, with mistake/blunder markers landing right where the swing
                actually happened. Click anywhere to jump straight to that position;
                replaces the old plain classification-dot strip with something that
                actually shows the shape of the game, not just a row of colored
                dots. */}
            {review?.moveReviews && review.moveReviews.length > 0 && (
              <div className="mt-3 w-full max-w-md">
                <EvalGraph
                  moveReviews={review.moveReviews}
                  totalMoves={boardStates.length - 1}
                  currentMoveIndex={currentMoveIndex}
                  onSelectMove={(idx: number) => { setCurrentMoveIndex(idx); setEvaluations([]); setDepthInfo(null); exitPreview(); }}
                />
                <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400 justify-center">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Mistake</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Blunder</span>
                </div>
              </div>
            )}
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

           {analysisLocked ? (
               <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800 text-center">
                 Engine analysis requires a Plus or Premium plan.{' '}
                 <Link href="/membership" className="font-semibold underline hover:text-amber-900">
                   Upgrade
                 </Link>{' '}
                 to unlock it.
               </div>
           ) : evaluations.length > 0 ? (
               <div className="space-y-3 mt-4">
                   <p className="text-sm text-gray-500 mb-2">
                     Best calculated moves for {boardStates[currentMoveIndex].turn === 'L' ? 'Light' : 'Dark'} at Depth {depthInfo?.depthUsed ?? '?'}:
                   </p>
                   {depthInfo?.depthCapped && (
                     <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                       Your plan is capped at depth {depthInfo.maxDepth}.{' '}
                       <Link href="/membership" className="font-semibold underline hover:text-amber-900">
                         Upgrade
                       </Link>{' '}
                       for deeper analysis.
                     </div>
                   )}
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
               <p className="text-gray-500 italic mt-10 text-center">Click &apos;Run Engine&apos; to see evaluations for this position.</p>
           )}
        </div>

      </div>
    </div>
  );
}