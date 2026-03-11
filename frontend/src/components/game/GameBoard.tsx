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

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleFindMatch = () => {
    if (socket) {
      socket.emit('joinMatchmaking', { tournamentId: tournamentIdToJoin });
    }
  };

  const handlePlayAI = (difficulty: number) => {
    if (socket) {
      socket.emit('playVsAi', { difficulty });
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
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <h1 className="text-3xl font-bold">Online Draughts Platform</h1>
        <p className="text-gray-600">{status}</p>

        <div className="flex flex-col space-y-4 pt-4 border-t border-gray-200 w-64">
          <button
            onClick={handleFindMatch}
            className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded shadow hover:bg-blue-700 transition"
          >
            {tournamentIdToJoin ? 'Find Tournament Match' : 'Play Multiplayer'}
          </button>

          <div className="text-center pt-2 text-sm text-gray-500 font-medium">OR</div>

          <button
            onClick={() => handlePlayAI(1)}
            className="w-full px-6 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 transition"
          >
            Play AI (Easy)
          </button>
          <button
            onClick={() => handlePlayAI(2)}
            className="w-full px-6 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 transition"
          >
            Play AI (Medium)
          </button>
          <button
            onClick={() => handlePlayAI(3)}
            className="w-full px-6 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 transition"
          >
            Play AI (Hard)
          </button>
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

  // Calculate valid destinations for highlighting
  const validDestinations = selectedPos ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col).map(m => `${m.to.row},${m.to.col}`) : [];

  return (
    <div className="flex flex-col md:flex-row justify-center py-10 gap-8 max-w-6xl mx-auto px-4">

      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Game Room</h1>
        <div className="flex space-x-4 text-sm text-gray-500 font-medium">
          <span>{spectatorCount} Spectator(s)</span>
        </div>
        <p className="text-md text-gray-600">{status}</p>
        <p className="text-xl font-semibold text-blue-700">
          {!myColor ? (currentTurn === PieceColor.LIGHT ? "Light's turn" : "Dark's turn") : (currentTurn === myColor ? "It's your turn!" : "Waiting for opponent...")}
        </p>

        <div className="border-[6px] border-slate-800 p-1 bg-slate-200 shadow-2xl rounded-sm">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#764b36]' : 'bg-[#e5d0aa]'; // Traditional wooden board colors
                if (isSelected) squareBg = 'bg-yellow-400';
                if (isHighlighted) squareBg = 'bg-green-400 opacity-90';

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center ${squareBg} cursor-pointer transition-colors duration-150`}
                  >
                    {cell && (
                      <div className={`
                        w-10 h-10 sm:w-12 sm:h-12 rounded-full shadow-md flex items-center justify-center text-white font-bold transform transition-transform hover:scale-105
                        ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-4 border-slate-300 text-slate-800' : 'bg-slate-800 border-4 border-slate-900 text-slate-200'}
                        ${cell.type === PieceType.KING ? 'ring-4 ring-yellow-400' : ''}
                      `}>
                        {cell.type === PieceType.KING && 'K'}
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
      <div className="w-full md:w-80 flex flex-col bg-white rounded-lg shadow-xl border border-gray-200 h-[600px]">
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
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition"
            >
              Send
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
