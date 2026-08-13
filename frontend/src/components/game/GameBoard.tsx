'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { BoardState, Move, Piece, PieceColor } from '@/lib/draughts';
import Board from './Board';
import MoveList from './MoveList';
import CapturedTray from './CapturedTray';
import ConnectionStatus from './ConnectionStatus';
import Timer from './Timer';

// Re-exported for any older imports still pointing at this module.
export { PieceColor, PieceType } from '@/lib/draughts';
export type { Piece, BoardPosition, BoardState, Position, Move } from '@/lib/draughts';

type Clocks = { [PieceColor.LIGHT]: number; [PieceColor.DARK]: number };

// useSearchParams() requires a Suspense boundary somewhere above it in the App
// Router — this wrapper is that boundary, keeping the exported component's own
// signature/usage (`<GameBoard />`) unchanged for page.tsx.
export default function GameBoard() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-500">Loading...</div>}>
      <GameBoardInner />
    </Suspense>
  );
}

function GameBoardInner() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [myColor, setMyColor] = useState<PieceColor | null>(null);
  const [currentTurn, setCurrentTurn] = useState<PieceColor | null>(null);
  const [status, setStatus] = useState<string>('Disconnected');
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [captured, setCaptured] = useState<Record<PieceColor, Piece[]>>({
    [PieceColor.LIGHT]: [],
    [PieceColor.DARK]: [],
  });
  // Server-authoritative clock snapshot: `clocks` is the seconds each side had
  // remaining as of `turnStartedAt`. The active side's clock has been ticking down in
  // real wall-clock time ever since — see `displayClocks` below, which is the only
  // thing recomputed on a timer; these two never get locally decremented themselves.
  const [clocks, setClocks] = useState<Clocks>({ [PieceColor.LIGHT]: 0, [PieceColor.DARK]: 0 });
  const [turnStartedAt, setTurnStartedAt] = useState<number>(Date.now());
  const [roomId, setRoomId] = useState<string | null>(null);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<{ sender: string, message: string, timestamp: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [drawOfferPending, setDrawOfferPending] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [manualFlip, setManualFlip] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  // Settings
  const [boardSize, setBoardSize] = useState(8);
  const [forceMajorityCapture, setForceMajorityCapture] = useState(true);
  const [timeControl, setTimeControl] = useState<'bullet' | 'blitz' | 'rapid' | 'correspondence'>('blitz');

  // Real bug found verifying Phase 9, not introduced by it: this used to parse
  // `window.location.search` by hand, read once during render. On a client-side
  // transition (e.g. router.push from another page), that first render can commit
  // while `window.location` still reflects the PREVIOUS url — and since the
  // useEffect below that reads these has an empty dependency array, whatever it saw
  // at that first commit is what it's permanently stuck with, even though later
  // renders correctly show the right value. `tournamentId` (wired in Phase 5, linked
  // to via router.push from /tournaments/[id]) had this exact same latent bug the
  // whole time — it just never had a test that clicked through via a client-side
  // transition rather than a direct URL load. `useSearchParams()` is the App
  // Router's reactive alternative and doesn't have this problem: it's driven by the
  // router's own resolved state, not raw browser location, so it's already correct
  // on the very first render of the newly-mounted route.
  const searchParams = useSearchParams();
  const tIdStr = searchParams.get('tournamentId');
  const tournamentIdToJoin = tIdStr ? parseInt(tIdStr, 10) : null;
  // Arriving from the /watch dashboard (Phase 9) with a specific game to spectate —
  // see WatchPage's "Watch" button, which links here as `/?watch=<roomId>`.
  const roomIdToSpectate = searchParams.get('watch');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const newSocket = io((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'), {
      auth: { token },
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      if (roomIdToSpectate) {
        setStatus('Connecting to spectate...');
        newSocket.emit('joinSpectator', { roomId: roomIdToSpectate });
      } else if (tournamentIdToJoin) {
        setStatus(`Connected. Click 'Find Tournament Match' to join the Arena.`);
        newSocket.emit('getActiveGames');
      } else {
        setStatus('Connected to server. Click Find Match to begin.');
        newSocket.emit('getActiveGames');
      }
    });

    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('activeGamesList', (games: any[]) => setActiveGames(games));

    newSocket.on('waitingForOpponent', () => setStatus('Waiting in matchmaking queue...'));

    const applyGameStart = (data: {
      roomId: string, color: PieceColor | null, board: BoardState, turn: PieceColor,
      legalMoves: Move[], clocks: Clocks, turnStartedAt: number,
    }, spectating: string) => {
      setRoomId(data.roomId);
      setMyColor(data.color);
      setBoard(data.board);
      setCurrentTurn(data.turn);
      setLegalMoves(data.legalMoves || []);
      setClocks(data.clocks);
      setTurnStartedAt(data.turnStartedAt);
      setLastMove(null); // fresh position, nothing to animate from
      setCaptured({ [PieceColor.LIGHT]: [], [PieceColor.DARK]: [] });
      setGameOver(false);
      setManualFlip(false);
      setOpponentDisconnected(false);
      setStatus(data.color
        ? `Game Started! You are ${data.color === PieceColor.LIGHT ? 'Light (Bottom)' : 'Dark (Top)'}.`
        : spectating);
    };

    newSocket.on('gameStart', (data: any) => {
      setMoveHistory([]);
      applyGameStart(data, 'Spectating match...');
    });

    // Full-state resync after reconnecting mid-game (see game.gateway.ts's
    // attemptRejoin — fires automatically once the socket reconnects with a valid
    // auth token, no action needed from this client beyond having one).
    newSocket.on('gameResync', (data: any) => {
      setMoveHistory(data.moves || []);
      applyGameStart(data, 'Reconnected.');
      setStatus('Reconnected to your game.');
    });

    newSocket.on('gameState', (data: { board: BoardState, turn: PieceColor, move?: Move, clocks: Clocks, turnStartedAt: number }) => {
      setBoard(prevBoard => {
        // Tally exactly which piece (color + type) was captured by looking it up on
        // the board as it was just before this update — the only point we still have
        // that information, since `move.captured` is positions only.
        if (data.move?.captured?.length && prevBoard) {
          const takenByColorLight: Piece[] = [];
          const takenByColorDark: Piece[] = [];
          for (const pos of data.move.captured) {
            const piece = prevBoard[pos.row]?.[pos.col];
            if (!piece) continue;
            (piece.color === PieceColor.LIGHT ? takenByColorLight : takenByColorDark).push(piece);
          }
          setCaptured(prev => ({
            [PieceColor.LIGHT]: [...prev[PieceColor.LIGHT], ...takenByColorLight],
            [PieceColor.DARK]: [...prev[PieceColor.DARK], ...takenByColorDark],
          }));
        }
        return data.board;
      });
      setCurrentTurn(data.turn);
      setClocks(data.clocks);
      setTurnStartedAt(data.turnStartedAt);
      if (data.move) {
        setLastMove(data.move);
        setMoveHistory(prev => [...prev, data.move!]);
      }
    });

    newSocket.on('legalMoves', (moves: Move[]) => setLegalMoves(moves));

    newSocket.on('gameOver', (data: { winner: PieceColor | 'DRAW', reason?: string }) => {
      setGameOver(true);
      setOpponentDisconnected(false);
      const reasonTxt = data.reason ? ` (${data.reason.replace('-', ' ')})` : '';
      setStatus(
        data.winner === 'DRAW'
          ? `Game Over! Draw${reasonTxt}.`
          : `Game Over! Winner: ${data.winner === PieceColor.LIGHT ? 'Light' : 'Dark'}${reasonTxt}`,
      );
    });

    // Anonymous opponent left for good (no reconnect is possible without an account) —
    // the game truly ends here, unlike the grace-period case below.
    newSocket.on('playerDisconnected', () => {
      setGameOver(true);
      setStatus('Opponent disconnected. You win!');
    });

    // Authenticated opponent's socket dropped, but they have a grace period to
    // reconnect (see game.gateway.ts) — the game is still live, not over.
    newSocket.on('opponentDisconnected', (data: { graceMs: number }) => {
      setOpponentDisconnected(true);
      setStatus(`Opponent disconnected — waiting up to ${Math.round(data.graceMs / 1000)}s for them to reconnect...`);
    });

    newSocket.on('opponentReconnected', () => {
      setOpponentDisconnected(false);
      setStatus('Opponent reconnected.');
    });

    newSocket.on('invalidMove', () => {
      console.warn('Server rejected move as invalid.');
    });

    // Most relevant when arriving via /watch's "Watch" link (Phase 9): the game may
    // have already ended (or the roomId was stale/mistyped) by the time this loads —
    // without this, the user would be stuck on "Connecting to spectate..." forever.
    newSocket.on('error', (data: { message: string }) => {
      if (roomIdToSpectate) setStatus(`Couldn't join as spectator: ${data.message}`);
    });

    newSocket.on('spectatorJoined', (data: { count: number }) => setSpectatorCount(data.count));

    newSocket.on('receiveMessage', (msg: { sender: string, message: string, timestamp: string }) => {
      setChatMessages(prev => [...prev, msg]);
    });

    newSocket.on('drawOffered', () => setDrawOfferPending(true));

    newSocket.on('drawDeclined', () => alert('Your opponent declined the draw offer.'));

    return () => {
      newSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFindMatch = () => {
    socket?.emit('joinMatchmaking', { tournamentId: tournamentIdToJoin, rules: { boardSize, forceMajorityCapture }, timeControl });
  };

  const handlePlayAI = (difficulty: number) => {
    socket?.emit('playVsAi', { difficulty, rules: { boardSize, forceMajorityCapture }, timeControl });
  };

  const handleWatchGame = (roomIdToWatch: string) => {
    socket?.emit('joinSpectator', { roomId: roomIdToWatch });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !roomId || !chatInput.trim()) return;
    socket.emit('sendMessage', { roomId, message: chatInput });
    setChatInput('');
  };

  const handleResign = () => {
    if (confirm('Are you sure you want to resign?')) socket?.emit('resignGame');
  };

  const handleOfferDraw = () => {
    socket?.emit('offerDraw');
    alert('Draw offer sent.');
  };

  const handleAcceptDraw = () => {
    socket?.emit('acceptDraw');
    setDrawOfferPending(false);
  };

  const handleDeclineDraw = () => {
    socket?.emit('declineDraw');
    setDrawOfferPending(false);
  };

  const handleMove = (move: Move) => {
    // The board only ever renders moves that came from `legalMoves`, which is
    // entirely server-supplied (see Board.tsx) — this just relays the player's
    // chosen legal move on to the server for authoritative validation and
    // application. The client never computes or applies move legality itself.
    socket?.emit('makeMove', move);
  };

  // Server-authoritative display clocks: `clocks`/`turnStartedAt` are only a snapshot
  // from the last server message, so the actively-ticking side needs the elapsed
  // wall-clock time subtracted locally for a live display. Recomputed only when the
  // snapshot itself changes (not on unrelated re-renders) so it doesn't jitter — see
  // Timer.tsx, which then free-runs its own 1s countdown from this starting point.
  // The server's flag-fall timer is what actually enforces the clock; this is display only.
  const displayClocks = useMemo(() => {
    const elapsed = (Date.now() - turnStartedAt) / 1000;
    return {
      [PieceColor.LIGHT]: Math.max(0, clocks[PieceColor.LIGHT] - (currentTurn === PieceColor.LIGHT ? elapsed : 0)),
      [PieceColor.DARK]: Math.max(0, clocks[PieceColor.DARK] - (currentTurn === PieceColor.DARK ? elapsed : 0)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clocks, turnStartedAt, currentTurn]);

    if (!board) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full pt-8">
        <div className="absolute top-4 right-4"><ConnectionStatus connected={connected} /></div>

        <div className="w-full max-w-md bg-[#262421] rounded text-white overflow-hidden shadow-lg border border-[#3a3835]">
          <div className="p-4 border-b border-[#3a3835]">
            <h2 className="text-xl font-bold text-center">Play Draughts</h2>
          </div>
          <div className="p-4 space-y-4">
             <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setBoardSize(8)}
                  className={`p-3 text-sm rounded transition-colors ${boardSize === 8 ? 'bg-[#312e2b] border border-[#81b64c]' : 'bg-[#1b1918] border border-transparent hover:bg-[#312e2b]'}`}
                >
                  8x8 (Standard)
                </button>
                <button
                  onClick={() => setBoardSize(10)}
                  className={`p-3 text-sm rounded transition-colors ${boardSize === 10 ? 'bg-[#312e2b] border border-[#81b64c]' : 'bg-[#1b1918] border border-transparent hover:bg-[#312e2b]'}`}
                >
                  10x10 (International)
                </button>
             </div>

             <div className="grid grid-cols-4 gap-2 mt-4">
                {['bullet', 'blitz', 'rapid', 'correspondence'].map(tc => (
                   <button
                     key={tc}
                     onClick={() => setTimeControl(tc as 'bullet'|'blitz'|'rapid'|'correspondence')}
                     className={`p-2 text-xs rounded transition-colors ${timeControl === tc ? 'bg-[#312e2b] border border-[#81b64c]' : 'bg-[#1b1918] border border-transparent hover:bg-[#312e2b]'}`}
                   >
                     {tc}
                   </button>
                ))}
             </div>

             <button
               onClick={() => {
                 const is10x10 = boardSize === 10;
                 setForceMajorityCapture(is10x10);
                 handleFindMatch();
               }}
               className="w-full py-4 mt-6 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold rounded shadow-lg text-lg transition-colors"
             >
               Play Multiplayer
             </button>

             <div className="text-center pt-2 text-sm text-[#989795] font-medium">OR</div>

             <div className="grid grid-cols-2 gap-2">
               {[1, 2, 3, 4, 5, 6, 7].map(level => (
                 <button
                   key={level}
                   onClick={() => {
                     const is10x10 = boardSize === 10;
                     setForceMajorityCapture(is10x10);
                     handlePlayAI(level);
                   }}
                   className={`w-full px-2 py-2 text-white rounded transition text-sm ${level > 4 ? 'bg-red-800 hover:bg-red-900 col-span-2' : 'bg-[#312e2b] hover:bg-[#433f3c] border border-[#3a3835]'}`}
                 >
                   AI Lvl {level} {level === 7 ? '(3500+ ELO)' : ''}
                 </button>
               ))}
             </div>
          </div>
        </div>

        {activeGames.length > 0 && (
          <div className="mt-8 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-center text-white">Live Games</h3>
            <ul className="space-y-2">
              {activeGames.map((game, i) => (
                <li key={i} className="flex justify-between items-center bg-[#262421] p-3 rounded border border-[#3a3835]">
                  <span className="font-medium text-white">{game.player1} vs {game.player2}</span>
                  <button
                    onClick={() => handleWatchGame(game.roomId)}
                    className="px-4 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    Watch ({game.spectatorsCount} 👀)
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-[#989795] text-sm">{status}</p>
      </div>
    );
  }

  // Auto-orient so the player's own pieces are always nearest them; a manual toggle
  // can override that default for either side (or for a spectator, who has no default).
  const autoFlip = myColor === PieceColor.DARK;
  const flipped = autoFlip !== manualFlip;

  return (
    <div className="flex flex-col md:flex-row justify-center py-10 gap-8 w-full mx-auto px-4 text-white min-h-[calc(100vh-2rem)] items-start pt-16">
      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4">
        <div className="w-full flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Game Room</h1>
          <ConnectionStatus connected={connected} />
        </div>
        <div className="flex space-x-4 text-sm text-gray-500 font-medium">
          <span>{spectatorCount} Spectator(s)</span>
        </div>
        <p className="text-md text-[#989795]">{status}</p>
        <p className="text-xl font-semibold text-[#81b64c]">
          {!myColor ? (currentTurn === PieceColor.LIGHT ? "Light's turn" : "Dark's turn") : (currentTurn === myColor ? "It's your turn!" : 'Waiting for opponent...')}
        </p>

        {opponentDisconnected && (
          <div className="bg-orange-100 border border-orange-400 text-orange-800 px-4 py-2 rounded text-sm font-medium">
            ⚠️ Opponent disconnected — game is still live, waiting for them to reconnect.
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Server-authoritative: seconds-remaining snapshot comes from the backend
              on every move; the flag-fall timer that actually ends the game on
              timeout also lives there (game.gateway.ts). These just display it. */}
          <Timer initialTime={displayClocks[PieceColor.DARK]} isActive={currentTurn === PieceColor.DARK && !gameOver} />
          <span className="text-xs text-gray-400">vs</span>
          <Timer initialTime={displayClocks[PieceColor.LIGHT]} isActive={currentTurn === PieceColor.LIGHT && !gameOver} />
        </div>

        <div className="flex gap-4">
          <button onClick={() => setManualFlip(f => !f)} className="px-3 py-1.5 bg-[#312e2b] text-white rounded border border-[#3a3835] hover:bg-[#433f3c] text-xs font-semibold transition">
            ⇅ Flip Board
          </button>
          {myColor && !gameOver && (
            <>
              <button onClick={handleOfferDraw} className="px-4 py-2 bg-[#312e2b] text-white rounded border border-[#3a3835] hover:bg-[#433f3c] text-sm font-semibold transition">
                Offer Draw
              </button>
              <button onClick={handleResign} className="px-4 py-2 bg-red-900/50 text-red-200 rounded border border-red-900 hover:bg-red-800/60 text-sm font-semibold transition">
                Resign
              </button>
            </>
          )}
        </div>

        {drawOfferPending && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded relative shadow-md">
            <p className="font-bold">Draw Offered</p>
            <p className="text-sm">Your opponent has offered a draw.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={handleAcceptDraw} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded text-sm">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-1 px-3 border border-gray-400 rounded shadow text-sm">Decline</button>
            </div>
          </div>
        )}

        <Board
          board={board}
          myColor={myColor}
          currentTurn={gameOver ? null : currentTurn}
          legalMoves={legalMoves}
          lastMove={lastMove}
          flipped={flipped}
          onMove={handleMove}
        />

        <div className="w-full flex flex-col gap-1">
          <CapturedTray captured={captured[PieceColor.DARK]} label="Light captured" />
          <CapturedTray captured={captured[PieceColor.LIGHT]} label="Dark captured" />
        </div>
      </div>

      {/* Side Column: moves + chat */}
      <div className="w-full lg:w-96 flex flex-col gap-4 text-white">
        <MoveList moves={moveHistory} boardSize={board.length} />

        <div className="flex flex-col bg-[#262421] rounded shadow-xl border border-[#3a3835] h-72">
          <div className="bg-[#21201d] text-white p-4 rounded-t border-b border-[#3a3835]">
            <h3 className="font-bold">Live Chat</h3>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#262421]">
            {chatMessages.length === 0 ? (
              <p className="text-center text-[#989795] text-sm mt-10">No messages yet. Say hi!</p>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-xs font-semibold text-[#989795]">{msg.sender}</span>
                  <span className="bg-[#312e2b] p-2 rounded shadow-sm text-sm border border-[#3a3835] inline-block w-fit max-w-[90%] break-words">
                    {msg.message}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-[#3a3835] bg-[#21201d] rounded-b">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 text-sm bg-[#312e2b] border border-[#3a3835] rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#81b64c]"
              />
              <button type="submit" className="bg-[#81b64c] text-white px-4 py-2 rounded text-sm font-semibold hover:bg-[#a3d160] transition">
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
