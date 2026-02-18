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
  allDraftsList: [],
  votes: {},
  voted: false,
  voteLocked: false,
  leaderboard: [],
  myFinalTeam: [],
  draftWarnings: {}
};

let activeTimers = [];
let toastQueue = [];
let devMode = false; // Hidden dev mode for testing

// ========================
// UI UTILITIES
// ========================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    // Auto-focus first focusable element for accessibility
    const firstFocusable = screen.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable && !document.activeElement.matches('input[type="text"]')) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
  }
}

function clearTimers() {
  activeTimers.forEach(t => clearInterval(t));
  activeTimers = [];
}

// ========================
// TOAST NOTIFICATION SYSTEM (IMPROVED)
// ========================
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
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
    font-weight: bold;
  `;
  
  // Add close button for accessibility
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 1.2em;
    margin-left: 10px;
    padding: 0;
  `;
  closeBtn.onclick = () => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  };
  
  toast.appendChild(closeBtn);
  document.body.appendChild(toast);
  
  const timeout = setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ========================
// INLINE WARNING SYSTEM (IMPROVED WITH VISUAL FEEDBACK)
// ========================
function updateDraftWarning(character, isDuplicate = false) {
  const warningEl = document.getElementById('draftWarning');
  const charInput = document.getElementById('charInput');
  
  if (!warningEl) return;
  
  if (isDuplicate) {
    warningEl.style.display = 'flex';
    warningEl.style.alignItems = 'center';
    warningEl.style.gap = '10px';
    warningEl.innerHTML = `
      <span style="font-size: 1.2em;">⚠️</span>
      <div style="text-align: left;">
        <strong>"${character}" is DUPLICATE!</strong><br>
        <small>Will auto-fill with a random word instead.</small>
      </div>
    `;
    warningEl.style.background = '#fff3e0';
    warningEl.style.borderColor = '#ff9800';
    charInput.style.borderColor = '#ff9800';
    charInput.style.borderWidth = '3px';
  } else {
    warningEl.style.display = 'none';
    charInput.style.borderColor = '#333';
    charInput.style.borderWidth = '2px';
  }
}

function updateAutoFillWarning() {
  const warningEl = document.getElementById('draftWarning');
  if (!warningEl) return;
  
  if (gameState.myTeam.length === 0) {
    warningEl.style.display = 'flex';
    warningEl.style.alignItems = 'center';
    warningEl.style.gap = '10px';
    warningEl.innerHTML = `
      <span style="font-size: 1.2em;">ℹ️</span>
      <div style="text-align: left;">
        <strong>Time Running Out!</strong><br>
        <small>No picks made? Random words will fill your team.</small>
      </div>
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

  if (!name) {
    showToast('Please enter your name!', 'warning');
    document.getElementById('name').focus();
    return;
  }
  if (!room) {
    showToast('Please enter a room code!', 'warning');
    document.getElementById('room').focus();
    return;
  }
  if (name.length < 2) {
    showToast('Name must be at least 2 characters.', 'warning');
    return;
  }
  if (room.length < 2) {
    showToast('Room code must be at least 2 characters.', 'warning');
    return;
  }

  player.name = name;
  player.room = room;

  console.log(`Attempting to join room ${room} as ${name}`);
  socket.emit('joinRoom', { name, room });
}

function leaveRoom() {
  if (confirm('Are you sure you want to leave? You\'ll disconnect from the room.')) {
    socket.disconnect();
    socket.connect();
    showScreen('join');
    document.getElementById('name').value = '';
    document.getElementById('room').value = '';
    player = { name: '', room: '', ready: false };
  }
}

socket.on('connect', () => {
  console.log('✓ Socket connected:', socket.id);
});

socket.on('joinError', (msg) => {
  showToast(msg, 'error', 5000);
});

socket.on('gameError', (msg) => {
  showToast(msg, 'error', 5000);
});

socket.on('roomData', (data) => {
  console.log('📍 Received roomData:', data);
  roomState = data;
  const isHost = data.host === player.name;

  document.getElementById('roomCode').textContent = player.room;
  document.getElementById('playerCountBadge').textContent = `${data.players.length}/6`;
  
  // Update color based on player count
  const badge = document.getElementById('playerCountBadge');
  if (data.players.length >= 6) {
    badge.style.background = '#ff5252';
  } else if (data.players.length >= 5) {
    badge.style.background = '#ffc107';
  } else {
    badge.style.background = '#4caf50';
  }

  const settingsContent = document.getElementById('settingsContent');
  const hostNote = document.getElementById('hostNote');
  const settingsNote = document.getElementById('settingsNote');
  
  if (isHost) {
    settingsContent.style.display = 'block';
    hostNote.style.display = 'none';
    settingsNote.textContent = '✓ You are the HOST - Configure the game settings below!';
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
  data.players.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = `player-item ${p.ready ? 'ready' : 'not-ready'}`;
    li.setAttribute('role', 'listitem');
    const badge = p.ready ? '✓ ' : '○ ';
    const hostBadge = p.name === data.host ? '👑 ' : '';
    const isMe = p.name === player.name ? ' (YOU)' : '';
    li.innerHTML = `
      <span class="ready-badge">${badge}</span>
      <span>${hostBadge}<strong>${p.name}</strong>${isMe}</span>
      <span style="margin-left: auto; font-size: 0.85em; opacity: 0.7;">#${idx + 1}</span>
    `;
    ul.appendChild(li);
  });

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
        startBtn.style.background = '#4caf50';
        startBtn.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.6)';
        minPlayersMsg.style.display = 'none';
      } else {
        startBtn.disabled = true;
        startBtn.style.background = '#ccc';
        startBtn.style.boxShadow = 'none';
        minPlayersMsg.style.display = 'block';
        minPlayersMsg.innerHTML = `
          <strong>⏳ Waiting for Players:</strong> 
          ${readyCount}/${data.players.length} ready 
          ${data.players.length < 3 ? '(Need 3+ players)' : ''}
        `;
      }
    } else {
      startBtn.style.display = 'none';
      minPlayersMsg.style.display = 'none';
      hostWaiting.style.display = 'block';
      hostWaiting.textContent = '⏳ Waiting for ' + (data.host || 'host') + ' to start the game...';
    }

    if (currentPlayer) {
      player.ready = currentPlayer.ready;
      if (currentPlayer.ready) {
        readyBtn.textContent = '✓ READY';
        readyBtn.className = 'btn btn-success';
        readyBtn.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.5)';
      } else {
        readyBtn.textContent = '○ NOT READY';
        readyBtn.className = 'btn btn-secondary';
        readyBtn.style.boxShadow = 'none';
      }
    }
  }

  const chatContainer = document.getElementById('chatMessages');
  if (chatContainer) {
    chatContainer.innerHTML = '';
    data.messages.slice(-10).forEach(msg => {
      const div = document.createElement('div');
      div.className = 'chat-message';
      div.innerHTML = `<strong>${msg.player}:</strong> ${msg.text}`;
      chatContainer.appendChild(div);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
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
  input.focus();
}

function sendReaction(emoji) {
  socket.emit('sendReaction', emoji);
}

socket.on('newMessage', (msg) => {
  const chatContainer = document.getElementById('chatMessages');
  if (!chatContainer) return;
  
  const div = document.createElement('div');
  div.className = msg.isReaction ? 'chat-reaction' : 'chat-message';
  if (msg.isReaction) {
    div.innerHTML = `<em>${msg.player}</em> ${msg.text}`;
  } else {
    div.innerHTML = `<strong>${msg.player}:</strong> ${msg.text}`;
  }
  chatContainer.appendChild(div);
  
  // Keep only last 10 messages
  while (chatContainer.children.length > 10) {
    chatContainer.firstChild.remove();
  }
  
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
  showToast('🎉 Game starting! Get ready!', 'info');
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
    ? `🏆 FINAL ROUND - ASSEMBLE YOUR ULTIMATE TEAM! 🏆`
    : `📍 ROUND ${data.roundNumber} OF 3`;

  let countdown = 3;
  document.getElementById('countdown').textContent = countdown;
  document.getElementById('countdown').style.fontSize = '10em';

  const timer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      document.getElementById('countdown').textContent = countdown;
    } else {
      clearInterval(timer);
    }
  }, 1000);

  activeTimers.push(timer);
  showScreen('preRound');
});

socket.on('scenarioRevealed', (data) => {
  clearTimers();
  gameState.currentScenario = data.scenario;
  gameState.myTeam = [];
  gameState.voteLocked = false;

  document.getElementById('currentRound').textContent = gameState.currentRound;
  document.getElementById('scenarioText').textContent = `BUILD A TEAM TO: ${data.scenario}`;
  
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
    lockBtn.style.display = 'inline-block';
    lockBtn.disabled = true;
    lockBtn.textContent = '🔓 LOCK IN MY TEAM (need 2)';
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
    const timerEl = document.getElementById('draftTimer');
    if (timerEl) {
      timerEl.textContent = timeLeft;
      // Color change as time runs out
      if (timeLeft <= 10) {
        timerEl.style.color = '#ff5252';
        timerEl.style.fontWeight = 'bold';
      }
    }
    if (timeLeft <= 0) {
      clearInterval(draftTimer);
      updateAutoFillWarning();
    }
  }, 1000);

  activeTimers.push(draftTimer);
});

// ========================
// DRAFT PHASE - WITH DUPLICATE DETECTION & CONFIRM BUTTON
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
  const isDuplicate = gameState.myTeam.some(c => c.toLowerCase() === charLower);
  const otherPlayersHave = gameState.allDraftsList.some(p => 
    p.name !== player.name && p.character.toLowerCase() === charLower
  );
  
  if (isDuplicate || otherPlayersHave) {
    updateDraftWarning(char, true);
  } else {
    updateDraftWarning(char, false);
  }
}

function handleDraftInput(e) {
  if (e.key === 'Enter' && e.target.value.trim()) {
    submitDraft(e.target.value.trim());
  }
}

function submitDraft(char) {
  if (gameState.myTeam.length >= 2) {
    showToast('⚠️ You can draft max 2 characters!', 'warning');
    return;
  }

  const charLower = char.toLowerCase();
  const isDupOwn = gameState.myTeam.some(c => c.toLowerCase() === charLower);
  const isDupOther = gameState.allDraftsList.some(p =>
    p.name !== player.name && p.character.toLowerCase() === charLower
  );

  if (isDupOwn) {
    showToast(`❌ You already drafted "${char}"! Auto-filling instead...`, 'error', 4000);
  } else if (isDupOther) {
    showToast(`❌ "${char}" was picked by another player! Auto-filling instead...`, 'error', 4000);
  }

  socket.emit('draftCharacter', char);
  const charInput = document.getElementById('charInput');
  if (charInput) {
    charInput.value = '';
    charInput.focus();
  }
  updateDraftWarning('', false);
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
    showToast('⚠️ You must have 2 characters to lock in!', 'warning');
    return;
  }
  socket.emit('lockDraft');
  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = '✅ TEAM LOCKED!';
    showToast('🔒 Your team is locked in!', 'info');
  }
}

socket.on('draftError', (message) => {
  showToast(message, 'error');
});

socket.on('draftUpdate', (data) => {
  gameState.allDraftsList = data.allDrafts || [];

  const picksList = document.getElementById('livePicksList');
  if (!picksList) return;
  picksList.innerHTML = '';

  data.allDrafts.forEach((pick, idx) => {
    const li = document.createElement('li');
    const autoFillBadge = pick.autoFilled ? ' 🔄 (auto-filled)' : '';
    li.textContent = `${pick.name} → ${pick.character}${autoFillBadge}`;
    li.classList.add('live-pick');
    if (pick.autoFilled) li.classList.add('live-pick-duplicate');
    li.style.animationDelay = `${idx * 0.05}s`;
    picksList.appendChild(li);
  });

  picksList.scrollTop = picksList.scrollHeight;

  // Sync my team from server list
  const myTeamList = document.getElementById('myTeam');
  if (myTeamList) myTeamList.innerHTML = '';

  gameState.myTeam = data.allDrafts
    .filter(p => p.name === player.name)
    .map(p => p.character);

  data.allDrafts
    .filter(p => p.name === player.name)
    .forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.character;
      if (p.autoFilled) {
        li.classList.add('draft-duplicate');
        li.appendChild(document.createElement('br'));
        const small = document.createElement('small');
        small.textContent = '(auto-filled)';
        li.appendChild(small);
      }
      if (myTeamList) myTeamList.appendChild(li);
    });

  updateDraftCounter();

  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    if (gameState.myTeam.length >= 2) {
      lockBtn.disabled = false;
      lockBtn.textContent = '🔒 LOCK IN MY TEAM';
    } else {
      lockBtn.disabled = true;
      lockBtn.textContent = `🔓 LOCK IN MY TEAM (${gameState.myTeam.length}/2)`;
    }
  }
});

socket.on('draftSuccess', (data) => {
  console.log(`✓ Drafted: ${data.character} (${data.teamSize}/2)`);
});

socket.on('playerLocked', (data) => {
  if (data.phase === 'DRAFT') {
    showToast(`🔒 ${data.playerName} locked in!`, 'info', 2000);
  }
});

// ========================
// PLOT TWIST
// ========================
socket.on('plotTwistRevealed', (data) => {
  clearTimers();
  gameState.currentTwist = data.twist;
  document.getElementById('twistText').textContent = `"${data.twist}"`;
  showScreen('twistScreen');
  showToast('🌀 Plot twist incoming!', 'warning');
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
    const myCurrentTeam = data.playerTeams.find(t => t.name === player.name)?.teamSoFar || [];
    
    const lockedSection = document.createElement('div');
    lockedSection.style.cssText = 'margin-bottom: 15px; opacity: 0.8;';
    lockedSection.innerHTML = `
      <small style="font-weight: bold; color: #999;">Previous Rounds (Locked):</small>
    `;
    myTeamList.appendChild(lockedSection);
    
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

  const warningEl = document.getElementById('draftWarning');
  if (warningEl) warningEl.style.display = 'none';

  document.getElementById('scenarioText').textContent = `🎯 ADD UP TO 6 CHARACTERS TO YOUR ULTIMATE TEAM (${gameState.myFinalTeam.length}/6)`;

  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.style.display = 'inline-block';
    lockBtn.disabled = gameState.myFinalTeam.length === 0;
    lockBtn.textContent = `🔒 FINALIZE TEAM (${gameState.myFinalTeam.length}/6)`;
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
    const timerEl = document.getElementById('draftTimer');
    if (timerEl) {
      timerEl.textContent = timeLeft;
      if (timeLeft <= 10) {
        timerEl.style.color = '#ff5252';
        timerEl.style.fontWeight = 'bold';
      }
    }
    if (timeLeft <= 0) clearInterval(draftTimer);
  }, 1000);

  activeTimers.push(draftTimer);
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
    
    submitFinalDraft(char);
  }
}

function submitFinalDraft(char) {
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
  }
  
  const charInput = document.getElementById('charInput');
  if (charInput) {
    charInput.value = '';
    charInput.focus();
  }
  
  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.disabled = false;
    lockBtn.textContent = `🔒 FINALIZE TEAM (${gameState.myFinalTeam.length}/6)`;
  }
}

document.addEventListener('keypress', (e) => {
  if (e.target.id === 'charInput' && document.getElementById('scenarioScreen')?.classList.contains('active')) {
    const isFinalRound = document.getElementById('scenarioText')?.textContent.includes('ULTIMATE TEAM');
    if (isFinalRound) {
      handleFinalRoundInput(e);
    }
  }
});

function lockFinalDraft() {
  if (gameState.myFinalTeam.length === 0) {
    showToast('⚠️ Add at least 1 character to your team!', 'warning');
    return;
  }
  socket.emit('lockFinalDraft');
  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = '✅ TEAM FINALIZED!';
    showToast('🎉 Your ultimate team is locked in!', 'info');
  }
}

// ========================
// VOTING PHASE
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
  if (twistDisplay) twistDisplay.textContent = data.twist || 'No twist this round';

  const grid = document.getElementById('votingTeams');
  if (grid) grid.innerHTML = '';

  // Filter out own team
  data.teams.forEach((team, idx) => {
    if (!team.team || team.team.length === 0) {
      return;
    }
    
    if (team.name === player.name) {
      return;
    }
    
    const card = document.createElement('div');
    card.className = 'vote-card';
    card.style.animationDelay = `${idx * 0.1}s`;
    card.innerHTML = `
      <h3>👤 ${team.name}</h3>
      <ul class="team-display">
        ${team.team.map(t => `<li>• ${t}</li>`).join('')}
      </ul>
      <button class="btn btn-vote" onclick="castVote('${team.name}')">👉 VOTE FOR THIS TEAM</button>
      <p class="vote-count"><span class="vote-badge">${team.votes || 0}</span> votes</p>
    `;
    if (grid) grid.appendChild(card);
  });

  if (grid && grid.children.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = '(Your own team isn\'t shown—no voting for yourself!)';
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
  showToast('⚖️ Time to vote! Who will win?', 'info');

  let timeLeft = 30;
  document.getElementById('voteTimer').textContent = timeLeft;

  const voteTimer = setInterval(() => {
    timeLeft--;
    const timerEl = document.getElementById('voteTimer');
    if (timerEl) {
      timerEl.textContent = timeLeft;
      if (timeLeft <= 10) {
        timerEl.style.color = '#ff5252';
      }
    }
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
  if (scenarioDisplay) scenarioDisplay.textContent = data.finalPrompt || 'Which team is the BEST?';
  if (twistDisplay) twistDisplay.innerHTML = `<strong style="color: #ff4081;">ROUND 4: FINAL VOTING!</strong>`;

  const grid = document.getElementById('votingTeams');
  if (grid) grid.innerHTML = '';

  data.teams.forEach((team, idx) => {
    if (!team.team || team.team.length === 0) {
      return;
    }
    
    if (team.name === player.name) {
      return;
    }
    
    const card = document.createElement('div');
    card.className = 'vote-card final-vote';
    card.style.animationDelay = `${idx * 0.1}s`;
    card.innerHTML = `
      <h3>👤 ${team.name}</h3>
      <ul class="team-display final-team-display">
        ${team.team.map(t => `<li>• ${t}</li>`).join('')}
      </ul>
      <button class="btn btn-vote" onclick="castVote('${team.name}')">🏆 VOTE FOR THIS TEAM</button>
      <p class="vote-count"><span class="vote-badge">${team.votes || 0}</span> votes</p>
    `;
    if (grid) grid.appendChild(card);
  });

  if (grid && grid.children.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = '(Your team isn\'t shown—cast your vote for the best team!)';
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
    const timerEl = document.getElementById('voteTimer');
    if (timerEl) {
      timerEl.textContent = timeLeft;
      if (timeLeft <= 10) {
        timerEl.style.color = '#ff5252';
      }
    }
    if (timeLeft <= 0) clearInterval(voteTimer);
  }, 1000);

  activeTimers.push(voteTimer);
});

function castVote(playerName) {
  socket.emit('castVote', playerName);
  gameState.voted = true;
  
  document.querySelectorAll('.vote-card').forEach(card => {
    const cardName = card.querySelector('h3').textContent.replace('👤 ', '');
    const voteBtn = card.querySelector('.btn-vote');
    if (cardName === playerName) {
      card.style.borderColor = '#4caf50';
      card.style.borderWidth = '3px';
      voteBtn.textContent = '✓ VOTED';
      voteBtn.className = 'btn btn-vote btn-success';
      voteBtn.disabled = true;
    } else {
      card.style.borderColor = '#00bcd4';
      card.style.borderWidth = '2px';
      voteBtn.textContent = '👉 VOTE FOR THIS TEAM';
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
    showToast('⚠️ Please cast a vote first!', 'warning');
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
  if (votedIndication) {
    votedIndication.style.display = 'block';
    votedIndication.innerHTML = '🔒 Your vote is locked in!';
  }

  showToast('🔒 Your vote is locked!', 'info', 2000);
}

socket.on('voteUpdate', (voteCount) => {
  document.querySelectorAll('.vote-card').forEach(card => {
    const playerName = card.querySelector('h3').textContent.replace('👤 ', '');
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
// RESULTS SCREEN
// ========================
socket.on('roundResults', (data) => {
  clearTimers();
  document.getElementById('resultRound').textContent = data.round;

  const winnerBox = document.getElementById('roundWinner');
  
  let resultHTML = '<div class="results-content">';
  
  if (data.winner) {
    resultHTML += `
      <div class="round-winner-display">
        <h2>🏆 ${data.winner} WINS! 🏆</h2>
        <p class="winner-round-score">+${data.roundPoints[data.winner]} POINTS</p>
      </div>
    `;
  }

  resultHTML += `
    <div class="results-table">
      <h3>💎 Point Breakdown This Round:</h3>
      <div class="breakdown-grid">
  `;

  const sorted = [...data.leaderboard].sort((a, b) => b.roundScore - a.roundScore);
  sorted.forEach((player, idx) => {
    const medal = ['🥇', '🥈', '🥉'][idx] || '•';
    resultHTML += `
      <div class="player-breakdown">
        <div class="breakdown-header">${medal} ${player.name}</div>
        <div class="breakdown-points">+${player.roundScore} points</div>
        <div class="breakdown-details">
          ${player.breakdown.map(line => {
            const isNegative = line.includes('-') || line.toLowerCase().includes("didn't vote");
            return `<div class="breakdown-line ${isNegative ? 'negative' : ''}">${line}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  });

  resultHTML += `
      </div>
    </div>

    <div class="results-leaderboard">
      <h3>📊 Current Leaderboard:</h3>
      <ol class="leaderboard">
  `;

  data.leaderboard.forEach((player, idx) => {
    const medal = ['🥇', '🥈', '🥉'][idx] || '•';
    resultHTML += `
      <li class="leaderboard-entry">
        <span class="medal">${medal}</span>
        <span class="name">${player.name}</span>
        <span class="score">${player.score}pts</span>
      </li>
    `;
  });

  resultHTML += `
      </ol>
    </div>
    </div>
  `;

  if (winnerBox) winnerBox.innerHTML = resultHTML;

  const readyButton = document.getElementById('nextRoundReadyBtn');
  if (readyButton) {
    readyButton.style.display = 'inline-block';
    readyButton.disabled = false;
    readyButton.textContent = '✓ READY FOR NEXT ROUND';
  }

  showScreen('resultsScreen');
  showToast('📊 Round results are in!', 'info');
});

function readyForNextRound() {
  socket.emit('readyForNextRound');
  const readyButton = document.getElementById('nextRoundReadyBtn');
  if (readyButton) {
    readyButton.disabled = true;
    readyButton.textContent = '✓ READY';
    showToast('Waiting for other players...', 'info');
  }
}

socket.on('finalRoundResults', (data) => {
  clearTimers();
  document.getElementById('resultRound').textContent = '4 (FINAL)';

  const winnerBox = document.getElementById('roundWinner');
  
  let resultHTML = '<div class="results-content">';
  
  if (data.winner) {
    resultHTML += `
      <div class="round-winner-display">
        <h2>🏆 ${data.winner} WINS THE GAME! 🏆</h2>
        <p class="winner-round-score">+${data.roundPoints[data.winner]} POINTS</p>
      </div>
    `;
  }

  resultHTML += `
    <div class="results-table">
      <h3>💎 Point Breakdown Final Round:</h3>
      <div class="breakdown-grid">
  `;

  const sorted = [...data.leaderboard].sort((a, b) => b.roundScore - a.roundScore);
  sorted.forEach((player, idx) => {
    const medal = ['🥇', '🥈', '🥉'][idx] || '•';
    resultHTML += `
      <div class="player-breakdown">
        <div class="breakdown-header">${medal} ${player.name}</div>
        <div class="breakdown-points">+${player.roundScore} points</div>
        <div class="breakdown-details">
          ${player.breakdown.map(line => {
            const isNegative = line.includes('-') || line.toLowerCase().includes("didn't vote");
            return `<div class="breakdown-line ${isNegative ? 'negative' : ''}">${line}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  });

  resultHTML += `
      </div>
    </div>

    <div class="results-leaderboard">
      <h3>🎯 FINAL LEADERBOARD:</h3>
      <ol class="leaderboard">
  `;

  data.leaderboard.forEach((player, idx) => {
    const medal = ['🥇', '🥈', '🥉'][idx] || '•';
    resultHTML += `
      <li class="leaderboard-entry">
        <span class="medal">${medal}</span>
        <span class="name">${player.name}</span>
        <span class="score">${player.score}pts</span>
      </li>
    `;
  });

  resultHTML += `
      </ol>
    </div>
    </div>
  `;

  if (winnerBox) winnerBox.innerHTML = resultHTML;

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
    const emoji = idx === 0 ? '👑 CHAMPION' : idx === 1 ? '⭐ RUNNER-UP' : '🌟 TOP 3';
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
  showToast('🎉 Game Over! Check the results!', 'info');
});

function sendPlayAgain() {
  socket.emit('playAgain');
  showToast('Starting new game with same players...', 'info');
}

function goToLobby() {
  if (confirm('Are you sure? This will return to the lobby.')) {
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
      allDraftsList: [],
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
}

// ========================
// INITIALIZATION
// ========================
window.addEventListener('beforeunload', () => {
  socket.disconnect();
});

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

  .toast {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
  }
`;
document.head.appendChild(style);
