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

export interface GameSettings {
  boardSize: number;
  forceMajorityCapture: boolean;
  aiDifficulty?: number;
  timeControl?: string;
}

interface GameBoardProps {
  initialSettings?: GameSettings;
  onBack?: () => void;
}

export default function GameBoard({ initialSettings, onBack }: GameBoardProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [myColor, setMyColor] = useState<PieceColor | null>(null);
  const [currentTurn, setCurrentTurn] = useState<PieceColor | null>(null);
  const [status, setStatus] = useState<string>('Connecting...');
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<{sender: string, message: string, timestamp: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [drawOfferPending, setDrawOfferPending] = useState(false);

  const [playerTimes, setPlayerTimes] = useState<{L: number, D: number} | null>(null);

  // Settings
  const [boardSize, setBoardSize] = useState(initialSettings?.boardSize || 8);
  const [forceMajorityCapture, setForceMajorityCapture] = useState(initialSettings?.forceMajorityCapture ?? true);

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
         setStatus(`Connected. Joining tournament match...`);
         newSocket.emit('joinMatchmaking', {
           tournamentId: tournamentIdToJoin,
           rules: { boardSize, forceMajorityCapture },
           timeControl: initialSettings?.timeControl
         });
      } else if (initialSettings?.aiDifficulty) {
         setStatus(`Starting AI game...`);
         newSocket.emit('playVsAi', {
           difficulty: initialSettings.aiDifficulty,
           rules: { boardSize, forceMajorityCapture },
           timeControl: initialSettings?.timeControl
         });
      } else if (initialSettings) {
         setStatus('Joining matchmaking queue...');
         newSocket.emit('joinMatchmaking', {
           rules: { boardSize, forceMajorityCapture },
           timeControl: initialSettings?.timeControl
         });
      } else {
         setStatus('Connected to server.');
      }
      newSocket.emit('getActiveGames');
    });

    newSocket.on('activeGamesList', (games: any[]) => {
      setActiveGames(games);
    });

    newSocket.on('waitingForOpponent', () => {
      setStatus('Waiting in matchmaking queue...');
    });

    newSocket.on('timeUpdate', (times: { L: number, D: number }) => {
      setPlayerTimes(times);
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

    newSocket.on('gameState', (data: { board: BoardState, turn: PieceColor, times?: { L: number, D: number } }) => {
      setBoard(data.board);
      setCurrentTurn(data.turn);
      if (data.times) setPlayerTimes(data.times);
      setSelectedPos(null);
    });

    newSocket.on('legalMoves', (moves: Move[]) => {
      setLegalMoves(moves);
    });

    newSocket.on('gameOver', (data: { winner: PieceColor | 'DRAW', reason?: string }) => {
      if (data.winner === 'DRAW') {
        setStatus(`Game Over! Draw${data.reason ? ' - ' + data.reason : ''}`);
      } else {
        setStatus(`Game Over! Winner: ${data.winner === PieceColor.LIGHT ? 'Light' : 'Dark'}${data.reason ? ' (' + data.reason + ')' : ''}`);
      }
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

  const formatTime = (ms: number) => {
    if (ms <= 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 bg-[#262421] p-10 rounded-2xl shadow-2xl border border-[#3d3a36]">
        <div className="animate-spin text-4xl mb-4">⌛</div>
        <h2 className="text-2xl font-bold text-white tracking-wide">
          {status}
        </h2>
        {onBack && (
          <button
            onClick={onBack}
            className="px-6 py-2 bg-[#3d3a36] hover:bg-[#4d4944] text-[#c3c3c0] hover:text-white rounded-lg font-bold transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // Calculate valid destinations for highlighting
  const validDestinations = selectedPos ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col).map(m => `${m.to.row},${m.to.col}`) : [];

  return (
    <div className="flex flex-col md:flex-row justify-center py-10 gap-8 max-w-6xl mx-auto px-4">

      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4">
        {onBack && (
          <button onClick={onBack} className="self-start text-[#c3c3c0] hover:text-white flex items-center gap-2 mb-2">
            ← Back to Dashboard
          </button>
        )}
        <div className="w-full flex justify-between items-center bg-[#262421] p-3 rounded-lg border border-[#3d3a36] shadow">
          <div className="flex flex-col">
            <span className="text-[#c3c3c0] font-bold text-sm">Opponent</span>
            <div className="flex gap-2 items-center">
              {playerTimes && (
                <span className={`font-mono text-xl font-bold px-2 py-1 rounded bg-[#161512] ${currentTurn !== myColor ? 'text-white' : 'text-gray-500'}`}>
                  {formatTime(myColor === PieceColor.LIGHT ? playerTimes.D : playerTimes.L)}
                </span>
              )}
            </div>
          </div>
          <div className="flex space-x-4 text-sm text-[#c3c3c0] font-medium">
            <span>{spectatorCount} Spectator(s)</span>
          </div>
        </div>

        <p className="text-md text-[#c3c3c0]">{status}</p>

        {myColor && !status.includes('Game Over') && (
          <div className="flex gap-4 mb-2">
            <button onClick={handleOfferDraw} className="px-4 py-2 bg-[#3d3a36] text-[#c3c3c0] hover:text-white hover:bg-[#4d4944] rounded shadow text-sm font-semibold transition">
              Offer Draw
            </button>
            <button onClick={handleResign} className="px-4 py-2 bg-red-900/40 text-red-300 hover:bg-red-900/60 hover:text-red-200 rounded shadow text-sm font-semibold transition">
              Resign
            </button>
          </div>
        )}

        {drawOfferPending && (
          <div className="bg-amber-900/50 border border-amber-600 text-amber-200 px-4 py-3 rounded relative shadow-md mt-2">
            <p className="font-bold">Draw Offered</p>
            <p className="text-sm">Your opponent has offered a draw.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={handleAcceptDraw} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-1 px-3 rounded text-sm">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-[#3d3a36] hover:bg-[#4d4944] text-white font-semibold py-1 px-3 border border-[#4d4944] rounded shadow text-sm">Decline</button>
            </div>
          </div>
        )}

        <div className="border-[6px] border-[#3d3a36] p-1 bg-[#161512] shadow-2xl rounded-sm">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#764b36]' : 'bg-[#e5d0aa]'; // Traditional wooden board colors
                if (isSelected) squareBg = 'bg-yellow-400';
                if (isHighlighted) squareBg = 'bg-green-400 opacity-90';

                // Dynamically adjust sizes for 10x10 boards so they don't break the layout
                const is10x10 = board.length === 10;
                const cellClass = is10x10 ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-14 h-14 sm:w-16 sm:h-16';
                const pieceClass = is10x10 ? 'w-8 h-8 sm:w-10 sm:h-10 border-2' : 'w-10 h-10 sm:w-12 sm:h-12 border-4';
                const stackClass = is10x10 ? 'w-8 h-8 sm:w-10 sm:h-10 border-2 absolute -top-1 -left-1' : 'w-10 h-10 sm:w-12 sm:h-12 border-4 absolute -top-1.5 -left-1.5';
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
                        ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-300' : 'bg-slate-800 border-slate-900'}
                        ${cell.type === PieceType.KING ? kingOffset : ''}
                      `}>
                        {/* Stacked piece visual for King */}
                        {cell.type === PieceType.KING && (
                          <div className={`
                            ${stackClass} rounded-full shadow-md
                            ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-300' : 'bg-slate-800 border-slate-900'}
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

        <div className="w-full flex justify-between items-center bg-[#262421] p-3 rounded-lg border border-[#3d3a36] shadow mt-4">
          <div className="flex flex-col">
            <span className="text-[#c3c3c0] font-bold text-sm">You</span>
            <div className="flex gap-2 items-center">
              {playerTimes && (
                <span className={`font-mono text-xl font-bold px-2 py-1 rounded bg-[#161512] ${currentTurn === myColor ? 'text-white bg-amber-900/30' : 'text-gray-500'}`}>
                  {formatTime(myColor === PieceColor.LIGHT ? playerTimes.L : playerTimes.D)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Column */}
      <div className="w-full md:w-80 flex flex-col bg-[#262421] rounded-lg shadow-xl border border-[#3d3a36] h-[600px]">
        <div className="bg-[#161512] text-white p-4 rounded-t-lg border-b border-[#3d3a36]">
          <h3 className="font-bold">Live Chat</h3>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#262421]">
          {chatMessages.length === 0 ? (
             <p className="text-center text-[#c3c3c0] text-sm mt-10">No messages yet. Say hi!</p>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-xs font-semibold text-gray-500">{msg.sender}</span>
                <span className="bg-[#3d3a36] text-white p-2 rounded shadow-sm text-sm border border-[#4d4944] inline-block w-fit max-w-[90%] break-words">
                  {msg.message}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-[#3d3a36] bg-[#161512] rounded-b-lg">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 text-sm bg-[#262421] border border-[#3d3a36] text-white rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-500 transition"
            >
              Send
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
