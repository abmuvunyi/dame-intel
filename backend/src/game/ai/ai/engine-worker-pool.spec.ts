import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EngineWorkerPool } from './engine-worker-pool';
import { DraughtsEngine } from '../../engine/engine.service';

// Phase 14: the pool runs the REAL worker entry point (engine.worker.ts) on real
// worker threads — loaded through ts-node, since under jest there is no compiled .js.
describe('EngineWorkerPool (real worker threads)', () => {
  let pool: EngineWorkerPool;

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'engine-worker-'));
    const shim = join(dir, 'worker-shim.js');
    writeFileSync(
      shim,
      `require(${JSON.stringify(require.resolve('ts-node'))}).register({ transpileOnly: true, skipProject: true, compilerOptions: { module: 'commonjs', target: 'es2022', experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true } });\n` +
        `require(${JSON.stringify(join(__dirname, 'engine.worker.ts'))});\n`,
    );
    pool = new EngineWorkerPool(1, shim);
  });

  afterAll(async () => {
    await pool.close();
  });

  const task = (engine: DraughtsEngine) => ({ rules: engine.getRules(), board: engine.getBoard(), turn: engine.getCurrentTurn() });

  it('returns a legal best move computed on a worker thread', async () => {
    const engine = new DraughtsEngine({ boardSize: 8 });
    const move: any = await pool.run({ op: 'bestMove', ...task(engine), difficulty: 1 });
    const legal = engine.getLegalMoves();
    expect(legal.some((m) => m.from.row === move.from.row && m.from.col === move.from.col && m.to.row === move.to.row && m.to.col === move.to.col)).toBe(true);
  }, 60000);

  it('returns a best-first evaluation list for analyze', async () => {
    const engine = new DraughtsEngine({ boardSize: 10 });
    const evals: any = await pool.run({ op: 'analyze', ...task(engine), depth: 2 });
    expect(evals.length).toBe(engine.getLegalMoves().length);
    for (let i = 1; i < evals.length; i++) expect(evals[i - 1].evaluation).toBeGreaterThanOrEqual(evals[i].evaluation);
  }, 60000);

  it('runs interactive work ahead of queued background work', async () => {
    const engine = new DraughtsEngine({ boardSize: 10 });
    const order: string[] = [];
    const bg = [1, 2, 3].map((n) =>
      pool.run({ op: 'analyze', ...task(engine), depth: 3 }, 'background').then(() => order.push(`bg${n}`)),
    );
    const fg = pool.run({ op: 'bestMove', ...task(engine), difficulty: 1 }, 'interactive').then(() => order.push('fg'));
    await Promise.all([...bg, fg]);
    // bg1 was already running on the only worker; fg must come straight after it.
    expect(order.indexOf('fg')).toBeLessThanOrEqual(1);
  }, 60000);

  it('rejects a failing task without killing the pool', async () => {
    await expect(pool.run({ op: 'analyze', rules: null as any, board: null as any, turn: 'L' as any, depth: 1 })).rejects.toThrow();
    const engine = new DraughtsEngine({ boardSize: 8 });
    await expect(pool.run({ op: 'bestMove', ...task(engine), difficulty: 1 })).resolves.toBeTruthy();
  }, 60000);
});
