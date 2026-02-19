const {
  rooms,
  voteTimeouts,
  createRoom,
  startGame,
  startRound,
  startFinalRound,
  revealPlotTwist,
  tallyResults,
  getRandomWord,
  endGame,
  markRoomsDirty
} = require('../core/gameEngine');
const { evaluateRound4FromGame } = require('../services/round4Service');
const {
  sanitizeName,
  sanitizeRoomCode,
  sanitizeMessage,
  sanitizeReaction,
  sanitizeDraftCharacter,
  sanitizeSettings,
  createRateLimiter
} = require('./inputValidation');

const allowRequest = createRateLimiter();

function getRoomData(roomCode) {
  if (!roomCode) return null;
  return rooms[roomCode] || null;
}

function emitRoomData(io, roomCode, roomData) {
  io.to(roomCode).emit('roomData', {
    players: roomData.players,
    isGameActive: roomData.isGameActive,
    host: roomData.host,
    settings: roomData.settings,
    messages: roomData.messages
  });
}

function getJoinedRoom(socket) {
  const room = socket.data.room;
  const name = socket.data.name;
  if (!room || !name) return null;

  const roomData = getRoomData(room);
  if (!roomData) return null;

  return { room, name, roomData };
}

function getEligibleFinalPlayers(roomData, game) {
  if (!roomData || !game || !Array.isArray(game.players)) return [];
  const connectedNames = new Set((roomData.players || []).map((p) => p.name));
  return game.players
    .filter((player) => !player.isBot && connectedNames.has(player.name))
    .map((player) => player.name);
}

function emitFinalRoundResults(io, room, game) {
  if (!game || !game.round4Results) return false;
  if (game.finalResultsEmitted) return true;

  game.finalResultsEmitted = true;
  io.to(room).emit('finalRoundResults', {
    winner: game.round4Results.winner || null,
    isTie: game.round4Results.isTie === true,
    tiedPlayers: Array.isArray(game.round4Results.tiedPlayers) ? game.round4Results.tiedPlayers : [],
    roundPoints: game.round4Results.roundPoints,
    voteCount: {},
    leaderboard: game.round4Results.leaderboardData,
    pointBreakdown: game.round4Results.pointBreakdown
  });

  setTimeout(() => endGame(io, room), 3000);
  return true;
}

function updateFinalResultsWaiting(io, room, roomData, game) {
  if (!game || !game.round4Results || game.finalResultsEmitted) return;

  game.finalResultsReady = game.finalResultsReady || {};
  const eligiblePlayers = getEligibleFinalPlayers(roomData, game);
  const readyCount = eligiblePlayers.filter((playerName) => game.finalResultsReady[playerName] === true).length;

  io.to(room).emit('finalResultsWaiting', {
    readyCount,
    totalPlayers: eligiblePlayers.length
  });

  const allReady = eligiblePlayers.length > 0
    && eligiblePlayers.every((playerName) => game.finalResultsReady[playerName] === true);

  if (allReady) {
    emitFinalRoundResults(io, room, game);
  }
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRoom', (payload) => {
      if (!allowRequest(`${socket.id}:joinRoom`, 10000, 6)) {
        socket.emit('joinError', 'Too many join attempts. Please wait a moment.');
        return;
      }

      const name = sanitizeName(payload && payload.name);
      const room = sanitizeRoomCode(payload && payload.room);

      if (!name || !room) {
        socket.emit('joinError', 'Invalid name or room code format.');
        return;
      }

      if (!rooms[room]) {
        rooms[room] = createRoom(room);
        rooms[room].host = name;
      }

      const roomData = rooms[room];

      if (roomData.isGameActive && (!Array.isArray(roomData.players) || roomData.players.length === 0)) {
        roomData.isGameActive = false;
        roomData.gameState = null;
      }

      if (roomData.isGameActive) {
        socket.emit('joinError', 'Game already in progress. Try again next round!');
        return;
      }

      if (roomData.players.length >= roomData.settings.maxPlayers) {
        socket.emit('joinError', `Room is full (${roomData.settings.maxPlayers} player limit).`);
        return;
      }

      if (roomData.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        socket.emit('joinError', 'Name already taken in this room.');
        return;
      }

      roomData.players.push({
        id: socket.id,
        name,
        ready: false,
        reactions: []
      });

      socket.join(room);
      socket.data.room = room;
      socket.data.name = name;

      emitRoomData(io, room, roomData);
      markRoomsDirty();
      console.log(`${name} joined room ${room}`);
    });

    socket.on('updateSettings', (newSettings) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      if (roomData.host !== name || roomData.isGameActive) return;

      const cleaned = sanitizeSettings(newSettings);
      roomData.settings = { ...roomData.settings, ...cleaned };

      io.to(room).emit('settingsUpdated', roomData.settings);
      markRoomsDirty();
    });

    socket.on('toggleReady', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const player = roomData.players.find(p => p.name === name);
      if (!player) return;

      player.ready = !player.ready;
      emitRoomData(io, room, roomData);
      markRoomsDirty();
    });

    socket.on('readyForNextRound', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game) return;

      game.resultsReady = game.resultsReady || {};
      game.resultsReady[name] = true;

      const allReady = game.players.every(p => game.resultsReady[p.name] === true);
      if (!allReady) return;

      game.currentRound += 1;
      if (game.currentRound < game.totalRounds) {
        startRound(io, room);
      } else {
        startFinalRound(io, room);
      }
      markRoomsDirty();
    });

    socket.on('sendMessage', (rawMessage) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      if (!allowRequest(`${socket.id}:sendMessage`, 5000, 6)) {
        socket.emit('gameError', 'Slow down—message rate limit reached.');
        return;
      }

      const { room, name, roomData } = joined;
      const message = sanitizeMessage(rawMessage, 240);
      if (!message) return;

      const msg = { player: name, text: message, timestamp: Date.now() };
      roomData.messages.push(msg);
      if (roomData.messages.length > 50) roomData.messages.shift();

      io.to(room).emit('newMessage', msg);
      markRoomsDirty();
    });

    socket.on('sendReaction', (rawReaction) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      if (!allowRequest(`${socket.id}:sendReaction`, 5000, 10)) {
        return;
      }

      const { room, name, roomData } = joined;
      const reaction = sanitizeReaction(rawReaction);
      if (!reaction) return;

      const msg = { player: name, text: reaction, timestamp: Date.now(), isReaction: true };
      roomData.messages.push(msg);
      if (roomData.messages.length > 50) roomData.messages.shift();

      io.to(room).emit('newMessage', msg);
      markRoomsDirty();
    });

    socket.on('startGame', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;

      if (roomData.host !== name) {
        socket.emit('gameError', 'Only the host can start the game.');
        return;
      }

      if (roomData.players.length < 3) {
        socket.emit('gameError', 'Need at least 3 players to start.');
        return;
      }

      const readyCount = roomData.players.filter(p => p.ready).length;
      if (readyCount < 3 || readyCount !== roomData.players.length) {
        socket.emit('gameError', 'All players must be ready to start.');
        return;
      }

      startGame(io, room);
      markRoomsDirty();
    });

    socket.on('draftCharacter', (rawCharacter) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      if (!allowRequest(`${socket.id}:draftCharacter`, 10000, 20)) {
        socket.emit('draftError', 'Too many draft submissions.');
        return;
      }

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'DRAFT') return;

      const player = game.players.find(p => p.name === name);
      if (!player) return;

      if (player.draftLocked) {
        socket.emit('draftError', 'You have already locked in your team!');
        return;
      }

      const character = sanitizeDraftCharacter(rawCharacter);
      if (!character) return;

      const charNormalized = character.toLowerCase();
      const isDuplicateOwn = player.team.some(c => c.toLowerCase() === charNormalized);
      const isDuplicateOther = game.players.some(p =>
        p.name !== name && p.team.some(c => c.toLowerCase() === charNormalized)
      );
      const isDuplicateAcrossRounds = game.allCharactersDrafted.some(c => c.toLowerCase() === charNormalized);

      let finalCharacter = character;
      let autoFilled = false;

      if (isDuplicateOwn || isDuplicateOther || isDuplicateAcrossRounds) {
        let randomWord = getRandomWord();
        while (game.players.some(p => p.team.some(c => c.toLowerCase() === randomWord.toLowerCase())) ||
               game.allCharactersDrafted.some(c => c.toLowerCase() === randomWord.toLowerCase())) {
          randomWord = getRandomWord();
        }
        finalCharacter = randomWord;
        autoFilled = true;
      }

      player.team.push(finalCharacter);
      player.teamAutoFilled.push(autoFilled);
      game.allCharactersDrafted.push(finalCharacter);

      const pickNumberInRound = player.team.length;
      const globalDraftOrder = game.allCharactersDrafted.length;
      const draftedAtMs = Math.max(0, Date.now() - (game.roundStartTime || Date.now()));

      if (!game.draftEntries[name]) {
        game.draftEntries[name] = [];
      }
      game.draftEntries[name].push({
        character: finalCharacter,
        originalScenario: game.currentScenario || '',
        originalTwist: game.currentTwist || '',
        draftedRound: (game.currentRound || 0) + 1,
        pickNumberInRound,
        globalDraftOrder,
        draftedAtMs,
        autoFilled
      });

      const allDraftsList = [];
      game.players.forEach(p => {
        p.team.forEach((char, idx) => {
          allDraftsList.push({
            name: p.name,
            character: char,
            autoFilled: p.teamAutoFilled[idx] === true
          });
        });
      });

      socket.emit('draftSuccess', {
        character: finalCharacter,
        teamSize: player.team.length,
        autoFilled
      });

      io.to(room).emit('draftUpdate', {
        player: name,
        character: finalCharacter,
        allDrafts: allDraftsList,
        playerTeamSizes: game.players.reduce((acc, p) => {
          acc[p.name] = p.team.length;
          return acc;
        }, {})
      });

      markRoomsDirty();
    });

    socket.on('lockDraft', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'DRAFT') return;

      const player = game.players.find(p => p.name === name);
      if (!player) return;

      if (player.team.length < 2) {
        socket.emit('draftError', 'You must have 2 characters to lock in!');
        return;
      }

      player.draftLocked = true;
      player.draftLockTime = Date.now() - game.roundStartTime;

      io.to(room).emit('playerLocked', { playerName: name, phase: 'DRAFT' });

      const allLocked = game.players
        .filter(p => !p.isBot)
        .every(p => p.draftLocked === true);

      if (allLocked) {
        clearTimeout(game.draftTimeout);
        revealPlotTwist(io, room);
      }
      markRoomsDirty();
    });

    socket.on('castVote', (votedPlayerName) => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'VOTING') return;

      const target = sanitizeName(votedPlayerName);
      if (!target || target === name) return;
      if (!game.players.some(p => p.name === target)) return;

      game.votes[name] = target;

      const currentVotes = {};
      game.players.forEach(p => {
        currentVotes[p.name] = 0;
      });
      Object.values(game.votes).forEach(voted => {
        if (Object.prototype.hasOwnProperty.call(currentVotes, voted)) {
          currentVotes[voted] += 1;
        }
      });

      io.to(room).emit('voteUpdate', currentVotes);
      markRoomsDirty();
    });

    socket.on('lockVote', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'VOTING') return;

      game.voteLocks[name] = true;

      const allLocked = game.players.every(p => game.voteLocks[p.name] === true);
      if (allLocked) {
        clearTimeout(voteTimeouts[room]);
        if (!game.voteTallyStarted) {
          const fetchQueue = {};
          game.players.forEach((playerEntry) => {
            fetchQueue[playerEntry.name] = Array.isArray(playerEntry.team) ? [...playerEntry.team] : [];
          });

          game.voteTallyStarted = true;
          io.to(room).emit('voteTallying', {
            trigger: 'all_locked',
            settleDelayMs: 1200,
            fetchQueue
          });
          setTimeout(() => tallyResults(io, room), 1200);
        }
      } else {
        io.to(room).emit('voteLockUpdate', {
          lockedPlayers: Object.keys(game.voteLocks),
          totalPlayers: game.players.length
        });
      }
      markRoomsDirty();
    });

    socket.on('evaluateRound4', async () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || game.activePhase !== 'AI_EVALUATION') {
        socket.emit('round4EvaluationError', { message: 'Round 4 is not active.' });
        return;
      }

      if (game.round4Results && game.round4Results.payload) {
        socket.emit('round4Evaluated', game.round4Results.payload);
        return;
      }

      if (game.round4InProgress) {
        return;
      }

      console.log(`🎮 Server-authoritative Round 4 evaluation requested by ${name} in room ${room}`);

      try {
        game.round4InProgress = true;
        const evaluationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const scored = await evaluateRound4FromGame(game);

        if (!game.round4Applied) {
          game.players.forEach(p => {
            const earned = scored.roundPoints[p.name] || 0;
            p.roundScores[3] = earned;
            p.totalScore += earned;
          });
          game.round4Applied = true;
        }

        const leaderboardData = [...game.players]
          .sort((a, b) => b.totalScore - a.totalScore)
          .map(p => ({
            name: p.name,
            score: p.totalScore,
            roundScore: scored.roundPoints[p.name] || 0,
            breakdown: scored.pointBreakdown[p.name] || []
          }));

        const roundPointEntries = Object.entries(scored.roundPoints);
        const maxRoundPoints = roundPointEntries.length
          ? Math.max(...roundPointEntries.map(([, pts]) => pts))
          : 0;

        const tiedTeams = roundPointEntries
          .filter(([, pts]) => pts === maxRoundPoints)
          .map(([playerName]) => playerName);

        const isTie = tiedTeams.length > 1;
        const roundWinner = tiedTeams[0] || null;

        game.results[3] = {
          winner: roundWinner,
          isTie,
          tiedPlayers: tiedTeams,
          scenario: scored.scenario,
          twist: scored.twist,
          leaderboard: leaderboardData
        };

        const totalScoreByPlayer = game.players.reduce((acc, player) => {
          acc[player.name] = Number(player.totalScore) || 0;
          return acc;
        }, {});

        const evalLeaderboard = scored.finalLeaderboard.map((teamRow) => {
          const round4Points = Number(teamRow.round4Points) || 0;
          const totalScore = Number(totalScoreByPlayer[teamRow.playerName]) || round4Points;
          return {
            playerName: teamRow.playerName,
            totalOVR: typeof teamRow.totalOVR === 'number' ? teamRow.totalOVR : 0,
            chemistryBonus: typeof teamRow.chemistryBonus === 'number' ? teamRow.chemistryBonus : 0,
            topPick: teamRow.topPick || 'N/A',
            topPickImageUrl: teamRow.topPickImageUrl || null,
            round4Points,
            totalScore,
            previousTotalScore: totalScore - round4Points
          };
        });

        const payload = {
          evaluationId,
          allTeamEvaluations: scored.teamEvaluations,
          finalLeaderboard: evalLeaderboard,
          isTie,
          tiedPlayers: tiedTeams
        };

        game.round4Results = {
          evaluationId,
          payload,
          winner: roundWinner,
          isTie,
          tiedPlayers: tiedTeams,
          roundPoints: scored.roundPoints,
          pointBreakdown: scored.pointBreakdown,
          leaderboardData
        };

        io.to(room).emit('round4Evaluated', payload);
      } catch (error) {
        console.error('❌ Round 4 evaluation error:', error);
        socket.emit('round4EvaluationError', { message: 'Failed to evaluate Round 4 teams.' });
      } finally {
        if (game) game.round4InProgress = false;
        markRoomsDirty();
      }
    });

    socket.on('requestFinalResults', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, name, roomData } = joined;
      const game = roomData.gameState;
      if (!game || !game.round4Results) return;

      const eligiblePlayers = getEligibleFinalPlayers(roomData, game);
      if (!eligiblePlayers.includes(name)) return;

      game.finalResultsReady = game.finalResultsReady || {};
      game.finalResultsReady[name] = true;

      updateFinalResultsWaiting(io, room, roomData, game);
      markRoomsDirty();
    });

    socket.on('playAgain', () => {
      const joined = getJoinedRoom(socket);
      if (!joined) return;

      const { room, roomData } = joined;
      roomData.gameState = null;
      roomData.isGameActive = false;
      roomData.players.forEach(p => {
        p.ready = false;
      });
      roomData.messages = [];

      emitRoomData(io, room, roomData);
      markRoomsDirty();
    });

    socket.on('disconnect', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const roomData = getRoomData(room);
      if (!roomData) return;

      roomData.players = roomData.players.filter(p => p.name !== name);

      if (roomData.gameState && Array.isArray(roomData.gameState.players)) {
        roomData.gameState.players = roomData.gameState.players.filter(p => p.name !== name);
      }

      if (roomData.gameState) {
        updateFinalResultsWaiting(io, room, roomData, roomData.gameState);
      }

      if (roomData.host === name && roomData.players.length > 0) {
        roomData.host = roomData.players[0].name;
      }

      if (roomData.players.length === 0) {
        delete rooms[room];
      } else {
        emitRoomData(io, room, roomData);
      }

      console.log(`${name} left room ${room}`);
      markRoomsDirty();
    });
  });
}

module.exports = registerSocketHandlers;
