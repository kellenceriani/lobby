const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(__dirname + '/public'));

// ========================
// WORD API INTEGRATION (Random User API - fast & free)
// ========================
const FALLBACK_WORDS = [
  'Batman', 'Oprah', 'SpongeBob', 'Sherlock Holmes', 'Dwayne Johnson',
  'Einstein', 'Shakespeare', 'Gandalf', 'Darth Vader', 'Hermione Granger'
];

let wordCache = [];

async function fetchRandomWords() {
  try {
    const response = await fetch('https://random-word-api.herokuapp.com/all');
    if (!response.ok) throw new Error('API failed');
    const words = await response.json();
    wordCache = words.slice(0, 200).map(w => w.charAt(0).toUpperCase() + w.slice(1));
    console.log('✓ Loaded', wordCache.length, 'words from API');
  } catch (error) {
    console.warn('⚠️ Word API failed, using fallback pool');
    wordCache = FALLBACK_WORDS;
  }
}

fetchRandomWords();
setInterval(fetchRandomWords, 1 * 60 * 60 * 1000);

function getRandomWord() {
  if (wordCache.length === 0) {
    return FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
  }
  return wordCache[Math.floor(Math.random() * wordCache.length)];
}

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
// FINAL ROUND PROMPTS (30-40 VARIANTS)
// ========================
const FINAL_VOTING_PROMPTS = [
  'Now which drafted team has made the best..... BASKETBALL TEAM!!??!!',
  'Now which drafted team has made the best..... BASEBALL TEAM!!??!!',
  'Now which drafted team has made the best..... HEIST TEAM!!??!!',
  'Now which drafted team has made the best..... BOWLING TEAM!!??!!',
  'Now which drafted team has made the best..... SPACE CREW!!??!!',
  'Now which drafted team has made the best..... ZOMBIE SURVIVAL TEAM!!??!!',
  'Now which drafted team has made the best..... SUPERHERO SQUAD!!??!!',
  'Now which drafted team has made the best..... VILLAIN LEAGUE!!??!!',
  'Now which drafted team has made the best..... DETECTIVE UNIT!!??!!',
  'Now which drafted team has made the best..... ROCK BAND!!??!!',
  'Now which drafted team has made the best..... POP IDOL GROUP!!??!!',
  'Now which drafted team has made the best..... GAME SHOW TEAM!!??!!',
  'Now which drafted team has made the best..... COOKING CREW!!??!!',
  'Now which drafted team has made the best..... WIZARD COUNCIL!!??!!',
  'Now which drafted team has made the best..... PIRATE CREW!!??!!',
  'Now which drafted team has made the best..... NINJA SQUAD!!??!!',
  'Now which drafted team has made the best..... SPACE MARINES!!??!!',
  'Now which drafted team has made the best..... RACING TEAM!!??!!',
  'Now which drafted team has made the best..... SCIENCE TEAM!!??!!',
  'Now which drafted team has made the best..... TIME TRAVEL CREW!!??!!',
  'Now which drafted team has made the best..... ESCAPE ROOM TEAM!!??!!',
  'Now which drafted team has made the best..... MYSTERY SOLVERS!!??!!',
  'Now which drafted team has made the best..... DRAGON SLAYERS!!??!!',
  'Now which drafted team has made the best..... UNDERWATER CREW!!??!!',
  'Now which drafted team has made the best..... MARS COLONY TEAM!!??!!',
  'Now which drafted team has made the best..... AIRSHIP CREW!!??!!',
  'Now which drafted team has made the best..... MONSTER HUNTERS!!??!!',
  'Now which drafted team has made the best..... DREAM TEAM!!??!!',
  'Now which drafted team has made the best..... SNEAKY SPY TEAM!!??!!',
  'Now which drafted team has made the best..... SURVIVAL ISLAND TEAM!!??!!',
  'Now which drafted team has made the best..... ROBOT SQUAD!!??!!',
  'Now which drafted team has made the best..... MAGIC SHOW CREW!!??!!',
  'Now which drafted team has made the best..... STREET DANCE CREW!!??!!',
  'Now which drafted team has made the best..... SPACE RANGERS!!??!!',
  'Now which drafted team has made the best..... FANTASY RAID PARTY!!??!!',
  'Now which drafted team has made the best..... HOLIDAY RESCUE TEAM!!??!!'
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
      teamAutoFilled: [],
      finalTeam: [],
      votes: 0,
      roundScores: [0, 0, 0, 0],
      totalScore: 0,
      draftLocked: false,
      draftLockTime: null,
      voteLocked: false
    })),
    currentRound: 0,
    totalRounds: 3,
    scenarios,
    activePhase: 'PRE_ROUND',
    phaseStartTime: Date.now(),
    draftEntries: {},
    votes: {},
    voteLocks: {},
    currentScenario: '',
    currentTwist: '',
    results: [],
    settings,
    roundStartTime: null
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
// SIMPLIFIED BONUS SYSTEM (Clear & Understandable)
// ========================

function calculateRoundBonuses(game, round) {
  const voteCount = {};
  game.players.forEach(p => {
    voteCount[p.name] = 0;
  });

  Object.values(game.votes).forEach(votedName => {
    if (voteCount.hasOwnProperty(votedName)) {
      voteCount[votedName]++;
    }
  });

  const sortedVotes = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);
  const totalPlayers = game.players.length;

  const points = {};
  const bonuses = {};
  const pointBreakdown = {};

  // ========================
  // CLEAR POINT BREAKDOWN
  // ========================
  game.players.forEach(p => {
    points[p.name] = 0;
    pointBreakdown[p.name] = [];

    // FULL TEAM BONUS
    if (p.team.length === 2) {
      points[p.name] += 30;
      pointBreakdown[p.name].push('Full Team (2 chars): +30');
    }
  });

  // VOTING WINNER
  const isTie = sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1] && sortedVotes[0][1] > 0;

  if (!isTie && sortedVotes.length > 0 && sortedVotes[0][1] > 0) {
    const winner = sortedVotes[0][0];
    const votesReceived = sortedVotes[0][1];

    const winBonus = 50 + (totalPlayers * 5);
    points[winner] += winBonus;
    pointBreakdown[winner].push(`Most Votes (${votesReceived}): +${winBonus}`);

    // RUNNER-UP
    if (sortedVotes.length > 1 && sortedVotes[1][1] > 0) {
      const runnerUpBonus = 20;
      points[sortedVotes[1][0]] += runnerUpBonus;
      pointBreakdown[sortedVotes[1][0]].push(`Runner-Up: +${runnerUpBonus}`);
    }
  } else if (isTie) {
    // TIE BONUS
    const tieBonus = 35 + (totalPlayers * 3);
    const tiedPlayers = sortedVotes.filter(v => v[1] === sortedVotes[0][1]);
    
    tiedPlayers.forEach(([playerName]) => {
      points[playerName] += tieBonus;
      pointBreakdown[playerName].push(`Tied for Most Votes: +${tieBonus}`);
    });
  }

  // NON-VOTING PENALTY
  const votingPlayers = new Set(Object.keys(game.votes));
  game.players.forEach(p => {
    if (!votingPlayers.has(p.name)) {
      const penalty = 15;
      points[p.name] -= penalty;
      if (!pointBreakdown[p.name]) pointBreakdown[p.name] = [];
      pointBreakdown[p.name].push(`Didn't Vote: -${penalty}`);
    }
  });

  game.players.forEach(p => {
    const earned = Math.max(0, points[p.name]); // Floor at 0
    p.roundScores[round] = earned;
    p.totalScore += earned;
  });

  return { points, bonuses, voteCount, pointBreakdown };
}

function calculateFinalRoundBonuses(game) {
  const voteCount = {};
  game.players.forEach(p => {
    voteCount[p.name] = 0;
  });

  Object.values(game.votes).forEach(votedName => {
    if (voteCount.hasOwnProperty(votedName)) {
      voteCount[votedName]++;
    }
  });

  const sortedVotes = Object.entries(voteCount).sort((a, b) => b[1] - a[1]);
  const totalPlayers = game.players.length;

  const points = {};
  const bonuses = {};
  const pointBreakdown = {};

  game.players.forEach(p => {
    points[p.name] = 0;
    pointBreakdown[p.name] = [];

    // Complete team bonus
    if (p.finalTeam.length === 6) {
      points[p.name] += 40;
      pointBreakdown[p.name].push('Complete Team (6 chars): +40');
    }
  });

  // FINAL VOTING WINNER
  const isTie = sortedVotes.length > 1 && sortedVotes[0][1] === sortedVotes[1][1] && sortedVotes[0][1] > 0;

  if (!isTie && sortedVotes.length > 0 && sortedVotes[0][1] > 0) {
    const winner = sortedVotes[0][0];
    const votesReceived = sortedVotes[0][1];

    const finalWinBonus = 100 + (totalPlayers * 10);
    points[winner] += finalWinBonus;
    pointBreakdown[winner].push(`Most Votes (${votesReceived}): +${finalWinBonus}`);

    if (sortedVotes.length > 1 && sortedVotes[1][1] > 0) {
      const runnerUpBonus = 40;
      points[sortedVotes[1][0]] += runnerUpBonus;
      pointBreakdown[sortedVotes[1][0]].push(`Runner-Up: +${runnerUpBonus}`);
    }
  } else if (isTie) {
    const finalTieBonus = 75 + (totalPlayers * 8);
    const tiedPlayers = sortedVotes.filter(v => v[1] === sortedVotes[0][1]);
    
    tiedPlayers.forEach(([playerName]) => {
      points[playerName] += finalTieBonus;
      pointBreakdown[playerName].push(`Tied for Most Votes: +${finalTieBonus}`);
    });
  }

  // NON-VOTING PENALTY
  const votingPlayers = new Set(Object.keys(game.votes));
  game.players.forEach(p => {
    if (!votingPlayers.has(p.name)) {
      const penalty = 25;
      points[p.name] -= penalty;
      if (!pointBreakdown[p.name]) pointBreakdown[p.name] = [];
      pointBreakdown[p.name].push(`Didn't Vote: -${penalty}`);
    }
  });

  game.players.forEach(p => {
    const earned = Math.max(0, points[p.name]);
    p.roundScores[3] = earned;
    p.totalScore += earned;
  });

  return { points, bonuses, voteCount, pointBreakdown };
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
    totalRounds: 3,
    players: room.gameState.players.map(p => p.name),
    settings: room.settings
  });

  setTimeout(() => startRound(roomCode), 3000);
}

function startRound(roomCode) {
  const game = rooms[roomCode].gameState;
  if (!game || game.currentRound >= game.totalRounds) {
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
  game.roundStartTime = Date.now();
  game.draftEntries = {};
  game.votes = {};
  game.voteLocks = {};
  game.players.forEach(p => {
    p.team = [];
    p.teamAutoFilled = [];
    p.draftLocked = false;
    p.draftLockTime = null;
    p.voteLocked = false;
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

  // Fill empty slots with random words (counts toward the 2 required)
  game.players.forEach(p => {
    while (p.team.length < 2) {
      let randomWord = getRandomWord();
      while (game.players.some(other => other.name !== p.name && other.team.some(c => c.toLowerCase() === randomWord.toLowerCase()))) {
        randomWord = getRandomWord();
      }
      p.team.push(randomWord);
      p.teamAutoFilled.push(true);
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

  // Collect teams from rounds 1-3
  game.players.forEach(p => {
    p.finalTeam = [];
    for (let i = 0; i < 3; i++) {
      if (game.results[i] && game.results[i].playerTeams && game.results[i].playerTeams[p.name]) {
        p.finalTeam.push(...game.results[i].playerTeams[p.name]);
      }
    }
  });

  io.to(roomCode).emit('roundStart', {
    roundNumber: 4,
    totalRounds: 4,
    isFinalRound: true
  });

  setTimeout(() => startFinalVoting(roomCode), 3000);
}

function startFinalVoting(roomCode) {
  const game = rooms[roomCode].gameState;
  game.activePhase = 'FINAL_VOTING';
  game.phaseStartTime = Date.now();
  game.votes = {};
  game.voteLocks = {};

  const finalPrompt = FINAL_VOTING_PROMPTS[Math.floor(Math.random() * FINAL_VOTING_PROMPTS.length)];
  const finalScenario = game.scenarios[Math.floor(Math.random() * game.scenarios.length)];
  game.currentScenario = finalScenario.scenario;

  const teamsDisplay = game.players.map(p => ({
    name: p.name,
    team: p.finalTeam,
    votes: 0
  }));

  io.to(roomCode).emit('finalVotingPhaseStart', {
    teams: teamsDisplay,
    votingTimeRemaining: getVoteSeconds(),
    totalPlayers: game.players.length,
    scenario: game.currentScenario,
    finalPrompt
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

  const { points, bonuses, voteCount, pointBreakdown } = calculateRoundBonuses(game, game.currentRound);

  game.activePhase = 'RESULTS';
  
  const leaderboardData = [...game.players].sort((a, b) => b.totalScore - a.totalScore).map(p => ({
    name: p.name,
    score: p.totalScore,
    roundScore: points[p.name],
    breakdown: pointBreakdown[p.name]
  }));
  
  if (!game.results[game.currentRound]) game.results[game.currentRound] = {};
  game.results[game.currentRound].winner = Object.entries(points).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  game.results[game.currentRound].scenario = scenario.scenario;
  game.results[game.currentRound].twist = game.currentTwist;
  game.results[game.currentRound].leaderboard = leaderboardData;

  io.to(roomCode).emit('roundResults', {
    winner: game.results[game.currentRound].winner,
    roundPoints: points,
    voteCount,
    leaderboard: leaderboardData,
    pointBreakdown,
    round: game.currentRound + 1
  });

  // Reset ready states for results screen
  game.players.forEach(p => p.voteLocked = false);
  game.resultsReady = {};
}

function tallyFinalResults(roomCode) {
  const game = rooms[roomCode].gameState;

  const { points, bonuses, voteCount, pointBreakdown } = calculateFinalRoundBonuses(game);

  const leaderboardData = [...game.players].sort((a, b) => b.totalScore - a.totalScore).map(p => ({
    name: p.name,
    score: p.totalScore,
    roundScore: points[p.name],
    breakdown: pointBreakdown[p.name]
  }));

  io.to(roomCode).emit('finalRoundResults', {
    winner: Object.entries(points).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    roundPoints: points,
    voteCount,
    leaderboard: leaderboardData,
    pointBreakdown
  });

  // After final results, go straight to end game
  setTimeout(() => endGame(roomCode), 3000);
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
        startRound(room);
      } else {
        startFinalRound(room);
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

    startGame(room);
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

    let finalCharacter = character.trim();
    let autoFilled = false;

    if (isDuplicateOwn || isDuplicateOther) {
      let randomWord = getRandomWord();
      while (game.players.some(p => p.team.some(c => c.toLowerCase() === randomWord.toLowerCase()))) {
        randomWord = getRandomWord();
      }
      finalCharacter = randomWord;
      autoFilled = true;
    }

    player.team.push(finalCharacter);
    player.teamAutoFilled.push(autoFilled);

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
      revealPlotTwist(room);
    }
  });

  socket.on('castVote', (votedPlayerName) => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (!room || !name) return;

    const game = rooms[room].gameState;
    if (!game || (game.activePhase !== 'VOTING' && game.activePhase !== 'FINAL_VOTING')) return;

    if (votedPlayerName === name) {
      return; // Can't vote for self
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
