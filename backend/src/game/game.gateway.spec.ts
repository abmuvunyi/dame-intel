import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { AiService } from './ai/ai/ai.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { HistoryService } from '../history/history.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { AnticheatService } from '../anticheat/anticheat.service';
import { RatingService } from '../rating/rating.service';
import { PresenceService } from '../presence/presence.service';
import { GameReviewService } from './review/game-review.service';

// Minimal stand-in for socket.io's Server: just enough surface for the gateway's
// `this.server.to(...).emit(...)` and `this.server.sockets.sockets.get(...).join(...)`
// call chains to run without throwing, capturing what gets emitted so tests can inspect it.
function createMockServer() {
  const emitted: { room: string, event: string, payload: any }[] = [];
  return {
    emitted,
    to: (room: string) => ({
      emit: (event: string, payload: any) => emitted.push({ room, event, payload }),
    }),
    sockets: { sockets: { get: () => ({ join: () => {} }) } },
  };
}

describe('GameGateway', () => {
  let gateway: GameGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        AiService,
        PresenceService,
        { provide: GameReviewService, useValue: { analyzeCompletedGame: async () => {} } },
        { provide: JwtService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: HistoryService, useValue: {} },
        { provide: TournamentsService, useValue: {} },
        { provide: AnticheatService, useValue: {} },
        { provide: RatingService, useValue: {} },
      ],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
  });

  afterEach(() => {
    // Rooms schedule real flag-fall/disconnect-grace timers (see game.gateway.ts). Left
    // uncleared, a room created in one test keeps a real setTimeout alive for its full
    // time-control duration (minutes) — Jest's process won't exit until it fires, and it
    // fires after the test run has already reported results ("Cannot log after tests are
    // done"). Every test must leave the gateway's timers cleared, not just its assertions
    // satisfied.
    const games = (gateway as any).activeGames as Map<string, any> | undefined;
    games?.forEach(room => {
      if (room.flagTimer) clearTimeout(room.flagTimer);
      Object.values(room.disconnectTimers ?? {}).forEach((t: any) => t && clearTimeout(t));
    });
    (gateway as any).onModuleDestroy?.();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('vs-AI game creation resolves the requested variant correctly (Phase 3)', () => {
    it('creates a working 10x10 International game when requested', () => {
      const mockServer = createMockServer();
      (gateway as any).server = mockServer;

      gateway.handlePlayVsAi({ id: 'client-1' } as any, { difficulty: 1, rules: { boardSize: 10 } });

      const gameStart = mockServer.emitted.find(e => e.event === 'gameStart');
      expect(gameStart).toBeDefined();
      expect(gameStart!.payload.board).toHaveLength(10);
      expect(gameStart!.payload.legalMoves.length).toBeGreaterThan(0);

      // Internal room state should reflect the fully-resolved (not raw partial) rules.
      const room = (gateway as any).activeGames.get(gameStart!.payload.roomId);
      expect(room.rules.flyingKings).toBe(true);
      expect(room.rules.manCaptureBackward).toBe(true);
    });

    it('creates a working 8x8 American game with correct (non-flying-king) defaults when requested', () => {
      const mockServer = createMockServer();
      (gateway as any).server = mockServer;

      gateway.handlePlayVsAi({ id: 'client-2' } as any, { difficulty: 1, rules: { boardSize: 8 } });

      const gameStart = mockServer.emitted.find(e => e.event === 'gameStart');
      expect(gameStart!.payload.board).toHaveLength(8);

      const room = (gateway as any).activeGames.get(gameStart!.payload.roomId);
      // Regression check: this used to hardcode { boardSize: 8, forceMajorityCapture: true }
      // as the fallback default, which was wrong for the American variant.
      expect(room.rules.flyingKings).toBe(false);
      expect(room.rules.manCaptureBackward).toBe(false);
      expect(room.rules.forceMajorityCapture).toBe(false);
    });
  });
});

// `emitted`, when passed, records direct client.emit(...) calls in the same
// { room, event, payload } shape createMockServer() uses for server.to(room).emit(...)
// — some gateway code (e.g. the reconnect resync) emits straight to the client socket
// rather than through the server, and tests need to observe both call shapes uniformly.
function mockSocket(id: string, token?: string, emitted?: { room: string, event: string, payload: any }[]) {
  return {
    id,
    handshake: { auth: token ? { token } : {}, query: {} },
    join: () => {},
    emit: (event: string, payload?: any) => emitted?.push({ room: id, event, payload }),
  };
}

describe('GameGateway: matchmaking, clocks, and disconnect/reconnect (Phase 5)', () => {
  let gw: GameGateway;
  let mockServer: ReturnType<typeof createMockServer>;

  // A fake JWT/user layer: the "token" is just the user id as a string, and
  // findOneById looks it up from this fixed table — enough to exercise the real
  // handleConnection() auth path without a real database or JWT signing.
  const USERS: Record<number, any> = {
    1: { id: 1, username: 'alice', rating: 1200, passwordHash: 'x' },
    2: { id: 2, username: 'bob', rating: 1210, passwordHash: 'x' },
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        AiService,
        PresenceService,
        { provide: GameReviewService, useValue: { analyzeCompletedGame: async () => {} } },
        { provide: JwtService, useValue: { verifyAsync: async (token: string) => ({ sub: Number(token) }) } },
        {
          provide: UsersService,
          useValue: {
            findOneById: async (id: number) => USERS[id] ?? null,
            calculateEloChange: () => 0,
            updateRating: async () => {},
          },
        },
        { provide: HistoryService, useValue: { saveGame: async () => {} } },
        { provide: TournamentsService, useValue: {} },
        { provide: AnticheatService, useValue: { analyzeGameForCheating: async () => {} } },
        { provide: RatingService, useValue: { recordGameResult: async () => {} } },
      ],
    }).compile();

    gw = module.get<GameGateway>(GameGateway);
    mockServer = createMockServer();
    (gw as any).server = mockServer;
  });

  afterEach(() => {
    const games = (gw as any).activeGames as Map<string, any> | undefined;
    games?.forEach(room => {
      if (room.flagTimer) clearTimeout(room.flagTimer);
      Object.values(room.disconnectTimers ?? {}).forEach((t: any) => t && clearTimeout(t));
    });
    (gw as any).onModuleDestroy?.();
    jest.useRealTimers();
  });

  async function matchTwoPlayers() {
    await gw.handleConnection(mockSocket('p1', '1') as any);
    await gw.handleConnection(mockSocket('p2', '2') as any);
    gw.handleJoinMatchmaking(mockSocket('p1') as any, { rules: { boardSize: 8 } });
    gw.handleJoinMatchmaking(mockSocket('p2') as any, { rules: { boardSize: 8 } });
    const roomId = (gw as any).socketToRoom.get('p1');
    expect(roomId).toBeDefined(); // sanity: matchmaking actually paired them
    return roomId as string;
  }

  describe('matchmaking pairing wired end-to-end', () => {
    it('pairs two compatible waiting players into a real room via the gateway', async () => {
      const roomId = await matchTwoPlayers();
      const room = (gw as any).activeGames.get(roomId);
      expect(room.players['L']).toBe('p1');
      expect(room.players['D']).toBe('p2');
      expect(room.rules.boardSize).toBe(8);
    });
  });

  describe('server-authoritative clocks', () => {
    it('starts both clocks at the requested time control and schedules a flag-fall timer', async () => {
      const roomId = await matchTwoPlayers();
      const room = (gw as any).activeGames.get(roomId);
      expect(room.clocks.L).toBe(300); // blitz default
      expect(room.clocks.D).toBe(300);
      expect(room.flagTimer).toBeDefined();
    });

    it('declares the opponent the winner if a player lets their clock run out (flag-fall)', async () => {
      const roomId = await matchTwoPlayers();
      await jest.advanceTimersByTimeAsync(300_001); // past Light's full blitz allotment
      expect((gw as any).activeGames.get(roomId)).toBeUndefined();
      const gameOver = mockServer.emitted.find((e: any) => e.event === 'gameOver');
      expect(gameOver?.payload.winner).toBe('D');
      expect(gameOver?.payload.reason).toBe('flag-fall');
    });
  });

  describe('disconnect grace period and reconnect/resync', () => {
    it('keeps the game alive and notifies the opponent on disconnect, without declaring a winner immediately', async () => {
      const roomId = await matchTwoPlayers();
      mockServer.emitted.length = 0;

      gw.handleDisconnect(mockSocket('p1') as any);

      expect((gw as any).activeGames.get(roomId)).toBeDefined(); // NOT torn down
      expect(mockServer.emitted.some((e: any) => e.event === 'opponentDisconnected' && e.payload.color === 'L')).toBe(true);
      expect(mockServer.emitted.some((e: any) => e.event === 'gameOver')).toBe(false);
    });

    it('resyncs full game state to a reconnecting player under a brand-new socket id', async () => {
      const roomId = await matchTwoPlayers();
      gw.handleDisconnect(mockSocket('p1') as any);
      mockServer.emitted.length = 0;

      await gw.handleConnection(mockSocket('p1-new', '1', mockServer.emitted) as any);

      const resync = mockServer.emitted.find((e: any) => e.room === 'p1-new' && e.event === 'gameResync');
      expect(resync).toBeDefined();
      expect(resync!.payload.roomId).toBe(roomId);
      expect(resync!.payload.color).toBe('L');
      expect(resync!.payload.board).toBeDefined();
      expect(resync!.payload.clocks).toBeDefined();

      expect(mockServer.emitted.some((e: any) => e.event === 'opponentReconnected')).toBe(true);

      const room = (gw as any).activeGames.get(roomId);
      expect(room.players.L).toBe('p1-new'); // seat updated to the new socket
      expect(room.disconnectTimers.L).toBeUndefined(); // grace timer cancelled
    });

    it('declares the opponent the winner by abandonment if the grace period expires with no reconnect', async () => {
      const roomId = await matchTwoPlayers();
      gw.handleDisconnect(mockSocket('p1') as any);
      expect((gw as any).activeGames.get(roomId)).toBeDefined();

      await jest.advanceTimersByTimeAsync(60_001); // past the 60s grace period

      expect((gw as any).activeGames.get(roomId)).toBeUndefined();
      const gameOver = mockServer.emitted.find((e: any) => e.event === 'gameOver');
      expect(gameOver?.payload.winner).toBe('D');
      expect(gameOver?.payload.reason).toBe('abandonment');
    });

    it('does not resurrect the game if the player reconnects after the grace period already expired', async () => {
      const roomId = await matchTwoPlayers();
      gw.handleDisconnect(mockSocket('p1') as any);
      await jest.advanceTimersByTimeAsync(60_001);
      expect((gw as any).activeGames.get(roomId)).toBeUndefined();

      mockServer.emitted.length = 0;
      await gw.handleConnection(mockSocket('p1-later', '1', mockServer.emitted) as any);

      expect(mockServer.emitted.some((e: any) => e.event === 'gameResync')).toBe(false);
    });
  });

  // Regression: discovered during Phase 8 live verification. Two players staying
  // connected straight through from one game into the next (e.g. consecutive Swiss
  // rounds) got permanently stuck seeing 'waitingForOpponent' — socketToRoom kept
  // pointing both sockets at the now-deleted room because handleGameOver never
  // released it (only handleDisconnect did). Swiss's "are they already seated
  // somewhere?" guard in tryJoinSwissPairing then always refused to re-pair them.
  describe('post-game cleanup releases the socket->room mapping (Phase 8 regression)', () => {
    it('lets both players be matched into a brand-new room immediately after a resignation, without disconnecting first', async () => {
      const roomId = await matchTwoPlayers();

      // handleGameOver is async (it awaits saveGame, rating lookups, etc.) but
      // handleResignGame fires it without awaiting, so call the private method
      // directly here and await it, rather than racing its internal microtasks.
      const room = (gw as any).activeGames.get(roomId);
      await (gw as any).handleGameOver(roomId, room, 'D', 'resignation');

      expect((gw as any).socketToRoom.get('p1')).toBeUndefined();
      expect((gw as any).socketToRoom.get('p2')).toBeUndefined();

      // Same socket ids, still "connected", queue up again for a fresh game.
      gw.handleJoinMatchmaking(mockSocket('p1') as any, { rules: { boardSize: 8 } });
      gw.handleJoinMatchmaking(mockSocket('p2') as any, { rules: { boardSize: 8 } });

      const newRoomId = (gw as any).socketToRoom.get('p1');
      expect(newRoomId).toBeDefined();
      expect(newRoomId).not.toBe(roomId);
      expect((gw as any).activeGames.get(newRoomId).players['L']).toBe('p1');
    });
  });
});

describe('GameGateway: Swiss games use the organizer\'s tournament settings, not the client\'s (Phase 8b)', () => {
  let gw: GameGateway;
  let mockServer: ReturnType<typeof createMockServer>;

  const USERS: Record<number, any> = {
    1: { id: 1, username: 'alice', rating: 1200, passwordHash: 'x' },
    2: { id: 2, username: 'bob', rating: 1210, passwordHash: 'x' },
  };

  // A Swiss tournament the organizer deliberately configured to something OTHER than
  // the platform defaults (10x10 international / blitz), so a test that asserts the
  // resulting game used these values can't pass by accident just because they happen
  // to match what a client would have requested anyway.
  const TOURNAMENT = {
    id: 42,
    format: 'Swiss',
    boardSize: 8,
    ruleVariant: 'american',
    timeControlName: 'rapid',
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        AiService,
        PresenceService,
        { provide: GameReviewService, useValue: { analyzeCompletedGame: async () => {} } },
        { provide: JwtService, useValue: { verifyAsync: async (token: string) => ({ sub: Number(token) }) } },
        { provide: UsersService, useValue: { findOneById: async (id: number) => USERS[id] ?? null } },
        { provide: HistoryService, useValue: { saveGame: async () => ({ id: 1 }) } },
        {
          provide: TournamentsService,
          useValue: {
            getTournament: async (id: number) => (id === TOURNAMENT.id ? TOURNAMENT : null),
            findSwissOpponent: async (_tournamentId: number, userId: number) => (userId === 1 ? 2 : userId === 2 ? 1 : null),
            recordSwissPairingResult: async () => {},
          },
        },
        { provide: AnticheatService, useValue: { analyzeGameForCheating: async () => {} } },
        { provide: RatingService, useValue: { recordGameResult: async () => {} } },
      ],
    }).compile();

    gw = module.get<GameGateway>(GameGateway);
    mockServer = createMockServer();
    (gw as any).server = mockServer;
  });

  afterEach(() => {
    const games = (gw as any).activeGames as Map<string, any> | undefined;
    games?.forEach(room => {
      if (room.flagTimer) clearTimeout(room.flagTimer);
      Object.values(room.disconnectTimers ?? {}).forEach((t: any) => t && clearTimeout(t));
    });
    (gw as any).onModuleDestroy?.();
    jest.useRealTimers();
  });

  it('ignores a client-requested board/time control for a Swiss game and uses the tournament\'s own settings instead', async () => {
    await gw.handleConnection(mockSocket('p1', '1') as any);
    await gw.handleConnection(mockSocket('p2', '2') as any);

    // Both request something deliberately different from TOURNAMENT's configuration —
    // 10x10 international / bullet — to prove these get ignored for a Swiss game.
    const request = { tournamentId: TOURNAMENT.id, rules: { boardSize: 10, variant: 'international' as const }, timeControl: 'bullet' };
    await gw.handleJoinMatchmaking(mockSocket('p1') as any, request);
    await gw.handleJoinMatchmaking(mockSocket('p2') as any, request);

    const gameStart = mockServer.emitted.find((e: any) => e.event === 'gameStart');
    expect(gameStart).toBeDefined();

    const roomId = (gw as any).socketToRoom.get('p1');
    const room = (gw as any).activeGames.get(roomId);
    expect(room.rules.boardSize).toBe(TOURNAMENT.boardSize); // 8, not the requested 10
    expect(room.rules.variant).toBe(TOURNAMENT.ruleVariant); // 'american', not 'international'
    expect(room.timeControl.name).toBe(TOURNAMENT.timeControlName); // 'rapid', not 'bullet'
    expect(room.tournamentId).toBe(TOURNAMENT.id);
  });

  it('does not fall through to the generic matchmaking queue for a Swiss tournament', async () => {
    await gw.handleConnection(mockSocket('p1', '1') as any);
    // waitingForOpponent is emitted straight to the client socket (client.emit), not
    // through the mock server's to()/emit() — pass `emitted` so mockSocket records it.
    await gw.handleJoinMatchmaking(mockSocket('p1', undefined, mockServer.emitted) as any, { tournamentId: TOURNAMENT.id });

    // Opponent (user 2) isn't connected yet, so p1 should be told to wait — NOT be
    // pushed onto the generic rating-band queue (which would risk them being matched
    // against a random non-Swiss player).
    expect((gw as any).waitingPlayers.find((p: any) => p.id === 'p1')).toBeUndefined();
    expect(mockServer.emitted.some((e: any) => e.room === 'p1' && e.event === 'waitingForOpponent')).toBe(true);
  });
});

describe('GameGateway: live games dashboard and spectator mode (Phase 9)', () => {
  let gw: GameGateway;
  let mockServer: ReturnType<typeof createMockServer>;

  // Ratings kept within matchmaking.ts's INITIAL_BAND (100) so they pair immediately,
  // same as every other matchTwoPlayers()-style helper in this file — but still
  // distinct values, so the getActiveGames test can tell player1Rating and
  // player2Rating apart rather than both accidentally being the same number.
  const USERS: Record<number, any> = {
    1: { id: 1, username: 'alice', rating: 1450, passwordHash: 'x' },
    2: { id: 2, username: 'bob', rating: 1500, passwordHash: 'x' },
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        AiService,
        PresenceService,
        { provide: GameReviewService, useValue: { analyzeCompletedGame: async () => {} } },
        { provide: JwtService, useValue: { verifyAsync: async (token: string) => ({ sub: Number(token) }) } },
        { provide: UsersService, useValue: { findOneById: async (id: number) => USERS[id] ?? null } },
        { provide: HistoryService, useValue: { saveGame: async () => ({ id: 1 }) } },
        { provide: TournamentsService, useValue: {} },
        { provide: AnticheatService, useValue: { analyzeGameForCheating: async () => {} } },
        { provide: RatingService, useValue: { recordGameResult: async () => {} } },
      ],
    }).compile();

    gw = module.get<GameGateway>(GameGateway);
    mockServer = createMockServer();
    (gw as any).server = mockServer;
  });

  afterEach(() => {
    const games = (gw as any).activeGames as Map<string, any> | undefined;
    games?.forEach(room => {
      if (room.flagTimer) clearTimeout(room.flagTimer);
      Object.values(room.disconnectTimers ?? {}).forEach((t: any) => t && clearTimeout(t));
    });
    (gw as any).onModuleDestroy?.();
    jest.useRealTimers();
  });

  async function matchTwoPlayers(rules: any = { boardSize: 10, variant: 'international' }, timeControl = 'rapid') {
    await gw.handleConnection(mockSocket('p1', '1') as any);
    await gw.handleConnection(mockSocket('p2', '2') as any);
    await gw.handleJoinMatchmaking(mockSocket('p1') as any, { rules, timeControl });
    await gw.handleJoinMatchmaking(mockSocket('p2') as any, { rules, timeControl });
    const roomId = (gw as any).socketToRoom.get('p1');
    expect(roomId).toBeDefined();
    return roomId as string;
  }

  describe('live games dashboard (getActiveGames)', () => {
    it('lists an active game with both players\' usernames, ratings, variant, board size, and time control', async () => {
      await matchTwoPlayers({ boardSize: 10, variant: 'international' }, 'rapid');
      const emitted: any[] = [];
      gw.handleGetActiveGames(mockSocket('viewer', undefined, emitted) as any);

      const list = emitted.find(e => e.event === 'activeGamesList')?.payload;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        player1: 'alice',
        player1Rating: 1450,
        player2: 'bob',
        player2Rating: 1500,
        variant: 'international',
        boardSize: 10,
        timeControl: 'rapid',
        isVsAi: false,
        spectatorsCount: 0,
      });
    });

    it('reflects the current spectator count', async () => {
      const roomId = await matchTwoPlayers();
      gw.handleJoinSpectator(mockSocket('watcher1') as any, { roomId });
      gw.handleJoinSpectator(mockSocket('watcher2') as any, { roomId });

      const emitted: any[] = [];
      gw.handleGetActiveGames(mockSocket('viewer', undefined, emitted) as any);
      expect(emitted.find(e => e.event === 'activeGamesList')?.payload[0].spectatorsCount).toBe(2);
    });
  });

  describe('spectating is read-only and receives the live broadcast channel', () => {
    it('sends a spectator the current position with no color and no legal moves to submit', async () => {
      const roomId = await matchTwoPlayers();
      const emitted: any[] = [];
      gw.handleJoinSpectator(mockSocket('watcher', undefined, emitted) as any, { roomId });

      const gameStart = emitted.find(e => e.event === 'gameStart')?.payload;
      expect(gameStart).toBeDefined();
      expect(gameStart.color).toBeNull();
      expect(gameStart.legalMoves).toEqual([]);
      expect(gameStart.board).toBeDefined();
      expect(gameStart.roomId).toBe(roomId);
    });

    it('joins the same broadcast room the players are in, so it receives the same server.to(roomId) events', async () => {
      const roomId = await matchTwoPlayers();
      gw.handleJoinSpectator(mockSocket('watcher') as any, { roomId });
      expect((gw as any).socketToRoom.get('watcher')).toBe(roomId);

      const room = (gw as any).activeGames.get(roomId);
      expect(room.spectators).toContain('watcher');
    });

    it('rejects a move submitted by a spectator and leaves the game state completely unchanged', async () => {
      const roomId = await matchTwoPlayers();
      gw.handleJoinSpectator(mockSocket('watcher') as any, { roomId });
      const room = (gw as any).activeGames.get(roomId);
      const boardBefore = JSON.stringify(room.engine.getBoard());
      const movesBefore = room.moves.length;

      const legalMove = room.engine.getLegalMoves()[0];
      const result = gw.handleMakeMove(mockSocket('watcher') as any, legalMove);

      expect(result).toEqual({ error: 'Not a player in this game' });
      expect(JSON.stringify(room.engine.getBoard())).toBe(boardBefore); // engine state untouched
      expect(room.moves.length).toBe(movesBefore); // nothing recorded
    });

    // Regression, found while verifying this phase: handleJoinSpectator broadcasts an
    // updated count on arrival, but nothing broadcast an updated count on departure —
    // room.spectators shrank correctly, the count everyone was shown just never
    // reflected it. Fixed in handleDisconnect.
    it('broadcasts an updated spectator count when a spectator disconnects, not just when one joins', async () => {
      const roomId = await matchTwoPlayers();
      gw.handleJoinSpectator(mockSocket('watcher1') as any, { roomId });
      gw.handleJoinSpectator(mockSocket('watcher2') as any, { roomId });
      mockServer.emitted.length = 0;

      gw.handleDisconnect(mockSocket('watcher1') as any);

      const room = (gw as any).activeGames.get(roomId);
      expect(room.spectators).toEqual(['watcher2']);
      const update = mockServer.emitted.find((e: any) => e.event === 'spectatorJoined');
      expect(update?.payload.count).toBe(1); // not still 2
    });

    it('does not treat a departing spectator as a player leaving (game stays live, no winner declared)', async () => {
      const roomId = await matchTwoPlayers();
      gw.handleJoinSpectator(mockSocket('watcher') as any, { roomId });
      mockServer.emitted.length = 0;

      gw.handleDisconnect(mockSocket('watcher') as any);

      expect((gw as any).activeGames.get(roomId)).toBeDefined();
      expect(mockServer.emitted.some((e: any) => e.event === 'gameOver')).toBe(false);
      expect(mockServer.emitted.some((e: any) => e.event === 'opponentDisconnected')).toBe(false);
    });
  });
});

describe('GameGateway: presence tracking and chat moderation (Phase 10)', () => {
  let gw: GameGateway;
  let mockServer: ReturnType<typeof createMockServer>;
  let presenceService: PresenceService;

  const USERS: Record<number, any> = {
    1: { id: 1, username: 'alice', rating: 1200, passwordHash: 'x' },
    2: { id: 2, username: 'bob', rating: 1210, passwordHash: 'x' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        AiService,
        PresenceService,
        { provide: GameReviewService, useValue: { analyzeCompletedGame: async () => {} } },
        { provide: JwtService, useValue: { verifyAsync: async (token: string) => ({ sub: Number(token) }) } },
        { provide: UsersService, useValue: { findOneById: async (id: number) => USERS[id] ?? null } },
        { provide: HistoryService, useValue: { saveGame: async () => ({ id: 1 }) } },
        { provide: TournamentsService, useValue: {} },
        { provide: AnticheatService, useValue: { analyzeGameForCheating: async () => {} } },
        { provide: RatingService, useValue: { recordGameResult: async () => {} } },
      ],
    }).compile();

    gw = module.get<GameGateway>(GameGateway);
    presenceService = module.get<PresenceService>(PresenceService);
    mockServer = createMockServer();
    (gw as any).server = mockServer;
  });

  afterEach(() => {
    const games = (gw as any).activeGames as Map<string, any> | undefined;
    games?.forEach(room => {
      if (room.flagTimer) clearTimeout(room.flagTimer);
      Object.values(room.disconnectTimers ?? {}).forEach((t: any) => t && clearTimeout(t));
    });
    (gw as any).onModuleDestroy?.();
  });

  describe('presence (online-status for the friends list)', () => {
    it('marks an authenticated user online on connect and offline on disconnect', async () => {
      expect(presenceService.isOnline(1)).toBe(false);

      await gw.handleConnection(mockSocket('p1', '1') as any);
      expect(presenceService.isOnline(1)).toBe(true);

      gw.handleDisconnect(mockSocket('p1') as any);
      expect(presenceService.isOnline(1)).toBe(false);
    });

    it('never marks a user online for an anonymous (unauthenticated) connection', async () => {
      await gw.handleConnection(mockSocket('anon') as any); // no token
      expect(presenceService.getOnlineUserIds()).toEqual([]);
    });

    it('does not flicker a user offline if they already reconnected under a new socket', async () => {
      await gw.handleConnection(mockSocket('p1-old', '1') as any);
      await gw.handleConnection(mockSocket('p1-new', '1') as any); // reconnect before the old socket's disconnect fires
      expect(presenceService.isOnline(1)).toBe(true);

      gw.handleDisconnect(mockSocket('p1-old') as any); // stale disconnect event arrives late
      expect(presenceService.isOnline(1)).toBe(true); // still online — the new socket is the current one
    });
  });

  describe('chat: profanity filtering and spam rate-limiting', () => {
    async function setUpRoom() {
      await gw.handleConnection(mockSocket('p1', '1') as any);
      await gw.handleConnection(mockSocket('p2', '2') as any);
      gw.handleJoinMatchmaking(mockSocket('p1') as any, { rules: { boardSize: 8 } });
      gw.handleJoinMatchmaking(mockSocket('p2') as any, { rules: { boardSize: 8 } });
      const roomId = (gw as any).socketToRoom.get('p1');
      (gw as any).activeGames.get(roomId)?.flagTimer && clearTimeout((gw as any).activeGames.get(roomId).flagTimer);
      return roomId as string;
    }

    it('censors a profane word before broadcasting it, but still delivers the message', async () => {
      const roomId = await setUpRoom();
      gw.handleSendMessage(mockSocket('p1') as any, { roomId, message: 'this move is shit' });

      const received = mockServer.emitted.find((e: any) => e.event === 'receiveMessage');
      expect(received?.payload.message).toBe('this move is ****');
      expect(received?.payload.sender).toBe('alice');
    });

    it('leaves a clean message completely unmodified', async () => {
      const roomId = await setUpRoom();
      gw.handleSendMessage(mockSocket('p1') as any, { roomId, message: 'good game!' });

      const received = mockServer.emitted.find((e: any) => e.event === 'receiveMessage');
      expect(received?.payload.message).toBe('good game!');
    });

    it('blocks a sender after too many messages in a short window, and does not broadcast the blocked one', async () => {
      const roomId = await setUpRoom();
      const emitted: { room: string, event: string, payload: any }[] = [];

      for (let i = 0; i < 5; i++) {
        gw.handleSendMessage(mockSocket('p1', undefined, emitted) as any, { roomId, message: `message ${i}` });
      }
      mockServer.emitted.length = 0; // only care about what happens on the NEXT (6th) attempt
      gw.handleSendMessage(mockSocket('p1', undefined, emitted) as any, { roomId, message: 'one too many' });

      expect(mockServer.emitted.some((e: any) => e.event === 'receiveMessage')).toBe(false); // never broadcast
      expect(emitted.some(e => e.event === 'chatError')).toBe(true); // sender told why
    });

    it('does not rate-limit two different senders independently of each other', async () => {
      const roomId = await setUpRoom();
      for (let i = 0; i < 5; i++) {
        gw.handleSendMessage(mockSocket('p1') as any, { roomId, message: `spam ${i}` });
      }
      mockServer.emitted.length = 0;

      // p1 is now rate-limited, but p2 hasn't sent anything yet — their first message
      // should go through normally.
      gw.handleSendMessage(mockSocket('p2') as any, { roomId, message: 'hello from bob' });
      const received = mockServer.emitted.find((e: any) => e.event === 'receiveMessage');
      expect(received?.payload.sender).toBe('bob');
      expect(received?.payload.message).toBe('hello from bob');
    });

    it('ignores an empty or whitespace-only message rather than broadcasting it', async () => {
      const roomId = await setUpRoom();
      gw.handleSendMessage(mockSocket('p1') as any, { roomId, message: '   ' });
      expect(mockServer.emitted.some((e: any) => e.event === 'receiveMessage')).toBe(false);
    });
  });
});

describe('GameGateway: post-game review trigger (Phase 11)', () => {
  let gw: GameGateway;
  let mockServer: ReturnType<typeof createMockServer>;
  let analyzeCompletedGame: jest.Mock;

  const USERS: Record<number, any> = {
    1: { id: 1, username: 'alice', rating: 1200, passwordHash: 'x' },
    2: { id: 2, username: 'bob', rating: 1210, passwordHash: 'x' },
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    analyzeCompletedGame = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameGateway,
        AiService,
        PresenceService,
        { provide: GameReviewService, useValue: { analyzeCompletedGame } },
        { provide: JwtService, useValue: { verifyAsync: async (token: string) => ({ sub: Number(token) }) } },
        { provide: UsersService, useValue: { findOneById: async (id: number) => USERS[id] ?? null } },
        { provide: HistoryService, useValue: { saveGame: async () => ({ id: 4242 }) } },
        { provide: TournamentsService, useValue: {} },
        { provide: AnticheatService, useValue: { analyzeGameForCheating: async () => {} } },
        { provide: RatingService, useValue: { recordGameResult: async () => {} } },
      ],
    }).compile();

    gw = module.get<GameGateway>(GameGateway);
    mockServer = createMockServer();
    (gw as any).server = mockServer;
  });

  afterEach(() => {
    const games = (gw as any).activeGames as Map<string, any> | undefined;
    games?.forEach(room => {
      if (room.flagTimer) clearTimeout(room.flagTimer);
      Object.values(room.disconnectTimers ?? {}).forEach((t: any) => t && clearTimeout(t));
    });
    (gw as any).onModuleDestroy?.();
    jest.useRealTimers();
  });

  it('fires analyzeCompletedGame with the saved game\'s id when a real PvP game ends, without awaiting it', async () => {
    await gw.handleConnection(mockSocket('p1', '1') as any);
    await gw.handleConnection(mockSocket('p2', '2') as any);
    gw.handleJoinMatchmaking(mockSocket('p1') as any, { rules: { boardSize: 8 } });
    gw.handleJoinMatchmaking(mockSocket('p2') as any, { rules: { boardSize: 8 } });
    const roomId = (gw as any).socketToRoom.get('p1');

    const room = (gw as any).activeGames.get(roomId);
    await (gw as any).handleGameOver(roomId, room, 'D', 'resignation');

    expect(analyzeCompletedGame).toHaveBeenCalledWith(4242);
  });

  it('still triggers review for a vs-AI game, unlike anti-cheat which explicitly skips those', async () => {
    gw.handlePlayVsAi(mockSocket('p1', '1') as any, { difficulty: 1, rules: { boardSize: 8 } });
    const roomId = (gw as any).socketToRoom.get('p1');
    const room = (gw as any).activeGames.get(roomId);

    await (gw as any).handleGameOver(roomId, room, 'L', 'resignation');

    expect(analyzeCompletedGame).toHaveBeenCalledWith(4242);
  });
});
