'use client';

import { useEffect, useRef, useState } from 'react';
import { BoardState, Move, Piece, PieceColor, PieceType, Position } from '@/lib/draughts';

interface TrackedPiece {
  id: number;
  row: number;
  col: number;
  color: PieceColor;
  type: PieceType;
  removing?: boolean;
}

interface BoardProps {
  board: BoardState;
  myColor: PieceColor | null; // null = spectator
  currentTurn: PieceColor | null;
  legalMoves: Move[];
  lastMove: Move | null;
  flipped: boolean;
  onMove: (move: Move) => void;
}

// How long the CSS transition for a moving/captured piece takes. Kept in one place
// since the fade-out removal timer below has to match the CSS duration exactly.
const TRANSITION_MS = 260;

// Board size, take 2: cell size used to be a flat constant (48/64px) regardless of
// how much room was actually available, which is why the board read as small even on
// a wide screen — increasing that constant outright would just as easily overflow a
// narrower one. Instead, the outer wrapper's OWN measured width (via ResizeObserver,
// not the window's) drives the cell size, clamped between a floor (still legible on a
// phone) and a new, meaningfully larger ceiling (up from 64/48 to 88/68) — the board
// now genuinely fills whatever column it's placed in, up to a sensible cap, rather
// than always rendering at the same size regardless of context.
const MAX_CELL_PX = { 8: 88, 10: 68 } as const;
const MIN_CELL_PX = { 8: 40, 10: 32 } as const;

export default function Board({ board, myColor, currentTurn, legalMoves, lastMove, flipped, onMove }: BoardProps) {
  const size = board.length;
  const canMove = myColor !== null && currentTurn === myColor;
  const boardSizeKey = size === 10 ? 10 : 8;

  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [pieces, setPieces] = useState<TrackedPiece[]>([]);
  const [drag, setDrag] = useState<{ id: number; from: Position; x: number; y: number } | null>(null);
  const nextId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const removeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [cellPx, setCellPx] = useState<number>(MAX_CELL_PX[boardSizeKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const available = container.clientWidth;
      const fitted = Math.floor((available - 8) / size);
      const clamped = Math.max(MIN_CELL_PX[boardSizeKey], Math.min(MAX_CELL_PX[boardSizeKey], fitted));
      setCellPx(clamped);
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [size, boardSizeKey]);

  // Keep a stable-identity piece list so CSS transitions can animate a piece moving
  // from one square to another, instead of a square's content just changing instantly.
  useEffect(() => {
    if (!lastMove) {
      // Fresh position (game start, spectator join, etc.) — no move to animate from.
      const fresh: TrackedPiece[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board[r][c];
          if (cell) fresh.push({ id: nextId.current++, row: r, col: c, color: cell.color, type: cell.type });
        }
      }
      setPieces(fresh);
      return;
    }

    setPieces(prev => {
      let next = prev.map(p => ({ ...p }));

      // The piece that moved: find it at its old square, relocate it, apply promotion.
      const mover = next.find(p => p.row === lastMove.from.row && p.col === lastMove.from.col && !p.removing);
      const destCell = board[lastMove.to.row][lastMove.to.col];
      if (mover && destCell) {
        mover.row = lastMove.to.row;
        mover.col = lastMove.to.col;
        mover.type = destCell.type; // picks up promotion
      }

      // Captured pieces: mark for a fade-out, then actually remove after the
      // transition finishes so the animation has time to play.
      const capturedPositions = lastMove.captured ?? [];
      if (capturedPositions.length > 0) {
        next = next.map(p =>
          capturedPositions.some(cp => cp.row === p.row && cp.col === p.col) && p.id !== mover?.id
            ? { ...p, removing: true }
            : p,
        );
        const timer = setTimeout(() => {
          setPieces(cur => cur.filter(p => !p.removing));
        }, TRANSITION_MS);
        removeTimers.current.push(timer);
      }

      return next;
    });
  }, [lastMove, board, size]);

  useEffect(() => () => { removeTimers.current.forEach(clearTimeout); }, []);

  const validDestinations = selectedPos
    ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col)
    : [];

  const findLegalMove = (from: Position, to: Position) =>
    legalMoves.find(m => m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col);

  const attemptMove = (from: Position, to: Position) => {
    const move = findLegalMove(from, to);
    if (move) {
      onMove(move);
      setSelectedPos(null);
    }
  };

  const displayPos = (row: number, col: number): Position =>
    flipped ? { row: size - 1 - row, col: size - 1 - col } : { row, col };

  const boardPosFromClientXY = (clientX: number, clientY: number): Position | null => {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-square]');
    if (!el) return null;
    return { row: Number(el.dataset.row), col: Number(el.dataset.col) };
  };

  const handleSquareClick = (row: number, col: number) => {
    if (!canMove) return;
    const piece = board[row][col];

    if (selectedPos) {
      if (findLegalMove(selectedPos, { row, col })) {
        attemptMove(selectedPos, { row, col });
        return;
      }
      // Not a legal destination for the current selection — either reselect or deselect.
      setSelectedPos(piece && piece.color === myColor ? { row, col } : null);
      return;
    }

    if (piece && piece.color === myColor) setSelectedPos({ row, col });
  };

  // --- Drag and drop (pointer events cover both mouse and touch) ---

  const startDrag = (e: React.PointerEvent, piece: TrackedPiece) => {
    if (!canMove) return;
    if (piece.color !== myColor) {
      // Not a piece we can move — route through the normal square-click handling
      // so selecting/deselecting stays consistent regardless of what's under the cursor.
      handleSquareClick(piece.row, piece.col);
      return;
    }
    e.preventDefault();
    setSelectedPos({ row: piece.row, col: piece.col });
    setDrag({ id: piece.id, from: { row: piece.row, col: piece.col }, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!drag) return;

    const onMoveEvt = (e: PointerEvent) => setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const onUp = (e: PointerEvent) => {
      const dropPos = boardPosFromClientXY(e.clientX, e.clientY);
      setDrag(null);
      if (dropPos) attemptMove(drag.from, dropPos);
    };

    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  // Piece diameter is a fraction of the (now dynamic, see cellPx above) cell size
  // rather than a fixed Tailwind class — cellPx varies continuously with the
  // container's measured width now, not just two fixed breakpoints, so a static class
  // like `w-10 h-10` can no longer track it.
  const pieceDiameter = Math.round(cellPx * 0.8);
  const pieceBorder = Math.max(2, Math.round(cellPx * 0.05));

  const pieceStyle = (color: PieceColor, isKing: boolean): { className: string; style: React.CSSProperties } => ({
    // Kings get a gold ring + glow on top of their own color — deliberately NOT just
    // a bigger/second circle of the same color (the old "stacked disc" look), which
    // reads as a normal piece at a glance and was the actual complaint. The crown
    // glyph rendered on top (below) is the primary tell; the ring/glow makes it
    // readable even at a distance or in peripheral vision, before the glyph itself
    // resolves.
    className: `rounded-full shadow-md flex items-center justify-center ${
      color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-300' : 'bg-slate-800 border-slate-900'
    } ${isKing ? 'ring-4 ring-amber-400 shadow-amber-400/70 shadow-lg' : ''}`,
    style: { width: pieceDiameter, height: pieceDiameter, borderWidth: pieceBorder, borderStyle: 'solid' },
  });

  return (
    <div
      ref={containerRef}
      className="w-full flex justify-center"
    >
    <div
      ref={boardRef}
      className="relative border-[6px] border-slate-800 bg-slate-200 shadow-2xl rounded-sm select-none touch-none"
      style={{ width: size * cellPx + 8, height: size * cellPx + 8, padding: 4 }}
    >
      {/* Squares (background grid + click/drop targets) */}
      {Array.from({ length: size }).map((_, dr) =>
        Array.from({ length: size }).map((__, dc) => {
          const { row, col } = displayPos(dr, dc);
          const isDarkSquare = (row + col) % 2 !== 0;
          const isSelected = selectedPos?.row === row && selectedPos?.col === col;
          const isHighlighted = validDestinations.some(m => m.to.row === row && m.to.col === col);

          let bg = isDarkSquare ? 'bg-[#764b36]' : 'bg-[#e5d0aa]';
          if (isSelected) bg = 'bg-yellow-400';
          else if (isHighlighted) bg = 'bg-green-400/80';

          return (
            <div
              key={`${dr}-${dc}`}
              data-square
              data-row={row}
              data-col={col}
              onClick={() => handleSquareClick(row, col)}
              className={`absolute flex items-center justify-center ${bg} ${isDarkSquare ? 'cursor-pointer' : ''} transition-colors duration-150`}
              style={{ width: cellPx, height: cellPx, left: dc * cellPx + 4, top: dr * cellPx + 4 }}
            >
              {isHighlighted && !board[row][col] && (
                <div className="w-1/3 h-1/3 rounded-full bg-green-700/40 pointer-events-none" />
              )}
            </div>
          );
        }),
      )}

      {/* Pieces (absolutely positioned overlay, so moves can transition smoothly) */}
      {pieces.map(p => {
        const { row, col } = displayPos(p.row, p.col);
        const isDragging = drag?.id === p.id;
        const boardRect = boardRef.current?.getBoundingClientRect();
        const style: React.CSSProperties = isDragging && boardRect
          ? {
              width: cellPx, height: cellPx,
              left: drag!.x - boardRect.left - cellPx / 2,
              top: drag!.y - boardRect.top - cellPx / 2,
              zIndex: 20,
              transition: 'none',
            }
          : {
              width: cellPx, height: cellPx,
              left: col * cellPx + 4, top: row * cellPx + 4,
              transition: `left ${TRANSITION_MS}ms ease, top ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`,
              opacity: p.removing ? 0 : 1,
              transform: p.removing ? 'scale(0.4)' : 'scale(1)',
            };

        const isKing = p.type === PieceType.KING;
        const piece = pieceStyle(p.color, isKing);

        return (
          <div
            key={p.id}
            className="absolute flex items-center justify-center pointer-events-none"
            style={style}
          >
            <div
              onPointerDown={e => startDrag(e, p)}
              // pointer-events-none while this exact piece is the one being dragged:
              // it's rendered centered on the pointer, so without this it would be
              // the element elementFromPoint() finds at drop time — hiding the
              // square underneath it that the drop actually needs to land on.
              className={`${piece.className} ${isDragging ? 'pointer-events-none' : 'pointer-events-auto'} ${p.color === myColor && canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={piece.style}
            >
              {/* A crown glyph, not a second stacked disc of the same color (the old
                  look, which read as just another man at a glance) — this is the
                  actual "very visible, really different from a man" king treatment,
                  backed by the gold ring/glow set in pieceStyle above. */}
              {isKing && (
                <span
                  className="pointer-events-none select-none leading-none"
                  style={{ fontSize: Math.round(pieceDiameter * 0.52) }}
                >
                  👑
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
