'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export enum PieceColor {
  LIGHT = 'L',
  DARK = 'D',
}

export enum PieceType {
  MAN = 'M',
  KING = 'K',
}

export interface Piece {
  color: PieceColor;
  type: PieceType;
}

export type BoardPosition = Piece | null;
export type BoardState = BoardPosition[][];

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  captured?: Position[];
}

export default function GameBoard() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [myColor, setMyColor] = useState<PieceColor | null>(null);
  const [currentTurn, setCurrentTurn] = useState<PieceColor | null>(null);
  const [status, setStatus] = useState<string>('Disconnected');
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<{sender: string, message: string, timestamp: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [drawOfferPending, setDrawOfferPending] = useState(false);

  // Settings
  const [boardSize, setBoardSize] = useState(8);
  const [forceMajorityCapture, setForceMajorityCapture] = useState(true);

  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const tIdStr = searchParams.get('tournamentId');
  const tournamentIdToJoin = tIdStr ? parseInt(tIdStr, 10) : null;

  useEffect(() => {
    // Connect to backend WebSocket
    const token = localStorage.getItem('token');
    const newSocket = io((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'), {
      auth: { token }
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      if (tournamentIdToJoin) {
         setStatus(`Connected. Click 'Find Tournament Match' to join the Arena.`);
      } else {
         setStatus('Connected to server. Click Find Match to begin.');
      }
      newSocket.emit('getActiveGames');
    });

    newSocket.on('activeGamesList', (games: any[]) => {
      setActiveGames(games);
    });

    newSocket.on('waitingForOpponent', () => {
      setStatus('Waiting in matchmaking queue...');
    });

    newSocket.on('gameStart', (data: { roomId: string, color: PieceColor | null, board: BoardState, turn: PieceColor, legalMoves: Move[] }) => {
      setRoomId(data.roomId);
      setMyColor(data.color);
      setBoard(data.board);
      setCurrentTurn(data.turn);
      setLegalMoves(data.legalMoves || []);
      if (data.color) {
         setStatus(`Game Started! You are ${data.color === PieceColor.LIGHT ? 'Light (Bottom)' : 'Dark (Top)'}.`);
      } else {
         setStatus('Spectating match...');
      }
    });

    newSocket.on('gameState', (data: { board: BoardState, turn: PieceColor }) => {
      setBoard(data.board);
      setCurrentTurn(data.turn);
      setSelectedPos(null);
    });

    newSocket.on('legalMoves', (moves: Move[]) => {
      setLegalMoves(moves);
    });

    newSocket.on('gameOver', (data: { winner: PieceColor }) => {
      setStatus(`Game Over! Winner: ${data.winner === PieceColor.LIGHT ? 'Light' : 'Dark'}`);
    });

    newSocket.on('playerDisconnected', () => {
      setStatus('Opponent disconnected. You win!');
    });

    newSocket.on('invalidMove', () => {
      console.warn('Server rejected move as invalid.');
      setSelectedPos(null);
    });

    newSocket.on('spectatorJoined', (data: { count: number }) => {
      setSpectatorCount(data.count);
    });

    newSocket.on('receiveMessage', (msg: {sender: string, message: string, timestamp: string}) => {
      setChatMessages(prev => [...prev, msg]);
    });

    newSocket.on('drawOffered', () => {
      setDrawOfferPending(true);
    });

    newSocket.on('drawDeclined', () => {
      alert("Your opponent declined the draw offer.");
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleFindMatch = () => {
    if (socket) {
      socket.emit('joinMatchmaking', {
         tournamentId: tournamentIdToJoin,
         rules: { boardSize, forceMajorityCapture }
      });
    }
  };

  const handlePlayAI = (difficulty: number) => {
    if (socket) {
      socket.emit('playVsAi', {
         difficulty,
         rules: { boardSize, forceMajorityCapture }
      });
    }
  };

  const handleWatchGame = (roomIdToWatch: string) => {
    if (socket) {
      socket.emit('joinSpectator', { roomId: roomIdToWatch });
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !roomId || !chatInput.trim()) return;

    socket.emit('sendMessage', { roomId, message: chatInput });
    setChatInput('');
  };

  const handleResign = () => {
    if (confirm("Are you sure you want to resign?")) {
      socket?.emit('resignGame');
    }
  };

  const handleOfferDraw = () => {
    socket?.emit('offerDraw');
    alert("Draw offer sent.");
  };

  const handleAcceptDraw = () => {
    socket?.emit('acceptDraw');
    setDrawOfferPending(false);
  };

  const handleDeclineDraw = () => {
    socket?.emit('declineDraw');
    setDrawOfferPending(false);
  };

  const isMoveLegal = (from: Position, to: Position) => {
    return legalMoves.find(
      (m) => m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col
    );
  };

  const handleSquareClick = (r: number, c: number) => {
    if (!board || currentTurn !== myColor) return;

    if (selectedPos) {
      const move = isMoveLegal(selectedPos, { row: r, col: c });
      if (move) {
        // Send move to server
        socket?.emit('makeMove', move);
        // Optimistic update could go here, but for simplicity wait for server
      } else {
        // Deselect or select another piece
        const piece = board[r][c];
        if (piece && piece.color === myColor) {
           setSelectedPos({ row: r, col: c });
        } else {
           setSelectedPos(null);
        }
      }
    } else {
      // Select a piece
      const piece = board[r][c];
      if (piece && piece.color === myColor) {
        setSelectedPos({ row: r, col: c });
      }
    }
  };

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full space-y-6">
        <h1 className="text-4xl font-bold text-white tracking-tight">Play Draughts</h1>
        <p className="text-gray-300">{status}</p>

        <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl">
          {/* Settings Panel */}
          <div className="flex-1 bg-[#262421] p-6 rounded-lg shadow-xl border border-white/10 flex flex-col space-y-5">
            <h4 className="text-lg font-bold text-white">Game Settings</h4>

            <div className="flex flex-col space-y-4">
              <label className="text-sm flex flex-col text-gray-300 gap-1">
                 Board Variant:
                 <select
                    value={boardSize}
                    onChange={e => setBoardSize(parseInt(e.target.value))}
                    className="border border-white/20 rounded p-2 text-sm bg-[#302e2b] text-white focus:outline-none focus:border-green-500"
                 >
                   <option value={8}>8x8 (Standard)</option>
                   <option value={10}>10x10 (International)</option>
                 </select>
              </label>
              <label className="text-sm flex items-center gap-3 text-gray-300 cursor-pointer p-2 bg-[#302e2b] border border-white/10 rounded">
                 <input
                    type="checkbox"
                    checked={forceMajorityCapture}
                    onChange={e => setForceMajorityCapture(e.target.checked)}
                    className="w-4 h-4 accent-green-500"
                 />
                 Force Majority Capture
              </label>
            </div>

            <button
              onClick={handleFindMatch}
              className="w-full px-6 py-4 bg-green-600 text-white text-lg font-bold rounded shadow-lg hover:bg-green-500 transition-colors"
            >
              {tournamentIdToJoin ? 'Join Tournament Match' : 'Play Online'}
            </button>
          </div>

          {/* AI Panel */}
          <div className="flex-1 bg-[#262421] p-6 rounded-lg shadow-xl border border-white/10 flex flex-col space-y-5">
             <h4 className="text-lg font-bold text-white">Play vs Computer</h4>

             <div className="grid grid-cols-2 gap-3 flex-1">
              {[1, 2, 3, 4, 5, 6, 7].map(level => (
                <button
                  key={level}
                  onClick={() => handlePlayAI(level)}
                  className={`w-full px-3 py-3 text-white rounded font-bold shadow transition-colors text-sm ${level > 4 ? 'bg-red-800/80 hover:bg-red-700 col-span-2' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  Level {level} {level === 7 ? '(3500+)' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeGames.length > 0 && (
          <div className="w-full max-w-4xl bg-[#262421] p-6 rounded-lg shadow-xl border border-white/10 mt-6">
            <h3 className="text-xl font-bold mb-4 text-white">Watch Live Games</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeGames.map((game, i) => (
                <div key={i} className="flex justify-between items-center bg-[#302e2b] p-4 rounded border border-white/5">
                   <span className="font-semibold text-gray-200 truncate pr-2">{game.player1} vs {game.player2}</span>
                   <button
                     onClick={() => handleWatchGame(game.roomId)}
                     className="px-4 py-2 bg-white/10 text-white rounded font-bold text-sm hover:bg-white/20 whitespace-nowrap transition-colors"
                   >
                     Watch ({game.spectatorsCount})
                   </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  }

  // Calculate valid destinations for highlighting
  const validDestinations = selectedPos ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col).map(m => `${m.to.row},${m.to.col}`) : [];

  return (
    <div className="flex flex-col md:flex-row justify-center py-6 gap-6 w-full max-w-7xl mx-auto px-2 md:px-6">

      {/* Board Column */}
      <div className="flex flex-col items-center flex-1">

        {/* Opponent Info Area (Top) */}
        <div className="w-full max-w-2xl flex justify-between items-center mb-2 px-2">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-600 rounded-sm flex items-center justify-center text-xl shadow-md border border-white/10">🤖</div>
              <span className="font-bold text-gray-200">Opponent</span>
           </div>
           {/* Placeholder timer */}
           <div className="bg-[#262421] text-gray-200 font-mono text-xl py-1 px-3 rounded shadow-inner">10:00</div>
        </div>

        {/* The Board */}
        <div className="border-[12px] border-[#262421] bg-[#262421] shadow-2xl rounded-sm w-full max-w-2xl aspect-square flex flex-col">
          {board.map((row, r) => (
            <div key={r} className="flex flex-1 w-full">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                // Chess.com style colors
                let squareBg = isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]';
                if (isSelected) squareBg = 'bg-[#f6f669]'; // Yellowish highlight
                if (isHighlighted) squareBg = 'bg-black/20'; // Dark dot overlay effect usually, using subtle darken here

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`flex-1 flex items-center justify-center ${squareBg} cursor-pointer relative`}
                  >
                     {/* Legal move dot indicator */}
                     {isHighlighted && !cell && (
                        <div className="w-1/3 h-1/3 bg-black/20 rounded-full" />
                     )}

                     {/* Capture highlight indicator */}
                     {isHighlighted && cell && (
                         <div className="absolute inset-0 border-4 border-black/20 rounded-full scale-90" />
                     )}

                    {cell && (
                      <div className={`
                        w-[85%] h-[85%] rounded-full shadow-[0_4px_6px_rgba(0,0,0,0.5)] flex items-center justify-center text-white font-bold
                        ${cell.color === PieceColor.LIGHT ? 'bg-[#f8f8f8] border-2 border-[#e8e8e8]' : 'bg-[#2a2a2a] border-2 border-[#1a1a1a]'}
                        relative z-10
                      `}>
                        {cell.type === PieceType.KING && (
                           // Crown SVG for Kings
                           <svg viewBox="0 0 24 24" className={`w-[60%] h-[60%] ${cell.color === PieceColor.LIGHT ? 'fill-black/60' : 'fill-white/80'}`}>
                              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                           </svg>
                        )}
                        {/* Shadow stack effect for King to make it look taller */}
                        {cell.type === PieceType.KING && (
                          <div className={`
                            absolute inset-0 rounded-full -z-10 translate-y-[4px] shadow-[0_4px_6px_rgba(0,0,0,0.5)]
                            ${cell.color === PieceColor.LIGHT ? 'bg-[#d8d8d8]' : 'bg-[#1a1a1a]'}
                          `} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Player Info Area (Bottom) */}
        <div className="w-full max-w-2xl flex justify-between items-center mt-2 px-2">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-600 rounded-sm flex items-center justify-center text-xl shadow-md border border-white/10">👤</div>
              <span className="font-bold text-gray-200">You</span>
           </div>
           {/* Placeholder timer */}
           <div className="bg-[#262421] text-white font-mono text-xl py-1 px-3 rounded shadow-inner">10:00</div>
        </div>
      </div>

      {/* Side Panel (Chat & Controls) */}
      <div className="w-full md:w-80 flex flex-col bg-[#262421] rounded-lg shadow-xl border border-white/5 h-[600px] md:h-auto overflow-hidden">

        {/* Status / Controls Tab */}
        <div className="bg-[#21201d] p-4 flex flex-col items-center justify-center border-b border-white/5 space-y-3">
          <p className="text-sm font-semibold text-gray-300 text-center">{status}</p>
          <p className="text-lg font-bold text-white text-center">
            {!myColor ? (currentTurn === PieceColor.LIGHT ? "Light's turn" : "Dark's turn") : (currentTurn === myColor ? "It's your turn!" : "Waiting for opponent...")}
          </p>

          <div className="flex items-center gap-2 text-xs text-gray-400">
             <span>👁️ {spectatorCount} Spectators</span>
          </div>

          {myColor && !status.includes('Game Over') && (
            <div className="flex gap-2 w-full mt-2">
              <button onClick={handleOfferDraw} className="flex-1 py-2 bg-white/10 text-gray-200 rounded font-bold hover:bg-white/20 text-sm transition">
                ½ Draw
              </button>
              <button onClick={handleResign} className="flex-1 py-2 bg-red-900/50 text-red-200 rounded font-bold hover:bg-red-800/80 text-sm transition">
                🏳️ Resign
              </button>
            </div>
          )}

          {drawOfferPending && (
            <div className="bg-yellow-900/30 border border-yellow-700/50 p-3 rounded w-full">
              <p className="text-sm font-bold text-yellow-500 mb-2">Draw Offered</p>
              <div className="flex gap-2">
                <button onClick={handleAcceptDraw} className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold py-1 px-2 rounded text-xs transition">Accept</button>
                <button onClick={handleDeclineDraw} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-1 px-2 rounded text-xs transition">Decline</button>
              </div>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#262421]">
          {chatMessages.length === 0 ? (
             <p className="text-center text-gray-500 text-sm mt-10">No messages yet.</p>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-xs font-semibold text-gray-400">{msg.sender}</span>
                <span className="bg-[#302e2b] text-gray-200 p-2 rounded shadow-sm text-sm border border-white/5 inline-block w-fit max-w-[90%] break-words">
                  {msg.message}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-white/5 bg-[#21201d]">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 text-sm border border-white/10 rounded bg-[#302e2b] text-white px-3 py-2 focus:outline-none focus:border-green-500"
            />
            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-green-500 transition"
            >
              Send
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
