'use client';
import DashboardShell from '@/components/DashboardShell';

// Real reference content describing exactly what this app's engine actually
// implements (backend/src/game/engine/engine.service.ts) and cites — not general
// checkers trivia that may or may not match how a game here actually plays out.
// Article numbers refer to "Annex 1 – Official FMJD rules for international
// draughts" for the International variant; the American variant follows standard
// American Checkers / English Draughts rules, as engine.service.ts's own comments
// document.
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'The Board and Pieces',
    body: [
      'This app supports two variants: American (8x8, 12 pieces per side) and International (10x10, 20 pieces per side). Pieces only ever move and capture along the dark diagonal squares.',
      'A plain piece is called a man. A man that reaches the opponent\'s back row (the "king row") is promoted to a king, which can move and capture diagonally in any direction — a man may only ever move and capture forward, unless the "men may capture backward" rule below applies.',
    ],
  },
  {
    title: 'Captures Are Mandatory',
    body: [
      'If any capture is available to you, you must make one — you cannot make a quiet move instead while a capture sits on the board. This is true in both variants.',
      'If a capture leads to another capture from the square you land on, you must continue capturing until no further capture is available in that same turn (a "multi-jump" chain) — you don\'t get to stop partway through voluntarily.',
    ],
  },
  {
    title: 'Maximum Capture (International only, by default)',
    body: [
      'In the International variant, if you have a choice between capture sequences of different lengths, you must play one of the sequences that captures the most pieces — a 3-piece capture is obligatory over a 2-piece capture if both are available. If multiple sequences tie for that maximum, you may choose freely among them.',
      'This is the "Force Majority Capture" setting you can toggle when starting a game — American games default it off (matching standard American Checkers, where you must capture, but not necessarily the longest sequence), International games default it on.',
    ],
  },
  {
    title: 'King Must Capture When Tied (optional house rule)',
    body: [
      'Official FMJD rules give a king no special priority over a man: if a man\'s capture and a king\'s capture tie for the maximum length, either is legal to choose. That\'s this app\'s own default, in both variants.',
      'Some local and historical rule traditions require playing the king\'s capture instead, whenever one is available among the tied options. This app lets you turn that on as a per-game house rule from the pre-game settings — both players get matched only with others who chose the same setting.',
    ],
  },
  {
    title: 'Men Capturing Backward',
    body: [
      'In the International variant, a man may capture an opposing piece diagonally backward, not just forward (though a man may still only ever MOVE forward when not capturing). In the American variant, a man may only ever capture forward, same as a normal move.',
    ],
  },
  {
    title: 'Flying Kings',
    body: [
      'In the International variant, a king may move or capture across any number of empty squares along a diagonal, landing on any empty square beyond a captured piece — not just the very next square. In the American variant, a king moves and captures exactly one square at a time, the same as a man, just in any direction.',
    ],
  },
  {
    title: 'Winning and Drawing',
    body: [
      'You win if your opponent has no legal move on their turn — either every one of their pieces is captured, or every remaining piece is completely blocked.',
      'A game is drawn by threefold repetition (the same position occurring three times with the same side to move) or after a long enough run of moves with no capture and no man move — 50 half-moves for International, 80 for American in this app.',
    ],
  },
];

export default function RulesPage() {
  return (
    <DashboardShell>
      <div className="min-h-screen py-8 px-6 max-w-3xl">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400 tracking-tight mb-2">
          Rules
        </h1>
        <p className="text-slate-400 mb-8">
          Exactly how this app&apos;s rules engine works for each variant — matching what you&apos;ll actually see at the board, not general trivia.
        </p>

        <div className="flex flex-col gap-8">
          {SECTIONS.map(section => (
            <section key={section.title}>
              <h2 className="text-lg font-bold text-slate-100 mb-2">{section.title}</h2>
              <div className="flex flex-col gap-2">
                {section.body.map((p, i) => (
                  <p key={i} className="text-slate-300 leading-relaxed text-sm">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
