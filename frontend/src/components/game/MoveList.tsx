'use client';

import { useEffect, useRef } from 'react';
import { Move, PieceColor, formatMove } from '@/lib/draughts';

interface MoveListProps {
  moves: Move[];
  boardSize: number;
}

export default function MoveList({ moves, boardSize }: MoveListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [moves.length]);

  // Light always moves first (engine.service.ts), so moves alternate L, D, L, D, ...
  const pairs: { num: number; light?: Move; dark?: Move }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ num: i / 2 + 1, light: moves[i], dark: moves[i + 1] });
  }

  return (
    <div className="flex flex-col bg-[#262421] rounded shadow border border-[#3a3835] h-64 text-white">
      <div className="bg-[#21201d] text-white px-4 py-2 rounded-t text-sm font-bold border-b border-[#3a3835]">Moves</div>
      <div className="flex-1 overflow-y-auto p-2 font-mono text-sm">
        {pairs.length === 0 ? (
          <p className="text-center text-[#989795] text-sm mt-6">No moves yet.</p>
        ) : (
          pairs.map(p => (
            <div key={p.num} className="flex gap-2 px-2 py-1 odd:bg-[#312e2b] rounded">
              <span className="text-[#989795] w-6 text-right">{p.num}.</span>
              <span className="w-16 text-white">{p.light ? formatMove(p.light, boardSize) : ''}</span>
              <span className="w-16 text-[#989795] font-semibold">{p.dark ? formatMove(p.dark, boardSize) : ''}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
