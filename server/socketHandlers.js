const {
  rooms,
  voteTimeouts,
  createRoom,
  startGame,
  startRound,
  startFinalRound,
  revealPlotTwist,
  tallyResults,
  tallyFinalResults,
  getRandomWord,
  endGame
} = require('./gameEngine');

const { scoreCharacter } = require('./evaluator');
const { getRandomPhrase } = require('./phraseGenerator');
const { calculateChemistryBonus, calculateChemistryDetails } = require('./chemistryCalculator');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRoom', ({ name, room }) => {
      room = room.toUpperCase();

      if (!rooms[room]) {
        rooms[room] = createRoom(room);
        rooms[room].host = name;
      }

      const roomData = rooms[room];

      if (roomData.isGameActive) {
        socket.emit('joinError', 'Game already in progress. Try again next round!');
        return;
      }

      if (roomData.players.length >= roomData.settings.maxPlayers) {
        socket.emit('joinError', `Room is full (${roomData.settings.maxPlayers} player limit).`);
        return;
      }

      if (roomData.players.find(p => p.name === name)) {
        socket.emit('joinError', 'Name already taken in this room.');
        return;
      }

      const player = {
        id: socket.id,
        name,
        ready: false,
        reactions: []
      };
      roomData.players.push(player);
      socket.join(room);

      socket.data.room = room;
      socket.data.name = name;

      io.to(room).emit('roomData', {
        players: roomData.players,
        isGameActive: roomData.isGameActive,
        host: roomData.host,
        settings: roomData.settings,
        messages: roomData.messages
      });

      console.log(`${name} joined room ${room}`);
    });

    socket.on('updateSettings', (newSettings) => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room) return;

      const roomData = rooms[room];
      if (roomData.host !== name) return;
      if (roomData.isGameActive) return;

      roomData.settings = { ...roomData.settings, ...newSettings };

      io.to(room).emit('settingsUpdated', roomData.settings);
    });

    socket.on('toggleReady', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const roomData = rooms[room];
      const player = roomData.players.find(p => p.name === name);
      if (player) {
        player.ready = !player.ready;
        io.to(room).emit('roomData', {
          players: roomData.players,
          isGameActive: roomData.isGameActive,
          host: roomData.host,
          settings: roomData.settings,
          messages: roomData.messages
        });
      }
    });

    socket.on('readyForNextRound', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const game = rooms[room].gameState;
      if (!game) return;

      game.resultsReady = game.resultsReady || {};
      game.resultsReady[name] = true;

      const allReady = game.players.every(p => game.resultsReady[p.name] === true);

      if (allReady) {
        game.currentRound++;
        if (game.currentRound < game.totalRounds) {
          startRound(io, room);
        } else {
          startFinalRound(io, room);
        }
      }
    });

    socket.on('sendMessage', (message) => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const roomData = rooms[room];
      const msg = { player: name, text: message, timestamp: Date.now() };
      roomData.messages.push(msg);
      if (roomData.messages.length > 50) roomData.messages.shift();

      io.to(room).emit('newMessage', msg);
    });

    socket.on('sendReaction', (reaction) => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const roomData = rooms[room];
      const msg = { player: name, text: reaction, timestamp: Date.now(), isReaction: true };
      roomData.messages.push(msg);
      if (roomData.messages.length > 50) roomData.messages.shift();

      io.to(room).emit('newMessage', msg);
    });

    socket.on('startGame', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room) return;

      const roomData = rooms[room];
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
    });

    socket.on('draftCharacter', (character) => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const game = rooms[room].gameState;
      if (!game || game.activePhase !== 'DRAFT') return;

      const player = game.players.find(p => p.name === name);
      if (!player) return;

      if (player.draftLocked) {
        socket.emit('draftError', 'You have already locked in your team!');
        return;
      }

      if (!character.trim()) return;

      const charNormalized = character.trim().toLowerCase();
      const isDuplicateOwn = player.team.some(c => c.toLowerCase() === charNormalized);
      const isDuplicateOther = game.players.some(p =>
        p.name !== name && p.team.some(c => c.toLowerCase() === charNormalized)
      );
      const isDuplicateAcrossRounds = game.allCharactersDrafted.some(c => c.toLowerCase() === charNormalized);

      let finalCharacter = character.trim();
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
    });

    socket.on('lockDraft', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const game = rooms[room].gameState;
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
    });

    socket.on('castVote', (votedPlayerName) => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const game = rooms[room].gameState;
      if (!game || (game.activePhase !== 'VOTING' && game.activePhase !== 'FINAL_VOTING')) return;

      if (votedPlayerName === name) {
        return;
      }

      game.votes[name] = votedPlayerName;

      const currentVotes = {};
      game.players.forEach(p => {
        currentVotes[p.name] = 0;
      });
      Object.values(game.votes).forEach(voted => {
        if (currentVotes.hasOwnProperty(voted)) {
          currentVotes[voted]++;
        }
      });

      io.to(room).emit('voteUpdate', currentVotes);
    });

    socket.on('lockVote', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const game = rooms[room].gameState;
      if (!game || (game.activePhase !== 'VOTING' && game.activePhase !== 'FINAL_VOTING')) return;

      game.voteLocks[name] = true;

      const allLocked = game.players.every(p => game.voteLocks[p.name] === true);

      if (allLocked) {
        clearTimeout(voteTimeouts[room]);
        if (game.activePhase === 'VOTING') {
          tallyResults(io, room);
        } else {
          tallyFinalResults(io, room);
        }
      } else {
        io.to(room).emit('voteLockUpdate', {
          lockedPlayers: Object.keys(game.voteLocks),
          totalPlayers: game.players.length
        });
      }
    });

    // NEW: Round 4 AI Evaluation Handler
    socket.on('evaluateRound4', async (data) => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      console.log(`🎮 Round 4 evaluation request from ${name} in room ${room}`);

      const roomData = rooms[room];
      const game = roomData ? roomData.gameState : null;
      if (!game) return;

      if (game.round4Results && game.round4Results.payload) {
        console.log(`↩️ Re-sending cached Round 4 results to ${name}`);
        socket.emit('round4Evaluated', game.round4Results.payload);
        return;
      }

      if (game.round4InProgress) {
        console.log(`⏳ Round 4 evaluation already in progress for room ${room}`);
        return;
      }

      const { scenario, twist, finalTeams } = data;
      // finalTeams = { 'Player1': ['Batman', 'Superman', ...], 'Player2': [...], ... }

      console.log(`📊 Evaluating ${Object.keys(finalTeams).length} teams with ${Object.values(finalTeams).reduce((sum, team) => sum + team.length, 0)} total characters`);

      try {
        game.round4InProgress = true;
        const evaluationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const teamEvaluations = {};
        const roundPoints = {};
        const pointBreakdown = {};

        // Evaluate each team's roster
        for (const [playerName, roster] of Object.entries(finalTeams)) {
          console.log(`⚙️ Evaluating ${playerName}'s team: ${roster.join(', ')}`);
          
          // Score all characters in this roster (up to 6)
          const evaluations = await Promise.all(
            roster.map(char => scoreCharacter(char, scenario, twist))
          );

          console.log(`✅ ${playerName} evaluations complete`);

          // Add phrases to each character eval
          evaluations.forEach(evalData => {
            evalData.phrase = getRandomPhrase(evalData.emotion);
          });

          // Calculate chemistry bonus for this team
          const chemistryInfo = calculateChemistryDetails(roster);
          const chemistryBonus = chemistryInfo.bonus;
          const averageOVR = Math.round(
            evaluations.reduce((sum, e) => sum + e.ovr, 0) / evaluations.length
          );
          const teamOVR = Math.round(averageOVR + chemistryBonus);
          const topPickEval = evaluations.reduce((best, current) => {
            if (!best || current.ovr > best.ovr) return current;
            return best;
          }, null);
          const highestOVR = topPickEval ? topPickEval.ovr : 0;

          console.log(`📈 ${playerName}: Avg OVR=${averageOVR}, Chemistry=${chemistryBonus}, Total=${teamOVR}`);

          roundPoints[playerName] = teamOVR;
          pointBreakdown[playerName] = [
            `Team OVR: ${teamOVR}`,
            `Average OVR: ${averageOVR}`,
            `Chemistry Bonus: +${chemistryBonus}`,
            `Top Pick: ${topPickEval ? topPickEval.character : 'N/A'}`
          ];

          // Store this team's results
          teamEvaluations[playerName] = {
            evaluations,
            teamSummary: {
              totalOVR: teamOVR,
              chemistryBonus,
              chemistryDetails: chemistryInfo.details,
              averageOVR,
              topPick: topPickEval ? topPickEval.character : 'N/A',
              highestOVR,
              evaluationCount: evaluations.length
            }
          };
        }

        // Rank teams by totalOVR
        const finalLeaderboard = Object.entries(teamEvaluations)
          .map(([playerName, teamData]) => ({
            playerName,
            totalOVR: teamData.teamSummary.totalOVR,
            chemistryBonus: teamData.teamSummary.chemistryBonus,
            topPick: teamData.teamSummary.topPick
          }))
          .sort((a, b) => b.totalOVR - a.totalOVR);

        console.log(`🏆 Final leaderboard:`, finalLeaderboard.map(t => `${t.playerName}: ${t.totalOVR}`).join(', '));

        if (!game.round4Applied) {
          game.players.forEach(p => {
            const earned = roundPoints[p.name] || 0;
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
            roundScore: roundPoints[p.name] || 0,
            breakdown: pointBreakdown[p.name] || []
          }));

        game.results[3] = {
          winner: finalLeaderboard[0] ? finalLeaderboard[0].playerName : null,
          scenario: scenario,
          twist: twist,
          leaderboard: leaderboardData
        };

        const payload = {
          evaluationId,
          allTeamEvaluations: teamEvaluations,
          finalLeaderboard
        };

        game.round4Results = {
          evaluationId,
          payload,
          roundPoints,
          pointBreakdown,
          leaderboardData
        };

        // Emit all teams' results back to ALL players in the room
        io.to(room).emit('round4Evaluated', payload);

        console.log(`✅ Round 4 evaluation completed for room ${room}`);
        game.round4InProgress = false;
      } catch (error) {
        console.error('❌ Round 4 evaluation error:', error);
        game.round4InProgress = false;
        socket.emit('round4EvaluationError', { message: error.message });
      }
    });

    socket.on('requestFinalResults', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const roomData = rooms[room];
      const game = roomData ? roomData.gameState : null;
      if (!game || !game.round4Results) return;

      game.finalResultsReady = game.finalResultsReady || {};
      game.finalResultsReady[name] = true;

      const allReady = game.players.every(p => game.finalResultsReady[p.name] === true);

      if (!allReady) {
        io.to(room).emit('finalResultsWaiting', {
          readyCount: Object.keys(game.finalResultsReady).length,
          totalPlayers: game.players.length
        });
        return;
      }

      if (game.finalResultsEmitted) return;
      game.finalResultsEmitted = true;

      io.to(room).emit('finalRoundResults', {
        winner: game.round4Results.leaderboardData[0]
          ? game.round4Results.leaderboardData[0].name
          : null,
        roundPoints: game.round4Results.roundPoints,
        voteCount: {},
        leaderboard: game.round4Results.leaderboardData,
        pointBreakdown: game.round4Results.pointBreakdown
      });

      setTimeout(() => endGame(io, room), 3000);
    });

    socket.on('playAgain', () => {
      const room = socket.data.room;
      if (!room) return;

      const roomData = rooms[room];
      roomData.gameState = null;
      roomData.isGameActive = false;
      roomData.players.forEach(p => p.ready = false);
      roomData.messages = [];

      io.to(room).emit('roomData', {
        players: roomData.players,
        isGameActive: roomData.isGameActive,
        host: roomData.host,
        settings: roomData.settings,
        messages: roomData.messages
      });
    });

    socket.on('disconnect', () => {
      const room = socket.data.room;
      const name = socket.data.name;
      if (!room || !name) return;

      const roomData = rooms[room];
      roomData.players = roomData.players.filter(p => p.name !== name);

      if (roomData.host === name && roomData.players.length > 0) {
        roomData.host = roomData.players[0].name;
      }

      io.to(room).emit('roomData', {
        players: roomData.players,
        isGameActive: roomData.isGameActive,
        host: roomData.host,
        settings: roomData.settings,
        messages: roomData.messages
      });

      console.log(`${name} left room ${room}`);

      if (roomData.players.length === 0) {
        delete rooms[room];
      }
    });
  });
}

module.exports = registerSocketHandlers;
