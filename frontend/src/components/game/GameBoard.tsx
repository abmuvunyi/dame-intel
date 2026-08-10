'use client';

import { useState, useEffect } from 'react';
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

// No time-control data exists server-side yet (that's Phase 5's job — "server-
// authoritative clocks"). This is a client-only, cosmetic per-turn countdown so the
// UI has a clock slot ready; it does not enforce anything and can drift from any
// future server clock. onTimeout is deliberately a no-op for the same reason: a
// client-only "loss on time" the server doesn't know about would just be broken.
const COSMETIC_CLOCK_SECONDS = 600;

export default function GameBoard() {
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
  const [roomId, setRoomId] = useState<string | null>(null);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<{ sender: string, message: string, timestamp: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [drawOfferPending, setDrawOfferPending] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [manualFlip, setManualFlip] = useState(false);

  // Settings
  const [boardSize, setBoardSize] = useState(8);
  const [forceMajorityCapture, setForceMajorityCapture] = useState(true);

  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const tIdStr = searchParams.get('tournamentId');
  const tournamentIdToJoin = tIdStr ? parseInt(tIdStr, 10) : null;

  useEffect(() => {
    const token = localStorage.getItem('token');
    const newSocket = io((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'), {
      auth: { token },
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      if (tournamentIdToJoin) {
        setStatus(`Connected. Click 'Find Tournament Match' to join the Arena.`);
      } else {
        setStatus('Connected to server. Click Find Match to begin.');
      }
      newSocket.emit('getActiveGames');
    });

    newSocket.on('disconnect', () => setConnected(false));

    newSocket.on('activeGamesList', (games: any[]) => setActiveGames(games));

    newSocket.on('waitingForOpponent', () => setStatus('Waiting in matchmaking queue...'));

    newSocket.on('gameStart', (data: { roomId: string, color: PieceColor | null, board: BoardState, turn: PieceColor, legalMoves: Move[] }) => {
      setRoomId(data.roomId);
      setMyColor(data.color);
      setBoard(data.board);
      setCurrentTurn(data.turn);
      setLegalMoves(data.legalMoves || []);
      setLastMove(null); // fresh position, nothing to animate from
      setMoveHistory([]);
      setCaptured({ [PieceColor.LIGHT]: [], [PieceColor.DARK]: [] });
      setGameOver(false);
      setManualFlip(false);
      if (data.color) {
        setStatus(`Game Started! You are ${data.color === PieceColor.LIGHT ? 'Light (Bottom)' : 'Dark (Top)'}.`);
      } else {
        setStatus('Spectating match...');
      }
    });

    newSocket.on('gameState', (data: { board: BoardState, turn: PieceColor, move?: Move }) => {
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
      if (data.move) {
        setLastMove(data.move);
        setMoveHistory(prev => [...prev, data.move!]);
      }
    });

    newSocket.on('legalMoves', (moves: Move[]) => setLegalMoves(moves));

    newSocket.on('gameOver', (data: { winner: PieceColor | 'DRAW' }) => {
      setGameOver(true);
      setStatus(
        data.winner === 'DRAW'
          ? 'Game Over! Draw.'
          : `Game Over! Winner: ${data.winner === PieceColor.LIGHT ? 'Light' : 'Dark'}`,
      );
    });

    newSocket.on('playerDisconnected', () => {
      setGameOver(true);
      setStatus('Opponent disconnected. You win!');
    });

    newSocket.on('invalidMove', () => {
      console.warn('Server rejected move as invalid.');
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
    socket?.emit('joinMatchmaking', { tournamentId: tournamentIdToJoin, rules: { boardSize, forceMajorityCapture } });
  };

  const handlePlayAI = (difficulty: number) => {
    socket?.emit('playVsAi', { difficulty, rules: { boardSize, forceMajorityCapture } });
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

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <div className="absolute top-4 right-4"><ConnectionStatus connected={connected} /></div>
        <h1 className="text-3xl font-bold">Online Draughts Platform</h1>
        <p className="text-gray-600">{status}</p>

        <div className="flex flex-col space-y-4 pt-4 border-t border-gray-200 w-64">
          <div className="bg-gray-100 p-4 rounded-lg shadow-inner flex flex-col space-y-3">
            <h4 className="text-sm font-bold text-gray-700">Game Rules</h4>
            <label className="text-sm flex justify-between items-center text-gray-600">
              Board Size:
              <select
                value={boardSize}
                onChange={e => setBoardSize(parseInt(e.target.value))}
                className="ml-2 border rounded p-1 text-sm bg-white"
              >
                <option value={8}>8x8 (Standard)</option>
                <option value={10}>10x10 (International)</option>
              </select>
            </label>
            <label className="text-sm flex items-center gap-2 text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={forceMajorityCapture}
                onChange={e => setForceMajorityCapture(e.target.checked)}
                className="rounded"
              />
              Force Majority Capture
            </label>
          </div>

          <button
            onClick={handleFindMatch}
            className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded shadow hover:bg-blue-700 transition"
          >
            {tournamentIdToJoin ? 'Find Tournament Match' : 'Play Multiplayer'}
          </button>

          <div className="text-center pt-2 text-sm text-gray-500 font-medium">OR</div>

          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map(level => (
              <button
                key={level}
                onClick={() => handlePlayAI(level)}
                className={`w-full px-2 py-2 text-white rounded transition text-sm ${level > 4 ? 'bg-red-800 hover:bg-red-900 col-span-2' : 'bg-slate-700 hover:bg-slate-800'}`}
              >
                AI Lvl {level} {level === 7 ? '(3500+ ELO)' : ''}
              </button>
            ))}
          </div>
        </div>

        {activeGames.length > 0 && (
          <div className="mt-8 w-full">
            <h3 className="text-xl font-bold mb-4 text-center">Live Games</h3>
            <ul className="space-y-2">
              {activeGames.map((game, i) => (
                <li key={i} className="flex justify-between items-center bg-gray-50 p-3 rounded border">
                  <span className="font-medium text-gray-700">{game.player1} vs {game.player2}</span>
                  <button
                    onClick={() => handleWatchGame(game.roomId)}
                    className="px-4 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                  >
                    Watch ({game.spectatorsCount} 👀)
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Auto-orient so the player's own pieces are always nearest them; a manual toggle
  // can override that default for either side (or for a spectator, who has no default).
  const autoFlip = myColor === PieceColor.DARK;
  const flipped = autoFlip !== manualFlip;

  return (
    <div className="flex flex-col md:flex-row justify-center py-10 gap-8 max-w-6xl mx-auto px-4">
      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4">
        <div className="w-full flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Game Room</h1>
          <ConnectionStatus connected={connected} />
        </div>
        <div className="flex space-x-4 text-sm text-gray-500 font-medium">
          <span>{spectatorCount} Spectator(s)</span>
        </div>
        <p className="text-md text-gray-600">{status}</p>
        <p className="text-xl font-semibold text-blue-700">
          {!myColor ? (currentTurn === PieceColor.LIGHT ? "Light's turn" : "Dark's turn") : (currentTurn === myColor ? "It's your turn!" : 'Waiting for opponent...')}
        </p>

        <div className="flex items-center gap-3">
          <Timer initialTime={COSMETIC_CLOCK_SECONDS} isActive={currentTurn === PieceColor.DARK && !gameOver} />
          <span className="text-xs text-gray-400">vs</span>
          <Timer initialTime={COSMETIC_CLOCK_SECONDS} isActive={currentTurn === PieceColor.LIGHT && !gameOver} />
        </div>

        <div className="flex gap-4">
          <button onClick={() => setManualFlip(f => !f)} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded shadow-sm hover:bg-slate-200 text-xs font-semibold transition">
            ⇅ Flip Board
          </button>
          {myColor && !gameOver && (
            <>
              <button onClick={handleOfferDraw} className="px-4 py-2 bg-gray-200 text-gray-800 rounded shadow hover:bg-gray-300 text-sm font-semibold transition">
                Offer Draw
              </button>
              <button onClick={handleResign} className="px-4 py-2 bg-red-100 text-red-800 rounded shadow hover:bg-red-200 text-sm font-semibold transition">
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
      <div className="w-full md:w-80 flex flex-col gap-4">
        <MoveList moves={moveHistory} boardSize={board.length} />

        <div className="flex flex-col bg-white rounded-lg shadow-xl border border-gray-200 h-72">
          <div className="bg-slate-800 text-white p-4 rounded-t-lg">
            <h3 className="font-bold">Live Chat</h3>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
            {chatMessages.length === 0 ? (
              <p className="text-center text-gray-400 text-sm mt-10">No messages yet. Say hi!</p>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-600">{msg.sender}</span>
                  <span className="bg-white p-2 rounded shadow-sm text-sm border border-gray-100 inline-block w-fit max-w-[90%] break-words">
                    {msg.message}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-gray-200 bg-white rounded-b-lg">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition">
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
