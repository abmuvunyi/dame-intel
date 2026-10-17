// The single place the frontend learns where the backend lives. Set
// NEXT_PUBLIC_API_URL at BUILD time (Next.js inlines NEXT_PUBLIC_* into the client
// bundle) — e.g. https://api.example.com. The localhost fallback exists only for
// `npm run dev`; a production build without it fails loudly in next.config.ts
// rather than shipping a bundle that silently calls localhost.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

// Phase 15: versioned REST API. Every HTTP call goes through API_BASE; bump this
// (and migrate call sites) only when the app is ready for a new API version.
// The Socket.IO connection uses API_URL itself (not versioned by path).
export const API_VERSION = 'v1';
export const API_BASE = `${API_URL}/api/${API_VERSION}`;
