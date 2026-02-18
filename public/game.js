const socket = io();

// ========================
// STATE
// ========================
let player = { name: '', room: '', ready: false };
let roomState = { host: null, settings: {}, players: [], messages: [] };
let gameState = {
  currentRound: 0,
  totalRounds: 4,
  myTeam: [],
  currentScenario: '',
  currentTwist: '',
  allDrafts: {},
  votes: {},
  voted: false,
  voteLocked: false,
  leaderboard: [],
  myFinalTeam: [],
  draftWarnings: {} // Track duplicate warnings per player
};

let activeTimers = [];
let toastQueue = [];

// ========================
// UI UTILITIES
// ========================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
}

function clearTimers() {
  activeTimers.forEach(t => clearInterval(t));
  activeTimers = [];
}

// ========================
// TOAST NOTIFICATION SYSTEM
// ========================
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#ff5252' : type === 'warning' ? '#ffc107' : '#00bcd4'};
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideInRight 0.3s ease;
    max-width: 300px;
    word-wrap: break-word;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ========================
// INLINE WARNING SYSTEM (Duplicate detection)
// ========================
function updateDraftWarning(character, isDuplicate = false) {
  const warningEl = document.getElementById('draftWarning');
  const charInput = document.getElementById('charInput');
  
  if (!warningEl) return;
  
  if (isDuplicate) {
    warningEl.style.display = 'block';
    warningEl.innerHTML = `
      <strong>⚠️ "${character}" is DUPLICATE!</strong><br>
      Will auto-fill with a random word instead.
    `;
    warningEl.style.background = '#fff3e0';
    warningEl.style.borderColor = '#ff9800';
    charInput.style.borderColor = '#ff9800';
  } else {
    warningEl.style.display = 'none';
    charInput.style.borderColor = '#333';
  }
}

function updateAutoFillWarning() {
  const warningEl = document.getElementById('draftWarning');
  if (!warningEl) return;
  
  if (gameState.myTeam.length === 0) {
    warningEl.style.display = 'block';
    warningEl.innerHTML = `
      <strong>ℹ️ No picks made?</strong><br>
      An auto-fill random word will be added when timer ends.
    `;
    warningEl.style.background = '#e3f2fd';
    warningEl.style.borderColor = '#2196f3';
  }
}

// ========================
// JOIN & LOBBY
// ========================
function joinRoom() {
  const name = document.getElementById('name').value.trim();
  const room = document.getElementById('room').value.trim().toUpperCase();

  if (!name) return alert('Please enter your name.');
  if (!room) return alert('Please enter a room code.');
  if (name.length < 2) return alert('Name must be at least 2 characters.');
  if (room.length < 2) return alert('Room code must be at least 2 characters.');

  player.name = name;
  player.room = room;

  console.log(`Attempting to join room ${room} as ${name}`);
  socket.emit('joinRoom', { name, room });
}

function leaveRoom() {
  socket.disconnect();
  socket.connect();
  showScreen('join');
  document.getElementById('name').value = '';
  document.getElementById('room').value = '';
  player = { name: '', room: '', ready: false };
}

socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('joinError', (msg) => {
  alert('❌ ' + msg);
});

socket.on('gameError', (msg) => {
  alert('❌ ' + msg);
});

socket.on('roomData', (data) => {
  console.log('📍 Received roomData:', data);
  roomState = data;
  const isHost = data.host === player.name;

  document.getElementById('roomCode').textContent = player.room;

  const settingsContent = document.getElementById('settingsContent');
  const hostNote = document.getElementById('hostNote');
  const settingsNote = document.getElementById('settingsNote');
  
  if (isHost) {
    settingsContent.style.display = 'block';
    hostNote.style.display = 'none';
    settingsNote.textContent = '✓ You are the HOST - Change these settings as you like!';
    if (data.settings) {
      if (data.settings.difficulty) document.getElementById('difficulty').value = data.settings.difficulty;
      if (data.settings.plotTwists !== undefined) document.getElementById('plotTwists').checked = data.settings.plotTwists;
    }
  } else {
    settingsContent.style.display = 'none';
    hostNote.style.display = 'block';
    document.getElementById('hostNameDisplay').textContent = data.host || 'Unknown';
  }

  const ul = document.getElementById('playerList');
  ul.innerHTML = '';
  data.players.forEach(p => {
    const li = document.createElement('li');
    li.className = `player-item ${p.ready ? 'ready' : 'not-ready'}`;
    const badge = p.ready ? '✓ ' : '○ ';
    const hostBadge = p.name === data.host ? '👑 ' : '👤 ';
    li.innerHTML = `<span class="ready-badge">${badge}</span>${hostBadge}<strong>${p.name}</strong>`;
    ul.appendChild(li);
  });

  document.getElementById('playerCountLabel').textContent = `(${data.players.length}/6)`;

  if (!data.isGameActive) {
    console.log('✅ Showing lobby - game not active');
    showScreen('lobby');

    const startBtn = document.getElementById('startBtn');
    const readyBtn = document.getElementById('readyBtn');
    const minPlayersMsg = document.getElementById('minPlayersMsg');
    const hostWaiting = document.getElementById('hostWaiting');
    const currentPlayer = data.players.find(p => p.name === player.name);

    if (isHost) {
      startBtn.style.display = 'block';
      hostWaiting.style.display = 'none';
      const readyCount = data.players.filter(p => p.ready).length;
      const allReady = readyCount === data.players.length && data.players.length >= 3;
      if (allReady) {
        startBtn.disabled = false;
        minPlayersMsg.style.display = 'none';
      } else {
        startBtn.disabled = true;
        minPlayersMsg.style.display = 'block';
        minPlayersMsg.textContent = `⚠️ HOST NEEDS: ${readyCount}/${data.players.length} ready players to start (min 3 players)`;
      }
    } else {
      startBtn.style.display = 'none';
      minPlayersMsg.style.display = 'none';
      hostWaiting.style.display = 'block';
      hostWaiting.textContent = '⏳ Waiting for ' + (data.host || 'host') + ' to start...';
    }

    if (currentPlayer) {
      player.ready = currentPlayer.ready;
      if (currentPlayer.ready) {
        readyBtn.textContent = '✓ READY';
        readyBtn.className = 'btn btn-success';
      } else {
        readyBtn.textContent = '○ NOT READY';
        readyBtn.className = 'btn btn-secondary';
      }
    }
  }

  const chatContainer = document.getElementById('chatMessages');
  chatContainer.innerHTML = '';
  data.messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<strong>${msg.player}:</strong> ${msg.text}`;
    chatContainer.appendChild(div);
  });
  chatContainer.scrollTop = chatContainer.scrollHeight;
});

socket.on('settingsUpdated', (settings) => {
  roomState.settings = settings;
  const difficulty = document.getElementById('difficulty');
  const plotTwists = document.getElementById('plotTwists');
  if (difficulty && settings.difficulty) difficulty.value = settings.difficulty;
  if (plotTwists && settings.plotTwists !== undefined) plotTwists.checked = settings.plotTwists;
});

function toggleReady() {
  socket.emit('toggleReady');
}

function updateSetting(key, value) {
  if (roomState.host !== player.name) return;
  const settings = { ...roomState.settings };
  settings[key] = value;
  socket.emit('updateSettings', settings);
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;
  socket.emit('sendMessage', message);
  input.value = '';
}

function sendReaction(emoji) {
  socket.emit('sendReaction', emoji);
}

socket.on('newMessage', (msg) => {
  const chatContainer = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = msg.isReaction ? 'chat-reaction' : 'chat-message';
  if (msg.isReaction) {
    div.innerHTML = `<em>${msg.player}</em> ${msg.text}`;
  } else {
    div.innerHTML = `<strong>${msg.player}:</strong> ${msg.text}`;
  }
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
});

function sendStartGame() {
  socket.emit('startGame');
}

// ========================
// GAME EVENTS
// ========================
socket.on('gameStarting', (data) => {
  gameState.totalRounds = data.totalRounds;
  gameState.myTeam = [];
  gameState.myFinalTeam = [];
  gameState.voted = false;
  gameState.voteLocked = false;
  gameState.draftWarnings = {};
  showScreen('preRound');
});

socket.on('roundStart', (data) => {
  gameState.currentRound = data.roundNumber;
  gameState.myTeam = [];
  gameState.allDrafts = {};
  gameState.voted = false;
  gameState.draftWarnings = {};

  clearTimers();

  const isFinal = data.isFinalRound;
  document.getElementById('roundLabel').textContent = isFinal 
    ? `FINAL ROUND - ASSEMBLE YOUR ULTIMATE TEAM!`
    : `ROUND ${data.roundNumber} OF ${data.totalRounds}`;

  let countdown = 3;
  document.getElementById('countdown').textContent = countdown;

  const timer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      document.getElementById('countdown').textContent = countdown;
    } else {
      clearInterval(timer);
    }
  }, 1000);

  activeTimers.push(timer);
});

socket.on('scenarioRevealed', (data) => {
  clearTimers();
  gameState.currentScenario = data.scenario;
  gameState.myTeam = [];
  gameState.voteLocked = false;

  document.getElementById('currentRound').textContent = gameState.currentRound;
  document.getElementById('scenarioText').textContent = `📋 BUILD A TEAM TO ${data.scenario}`;
  const myTeamList = document.getElementById('myTeam');
  if (myTeamList) myTeamList.innerHTML = '';
  const livePicksList = document.getElementById('livePicksList');
  if (livePicksList) livePicksList.innerHTML = '';
  const charInput = document.getElementById('charInput');
  if (charInput) {
    charInput.value = '';
    charInput.focus();
  }
  
  // Create warning element if it doesn't exist
  let warningEl = document.getElementById('draftWarning');
  if (!warningEl) {
    warningEl = document.createElement('div');
    warningEl.id = 'draftWarning';
    warningEl.style.cssText = `
      display: none;
      padding: 12px;
      margin: 15px auto;
      max-width: 350px;
      border-left: 4px solid;
      border-radius: 6px;
      font-size: 0.9em;
      font-weight: bold;
    `;
    charInput.parentElement.insertBefore(warningEl, charInput.nextSibling);
  }
  
  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.style.display = 'block';
    lockBtn.disabled = true;
    lockBtn.textContent = '🔒 LOCK IN MY TEAM (need 2)';
    lockBtn.className = 'btn btn-success';
  }
  
  if (document.getElementById('draftCounter')) {
    document.getElementById('draftCounter').textContent = '(0/2)';
    document.getElementById('draftCounter').style.color = '#666';
  }

  showScreen('scenarioScreen');

  let timeLeft = data.draftTimeRemaining;
  document.getElementById('draftTimer').textContent = timeLeft;

  const draftTimer = setInterval(() => {
    timeLeft--;
    document.getElementById('draftTimer').textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(draftTimer);
      updateAutoFillWarning(); // Show warning about auto-fill
    }
  }, 1000);

  activeTimers.push(draftTimer);
});

// ========================
// DRAFT PHASE - WITH DUPLICATE DETECTION
// ========================
document.addEventListener('DOMContentLoaded', () => {
  const charInput = document.getElementById('charInput');
  if (charInput) {
    charInput.addEventListener('keypress', handleDraftInput);
    charInput.addEventListener('input', handleDraftChange);
  }
});

function handleDraftChange(e) {
  const char = e.target.value.trim();
  if (!char) {
    updateDraftWarning('', false);
    return;
  }
  
  const charLower = char.toLowerCase();
  
  // Check for duplicates in own team
  const isDuplicate = gameState.myTeam.some(c => c.toLowerCase() === charLower);
  
  // Check for duplicates in other players' teams
  const otherPlayersHave = Object.values(gameState.allDrafts).some(c => c.toLowerCase() === charLower);
  
  if (isDuplicate || otherPlayersHave) {
    updateDraftWarning(char, true);
  } else {
    updateDraftWarning(char, false);
  }
}

function handleDraftInput(e) {
  if (e.key === 'Enter' && e.target.value.trim()) {
    const char = e.target.value.trim();
    
    if (gameState.myTeam.length >= 2) {
      showToast('⚠️ You can draft max 2 characters!', 'error');
      return;
    }
    
    const charLower = char.toLowerCase();
    
    // Check own team
    if (gameState.myTeam.some(c => c.toLowerCase() === charLower)) {
      showToast(`❌ You already drafted "${char}"! Auto-filling with random word...`, 'error', 4000);
      socket.emit('draftCharacter', char);
      e.target.value = '';
      updateDraftWarning('', false);
      return;
    }
    
    // Check other players
    if (Object.values(gameState.allDrafts).some(c => c.toLowerCase() === charLower)) {
      showToast(`❌ "${char}" was picked by another player! Auto-filling with random word...`, 'error', 4000);
      socket.emit('draftCharacter', char);
      e.target.value = '';
      updateDraftWarning('', false);
      return;
    }
    
    // Valid pick
    gameState.myTeam.push(char);
    const li = document.createElement('li');
    li.textContent = char;
    li.classList.add('new-pick');
    const myTeamList = document.getElementById('myTeam');
    if (myTeamList) myTeamList.appendChild(li);
    
    updateDraftCounter();
    socket.emit('draftCharacter', char);
    
    const lockBtn = document.getElementById('lockDraftBtn');
    if (lockBtn && gameState.myTeam.length === 2) {
      lockBtn.disabled = false;
      lockBtn.textContent = '🔒 LOCK IN MY TEAM';
    }

    e.target.value = '';
    updateDraftWarning('', false);
  }
}

function updateDraftCounter() {
  const counter = document.getElementById('draftCounter');
  if (counter) {
    const count = gameState.myTeam.length;
    counter.textContent = `(${count}/2)`;
    if (count >= 2) {
      counter.style.color = '#ff4081';
      counter.style.fontWeight = 'bold';
    } else {
      counter.style.color = '#666';
    }
  }
}

function lockDraft() {
  if (gameState.myTeam.length < 2) {
    alert('⚠️ You must have 2 characters to lock in!');
    return;
  }
  socket.emit('lockDraft');
  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = '✅ TEAM LOCKED!';
  }
}

socket.on('draftError', (message) => {
  showToast(message, 'error');
});

socket.on('draftUpdate', (data) => {
  gameState.allDrafts = {};
  const picksList = document.getElementById('livePicksList');
  if (!picksList) return;
  picksList.innerHTML = '';

  data.allDrafts.forEach((pick, idx) => {
    gameState.allDrafts[pick.name] = pick.character;

    const li = document.createElement('li');
    li.textContent = `${pick.name} → ${pick.character}`;
    li.classList.add('live-pick');
    li.style.animationDelay = `${idx * 0.05}s`;
    picksList.appendChild(li);
  });
  
  picksList.scrollTop = picksList.scrollHeight;
});

socket.on('draftSuccess', (data) => {
  console.log(`✓ Drafted: ${data.character} (${data.teamSize}/2)`);
});

socket.on('playerLocked', (data) => {
  if (data.phase === 'DRAFT') {
    showToast(`🔒 ${data.playerName} locked in their team!`, 'info', 2000);
  }
});

// ========================
// PLOT TWIST
// ========================
socket.on('plotTwistRevealed', (data) => {
  clearTimers();
  gameState.currentTwist = data.twist;
  document.getElementById('twistText').textContent = data.twist;
  showScreen('twistScreen');
});

// ========================
// FINAL TEAM REVEAL (Round 4)
// ========================
socket.on('finalTeamRevealed', (data) => {
  clearTimers();
  gameState.myFinalTeam = [];

  const charInput = document.getElementById('charInput');
  if (charInput) {
    charInput.value = '';
    charInput.focus();
  }

  const myTeamList = document.getElementById('myTeam');
  if (myTeamList) {
    myTeamList.innerHTML = '';
    // Display existing characters from rounds 1-3 (locked, non-editable)
    const myCurrentTeam = data.playerTeams.find(t => t.name === player.name)?.teamSoFar || [];
    myCurrentTeam.forEach(char => {
      const li = document.createElement('li');
      li.textContent = char;
      li.classList.add('existing-pick');
      myTeamList.appendChild(li);
    });
    gameState.myFinalTeam = [...myCurrentTeam];
  }

  const livePicksList = document.getElementById('livePicksList');
  if (livePicksList) livePicksList.innerHTML = '';

  // Remove warning since round 4 is just additions
  const warningEl = document.getElementById('draftWarning');
  if (warningEl) warningEl.style.display = 'none';

  document.getElementById('scenarioText').textContent = `🎯 ADD TO YOUR ULTIMATE TEAM (${gameState.myFinalTeam.length}/6)`;

  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.style.display = 'block';
    lockBtn.disabled = true;
    lockBtn.textContent = '🔒 FINALIZE TEAM';
    lockBtn.className = 'btn btn-success';
    lockBtn.onclick = lockFinalDraft;
  }

  if (document.getElementById('draftCounter')) {
    document.getElementById('draftCounter').textContent = `(${gameState.myFinalTeam.length}/6)`;
    document.getElementById('draftCounter').style.color = '#666';
  }

  showScreen('scenarioScreen');

  let timeLeft = data.draftTimeRemaining;
  document.getElementById('draftTimer').textContent = timeLeft;

  const draftTimer = setInterval(() => {
    timeLeft--;
    document.getElementById('draftTimer').textContent = timeLeft;
    if (timeLeft <= 0) clearInterval(draftTimer);
  }, 1000);

  activeTimers.push(draftTimer);
});

// Final round draft handler - separated to allow up to 6 total characters
document.addEventListener('DOMContentLoaded', () => {
  // This will be handled separately in event listener for final round
});

function handleFinalRoundInput(e) {
  if (e.key === 'Enter' && e.target.value.trim()) {
    const char = e.target.value.trim();
    
    const isFinalRound = document.getElementById('scenarioText')?.textContent.includes('ULTIMATE TEAM');
    if (!isFinalRound) return;
    
    if (gameState.myFinalTeam.length >= 6) {
      showToast('⚠️ Your team is full (6 characters max)!', 'error');
      return;
    }
    
    if (gameState.myFinalTeam.some(c => c.toLowerCase() === char.toLowerCase())) {
      showToast(`❌ "${char}" is already in your team!`, 'error', 3000);
      return;
    }
    
    gameState.myFinalTeam.push(char);
    
    const li = document.createElement('li');
    li.textContent = char;
    li.classList.add('new-pick');
    const myTeamList = document.getElementById('myTeam');
    if (myTeamList) myTeamList.appendChild(li);
    
    socket.emit('draftCharacter', char);
    
    const counter = document.getElementById('draftCounter');
    if (counter) {
      counter.textContent = `(${gameState.myFinalTeam.length}/6)`;
      if (gameState.myFinalTeam.length > 0) {
        const lockBtn = document.getElementById('lockDraftBtn');
        if (lockBtn) {
          lockBtn.disabled = false;
          lockBtn.textContent = `🔒 FINALIZE TEAM (${gameState.myFinalTeam.length}/6)`;
        }
      }
    }
    
    e.target.value = '';
  }
}

document.addEventListener('keypress', (e) => {
  if (e.target.id === 'charInput' && document.getElementById('scenarioScreen').classList.contains('active')) {
    const isFinalRound = document.getElementById('scenarioText')?.textContent.includes('ULTIMATE TEAM');
    if (isFinalRound) {
      handleFinalRoundInput(e);
    }
  }
});

function lockFinalDraft() {
  socket.emit('lockFinalDraft');
  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = '✅ TEAM FINALIZED!';
  }
}

// ========================
// VOTING PHASE - HIDE OWN TEAM
// ========================
socket.on('votingPhaseStart', (data) => {
  clearTimers();
  const charInput = document.getElementById('charInput');
  if (charInput) charInput.value = '';
  gameState.voted = false;
  gameState.voteLocked = false;

  const scenarioDisplay = document.getElementById('votingScenario');
  const twistDisplay = document.getElementById('votingTwist');
  if (scenarioDisplay) scenarioDisplay.textContent = data.scenario;
  if (twistDisplay) twistDisplay.textContent = data.twist;

  const grid = document.getElementById('votingTeams');
  if (grid) grid.innerHTML = '';

  // Filter out own team
  data.teams.forEach((team, idx) => {
    if (!team.team || team.team.length === 0) {
      return;
    }
    
    // SKIP OWN TEAM
    if (team.name === player.name) {
      return;
    }
    
    const card = document.createElement('div');
    card.className = 'vote-card';
    card.style.animationDelay = `${idx * 0.1}s`;
    card.innerHTML = `
      <h3>${team.name}</h3>
      <ul class="team-display">
        ${team.team.map(t => `<li>• ${t}</li>`).join('')}
      </ul>
      <button class="btn btn-vote" onclick="castVote('${team.name}')">VOTE FOR THIS TEAM</button>
      <p class="vote-count"><span class="vote-badge">${team.votes || 0}</span></p>
    `;
    if (grid) grid.appendChild(card);
  });

  // Show message if only one team visible (user's own team hidden)
  if (grid && grid.children.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = '(Your team is not shown—you can\'t vote for yourself!)';
    msg.style.cssText = 'color: #999; font-size: 1.1em; margin: 20px; font-weight: bold;';
    grid.appendChild(msg);
  }

  const lockSection = document.getElementById('voteLockSection');
  if (lockSection) {
    lockSection.style.display = 'flex';
  }

  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.style.display = 'none';
    lockBtn.disabled = true;
    lockBtn.textContent = '🔒 LOCK MY VOTE';
    lockBtn.className = 'btn btn-success';
  }

  const votedIndication = document.getElementById('votedIndication');
  if (votedIndication) votedIndication.style.display = 'none';

  showScreen('votingScreen');

  let timeLeft = 30;
  document.getElementById('voteTimer').textContent = timeLeft;

  const voteTimer = setInterval(() => {
    timeLeft--;
    document.getElementById('voteTimer').textContent = timeLeft;
    if (timeLeft <= 0) clearInterval(voteTimer);
  }, 1000);

  activeTimers.push(voteTimer);
});

socket.on('finalVotingPhaseStart', (data) => {
  clearTimers();
  gameState.voted = false;
  gameState.voteLocked = false;

  const scenarioDisplay = document.getElementById('votingScenario');
  const twistDisplay = document.getElementById('votingTwist');
  if (scenarioDisplay) scenarioDisplay.textContent = '🌟 FINAL TEAM MATCHUP 🌟';
  if (twistDisplay) twistDisplay.textContent = 'Whose ultimate team is the best?';

  const grid = document.getElementById('votingTeams');
  if (grid) grid.innerHTML = '';

  // Filter out own team
  data.teams.forEach((team, idx) => {
    if (!team.team || team.team.length === 0) {
      return;
    }
    
    // SKIP OWN TEAM
    if (team.name === player.name) {
      return;
    }
    
    const card = document.createElement('div');
    card.className = 'vote-card final-vote';
    card.style.animationDelay = `${idx * 0.1}s`;
    card.innerHTML = `
      <h3>${team.name}</h3>
      <ul class="team-display final-team-display">
        ${team.team.map(t => `<li>• ${t}</li>`).join('')}
      </ul>
      <button class="btn btn-vote" onclick="castVote('${team.name}')">VOTE FOR THIS TEAM</button>
      <p class="vote-count"><span class="vote-badge">${team.votes || 0}</span></p>
    `;
    if (grid) grid.appendChild(card);
  });

  // Show message if only one team visible
  if (grid && grid.children.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = '(Your team is not shown—you can\'t vote for yourself!)';
    msg.style.cssText = 'color: #999; font-size: 1.1em; margin: 20px; font-weight: bold;';
    grid.appendChild(msg);
  }

  const lockSection = document.getElementById('voteLockSection');
  if (lockSection) {
    lockSection.style.display = 'flex';
  }

  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.style.display = 'none';
    lockBtn.disabled = true;
  }

  const votedIndication = document.getElementById('votedIndication');
  if (votedIndication) votedIndication.style.display = 'none';

  showScreen('votingScreen');

  let timeLeft = 30;
  document.getElementById('voteTimer').textContent = timeLeft;

  const voteTimer = setInterval(() => {
    timeLeft--;
    document.getElementById('voteTimer').textContent = timeLeft;
    if (timeLeft <= 0) clearInterval(voteTimer);
  }, 1000);

  activeTimers.push(voteTimer);
});

function castVote(playerName) {
  socket.emit('castVote', playerName);
  gameState.voted = true;
  
  document.querySelectorAll('.vote-card').forEach(card => {
    const cardName = card.querySelector('h3').textContent;
    const voteBtn = card.querySelector('.btn-vote');
    if (cardName === playerName) {
      card.style.borderColor = '#4caf50';
      card.style.borderWidth = '3px';
      voteBtn.textContent = '✓ VOTED';
      voteBtn.className = 'btn btn-vote btn-success';
    } else {
      card.style.borderColor = '#00bcd4';
      card.style.borderWidth = '2px';
      voteBtn.textContent = 'VOTE FOR THIS TEAM';
      voteBtn.className = 'btn btn-vote';
    }
  });
  
  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.style.display = 'inline-block';
    lockBtn.disabled = false;
  }

  showToast(`✓ You voted for ${playerName}!`, 'info', 2000);
}

function lockVote() {
  if (!gameState.voted) {
    alert('⚠️ Please cast a vote first!');
    return;
  }
  socket.emit('lockVote');
  gameState.voteLocked = true;
  
  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = '✓ VOTE LOCKED';
    lockBtn.className = 'btn btn-success';
  }

  const votedIndication = document.getElementById('votedIndication');
  if (votedIndication) votedIndication.style.display = 'block';

  showToast('🔒 Your vote is locked!', 'info', 2000);
}

socket.on('voteUpdate', (voteCount) => {
  document.querySelectorAll('.vote-card').forEach(card => {
    const playerName = card.querySelector('h3').textContent;
    const badge = card.querySelector('.vote-badge');
    if (badge) badge.textContent = voteCount[playerName] || 0;
  });
});

socket.on('voteLockUpdate', (data) => {
  const statusDiv = document.getElementById('voteLockStatus');
  if (statusDiv) {
    statusDiv.textContent = `🔒 ${data.lockedPlayers.length}/${data.totalPlayers} votes locked`;
    if (data.lockedPlayers.length === data.totalPlayers) {
      statusDiv.textContent = '✓ All votes locked! Tallying results...';
      statusDiv.style.color = '#4caf50';
    }
  }
});

// ========================
// RESULTS WITH BONUS BREAKDOWN
// ========================
socket.on('roundResults', (data) => {
  clearTimers();
  document.getElementById('resultRound').textContent = data.round;

  const winnerBox = document.getElementById('roundWinner');
  
  // Build detailed bonus breakdown
  let bonusHTML = '<div class="bonus-breakdown">';
  
  if (data.winner) {
    const winnerPoints = data.roundPoints[data.winner];
    const votesReceived = data.voteCount[data.winner];
    
    bonusHTML += `
      <div class="winner-announcement">
        <p>🏆 <span class="winner-name">${data.winner}</span> WINS THIS ROUND!</p>
        <p class="winner-points">+${winnerPoints} POINTS</p>
      </div>
      
      <div class="bonus-details">
        <h4>💰 Point Breakdown:</h4>
        <ul>
          <li><strong>Base Points:</strong> +10</li>
          <li><strong>Team Formed:</strong> +15</li>
          <li><strong>Full Team (2):</strong> +20</li>
          <li><strong>Most Votes (${votesReceived}):</strong> +${data.bonuses?.winBonus || 50}</li>
          ${data.bonuses?.speedBonus ? `<li><strong>Speed Bonus:</strong> +${data.bonuses.speedBonus} (first to lock!)</li>` : ''}
          ${data.bonuses?.unanimousBonus ? `<li><strong>Unanimous Vote Bonus:</strong> +${data.bonuses.unanimousBonus} (all players voted same!)</li>` : ''}
        </ul>
      </div>
    `;
  } else if (data.isTie) {
    bonusHTML += `
      <p>🤝 It's a TIE! Bonus points distributed to tied players.</p>
      <div class="bonus-details">
        <h4>💰 Tie Bonus Breakdown:</h4>
        <ul>
          <li><strong>Base Points:</strong> +10</li>
          <li><strong>Team Formed:</strong> +15</li>
          <li><strong>Full Team (2):</strong> +20</li>
          <li><strong>Tie Bonus:</strong> +${data.bonuses?.tieBonus || 35} (shared leadership!)</li>
        </ul>
      </div>
    `;
  }
  
  bonusHTML += '</div>';
  if (winnerBox) winnerBox.innerHTML = bonusHTML;

  const breakdown = document.getElementById('voteBreakdown');
  breakdown.innerHTML = '';
  Object.entries(data.voteCount).forEach(([player, count]) => {
    const li = document.createElement('li');
    li.textContent = `${player}: ${count} vote${count !== 1 ? 's' : ''}`;
    breakdown.appendChild(li);
  });

  const leaderboard = document.getElementById('leaderboardResults');
  leaderboard.innerHTML = '';
  data.leaderboard.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-entry';
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[idx] || '•';
    li.innerHTML = `
      <span class="medal">${medal}</span>
      <span class="name">${entry.name}</span>
      <span class="score">${entry.score}pts</span>
    `;
    leaderboard.appendChild(li);
  });

  showScreen('resultsScreen');
});

socket.on('finalRoundResults', (data) => {
  clearTimers();
  document.getElementById('resultRound').textContent = '4 (FINAL)';

  const winnerBox = document.getElementById('roundWinner');
  
  let bonusHTML = '<div class="bonus-breakdown">';
  
  if (data.winner) {
    const winnerPoints = data.roundPoints[data.winner];
    const votesReceived = data.voteCount[data.winner];
    
    bonusHTML += `
      <div class="winner-announcement">
        <p>🏆 <span class="winner-name">${data.winner}</span> WINS THE FINAL ROUND!</p>
        <p class="winner-points">+${winnerPoints} POINTS (FINAL BONUS)</p>
      </div>
      
      <div class="bonus-details">
        <h4>💰 Final Round Point Breakdown:</h4>
        <ul>
          <li><strong>Most Votes (${votesReceived}):</strong> +${data.bonuses?.finalWinBonus || 100}</li>
          ${data.bonuses?.completeTeamBonus ? `<li><strong>Full Team (6):</strong> +${data.bonuses.completeTeamBonus}</li>` : ''}
          ${data.bonuses?.finalSpeedBonus ? `<li><strong>Final Flash Bonus:</strong> +${data.bonuses.finalSpeedBonus}</li>` : ''}
        </ul>
      </div>
    `;
  } else {
    bonusHTML += '<p>🤝 Final Round Tie! Highest vote-getters split the final bonus.</p>';
  }
  
  bonusHTML += '</div>';
  if (winnerBox) winnerBox.innerHTML = bonusHTML;

  const breakdown = document.getElementById('voteBreakdown');
  breakdown.innerHTML = '';
  Object.entries(data.voteCount).forEach(([player, count]) => {
    const li = document.createElement('li');
    li.textContent = `${player}: ${count} vote${count !== 1 ? 's' : ''}`;
    breakdown.appendChild(li);
  });

  const leaderboard = document.getElementById('leaderboardResults');
  leaderboard.innerHTML = '';
  data.leaderboard.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-entry';
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[idx] || '•';
    li.innerHTML = `
      <span class="medal">${medal}</span>
      <span class="name">${entry.name}</span>
      <span class="score">${entry.score}pts</span>
    `;
    leaderboard.appendChild(li);
  });

  showScreen('resultsScreen');
});

// ========================
// FINAL LEADERBOARD
// ========================
socket.on('gameEnded', (data) => {
  clearTimers();

  const final = document.getElementById('finalLeaderboard');
  final.innerHTML = '';

  data.finalLeaderboard.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-entry final-entry';
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[idx] || '•';
    const emoji = idx === 0 ? '🎉' : idx === 1 ? '⭐' : '🌟';
    const breakdown = entry.breakdown.map((pts, round) => `R${round + 1}: ${pts}`).join(' | ');
    li.innerHTML = `
      <div class="final-entry-content">
        <div class="final-entry-header">
          <span class="medal">${medal}</span>
          <span class="name">${entry.name}</span>
          <span class="score">${entry.score}pts</span>
          <span class="emoji">${emoji}</span>
        </div>
        <div class="final-entry-detail">${breakdown}</div>
      </div>
    `;
    final.appendChild(li);
  });

  showScreen('finalScreen');
});

function sendPlayAgain() {
  socket.emit('playAgain');
}

function goToLobby() {
  clearTimers();
  player = { name: '', room: '', ready: false };
  roomState = { host: null, settings: {}, players: [], messages: [] };
  gameState = {
    currentRound: 0,
    totalRounds: 4,
    myTeam: [],
    currentScenario: '',
    currentTwist: '',
    allDrafts: {},
    votes: {},
    voted: false,
    voteLocked: false,
    leaderboard: [],
    myFinalTeam: [],
    draftWarnings: {}
  };
  socket.disconnect();
  socket.connect();
  showScreen('join');
  document.getElementById('name').value = '';
  document.getElementById('room').value = '';
}

// ========================
// INITIALIZATION
// ========================
window.addEventListener('beforeunload', () => {
  socket.disconnect();
});

// Add toast animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(400px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(400px);
    }
  }
`;
document.head.appendChild(style);
