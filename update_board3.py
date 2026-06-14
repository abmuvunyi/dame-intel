import re

with open('frontend/src/components/game/GameBoard.tsx', 'r') as f:
    content = f.read()

# Replace block 1
block1_search = """  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <h1 className="text-3xl font-bold">Online Draughts Platform</h1>
        <p className="text-gray-600">{status}</p>

        <div className="flex flex-col space-y-4 pt-4 border-t border-gray-200 w-64">

          <div className="bg-gray-100 p-4 rounded-lg shadow-inner flex flex-col space-y-3">
            <h4 className="text-sm font-bold text-gray-700">Game Rules</h4>
            <label className="text-sm flex justify-between items-center text-gray-600">
               Board Size:
               <select
                  value={boardSize}
                  onChange={e => setBoardSize(parseInt(e.target.value))}
                  className="ml-2 border rounded p-1 text-sm bg-white"
               >
                 <option value={8}>8x8 (Standard)</option>
                 <option value={10}>10x10 (International)</option>
               </select>
            </label>
            <label className="text-sm flex items-center gap-2 text-gray-600 cursor-pointer">
               <input
                  type="checkbox"
                  checked={forceMajorityCapture}
                  onChange={e => setForceMajorityCapture(e.target.checked)}
                  className="rounded"
               />
               Force Majority Capture
            </label>
          </div>

          <button
            onClick={handleFindMatch}
            className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded shadow hover:bg-blue-700 transition"
          >
            {tournamentIdToJoin ? 'Find Tournament Match' : 'Play Multiplayer'}
          </button>

          <div className="text-center pt-2 text-sm text-gray-500 font-medium">OR</div>

          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map(level => (
              <button
                key={level}
                onClick={() => playVsAi(level)}
                className={`px-4 py-2 text-white rounded text-sm transition ${level > 4 ? 'col-span-2 bg-red-800 hover:bg-red-900' : 'bg-slate-700 hover:bg-slate-800'}`}
              >
                AI Lvl {level}
              </button>
            ))}
          </div>
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
  }"""

block1_replace = """  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center space-y-6">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-emerald-400 tracking-tight">Play Draughts</h1>
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
            className="px-6 py-4 bg-green-600 text-white rounded-lg shadow-lg hover:bg-green-500 font-bold text-xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="text-2xl">⚡</span> {tournamentIdToJoin ? 'Find Tournament Match' : 'Play Multiplayer'}
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
                onClick={() => playVsAi(level)}
                className={`px-4 py-2 text-white rounded shadow transition ${level > 4 ? 'col-span-2 bg-[#8a3333] hover:bg-[#a63e3e]' : 'bg-[#3e3b38] hover:bg-[#4a4846]'}`}
              >
                AI Lvl {level}
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
  }"""

block2_search = """  return (
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

        {myColor && !status.includes('Game Over') && (
          <div className="flex gap-4">
            <button onClick={handleOfferDraw} className="px-4 py-2 bg-gray-200 text-gray-800 rounded shadow hover:bg-gray-300 text-sm font-semibold transition">
              Offer Draw
            </button>
            <button onClick={handleResign} className="px-4 py-2 bg-red-100 text-red-800 rounded shadow hover:bg-red-200 text-sm font-semibold transition">
              Resign
            </button>
          </div>
        )}

        {drawOfferPending && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded relative shadow-md mt-2">
            <p className="font-bold">Draw Offered</p>
            <p className="text-sm">Your opponent has offered a draw.</p>
            <div className="mt-2 flex gap-2">
              <button onClick={handleAcceptDraw} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded text-sm">Accept</button>
              <button onClick={handleDeclineDraw} className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-1 px-3 border border-gray-400 rounded shadow text-sm">Decline</button>
            </div>
          </div>
        )}

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
      </div>

      {/* Chat Column */}
      <div className="w-full md:w-80 flex flex-col bg-white rounded-lg shadow-xl border border-gray-200 h-[600px]">
        <div className="bg-slate-800 text-white p-4 rounded-t-lg">
          <h3 className="font-bold">Live Chat</h3>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
          {chatMessages.map((msg, i) => (
            <div key={i} className="text-sm">
              <span className="font-bold text-gray-700">{msg.sender}: </span>
              <span className="text-gray-600">{msg.message}</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleSendMessage} className="p-3 border-t bg-white rounded-b-lg flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring focus:border-blue-300"
            placeholder="Type a message..."
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 font-semibold transition">
            Send
          </button>
        </form>
      </div>

    </div>
  );
}"""

block2_replace = """  return (
    <div className="flex flex-col md:flex-row justify-center py-4 gap-8 max-w-6xl mx-auto px-4">

      {/* Board Column */}
      <div className="flex flex-col items-center space-y-4">
        <div className="flex space-x-4 text-sm text-[#8a8886] font-medium w-full justify-between px-2">
          <span>{spectatorCount} Spectator(s)</span>
          <span>{status}</span>
        </div>

        <p className={`text-xl font-bold px-6 py-2 rounded ${
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
          <div className="bg-[#262421] border border-yellow-600 text-white px-4 py-3 rounded relative shadow-md mt-2">
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
                const cellClass = is10x10 ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-14 h-14 sm:w-[72px] sm:h-[72px]';
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
      <div className="w-full md:w-80 flex flex-col bg-[#262421] rounded-lg shadow-xl border border-[#3e3b38] h-[600px] mt-12 md:mt-0">
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
}"""

if block1_search in content:
    content = content.replace(block1_search, block1_replace)
    print("Block 1 replaced")
else:
    print("Block 1 NOT found")

if block2_search in content:
    content = content.replace(block2_search, block2_replace)
    print("Block 2 replaced")
else:
    print("Block 2 NOT found")

with open('frontend/src/components/game/GameBoard.tsx', 'w') as f:
    f.write(content)
