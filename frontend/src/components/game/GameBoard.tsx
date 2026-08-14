'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
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

  // Phase 10: friends + direct challenges. Challenges are issued/received on THIS
  // socket specifically (not a separate one on e.g. a /friends page) — the gateway's
  // respondToChallenge creates the game room using the exact socket ids present at
  // the moment of acceptance, so whoever issues or accepts a challenge has to stay on
  // the same connection all the way through into the game itself. This is also why
  // the "online friends" list lives in the lobby here rather than on its own page.
  const [friends, setFriends] = useState<any[]>([]);
  const [incomingChallenge, setIncomingChallenge] = useState<{ challengeId: string, fromUser: { id: number, username: string } } | null>(null);
  const [challengeNotice, setChallengeNotice] = useState<string | null>(null);

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

    // Friends list (with live online status) — only meaningful for a logged-in user.
    // Re-polled on a simple interval (same pattern as /watch's live-games dashboard)
    // rather than server-pushed, since presence changes don't need to be instant here.
    const fetchFriends = async () => {
      const authToken = localStorage.getItem('token');
      if (!authToken) return;
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/friends`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        setFriends(res.data);
      } catch {
        // Not fatal — the online-friends section just stays empty/stale.
      }
    };
    fetchFriends();
    const friendsPollInterval = setInterval(fetchFriends, 5000);

    newSocket.on('challengeReceived', (data: { challengeId: string, fromUser: { id: number, username: string } }) => {
      setIncomingChallenge(data);
    });
    newSocket.on('challengeDeclined', () => setChallengeNotice('Your challenge was declined.'));
    newSocket.on('challengeFailed', (data: { reason: string }) => setChallengeNotice(data.reason || 'Challenge could not be sent.'));

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
      clearInterval(friendsPollInterval);
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

  // Reuses the exact Phase 5 challenge mechanism (challengePlayer / challengeReceived
  // / respondToChallenge) — this just adds the UI that never existed for it before.
  const handleChallengeFriend = (targetUserId: number) => {
    socket?.emit('challengePlayer', { targetUserId, rules: { boardSize, forceMajorityCapture }, timeControl });
    setChallengeNotice('Challenge sent — waiting for a response...');
  };

  const handleRespondToChallenge = (accept: boolean) => {
    if (!incomingChallenge) return;
    socket?.emit('respondToChallenge', { challengeId: incomingChallenge.challengeId, accept });
    setIncomingChallenge(null);
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

  // Shown above whichever view is active (lobby or in-game) — a challenge can arrive
  // at any time, not just while sitting in the lobby.
  const challengeBanner = incomingChallenge && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border-2 border-blue-500 rounded-lg shadow-xl px-6 py-4 flex items-center gap-4">
      <span className="font-semibold text-gray-800">
        {incomingChallenge.fromUser.username} has challenged you to a game!
      </span>
      <button onClick={() => handleRespondToChallenge(true)} className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700">
        Accept
      </button>
      <button onClick={() => handleRespondToChallenge(false)} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-sm font-semibold hover:bg-gray-300">
        Decline
      </button>
    </div>
  );
  const challengeNoticeBanner = challengeNotice && (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white rounded-lg shadow-lg px-4 py-2 text-sm flex items-center gap-3">
      {challengeNotice}
      <button onClick={() => setChallengeNotice(null)} className="text-slate-300 hover:text-white font-bold">×</button>
    </div>
  );

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-[calc(100vh-80px)] space-y-4">
        {challengeBanner}
        {challengeNoticeBanner}
        <div className="absolute top-4 right-4"><ConnectionStatus connected={connected} /></div>
        <h1 className="text-3xl font-bold text-white mb-2">Play Draughts</h1>
        <p className="text-[#c3c2c1] mb-6">{status}</p>

        <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl justify-center">
           <div className="flex flex-col space-y-4 w-full md:w-80">
             <div className="bg-[#262522] border border-[#3e3d3b] p-6 rounded-lg shadow-xl flex flex-col space-y-4">
               <h4 className="text-lg font-bold text-white mb-2">Game Settings</h4>
               <label className="text-sm flex justify-between items-center text-[#c3c2c1]">
                 Board Size:
                 <select
                   value={boardSize}
                   onChange={e => setBoardSize(parseInt(e.target.value))}
                   className="ml-2 border border-[#3e3d3b] rounded p-1.5 text-sm bg-[#3c3a38] text-white focus:outline-none"
                 >
                   <option value={8}>8x8 (Standard)</option>
                   <option value={10}>10x10 (Intl)</option>
                 </select>
               </label>
               <label className="text-sm flex items-center gap-2 text-[#c3c2c1] cursor-pointer">
                 <input
                   type="checkbox"
                   checked={forceMajorityCapture}
                   onChange={e => setForceMajorityCapture(e.target.checked)}
                   className="rounded bg-[#3c3a38] border-[#3e3d3b]"
                 />
                 Force Majority Capture
               </label>
               <label className="text-sm flex justify-between items-center text-[#c3c2c1]">
                 Time:
                 <select
                   value={timeControl}
                   onChange={e => setTimeControl(e.target.value as typeof timeControl)}
                   className="ml-2 border border-[#3e3d3b] rounded p-1.5 text-sm bg-[#3c3a38] text-white focus:outline-none"
                 >
                   <option value="bullet">Bullet (2+1)</option>
                   <option value="blitz">Blitz (5+3)</option>
                   <option value="rapid">Rapid (10+5)</option>
                   <option value="correspondence">Correspondence</option>
                 </select>
               </label>
             </div>

             <button
               onClick={handleFindMatch}
               className="w-full px-6 py-4 bg-[#81b64c] text-white font-bold text-lg rounded shadow hover:bg-[#a3d160] transition"
             >
               {tournamentIdToJoin ? 'Join Tournament Match' : 'Play Multiplayer'}
             </button>

             <div className="text-center pt-2 text-sm text-[#8b8987] font-medium">OR</div>

             <div className="grid grid-cols-2 gap-2">
               {[1, 2, 3, 4, 5, 6, 7].map(level => (
                 <button
                   key={level}
                   onClick={() => handlePlayAI(level)}
                   className={`w-full px-2 py-3 text-white font-semibold rounded transition text-sm ${level > 4 ? 'bg-[#c33324] hover:bg-[#d84435] col-span-2' : 'bg-[#403d39] hover:bg-[#524e49]'}`}
                 >
                   AI Lvl {level} {level === 7 ? '(3500+)' : ''}
                 </button>
               ))}
             </div>
           </div>

           <div className="flex flex-col space-y-6 w-full md:w-96">
             {friends.some(f => f.status === 'ACCEPTED' && f.online) && (
               <div className="w-full bg-[#262522] border border-[#3e3d3b] rounded-lg p-4">
                 <h3 className="text-lg font-bold mb-3 text-white">Friends Online</h3>
                 <ul className="space-y-2">
                   {friends.filter(f => f.status === 'ACCEPTED' && f.online).map((f) => (
                     <li key={f.friendId} className="flex justify-between items-center bg-[#3c3a38] p-2.5 rounded">
                       <span className="font-medium text-white flex items-center gap-2">
                         <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                         {f.username}
                       </span>
                       <button
                         onClick={() => handleChallengeFriend(f.friendId)}
                         className="px-3 py-1 bg-[#81b64c] text-white rounded text-sm hover:bg-[#a3d160] font-semibold"
                       >
                         Challenge
                       </button>
                     </li>
                   ))}
                 </ul>
               </div>
             )}

             {activeGames.length > 0 && (
               <div className="w-full bg-[#262522] border border-[#3e3d3b] rounded-lg p-4">
                 <h3 className="text-lg font-bold mb-3 text-white">Live Games</h3>
                 <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                   {activeGames.slice(0, 5).map((game, i) => (
                     <li key={i} className="flex justify-between items-center bg-[#3c3a38] p-2.5 rounded">
                       <span className="font-medium text-white text-sm">{game.player1} vs {game.player2}</span>
                       <button
                         onClick={() => handleWatchGame(game.roomId)}
                         className="px-3 py-1 bg-[#403d39] text-white rounded text-xs hover:bg-[#524e49] font-semibold border border-[#524e49]"
                       >
                         Watch ({game.spectatorsCount})
                       </button>
                     </li>
                   ))}
                 </ul>
                  <a href="/watch" className="block mt-3 text-sm text-[#c3c2c1] hover:text-white text-center">
                    View all live games →
                  </a>
               </div>
             )}
           </div>
        </div>
      </div>
    );
  }

  // Auto-orient so the player's own pieces are always nearest them; a manual toggle
  // can override that default for either side (or for a spectator, who has no default).
  const autoFlip = myColor === PieceColor.DARK;
  const flipped = autoFlip !== manualFlip;

  return (
    <div className="flex flex-col md:flex-row justify-center py-4 gap-8 w-full max-w-6xl mx-auto px-4">
      {challengeBanner}
      {challengeNoticeBanner}
      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4 w-auto">
        <div className="w-full flex justify-between items-center">
          <div className="flex space-x-4 text-sm text-[#8b8987] font-medium">
             <span>{spectatorCount} Spectator(s)</span>
          </div>
          <ConnectionStatus connected={connected} />
        </div>

        <p className="text-md text-[#c3c2c1]">{status}</p>

        {opponentDisconnected && (
          <div className="bg-[#403d39] border border-orange-500/50 text-orange-400 px-4 py-2 rounded text-sm font-medium w-full text-center">
            ⚠️ Opponent disconnected — waiting for reconnect...
          </div>
        )}

        <div className="flex w-full justify-between items-center px-2">
          <div className="flex gap-2">
            <button onClick={() => setManualFlip(f => !f)} className="px-3 py-1.5 bg-[#403d39] text-[#c3c2c1] rounded hover:bg-[#524e49] text-xs font-semibold transition border border-[#524e49]">
              ⇅ Flip Board
            </button>
          </div>
          <Timer initialTime={displayClocks[PieceColor.DARK]} isActive={currentTurn === PieceColor.DARK && !gameOver} />
        </div>

        <Board
          board={board}
          myColor={myColor}
          currentTurn={gameOver ? null : currentTurn}
          legalMoves={legalMoves}
          lastMove={lastMove}
          flipped={flipped}
          onMove={handleMove}
        />

        <div className="flex w-full justify-between items-center px-2">
           <div className="flex gap-2">
            {myColor && !gameOver && (
              <>
                <button onClick={handleOfferDraw} className="px-3 py-1.5 bg-[#403d39] text-[#c3c2c1] rounded hover:bg-[#524e49] text-xs font-semibold transition border border-[#524e49]">
                  Offer Draw
                </button>
                <button onClick={handleResign} className="px-3 py-1.5 bg-[#403d39] text-[#c3c2c1] rounded hover:bg-[#524e49] text-xs font-semibold transition border border-[#524e49]">
                  Resign
                </button>
              </>
            )}
           </div>
           <Timer initialTime={displayClocks[PieceColor.LIGHT]} isActive={currentTurn === PieceColor.LIGHT && !gameOver} />
        </div>

        {drawOfferPending && (
          <div className="bg-[#403d39] border border-yellow-500/50 text-yellow-400 px-4 py-3 rounded relative shadow-md w-full">
            <p className="font-bold text-sm mb-1">Draw Offered</p>
            <div className="flex gap-2">
              <button onClick={handleAcceptDraw} className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-1 px-3 rounded text-xs">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-transparent hover:bg-[#524e49] text-[#c3c2c1] font-semibold py-1 px-3 border border-[#524e49] rounded text-xs">Decline</button>
            </div>
          </div>
        )}

        <div className="w-full flex flex-col gap-1">
          <CapturedTray captured={captured[PieceColor.DARK]} label="Light captured" />
          <CapturedTray captured={captured[PieceColor.LIGHT]} label="Dark captured" />
        </div>
      </div>

      {/* Side Column: moves + chat */}
      <div className="w-full md:w-[350px] flex flex-col gap-4 mt-8 md:mt-0">
        <MoveList moves={moveHistory} boardSize={board.length} />

        <div className="flex flex-col bg-[#262522] rounded-lg shadow-xl border border-[#3e3d3b] h-72">
          <div className="bg-[#302e2b] text-[#c3c2c1] p-3 rounded-t-lg border-b border-[#3e3d3b]">
            <h3 className="font-bold text-sm">Live Chat</h3>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-[#262522]">
            {chatMessages.length === 0 ? (
              <p className="text-center text-[#8b8987] text-sm mt-10">No messages yet. Say hi!</p>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-[11px] font-semibold text-[#8b8987]">{msg.sender}</span>
                  <span className="bg-[#3c3a38] text-white p-2 rounded text-sm inline-block w-fit max-w-[90%] break-words">
                    {msg.message}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="p-2 border-t border-[#3e3d3b] bg-[#262522] rounded-b-lg">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 text-sm border border-[#3e3d3b] bg-[#3c3a38] text-white rounded px-3 py-1.5 focus:outline-none focus:border-[#81b64c]"
              />
              <button type="submit" className="bg-[#81b64c] text-white px-3 py-1.5 rounded text-sm font-semibold hover:bg-[#a3d160] transition">
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
