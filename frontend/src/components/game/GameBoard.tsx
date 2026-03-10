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

  useEffect(() => {
    // Connect to backend WebSocket
    const token = localStorage.getItem('token');
    const newSocket = io('http://localhost:3001', {
      auth: { token }
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setStatus('Connected to server. Click Find Match to begin.');
    });

    newSocket.on('waitingForOpponent', () => {
      setStatus('Waiting in matchmaking queue...');
    });

    newSocket.on('gameStart', (data: { roomId: string, color: PieceColor, board: BoardState, turn: PieceColor, legalMoves: Move[] }) => {
      setRoomId(data.roomId);
      setMyColor(data.color);
      setBoard(data.board);
      setCurrentTurn(data.turn);
      setLegalMoves(data.legalMoves || []);
      setStatus(`Game Started! You are ${data.color === PieceColor.LIGHT ? 'Light (Bottom)' : 'Dark (Top)'}.`);
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

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleFindMatch = () => {
    if (socket) {
      socket.emit('joinMatchmaking');
    }
  };

  const handlePlayAI = (difficulty: number) => {
    if (socket) {
      socket.emit('playVsAi', { difficulty });
    }
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
            Play Multiplayer
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
      </div>
    );
  }

  // Calculate valid destinations for highlighting
  const validDestinations = selectedPos ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col).map(m => `${m.to.row},${m.to.col}`) : [];

  return (
    <div className="flex flex-col items-center py-10 space-y-4">
      <h1 className="text-2xl font-bold">Game Room: {roomId}</h1>
      <p className="text-lg">Status: {status}</p>
      <p className="text-xl font-semibold">
        {currentTurn === myColor ? "It's your turn!" : "Waiting for opponent..."}
      </p>

      <div className="border-4 border-gray-800 p-1 bg-gray-200 shadow-xl">
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((cell, c) => {
              const isDarkSquare = (r + c) % 2 !== 0;
              const isSelected = selectedPos?.row === r && selectedPos?.col === c;
              const isHighlighted = validDestinations.includes(`${r},${c}`);

              let squareBg = isDarkSquare ? 'bg-amber-900' : 'bg-amber-200';
              if (isSelected) squareBg = 'bg-yellow-400';
              if (isHighlighted) squareBg = 'bg-green-400';

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleSquareClick(r, c)}
                  className={`w-16 h-16 flex items-center justify-center ${squareBg} cursor-pointer transition-colors`}
                >
                  {cell && (
                    <div className={`
                      w-12 h-12 rounded-full shadow-md flex items-center justify-center text-white font-bold
                      ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-4 border-slate-300 text-slate-800' : 'bg-slate-800 border-4 border-slate-900 text-slate-200'}
                      ${cell.type === PieceType.KING ? 'ring-2 ring-yellow-500' : ''}
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
  );
}
