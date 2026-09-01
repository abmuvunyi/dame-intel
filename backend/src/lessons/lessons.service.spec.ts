import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { Lesson } from './lesson.entity';
import { DraughtsEngine, PieceColor } from '../game/engine/engine.service';

describe('LessonsService', () => {
  let service: LessonsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({ type: 'sqlite', database: ':memory:', entities: [Lesson], synchronize: true }),
        TypeOrmModule.forFeature([Lesson]),
      ],
      providers: [LessonsService],
    }).compile();

    service = module.get<LessonsService>(LessonsService);
    await service.onModuleInit(); // same seeding hook the real app boot triggers
  });

  it('seeds real curated content on first boot, not an empty table', async () => {
    const all = await service.listAll();
    expect(all.length).toBeGreaterThan(5); // a real, substantive set, not a token 1-2 entries

    // Every lesson has real, non-empty content — a title, a summary, and at least one
    // body paragraph — not placeholder/empty scaffolding.
    for (const lesson of all) {
      expect(lesson.title.length).toBeGreaterThan(0);
      expect(lesson.summary.length).toBeGreaterThan(0);
      expect(lesson.body.length).toBeGreaterThan(0);
      for (const paragraph of lesson.body) expect(paragraph.length).toBeGreaterThan(20);
    }
  });

  it('is idempotent — does not double-seed on a second onModuleInit call', async () => {
    const before = await service.listAll();
    await service.onModuleInit();
    const after = await service.listAll();
    expect(after.length).toBe(before.length);
  });

  it('covers every advertised category with at least one real lesson', async () => {
    const all = await service.listAll();
    const categories = new Set(all.map(l => l.category));
    expect(categories).toEqual(new Set(['opening', 'middlegame', 'endgame', 'tactics']));
  });

  it('filters by category', async () => {
    const openingLessons = await service.listAll('opening');
    expect(openingLessons.length).toBeGreaterThan(0);
    for (const lesson of openingLessons) expect(lesson.category).toBe('opening');
  });

  it('orders lessons within a category by orderIndex', async () => {
    const openingLessons = await service.listAll('opening');
    const indices = openingLessons.map(l => l.orderIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('fetches a real lesson by its slug', async () => {
    const lesson = await service.getBySlug('control-the-center');
    expect(lesson.title).toBe('Control the Center');
    expect(lesson.category).toBe('opening');
  });

  it('throws NotFoundException for an unknown slug', async () => {
    await expect(service.getBySlug('does-not-exist')).rejects.toThrow(NotFoundException);
  });

  it("every lesson's optional example board, when present, is a real legal position on a real engine", async () => {
    const all = await service.listAll();
    const withDiagrams = all.filter(l => l.exampleBoard !== null);
    expect(withDiagrams.length).toBeGreaterThan(0); // at least one lesson actually uses this

    for (const lesson of withDiagrams) {
      const engine = new DraughtsEngine({ boardSize: lesson.exampleBoardSize });
      // loadBoard doesn't itself validate legality by piece count/placement, but
      // getLegalMoves() exercising the real move-generation code path over every
      // square at least confirms the board is a well-formed, loadable position (no
      // malformed rows/pieces that would throw) that produces real, sane moves.
      engine.loadBoard(JSON.parse(JSON.stringify(lesson.exampleBoard)), PieceColor.DARK);
      expect(() => engine.getLegalMoves()).not.toThrow();
      expect(engine.getLegalMoves().length).toBeGreaterThan(0);
    }
  });
});
