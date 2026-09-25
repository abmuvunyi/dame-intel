#!/usr/bin/env node
// Phase 14: WebSocket load test for the game gateway + matchmaking.
//
// Simulates N concurrent human-vs-human games (2N anonymous Socket.IO clients that
// go through real matchmaking and play random legal moves) plus M concurrent
// human-vs-AI games, while probing GET /health/live to measure how responsive the
// server's event loop stays under that load.
//
//   node scripts/loadtest.mjs --url http://localhost:3001 --pvp 50 --ai 10
//
// Options:
//   --url            backend base URL                       (default http://localhost:3001)
//   --pvp            concurrent human-vs-human games         (default 50)
//   --ai             concurrent human-vs-AI games            (default 0)
//   --ai-difficulty  AI level 1-7 for the vs-AI games        (default 4)
//   --board          8 or 10                                 (default 10)
//   --plies          max plies per game before resigning     (default 60)
//   --think          simulated human think time in ms (max)  (default 400)
//   --duration       hard stop in seconds                    (default 180)
//   --pid            backend process id, to sample its CPU/RSS (Linux only)
import { io } from 'socket.io-client';
import { readFileSync } from 'fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const URL = args.url ?? 'http://localhost:3001';
const PVP = Number(args.pvp ?? 50);
const AI = Number(args.ai ?? 0);
const AI_DIFFICULTY = Number(args['ai-difficulty'] ?? 4);
const BOARD = Number(args.board ?? 10);
const MAX_PLIES = Number(args.plies ?? 60);
const THINK = Number(args.think ?? 400);
const DURATION = Number(args.duration ?? 180);
const PID = args.pid ? Number(args.pid) : null;

const stats = {
  connected: 0, connectErrors: 0, gamesStarted: 0, gamesFinished: 0, resigned: 0,
  movesSent: 0, invalidMoves: 0, errors: 0,
  moveAckMs: [], aiReplyMs: [], healthMs: [], healthFailures: 0, cpu: [], rssMb: [],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};
const summary = (arr) => ({ n: arr.length, p50: pct(arr, 50), p95: pct(arr, 95), p99: pct(arr, 99), max: arr.length ? Math.round(Math.max(...arr)) : null });

function makeClient(kind) {
  return new Promise((resolve) => {
    const socket = io(URL, { transports: ['websocket'], reconnection: false, timeout: 20000 });
    const st = { socket, kind, color: null, plies: 0, pendingSince: null, aiPendingSince: null, done: false };

    socket.on('connect', () => { stats.connected++; resolve(st); });
    socket.on('connect_error', () => { stats.connectErrors++; st.done = true; resolve(st); });
    socket.on('error', () => { stats.errors++; });
    socket.on('invalidMove', () => { stats.invalidMoves++; });

    const maybeMove = (legalMoves) => {
      if (st.done || !legalMoves || legalMoves.length === 0) return;
      if (st.plies >= MAX_PLIES) {
        st.done = true; stats.resigned++;
        socket.emit('resignGame');
        return;
      }
      setTimeout(() => {
        if (st.done) return;
        const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        st.pendingSince = performance.now();
        stats.movesSent++;
        socket.emit('makeMove', move);
      }, Math.random() * THINK);
    };

    socket.on('gameStart', (data) => {
      st.color = data.color;
      stats.gamesStarted += st.color === 'L' ? 1 : 0; // count each game once
      maybeMove(data.legalMoves);
    });
    socket.on('gameState', (data) => {
      st.plies++;
      const now = performance.now();
      if (st.pendingSince !== null && data.move) {
        stats.moveAckMs.push(now - st.pendingSince);
        st.pendingSince = null;
        if (kind === 'ai') st.aiPendingSince = now;
      } else if (kind === 'ai' && st.aiPendingSince !== null) {
        stats.aiReplyMs.push(now - st.aiPendingSince);
        st.aiPendingSince = null;
      }
    });
    socket.on('legalMoves', (moves) => maybeMove(moves));
    socket.on('gameOver', () => {
      if (!st.done || st.color === 'L') stats.gamesFinished += st.color === 'L' ? 1 : 0;
      st.done = true;
    });
  });
}

async function probeHealth(stopAt) {
  while (Date.now() < stopAt) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${URL}/health/live`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) stats.healthFailures++;
      stats.healthMs.push(performance.now() - t0);
    } catch {
      stats.healthFailures++;
    }
    await sleep(250);
  }
}

function sampleProcess(stopAt) {
  if (!PID) return Promise.resolve();
  const hz = 100;
  let last = null;
  return new Promise((resolve) => {
    const iv = setInterval(() => {
      try {
        const stat = readFileSync(`/proc/${PID}/stat`, 'utf8').split(') ')[1].split(' ');
        const ticks = Number(stat[11]) + Number(stat[12]);
        const rssPages = Number(stat[21]);
        const now = Date.now();
        if (last) stats.cpu.push(((ticks - last.ticks) / hz) / ((now - last.t) / 1000) * 100);
        stats.rssMb.push((rssPages * 4096) / 1024 / 1024);
        last = { ticks, t: now };
      } catch { /* process gone */ }
      if (Date.now() >= stopAt) { clearInterval(iv); resolve(); }
    }, 1000);
  });
}

async function main() {
  const started = Date.now();
  const stopAt = started + DURATION * 1000;
  console.log(`Load test → ${URL}: ${PVP} PvP games (${PVP * 2} clients) + ${AI} vs-AI games (difficulty ${AI_DIFFICULTY}), ${BOARD}x${BOARD}, up to ${MAX_PLIES} plies`);

  const health = probeHealth(stopAt);
  const sampler = sampleProcess(stopAt);

  const clients = [];
  // Ramp up: connect in batches of 20 so the handshake burst is realistic.
  for (let i = 0; i < PVP * 2; i += 20) {
    const batch = await Promise.all(Array.from({ length: Math.min(20, PVP * 2 - i) }, () => makeClient('pvp')));
    clients.push(...batch);
    for (const c of batch) c.socket.emit('joinMatchmaking', { rules: { boardSize: BOARD }, timeControl: 'blitz' });
    await sleep(100);
  }
  for (let i = 0; i < AI; i++) {
    const c = await makeClient('ai');
    clients.push(c);
    c.socket.emit('playVsAi', { difficulty: AI_DIFFICULTY, rules: { boardSize: BOARD }, timeControl: 'rapid' });
  }

  while (Date.now() < stopAt && clients.some((c) => !c.done)) await sleep(500);
  const elapsed = (Date.now() - started) / 1000;
  for (const c of clients) c.socket.close();
  await Promise.race([Promise.all([health, sampler]), sleep(2000)]);

  const report = {
    elapsedSeconds: Math.round(elapsed),
    clients: { requested: PVP * 2 + AI, connected: stats.connected, connectErrors: stats.connectErrors },
    games: {
      pvpExpected: PVP, aiExpected: AI, started: stats.gamesStarted,
      finished: stats.gamesFinished, resignedAtPlyCap: stats.resigned,
      unfinishedAtStop: clients.filter((c) => !c.done && c.color === 'L').length,
    },
    moves: { sent: stats.movesSent, invalid: stats.invalidMoves, throughputPerSec: Math.round(stats.movesSent / elapsed) },
    latencyMs: {
      moveAck: summary(stats.moveAckMs),
      aiReply: summary(stats.aiReplyMs),
      healthProbe: summary(stats.healthMs),
    },
    healthProbeFailures: stats.healthFailures,
    serverErrorsEmitted: stats.errors,
    ...(PID ? {
      backendProcess: {
        cpuPercentAvg: Math.round(stats.cpu.reduce((a, b) => a + b, 0) / Math.max(1, stats.cpu.length)),
        cpuPercentMax: Math.round(Math.max(0, ...stats.cpu)),
        rssMbMax: Math.round(Math.max(0, ...stats.rssMb)),
      },
    } : {}),
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
