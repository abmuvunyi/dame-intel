'use client';

import { Piece, PieceColor, PieceType } from '@/lib/draughts';

interface CapturedTrayProps {
  captured: Piece[]; // pieces of ONE color that have been captured (removed from the board)
  label: string;
}

// A small "captured pieces" row for one side — a compact visual tally, not a full
// board-accurate replay (kings vs. men both just show as their own dot, sized by type).
export default function CapturedTray({ captured, label }: CapturedTrayProps) {
  if (captured.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="font-semibold">{label}:</span> none captured
      </div>
    );
  }

  const color = captured[0]?.color;
  const dotBase = color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-400' : 'bg-slate-800 border-slate-950';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-gray-500">{label}:</span>
      {captured.map((p, i) => (
        <div
          key={i}
          className={`rounded-full border ${dotBase} ${p.type === PieceType.KING ? 'w-4 h-4' : 'w-3 h-3'}`}
          title={p.type === PieceType.KING ? 'King' : 'Man'}
        />
      ))}
    </div>
  );
}
