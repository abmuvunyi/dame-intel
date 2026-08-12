import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DraughtsEngine, PieceColor } from './engine/engine.service';
import type { Move } from './engine/engine.service';
import { AiService } from './ai/ai/ai.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { HistoryService } from '../history/history.service';
import { jwtConstants } from '../auth/constants';
import { TournamentsService } from '../tournaments/tournaments.service';
import { AnticheatService } from '../anticheat/anticheat.service';

import { GameRules } from './engine/engine.service';
import { SeekEntry, sweepMatches } from './matchmaking';
import { TimeControl, TimeControlName, TIME_CONTROLS, resolveTimeControl } from './time-control';
import { RatingService } from '../rating/rating.service';

// How long a disconnected player has to reconnect before their opponent is awarded the
// win by abandonment (PvP), or the room is quietly cleaned up (vs-AI).
const DISCONNECT_GRACE_MS = 60_000;
// How often the matchmaking queue is re-swept for matches that only became possible
// because someone's rating band widened with wait time (no new player needed to join).
const MATCHMAKING_SWEEP_MS = 2_000;

interface QueuedPlayer extends SeekEntry {
  fullRules: GameRules;
}

interface PendingChallenge {
  challengeId: string;
  fromSocketId: string;
  fromUserId: number;
  toUserId: number;
  rules: GameRules;
  timeControl: TimeControl;
  createdAt: number;
}

interface GameRoom {
  roomId: string;
  engine: DraughtsEngine;
  rules: GameRules;
  timeControl: TimeControl;
  clocks: { [PieceColor.LIGHT]: number; [PieceColor.DARK]: number }; // seconds remaining
  turnStartedAt: number; // ms epoch the current mover's clock started running
  flagTimer?: ReturnType<typeof setTimeout>;
  disconnectTimers: Partial<Record<PieceColor, ReturnType<typeof setTimeout>>>;
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
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly aiService: AiService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly historyService: HistoryService,
    private readonly tournamentsService: TournamentsService,
    private readonly anticheatService: AnticheatService,
    private readonly ratingService: RatingService,
  ) {}

  @WebSocketServer()
  server: Server;

  private waitingPlayers: QueuedPlayer[] = [];
  private activeGames: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private socketToUser: Map<string, any> = new Map(); // Store authenticated users
  private userIdToSocket: Map<number, string> = new Map(); // For direct challenges & reconnect
  private userIdToRoom: Map<number, string> = new Map(); // For reconnect lookup after a fresh connection
  private pendingChallenges: Map<string, PendingChallenge> = new Map();
  private matchmakingInterval?: ReturnType<typeof setInterval>;

  onModuleInit() {
    this.matchmakingInterval = setInterval(() => this.runMatchmakingSweep(), MATCHMAKING_SWEEP_MS);
  }

  onModuleDestroy() {
    if (this.matchmakingInterval) clearInterval(this.matchmakingInterval);
  }

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
          this.userIdToSocket.set(profile.id, client.id);
          console.log(`Authenticated user connected: ${profile.username}`);
          this.attemptRejoin(client, profile.id);
        }
      } catch (err) {
        console.warn('Invalid token on websocket connection');
      }
    }
  }

  // Auto-rejoin: if this authenticated user has a game they were disconnected from
  // (still within its grace period), silently restore them to it — no action required
  // from the client beyond connecting with a valid token, exactly as it already does.
  private attemptRejoin(client: Socket, userId: number): boolean {
    const roomId = this.userIdToRoom.get(userId);
    if (!roomId) return false;

    const room = this.activeGames.get(roomId);
    if (!room) {
      this.userIdToRoom.delete(userId);
      return false;
    }

    const color = room.playerProfiles[PieceColor.LIGHT]?.id === userId
      ? PieceColor.LIGHT
      : room.playerProfiles[PieceColor.DARK]?.id === userId ? PieceColor.DARK : null;
    if (!color) return false;

    // Only a genuine reconnect if that seat is actually mid-grace-period right now.
    if (!room.disconnectTimers[color]) return false;

    clearTimeout(room.disconnectTimers[color]);
    delete room.disconnectTimers[color];

    room.players[color] = client.id;
    this.socketToRoom.set(client.id, roomId);
    client.join(roomId);

    client.emit('gameResync', {
      roomId,
      color,
      board: room.engine.getBoard(),
      turn: room.engine.getCurrentTurn(),
      legalMoves: room.engine.getCurrentTurn() === color ? room.engine.getLegalMoves() : [],
      moves: room.moves,
      clocks: room.clocks,
      turnStartedAt: room.turnStartedAt,
      timeControl: room.timeControl.name,
    });

    const opponentColor = color === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
    const opponentSocketId = room.players[opponentColor];
    if (opponentSocketId) {
      this.server.to(opponentSocketId).emit('opponentReconnected', { color });
    }

    return true;
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    this.waitingPlayers = this.waitingPlayers.filter(p => p.id !== client.id);

    const profile = this.socketToUser.get(client.id);
    if (profile && this.userIdToSocket.get(profile.id) === client.id) {
      this.userIdToSocket.delete(profile.id);
    }

    const roomId = this.socketToRoom.get(client.id);
    if (roomId) {
      const room = this.activeGames.get(roomId);
      if (room) {
        let color: PieceColor | null = null;
        if (room.players[PieceColor.LIGHT] === client.id) color = PieceColor.LIGHT;
        else if (room.players[PieceColor.DARK] === client.id) color = PieceColor.DARK;

        if (color) {
          this.handlePlayerLeft(roomId, room, color);
        } else {
          room.spectators = room.spectators.filter(s => s !== client.id);
        }
      }
      this.socketToRoom.delete(client.id);
    }
    this.socketToUser.delete(client.id);
  }

  // A player's socket dropped. Authenticated players get a grace period to reconnect
  // (see attemptRejoin) rather than an instant loss; anonymous players have no stable
  // identity to reconnect with, so they fall back to leaving immediately.
  private handlePlayerLeft(roomId: string, room: GameRoom, color: PieceColor) {
    const opponentColor = color === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
    const userId = room.playerProfiles[color]?.id;

    if (!userId) {
      // Anonymous player: no way to recognize them on reconnect.
      room.players[color] = undefined;
      this.server.to(roomId).emit('playerDisconnected', { color });
      if (!room.players[PieceColor.LIGHT] && !room.players[PieceColor.DARK] && room.spectators.length === 0) {
        this.clearRoomTimers(room);
        this.activeGames.delete(roomId);
      }
      return;
    }

    if (room.aiDifficulty) {
      // vs-AI: just keep the room alive briefly in case of a quick reload; no
      // "opponent" to award a win to.
      room.disconnectTimers[color] = setTimeout(() => {
        delete room.disconnectTimers[color];
        this.activeGames.delete(roomId);
        this.userIdToRoom.delete(userId);
      }, DISCONNECT_GRACE_MS);
      return;
    }

    // Real PvP, authenticated: hold the seat open and let the opponent know, rather
    // than declaring a winner immediately.
    this.server.to(roomId).emit('opponentDisconnected', { color, graceMs: DISCONNECT_GRACE_MS });
    room.disconnectTimers[color] = setTimeout(() => {
      delete room.disconnectTimers[color];
      const stillActive = this.activeGames.get(roomId);
      if (stillActive) this.handleGameOver(roomId, stillActive, opponentColor, 'abandonment');
    }, DISCONNECT_GRACE_MS);
  }

  private clearRoomTimers(room: GameRoom) {
    if (room.flagTimer) clearTimeout(room.flagTimer);
    for (const color of [PieceColor.LIGHT, PieceColor.DARK]) {
      const t = room.disconnectTimers[color];
      if (t) clearTimeout(t);
    }
  }

  // --- Server-authoritative clocks ---

  private scheduleFlagFall(roomId: string, room: GameRoom) {
    if (room.flagTimer) clearTimeout(room.flagTimer);
    const turn = room.engine.getCurrentTurn();
    const ms = Math.max(0, room.clocks[turn] * 1000);
    room.flagTimer = setTimeout(() => this.handleFlagFall(roomId), ms);
  }

  private handleFlagFall(roomId: string) {
    const room = this.activeGames.get(roomId);
    if (!room) return;
    if (room.engine.isGameOver()) return; // already resolved some other way

    const flaggedColor = room.engine.getCurrentTurn();
    const winner = flaggedColor === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
    this.handleGameOver(roomId, room, winner, 'flag-fall');
  }

  // Deducts the time the mover actually spent thinking from their own clock and applies
  // their increment. Must be called with the CURRENT (pre-switch) turn color.
  private applyClockForMove(room: GameRoom, moverColor: PieceColor) {
    const elapsedSeconds = (Date.now() - room.turnStartedAt) / 1000;
    room.clocks[moverColor] = Math.max(0, room.clocks[moverColor] - elapsedSeconds) + room.timeControl.incrementSeconds;
    room.turnStartedAt = Date.now();
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
      legalMoves: [], // Spectators can't move
      clocks: room.clocks,
      turnStartedAt: room.turnStartedAt,
      timeControl: room.timeControl.name,
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

  @SubscribeMessage('resignGame')
  handleResignGame(@ConnectedSocket() client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;
    const room = this.activeGames.get(roomId);
    if (!room) return;

    if (room.players[PieceColor.LIGHT] === client.id) {
       this.handleGameOver(roomId, room, PieceColor.DARK, 'resignation');
    } else if (room.players[PieceColor.DARK] === client.id) {
       this.handleGameOver(roomId, room, PieceColor.LIGHT, 'resignation');
    }
  }

  @SubscribeMessage('offerDraw')
  handleOfferDraw(@ConnectedSocket() client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;
    const room = this.activeGames.get(roomId);
    if (!room) return;

    // AI automatically rejects draws for simplicity, or we just don't support it vs AI
    if (room.aiDifficulty) {
       client.emit('drawDeclined');
       return;
    }

    const opponentSocketId = room.players[PieceColor.LIGHT] === client.id
      ? room.players[PieceColor.DARK]
      : room.players[PieceColor.LIGHT];

    if (opponentSocketId) {
       this.server.to(opponentSocketId).emit('drawOffered');
    }
  }

  @SubscribeMessage('acceptDraw')
  handleAcceptDraw(@ConnectedSocket() client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;
    const room = this.activeGames.get(roomId);
    if (!room) return;

    // Validate client is actually a player
    if (room.players[PieceColor.LIGHT] === client.id || room.players[PieceColor.DARK] === client.id) {
       this.handleGameOver(roomId, room, 'DRAW', 'agreement');
    }
  }

  @SubscribeMessage('declineDraw')
  handleDeclineDraw(@ConnectedSocket() client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;
    const room = this.activeGames.get(roomId);
    if (!room) return;

    const opponentSocketId = room.players[PieceColor.LIGHT] === client.id
      ? room.players[PieceColor.DARK]
      : room.players[PieceColor.LIGHT];

    if (opponentSocketId) {
       this.server.to(opponentSocketId).emit('drawDeclined');
    }
  }

  @SubscribeMessage('playVsAi')
  handlePlayVsAi(@ConnectedSocket() client: Socket, @MessageBody() data: { difficulty: number, rules?: Partial<GameRules>, timeControl?: string }) {
    // Remove from existing game if any
    const existingRoom = this.socketToRoom.get(client.id);
    if(existingRoom) {
      // (Optional) handle leaving cleanly
      this.handleDisconnect(client);
    }

    const roomId = `ai_game_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    // Let the engine apply its own variant-correct defaults (e.g. forceMajorityCapture
    // defaults to false for 8x8 American, true for 10x10 International) rather than
    // hardcoding a single-variant default here.
    const engine = new DraughtsEngine(data.rules || {});
    const rules = engine.getRules();
    const timeControl = resolveTimeControl(data.timeControl);

    const room: GameRoom = {
      roomId,
      engine,
      rules,
      timeControl,
      clocks: { [PieceColor.LIGHT]: timeControl.baseSeconds, [PieceColor.DARK]: timeControl.baseSeconds },
      turnStartedAt: Date.now(),
      disconnectTimers: {},
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

    const p1Profile = room.playerProfiles[PieceColor.LIGHT];
    if (p1Profile) this.userIdToRoom.set(p1Profile.id, roomId);

    // Join socket.io room
    this.server.sockets.sockets.get(client.id)?.join(roomId);
    this.scheduleFlagFall(roomId, room);

    // Notify player
    this.server.to(client.id).emit('gameStart', {
      roomId,
      color: PieceColor.LIGHT,
      board: room.engine.getBoard(),
      turn: room.engine.getCurrentTurn(),
      legalMoves: room.engine.getLegalMoves(),
      clocks: room.clocks,
      turnStartedAt: room.turnStartedAt,
      timeControl: timeControl.name,
    });
  }

  @SubscribeMessage('joinMatchmaking')
  async handleJoinMatchmaking(@ConnectedSocket() client: Socket, @MessageBody() data?: { tournamentId?: number, rules?: Partial<GameRules>, timeControl?: string }) {
    if (this.waitingPlayers.find(p => p.id === client.id)) return;

    if (data?.tournamentId && await this.tryJoinSwissPairing(client, data.tournamentId)) {
      return;
    }

    const fullRules = new DraughtsEngine(data?.rules || {}).getRules();
    const timeControl = resolveTimeControl(data?.timeControl);
    const profile = this.socketToUser.get(client.id);
    const rating = profile?.rating ?? 1200; // anonymous players seek at the platform default

    this.waitingPlayers.push({
      id: client.id,
      rating,
      joinedAt: Date.now(),
      variant: { boardSize: fullRules.boardSize, forceMajorityCapture: fullRules.forceMajorityCapture },
      timeControl: timeControl.name,
      tournamentId: data?.tournamentId,
      fullRules,
    });

    client.emit('waitingForOpponent');
    this.runMatchmakingSweep();
  }

  // Swiss tournaments hand out a specific, prescribed opponent each round (see
  // TournamentsService.findSwissOpponent) — pairing on the generic queue below would
  // risk matching a player against ANY other Swiss entrant queuing for the same
  // tournament, not the one the pairing algorithm actually assigned them. Returns
  // true if this request was handled here (whether paired immediately or left
  // waiting), false if the caller should fall through to generic matchmaking
  // (non-Swiss tournament, or no tournament at all).
  //
  // Deliberately ignores any `rules`/`timeControl` the client itself requested for a
  // Swiss game (Phase 8b): the organizer configured the tournament's board variant
  // and clock when they created it (`Tournament.boardSize`/`ruleVariant`/
  // `timeControlName`), and every game in the event should use that, not whatever an
  // individual player happens to pass.
  private async tryJoinSwissPairing(client: Socket, tournamentId: number): Promise<boolean> {
    const tournament = await this.tournamentsService.getTournament(tournamentId);
    if (!tournament || tournament.format !== 'Swiss') return false;

    const profile = this.socketToUser.get(client.id);
    if (!profile) {
      client.emit('error', { message: 'You must be logged in to play in a Swiss tournament.' });
      return true;
    }

    const opponentUserId = await this.tournamentsService.findSwissOpponent(tournamentId, profile.id);
    if (opponentUserId === null) {
      // No unresolved pairing for them this round yet (or ever) — nothing to do but wait.
      client.emit('waitingForOpponent');
      return true;
    }

    const opponentSocketId = this.userIdToSocket.get(opponentUserId);
    // Re-checked as late as possible (right before creating the room) to narrow the
    // window for two concurrent joinMatchmaking calls to both try to seat the same pair.
    if (opponentSocketId && !this.socketToRoom.get(client.id) && !this.socketToRoom.get(opponentSocketId)) {
      const fullRules = new DraughtsEngine({ boardSize: tournament.boardSize, variant: tournament.ruleVariant as GameRules['variant'] }).getRules();
      const timeControl = resolveTimeControl(tournament.timeControlName);
      this.createPvpRoom(client.id, opponentSocketId, fullRules, timeControl, tournamentId);
    } else {
      client.emit('waitingForOpponent'); // prescribed opponent isn't online (or the room won the race) — wait
    }
    return true;
  }

  // Pairs up everyone currently in the queue that it can. Runs both right after a
  // player joins (so an already-waiting opponent gets matched instantly) and on a
  // fixed interval (so two players who are both still waiting get matched purely from
  // their rating bands widening over time, without either of them taking any action).
  private runMatchmakingSweep() {
    if (this.waitingPlayers.length < 2) return;

    const { pairs, unmatched } = sweepMatches(this.waitingPlayers, Date.now());
    if (pairs.length === 0) return;

    this.waitingPlayers = unmatched as QueuedPlayer[];
    for (const [a, b] of pairs) {
      const qa = a as QueuedPlayer;
      const qb = b as QueuedPlayer;
      const timeControl = TIME_CONTROLS[qa.timeControl];
      this.createPvpRoom(qa.id, qb.id, qa.fullRules, timeControl, qa.tournamentId);
    }
  }

  // --- Direct challenges ---

  @SubscribeMessage('challengePlayer')
  handleChallengePlayer(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: number, rules?: Partial<GameRules>, timeControl?: string }) {
    const fromProfile = this.socketToUser.get(client.id);
    if (!fromProfile) {
      client.emit('challengeFailed', { reason: 'You must be logged in to challenge a player.' });
      return;
    }

    const targetSocketId = this.userIdToSocket.get(data.targetUserId);
    if (!targetSocketId) {
      client.emit('challengeFailed', { reason: 'That player is not online.' });
      return;
    }

    const rules = new DraughtsEngine(data.rules || {}).getRules();
    const timeControl = resolveTimeControl(data.timeControl);
    const challengeId = `chal_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    this.pendingChallenges.set(challengeId, {
      challengeId,
      fromSocketId: client.id,
      fromUserId: fromProfile.id,
      toUserId: data.targetUserId,
      rules,
      timeControl,
      createdAt: Date.now(),
    });

    this.server.to(targetSocketId).emit('challengeReceived', {
      challengeId,
      fromUser: { id: fromProfile.id, username: fromProfile.username },
      rules,
      timeControl: timeControl.name,
    });
  }

  @SubscribeMessage('respondToChallenge')
  handleRespondToChallenge(@ConnectedSocket() client: Socket, @MessageBody() data: { challengeId: string, accept: boolean }) {
    const challenge = this.pendingChallenges.get(data.challengeId);
    if (!challenge) return;
    this.pendingChallenges.delete(data.challengeId);

    const responderProfile = this.socketToUser.get(client.id);
    if (!responderProfile || responderProfile.id !== challenge.toUserId) return; // not this challenge's target

    if (!data.accept) {
      this.server.to(challenge.fromSocketId).emit('challengeDeclined', { challengeId: data.challengeId });
      return;
    }

    // The challenger may have reconnected under a new socket id since issuing the challenge.
    const challengerSocketId = this.userIdToSocket.get(challenge.fromUserId);
    if (!challengerSocketId) {
      client.emit('challengeFailed', { reason: 'The challenger is no longer online.' });
      return;
    }

    this.createPvpRoom(challengerSocketId, client.id, challenge.rules, challenge.timeControl);
  }

  // Shared by matchmaking and accepted direct challenges.
  private createPvpRoom(player1Id: string, player2Id: string, rules: GameRules, timeControl: TimeControl, tournamentId?: number): GameRoom {
    const roomId = tournamentId ? `tourney_${tournamentId}_${Date.now()}` : `game_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const room: GameRoom = {
      roomId,
      engine: new DraughtsEngine(rules),
      rules,
      timeControl,
      clocks: { [PieceColor.LIGHT]: timeControl.baseSeconds, [PieceColor.DARK]: timeControl.baseSeconds },
      turnStartedAt: Date.now(),
      disconnectTimers: {},
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
      tournamentId,
    };

    this.activeGames.set(roomId, room);
    this.socketToRoom.set(player1Id, roomId);
    this.socketToRoom.set(player2Id, roomId);

    const p1Profile = room.playerProfiles[PieceColor.LIGHT];
    const p2Profile = room.playerProfiles[PieceColor.DARK];
    if (p1Profile) this.userIdToRoom.set(p1Profile.id, roomId);
    if (p2Profile) this.userIdToRoom.set(p2Profile.id, roomId);

    // Join socket.io rooms
    this.server.sockets.sockets.get(player1Id)?.join(roomId);
    this.server.sockets.sockets.get(player2Id)?.join(roomId);

    this.scheduleFlagFall(roomId, room);

    const basePayload = {
      roomId,
      board: room.engine.getBoard(),
      turn: room.engine.getCurrentTurn(),
      clocks: room.clocks,
      turnStartedAt: room.turnStartedAt,
      timeControl: timeControl.name,
    };

    this.server.to(player1Id).emit('gameStart', { ...basePayload, color: PieceColor.LIGHT, legalMoves: room.engine.getLegalMoves() });
    this.server.to(player2Id).emit('gameStart', { ...basePayload, color: PieceColor.DARK, legalMoves: [] });

    return room;
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
      this.applyClockForMove(room, color);
      const currentTurn = room.engine.getCurrentTurn();

      // Broadcast updated state, including the move that was just applied so
      // clients can animate it deterministically rather than diffing board states,
      // and the current clocks so they can display an accurate live countdown.
      this.server.to(roomId).emit('gameState', {
        board: room.engine.getBoard(),
        turn: currentTurn,
        move: exactLegalMove,
        clocks: room.clocks,
        turnStartedAt: room.turnStartedAt,
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
      } else if (room.engine.isDraw()) {
        this.handleGameOver(roomId, room, 'DRAW', room.engine.getDrawReason() ?? undefined);
      } else {
        this.scheduleFlagFall(roomId, room);
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
          this.applyClockForMove(room, room.aiColor!);
          const newTurn = room.engine.getCurrentTurn();

          this.server.to(roomId).emit('gameState', {
            board: room.engine.getBoard(),
            turn: newTurn,
            move: bestMove,
            clocks: room.clocks,
            turnStartedAt: room.turnStartedAt,
          });

          // Send legal moves back to human player
          if (room.players[PieceColor.LIGHT] && newTurn === PieceColor.LIGHT) {
             this.server.to(room.players[PieceColor.LIGHT]).emit('legalMoves', room.engine.getLegalMoves());
          }

          const winner = room.engine.getWinner();
          if (winner) {
            this.handleGameOver(roomId, room, winner);
          } else if (room.engine.isDraw()) {
            this.handleGameOver(roomId, room, 'DRAW', room.engine.getDrawReason() ?? undefined);
          } else if (newTurn === room.aiColor) {
            // Multi-jump scenarios: If the engine didn't switch turns, AI goes again
            this.triggerAiTurn(roomId, room);
          } else {
            this.scheduleFlagFall(roomId, room);
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

  private async handleGameOver(roomId: string, room: GameRoom, winner: PieceColor | 'DRAW', reason?: string) {
    this.clearRoomTimers(room);
    this.server.to(roomId).emit('gameOver', { winner, reason });

    // Save to database
    try {
       const savedGame = await this.historyService.saveGame(
          room.playerProfiles[PieceColor.LIGHT] || null,
          room.playerProfiles[PieceColor.DARK] || null,
          winner as 'L'|'D'|'DRAW',
          room.moves,
          room.rules
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
             const tournament = await this.tournamentsService.getTournament(room.tournamentId);
             if (tournament?.format === 'Swiss') {
                // Swiss owns scoring itself (see recordSwissPairingResult) — it also
                // records the pairing's result and checks whether the round (and
                // possibly the tournament) can now auto-advance, so this is the only
                // call needed for a Swiss game, unlike Arena below.
                const winnerUserId = winner === PieceColor.LIGHT ? p1.id : winner === PieceColor.DARK ? p2.id : null;
                await this.tournamentsService.recordSwissPairingResult(room.tournamentId, p1.id, p2.id, winnerUserId, savedGame.id);
             } else if (winner === PieceColor.LIGHT) {
                // Arena (unchanged): update tournament scores instead of raw ELO
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
            // Standard ELO Match using Chess.com-style formula
            // We fetch the fresh user objects because player profiles in memory might be outdated
            const freshP1 = await this.usersService.findOneById(p1.id);
            const freshP2 = await this.usersService.findOneById(p2.id);

            if (freshP1 && freshP2) {
              const r1 = freshP1.rating;
              const r2 = freshP2.rating;
              const gp1 = freshP1.gamesPlayed;
              const gp2 = freshP2.gamesPlayed;

              let p1Result: 'win' | 'loss' | 'draw' = 'draw';
              let p2Result: 'win' | 'loss' | 'draw' = 'draw';

              if (winner === PieceColor.LIGHT) {
                p1Result = 'win';
                p2Result = 'loss';
              } else if (winner === PieceColor.DARK) {
                p1Result = 'loss';
                p2Result = 'win';
              }

              const deltaP1 = this.usersService.calculateEloChange(r1, r2, p1Result, gp1);
              const deltaP2 = this.usersService.calculateEloChange(r2, r1, p2Result, gp2);

              await this.usersService.updateRating(p1.id, deltaP1, p1Result);
              await this.usersService.updateRating(p2.id, deltaP2, p2Result);
            }

            // Glicko-2, in its own per-(variant, time control) pool — see
            // rating.service.ts. Kept alongside the legacy single ELO field above
            // rather than replacing it, since /rankings and /users/stats already
            // read that field; reconciling the two is a follow-up, not this phase.
            const glickoResult = winner === PieceColor.LIGHT ? 'p1win' : winner === PieceColor.DARK ? 'p2win' : 'draw';
            await this.ratingService.recordGameResult(
              { userId: p1.id },
              { userId: p2.id },
              room.rules.variant ?? 'international',
              room.timeControl.name,
              glickoResult,
            );
          }
       }
    } catch(err) {
       console.error('Failed to save game history:', err);
    }

    const p1id = room.playerProfiles[PieceColor.LIGHT]?.id;
    const p2id = room.playerProfiles[PieceColor.DARK]?.id;
    if (p1id && this.userIdToRoom.get(p1id) === roomId) this.userIdToRoom.delete(p1id);
    if (p2id && this.userIdToRoom.get(p2id) === roomId) this.userIdToRoom.delete(p2id);

    // Also release the socket->room mapping for whichever sockets currently occupy
    // each seat (players[color] tracks the live socket id, which can differ from
    // whoever originally joined if they reconnected under a new one). Without this,
    // a player who stays connected across games — e.g. straight into their next
    // Swiss-tournament round — keeps a stale mapping to this now-deleted room,
    // which then trips "are they already in a room?" guards for their next pairing.
    const lightSocketId = room.players[PieceColor.LIGHT];
    const darkSocketId = room.players[PieceColor.DARK];
    if (lightSocketId && this.socketToRoom.get(lightSocketId) === roomId) this.socketToRoom.delete(lightSocketId);
    if (darkSocketId && this.socketToRoom.get(darkSocketId) === roomId) this.socketToRoom.delete(darkSocketId);

    this.activeGames.delete(roomId);
  }
}
