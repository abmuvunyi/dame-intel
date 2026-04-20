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

export interface TimeControl {
  initialMinutes: number;
  incrementSeconds: number;
}

interface GameBoardProps {
  initialSettings?: {
    boardSize: number;
    timeControl?: TimeControl | null;
  };
  onBack?: () => void;
}

export default function GameBoard({ initialSettings, onBack }: GameBoardProps) {
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

  // Time states
  const [timeControl, setTimeControl] = useState<TimeControl | null>(initialSettings?.timeControl || null);
  const [timeLeft, setTimeLeft] = useState<{ [PieceColor.LIGHT]: number, [PieceColor.DARK]: number }>({
    [PieceColor.LIGHT]: 0,
    [PieceColor.DARK]: 0
  });

  // Settings
  const [boardSize, setBoardSize] = useState(initialSettings?.boardSize || 8);
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

    newSocket.on('timeUpdate', (times: { [PieceColor.LIGHT]: number, [PieceColor.DARK]: number }) => {
      setTimeLeft(times);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Automatically start matchmaking if settings were provided
  useEffect(() => {
    if (initialSettings && socket && status.includes('Connected')) {
      handleFindMatch();
    }
  }, [initialSettings, socket, status]);

  const handleFindMatch = () => {
    if (socket) {
      socket.emit('joinMatchmaking', {
         tournamentId: tournamentIdToJoin,
         rules: { boardSize, forceMajorityCapture },
         timeControl: timeControl
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
      <div className="flex flex-col items-center justify-center h-[600px] w-full space-y-4">
        {onBack && (
           <button onClick={onBack} className="absolute top-4 left-4 px-4 py-2 bg-slate-200 rounded text-slate-800 font-bold hover:bg-slate-300">
             ← Back
           </button>
        )}
        <h1 className="text-3xl font-bold">Connecting to Game</h1>
        <p className="text-gray-600 animate-pulse">{status}</p>
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const formatTime = (ms: number) => {
    if (ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Calculate valid destinations for highlighting
  const validDestinations = selectedPos ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col).map(m => `${m.to.row},${m.to.col}`) : [];

  const opponentColor = myColor === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;

  return (
    <div className="flex flex-col md:flex-row justify-center py-10 gap-8 max-w-6xl mx-auto px-4">

      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4 w-full">
        <div className="w-full flex justify-between items-center mb-2 px-2">
           <div className="flex items-center gap-4">
              <span className="font-semibold text-lg">{myColor ? 'Opponent' : 'Dark'}</span>
              {timeControl && (
                 <div className={`px-4 py-2 rounded font-mono text-xl font-bold ${currentTurn === opponentColor ? 'bg-slate-700 text-white shadow-lg' : 'bg-slate-200 text-slate-500'}`}>
                   {formatTime(timeLeft[opponentColor])}
                 </div>
              )}
           </div>
        </div>

        {myColor && !status.includes('Game Over') && (
          <div className="flex gap-4 mb-4">
            <button onClick={handleOfferDraw} className="px-4 py-2 bg-slate-700 text-slate-200 rounded shadow hover:bg-slate-600 text-sm font-semibold transition">
              Offer Draw
            </button>
            <button onClick={handleResign} className="px-4 py-2 bg-red-900 text-red-200 rounded shadow hover:bg-red-800 text-sm font-semibold transition">
              Resign
            </button>
          </div>
        )}

        {drawOfferPending && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded relative shadow-md mb-4">
            <p className="font-bold">Draw Offered</p>
            <p className="text-sm">Your opponent has offered a draw.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={handleAcceptDraw} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded text-sm">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-1 px-3 border border-gray-400 rounded shadow text-sm">Decline</button>
            </div>
          </div>
        )}

        <div className="border-[6px] border-[#4a3628] p-1 bg-[#e5d0aa] shadow-2xl rounded-sm relative">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#764b36]' : 'bg-[#e5d0aa]'; // Traditional wooden board colors
                if (isSelected) squareBg = 'bg-[#f4f680]';
                if (isHighlighted) squareBg = 'bg-[#baca44] opacity-90';

                // Dynamically adjust sizes for 10x10 boards so they don't break the layout
                const is10x10 = board.length === 10;
                const cellClass = is10x10 ? 'w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14' : 'w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20';
                const pieceClass = is10x10 ? 'w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 border-2' : 'w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 border-4';
                const stackClass = is10x10 ? 'w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 border-2 absolute -top-1 -left-1' : 'w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 border-4 absolute -top-1.5 -left-1.5';
                const kingOffset = is10x10 ? 'absolute bottom-1 right-1' : 'absolute bottom-1 right-1 sm:bottom-2 sm:right-2';

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`${cellClass} flex items-center justify-center ${squareBg} cursor-pointer transition-colors duration-150 relative`}
                  >
                    {cell && (
                      <div className={`
                        ${pieceClass} rounded-full shadow-md flex items-center justify-center text-white font-bold transform transition-transform hover:scale-105
                        ${cell.color === PieceColor.LIGHT ? 'bg-[#f8f8f8] border-[#e0e0e0]' : 'bg-[#3b3836] border-[#2b2826]'}
                        ${cell.type === PieceType.KING ? kingOffset : ''}
                      `}>
                        {/* Stacked piece visual for King */}
                        {cell.type === PieceType.KING && (
                          <div className={`
                            ${stackClass} rounded-full shadow-md flex items-center justify-center
                            ${cell.color === PieceColor.LIGHT ? 'bg-[#f8f8f8] border-[#e0e0e0] text-[#3b3836]' : 'bg-[#3b3836] border-[#2b2826] text-[#f8f8f8]'}
                          `}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-1/2 h-1/2 opacity-75">
                              <path fillRule="evenodd" d="M12.5 1.5c-1.38 0-2.5 1.12-2.5 2.5 0 .84.42 1.58 1.05 2.03-1.63.46-2.99 1.4-3.8 2.65-.81-1.25-2.17-2.19-3.8-2.65A2.497 2.497 0 004.5 4C3.12 4 2 5.12 2 6.5c0 1.25.92 2.29 2.12 2.47l1.78 8.03h12.2l1.78-8.03C21.08 8.79 22 7.75 22 6.5c0-1.38-1.12-2.5-2.5-2.5-.54 0-1.04.17-1.45.47-1.63-.46-2.99-1.4-3.8-2.65.63-.45 1.05-1.19 1.05-2.03 0-1.38-1.12-2.5-2.5-2.5zM6.5 19v1.5a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5V19h-11z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="w-full flex justify-between items-center mt-2 px-2">
           <div className="flex items-center gap-4">
              <span className="font-semibold text-lg">{myColor ? 'You' : 'Light'}</span>
              {timeControl && (
                 <div className={`px-4 py-2 rounded font-mono text-xl font-bold ${currentTurn === myColor ? 'bg-slate-700 text-white shadow-lg' : 'bg-slate-200 text-slate-500'}`}>
                   {formatTime(timeLeft[myColor || PieceColor.LIGHT])}
                 </div>
              )}
           </div>
        </div>
      </div>

      {/* Chat Column */}
      <div className="w-full md:w-80 flex flex-col bg-[#262421] text-slate-200 rounded-lg shadow-xl border border-[#3b3836] h-[600px]">
        <div className="bg-[#3b3836] text-white p-4 rounded-t-lg">
          <h3 className="font-bold">Live Chat</h3>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#262421]">
          {chatMessages.length === 0 ? (
             <p className="text-center text-slate-400 text-sm mt-10">No messages yet. Say hi!</p>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-xs font-semibold text-slate-400">{msg.sender}</span>
                <span className="bg-[#3b3836] p-2 rounded shadow-sm text-sm border border-[#4a4745] inline-block w-fit max-w-[90%] break-words">
                  {msg.message}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-[#3b3836] bg-[#2b2826] rounded-b-lg">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 text-sm border border-[#4a4745] bg-[#3b3836] text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700 transition"
            >
              Send
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
