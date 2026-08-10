import { Test, TestingModule } from '@nestjs/testing';
import { GameGateway } from './game.gateway';
import { AiService } from './ai/ai/ai.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { HistoryService } from '../history/history.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { AnticheatService } from '../anticheat/anticheat.service';

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
        { provide: AnticheatService, useValue: {} }
      ],
    }).compile();

    gateway = module.get<GameGateway>(GameGateway);
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
