'use client';
import { useState } from 'react';
import DashboardShell from '@/components/DashboardShell';

interface Term {
  term: string;
  definition: string;
}

// Standard, widely-used draughts/checkers terminology — general vocabulary you'll see
// in books, forums, and commentary, not specific to this app's own rule toggles
// (those are covered on the Rules page instead).
const TERMS: Term[] = [
  { term: 'Man', definition: 'A regular, unpromoted piece. Moves and captures diagonally forward only (unless playing under a variant that allows backward captures).' },
  { term: 'King', definition: 'A piece that has been promoted after reaching the opponent\'s back row. Moves and captures diagonally in any direction.' },
  { term: 'King row', definition: 'A player\'s own back row — the row an opponent\'s man must reach to be promoted to a king.' },
  { term: 'Crowning / Promotion', definition: 'The moment a man reaches the king row and becomes a king.' },
  { term: 'Forced capture', definition: 'The rule that a capture must be played if one is available, rather than being optional.' },
  { term: 'Majority capture', definition: 'A rule requiring the longest available capture sequence to be played when more than one length is possible.' },
  { term: 'Multi-jump / Chain capture', definition: 'A single turn in which one piece captures more than one opposing piece in sequence, without stopping in between.' },
  { term: 'Flying king', definition: 'A king that can move or capture across any number of empty squares along a diagonal, rather than one square at a time.' },
  { term: 'Single corner', definition: 'The corner of the board with only one diagonal column of playable squares leading into it.' },
  { term: 'Double corner', definition: 'The corner of the board with two diagonal columns of playable squares leading into it — generally considered easier to defend than the single corner.' },
  { term: 'Shot', definition: 'A tactic where a piece is deliberately offered as a sacrifice, relying on the forced-capture rule to lure the opponent into a worse position or a losing sequence.' },
  { term: 'Tempo', definition: 'The advantage (or disadvantage) of which side has to move next in a position — sometimes decisive in quiet endgames even without a material difference.' },
  { term: 'Opposition', definition: 'A positional relationship between pieces (often kings) where whoever has to move next is at a disadvantage.' },
  { term: 'Breakthrough', definition: 'A tactical sequence, often involving a sacrifice, that forces a path through a blockade of pieces toward promotion.' },
  { term: 'Draw', definition: 'A game that ends without a winner — by threefold repetition of a position, or after a long run of moves without a capture or a man move.' },
];

export default function GlossaryPage() {
  const [query, setQuery] = useState('');
  const filtered = TERMS.filter(t =>
    t.term.toLowerCase().includes(query.toLowerCase()) || t.definition.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <DashboardShell>
      <div className="min-h-screen py-8 px-6 max-w-3xl">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400 tracking-tight mb-2">
          Glossary
        </h1>
        <p className="text-slate-400 mb-6">Common draughts/checkers terms you&apos;ll see across this app and elsewhere.</p>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search terms..."
          className="w-full max-w-sm mb-6 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-600"
        />

        <dl className="flex flex-col divide-y divide-slate-800">
          {filtered.map(t => (
            <div key={t.term} className="py-4">
              <dt className="font-bold text-slate-100">{t.term}</dt>
              <dd className="text-sm text-slate-400 mt-1">{t.definition}</dd>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-slate-500 py-4">No terms match &ldquo;{query}&rdquo;.</p>
          )}
        </dl>
      </div>
    </DashboardShell>
  );
}
