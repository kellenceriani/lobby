const registerSocketHandlers = require('../socket/socketHandlers');
const {
  rooms,
  tallyResults,
  startFinalRound,
  endGame
} = require('../core/gameEngine');
const {
  clearPartyTelemetryLog,
  flushPartyTelemetry,
  getPartyTelemetryLogPath
} = require('../telemetry/partyTelemetry');

class FakeIo {
  constructor() {
    this.connectionHandler = null;
    this.emitted = [];
  }

  on(eventName, handler) {
    if (eventName === 'connection') {
      this.connectionHandler = handler;
    }
  }

  to(roomCode) {
    return {
      emit: (eventName, payload) => {
        this.emitted.push({ roomCode, eventName, payload });
      }
    };
  }

  connect(socketId) {
    if (!this.connectionHandler) {
      throw new Error('Socket handlers are not registered');
    }
    const socket = new FakeSocket(socketId);
    this.connectionHandler(socket);
    return socket;
  }
}

class FakeSocket {
  constructor(id) {
    this.id = id;
    this.data = {};
    this.handlers = {};
    this.serverEmits = [];
  }

  on(eventName, handler) {
    this.handlers[eventName] = handler;
  }

  emit(eventName, payload) {
    this.serverEmits.push({ eventName, payload });
  }

  join(roomCode) {
    this.data.room = roomCode;
  }

  async clientEmit(eventName, payload) {
    const handler = this.handlers[eventName];
    if (typeof handler !== 'function') {
      throw new Error(`No handler registered for ${eventName}`);
    }
    return handler(payload);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function runSampleFlow() {
  clearPartyTelemetryLog();

  const roomCode = 'P0BASE';
  if (rooms[roomCode]) {
    delete rooms[roomCode];
  }

  const io = new FakeIo();
  registerSocketHandlers(io);

  const host = io.connect('sock-host');
  const playerTwo = io.connect('sock-player-2');
  const playerThree = io.connect('sock-player-3');

  await host.clientEmit('joinRoom', { name: 'Host', room: roomCode, joinAsHost: true });
  await playerTwo.clientEmit('joinRoom', { name: 'Bravo', room: roomCode });
  await playerThree.clientEmit('joinRoom', { name: 'Charlie', room: roomCode });

  await playerTwo.clientEmit('disconnect', 'transport close');
  const playerTwoRejoin = io.connect('sock-player-2b');
  await playerTwoRejoin.clientEmit('joinRoom', { name: 'Bravo', room: roomCode });

  await host.clientEmit('toggleReady');
  await playerTwoRejoin.clientEmit('toggleReady');
  await playerThree.clientEmit('toggleReady');

  await host.clientEmit('startGame');
  await wait(60);

  await tallyResults(io, roomCode);
  await startFinalRound(io, roomCode);
  await wait(60);
  await endGame(io, roomCode);

  await playerThree.clientEmit('disconnect', 'client namespace disconnect');
  await playerTwoRejoin.clientEmit('disconnect', 'client namespace disconnect');
  await host.clientEmit('disconnect', 'client namespace disconnect');

  await flushPartyTelemetry({ timeoutMs: 3000 });
  return {
    roomCode,
    emittedCount: io.emitted.length,
    logPath: getPartyTelemetryLogPath()
  };
}

async function main() {
  const summary = await runSampleFlow();
  console.log(
    `[Phase0 telemetry sample] room=${summary.roomCode} events=${summary.emittedCount} log=${summary.logPath}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[Phase0 telemetry sample] failed: ${String(error && error.message || error)}`);
    process.exit(1);
  });
