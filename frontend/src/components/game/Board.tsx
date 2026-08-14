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

export default function Board({ board, myColor, currentTurn, legalMoves, lastMove, flipped, onMove }: BoardProps) {
  const size = board.length;
  const canMove = myColor !== null && currentTurn === myColor;

  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [pieces, setPieces] = useState<TrackedPiece[]>([]);
  const [drag, setDrag] = useState<{ id: number; from: Position; x: number; y: number } | null>(null);
  const nextId = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const removeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  const is10x10 = size === 10;
  const cellPx = is10x10 ? 48 : 64;
  const pieceClass = is10x10 ? 'w-8 h-8 sm:w-10 sm:h-10 border-2' : 'w-10 h-10 sm:w-12 sm:h-12 border-4';
  const stackClass = is10x10
    ? 'w-8 h-8 sm:w-10 sm:h-10 border-2 absolute -top-1 -left-1'
    : 'w-10 h-10 sm:w-12 sm:h-12 border-4 absolute -top-1.5 -left-1.5';
  const kingOffset = is10x10 ? 'absolute bottom-1 right-1' : 'absolute bottom-1 right-1 sm:bottom-2 sm:right-2';

  const pieceStyle = (color: PieceColor) => ({
    className: `${pieceClass} rounded-full shadow-md ${color === PieceColor.LIGHT ? 'bg-[#f8f8f8] border-[#e0e0e0]' : 'bg-[#3b3a39] border-[#2b2a29]'}`,
  });

  const renderKingCrown = (color: PieceColor) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-3/5 h-3/5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-md ${color === PieceColor.LIGHT ? 'text-[#e5e5e5]' : 'text-[#2b2a29]'}`}>
      <path d="M2 19H22V21H2V19Z" fill="currentColor" stroke={color === PieceColor.LIGHT ? '#999' : '#111'} strokeWidth="1"/>
      <path d="M4 17L3 9L8 12L12 5L16 12L21 9L20 17H4Z" fill="currentColor" stroke={color === PieceColor.LIGHT ? '#999' : '#111'} strokeWidth="1"/>
      <circle cx="3" cy="8" r="1.5" fill="currentColor" stroke={color === PieceColor.LIGHT ? '#999' : '#111'} strokeWidth="1"/>
      <circle cx="12" cy="4" r="1.5" fill="currentColor" stroke={color === PieceColor.LIGHT ? '#999' : '#111'} strokeWidth="1"/>
      <circle cx="21" cy="8" r="1.5" fill="currentColor" stroke={color === PieceColor.LIGHT ? '#999' : '#111'} strokeWidth="1"/>
    </svg>
  );

  return (
    <div
      ref={boardRef}
      className="relative border-[4px] border-[#302e2b] bg-[#302e2b] shadow-2xl rounded select-none touch-none"
      style={{ width: size * cellPx + 8, height: size * cellPx + 8, padding: 0 }}
    >
      {/* Squares (background grid + click/drop targets) */}
      {Array.from({ length: size }).map((_, dr) =>
        Array.from({ length: size }).map((__, dc) => {
          const { row, col } = displayPos(dr, dc);
          const isDarkSquare = (row + col) % 2 !== 0;
          const isSelected = selectedPos?.row === row && selectedPos?.col === col;
          const isHighlighted = validDestinations.some(m => m.to.row === row && m.to.col === col);

          let bg = isDarkSquare ? 'bg-[#739552]' : 'bg-[#ebecd0]';
          if (isSelected) bg = 'bg-[#f6f669]';
          else if (isHighlighted) bg = 'bg-[#f6f669]/60';

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
                <div className="w-1/3 h-1/3 rounded-full bg-black/20 pointer-events-none" />
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
              className={`${pieceStyle(p.color).className} flex items-center justify-center relative ${isDragging ? 'pointer-events-none' : 'pointer-events-auto'} ${p.color === myColor && canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              {p.type === PieceType.KING && renderKingCrown(p.color)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
