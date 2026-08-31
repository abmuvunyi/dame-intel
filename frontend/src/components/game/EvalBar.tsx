'use client';

interface EvalBarProps {
  // LIGHT-positive units (same scale as backend AiService.WEIGHT_MAN = 10), i.e. the
  // GameReview.moveReviews[i].evaluation shape — null means "not analyzed yet" (review
  // still pending/failed, or this is a position with no review data at all).
  evaluation: number | null;
  heightPx?: number;
}

// Maps a raw eval score onto a 0-1 "Light win share" using a logistic curve. Not a
// statistically-fit win-probability model — this codebase has no historical game
// database to calibrate one against — just an explicit, documented curve in the same
// spirit as move-classification.ts's own hand-picked thresholds. SCALE=25 matches
// AiService.WEIGHT_KING (one king's material worth): being up a full king reads as a
// clear-but-not-total edge (~73%), consistent with that same unit meaning "MISTAKE:
// gives up more than a man, up to about a king's worth" elsewhere in this app.
const SCALE = 25;
function lightWinShare(evaluation: number): number {
  if (!Number.isFinite(evaluation)) return evaluation > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-evaluation / SCALE));
}

// Above roughly this magnitude, the eval is no longer describing "how much material
// is up" — it's AiService's WIN_SCORE-scale forced-win/loss signal (100,000, see
// ai.service.ts's minimax terminal scoring), which can also land anywhere in a wide
// band around there once ply-distance tiebreaks and quiescence extensions shift it.
// Realistic material swings top out far below this (a full board of kings is at most
// ~50 * WEIGHT_KING = 1,250), so anything past 2,000 is safely read as "forced
// win/loss found", not a legitimately large material lead — shown as "+M"/"−M"
// (mate-equivalent) instead of a meaningless five-to-six-digit number.
const FORCED_RESULT_THRESHOLD = 2000;

function formatEval(evaluation: number): string {
  if (Math.abs(evaluation) >= FORCED_RESULT_THRESHOLD) return evaluation > 0 ? '+M' : '−M';
  const magnitude = Math.abs(evaluation) / 10;
  const sign = evaluation > 0 ? '+' : evaluation < 0 ? '−' : '';
  return `${sign}${magnitude.toFixed(1)}`;
}

// A vertical, chess.com-style evaluation bar: Light's share fills from the bottom up
// (same convention chess.com's own White-at-the-bottom bar uses), Dark's share is
// whatever remains at the top. A thin dashed line marks the 50/50 midpoint so a
// viewer can see at a glance which side of even the position sits on, not just which
// color currently has more area.
export default function EvalBar({ evaluation, heightPx = 480 }: EvalBarProps) {
  const known = evaluation !== null && Number.isFinite(evaluation);
  const share = known ? lightWinShare(evaluation as number) : 0.5;
  const lightPercent = share * 100;

  return (
    <div className="flex flex-col items-center gap-1.5 select-none" data-testid="eval-bar">
      <div
        className="relative w-7 rounded overflow-hidden border border-gray-300 shadow-inner bg-slate-800"
        style={{ height: heightPx }}
        title={known ? `Evaluation: ${((evaluation as number) / 10).toFixed(2)} (positive favors Light)` : 'Evaluation not available yet'}
      >
        <div
          className="absolute bottom-0 left-0 right-0 bg-slate-100 transition-[height] duration-300 ease-out"
          style={{ height: `${lightPercent}%` }}
        />
        <div className="absolute left-0 right-0 border-t border-dashed border-gray-400/60" style={{ top: '50%' }} />
      </div>
      <div className="text-[11px] text-gray-600 text-center leading-tight font-mono">
        {known ? formatEval(evaluation as number) : '—'}
      </div>
      <div className="text-[10px] text-gray-400 text-center leading-tight">
        {known ? `${lightPercent.toFixed(0)}% / ${(100 - lightPercent).toFixed(0)}%` : ''}
      </div>
    </div>
  );
}

export { lightWinShare };
