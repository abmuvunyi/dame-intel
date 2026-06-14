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
               />
               Force Majority Capture
            </label>
          </div>

          <button onClick={joinMatchmaking} className="px-6 py-3 bg-blue-600 text-white rounded shadow hover:bg-blue-700 font-semibold transition">
            Play Multiplayer
          </button>

          <p className="text-center text-xs text-gray-400">OR</p>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => playVsAi(1)} className="px-4 py-2 bg-slate-700 text-white rounded text-sm hover:bg-slate-800 transition">AI Lvl 1</button>
            <button onClick={() => playVsAi(2)} className="px-4 py-2 bg-slate-700 text-white rounded text-sm hover:bg-slate-800 transition">AI Lvl 2</button>
            <button onClick={() => playVsAi(3)} className="px-4 py-2 bg-slate-700 text-white rounded text-sm hover:bg-slate-800 transition">AI Lvl 3</button>
            <button onClick={() => playVsAi(4)} className="px-4 py-2 bg-slate-700 text-white rounded text-sm hover:bg-slate-800 transition">AI Lvl 4</button>
          </div>
          <button onClick={() => playVsAi(5)} className="w-full px-4 py-2 bg-red-800 text-white rounded text-sm hover:bg-red-900 transition">AI Lvl 5</button>
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
                  className="accent-green-500"
               />
               Force Majority Capture
            </label>
          </div>

          <button onClick={joinMatchmaking} className="px-6 py-4 bg-green-600 text-white rounded-lg shadow-lg hover:bg-green-500 font-bold text-xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2">
            <span className="text-2xl">⚡</span> Play Multiplayer
          </button>

          <div className="relative flex py-2 items-center">
             <div className="flex-grow border-t border-[#3e3b38]"></div>
             <span className="flex-shrink-0 mx-4 text-[#8a8886] text-sm">Play Computer</span>
             <div className="flex-grow border-t border-[#3e3b38]"></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => playVsAi(1)} className="px-4 py-2 bg-[#3e3b38] text-white rounded shadow hover:bg-[#4a4846] transition">AI Lvl 1</button>
            <button onClick={() => playVsAi(2)} className="px-4 py-2 bg-[#3e3b38] text-white rounded shadow hover:bg-[#4a4846] transition">AI Lvl 2</button>
            <button onClick={() => playVsAi(3)} className="px-4 py-2 bg-[#3e3b38] text-white rounded shadow hover:bg-[#4a4846] transition">AI Lvl 3</button>
            <button onClick={() => playVsAi(4)} className="px-4 py-2 bg-[#3e3b38] text-white rounded shadow hover:bg-[#4a4846] transition">AI Lvl 4</button>
          </div>
          <button onClick={() => playVsAi(5)} className="w-full px-4 py-3 bg-[#8a3333] text-white rounded shadow-lg hover:bg-[#a63e3e] font-bold transition">AI Lvl 5 (Master)</button>
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

if block1_search in content:
    content = content.replace(block1_search, block1_replace)
    print("Block 1 replaced")
else:
    print("Block 1 NOT found")

with open('frontend/src/components/game/GameBoard.tsx', 'w') as f:
    f.write(content)
