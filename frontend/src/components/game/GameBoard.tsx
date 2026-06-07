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

  // Default visual empty board for the Play menu
  const renderEmptyBoard = () => {
    const size = boardSize;
    const emptyBoard = Array(size).fill(null).map(() => Array(size).fill(null));
    return (
      <div className="border-[2px] border-black shadow-2xl rounded-sm max-w-[600px] w-full">
        {emptyBoard.map((row, r) => (
          <div key={r} className="flex">
            {row.map((_, c) => {
              const isDarkSquare = (r + c) % 2 !== 0;
              const squareBg = isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]';
              const cellClass = size === 10 ? 'w-full pb-[10%]' : 'w-full pb-[12.5%]';

              return (
                <div key={`${r}-${c}`} className={`${cellClass} flex-1 ${squareBg} relative`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {/* Empty placeholder */}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  if (!board) {
    return (
      <div className="flex flex-col lg:flex-row justify-center py-6 lg:py-10 gap-6 lg:gap-12 w-full">

        {/* Left Side: Display Board */}
        <div className="flex flex-col items-center w-full lg:w-2/3">
          {renderEmptyBoard()}
        </div>

        {/* Right Side: Play Menu Control Panel */}
        <div className="w-full lg:w-1/3 max-w-[400px] flex flex-col space-y-6 pt-4 mx-auto lg:mx-0">
          <div className="bg-[#262522] text-[#c3c3c2] p-6 rounded-lg shadow-xl flex flex-col space-y-5">
            <h2 className="text-2xl font-bold text-white text-center">Play Draughts</h2>
            <p className="text-center text-sm text-[#969592]">{status}</p>

            <div className="flex flex-col space-y-4">
              <div className="bg-[#302e2b] p-4 rounded border border-[#3c3a37]">
                <h4 className="text-sm font-bold text-white mb-3">Game Rules</h4>
                <label className="text-sm flex justify-between items-center mb-3">
                   Board Size:
                   <select
                      value={boardSize}
                      onChange={e => setBoardSize(parseInt(e.target.value))}
                      className="ml-2 border border-[#3c3a37] rounded p-1.5 text-sm bg-[#262522] text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                   >
                     <option value={8}>8x8 (Standard)</option>
                     <option value={10}>10x10 (International)</option>
                   </select>
                </label>
                <label className="text-sm flex items-center gap-2 cursor-pointer hover:text-white transition">
                   <input
                      type="checkbox"
                      checked={forceMajorityCapture}
                      onChange={e => setForceMajorityCapture(e.target.checked)}
                      className="rounded bg-[#262522] border-[#3c3a37] text-green-500 focus:ring-green-500"
                   />
                   Force Majority Capture
                </label>
              </div>

              <button
                onClick={handleFindMatch}
                className="w-full px-6 py-4 bg-[#81b64c] hover:bg-[#a3d160] text-white font-extrabold text-xl rounded-lg shadow-[0_4px_0_0_#537c30] hover:shadow-[0_4px_0_0_#6b9d3b] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none transition-all"
              >
                {tournamentIdToJoin ? 'Join Tournament' : 'Play Online'}
              </button>

              <div className="text-center text-sm text-[#969592] font-semibold my-2">VS COMPUTER</div>

              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map(level => (
                  <button
                    key={level}
                    onClick={() => handlePlayAI(level)}
                    className={`w-full px-2 py-3 text-white font-bold rounded-lg shadow-[0_3px_0_0_rgba(0,0,0,0.2)] transition-all active:translate-y-1 active:shadow-none text-sm ${level > 4 ? 'bg-[#c3332c] hover:bg-[#e43a32] shadow-[0_3px_0_0_#8f2621] col-span-2' : 'bg-[#43413d] hover:bg-[#52504b]'}`}
                  >
                    Level {level} {level === 7 ? '(3500+ ELO)' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeGames.length > 0 && (
            <div className="bg-[#262522] text-[#c3c3c2] p-4 rounded-lg shadow-xl">
              <h3 className="text-lg font-bold mb-3 text-white">Live Games</h3>
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {activeGames.map((game, i) => (
                  <li key={i} className="flex justify-between items-center bg-[#302e2b] p-3 rounded border border-[#3c3a37]">
                     <span className="font-medium text-sm truncate mr-2">{game.player1} vs {game.player2}</span>
                     <button
                       onClick={() => handleWatchGame(game.roomId)}
                       className="px-3 py-1.5 bg-[#43413d] hover:bg-[#52504b] text-white rounded font-semibold text-xs transition"
                     >
                       Watch ({game.spectatorsCount} 👀)
                     </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    );
  }

  // Calculate valid destinations for highlighting
  const validDestinations = selectedPos ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col).map(m => `${m.to.row},${m.to.col}`) : [];

  return (
    <div className="flex flex-col lg:flex-row justify-center py-6 lg:py-10 gap-6 lg:gap-12 w-full max-w-7xl mx-auto px-2">

      {/* Board Column */}
      <div className="flex flex-col items-center w-full lg:w-2/3">
        <div className="w-full max-w-[600px] flex justify-between items-end mb-2 text-[#c3c3c2]">
          <h1 className="text-xl font-bold text-white">Game Room</h1>
          <span className="text-sm font-semibold">{spectatorCount} Spectator(s)</span>
        </div>

        <p className="text-md text-[#969592] mb-2">{status}</p>

        <div className="border-[2px] border-black shadow-2xl rounded-sm w-full max-w-[600px]">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]'; // Chess.com style colors
                if (isSelected) squareBg = 'bg-[#f5f682]';
                if (isHighlighted) squareBg = 'bg-[#f5f682] opacity-90';

                // Dynamically adjust sizes for 10x10 boards so they don't break the layout
                const is10x10 = board.length === 10;
                const cellClass = is10x10 ? 'w-full pb-[10%]' : 'w-full pb-[12.5%]';
                const pieceClass = 'absolute inset-1 sm:inset-1.5 md:inset-2 border-[3px] sm:border-[4px] rounded-full shadow-md flex items-center justify-center text-white font-bold transform transition-transform hover:scale-105';
                const stackClass = 'absolute -top-1 -left-1 sm:-top-1.5 sm:-left-1.5 w-full h-full border-[3px] sm:border-[4px] rounded-full shadow-md';
                const kingOffset = 'absolute bottom-1 right-1 sm:bottom-2 sm:right-2';

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`${cellClass} flex-1 ${squareBg} cursor-pointer transition-colors duration-150 relative`}
                  >
                    {cell && (
                      <div className={`
                        ${pieceClass}
                        ${cell.color === PieceColor.LIGHT ? 'bg-[#f8f8f8] border-[#e0e0e0]' : 'bg-[#403d39] border-[#2c2a27]'}
                        ${cell.type === PieceType.KING ? kingOffset : ''}
                      `}>
                        {/* Stacked piece visual for King */}
                        {cell.type === PieceType.KING && (
                          <div className={`
                            ${stackClass}
                            ${cell.color === PieceColor.LIGHT ? 'bg-[#f8f8f8] border-[#e0e0e0]' : 'bg-[#403d39] border-[#2c2a27]'}
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
      </div>

      {/* Control / Chat Column */}
      <div className="w-full lg:w-1/3 max-w-[400px] flex flex-col mx-auto lg:mx-0 space-y-4">

        {/* Game Status Panel */}
        <div className="bg-[#262522] text-[#c3c3c2] p-4 rounded-lg shadow-xl">
          <p className="text-xl font-bold text-white text-center mb-4">
            {!myColor ? (currentTurn === PieceColor.LIGHT ? "Light's turn" : "Dark's turn") : (currentTurn === myColor ? "It's your turn!" : "Waiting for opponent...")}
          </p>

          {myColor && !status.includes('Game Over') && (
            <div className="flex gap-4 justify-center">
              <button onClick={handleOfferDraw} className="px-4 py-2 bg-[#302e2b] hover:bg-[#3c3a37] text-white border border-[#3c3a37] rounded font-bold transition">
                Offer Draw
              </button>
              <button onClick={handleResign} className="px-4 py-2 bg-[#302e2b] hover:bg-[#3c3a37] text-white border border-[#3c3a37] rounded font-bold transition">
                Resign
              </button>
            </div>
          )}

          {drawOfferPending && (
            <div className="bg-[#43413d] border border-[#3c3a37] text-white px-4 py-3 rounded mt-4">
              <p className="font-bold">Draw Offered</p>
              <p className="text-sm mb-2">Your opponent has offered a draw.</p>
              <div className="flex gap-2">
                <button onClick={handleAcceptDraw} className="bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold py-1 px-3 rounded text-sm">Accept</button>
                <button onClick={handleDeclineDraw} className="bg-[#302e2b] hover:bg-[#3c3a37] border border-[#3c3a37] text-white font-semibold py-1 px-3 rounded text-sm">Decline</button>
              </div>
            </div>
          )}
        </div>

        {/* Live Chat Panel */}
        <div className="flex-1 flex flex-col bg-[#262522] rounded-lg shadow-xl border border-[#3c3a37] min-h-[300px]">
          <div className="bg-[#302e2b] text-white p-3 rounded-t-lg border-b border-[#3c3a37]">
            <h3 className="font-bold">Live Chat</h3>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
            {chatMessages.length === 0 ? (
               <p className="text-center text-[#969592] text-sm mt-10">No messages yet. Say hi!</p>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-xs font-semibold text-[#969592]">{msg.sender}</span>
                  <span className="bg-[#302e2b] text-[#c3c3c2] p-2 rounded text-sm inline-block w-fit max-w-[90%] break-words">
                    {msg.message}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-[#3c3a37] bg-[#262522] rounded-b-lg">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 text-sm bg-[#302e2b] text-white border border-[#3c3a37] rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#81b64c]"
              />
              <button
                type="submit"
                className="bg-[#81b64c] hover:bg-[#a3d160] text-white px-4 py-2 rounded text-sm font-bold transition"
              >
                Send
              </button>
            </form>
          </div>
        </div>

      </div>

    </div>
  );
}
