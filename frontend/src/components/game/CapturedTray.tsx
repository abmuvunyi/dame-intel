'use client';

import { Piece, PieceColor, PieceType } from '@/lib/draughts';

interface CapturedTrayProps {
  captured: Piece[]; // pieces of ONE color that have been captured (removed from the board)
  label: string;
  // The material lead (in "man" units, see materialValue below) this side currently
  // holds — undefined/<=0 renders nothing, matching chess.com's own convention of
  // only ever showing a "+N" badge next to whichever side is actually ahead, never a
  // "-N" on the other one.
  advantage?: number;
}

// King = 3 men — a common, simple approximation in draughts material heuristics
// (roughly in line with AiService's own WEIGHT_KING:WEIGHT_MAN ratio of 25:10,
// rounded to a friendlier whole number for a "+N" badge rather than a fraction).
const MAN_VALUE = 1;
const KING_VALUE = 3;

export function materialValue(pieces: Piece[]): number {
  return pieces.reduce((sum, p) => sum + (p.type === PieceType.KING ? KING_VALUE : MAN_VALUE), 0);
}

// A small "captured pieces" row for one side — a compact visual tally, not a full
// board-accurate replay (kings vs. men both just show as their own dot, sized by type).
export default function CapturedTray({ captured, label, advantage }: CapturedTrayProps) {
  // Explicitly null, not just a falsy short-circuit — `advantage && advantage > 0 && (...)`
  // would evaluate to the NUMBER 0 whenever advantage is exactly 0 (captures are tied),
  // and React renders a bare 0 (unlike false/null/undefined, which render nothing) —
  // a real bug caught live: a fresh game with nothing captured on either side showed a
  // literal "0" next to "none captured".
  const advantageBadge = (advantage !== undefined && advantage > 0) ? (
    <span
      className="text-xs font-bold text-green-600"
      title="Material lead over your opponent, in man-equivalent units (a king counts as 3)"
    >
      +{advantage}
    </span>
  ) : null;

  if (captured.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="font-semibold">{label}:</span> none captured {advantageBadge}
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
      {advantageBadge}
    </div>
  );
}
