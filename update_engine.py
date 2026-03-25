import re

filepath = "backend/src/game/engine/engine.service.ts"
with open(filepath, "r") as f:
    content = f.read()

# Add GameVariant Enum
variant_enum = """export enum GameVariant {
  STANDARD = 'STANDARD', // 8x8
  INTERNATIONAL = 'INTERNATIONAL', // 10x10
}

"""
content = re.sub(r"export enum PieceColor \{", variant_enum + r"export enum PieceColor {", content)

# Update DraughtsEngine class
class_start_idx = content.find("export class DraughtsEngine {")
class_decl = """export class DraughtsEngine {
  private board: BoardState;
  private currentTurn: PieceColor;
  public readonly BOARD_SIZE: number;
  public readonly variant: GameVariant;

  constructor(variant: GameVariant = GameVariant.STANDARD) {
    this.variant = variant;
    this.BOARD_SIZE = variant === GameVariant.INTERNATIONAL ? 10 : 8;
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
  }"""
content = re.sub(r"export class DraughtsEngine \{[\s\S]*?constructor\(\) \{[\s\S]*?\}", class_decl, content)

with open(filepath, "w") as f:
    f.write(content)

print("Updated DraughtsEngine constructor and enum.")
