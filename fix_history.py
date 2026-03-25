import re

history_entity_path = "backend/src/history/history.entity.ts"
with open(history_entity_path, "r") as f:
    content = f.read()

variant_col = """  @Column({ nullable: true })
  winner: string; // 'LIGHT', 'DARK', or 'DRAW'

  @Column({ default: 'STANDARD' })
  variant: string; // 'STANDARD' or 'INTERNATIONAL'"""
content = re.sub(r"  @Column\(\{ nullable: true \}\)\n  winner: string; // 'LIGHT', 'DARK', or 'DRAW'", variant_col, content)

with open(history_entity_path, "w") as f:
    f.write(content)

history_service_path = "backend/src/history/history.service.ts"
with open(history_service_path, "r") as f:
    content = f.read()

save_game_def = """  async saveGame(
    lightPlayer: User | null,
    darkPlayer: User | null,
    winner: 'L' | 'D' | 'DRAW',
    moves: any[],
    variant: string = 'STANDARD'
  ): Promise<GameHistory> {"""
content = content.replace("  async saveGame(\n    lightPlayer: User | null,\n    darkPlayer: User | null,\n    winner: 'L' | 'D' | 'DRAW',\n    moves: any[]\n  ): Promise<GameHistory> {", save_game_def)

create_call = """    const game = this.historyRepository.create({
      lightPlayer: lightPlayer || undefined,
      darkPlayer: darkPlayer || undefined,
      winner: winner === 'L' ? 'LIGHT' : (winner === 'D' ? 'DARK' : 'DRAW'),
      moves: moves, // simple-json handles stringification
      variant: variant
    });"""
content = re.sub(r"    const game = this\.historyRepository\.create\(\{[\s\S]*?    \}\);", create_call, content)

with open(history_service_path, "w") as f:
    f.write(content)

gateway_path = "backend/src/game/game.gateway.ts"
with open(gateway_path, "r") as f:
    content = f.read()

history_save_call = """       await this.historyService.saveGame(
          room.playerProfiles[PieceColor.LIGHT] || null,
          room.playerProfiles[PieceColor.DARK] || null,
          winner as 'L'|'D'|'DRAW',
          room.moves,
          room.variant
       );"""
content = re.sub(r"       await this\.historyService\.saveGame\([\s\S]*?room\.moves\n       \);", history_save_call, content)

with open(gateway_path, "w") as f:
    f.write(content)

print("Updated History entity, service, and gateway calls")
