// Pure, framework-independent chat moderation — same pattern as engine.service.ts /
// matchmaking.ts / swiss-pairing.ts: no sockets, no NestJS, directly unit-testable.
// Phase 10 asked for "basic profanity/spam filtering — a simple wordlist filter is
// fine for now", so that's exactly what this is: a small starter wordlist and a
// sliding-window rate limit, not a production-grade moderation system. Expanding the
// wordlist (or swapping in a real moderation service) is a drop-in future change —
// callers only see `filterMessage`/`isRateLimited`, never the list itself.
const PROFANITY_WORDLIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'bastard', 'dick', 'piss',
];

const PROFANITY_PATTERN = new RegExp(`\\b(${PROFANITY_WORDLIST.join('|')})\\b`, 'gi');

export interface FilterResult {
  filtered: string;
  wasFiltered: boolean;
}

// Word-boundary matching (not a bare substring check) so this censors "shit" but
// leaves words like "Shitake" or "classic" alone — a plain .includes() would flag both.
export function filterMessage(text: string): FilterResult {
  let wasFiltered = false;
  const filtered = text.replace(PROFANITY_PATTERN, (match) => {
    wasFiltered = true;
    return '*'.repeat(match.length);
  });
  return { filtered, wasFiltered };
}

export const SPAM_WINDOW_MS = 10_000;
export const SPAM_MAX_MESSAGES = 5; // more than 5 messages inside any 10s window counts as spam

// Pure decision function: given the timestamps of a sender's recent messages (already
// pruned to the current window — see pruneAndRecordTimestamp below) and now, would
// sending one more count as spam? The actual per-socket timestamp history is real,
// mutable, per-connection state that has to live in the gateway (like
// disconnectTimers, activeGames, etc.) — this function just makes the threshold logic
// itself independently testable without any socket.io involved.
export function isRateLimited(recentTimestamps: number[], now: number): boolean {
  return recentTimestamps.filter(t => now - t < SPAM_WINDOW_MS).length >= SPAM_MAX_MESSAGES;
}

// Prunes timestamps outside the window and appends `now` — the gateway calls this
// once per accepted (non-rate-limited) message to update that socket's history.
export function pruneAndRecordTimestamp(recentTimestamps: number[], now: number): number[] {
  return [...recentTimestamps.filter(t => now - t < SPAM_WINDOW_MS), now];
}
