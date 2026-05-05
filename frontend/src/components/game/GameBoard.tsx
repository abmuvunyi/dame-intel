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
      <div className="flex flex-col items-center justify-center py-10 w-full max-w-md mx-auto text-white">
        <h2 className="text-3xl font-bold mb-8 text-white">Play Draughts</h2>
        <div className="w-full space-y-4 bg-[#262421] p-6 rounded-lg border border-[#312e2b] shadow-2xl">
          <div className="flex flex-col gap-4 mb-6">
            <label className="text-sm font-semibold text-[#c3c2c1] flex items-center justify-between">
               Variant:
               <select
                  value={boardSize}
                  onChange={e => setBoardSize(parseInt(e.target.value))}
                  className="ml-2 border border-[#312e2b] rounded px-2 py-1 text-sm bg-[#3c3935] text-white focus:outline-none focus:ring-2 focus:ring-[#7fa650]"
               >
                 <option value={8}>8x8 (Standard)</option>
                 <option value={10}>10x10 (International)</option>
               </select>
            </label>
            <label className="text-sm flex items-center gap-2 text-[#c3c2c1] cursor-pointer bg-[#312e2b] p-3 rounded hover:bg-[#3c3935] transition">
               <input
                  type="checkbox"
                  checked={forceMajorityCapture}
                  onChange={e => setForceMajorityCapture(e.target.checked)}
                  className="rounded w-4 h-4 accent-[#7fa650]"
               />
               <span className="font-semibold">Force Majority Capture</span>
            </label>
          </div>

          <button
            onClick={handleFindMatch}
            className="w-full px-6 py-4 bg-[#81b64c] text-white font-bold text-lg rounded shadow-[0_4px_0_0_#537a30] hover:bg-[#8cb758] hover:shadow-[0_4px_0_0_#537a30] active:shadow-none active:translate-y-1 transition-all"
          >
            {tournamentIdToJoin ? 'Find Tournament Match' : 'Play Multiplayer'}
          </button>

          <div className="text-center pt-4 pb-2 text-sm text-[#8b8987] font-bold tracking-widest uppercase">vs Computer</div>

          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map(level => (
              <button
                key={level}
                onClick={() => handlePlayAI(level)}
                className={`w-full px-2 py-3 text-white font-bold rounded shadow-[0_3px_0_0_#1a1917] active:shadow-none active:translate-y-1 transition-all text-sm ${level > 4 ? 'bg-[#c3392a] hover:bg-[#d64332] shadow-[0_3px_0_0_#842016] col-span-2' : 'bg-[#3c3935] hover:bg-[#45423d]'}`}
              >
                AI Lvl {level} {level === 7 ? '(3500+ ELO)' : ''}
              </button>
            ))}
          </div>
        </div>

        {activeGames.length > 0 && (
          <div className="mt-8 w-full">
            <h3 className="text-xl font-bold mb-4 text-center text-[#c3c2c1]">Live Games</h3>
            <ul className="space-y-2">
              {activeGames.map((game, i) => (
                <li key={i} className="flex justify-between items-center bg-[#262421] p-3 rounded border border-[#312e2b]">
                   <span className="font-medium text-white">{game.player1} vs {game.player2}</span>
                   <button
                     onClick={() => handleWatchGame(game.roomId)}
                     className="px-4 py-1 bg-[#81b64c] text-white font-bold rounded text-sm hover:bg-[#8cb758] transition"
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
    <div className="flex flex-col md:flex-row justify-center py-6 gap-8 max-w-6xl mx-auto px-4 text-white">

      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4">
        <div className="flex justify-between w-full text-sm text-[#8b8987] font-bold">
          <span className="flex items-center gap-2">
             <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
             {spectatorCount} Spectator(s)
          </span>
          <span>{status}</span>
        </div>

        <p className={`text-xl font-black ${myColor && currentTurn === myColor ? 'text-[#81b64c]' : 'text-white'}`}>
          {!myColor ? (currentTurn === PieceColor.LIGHT ? "Light's turn" : "Dark's turn") : (currentTurn === myColor ? "It's your turn!" : "Waiting for opponent...")}
        </p>

        {myColor && !status.includes('Game Over') && (
          <div className="flex gap-4 w-full">
            <button onClick={handleOfferDraw} className="flex-1 py-3 bg-[#3c3935] text-white font-bold rounded shadow-[0_3px_0_0_#1a1917] active:shadow-none active:translate-y-1 transition-all text-sm hover:bg-[#45423d]">
              Offer Draw
            </button>
            <button onClick={handleResign} className="flex-1 py-3 bg-[#c3392a] text-white font-bold rounded shadow-[0_3px_0_0_#842016] active:shadow-none active:translate-y-1 transition-all text-sm hover:bg-[#d64332]">
              Resign
            </button>
          </div>
        )}

        {drawOfferPending && (
          <div className="bg-[#45423d] border border-[#7fa650] px-4 py-3 rounded-lg w-full text-center">
            <p className="font-bold text-[#c3c2c1] mb-2">Opponent offered a draw.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={handleAcceptDraw} className="bg-[#81b64c] hover:bg-[#8cb758] text-white font-bold py-1 px-4 rounded text-sm transition">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-[#3c3935] hover:bg-[#45423d] text-[#c3c2c1] font-bold py-1 px-4 rounded text-sm transition">Decline</button>
            </div>
          </div>
        )}

        <div className="border-[12px] border-[#312e2b] shadow-2xl rounded">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]'; // Chess.com standard theme colors
                if (isSelected) squareBg = 'bg-[#f6f669]'; // Yellow highlight for selected piece

                // For valid move destinations, we use a semi-transparent dark circle on empty squares
                // or corners if it contains an opponent piece (but in checkers, you land on empty squares, so just dot is fine)
                let showDot = isHighlighted && cell === null;

                // Dynamically adjust sizes for 10x10 boards so they don't break the layout
                const is10x10 = board.length === 10;
                const cellClass = is10x10 ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-14 h-14 sm:w-16 sm:h-16';
                const pieceClass = is10x10 ? 'w-8 h-8 sm:w-10 sm:h-10' : 'w-10 h-10 sm:w-12 sm:h-12';

                // We use drop-shadow for 3D piece effect
                const isLightPiece = cell?.color === PieceColor.LIGHT;

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`${cellClass} flex items-center justify-center ${squareBg} cursor-pointer relative`}
                  >
                    {/* Legal move highlight dot */}
                    {showDot && (
                        <div className="absolute w-1/3 h-1/3 bg-black opacity-20 rounded-full pointer-events-none" />
                    )}

                    {cell && (
                      <div className={`
                        ${pieceClass} rounded-full flex items-center justify-center relative
                        ${isLightPiece ? 'bg-[#f8f8f8] shadow-[0_4px_0_0_#d4d4d4]' : 'bg-[#353331] shadow-[0_4px_0_0_#1a1917]'}
                      `}>
                         <div className={`absolute inset-1 rounded-full ${isLightPiece ? 'border-2 border-[#e6e6e6]' : 'border-2 border-[#45423d]'}`} />
                        {/* Crown SVG for King */}
                        {cell.type === PieceType.KING && (
                          <svg viewBox="0 0 24 24" fill={isLightPiece ? '#353331' : '#f8f8f8'} className="w-1/2 h-1/2 opacity-80 z-10" style={{transform: 'translateY(-2px)'}}>
                              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
                          </svg>
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
      <div className="w-full md:w-80 flex flex-col bg-[#262421] rounded-lg shadow-xl border border-[#312e2b] h-[600px]">
        <div className="bg-[#312e2b] text-[#c3c2c1] p-4 rounded-t-lg font-bold border-b border-[#3c3935] flex items-center gap-2">
          <span>💬</span> Live Chat
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#262421] scrollbar-thin scrollbar-thumb-[#3c3935]">
          {chatMessages.length === 0 ? (
             <p className="text-center text-[#8b8987] text-sm mt-10">Say hi to your opponent!</p>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-xs font-bold text-[#8b8987] mb-1">{msg.sender}</span>
                <span className="bg-[#3c3935] text-white p-2 px-3 rounded-lg text-sm inline-block w-fit max-w-[90%] break-words">
                  {msg.message}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-[#312e2b] bg-[#262421] rounded-b-lg">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 text-sm bg-[#3c3935] border border-[#45423d] text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7fa650] placeholder-[#8b8987]"
            />
            <button
              type="submit"
              className="bg-[#81b64c] text-white px-4 py-2 rounded text-sm font-bold hover:bg-[#8cb758] transition"
            >
              Send
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
