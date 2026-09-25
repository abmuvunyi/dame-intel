import { Worker } from 'worker_threads';
import { availableParallelism } from 'os';
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import type { BoardState, GameRules, Move, PieceColor } from '../../engine/engine.service';

// Phase 14: engine searches off the main event loop.
//
// Every AI search (vs-AI moves — up to 6s at difficulty 7 — plus post-game review,
// anti-cheat replay, puzzle generation and the /analysis endpoint) used to run
// synchronously on Node's single event loop. While one ran, EVERY other connected
// player's moves, clocks and chat froze. This pool runs them on worker threads.
//
// The AI only ever needs (rules, board, side to move) — AiService.searchRoot rebuilds
// its own engine from exactly those — so tasks are small, plain, structured-clonable
// messages.

export type EngineTask =
  | { op: 'bestMove'; rules: GameRules; board: BoardState; turn: PieceColor; difficulty: number }
  | { op: 'analyze'; rules: GameRules; board: BoardState; turn: PieceColor; depth: number };

export type EngineResult = Move | null | { move: Move; evaluation: number }[];

export type EnginePriority = 'interactive' | 'background';

interface Pending {
  id: number;
  task: EngineTask;
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

interface Slot {
  worker: Worker;
  busy: Pending | null;
}

const logger = new Logger('EngineWorkerPool');

export class EngineWorkerPool {
  private readonly slots: Slot[] = [];
  // Two FIFO queues: a player waiting on an AI move or an analysis request
  // ('interactive') always goes ahead of post-game review, anti-cheat replay and
  // puzzle generation ('background'), which nobody is actively waiting on.
  private readonly interactive: Pending[] = [];
  private readonly background: Pending[] = [];
  private nextId = 1;
  private closed = false;

  constructor(private readonly size: number, private readonly script: string) {
    for (let i = 0; i < size; i++) this.slots.push(this.spawn());
    logger.log(`Started ${size} engine worker thread(s)`);
  }

  get queueDepth(): number {
    return this.interactive.length + this.background.length;
  }

  get busyWorkers(): number {
    return this.slots.filter((s) => s.busy).length;
  }

  run<T extends EngineResult>(task: EngineTask, priority: EnginePriority = 'interactive'): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Engine worker pool is closed'));
    return new Promise<T>((resolve, reject) => {
      (priority === 'interactive' ? this.interactive : this.background).push({ id: this.nextId++, task, resolve, reject });
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const p of [...this.interactive.splice(0), ...this.background.splice(0)]) {
      p.reject(new Error('Engine worker pool closed'));
    }
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
  }

  private spawn(): Slot {
    const worker = new Worker(this.script);
    worker.unref(); // never keep the process alive on their own
    const slot: Slot = { worker, busy: null };

    worker.on('message', (msg: { id: number; result?: EngineResult; error?: string }) => {
      const job = slot.busy;
      slot.busy = null;
      if (job && job.id === msg.id) {
        if (msg.error) job.reject(new Error(msg.error));
        else job.resolve(msg.result);
      }
      this.dispatch();
    });

    const replace = (reason: string) => {
      const job = slot.busy;
      slot.busy = null;
      if (job) job.reject(new Error(`Engine worker failed: ${reason}`));
      if (this.closed) return;
      const idx = this.slots.indexOf(slot);
      if (idx >= 0) {
        logger.error(`Engine worker died (${reason}); replacing it`);
        this.slots[idx] = this.spawn();
        this.dispatch();
      }
    };
    worker.on('error', (err) => replace(err instanceof Error ? err.message : String(err)));
    worker.on('exit', (code) => {
      if (!this.closed && code !== 0) replace(`exit code ${code}`);
    });
    return slot;
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (this.queueDepth === 0) return;
      if (slot.busy) continue;
      const job = (this.interactive.shift() ?? this.background.shift())!;
      slot.busy = job;
      slot.worker.postMessage({ id: job.id, task: job.task });
    }
  }
}

let pool: EngineWorkerPool | null | undefined;

// Worker threads are used only when running compiled JavaScript (production /
// `npm run start`); under ts-jest the worker script doesn't exist as .js, so callers
// fall back to running the search inline, exactly as before. AI_WORKERS=0 also forces
// inline mode.
export function getEngineWorkerPool(): EngineWorkerPool | null {
  if (pool !== undefined) return pool;
  const script = join(__dirname, 'engine.worker.js');
  const configured = process.env.AI_WORKERS;
  const size = configured !== undefined && configured !== ''
    ? Math.max(0, Math.floor(Number(configured)) || 0)
    : Math.max(1, Math.min(4, availableParallelism() - 1));
  if (size === 0 || !__filename.endsWith('.js') || !existsSync(script)) {
    pool = null;
    return pool;
  }
  pool = new EngineWorkerPool(size, script);
  return pool;
}

export async function closeEngineWorkerPool(): Promise<void> {
  if (pool) await pool.close();
  pool = undefined;
}
