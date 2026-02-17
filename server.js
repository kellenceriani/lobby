const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(__dirname + '/public'));

// ========================
// RANDOM WORD POOL (for empty draft slots)
// ========================
const RANDOM_WORDS = [
  'Batman', 'Oprah', 'A Sentient Banana', 'SpongeBob', 'Sherlock Holmes',
  'Dwayne Johnson', 'Einstein', 'Shakespeare', 'A Rubber Duck', 'Gandalf',
  'A Confused Penguin', 'Mona Lisa', 'A Talking Potato', 'Zeus', 'Mr. Bean',
  'Darth Vader', 'Hermione Granger', 'Gordon Ramsay', 'A Sentient Cloud',
  'Rick Sanchez', 'Dumbledore', 'A Time-Traveling Sloth', 'Napoleon', 'A Living Meme',
  'Elon Musk', 'A Polite Shark', 'Queen Elizabeth', 'A Disco Ball', 'Socrates'
];

// ========================
// COMPREHENSIVE SCENARIOS (150+)
// ========================
const SCENARIOS = [
  // Cooking & Food
  { scenario: 'WIN A COOKING COMPETITION', twists: ['BUT IT\'S UNDERWATER', 'BUT YOU\'RE ALL VEGAN', 'BUT YOU ONLY HAVE 30 SECONDS', 'BUT EVERYTHING IS INVISIBLE'] },
  { scenario: 'MAKE THE PERFECT SANDWICH', twists: ['USING ONLY YOUR FEET', 'IN TOTAL DARKNESS', 'WHILE EVERYTHING SPINS', 'AND IT TASTES LIKE FEELINGS'] },
  { scenario: 'WIN A BAKING SHOWDOWN', twists: ['BUT YOUR OVEN IS A CLOUD', 'AND GRAVITY IS REVERSED', 'WHILE SPEAKING BACKWARDS', 'WITH A TINY SPOON'] },
  { scenario: 'SURVIVE A FOOD TRUCK BATTLE', twists: ['ON THE MOON', 'WITH NO TASTE BUDS', 'IN A LIBRARY', 'WHILE ROLLERSKATING'] },
  
  // Combat & Action
  { scenario: 'DEFEAT AN ALIEN INVASION', twists: ['BUT YOU CAN ONLY USE MIME SKILLS', 'BUT YOU\'RE ALLERGIC TO OXYGEN', 'BUT YOU\'RE IN A LIBRARY', 'BUT YOU\'RE MADE OF PUDDING'] },
  { scenario: 'WIN A SWORD FIGHT', twists: ['WITH RUBBER CHICKENS', 'WHILE DANCING THE TANGO', 'BLINDFOLDED WITH EARMUFFS', 'ON A GIANT HAMSTER WHEEL'] },
  { scenario: 'SAVE THE WORLD FROM A METEOR', twists: ['USING ONLY HUGS', 'WHILE EVERYONE IS TINY', 'IN A SHOE BOX', 'SPEAKING ONLY IN PUNS'] },
  { scenario: 'ESCAPE FROM PRISON', twists: ['BUT IT\'S MADE OF ICE', 'BUT A CHILD IS IN CHARGE', 'BUT YOU CAN\'T SPEAK', 'WITH ONLY SPAGHETTI'] },
  { scenario: 'WIN A ZOMBIE APOCALYPSE', twists: ['USING COMPLIMENTS', 'WHILE HOPPING ON ONE LEG', 'IN A BOUNCY CASTLE', 'AS A SENTIENT CLOUD'] },
  
  // Entertainment & Performance
  { scenario: 'WIN A SINGING COMPETITION', twists: ['BUT YOU CAN ONLY HUM', 'BUT EVERYONE IS BACKWARDS', 'WHILE UNDERWATER', 'AS A HOLOGRAM'] },
  { scenario: 'WIN A DANCING COMPETITION', twists: ['BUT YOU CAN ONLY MOVE DIAGONALLY', 'BUT GRAVITY IS MULTIPLIED BY 5', 'IN SLOW MOTION', 'ON STILTS'] },
  { scenario: 'BECOME A STAND-UP COMEDY STAR', twists: ['BUT YOU FORGOT ALL WORDS', 'WHILE STANDING ON YOUR HEAD', 'IN A LIBRARY', 'AS YOUR OWN ECHO'] },
  { scenario: 'PERFORM IN A MAGIC SHOW', twists: ['USING ONLY HAND GESTURES', 'WHILE INVISIBLE', 'IN A MIRROR ROOM', 'WITH NO MAGIC AT ALL'] },
  { scenario: 'WIN A BEAUTY PAGEANT', twists: ['BUT BEAUTY IS JUDGED BACKWARDS', 'BUT YOU\'RE A SENTIENT BLOB', 'BUT ONLY FEET MATTER', 'AS SENTIENT JELLO'] },
  
  // Love & Relationships
  { scenario: 'WIN THE HEART OF YOUR CRUSH', twists: ['WITHOUT USING WORDS', 'WHILE EVERYTHING TASTES PURPLE', 'IN A CROWDED MALL', 'COVERED IN OATMEAL'] },
  { scenario: 'PLAN THE PERFECT WEDDING', twists: ['IN 15 SECONDS', 'ON A ROCKET SHIP', 'WITH ONLY CHEESE', 'WHILE STUCK IN A LOOP'] },
  { scenario: 'GET OUT OF A TERRIBLE DATE', twists: ['WITHOUT BEING RUDE', 'WHILE FEET GROWN WINGS', 'IN ZERO GRAVITY', 'BY BECOMING A PARROT'] },
  
  // Adventure & Exploration
  { scenario: 'CLIMB MOUNT EVEREST', twists: ['BACKWARDS', 'IN ROLLER SKATES', 'MADE OF COTTON CANDY', 'WHILE VIBRATING'] },
  { scenario: 'EXPLORE THE DEPTHS OF THE OCEAN', twists: ['BUT WATER IS NOW AIR', 'AND YOU\'RE A FLOATING EYEBALL', 'WITH REVERSE GRAVITY', 'SPEAKING ONLY WHALE'] },
  { scenario: 'SURVIVE IN THE JUNGLE', twists: ['BUT YOU\'RE 2 INCHES TALL', 'AND EVERYTHING IS POISONED', 'WITH NO SENSE OF SMELL', 'WHILE YODELING CONSTANTLY'] },
  { scenario: 'CROSS A DESERT ON FOOT', twists: ['BUT SAND IS NOW LIQUID', 'AND YOU\'RE MADE OF ICE', 'WHILE MOONWALKING', 'BACKWARDS THROUGH TIME'] },
  
  // Mystery & Investigation
  { scenario: 'SOLVE A MYSTERY IN A HAUNTED MANSION', twists: ['BUT THE GHOSTS ARE HELPFUL', 'BUT YOU\'RE ALL VERY TINY', 'BUT TIME MOVES BACKWARDS', 'AND WALLS ARE INVISIBLE'] },
  { scenario: 'CATCH A MASTER THIEF', twists: ['BUT YOU\'RE THE PRODUCT OF THEIR IMAGINATION', 'WHILE EVERYTHING\'S IN REVERSE', 'USING ONLY KNITTED ITEMS', 'IN A WORLD OF SOUND'] },
  { scenario: 'FIND HIDDEN TREASURE', twists: ['BUT THE MAP IS EDIBLE', 'AND YOU CAN ONLY FOLLOW SONGS', 'THE TREASURE IS MADE OF FEELINGS', 'AND IT\'S EVERYWHERE AT ONCE'] },
  
  // Building & Creation
  { scenario: 'BUILD A FUNCTIONING SPACESHIP', twists: ['USING ONLY CHEESE', 'WITHOUT TOUCHING ANYTHING', 'WHERE GRAVITY WORKS SIDEWAYS', 'WITH YOUR EYES CLOSED'] },
  { scenario: 'DESIGN A NEW CITY', twists: ['WHERE BUILDINGS ARE ALIVE', 'THAT FITS IN A SHOEBOX', 'BUILT ENTIRELY OF PASTA', 'FLOATING IN SPACE'] },
  { scenario: 'CONSTRUCT A BRIDGE ACROSS A RIVER', twists: ['USING ONLY PILLOWS', 'WHILE THE RIVER FLOWS UP', 'IN COMPLETE SILENCE', 'MADE ENTIRELY OF DREAMS'] },
  { scenario: 'BUILD A THEME PARK', twists: ['USING ONLY FELT', 'WHERE EVERYTHING SPINS', 'THAT ONLY KIDS CAN SEE', 'IN 3 MINUTES'] },
  
  // Sports & Games
  { scenario: 'WIN AN OLYMPIC MEDAL', twists: ['IN A SPORT THAT DOESN\'T EXIST', 'WHILE EVERYTHING IS UPSIDE DOWN', 'HOPPING ON ONE LEG', 'AS A SENTIENT CLOUD'] },
  { scenario: 'WIN A POKER TOURNAMENT', twists: ['WITH NO CARDS', 'BLINDFOLDED BACKWARDS', 'SPEAKING ONLY IN EMOJIS', 'WHERE LUCK IS REVERSED'] },
  { scenario: 'COMPLETE A MARATHON', twists: ['BUT YOU MOVE IN SQUARES ONLY', 'ON BOUNCY SURFACES', 'WHILE GETTING SMALLER', 'THROUGH A HALLWAY THAT\'S SHRINKING'] },
  { scenario: 'WIN A CHESS MATCH', twists: ['WHERE PIECES ARE ALIVE', 'AND BETRAYING YOU', 'BY ONLY HUMMING', 'INSIDE A WASHING MACHINE'] },
  
  // Science & Technology
  { scenario: 'INVENT TIME TRAVEL', twists: ['BUT YOU CAN ONLY GO FORWARD', 'USING ONLY SOCKS', 'IN A LIBRARY', 'WHILE EVERYONE ARGUES'] },
  { scenario: 'CURE A MYSTERIOUS DISEASE', twists: ['WITH A RUBBER DUCK', 'IN TOTAL DARKNESS', 'WITH REVERSED SENSES', 'WHILE SINGING'] },
  { scenario: 'LAUNCH A SATELLITE', twists: ['USING ONLY SPAGHETTI', 'WHILE STANDING ON HANDS', 'INTO A GIANT SOCK', 'MADE OF CLOUDS'] },
  { scenario: 'HACK INTO A SUPERCOMPUTER', twists: ['USING ONLY TEXT', 'WHILE THE SCREEN IS BLANK', 'IN A MIRROR MAZE', 'WITH A KALEIDOSCOPE'] },
  
  // Social & Political
  { scenario: 'CONVINCE A BILLIONAIRE TO GIVE YOU MONEY', twists: ['BUT THEY ONLY SPEAK DOLPHIN', 'BUT YOU\'RE INVISIBLE', 'BUT YOU\'RE STUCK IN A BARREL', 'BUT ALL WORDS ARE REVERSED'] },
  { scenario: 'BECOME PRESIDENT OF THE WORLD', twists: ['BUT LAWS ARE FEELINGS', 'AND VOTES ARE THOUGHTS', 'IN A WORLD OF ONLY COLORS', 'WHERE EVERYONE\'S A CLONE'] },
  { scenario: 'NEGOTIATE A PEACE TREATY', twists: ['USING ONLY EMOTIONS', 'WHILE EVERYTHING VIBRATES', 'IN A LANGUAGE THAT\'S DANCING', 'WHERE SILENCE SPEAKS'] },
  
  // Weird & Absurd
  { scenario: 'BECOME A SENTIENT CLOUD', twists: ['WHILE EVAPURATING', 'IN A THUNDERSTORM OF THOUGHTS', 'WHILE MAKING RAIN DECISIONS', 'THAT TASTE COLORS'] },
  { scenario: 'TRANSFORM INTO A DANCE MOVE', twists: ['THAT PEOPLE DO BACKWARDS', 'IN 4D SPACE', 'WHILE STAYING STILL', 'THAT TEACHES HAPPINESS'] },
  { scenario: 'COMMUNICATE WITH FURNITURE', twists: ['WHO WANT REVENGE', 'USING ONLY TEXTURES', 'WHILE THEY\'RE SLEEPING', 'WHO ARE BETTER THAN YOU'] },
  { scenario: 'MAKE FRIENDS WITH AN EMOTION', twists: ['THAT\'S NOT REAL', 'IN A WORLD OF ONLY SOUNDS', 'THAT KEEPS LEAVING', 'THAT IS YOU'] },
  { scenario: 'TEACH A ROCK TO LOVE', twists: ['BUT IT ALREADY DOES', 'AND IT\'S ANGRIER NOW', 'IN A LANGUAGE OF TEXTURES', 'WHILE IT JUDGES YOU'] },
  
  // More Action
  { scenario: 'SURVIVE A LAVA POOL CROSSING', twists: ['BUT LAVA IS NOW CHEESE', 'WHILE EVERYTHING SHRINKS', 'HOLDING HANDS BACKWARDS', 'IN A MIRRORED WORLD'] },
  { scenario: 'FIGHT OFF A DRAGON', twists: ['WITH KINDNESS ONLY', 'WHILE YOU\'RE SHRINKING', 'IN A LIBRARY THAT\'S TALKING', 'MADE ENTIRELY OF ARGUMENTS'] },
  { scenario: 'ESCAPE FROM A GIANT SQUID', twists: ['WHO WANTS TO BE FRIENDS', 'IN AN ELEVATOR', 'THAT\'S ALSO A SQUID', 'WHILE SOUND IS VISIBLE'] },
  { scenario: 'OUTSMART AN AI', twists: ['THAT\'S ACTUALLY KIND', 'USING ONLY JOKES', 'IN A WORLD IT CREATED', 'WHERE IT WINS EITHER WAY'] },
  
  // More Performance
  { scenario: 'WIN A POETRY SLAM', twists: ['WHERE WORDS DON\'T EXIST', 'USING ONLY SILENCES', 'SPOKEN BACKWARDS IN COLORS', 'BY A CROWD THAT\'S DEAF'] },
  { scenario: 'DIRECT AN OSCAR-WINNING FILM', twists: ['THAT HAS NO SCRIPT', 'IN A NUT SHELL', 'ACTED BY EMOTIONS', 'NO CAMERAS ALLOWED'] },
  { scenario: 'COMPOSE A SYMPHONY', twists: ['USING ONLY TEXTURES', 'IN A LANGUAGE OF COLORS', 'WHERE NOTES ARE FEELINGS', 'THAT ALREADY EXISTS'] },
  
  // More Weird Combos
  { scenario: 'TEACH DINOSAURS TO CODE', twists: ['BUT THEY\'RE NOW TINY', 'IN A LIBRARY MADE OF TIME', 'WHILE EXTINCT', 'USING EXTINCT LANGUAGES'] },
  { scenario: 'CONVINCE GRAVITY IT\'S WRONG', twists: ['AND WIN', 'BY ARGUING WITH PHYSICS', 'IN A WORLD WITHOUT WORDS', 'WHERE YOU\'RE PROVEN RIGHT'] },
  { scenario: 'START A REVOLUTION OF SOCKS', twists: ['LED BY SOCKS', 'AGAINST SHOES', 'IN A DRYING MACHINE', 'THAT WINS'] }
];

// ========================
// IN-MEMORY STATE
// ========================
const rooms = {};
const voteTimeouts = {};

function createRoom(roomCode) {
  return {
    roomCode,
    players: [],
    gameState: null,
    isGameActive: false,
    host: null,
    settings: { 
      difficulty: 'normal',
      scenarioTheme: 'all',
      plotTwists: true,
      maxPlayers: 6
    },
    messages: [],
    reactions: {}
  };
}

function getRandomWord() {
  return RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
}

function createGameInstance(roomCode, players, settings) {
  const shuffleArray = (arr) => arr.sort(() => Math.random() - 0.5);
  let scenarios = [...SCENARIOS];
  
  scenarios = shuffleArray(scenarios).slice(0, 3);

  return {
    id: `game_${Date.now()}_${roomCode}`,
    roomCode,
    players: players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: false,
      team: [],
      finalTeam: [],
      votes: 0,
      roundScores: [0, 0, 0, 0],
      totalScore: 0,
      draftLocked: false
    })),
    currentRound: 0,
    totalRounds: 4,
    scenarios,
    activePhase: 'PRE_ROUND',
    phaseStartTime: Date.now(),
    draftEntries: {},
    votes: {},
    voteLocks: {},
    currentScenario: '',
    currentTwist: '',
    results: [],
    settings
  };
}

function getDraftSeconds(settings) {
  const difficulty = (settings && settings.difficulty) || 'normal';
  if (difficulty === 'easy') return 60;
  if (difficulty === 'hard') return 35;
  return 45;
}

function getVoteSeconds() {
  return 30;
}

// ========================
// GAME PHASE FLOW
// ========================
function startGame(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.players.length < 3) return;

  const readyCount = room.players.filter(p => p.ready).length;
  if (readyCount < 3 || readyCount !== room.players.length) return;

  room.isGameActive = true;
  room.gameState = createGameInstance(roomCode, room.players, room.settings);

  io.to(roomCode).emit('gameStarting', {
    totalRounds: 4,
    players: room.gameState.players.map(p => p.name),
    settings: room.settings
  });

  setTimeout(() => startRound(roomCode), 3000);
}

function startRound(roomCode) {
  const game = rooms[roomCode].gameState;
  if (!game || game.currentRound >= game.totalRounds) {
    endGame(roomCode);
    return;
  }

  if (game.currentRound === 3) {
    startFinalRound(roomCode);
    return;
  }

  game.activePhase = 'PRE_ROUND';
  game.phaseStartTime = Date.now();

  io.to(roomCode).emit('roundStart', {
    roundNumber: game.currentRound + 1,
    totalRounds: game.totalRounds
  });

  setTimeout(() => revealScenario(roomCode), 3000);
}

function revealScenario(roomCode) {
  const room = rooms[roomCode];
  const game = room.gameState;
  game.activePhase = 'DRAFT';
  game.phaseStartTime = Date.now();
  game.draftEntries = {};
  game.players.forEach(p => {
    p.team = [];
    p.draftLocked = false;
  });
  
  room.messages = [];

  const scenario = game.scenarios[game.currentRound];
  game.currentScenario = scenario.scenario;

  const draftSeconds = getDraftSeconds(game.settings);

  io.to(roomCode).emit('scenarioRevealed', {
    scenario: scenario.scenario,
    draftTimeRemaining: draftSeconds,
    maxCharactersPerPlayer: 2,
    roundNumber: game.currentRound + 1
  });

  game.draftTimeout = setTimeout(() => revealPlotTwist(roomCode), draftSeconds * 1000);
}

function revealPlotTwist(roomCode) {
  const game = rooms[roomCode].gameState;
  const scenario = game.scenarios[game.currentRound];
  if (!game.settings.plotTwists) {
    game.currentTwist = 'NO PLOT TWIST';
    startVoting(roomCode);
    return;
  }

  const twist = scenario.twists[Math.floor(Math.random() * scenario.twists.length)];
  game.currentTwist = twist;

  game.activePhase = 'TWIST';

  // Fill empty slots with random words
  game.players.forEach(p => {
    while (p.team.length < 2) {
      let randomWord = getRandomWord();
      while (game.players.some(other => other.name !== p.name && other.team.some(c => c.toLowerCase() === randomWord.toLowerCase()))) {
        randomWord = getRandomWord();
      }
      p.team.push(randomWord);
    }
  });

  io.to(roomCode).emit('plotTwistRevealed', {
    twist: twist,
    scenario: game.currentScenario,
    currentTeams: game.players.map(p => ({
      name: p.name,
      team: p.team
    }))
  });

  setTimeout(() => startVoting(roomCode), 3000);
}

function startVoting(roomCode) {
  const game = rooms[roomCode].gameState;
  game.activePhase = 'VOTING';
  game.phaseStartTime = Date.now();
  game.votes = {};
  game.voteLocks = {};

  const teamsDisplay = game.players.map(p => ({
    name: p.name,
    team: p.team,
    votes: 0
  }));

  io.to(roomCode).emit('votingPhaseStart', {
    teams: teamsDisplay,
    votingTimeRemaining: getVoteSeconds(),
    scenario: game.currentScenario,
    twist: game.currentTwist,
    totalPlayers: game.players.length,
    roundNumber: game.currentRound + 1
  });

  const voteTimeout = setTimeout(() => tallyResults(roomCode), getVoteSeconds() * 1000);
  voteTimeouts[roomCode] = voteTimeout;
}

function startFinalRound(roomCode) {
  const game = rooms[roomCode].gameState;
  game.activePhase = 'PRE_FINAL';
  game.phaseStartTime = Date.now();

  game.players.forEach(p => {
    p.finalTeam = [];
    if (game.results[0]) p.finalTeam.push(...(game.results[0].playerTeams?.[p.name] || []));
    if (game.results[1]) p.finalTeam.push(...(game.results[1].playerTeams?.[p.name] || []));
    if (game.results[2]) p.finalTeam.push(...(game.results[2].playerTeams?.[p.name] || []));
  });

  io.to(roomCode).emit('roundStart', {
    roundNumber: 4,
    totalRounds: 4,
    isFinalRound: true
  });

  setTimeout(() => revealFinalTeam(roomCode), 3000);
}

function revealFinalTeam(roomCode) {
  const game = rooms[roomCode].gameState;
  game.activePhase = 'FINAL_DRAFT';
  game.phaseStartTime = Date.now();
  game.players.forEach(p => {
    p.draftLocked = false;
  });

  io.to(roomCode).emit('finalTeamRevealed', {
    draftTimeRemaining: 60,
    playerTeams: game.players.map(p => ({
      name: p.name,
      teamSoFar: p.finalTeam
    }))
  });

  game.draftTimeout = setTimeout(() => startFinalVoting(roomCode), 60 * 1000);
}

function startFinalVoting(roomCode) {
  const game = rooms[roomCode].gameState;
  game.activePhase = 'FINAL_VOTING';
  game.phaseStartTime = Date.now();
  game.votes = {};
  game.voteLocks = {};

  const teamsDisplay = game.players.map(p => ({
    name: p.name,
    team: p.finalTeam,
    votes: 0
  }));

  io.to(roomCode).emit('finalVotingPhaseStart', {
    teams: teamsDisplay,
    votingTimeRemaining: getVoteSeconds(),
    totalPlayers: game.players.length
  });

  const voteTimeout = setTimeout(() => tallyFinalResults(roomCode), getVoteSeconds() * 1000);
  voteTimeouts[roomCode] = voteTimeout;
}

function tallyResults(roomCode) {
  const game = rooms[roomCode].gameState;
  const scenario = game.scenarios[game.currentRound];

  if (!game.results[game.currentRound]) {
    game.results[game.currentRound] = {};
  }
  game.results[game.currentRound].playerTeams = {};
  game.players.forEach(p => {
    game.results[game.currentRound].playerTeams[p.name] = [...p.team];
  });

  const voteCount = {};
  game.players.forEach(p => {
    voteCount[p.name] = 0;
  });

  Object.values(game.votes).forEach(votedName => {
    if (voteCount.hasOwnProperty(votedName)) {
      voteCount[votedName]++;
    }
  });

  let winner = null;
  const sortedVotes = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);

  const isTie = sortedVotes.length > 1 && 
                sortedVotes[0][1] === sortedVotes[1][1] && 
                sortedVotes[0][1] > 0;

  if (!isTie && sortedVotes.length > 0 && sortedVotes[0][1] > 0) {
    winner = sortedVotes[0][0];
  }

  // ========================
  // IMPROVED POINT SYSTEM (Rounds 1-3)
  // ========================
  const points = {};
  const totalPlayers = game.players.length;
  const basePoints = 10;
  
  game.players.forEach(p => {
    points[p.name] = basePoints;
  });

  game.players.forEach(p => {
    if (p.team.length > 0) {
      points[p.name] += 15;
    }
    if (p.team.length === 2) {
      points[p.name] += 20;
    }
  });

  if (winner) {
    const winnerBonus = 50 + (totalPlayers * 10);
    points[winner] = winnerBonus;
    
    if (sortedVotes.length > 1 && sortedVotes[1][1] > 0) {
      const runnerUpBonus = 25 + (totalPlayers * 5);
      points[sortedVotes[1][0]] = runnerUpBonus;
    }

    if (sortedVotes.length > 2 && sortedVotes[2][1] > 0) {
      points[sortedVotes[2][0]] = Math.max(basePoints + 15, sortedVotes[2][1] * 5);
    }
  } else if (isTie) {
    const tieBonus = 35 + (totalPlayers * 5);
    game.players.forEach(p => {
      if (sortedVotes[0] && sortedVotes[0][0] === p.name) {
        points[p.name] = tieBonus;
      }
    });
  }

  game.players.forEach(p => {
    const earned = points[p.name];
    p.roundScores[game.currentRound] = earned;
    p.totalScore += earned;
  });

  game.activePhase = 'RESULTS';
  
  const leaderboardData = [...game.players].sort((a, b) => b.totalScore - a.totalScore).map(p => ({
    name: p.name,
    score: p.totalScore
  }));
  
  if (!game.results[game.currentRound]) game.results[game.currentRound] = {};
  game.results[game.currentRound].winner = winner;
  game.results[game.currentRound].scenario = scenario.scenario;
  game.results[game.currentRound].twist = game.currentTwist;
  game.results[game.currentRound].leaderboard = leaderboardData;

  io.to(roomCode).emit('roundResults', {
    winner,
    isTie,
    roundPoints: points,
    voteCount,
    leaderboard: leaderboardData,
    round: game.currentRound + 1
  });

  game.currentRound++;

  setTimeout(() => {
    if (game.currentRound < game.totalRounds) {
      startRound(roomCode);
    } else {
      endGame(roomCode);
    }
  }, 5000);
}

function tallyFinalResults(roomCode) {
  const game = rooms[roomCode].gameState;

  const voteCount = {};
  game.players.forEach(p => {
    voteCount[p.name] = 0;
  });

  Object.values(game.votes).forEach(votedName => {
    if (voteCount.hasOwnProperty(votedName)) {
      voteCount[votedName]++;
    }
  });

  let winner = null;
  const sortedVotes = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);

  if (sortedVotes.length > 0 && sortedVotes[0][1] > 0) {
    winner = sortedVotes[0][0];
  }

  // ========================
  // FINAL ROUND POINTS (BONUS ROUND - HIGHEST POINTS)
  // ========================
  const points = {};
  const totalPlayers = game.players.length;
  
  game.players.forEach(p => {
    points[p.name] = 0;
  });

  if (winner) {
    const finalWinBonus = 100 + (totalPlayers * 20);
    points[winner] = finalWinBonus;
    
    if (sortedVotes.length > 1 && sortedVotes[1][1] > 0) {
      points[sortedVotes[1][0]] = 50 + (totalPlayers * 10);
    }

    if (sortedVotes.length > 2 && sortedVotes[2][1] > 0) {
      points[sortedVotes[2][0]] = 25 + (totalPlayers * 5);
    }
  }

  game.players.forEach(p => {
    if (p.finalTeam.length === 6) {
      points[p.name] += 40;
    }
  });

  game.players.forEach(p => {
    p.roundScores[3] = points[p.name];
    p.totalScore += points[p.name];
  });

  const leaderboardData = [...game.players].sort((a, b) => b.totalScore - a.totalScore).map(p => ({
    name: p.name,
    score: p.totalScore
  }));

  io.to(roomCode).emit('finalRoundResults', {
    winner,
    roundPoints: points,
    voteCount,
    leaderboard: leaderboardData
  });

  game.currentRound++;

  setTimeout(() => endGame(roomCode), 5000);
}

function endGame(roomCode) {
  const room = rooms[roomCode];
  const game = room.gameState;
  const finalLeaderboard = [...game.players]
    .filter(p => !p.isBot)
    .sort((a, b) => b.totalScore - a.totalScore)
    .map(p => ({
      name: p.name,
      score: p.totalScore,
      breakdown: p.roundScores
    }));

  io.to(roomCode).emit('gameEnded', {
    finalLeaderboard,
    totalRounds: game.totalRounds,
    winner: finalLeaderboard[0]
  });

  room.isGameActive = false;
  setTimeout(() => {
    room.gameState = null;
  }, 10000);
}

// ========================
// SOCKET EVENTS
// ========================
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

    startGame(room);
  });

  socket.on('draftCharacter', (character) => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (!room || !name) return;

    const game = rooms[room].gameState;
    if (!game || (game.activePhase !== 'DRAFT' && game.activePhase !== 'FINAL_DRAFT')) return;

    const player = game.players.find(p => p.name === name);
    if (!player) return;

    // Handle final draft
    if (game.activePhase === 'FINAL_DRAFT') {
      if (player.draftLocked) {
        socket.emit('draftError', 'You have already locked in your team!');
        return;
      }
      
      const charNormalized = character.trim().toLowerCase();
      if (player.finalTeam.some(c => c.toLowerCase() === charNormalized)) {
        socket.emit('draftError', `"${character.trim()}" is already in your team!`);
        return;
      }
      
      player.finalTeam.push(character.trim());
      
      const allDraftsList = [];
      game.players.forEach(p => {
        p.finalTeam.forEach(char => {
          allDraftsList.push({ name: p.name, character: char });
        });
      });

      socket.emit('draftSuccess', { character: character.trim(), teamSize: player.finalTeam.length });

      io.to(room).emit('draftUpdate', {
        player: name,
        character: character.trim(),
        allDrafts: allDraftsList,
        playerTeamSizes: game.players.reduce((acc, p) => {
          acc[p.name] = p.finalTeam.length;
          return acc;
        }, {})
      });
      return;
    }

    // Regular draft (rounds 1-3)
    if (character.trim()) {
      if (player.team.length >= 2) {
        socket.emit('draftError', 'You can draft a maximum of 2 characters per round!');
        return;
      }
      
      const charNormalized = character.trim().toLowerCase();
      
      if (player.team.some(c => c.toLowerCase() === charNormalized)) {
        socket.emit('draftError', `You already drafted "${character.trim()}"!`);
        return;
      }
      
      for (let otherPlayer of game.players) {
        if (otherPlayer.name !== name && otherPlayer.team.some(c => c.toLowerCase() === charNormalized)) {
          socket.emit('draftError', `"${character.trim()}" was already picked by ${otherPlayer.name}!`);
          return;
        }
      }
      
      player.team.push(character.trim());
      
      const allDraftsList = [];
      game.players.forEach(p => {
        p.team.forEach(char => {
          allDraftsList.push({ name: p.name, character: char });
        });
      });

      socket.emit('draftSuccess', { character: character.trim(), teamSize: player.team.length });

      io.to(room).emit('draftUpdate', {
        player: name,
        character: character.trim(),
        allDrafts: allDraftsList,
        playerTeamSizes: game.players.reduce((acc, p) => {
          acc[p.name] = p.team.length;
          return acc;
        }, {})
      });
    }
  });

  socket.on('lockDraft', () => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (!room || !name) return;

    const game = rooms[room].gameState;
    if (!game || game.activePhase !== 'DRAFT') return;

    const player = game.players.find(p => p.name === name);
    if (!player) return;

    // Validation: Must have exactly 2 characters
    if (player.team.length < 2) {
      socket.emit('draftError', 'You must have 2 characters to lock in!');
      return;
    }

    player.draftLocked = true;

    io.to(room).emit('playerLocked', { playerName: name, phase: 'DRAFT' });

    const allLocked = game.players
      .filter(p => !p.isBot)
      .every(p => p.draftLocked === true);
    
    if (allLocked) {
      clearTimeout(game.draftTimeout);
      revealPlotTwist(room);
    }
  });

  socket.on('lockFinalDraft', () => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (!room || !name) return;

    const game = rooms[room].gameState;
    if (!game || game.activePhase !== 'FINAL_DRAFT') return;

    const player = game.players.find(p => p.name === name);
    if (!player) return;

    player.draftLocked = true;

    io.to(room).emit('playerLocked', { playerName: name, phase: 'FINAL_DRAFT' });

    const allLocked = game.players
      .filter(p => !p.isBot)
      .every(p => p.draftLocked === true);
    
    if (allLocked) {
      clearTimeout(game.draftTimeout);
      startFinalVoting(room);
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
        tallyResults(room);
      } else {
        tallyFinalResults(room);
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Team Chaos Server running on port ${PORT}`);
});
