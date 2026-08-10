import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { AiService } from './ai/ai/ai.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { HistoryService } from '../history/history.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { AnticheatService } from '../anticheat/anticheat.service';
import { RatingService } from '../rating/rating.service';

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
});
