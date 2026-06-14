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
      <div className="flex flex-col items-center justify-center space-y-6 mt-10">
        <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-emerald-400 tracking-tight">Play Draughts</h1>
        <p className="text-[#c3c3c2]">{status}</p>

        <div className="flex flex-col space-y-6 pt-6 border-t border-[#3e3b38] w-80">

          <div className="bg-[#262421] p-5 rounded-lg shadow-xl border border-[#3e3b38] flex flex-col space-y-4">
            <h4 className="text-lg font-bold text-white mb-2">Game Rules</h4>
            <label className="text-sm flex justify-between items-center text-[#c3c3c2]">
               Board Size:
               <select
                  value={boardSize}
                  onChange={e => setBoardSize(parseInt(e.target.value))}
                  className="ml-2 border border-[#3e3b38] rounded p-1 text-sm bg-[#302e2b] text-white"
               >
                 <option value={8}>8x8 (Standard)</option>
                 <option value={10}>10x10 (International)</option>
               </select>
            </label>
            <label className="text-sm flex items-center gap-2 text-[#c3c3c2] cursor-pointer">
               <input
                  type="checkbox"
                  checked={forceMajorityCapture}
                  onChange={e => setForceMajorityCapture(e.target.checked)}
                  className="accent-green-500 rounded"
               />
               Force Majority Capture
            </label>
          </div>

          <button
            onClick={handleFindMatch}
            className="w-full px-6 py-4 bg-green-600 text-white font-bold rounded-lg shadow-lg hover:bg-green-500 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 text-xl"
          >
            <span className="text-2xl">⚡</span> {tournamentIdToJoin ? 'Find Match' : 'Play Online'}
          </button>

          <div className="relative flex py-2 items-center">
             <div className="flex-grow border-t border-[#3e3b38]"></div>
             <span className="flex-shrink-0 mx-4 text-[#8a8886] text-sm">Play Computer</span>
             <div className="flex-grow border-t border-[#3e3b38]"></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5, 6, 7].map(level => (
              <button
                key={level}
                onClick={() => handlePlayAI(level)}
                className={`px-4 py-2 text-white rounded shadow transition ${level > 4 ? 'col-span-2 bg-[#8a3333] hover:bg-[#a63e3e]' : 'bg-[#3e3b38] hover:bg-[#4a4846]'}`}
              >
                AI Lvl {level} {level === 7 ? '(3500+)' : ''}
              </button>
            ))}
          </div>
        </div>

        {activeGames.length > 0 && (
          <div className="mt-8 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-center text-white">Live Games</h3>
            <ul className="space-y-2">
              {activeGames.map((game, i) => (
                <li key={i} className="flex justify-between items-center bg-[#262421] p-3 rounded-lg border border-[#3e3b38]">
                   <span className="font-medium text-[#c3c3c2]">{game.player1} vs {game.player2}</span>
                   <button
                     onClick={() => handleWatchGame(game.roomId)}
                     className="px-4 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 shadow transition"
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

  // Calculate valid destinations for highlighting
  const validDestinations = selectedPos ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col).map(m => `${m.to.row},${m.to.col}`) : [];

  return (
    <div className="flex flex-col md:flex-row justify-center py-4 gap-8 max-w-6xl mx-auto px-4 mt-6">

      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4">
        <div className="flex space-x-4 text-sm text-[#8a8886] font-medium w-full justify-between px-2">
          <span>{spectatorCount} Spectator(s)</span>
          <span>{status}</span>
        </div>

        <p className={`text-xl font-bold px-6 py-2 rounded w-full text-center ${
          (!myColor && currentTurn === PieceColor.LIGHT) || (myColor && currentTurn === myColor)
            ? "bg-green-600 text-white shadow-lg"
            : "bg-[#262421] text-[#c3c3c2] border border-[#3e3b38]"
        }`}>
          {!myColor ? (currentTurn === PieceColor.LIGHT ? "Light's turn" : "Dark's turn") : (currentTurn === myColor ? "Your Turn" : "Opponent's Turn")}
        </p>

        {myColor && !status.includes('Game Over') && (
          <div className="flex gap-4">
            <button onClick={handleOfferDraw} className="px-4 py-2 bg-[#3e3b38] text-white rounded shadow hover:bg-[#4a4846] text-sm font-semibold transition">
              ½ Offer Draw
            </button>
            <button onClick={handleResign} className="px-4 py-2 bg-[#8a3333] text-white rounded shadow hover:bg-[#a63e3e] text-sm font-semibold transition">
              ⚑ Resign
            </button>
          </div>
        )}

        {drawOfferPending && (
          <div className="bg-[#262421] border border-yellow-600 text-white px-4 py-3 rounded relative shadow-md mt-2 w-full">
            <p className="font-bold text-yellow-500">Draw Offered</p>
            <p className="text-sm text-[#c3c3c2]">Your opponent has offered a draw.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={handleAcceptDraw} className="bg-green-600 hover:bg-green-500 text-white font-bold py-1.5 px-4 rounded text-sm transition">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-[#3e3b38] hover:bg-[#4a4846] text-white font-semibold py-1.5 px-4 border border-[#3e3b38] rounded text-sm transition">Decline</button>
            </div>
          </div>
        )}

        <div className="border-[4px] border-[#3e3b38] shadow-2xl rounded-sm overflow-hidden select-none">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]'; // Chess.com standard green/white colors
                if (isSelected) squareBg = 'bg-[#f6f669]'; // Chess.com selection yellow
                if (isHighlighted) squareBg = isDarkSquare ? 'bg-[#baca44]' : 'bg-[#f4f6b5]'; // Chess.com highlight colors

                // Dynamically adjust sizes for 10x10 boards so they don't break the layout
                const is10x10 = board.length === 10;
                const cellClass = is10x10 ? 'w-10 h-10 sm:w-[60px] sm:h-[60px]' : 'w-14 h-14 sm:w-[76px] sm:h-[76px]';
                const pieceClass = is10x10 ? 'w-[85%] h-[85%]' : 'w-[85%] h-[85%]';

                // SVG Crown for Kings
                const CrownIcon = () => (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-[60%] h-[60%] opacity-80" style={{ filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.5))' }}>
                    <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" />
                  </svg>
                );

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`${cellClass} flex items-center justify-center ${squareBg} cursor-pointer transition-colors duration-150 relative`}
                  >
                    {isHighlighted && !cell && (
                      <div className="w-[30%] h-[30%] rounded-full bg-black opacity-20 pointer-events-none" />
                    )}
                    {isHighlighted && cell && (
                       <div className="absolute inset-0 border-4 border-black opacity-20 pointer-events-none rounded-full scale-90" />
                    )}

                    {cell && (
                      <div className={`
                        ${pieceClass} rounded-full flex items-center justify-center text-white font-bold transform transition-transform hover:scale-105
                        ${cell.color === PieceColor.LIGHT
                            ? 'bg-[#f9f9f9] border-[#e0e0e0] text-[#404040]'
                            : 'bg-[#2b2b2b] border-[#1f1f1f] text-[#a0a0a0]'}
                      `}
                      style={{
                        boxShadow: cell.color === PieceColor.LIGHT
                           ? 'inset 0 -4px 6px rgba(0,0,0,0.2), 0 3px 5px rgba(0,0,0,0.4)'
                           : 'inset 0 -4px 6px rgba(0,0,0,0.5), 0 3px 5px rgba(0,0,0,0.6)',
                        border: '2px solid',
                      }}
                      >
                        {cell.type === PieceType.KING && <CrownIcon />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Column */}
      <div className="w-full md:w-[350px] flex flex-col bg-[#262421] rounded-lg shadow-xl border border-[#3e3b38] h-[600px] mt-12 md:mt-[76px]">
        <div className="bg-[#1e1c1a] text-[#c3c3c2] p-4 rounded-t-lg border-b border-[#3e3b38]">
          <h3 className="font-bold flex items-center gap-2"><span>💬</span> Live Chat</h3>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#262421]">
          {chatMessages.length === 0 ? (
             <div className="text-center text-[#8a8886] text-sm mt-4 italic">No messages yet...</div>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className="text-sm">
                <span className={`font-bold ${msg.sender === (myColor === PieceColor.LIGHT ? 'Light' : 'Dark') ? 'text-green-500' : 'text-blue-400'}`}>{msg.sender}: </span>
                <span className="text-[#c3c3c2] break-words">{msg.message}</span>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSendMessage} className="p-3 border-t border-[#3e3b38] bg-[#1e1c1a] rounded-b-lg flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="flex-1 bg-[#302e2b] border border-[#3e3b38] text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 transition-colors placeholder-[#8a8886]"
            placeholder="Type a message..."
          />
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-500 font-bold transition">
            Send
          </button>
        </form>
      </div>

    </div>
  );
}
