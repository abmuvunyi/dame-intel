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

interface GameRoom {
  roomId: string;
  engine: DraughtsEngine;
  players: {
    [PieceColor.LIGHT]?: string; // Socket ID
    [PieceColor.DARK]?: string;  // Socket ID
  };
  spectators: string[];
}

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
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
      }
    } else {
      client.emit('invalidMove');
    }
  }
}
