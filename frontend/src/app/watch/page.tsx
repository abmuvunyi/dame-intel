'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

// The live-games dashboard (Phase 9). Read-only by design: this page never sends
// `makeMove`, only ever `getActiveGames` — actually watching a game happens back on
// `/` with a `?watch=<roomId>` query param (see GameBoard.tsx), which reuses the
// exact spectator plumbing that already existed rather than duplicating the whole
// board-rendering component here.
interface ActiveGame {
  roomId: string;
  player1: string;
  player1Rating: number | null;
  player2: string;
  player2Rating: number | null;
  spectatorsCount: number;
  variant: string;
  boardSize: number;
  timeControl: string;
  isVsAi: boolean;
}

const POLL_MS = 4000;

export default function WatchPage() {
  const [games, setGames] = useState<ActiveGame[]>([]);
  const [connected, setConnected] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // No auth token — spectating (and just browsing what's live) never required an
    // account server-side (see joinSpectator in game.gateway.ts), so this page
    // doesn't need one either.
    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('getActiveGames');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('activeGamesList', (list: ActiveGame[]) => setGames(list));

    // No server-push event fires when a game starts/ends elsewhere, so this just
    // re-asks periodically — simple polling over an already-open socket, not a
    // second connection per refresh.
    const interval = setInterval(() => socket.emit('getActiveGames'), POLL_MS);

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const formatLabel = (g: ActiveGame) => `${g.boardSize}x${g.boardSize} ${g.variant === 'international' ? 'International' : 'American'}`;

  return (
    <div className="flex-1 w-full flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">Live Games</h1>
          <p className="text-sm text-[#c3c3c2] mt-1">
            {connected ? `${games.length} game${games.length === 1 ? '' : 's'} in progress` : 'Connecting...'}
          </p>
        </div>
        <button onClick={() => router.push('/')} className="text-[#c3c3c2] hover:text-white underline">
          Back to Dashboard
        </button>
      </div>

      <div className="w-full max-w-4xl bg-[#262421] border border-[#3c3a38] rounded-lg shadow-xl p-8">
        {games.length === 0 ? (
          <p className="text-[#c3c3c2]">No games in progress right now. Check back soon!</p>
        ) : (
          <ul className="divide-y divide-[#3c3a38]">
            {games.map((g) => (
              <li key={g.roomId} className="py-4 flex justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">
                    {g.player1}{g.player1Rating !== null ? ` (${g.player1Rating})` : ''}
                    {' vs '}
                    {g.player2}{g.player2Rating !== null ? ` (${g.player2Rating})` : ''}
                  </h3>
                  <p className="text-[#c3c3c2] text-sm">
                    {formatLabel(g)} · {g.timeControl} · 👀 {g.spectatorsCount} watching
                    {g.isVsAi && ' · vs AI'}
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/?watch=${g.roomId}`)}
                  className="px-6 py-2 bg-[#739552] text-white font-bold rounded shadow-md hover:bg-[#81a55d] transition shrink-0"
                >
                  Watch
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
