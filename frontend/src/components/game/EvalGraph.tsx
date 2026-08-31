'use client';
import { lightWinShare } from './EvalBar';

interface EvalGraphProps {
  moveReviews: any[]; // GameReview.moveReviews — not assumed sorted
  totalMoves: number; // boardStates.length - 1, i.e. the highest valid moveIndex+1
  currentMoveIndex: number; // 0 = the starting position, before any move
  onSelectMove: (moveIndex: number) => void;
}

// Same severity colors move-classification badges already use elsewhere on this
// page (CLASSIFICATION_STYLE) — only MISTAKE/BLUNDER get a marker dot here, matching
// chess.com's own graph (it doesn't clutter the trend line with a dot for every
// single GOOD move, only the moments that actually mattered).
const MARKER_COLOR: Record<string, string> = {
  MISTAKE: '#f97316',
  BLUNDER: '#ef4444',
};

const WIDTH = 520;
const HEIGHT = 64;

// The full-game companion to EvalBar: the same Light-win-share curve, plotted across
// every ply so a swing (or a blunder that hands the game away) is visible as a shape,
// not just a number — this is what makes the bar's per-move readout meaningfully
// "correspond" to the mistake/best-move indicators, per the brief asking for the two
// to track together the way they do on chess.com.
export default function EvalGraph({ moveReviews, totalMoves, currentMoveIndex, onSelectMove }: EvalGraphProps) {
  if (totalMoves <= 0) return null;

  // evalAt[k] = the LIGHT-perspective evaluation of the position AFTER k moves have
  // been played. evalAt[0] is the symmetric starting position (0 by construction —
  // nothing is stored for it since no move produced it).
  const evalAt: (number | null)[] = new Array(totalMoves + 1).fill(null);
  evalAt[0] = 0;
  for (const mr of moveReviews) {
    if (mr.moveIndex + 1 <= totalMoves) evalAt[mr.moveIndex + 1] = mr.evaluation;
  }

  const points = evalAt.map((ev, i) => {
    const x = (i / totalMoves) * WIDTH;
    const share = ev === null ? 0.5 : lightWinShare(ev);
    const y = HEIGHT - share * HEIGHT;
    return { x, y, known: ev !== null };
  });

  const pathD = points
    .filter(p => p.known)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(relX * totalMoves);
    onSelectMove(Math.min(totalMoves, Math.max(0, idx)));
  };

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="rounded border border-gray-200 bg-gray-50 cursor-pointer"
      onClick={handleClick}
      data-testid="eval-graph"
    >
      {/* 50/50 midline */}
      <line x1={0} y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="#d1d5db" strokeDasharray="2,2" />
      {/* Light-share fill under the trend line, so an at-a-glance skim of "who was
          ahead when" doesn't require reading the line's exact height. */}
      {pathD && (
        <path
          d={`${pathD} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`}
          fill="#e2e8f0"
          stroke="none"
        />
      )}
      {pathD && <path d={pathD} fill="none" stroke="#334155" strokeWidth={1.5} />}
      {/* Mistake / blunder markers, positioned at the resulting position (the same
          convention chess.com uses: the marker sits where the position landed, not
          on the pre-move square). */}
      {moveReviews
        .filter(mr => MARKER_COLOR[mr.classification] && points[mr.moveIndex + 1])
        .map(mr => {
          const p = points[mr.moveIndex + 1];
          return (
            <circle
              key={mr.moveIndex}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={MARKER_COLOR[mr.classification]}
              stroke="white"
              strokeWidth={0.75}
            />
          );
        })}
      {/* Current scrub position */}
      <line
        x1={(currentMoveIndex / totalMoves) * WIDTH}
        y1={0}
        x2={(currentMoveIndex / totalMoves) * WIDTH}
        y2={HEIGHT}
        stroke="#2563eb"
        strokeWidth={1.5}
      />
    </svg>
  );
}
