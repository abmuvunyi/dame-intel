import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DraughtsEngine, PieceColor } from './engine/engine.service';
import type { Move } from './engine/engine.service';
import { AiService } from './ai/ai/ai.service';

interface GameRoom {
  roomId: string;
  engine: DraughtsEngine;
  players: {
    [PieceColor.LIGHT]?: string; // Socket ID
    [PieceColor.DARK]?: string;  // Socket ID
  };
  spectators: string[];
  aiDifficulty?: number;
  aiColor?: PieceColor;
}

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly aiService: AiService) {}

  @WebSocketServer()
  server: Server;

  private waitingPlayers: string[] = [];
  private activeGames: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    // Remove from matchmaking queue
    this.waitingPlayers = this.waitingPlayers.filter(id => id !== client.id);

    // Handle disconnecting from an active game
    const roomId = this.socketToRoom.get(client.id);
    if (roomId) {
      const room = this.activeGames.get(roomId);
      if (room) {
        // Find which color this player was
        if (room.players[PieceColor.LIGHT] === client.id) {
          room.players[PieceColor.LIGHT] = undefined;
        } else if (room.players[PieceColor.DARK] === client.id) {
          room.players[PieceColor.DARK] = undefined;
        } else {
          // Remove from spectators
          room.spectators = room.spectators.filter(s => s !== client.id);
        }

        // Notify others
        this.server.to(roomId).emit('playerDisconnected', { id: client.id });

        // Clean up empty rooms
        if (!room.players[PieceColor.LIGHT] && !room.players[PieceColor.DARK] && room.spectators.length === 0) {
           this.activeGames.delete(roomId);
        }
      }
      this.socketToRoom.delete(client.id);
    }
  }

  @SubscribeMessage('playVsAi')
  handlePlayVsAi(@ConnectedSocket() client: Socket, @MessageBody() data: { difficulty: number }) {
    // Remove from existing game if any
    const existingRoom = this.socketToRoom.get(client.id);
    if(existingRoom) {
      // (Optional) handle leaving cleanly
      this.handleDisconnect(client);
    }

    const roomId = `ai_game_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const room: GameRoom = {
      roomId,
      engine: new DraughtsEngine(),
      players: {
        [PieceColor.LIGHT]: client.id, // Player is always LIGHT for AI games for simplicity right now
      },
      spectators: [],
      aiDifficulty: data.difficulty || 2, // Default to level 2
      aiColor: PieceColor.DARK,
    };

    this.activeGames.set(roomId, room);
    this.socketToRoom.set(client.id, roomId);

    // Join socket.io room
    this.server.sockets.sockets.get(client.id)?.join(roomId);

    // Notify player
    this.server.to(client.id).emit('gameStart', {
      roomId,
      color: PieceColor.LIGHT,
      board: room.engine.getBoard(),
      turn: room.engine.getCurrentTurn(),
      legalMoves: room.engine.getLegalMoves()
    });
  }

  @SubscribeMessage('joinMatchmaking')
  handleJoinMatchmaking(@ConnectedSocket() client: Socket) {
    if (this.waitingPlayers.includes(client.id)) return;

    // Remove from existing game if any
    const existingRoom = this.socketToRoom.get(client.id);
    if(existingRoom) {
      // (Optional) handle leaving cleanly
    }

    this.waitingPlayers.push(client.id);

    if (this.waitingPlayers.length >= 2) {
      // Match found
      const player1Id = this.waitingPlayers.shift()!;
      const player2Id = this.waitingPlayers.shift()!;

      const roomId = `game_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const room: GameRoom = {
        roomId,
        engine: new DraughtsEngine(),
        players: {
          [PieceColor.LIGHT]: player1Id,
          [PieceColor.DARK]: player2Id,
        },
        spectators: [],
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
        color: PieceColor.LIGHT,
        board: room.engine.getBoard(),
        turn: room.engine.getCurrentTurn(),
        legalMoves: room.engine.getLegalMoves()
      });

      this.server.to(player2Id).emit('gameStart', {
        roomId,
        color: PieceColor.DARK,
        board: room.engine.getBoard(),
        turn: room.engine.getCurrentTurn(),
        // Only send legal moves to the player whose turn it is
        legalMoves: []
      });
    } else {
      client.emit('waitingForOpponent');
    }
  }

  @SubscribeMessage('makeMove')
  handleMakeMove(@ConnectedSocket() client: Socket, @MessageBody() move: Move) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return { error: 'Not in a game' };

    const room = this.activeGames.get(roomId);
    if (!room) return { error: 'Room not found' };

    const color = room.players[PieceColor.LIGHT] === client.id ? PieceColor.LIGHT :
                 (room.players[PieceColor.DARK] === client.id ? PieceColor.DARK : null);

    if (!color) return { error: 'Not a player in this game' };

    if (room.engine.getCurrentTurn() !== color) {
      return { error: 'Not your turn' };
    }

    const success = room.engine.makeMove(move);

    if (success) {
      const currentTurn = room.engine.getCurrentTurn();

      // Broadcast updated state
      this.server.to(roomId).emit('gameState', {
        board: room.engine.getBoard(),
        turn: currentTurn,
      });

      // Send specific legal moves to players
      if (room.players[PieceColor.LIGHT]) {
          this.server.to(room.players[PieceColor.LIGHT]).emit('legalMoves',
            currentTurn === PieceColor.LIGHT ? room.engine.getLegalMoves() : []
          );
      }

      if (room.players[PieceColor.DARK]) {
         this.server.to(room.players[PieceColor.DARK]).emit('legalMoves',
            currentTurn === PieceColor.DARK ? room.engine.getLegalMoves() : []
          );
      }

      const winner = room.engine.getWinner();
      if (winner) {
        this.server.to(roomId).emit('gameOver', { winner });
      } else {
        // If playing against AI and it's AI's turn
        if (room.aiColor === currentTurn) {
          this.triggerAiTurn(roomId, room);
        }
      }
    } else {
      client.emit('invalidMove');
    }
  }

  private triggerAiTurn(roomId: string, room: GameRoom) {
    if (!room.aiDifficulty || !room.aiColor) return;

    // Small delay so the AI doesn't feel instant/robotic
    setTimeout(() => {
      // Double check it's still AI's turn
      if (room.engine.getCurrentTurn() !== room.aiColor) return;

      const bestMove = this.aiService.getBestMove(room.engine, room.aiDifficulty!);

      if (bestMove) {
        const success = room.engine.makeMove(bestMove);
        if (success) {
          const newTurn = room.engine.getCurrentTurn();

          this.server.to(roomId).emit('gameState', {
            board: room.engine.getBoard(),
            turn: newTurn,
          });

          // Send legal moves back to human player
          if (room.players[PieceColor.LIGHT] && newTurn === PieceColor.LIGHT) {
             this.server.to(room.players[PieceColor.LIGHT]).emit('legalMoves', room.engine.getLegalMoves());
          }

          const winner = room.engine.getWinner();
          if (winner) {
            this.server.to(roomId).emit('gameOver', { winner });
          } else if (newTurn === room.aiColor) {
            // Multi-jump scenarios: If the engine didn't switch turns, AI goes again
            this.triggerAiTurn(roomId, room);
          }
        }
      } else {
        // AI has no moves
        const winner = room.engine.getWinner();
        if (winner) {
           this.server.to(roomId).emit('gameOver', { winner });
        }
      }
    }, 500); // 500ms delay
  }
}
