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
      <div className="flex flex-col md:flex-row justify-center items-stretch gap-8 w-full h-full p-4">

        {/* Left Column - Board Preview */}
        <div className="flex-1 flex justify-center items-center">
            <div className={`border-[10px] border-[#3e3c39] rounded-sm shadow-2xl relative`}>
                <div className={`grid ${boardSize === 8 ? 'grid-cols-8 grid-rows-8' : 'grid-cols-10 grid-rows-10'}`}>
                    {Array.from({ length: boardSize * boardSize }).map((_, i) => {
                        const r = Math.floor(i / boardSize);
                        const c = i % boardSize;
                        const isDarkSquare = (r + c) % 2 !== 0;
                        const squareBg = isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]';
                        const cellClass = boardSize === 10 ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-14 h-14 sm:w-16 sm:h-16';

                        return (
                            <div key={i} className={`${cellClass} ${squareBg} flex items-center justify-center`} />
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Right Column - Play Settings */}
        <div className="w-full md:w-96 flex flex-col gap-4 bg-[#262421] p-6 rounded-lg shadow-xl text-white">
          <h2 className="text-3xl font-black italic tracking-tight mb-2 text-center text-white">Play Draughts</h2>

          <p className="text-[#a7a6a2] text-sm text-center mb-4">{status}</p>

          <div className="flex flex-col gap-4 bg-[#302e2b] p-4 rounded-lg">
            <div className="flex justify-between items-center">
               <span className="font-bold text-[#c3c3c2]">Variant</span>
               <select
                  value={boardSize}
                  onChange={e => setBoardSize(parseInt(e.target.value))}
                  className="bg-[#262421] text-white border-none rounded py-1 px-3 font-bold cursor-pointer outline-none hover:bg-[#34322f]"
               >
                 <option value={8}>8x8 Standard</option>
                 <option value={10}>10x10 International</option>
               </select>
            </div>

            <div className="flex justify-between items-center cursor-pointer" onClick={() => setForceMajorityCapture(!forceMajorityCapture)}>
               <span className="font-bold text-[#c3c3c2]">Majority Capture</span>
               <div className={`w-10 h-5 rounded-full relative transition-colors ${forceMajorityCapture ? 'bg-[#81b64c]' : 'bg-[#43403c]'}`}>
                   <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${forceMajorityCapture ? 'right-0.5' : 'left-0.5'}`} />
               </div>
            </div>
          </div>

          <button
            onClick={handleFindMatch}
            className="w-full mt-4 bg-[#81b64c] hover:bg-[#95c562] text-white font-black text-xl py-4 rounded-lg shadow-[0_4px_0_0_#537e2b] hover:shadow-[0_4px_0_0_#629933] active:shadow-none active:translate-y-1 transition-all flex items-center justify-center gap-2"
          >
            <span>▶</span> {tournamentIdToJoin ? 'Join Tournament Match' : 'Play Online'}
          </button>

          <div className="flex items-center gap-4 my-2">
            <div className="h-px bg-[#43403c] flex-1"></div>
            <span className="text-[#8b8987] font-bold text-sm">Computer</span>
            <div className="h-px bg-[#43403c] flex-1"></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map(level => (
              <button
                key={level}
                onClick={() => handlePlayAI(level)}
                className={`w-full py-2.5 rounded-lg font-bold text-sm shadow-[0_3px_0_0_rgba(0,0,0,0.2)] active:translate-y-px active:shadow-none transition-all ${level > 4 ? 'bg-[#b33430] hover:bg-[#c23a35] text-white col-span-2' : 'bg-[#43403c] hover:bg-[#4d4a46] text-[#c3c3c2]'}`}
              >
                AI Lvl {level} {level === 7 ? '(3500+)' : ''}
              </button>
            ))}
          </div>

          {activeGames.length > 0 && (
            <div className="mt-6 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[#c3c3c2] font-bold mb-2">
                    <span>👁️</span> Watch Games
                </div>
                {activeGames.map((game, i) => (
                    <div key={i} className="flex justify-between items-center bg-[#302e2b] p-3 rounded-lg hover:bg-[#34322f] cursor-pointer" onClick={() => handleWatchGame(game.roomId)}>
                        <span className="font-bold text-sm">{game.player1} vs {game.player2}</span>
                        <span className="text-[#8b8987] text-xs font-bold bg-[#262421] px-2 py-1 rounded">Watch ({game.spectatorsCount})</span>
                    </div>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Calculate valid destinations for highlighting
  const validDestinations = selectedPos ? legalMoves.filter(m => m.from.row === selectedPos.row && m.from.col === selectedPos.col).map(m => `${m.to.row},${m.to.col}`) : [];

  return (
    <div className="flex flex-col md:flex-row justify-center py-10 gap-8 max-w-6xl mx-auto px-4">

      {/* Board Column */}
      <div className="flex-1 flex flex-col items-center max-w-[800px]">

        {/* Opponent Info (Top) */}
        <div className="w-full flex items-center justify-between bg-[#262421] p-3 rounded-t-lg mb-1 shadow">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#302e2b] rounded flex items-center justify-center text-2xl">🤖</div>
                <div className="font-bold text-[#c3c3c2]">{myColor ? 'Opponent' : 'Dark'} {spectatorCount > 0 ? `(${spectatorCount} spectating)` : ''}</div>
            </div>
            {currentTurn !== myColor && !status.includes('Game Over') && myColor && (
                <div className="px-3 py-1 bg-[#b33430] text-white font-bold rounded text-sm animate-pulse">Thinking...</div>
            )}
        </div>

        <div className="border-[10px] border-[#3e3c39] rounded-sm shadow-2xl w-full max-w-[600px] aspect-square">
          <div className={`w-full h-full grid ${boardSize === 8 ? 'grid-cols-8 grid-rows-8' : 'grid-cols-10 grid-rows-10'}`}>
            {board.map((row, r) => (
              row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]';
                if (isSelected) squareBg = 'bg-[#f6f669] opacity-90'; // chess.com yellow highlight
                if (isHighlighted) squareBg = isDarkSquare ? 'bg-[#a3c36c]' : 'bg-[#f8f8b0]'; // highlight moves

                const is10x10 = boardSize === 10;
                const pieceClass = 'w-[80%] h-[80%]';
                const stackClass = 'absolute bottom-1 right-1 w-[80%] h-[80%]';

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`w-full h-full flex items-center justify-center ${squareBg} cursor-pointer relative`}
                  >
                    {isHighlighted && !cell && (
                       <div className="w-1/3 h-1/3 bg-black opacity-20 rounded-full" />
                    )}
                    {isHighlighted && cell && (
                       <div className="absolute w-full h-full border-4 border-black opacity-20 rounded-full" />
                    )}

                    {cell && (
                      <div className={`
                        ${pieceClass} rounded-full shadow-md flex items-center justify-center font-bold z-10
                        ${cell.color === PieceColor.LIGHT ? 'bg-[#f8f8f8] border-[3px] border-[#c0c0c0]' : 'bg-[#2b2b2b] border-[3px] border-[#1a1a1a]'}
                      `}>
                        {cell.color === PieceColor.LIGHT && (
                           <div className="w-[70%] h-[70%] rounded-full border border-[#e0e0e0] flex items-center justify-center">
                              {cell.type === PieceType.KING && <span className="text-black text-xs md:text-sm">♔</span>}
                           </div>
                        )}
                        {cell.color === PieceColor.DARK && (
                           <div className="w-[70%] h-[70%] rounded-full border border-[#3b3b3b] flex items-center justify-center">
                              {cell.type === PieceType.KING && <span className="text-white text-xs md:text-sm">♚</span>}
                           </div>
                        )}
                      </div>
                    )}

                    {cell?.type === PieceType.KING && (
                        <div className={`
                            ${stackClass} rounded-full shadow-md z-0
                            ${cell.color === PieceColor.LIGHT ? 'bg-[#d0d0d0] border-[3px] border-[#c0c0c0]' : 'bg-[#1a1a1a] border-[3px] border-[#111111]'}
                        `} />
                    )}
                  </div>
                );
              })
            ))}
          </div>
        </div>

        {/* Player Info (Bottom) */}
        <div className="w-full flex items-center justify-between bg-[#262421] p-3 rounded-b-lg mt-1 shadow">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#302e2b] rounded flex items-center justify-center text-2xl">👤</div>
                <div className="font-bold text-white">{myColor ? 'You' : 'Light'}</div>
            </div>
            {currentTurn === myColor && !status.includes('Game Over') && (
                <div className="px-3 py-1 bg-[#81b64c] text-white font-bold rounded text-sm animate-pulse">Your Turn</div>
            )}
        </div>
      </div>

      {/* Right Column - Controls & Chat */}
      <div className="w-full md:w-80 flex flex-col bg-[#262421] rounded-lg shadow-xl h-[800px] overflow-hidden">

        <div className="p-4 bg-[#302e2b] border-b border-[#43403c]">
            <h3 className="font-bold text-white text-center">{status || 'Game Active'}</h3>
        </div>

        {myColor && !status.includes('Game Over') && (
          <div className="flex justify-center gap-2 p-4 bg-[#262421]">
            <button onClick={handleOfferDraw} className="flex-1 py-2 bg-[#302e2b] hover:bg-[#34322f] text-[#c3c3c2] rounded font-bold text-sm shadow-[0_2px_0_0_#1a1917] active:translate-y-px active:shadow-none">
              ½ Draw
            </button>
            <button onClick={handleResign} className="flex-1 py-2 bg-[#302e2b] hover:bg-[#34322f] text-[#c3c3c2] rounded font-bold text-sm shadow-[0_2px_0_0_#1a1917] active:translate-y-px active:shadow-none">
              ⚐ Resign
            </button>
          </div>
        )}

        {drawOfferPending && (
          <div className="bg-[#b33430] text-white p-3 text-center text-sm shadow-inner">
            <p className="font-bold mb-2">Draw Offered</p>
            <div className="flex gap-2 justify-center">
              <button onClick={handleAcceptDraw} className="bg-white text-[#b33430] font-bold py-1 px-4 rounded">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-[#8b2825] hover:bg-[#6c1f1d] font-bold py-1 px-4 rounded border border-[#6c1f1d]">Decline</button>
            </div>
          </div>
        )}

        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#262421]">
          {chatMessages.length === 0 ? (
             <p className="text-center text-[#8b8987] text-sm mt-10">Chat room. Be nice!</p>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-xs font-bold text-[#8b8987]">{msg.sender}</span>
                <span className="text-white text-sm break-words">
                  {msg.message}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="p-3 bg-[#302e2b] border-t border-[#43403c]">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Message..."
              className="flex-1 bg-[#262421] text-white text-sm border border-[#43403c] rounded px-3 py-2 focus:outline-none focus:border-[#81b64c] placeholder-[#8b8987]"
            />
            <button
              type="submit"
              className="bg-[#81b64c] hover:bg-[#95c562] text-white px-4 py-2 rounded text-sm font-bold shadow-[0_2px_0_0_#537e2b] active:translate-y-px active:shadow-none"
            >
              Send
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
