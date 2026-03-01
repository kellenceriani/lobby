const path = require('path');

process.env.ROUND4_EVAL_WATCHDOG_MS = process.env.ROUND4_EVAL_WATCHDOG_MS || '200';
process.env.ROUND4_TIMEOUT_FALLBACK_ENABLED = process.env.ROUND4_TIMEOUT_FALLBACK_ENABLED || 'true';
process.env.ROUND4_FINAL_LOCK_TIMEOUT_MS = process.env.ROUND4_FINAL_LOCK_TIMEOUT_MS || '300';
process.env.ROUND4_FINAL_AUTO_ADVANCE_GRACE_MS = process.env.ROUND4_FINAL_AUTO_ADVANCE_GRACE_MS || '200';

const round4ServicePath = path.join(__dirname, '..', 'services', 'round4Service.js');
require.cache[round4ServicePath] = {
  id: round4ServicePath,
  filename: round4ServicePath,
  loaded: true,
  exports: {
    evaluateRound4FromGame: async () => new Promise(() => {})
  }
};

const adaptiveTtsServicePath = path.join(__dirname, '..', 'services', 'adaptiveTtsService.js');
require.cache[adaptiveTtsServicePath] = {
  id: adaptiveTtsServicePath,
  filename: adaptiveTtsServicePath,
  loaded: true,
  exports: {
    prewarmAdaptiveNarratorVoiceCues: async () => ({ ok: true, warmed: 0 })
  }
};

const registerSocketHandlers = require('../socket/socketHandlers');
const { rooms } = require('../core/gameEngine');

class MockIO {
  constructor() {
    this.connectionHandler = null;
    this.roomEvents = [];
  }

  on(eventName, handler) {
    if (eventName === 'connection') {
      this.connectionHandler = handler;
    }
  }

  to(room) {
    return {
      emit: (eventName, payload) => {
        this.roomEvents.push({
          room,
          eventName,
          payload,
          atMs: Date.now()
        });
      }
    };
  }
}

class MockSocket {
  constructor(id) {
    this.id = id;
    this.data = {};
    this.handlers = new Map();
    this.selfEvents = [];
    this.rooms = new Set([id]);
  }

  on(eventName, handler) {
    this.handlers.set(eventName, handler);
  }

  emit(eventName, payload) {
    this.selfEvents.push({ eventName, payload, atMs: Date.now() });
  }

  join(room) {
    this.rooms.add(room);
  }

  async trigger(eventName, payload) {
    const handler = this.handlers.get(eventName);
    if (!handler) {
      throw new Error(`Missing handler for ${eventName}`);
    }
    return handler(payload);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function buildGameState() {
  return {
    activePhase: 'AI_EVALUATION',
    players: [
      {
        name: 'Host',
        isBot: false,
        finalTeam: ['Alpha', 'Bravo'],
        roundScores: [0, 0, 0, 0],
        totalScore: 20,
        fastestDraftLockMs: 13000
      },
      {
        name: 'P2',
        isBot: false,
        finalTeam: ['Charlie', 'Delta'],
        roundScores: [0, 0, 0, 0],
        totalScore: 18,
        fastestDraftLockMs: 15000
      }
    ],
    results: {},
    currentRound: 3,
    totalRounds: 4,
    round4Applied: false,
    round4InProgress: false,
    finalResultsReady: {},
    finalResultsEmitted: false,
    finalResultsGateStartedAtMs: 0,
    finalResultsFailSafeTimersArmed: false,
    currentScenario: 'Smoke scenario',
    currentTwist: 'NO PLOT TWIST',
    settings: { contentPackId: 'default' }
  };
}

async function run() {
  const io = new MockIO();
  registerSocketHandlers(io);

  if (typeof io.connectionHandler !== 'function') {
    throw new Error('Socket handlers did not register a connection callback');
  }

  const hostSocket = new MockSocket('socket-host');
  const p2Socket = new MockSocket('socket-p2');
  io.connectionHandler(hostSocket);
  io.connectionHandler(p2Socket);

  const room = 'S401';
  await hostSocket.trigger('joinRoom', { name: 'Host', room, joinAsHost: true });
  await p2Socket.trigger('joinRoom', { name: 'P2', room, joinAsHost: false });

  if (!rooms[room]) {
    throw new Error('Room not created during join flow');
  }

  rooms[room].isGameActive = true;
  rooms[room].gameState = buildGameState();

  const evalRequestedAtMs = Date.now();
  await hostSocket.trigger('evaluateRound4');

  let round4EvaluatedEvent = null;
  for (let i = 0; i < 80; i += 1) {
    round4EvaluatedEvent = io.roomEvents.find((entry) => entry.room === room && entry.eventName === 'round4Evaluated');
    if (round4EvaluatedEvent) break;
    await sleep(120);
  }
  const round4EvaluatedLatencyMs = round4EvaluatedEvent
    ? Math.max(0, Number(round4EvaluatedEvent.atMs) - evalRequestedAtMs)
    : null;
  const emergencyFallbackApplied = Boolean(
    rooms[room]
    && rooms[room].gameState
    && rooms[room].gameState.round4Results
    && rooms[room].gameState.round4Results.pointBreakdown
    && String((rooms[room].gameState.round4Results.pointBreakdown.Host || [])[0] || '').toLowerCase().includes('emergency fallback')
  );

  await hostSocket.trigger('requestFinalResults');
  await sleep(8600);

  const waitingEvents = io.roomEvents.filter((entry) => entry.room === room && entry.eventName === 'finalResultsWaiting');
  const finalRoundResultsEvent = io.roomEvents.find((entry) => entry.room === room && entry.eventName === 'finalRoundResults');

  const waitingHasTimeoutMetadata = waitingEvents.some((entry) => (
    entry
    && entry.payload
    && Number.isFinite(Number(entry.payload.timeoutMs))
    && Number.isFinite(Number(entry.payload.elapsedMs))
  ));

  const checks = [
    {
      id: 'C1',
      label: 'Round4 watchdog produced room-level round4Evaluated despite hung evaluator',
      pass: Boolean(round4EvaluatedEvent) && emergencyFallbackApplied
    },
    {
      id: 'C2',
      label: 'round4Evaluated latency was bounded by watchdog window (< 7000ms)',
      pass: Number.isFinite(round4EvaluatedLatencyMs) && round4EvaluatedLatencyMs < 7000,
      detail: Number.isFinite(round4EvaluatedLatencyMs) ? `${round4EvaluatedLatencyMs}ms` : 'n/a'
    },
    {
      id: 'C3',
      label: 'finalResultsWaiting payload includes timeout telemetry',
      pass: waitingHasTimeoutMetadata
    },
    {
      id: 'C4',
      label: 'Final-results fail-safe emitted finalRoundResults with only host ready',
      pass: Boolean(finalRoundResultsEvent)
    }
  ];

  const passed = checks.filter((item) => item.pass).length;
  const failed = checks.length - passed;

  console.log('Round4 Phase0/1 smoke checklist');
  checks.forEach((item) => {
    const marker = item.pass ? 'PASS' : 'FAIL';
    const suffix = item.detail ? ` (${item.detail})` : '';
    console.log(`- [${marker}] ${item.id} ${item.label}${suffix}`);
  });
  console.log(`Summary: ${passed}/${checks.length} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error('Smoke harness failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sleep(40);
    process.exit(process.exitCode || 0);
  });
