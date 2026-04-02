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
import { DraughtsEngine, PieceColor, GameVariant } from './engine/engine.service';
import type { Move } from './engine/engine.service';
import { AiService } from './ai/ai/ai.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { HistoryService } from '../history/history.service';
import { jwtConstants } from '../auth/constants';
import { TournamentsService } from '../tournaments/tournaments.service';
import { AnticheatService } from '../anticheat/anticheat.service';

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
  playerProfiles: {
    [PieceColor.LIGHT]?: any;
    [PieceColor.DARK]?: any;
  }
  moves: Move[];
  tournamentId?: number;
}

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly aiService: AiService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly historyService: HistoryService,
    private readonly tournamentsService: TournamentsService,
    private readonly anticheatService: AnticheatService,
  ) {}

  @WebSocketServer()
  server: Server;

  private waitingPlayers: { socketId: string, tournamentId?: number, variant?: GameVariant }[] = [];
  private activeGames: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private socketToUser: Map<string, any> = new Map(); // Store authenticated users

  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);

    // Optional Auth via query or auth payload (socket.io v4 feature)
    const token = client.handshake.auth.token || client.handshake.query.token;
    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync(token, { secret: jwtConstants.secret });
        const user = await this.usersService.findOneById(payload.sub);
        if (user) {
          const { passwordHash, ...profile } = user;
          this.socketToUser.set(client.id, profile);
          console.log(`Authenticated user connected: ${profile.username}`);
        }
      } catch (err) {
        console.warn('Invalid token on websocket connection');
      }
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    // Remove from matchmaking queue
    this.waitingPlayers = this.waitingPlayers.filter(p => p.socketId !== client.id);

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
    this.socketToUser.delete(client.id);
  }

  @SubscribeMessage('getActiveGames')
  handleGetActiveGames(@ConnectedSocket() client: Socket) {
    const games = Array.from(this.activeGames.values()).map(room => ({
      roomId: room.roomId,
      player1: room.playerProfiles[PieceColor.LIGHT]?.username || 'Player 1',
      player2: room.aiDifficulty ? 'AI' : (room.playerProfiles[PieceColor.DARK]?.username || 'Player 2'),
      spectatorsCount: room.spectators.length,
    }));
    client.emit('activeGamesList', games);
  }

  @SubscribeMessage('joinSpectator')
  handleJoinSpectator(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const room = this.activeGames.get(data.roomId);
    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return;
    }

    room.spectators.push(client.id);
    this.socketToRoom.set(client.id, room.roomId);
    client.join(room.roomId);

    // Send current state
    client.emit('gameStart', {
      roomId: room.roomId,
      color: null, // Spectator has no color
      board: room.engine.getBoard(),
      turn: room.engine.getCurrentTurn(),
      legalMoves: [] // Spectators can't move
    });

    this.server.to(room.roomId).emit('spectatorJoined', { count: room.spectators.length });
  }

  @SubscribeMessage('sendMessage')
  handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string, message: string }) {
    const room = this.activeGames.get(data.roomId);
    if (!room) return;

    // Determine sender identity
    let senderName = 'Spectator';
    if (room.players[PieceColor.LIGHT] === client.id) {
       senderName = room.playerProfiles[PieceColor.LIGHT]?.username || 'Player 1';
    } else if (room.players[PieceColor.DARK] === client.id) {
       senderName = room.playerProfiles[PieceColor.DARK]?.username || 'Player 2';
    } else {
       // If authenticated spectator, use their username
       const profile = this.socketToUser.get(client.id);
       if (profile) senderName = profile.username;
    }

    this.server.to(data.roomId).emit('receiveMessage', {
      sender: senderName,
      message: data.message,
      timestamp: new Date().toISOString()
    });
  }

  @SubscribeMessage('playVsAi')
  handlePlayVsAi(@ConnectedSocket() client: Socket, @MessageBody() data: { difficulty: number, variant?: GameVariant }) {
    // Remove from existing game if any
    const existingRoom = this.socketToRoom.get(client.id);
    if(existingRoom) {
      // (Optional) handle leaving cleanly
      this.handleDisconnect(client);
    }

    const roomId = `ai_game_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const room: GameRoom = {
      roomId,
      engine: new DraughtsEngine(data.variant || GameVariant.STANDARD),
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
      color: PieceColor.LIGHT,
      board: room.engine.getBoard(),
      turn: room.engine.getCurrentTurn(),
      legalMoves: room.engine.getLegalMoves(),
      variant: data.variant || GameVariant.STANDARD
    });
  }

  @SubscribeMessage('joinMatchmaking')
  handleJoinMatchmaking(@ConnectedSocket() client: Socket, @MessageBody() data?: { tournamentId?: number, variant?: GameVariant }) {
    if (this.waitingPlayers.find(p => p.socketId === client.id)) return;

    // Remove from existing game if any
    const existingRoom = this.socketToRoom.get(client.id);
    if(existingRoom) {
      // (Optional) handle leaving cleanly
    }

    this.waitingPlayers.push({ socketId: client.id, tournamentId: data?.tournamentId, variant: data?.variant });

    // Look for a match
    let matchIdx = -1;
    for (let i = 0; i < this.waitingPlayers.length; i++) {
       const p = this.waitingPlayers[i];
       if (p.socketId !== client.id && p.tournamentId === data?.tournamentId && p.variant === data?.variant) {
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
        engine: new DraughtsEngine(data?.variant || GameVariant.STANDARD),
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
        color: PieceColor.LIGHT,
        board: room.engine.getBoard(),
        turn: room.engine.getCurrentTurn(),
        legalMoves: room.engine.getLegalMoves(),
        variant: data?.variant || GameVariant.STANDARD
      });

      this.server.to(player2Id).emit('gameStart', {
        roomId,
        color: PieceColor.DARK,
        board: room.engine.getBoard(),
        turn: room.engine.getCurrentTurn(),
        // Only send legal moves to the player whose turn it is
        legalMoves: [],
        variant: data?.variant || GameVariant.STANDARD
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

    // Extract exact legal move to ensure 'captured' array and other server-validated data is used
    // to prevent client data poisoning in the moves history
    const legalMoves = room.engine.getLegalMoves();
    const exactLegalMove = legalMoves.find(m =>
        m.from.row === move.from.row && m.from.col === move.from.col &&
        m.to.row === move.to.row && m.to.col === move.to.col
    );

    const success = room.engine.makeMove(move);

    if (success && exactLegalMove) {
      room.moves.push(exactLegalMove);
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
        this.handleGameOver(roomId, room, winner);
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
          room.moves.push(bestMove);
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
            this.handleGameOver(roomId, room, winner);
          } else if (newTurn === room.aiColor) {
            // Multi-jump scenarios: If the engine didn't switch turns, AI goes again
            this.triggerAiTurn(roomId, room);
          }
        }
      } else {
        // AI has no moves
        const winner = room.engine.getWinner();
        if (winner) {
           this.handleGameOver(roomId, room, winner);
        }
      }
    }, 500); // 500ms delay
  }

  private async handleGameOver(roomId: string, room: GameRoom, winner: PieceColor | 'DRAW') {
    this.server.to(roomId).emit('gameOver', { winner });

    // Save to database
    try {
       await this.historyService.saveGame(
          room.playerProfiles[PieceColor.LIGHT] || null,
          room.playerProfiles[PieceColor.DARK] || null,
          winner as 'L'|'D'|'DRAW',
          room.moves
       );

       // Update ELO if both are authenticated real players
       const p1 = room.playerProfiles[PieceColor.LIGHT];
       const p2 = room.playerProfiles[PieceColor.DARK];

       // Trigger async anti-cheat analysis
       // We don't await this because it's CPU intensive and we don't want to block the gateway
       if (!room.aiDifficulty) {
           this.anticheatService.analyzeGameForCheating(
              room.playerProfiles[PieceColor.LIGHT] || null,
              room.playerProfiles[PieceColor.DARK] || null,
              room.moves
           ).catch(err => console.error('Anticheat Error:', err));
       }

       if (p1 && p2 && !room.aiDifficulty) {
          if (room.tournamentId) {
             // It's a tournament match, update tournament scores instead of raw ELO
             if (winner === PieceColor.LIGHT) {
                await this.tournamentsService.updateTournamentScore(p1.id, room.tournamentId, 'WIN');
                await this.tournamentsService.updateTournamentScore(p2.id, room.tournamentId, 'LOSS');
             } else if (winner === PieceColor.DARK) {
                await this.tournamentsService.updateTournamentScore(p1.id, room.tournamentId, 'LOSS');
                await this.tournamentsService.updateTournamentScore(p2.id, room.tournamentId, 'WIN');
             } else {
                await this.tournamentsService.updateTournamentScore(p1.id, room.tournamentId, 'DRAW');
                await this.tournamentsService.updateTournamentScore(p2.id, room.tournamentId, 'DRAW');
             }
          } else {
            // Standard ELO match
            if (winner === PieceColor.LIGHT) {
               await this.usersService.updateRating(p1.id, 15, 'win');
               await this.usersService.updateRating(p2.id, -15, 'loss');
            } else if (winner === PieceColor.DARK) {
               await this.usersService.updateRating(p1.id, -15, 'loss');
               await this.usersService.updateRating(p2.id, 15, 'win');
            } else {
               await this.usersService.updateRating(p1.id, 0, 'draw');
               await this.usersService.updateRating(p2.id, 0, 'draw');
            }
          }
       }
    } catch(err) {
       console.error('Failed to save game history:', err);
    }

    this.activeGames.delete(roomId);
  }
}
