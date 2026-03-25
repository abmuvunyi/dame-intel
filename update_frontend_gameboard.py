import re

filepath = "frontend/src/components/game/GameBoard.tsx"
with open(filepath, "r") as f:
    content = f.read()

# Add GameVariant to imports/enums
variant_enum = """export enum GameVariant {
  STANDARD = 'STANDARD',
  INTERNATIONAL = 'INTERNATIONAL',
}

"""
content = re.sub(r"export enum PieceColor \{", variant_enum + r"export enum PieceColor {", content)

# Add variant state
state_logic = """  const [status, setStatus] = useState<string>('Disconnected');
  const [variant, setVariant] = useState<GameVariant>(GameVariant.STANDARD);
"""
content = content.replace("  const [status, setStatus] = useState<string>('Disconnected');", state_logic)

# Update gameStart socket handler
game_start_handler = """    newSocket.on('gameStart', (data: { roomId: string, variant: GameVariant, color: PieceColor | null, board: BoardState, turn: PieceColor, legalMoves: Move[] }) => {
      setRoomId(data.roomId);
      setVariant(data.variant || GameVariant.STANDARD);
      setMyColor(data.color);
      setBoard(data.board);
      setCurrentTurn(data.turn);
      setLegalMoves(data.legalMoves || []);
      if (data.color) {
         setStatus(`Game Started! (${data.variant === GameVariant.INTERNATIONAL ? '10x10' : '8x8'}) You are ${data.color === PieceColor.LIGHT ? 'Light (Bottom)' : 'Dark (Top)'}.`);
      } else {
         setStatus(`Spectating match... (${data.variant === GameVariant.INTERNATIONAL ? '10x10' : '8x8'})`);
      }
    });"""
content = re.sub(r"    newSocket\.on\('gameStart', \(data: \{ roomId: string, color: PieceColor \| null, board: BoardState, turn: PieceColor, legalMoves: Move\[\] \}\) => \{[\s\S]*?\}\);\n    \}\);\n", game_start_handler + "\n", content)

# Update handlers to pass variant
handlers = """  const handleFindMatch = () => {
    if (socket) {
      socket.emit('joinMatchmaking', { tournamentId: tournamentIdToJoin, variant });
    }
  };

  const handlePlayAI = (difficulty: number) => {
    if (socket) {
      socket.emit('playVsAi', { difficulty, variant });
    }
  };"""
content = re.sub(r"  const handleFindMatch = \(\) => \{[\s\S]*?\}\);\n    \}\n  \};", handlers, content)

# Update lobby UI to select variant
lobby_ui = """      <div className="flex flex-col items-center justify-center h-screen space-y-4">
        <h1 className="text-3xl font-bold">Online Draughts Platform</h1>
        <p className="text-gray-600">{status}</p>

        <div className="flex flex-col space-y-4 pt-4 border-t border-gray-200 w-64">

          <div className="flex justify-between items-center bg-gray-100 p-2 rounded shadow-sm">
            <label className="text-sm font-semibold text-gray-700">Variant:</label>
            <select
              value={variant}
              onChange={e => setVariant(e.target.value as GameVariant)}
              className="bg-white border border-gray-300 text-sm rounded px-2 py-1 outline-none"
            >
              <option value={GameVariant.STANDARD}>Standard (8x8)</option>
              <option value={GameVariant.INTERNATIONAL}>International (10x10)</option>
            </select>
          </div>

          <button
            onClick={handleFindMatch}
            className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded shadow hover:bg-blue-700 transition"
          >
            {tournamentIdToJoin ? 'Find Tournament Match' : 'Play Multiplayer'}
          </button>"""
content = re.sub(r"      <div className=\"flex flex-col items-center justify-center h-screen space-y-4\">[\s\S]*?\{tournamentIdToJoin \? 'Find Tournament Match' : 'Play Multiplayer'\}\n          </button>", lobby_ui, content)

# Update board rendering
board_render = """        <div className="border-[6px] border-slate-800 p-1 bg-slate-200 shadow-2xl rounded-sm">
          {board.map((row, r) => (
            <div key={r} className="flex">
              {row.map((cell, c) => {
                const isDarkSquare = (r + c) % 2 !== 0;
                const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                const isHighlighted = validDestinations.includes(`${r},${c}`);

                let squareBg = isDarkSquare ? 'bg-[#764b36]' : 'bg-[#e5d0aa]'; // Traditional wooden board colors
                if (isSelected) squareBg = 'bg-yellow-400';
                if (isHighlighted) squareBg = 'bg-green-400 opacity-90';

                const boardSize = board.length;
                const squareSizeClass = boardSize === 10 ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-14 h-14 sm:w-16 sm:h-16';
                const pieceSizeClass = boardSize === 10 ? 'w-8 h-8 sm:w-10 sm:h-10 text-sm border-[3px]' : 'w-10 h-10 sm:w-12 sm:h-12 border-4';

                return (
                  <div
                    key={`${r}-${c}`}
                    onClick={() => handleSquareClick(r, c)}
                    className={`${squareSizeClass} flex items-center justify-center ${squareBg} cursor-pointer transition-colors duration-150`}
                  >
                    {cell && (
                      <div className={`
                        ${pieceSizeClass} rounded-full shadow-md flex items-center justify-center text-white font-bold transform transition-transform hover:scale-105
                        ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-900 text-slate-200'}
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
        </div>"""
content = re.sub(r"        <div className=\"border-\[6px\] border-slate-800 p-1 bg-slate-200 shadow-2xl rounded-sm\">[\s\S]*?</div>\n          \)\)}\n        </div>", board_render, content)

with open(filepath, "w") as f:
    f.write(content)

print("Updated GameBoard frontend")
