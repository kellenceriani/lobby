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
  getRandomWord
} = require('./gameEngine');

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
