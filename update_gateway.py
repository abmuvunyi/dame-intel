import re

filepath = "backend/src/game/game.gateway.ts"
with open(filepath, "r") as f:
    content = f.read()

# Add GameVariant to imports
content = content.replace("import { DraughtsEngine, PieceColor } from './engine/engine.service';", "import { DraughtsEngine, PieceColor, GameVariant } from './engine/engine.service';")

# Add variant to GameRoom interface
content = content.replace("export interface GameRoom {", "export interface GameRoom {\n  variant: GameVariant;")

# Add variant to waitingPlayers
content = content.replace("private waitingPlayers: { socketId: string, tournamentId?: number }[] = [];", "private waitingPlayers: { socketId: string, tournamentId?: number, variant?: GameVariant }[] = [];")

# Modify handleGetActiveGames to include variant
active_games_logic = """  @SubscribeMessage('getActiveGames')
  handleGetActiveGames(@ConnectedSocket() client: Socket) {
    const games = Array.from(this.activeGames.values()).map(g => ({
      roomId: g.roomId,
      player1: g.playerProfiles[PieceColor.LIGHT]?.username || 'Player 1',
      player2: g.playerProfiles[PieceColor.DARK]?.username || 'Player 2',
      spectatorsCount: g.spectators.length,
      variant: g.variant
    }));
    client.emit('activeGamesList', games);
  }"""
content = re.sub(r"  @SubscribeMessage\('getActiveGames'\)[\s\S]*?client\.emit\('activeGamesList', games\);\n  \}", active_games_logic, content)

# Modify handlePlayVsAi
ai_logic = """  @SubscribeMessage('playVsAi')
  handlePlayVsAi(@ConnectedSocket() client: Socket, @MessageBody() data: { difficulty: number, variant?: GameVariant }) {
    // Remove from matchmaking if they were in it
    this.waitingPlayers = this.waitingPlayers.filter(p => p.socketId !== client.id);

    const roomId = `ai_game_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const variant = data.variant || GameVariant.STANDARD;

    const room: GameRoom = {
      roomId,
      variant,
      engine: new DraughtsEngine(variant),
      players: {
        [PieceColor.LIGHT]: client.id, // Player is always LIGHT for AI games for simplicity right now
      },
      spectators: [],
      aiDifficulty: data.difficulty || 2, // Default to level 2
      aiColor: PieceColor.DARK,
      playerProfiles: {
        [PieceColor.LIGHT]: this.socketToUser.get(client.id),
      },
      moves: []
    };

    this.activeGames.set(roomId, room);
    this.socketToRoom.set(client.id, roomId);

    // Join socket.io room
    this.server.sockets.sockets.get(client.id)?.join(roomId);

    // Notify player
    this.server.to(client.id).emit('gameStart', {
      roomId,
      variant,
      color: PieceColor.LIGHT,
      board: room.engine.getBoard(),
      turn: room.engine.getCurrentTurn(),
      legalMoves: room.engine.getLegalMoves()
    });
  }"""
content = re.sub(r"  @SubscribeMessage\('playVsAi'\)[\s\S]*?legalMoves: room\.engine\.getLegalMoves\(\)\n    \}\);\n  \}", ai_logic, content)

# Modify handleJoinMatchmaking
mm_logic = """  @SubscribeMessage('joinMatchmaking')
  handleJoinMatchmaking(@ConnectedSocket() client: Socket, @MessageBody() data?: { tournamentId?: number, variant?: GameVariant }) {
    if (this.waitingPlayers.find(p => p.socketId === client.id)) return;

    // Remove from existing game if any
    const existingRoom = this.socketToRoom.get(client.id);
    if(existingRoom) {
      // (Optional) handle leaving cleanly
    }

    const requestedVariant = data?.variant || GameVariant.STANDARD;
    this.waitingPlayers.push({ socketId: client.id, tournamentId: data?.tournamentId, variant: requestedVariant });

    // Look for a match
    let matchIdx = -1;
    for (let i = 0; i < this.waitingPlayers.length; i++) {
       const p = this.waitingPlayers[i];
       if (p.socketId !== client.id && p.tournamentId === data?.tournamentId && p.variant === requestedVariant) {
          matchIdx = i;
          break;
       }
    }

    if (matchIdx !== -1) {
      // Match found
      const opponent = this.waitingPlayers.splice(matchIdx, 1)[0];
      const meIndex = this.waitingPlayers.findIndex(p => p.socketId === client.id);
      const me = this.waitingPlayers.splice(meIndex, 1)[0];

      const player1Id = opponent.socketId;
      const player2Id = me.socketId;

      const roomId = data?.tournamentId ? `tourney_${data.tournamentId}_${Date.now()}` : `game_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const room: GameRoom = {
        roomId,
        variant: requestedVariant,
        engine: new DraughtsEngine(requestedVariant),
        players: {
          [PieceColor.LIGHT]: player1Id,
          [PieceColor.DARK]: player2Id,
        },
        spectators: [],
        playerProfiles: {
          [PieceColor.LIGHT]: this.socketToUser.get(player1Id),
          [PieceColor.DARK]: this.socketToUser.get(player2Id),
        },
        moves: [],
        tournamentId: data?.tournamentId,
      };

      this.activeGames.set(roomId, room);
      this.socketToRoom.set(player1Id, roomId);
      this.socketToRoom.set(player2Id, roomId);

      // Join socket.io rooms
      this.server.sockets.sockets.get(player1Id)?.join(roomId);
      this.server.sockets.sockets.get(player2Id)?.join(roomId);

      // Notify players
      this.server.to(player1Id).emit('gameStart', {
        roomId,
        variant: requestedVariant,
        color: PieceColor.LIGHT,
        board: room.engine.getBoard(),
        turn: room.engine.getCurrentTurn(),
        legalMoves: room.engine.getLegalMoves()
      });

      this.server.to(player2Id).emit('gameStart', {
        roomId,
        variant: requestedVariant,
        color: PieceColor.DARK,
        board: room.engine.getBoard(),
        turn: room.engine.getCurrentTurn(),
        // Only send legal moves to the player whose turn it is
        legalMoves: []
      });
    } else {
      client.emit('waitingForOpponent');
    }
  }"""
content = re.sub(r"  @SubscribeMessage\('joinMatchmaking'\)[\s\S]*?client\.emit\('waitingForOpponent'\);\n    \}\n  \}", mm_logic, content)


with open(filepath, "w") as f:
    f.write(content)

print("Updated Socket Gateway in backend/src/game/game.gateway.ts")
