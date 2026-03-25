import re

filepath = "frontend/src/app/analysis/[id]/page.tsx"
with open(filepath, "r") as f:
    content = f.read()

# Update ReplayEngine to handle variant correctly
replay_engine = """class ReplayEngine {
  public board: any[][];
  public currentTurn: PieceColor;
  private readonly BOARD_SIZE: number;
  public variant: string;

  constructor(variant: string = 'STANDARD') {
    this.variant = variant;
    this.BOARD_SIZE = variant === 'INTERNATIONAL' ? 10 : 8;
    this.board = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));

    const rowsPerSide = variant === 'INTERNATIONAL' ? 4 : 3;

    for (let row = 0; row < rowsPerSide; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 !== 0) this.board[row][col] = { color: PieceColor.DARK, type: PieceType.MAN };
      }
    }
    for (let row = this.BOARD_SIZE - rowsPerSide; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 !== 0) this.board[row][col] = { color: PieceColor.LIGHT, type: PieceType.MAN };
      }
    }
    this.currentTurn = PieceColor.LIGHT;
  }

  makeMove(move: any) {
    const piece = this.board[move.from.row][move.from.col];
    this.board[move.to.row][move.to.col] = piece;
    this.board[move.from.row][move.from.col] = null;

    if (move.captured) {
       for(const cap of move.captured) {
           this.board[cap.row][cap.col] = null;
       }
    }

    if (piece.type === PieceType.MAN) {
      if (piece.color === PieceColor.LIGHT && move.to.row === 0) piece.type = PieceType.KING;
      if (piece.color === PieceColor.DARK && move.to.row === this.BOARD_SIZE - 1) piece.type = PieceType.KING;
    }
    this.currentTurn = this.currentTurn === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
  }
}"""
content = re.sub(r"class ReplayEngine \{[\s\S]*?this\.currentTurn = this\.currentTurn === PieceColor\.LIGHT \? PieceColor\.DARK : PieceColor\.LIGHT;\n  \}\n\}", replay_engine, content)

# Update fetchGame to pass variant
fetch_logic = """        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/history/game/${id}`);
        setGame(res.data);

        // Pre-compute all states
        const engine = new ReplayEngine(res.data.variant || 'STANDARD');"""
content = re.sub(r"        const res = await axios\.get\(`\$\{process\.env\.NEXT_PUBLIC_API_URL \|\| 'http://localhost:3001'}/history/game/\$\{id\}`\);\n        setGame\(res\.data\);\n\n        // Pre-compute all states\n        const engine = new ReplayEngine\(\);", fetch_logic, content)

# Update CSS for board sizes
css_logic = """        <div className="flex flex-col items-center">
            <div className="border-4 border-gray-800 p-1 bg-gray-200 shadow-xl mb-4">
              {currentBoard.map((row: any[], r: number) => (
                <div key={r} className="flex">
                  {row.map((cell: any, c: number) => {
                    const isDarkSquare = (r + c) % 2 !== 0;
                    let squareBg = isDarkSquare ? 'bg-amber-900' : 'bg-amber-200';
                    const is10x10 = currentBoard.length === 10;
                    const squareSize = is10x10 ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-14 h-14 sm:w-16 sm:h-16';
                    const pieceSize = is10x10 ? 'w-8 h-8 sm:w-10 sm:h-10 text-sm border-[3px]' : 'w-12 h-12 border-4';

                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`${squareSize} flex items-center justify-center ${squareBg}`}
                      >
                        {cell && (
                          <div className={`
                            ${pieceSize} rounded-full shadow-md flex items-center justify-center text-white font-bold
                            ${cell.color === PieceColor.LIGHT ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-900 text-slate-200'}
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
            </div>"""
content = re.sub(r"        <div className=\"flex flex-col items-center\">\n            <div className=\"border-4 border-gray-800 p-1 bg-gray-200 shadow-xl mb-4\">[\s\S]*?            </div>", css_logic, content)

with open(filepath, "w") as f:
    f.write(content)

print("Updated Analysis Page")
