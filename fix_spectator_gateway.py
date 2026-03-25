import re

filepath = "backend/src/game/game.gateway.ts"
with open(filepath, "r") as f:
    content = f.read()

# Update handleJoinSpectator to include variant
spec_logic = """  @SubscribeMessage('joinSpectator')
  handleJoinSpectator(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.activeGames.get(data.roomId);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return;
    }

    room.spectators.push(client.id);
    client.join(data.roomId);

    // Send initial state to spectator
    client.emit('gameStart', {
      roomId: data.roomId,
      variant: room.variant,
      color: null, // Indicates spectator
      board: room.engine.getBoard(),
      turn: room.engine.getCurrentTurn(),
      legalMoves: []
    });

    // Notify others
    this.server.to(data.roomId).emit('spectatorJoined', { count: room.spectators.length });
  }"""
content = re.sub(r"  @SubscribeMessage\('joinSpectator'\)[\s\S]*?this\.server\.to\(data\.roomId\)\.emit\('spectatorJoined', \{ count: room\.spectators\.length \}\);\n  \}", spec_logic, content)

with open(filepath, "w") as f:
    f.write(content)

print("Updated joinSpectator logic")
