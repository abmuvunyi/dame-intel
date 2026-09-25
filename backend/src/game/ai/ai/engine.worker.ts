// Phase 14: engine worker thread entry point (see engine-worker-pool.ts). Runs the
// exact same AiService code the main thread used to run inline.
import { parentPort } from 'worker_threads';
import { AiService } from './ai.service';
import { DraughtsEngine } from '../../engine/engine.service';
import type { EngineTask } from './engine-worker-pool';

const ai = new AiService();

parentPort?.on('message', ({ id, task }: { id: number; task: EngineTask }) => {
  try {
    const engine = new DraughtsEngine(task.rules);
    engine.loadBoard(task.board, task.turn);
    const result = task.op === 'bestMove'
      ? ai.getBestMove(engine, task.difficulty)
      : ai.analyzePosition(engine, task.depth);
    parentPort!.postMessage({ id, result });
  } catch (err) {
    parentPort!.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
