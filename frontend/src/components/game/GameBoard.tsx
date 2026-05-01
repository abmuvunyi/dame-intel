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
      <div className="flex flex-col items-center justify-center space-y-6 w-full max-w-3xl">
        <h1 className="text-4xl font-bold text-white mb-2 tracking-wide">Play Draughts</h1>
        <p className="text-[#989795] font-medium">{status}</p>

        <div className="flex flex-col md:flex-row gap-6 w-full">
          <div className="flex-1 bg-[#262421] rounded-lg shadow-xl overflow-hidden flex flex-col">
            <div className="bg-[#302e2b] p-4 border-b border-[#3d3934]">
              <h2 className="text-xl font-bold text-white text-center">Multiplayer</h2>
            </div>
            <div className="p-6 flex flex-col space-y-6 flex-grow justify-between">
              <div className="flex flex-col space-y-4">
                <div className="bg-[#3d3934] p-4 rounded flex flex-col space-y-4">
                  <label className="text-md flex justify-between items-center text-white">
                    Variant
                    <select
                        value={boardSize}
                        onChange={e => setBoardSize(parseInt(e.target.value))}
                        className="ml-2 border border-transparent rounded bg-[#2b2927] text-white p-2 outline-none focus:border-[#81b64c]"
                    >
                      <option value={8}>8x8 Standard</option>
                      <option value={10}>10x10 International</option>
                    </select>
                  </label>

                  <label className="text-md flex items-center gap-3 text-white cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={forceMajorityCapture}
                        onChange={e => setForceMajorityCapture(e.target.checked)}
                        className="w-5 h-5 accent-[#81b64c] rounded cursor-pointer"
                    />
                    Force Majority Capture
                  </label>
                </div>
              </div>

              <button
                onClick={handleFindMatch}
                className="w-full px-6 py-4 bg-[#81b64c] text-white text-xl font-bold rounded-lg shadow-[0_5px_0_0_#5a862c] hover:bg-[#a3d160] hover:shadow-[0_5px_0_0_#75a33c] active:translate-y-1 active:shadow-[0_0px_0_0_#5a862c] transition-all"
              >
                {tournamentIdToJoin ? 'Join Tournament Match' : 'Play Online'}
              </button>
            </div>
          </div>

          <div className="flex-1 bg-[#262421] rounded-lg shadow-xl overflow-hidden flex flex-col">
            <div className="bg-[#302e2b] p-4 border-b border-[#3d3934]">
              <h2 className="text-xl font-bold text-white text-center">Play Computer</h2>
            </div>
            <div className="p-6 flex flex-col space-y-4 flex-grow">
              <div className="grid grid-cols-2 gap-3 h-full">
                {[1, 2, 3, 4, 5, 6].map(level => (
                  <button
                    key={level}
                    onClick={() => handlePlayAI(level)}
                    className="w-full bg-[#3d3934] text-white font-bold rounded shadow hover:bg-[#4d4842] transition border-b-4 border-[#2b2927] active:border-b-0 active:translate-y-1"
                  >
                    Level {level}
                  </button>
                ))}
                <button
                  onClick={() => handlePlayAI(7)}
                  className="w-full col-span-2 bg-[#b33430] text-white font-bold rounded shadow hover:bg-[#c23e39] transition border-b-4 border-[#852724] active:border-b-0 active:translate-y-1 py-3"
                >
                  Master (Level 7)
                </button>
              </div>
            </div>
          </div>
        </div>

        {activeGames.length > 0 && (
          <div className="mt-8 w-full bg-[#262421] rounded-lg shadow-xl overflow-hidden">
            <div className="bg-[#302e2b] p-4 border-b border-[#3d3934]">
              <h3 className="text-xl font-bold text-white text-center">Live Games</h3>
            </div>
            <ul className="p-4 space-y-2">
              {activeGames.map((game, i) => (
                <li key={i} className="flex justify-between items-center bg-[#3d3934] p-3 rounded text-white border border-transparent hover:border-[#81b64c] transition">
                   <span className="font-medium">{game.player1} vs {game.player2}</span>
                   <button
                     onClick={() => handleWatchGame(game.roomId)}
                     className="px-4 py-2 bg-[#81b64c] text-white rounded font-bold hover:bg-[#a3d160] transition"
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
    <div className="flex flex-col lg:flex-row justify-center py-4 gap-8 max-w-6xl mx-auto px-4 w-full h-full items-start overflow-auto">

      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4 max-w-[800px] flex-shrink-0">
        <div className="flex justify-between w-full text-sm text-[#989795] font-medium px-2">
          <span>{spectatorCount} Spectator(s)</span>
          <span>{status}</span>
        </div>

        <div className="flex justify-between items-center w-full bg-[#262421] p-3 rounded-t-lg">
           <p className="text-lg font-bold text-white">
             {!myColor ? (currentTurn === PieceColor.LIGHT ? "Light's turn" : "Dark's turn") : (currentTurn === myColor ? "Your turn!" : "Opponent's turn")}
           </p>
           {myColor && !status.includes('Game Over') && (
             <div className="flex gap-2">
               <button onClick={handleOfferDraw} className="px-3 py-1.5 bg-[#3d3934] text-white rounded hover:bg-[#4d4842] text-sm font-bold transition">
                 ½ Draw
               </button>
               <button onClick={handleResign} className="px-3 py-1.5 bg-[#3d3934] text-white rounded hover:bg-[#b33430] text-sm font-bold transition">
                 ⚑ Resign
               </button>
             </div>
           )}
        </div>

        {drawOfferPending && (
          <div className="w-full bg-[#3d3934] border border-yellow-600 text-white px-4 py-3 rounded shadow-md mt-2">
            <p className="font-bold text-yellow-400">Draw Offered</p>
            <p className="text-sm">Your opponent has offered a draw.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={handleAcceptDraw} className="bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold py-1.5 px-4 rounded text-sm transition">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-[#b33430] hover:bg-[#c23e39] text-white font-bold py-1.5 px-4 rounded text-sm transition">Decline</button>
            </div>
          </div>
        )}

        <div className="border border-[#3d3934] shadow-[0_0_15px_rgba(0,0,0,0.5)] flex flex-col select-none rounded-b-sm overflow-hidden">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]'; // Chess.com style colors
                if (isSelected) squareBg = 'bg-[#baca44]'; // highlight active
                if (isHighlighted) squareBg = 'bg-[#f4f680] opacity-90';

                // Dynamically adjust sizes for 10x10 boards so they don't break the layout
                const is10x10 = board.length === 10;
                const cellClass = is10x10 ? 'w-[48px] h-[48px] sm:w-[60px] sm:h-[60px]' : 'w-[60px] h-[60px] sm:w-[75px] sm:h-[75px]';
                const pieceClass = is10x10 ? 'w-[38px] h-[38px] sm:w-[48px] sm:h-[48px]' : 'w-[48px] h-[48px] sm:w-[60px] sm:h-[60px]';

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`${cellClass} flex items-center justify-center ${squareBg} cursor-pointer transition-colors duration-150 relative`}
                  >
                    {cell && (
                      <div className={`
                        ${pieceClass} rounded-full shadow-[0_4px_6px_-1px_rgba(0,0,0,0.5),inset_0_-3px_0_rgba(0,0,0,0.2)] flex items-center justify-center text-white font-bold transform transition-transform hover:scale-105 relative
                        ${cell.color === PieceColor.LIGHT ? 'bg-[#f8f8f8] border-[3px] border-[#e0e0e0]' : 'bg-[#333333] border-[3px] border-[#1a1a1a]'}
                      `}>
                        {cell.type === PieceType.KING && (
                          <div className={`
                             absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                             ${is10x10 ? 'w-[20px] h-[20px]' : 'w-[26px] h-[26px]'}
                          `}>
                            <svg viewBox="0 0 24 24" fill={cell.color === PieceColor.LIGHT ? '#a0a0a0' : '#8a8a8a'} className="w-full h-full drop-shadow-sm">
                              <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" />
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
      </div>

      {/* Chat Column */}
      <div className="w-full lg:w-[350px] flex flex-col bg-[#262421] rounded-lg shadow-xl overflow-hidden h-[400px] lg:h-[600px] flex-shrink-0">
        <div className="bg-[#302e2b] text-white p-4 border-b border-[#3d3934]">
          <h3 className="font-bold text-center">Live Chat</h3>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#262421]">
          {chatMessages.length === 0 ? (
             <p className="text-center text-[#989795] text-sm mt-10">No messages yet. Say hi!</p>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-xs font-semibold text-[#81b64c]">{msg.sender}</span>
                <span className="bg-[#3d3934] text-white p-2 rounded shadow-sm text-sm inline-block w-fit max-w-[90%] break-words mt-1">
                  {msg.message}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-[#3d3934] bg-[#262421]">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 text-sm border border-transparent rounded bg-[#302e2b] text-white px-3 py-2 focus:outline-none focus:border-[#81b64c]"
            />
            <button
              type="submit"
              className="bg-[#81b64c] text-white px-4 py-2 rounded text-sm font-bold hover:bg-[#a3d160] transition shadow"
            >
              Send
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
