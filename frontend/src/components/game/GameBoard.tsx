'use client';

import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import Timer from './Timer';

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

export default function GameBoard({ onBack, initialSettings }: { onBack?: () => void, initialSettings?: any }) {
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
  const [rematchOfferPending, setRematchOfferPending] = useState(false);

  // Timers and Profiles
  const [remainingTime, setRemainingTime] = useState<{[key: string]: number}>({});
  const [playerProfiles, setPlayerProfiles] = useState<{[key: string]: any}>({});
  const [timeControl, setTimeControl] = useState<{initial: number, increment: number}>(initialSettings?.timeControl || { initial: 600, increment: 5 });
  const [customTime, setCustomTime] = useState('10');
  const [gameOverData, setGameOverData] = useState<any>(null);

  // Theme Settings
  const [boardSize, setBoardSize] = useState(initialSettings?.boardSize || 8);
  const [forceMajorityCapture, setForceMajorityCapture] = useState(true);
  const [boardTheme, setBoardTheme] = useState(initialSettings?.boardTheme || 'classic'); // 'classic', 'wood', 'ocean'
  const [pieceTheme, setPieceTheme] = useState('modern'); // 'modern', 'neon'

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

    newSocket.on('gameStart', (data: { roomId: string, color: PieceColor | null, board: BoardState, turn: PieceColor, legalMoves: Move[], remainingTime: any, playerProfiles?: any }) => {
      setRoomId(data.roomId);
      setMyColor(data.color);
      setBoard(data.board);
      setCurrentTurn(data.turn);
      setLegalMoves(data.legalMoves || []);
      setRemainingTime(data.remainingTime || {});
      setPlayerProfiles(data.playerProfiles || {});
      setGameOverData(null);
      if (data.color) {
         setStatus(`Game Started! You are ${data.color === PieceColor.LIGHT ? 'Light (Bottom)' : 'Dark (Top)'}.`);
      } else {
         setStatus('Spectating match...');
      }
    });

    newSocket.on('gameState', (data: { board: BoardState, turn: PieceColor, remainingTime: any }) => {
      setBoard(data.board);
      setCurrentTurn(data.turn);
      setRemainingTime(data.remainingTime || {});
      setSelectedPos(null);
    });

    newSocket.on('legalMoves', (moves: Move[]) => {
      setLegalMoves(moves);
    });

    newSocket.on('gameOver', (data: { winner: PieceColor, byTimeout?: boolean }) => {
      setGameOverData(data);
      setStatus(`Game Over! Winner: ${data.winner === PieceColor.LIGHT ? 'Light' : 'Dark'}${data.byTimeout ? ' (by timeout)' : ''}`);
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

    newSocket.on('rematchOffered', () => {
      setRematchOfferPending(true);
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

  const handleOfferRematch = () => {
    socket?.emit('offerRematch', { roomId });
    alert("Rematch offer sent.");
  };

  const handleAcceptRematch = () => {
    // For simplicity, just reload or trigger a new search with same rules
    window.location.reload();
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
      <div className="flex flex-col items-center justify-center min-h-screen space-y-6 bg-slate-50 p-6">
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Draughts Online</h1>
        <p className="text-slate-500 text-lg">{status}</p>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Rules and Customization */}
          <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 w-80 space-y-4">
            <h4 className="text-lg font-bold text-slate-700 border-b pb-2">Settings</h4>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-600 block">Game Rules</label>
              <select
                value={boardSize}
                onChange={e => setBoardSize(parseInt(e.target.value))}
                className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={8}>8x8 Standard</option>
                <option value={10}>10x10 International</option>
              </select>

              <label className="text-sm flex items-center gap-2 text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceMajorityCapture}
                  onChange={e => setForceMajorityCapture(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                Force Majority Capture
              </label>

              <label className="text-sm font-semibold text-slate-600 block pt-2">Time Control</label>
              <div className="space-y-2">
                <select
                  value={timeControl.initial > 1800 ? 'custom' : timeControl.initial}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      setTimeControl({ ...timeControl, initial: parseInt(customTime) * 60 });
                    } else {
                      setTimeControl({ ...timeControl, initial: parseInt(val) });
                    }
                  }}
                  className="w-full border rounded-lg p-2 text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value={60}>1 min (Bullet)</option>
                  <option value={180}>3 min (Blitz)</option>
                  <option value={600}>10 min (Rapid)</option>
                  <option value={1800}>30 min (Classical)</option>
                  <option value="custom">Custom...</option>
                </select>

                {(timeControl.initial > 1800 || ![60, 180, 600, 1800].includes(timeControl.initial)) && (
                  <div className="flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                    <input
                      type="number"
                      value={customTime}
                      onChange={e => {
                        setCustomTime(e.target.value);
                        setTimeControl({ ...timeControl, initial: (parseInt(e.target.value) || 0) * 60 });
                      }}
                      className="w-20 border rounded p-1 text-sm"
                      min="1"
                    />
                    <span className="text-xs text-slate-500 font-bold">minutes</span>
                  </div>
                )}
              </div>

              <label className="text-sm font-semibold text-slate-600 block pt-2">Visuals</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setBoardTheme('classic')} className={`px-2 py-1 text-xs rounded border ${boardTheme === 'classic' ? 'bg-blue-100 border-blue-500' : 'bg-white'}`}>Classic</button>
                <button onClick={() => setBoardTheme('wood')} className={`px-2 py-1 text-xs rounded border ${boardTheme === 'wood' ? 'bg-amber-100 border-amber-500' : 'bg-white'}`}>Wood</button>
                <button onClick={() => setBoardTheme('ocean')} className={`px-2 py-1 text-xs rounded border ${boardTheme === 'ocean' ? 'bg-cyan-100 border-cyan-500' : 'bg-white'}`}>Ocean</button>
                <button onClick={() => setPieceTheme('modern')} className={`px-2 py-1 text-xs rounded border ${pieceTheme === 'modern' ? 'bg-slate-100 border-slate-500' : 'bg-white'}`}>Modern</button>
              </div>
            </div>
          </div>

          {/* Matchmaking */}
          <div className="flex flex-col space-y-4 w-80">
            <button
              onClick={handleFindMatch}
              className="w-full px-6 py-4 bg-green-600 text-white text-xl font-bold rounded-xl shadow-lg hover:bg-green-700 transform hover:-translate-y-1 transition-all"
            >
              {tournamentIdToJoin ? 'Join Tournament' : 'Play Multiplayer'}
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-slate-300"></div>
              <span className="flex-shrink mx-4 text-slate-400 text-sm font-bold uppercase">vs Computer</span>
              <div className="flex-grow border-t border-slate-300"></div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(level => (
                <button
                  key={level}
                  onClick={() => handlePlayAI(level)}
                  className={`px-2 py-3 text-white rounded-lg font-bold transition-all ${level <= 3 ? 'bg-blue-400 hover:bg-blue-500' : level <= 6 ? 'bg-orange-400 hover:bg-orange-500' : 'bg-red-600 hover:bg-red-700'}`}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-slate-400">Select difficulty level (1-8)</p>
          </div>
        </div>

        {activeGames.length > 0 && (
          <div className="mt-8 w-full max-w-2xl bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <h3 className="text-lg font-bold p-4 bg-slate-100 text-slate-700 border-b">Live Matches</h3>
            <ul className="divide-y divide-slate-100">
              {activeGames.map((game, i) => (
                <li key={i} className="flex justify-between items-center p-4 hover:bg-slate-50 transition">
                   <div className="flex items-center gap-3">
                     <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                     <span className="font-semibold text-slate-700">{game.player1} <span className="text-slate-400 font-normal">vs</span> {game.player2}</span>
                   </div>
                   <button
                     onClick={() => handleWatchGame(game.roomId)}
                     className="px-4 py-1 bg-white border border-slate-300 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 shadow-sm"
                   >
                     Spectate ({game.spectatorsCount} 👀)
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

  const opponentColor = myColor === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
  const opponentProfile = playerProfiles[opponentColor] || { username: 'Opponent', rating: 1200 };
  const myProfile = playerProfiles[myColor || PieceColor.LIGHT] || { username: 'You', rating: 1200 };

  const getSquareColor = (r: number, c: number, isSelected: boolean, isHighlighted: boolean) => {
    const isDark = (r + c) % 2 !== 0;
    if (isSelected) return 'bg-yellow-400';
    if (isHighlighted) return 'bg-green-400 opacity-80';

    if (boardTheme === 'wood') return isDark ? 'bg-[#764b36]' : 'bg-[#e5d0aa]';
    if (boardTheme === 'ocean') return isDark ? 'bg-cyan-700' : 'bg-cyan-100';
    return isDark ? 'bg-slate-600' : 'bg-slate-300';
  };

  const getPieceColor = (color: PieceColor) => {
    if (pieceTheme === 'neon') return color === PieceColor.LIGHT ? 'bg-pink-500 border-pink-300 shadow-[0_0_10px_pink]' : 'bg-blue-600 border-blue-400 shadow-[0_0_10px_blue]';
    return color === PieceColor.LIGHT ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-900 text-white';
  };

  return (
    <div className="flex flex-col lg:flex-row justify-center items-start min-h-screen bg-slate-100 py-8 px-4 gap-8">

      {/* Main Game Area */}
      <div className="flex flex-col gap-4">
        {/* Opponent Info */}
        <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-slate-200 w-full lg:w-[600px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center font-bold text-slate-500 uppercase">
              {opponentProfile.username[0]}
            </div>
            <div>
              <div className="font-bold text-slate-800">{opponentProfile.username}</div>
              <div className="text-xs text-slate-500 font-mono">Rating: {opponentProfile.rating}</div>
            </div>
          </div>
          <Timer initialTime={remainingTime[opponentColor] || timeControl.initial} isActive={currentTurn === opponentColor && !gameOverData} />
        </div>

        {/* The Board */}
        <div className="relative group">
          <div className="border-[8px] border-slate-800 rounded-sm shadow-2xl overflow-hidden">
            {board.map((row, r) => (
              <div key={r} className="flex">
                {row.map((cell, c) => {
                  const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                  const isHighlighted = validDestinations.includes(`${r},${c}`);
                  const squareBg = getSquareColor(r, c, isSelected, isHighlighted);

                  const is10x10 = board.length === 10;
                  const cellClass = is10x10 ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-14 h-14 sm:w-[70px] sm:h-[70px]';
                  const pieceClass = is10x10 ? 'w-8 h-8 border-2' : 'w-12 h-12 border-4';

                  return (
                    <div
                      key={`${r}-${c}`}
                      onClick={() => handleSquareClick(r, c)}
                      className={`${cellClass} flex items-center justify-center ${squareBg} cursor-pointer transition-all duration-75 relative`}
                    >
                      {cell && (
                        <div className={`
                          ${pieceClass} rounded-full shadow-lg flex items-center justify-center font-black text-2xl transform transition-transform hover:scale-110 active:scale-95 z-10
                          ${getPieceColor(cell.color)}
                        `}>
                          {cell.type === PieceType.KING && (
                            <div className="relative flex items-center justify-center w-full h-full">
                              {/* Better King Visual: More Detailed Crown + Shadow Effect */}
                              <svg className={`w-10 h-10 absolute z-20 drop-shadow-md ${cell.color === PieceColor.LIGHT ? 'text-amber-500' : 'text-amber-200'}`} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z" />
                              </svg>
                              <div className={`w-full h-full rounded-full border-4 absolute -top-1.5 z-10 ${cell.color === PieceColor.LIGHT ? 'bg-slate-50 border-slate-200' : 'bg-slate-700 border-slate-900'}`}></div>
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

          {/* Game Over Overlay */}
          {gameOverData && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-sm animate-in fade-in zoom-in duration-300">
              <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm border-t-8 border-blue-500">
                <h2 className="text-3xl font-black text-slate-800 mb-2">Game Over</h2>
                <p className="text-xl font-bold text-blue-600 mb-6">
                  {gameOverData.winner === PieceColor.LIGHT ? 'Light' : 'Dark'} Wins!
                  {gameOverData.byTimeout && <span className="block text-sm text-slate-400 font-normal">on time</span>}
                </p>
                <div className="flex flex-col gap-3">
                  {rematchOfferPending ? (
                    <button onClick={handleAcceptRematch} className="w-full py-4 bg-[#81b64c] text-white text-xl font-black rounded-xl hover:bg-[#a3d16e] transition shadow-[0_4px_0_rgb(69,98,41)] active:translate-y-1 active:shadow-none">Accept Rematch</button>
                  ) : (
                    <button onClick={handleOfferRematch} className="w-full py-4 bg-[#81b64c] text-white text-xl font-black rounded-xl hover:bg-[#a3d16e] transition shadow-[0_4px_0_rgb(69,98,41)] active:translate-y-1 active:shadow-none">Offer Rematch</button>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => window.location.reload()} className="py-3 bg-[#45423e] text-white font-bold rounded-xl hover:bg-[#524f4a] transition">New Game</button>
                    <button
                      onClick={() => {
                        if (onBack) onBack();
                        else setBoard(null);
                      }}
                      className="py-3 bg-[#45423e] text-white font-bold rounded-xl hover:bg-[#524f4a] transition"
                    >
                      Dashboard
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* My Info */}
        <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-slate-200 w-full lg:w-[600px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center font-bold text-white uppercase">
              {myProfile.username[0]}
            </div>
            <div>
              <div className="font-bold text-slate-800">{myProfile.username} (You)</div>
              <div className="text-xs text-slate-500 font-mono">Rating: {myProfile.rating}</div>
            </div>
          </div>
          <Timer initialTime={remainingTime[myColor || PieceColor.LIGHT] || timeControl.initial} isActive={currentTurn === myColor && !gameOverData} />
        </div>
      </div>

      {/* Sidebar Area */}
      <div className="w-full lg:w-96 flex flex-col gap-4">

        {/* Actions Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-800 text-white p-4 font-bold flex justify-between items-center">
             <span>Game Status</span>
             <span className="text-xs bg-red-500 px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">Live</span>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-center font-semibold text-slate-700">{status}</p>

            {myColor && !gameOverData && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleOfferDraw} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition">Offer Draw</button>
                <button onClick={handleResign} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold hover:bg-red-100 transition border border-red-100">Resign</button>
              </div>
            )}

            {drawOfferPending && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg animate-bounce">
                <p className="text-amber-800 font-bold text-sm mb-2">Draw Offered!</p>
                <div className="flex gap-2">
                  <button onClick={handleAcceptDraw} className="flex-1 bg-amber-500 text-white py-1 rounded font-bold text-xs hover:bg-amber-600">Accept</button>
                  <button onClick={handleDeclineDraw} className="flex-1 bg-white border border-amber-300 text-amber-600 py-1 rounded font-bold text-xs">Decline</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Live Chat */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[400px]">
          <div className="bg-slate-100 p-3 border-b border-slate-200 font-bold text-slate-600 flex items-center justify-between">
            <span>Live Chat</span>
            <span className="text-xs text-slate-400 font-normal">{spectatorCount} Watching</span>
          </div>
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
            {chatMessages.length === 0 ? (
               <p className="text-center text-slate-300 text-xs mt-10 italic">Be the first to say hello!</p>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 ml-1 mb-0.5">{msg.sender}</span>
                  <span className="bg-white px-3 py-1.5 rounded-2xl shadow-sm text-sm border border-slate-100 text-slate-700 w-fit max-w-[90%]">
                    {msg.message}
                  </span>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-blue-700 transition shadow-md">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
