const socket = io();

// ========================
// SOUND SYSTEM
// ========================
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(frequency = 800, duration = 100, type = 'sine', volume = 0.3) {
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.value = frequency;
    osc.type = type;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + duration / 1000);
  } catch (e) {
    console.log('Sound not available');
  }
}

function playDraftSound() {
  playSound(600, 150, 'sine', 0.2);
  setTimeout(() => playSound(800, 100, 'sine', 0.2), 75);
}

function playVoteSound() {
  playSound(440, 100, 'sine', 0.25);
  setTimeout(() => playSound(880, 100, 'sine', 0.25), 100);
}

function playWinSound() {
  playSound(523, 200, 'sine', 0.3);
  setTimeout(() => playSound(659, 200, 'sine', 0.3), 200);
  setTimeout(() => playSound(784, 400, 'sine', 0.3), 400);
}

function playErrorSound() {
  playSound(300, 100, 'sine', 0.2);
  setTimeout(() => playSound(250, 100, 'sine', 0.2), 100);
}

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
  allCharactersDrafted: [],
  votes: {},
  voted: false,
  voteLocked: false,
  currentVoteChoice: null,
  leaderboard: [],
  myFinalTeam: [],
  draftWarnings: {}
};

let activeTimers = [];
let toastQueue = [];
let devMode = false; // Hidden dev mode for testing
let isLoading = false; // Loading state tracker

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

function showHelp() {
  showScreen('tutorial');
}

function closeHelp() {
  showScreen('join');
}

function clearTimers() {
  activeTimers.forEach(t => clearInterval(t));
  activeTimers = [];
}

function showLoading(show = true) {
  isLoading = show;
  const loader = document.getElementById('loadingOverlay');
  if (loader) {
    loader.style.display = show ? 'flex' : 'none';
  }
}

function createConfetti() {
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background: ${['#ff4081', '#00bcd4', '#4caf50', '#ffc107', '#ff9800'][Math.floor(Math.random() * 5)]};
      left: ${Math.random() * 100}%;
      top: -10px;
      z-index: 9999;
      border-radius: 50%;
      pointer-events: none;
      animation: confettiFall ${2 + Math.random() * 1}s linear forwards;
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 3000);
  }
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
    warningEl.className = 'draft-warning-modern warning';
    warningEl.textContent = `⚠️ "${character}" is a DUPLICATE! Will auto-fill instead.`;
    warningEl.style.display = 'block';
    if (charInput) charInput.style.borderColor = '#ff9800';
  } else {
    warningEl.style.display = 'none';
    warningEl.className = 'draft-warning-modern';
    if (charInput) charInput.style.borderColor = '#222';
  }
}

function updateAutoFillWarning() {
  const warningEl = document.getElementById('draftWarning');
  if (!warningEl) return;
  
  if (gameState.myTeam.length === 0) {
    warningEl.className = 'draft-warning-modern info';
    warningEl.textContent = 'ℹ️ Time running out! No picks? Random words will fill your team.';
    warningEl.style.display = 'block';
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
  badge.classList.remove('available', 'almost-full', 'full');
  if (data.players.length >= 6) {
    badge.classList.add('full');
  } else if (data.players.length >= 5) {
    badge.classList.add('almost-full');
  } else {
    badge.classList.add('available');
  }

  const settingsContent = document.getElementById('settingsContent');
  const hostNote = document.getElementById('hostNote');
  
  if (isHost) {
    settingsContent.style.display = 'block';
    hostNote.style.display = 'none';
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
        startBtn.className = 'btn btn-success pulsing-glow';
        minPlayersMsg.style.display = 'none';
      } else {
        startBtn.disabled = true;
        startBtn.className = 'btn';
        minPlayersMsg.style.display = 'block';
        minPlayersMsg.innerHTML = `
          <strong>⏳ Waiting:</strong> 
          ${readyCount}/${data.players.length} ready 
          ${data.players.length < 3 ? '(Need 3+)' : ''}
        `;
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
        readyBtn.innerHTML = '<span class="ready-indicator">✓</span> READY';
        readyBtn.className = 'btn btn-success btn-ready pulsing';
      } else {
        readyBtn.innerHTML = '<span class="ready-indicator">○</span> NOT READY';
        readyBtn.className = 'btn btn-ready';
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
  const scenarioTheme = document.getElementById('scenarioTheme');
  const customScenario = document.getElementById('customScenario');
  const plotTwists = document.getElementById('plotTwists');
  if (difficulty && settings.difficulty) difficulty.value = settings.difficulty;
  if (scenarioTheme && settings.scenarioTheme) scenarioTheme.value = settings.scenarioTheme;
  if (customScenario && settings.customScenario !== undefined) customScenario.value = settings.customScenario;
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
  gameState.currentVoteChoice = null;

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
  const isDupAcrossRounds = gameState.allCharactersDrafted.includes(charLower);

  if (isDupOwn) {
    playErrorSound();
    showToast(`❌ You already drafted "${char}" this round! Auto-filling instead...`, 'error', 4000);
  } else if (isDupAcrossRounds) {
    playErrorSound();
    showToast(`❌ You already drafted "${char}" in a previous round! Auto-filling instead...`, 'error', 4000);
  } else if (isDupOther) {
    playErrorSound();
    showToast(`❌ "${char}" was picked by another player! Auto-filling instead...`, 'error', 4000);
  } else {
    playDraftSound();
  }

  if (!isDupOwn && !isDupOther && !isDupAcrossRounds) {
    gameState.allCharactersDrafted.push(charLower);
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
      counter.classList.add('full');
    } else {
      counter.classList.remove('full');
    }
  }
}

function lockDraft() {
  if (gameState.myTeam.length < 2) {
    playErrorSound();
    showToast('⚠️ You must have 2 characters to lock in!', 'warning');
    return;
  }
  playDraftSound();
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
  
  // Update live picks count badge
  updateLivePicksCount(data.allDrafts.length);

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
        li.classList.add('draft-autofill');
      }
      if (myTeamList) myTeamList.appendChild(li);
    });

  updateDraftCounter();

  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    if (gameState.myTeam.length >= 2) {
      lockBtn.disabled = false;
      lockBtn.textContent = '🔒 LOCK TEAM';
      lockBtn.style.display = 'block';
    } else {
      lockBtn.disabled = true;
      lockBtn.textContent = `🔓 LOCK TEAM (${gameState.myTeam.length}/2)`;
      lockBtn.style.display = gameState.myTeam.length > 0 ? 'block' : 'none';
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
  gameState.currentVoteChoice = null;

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
    card.onclick = () => castVote(team.name);
    card.innerHTML = `
      <h3>👤 ${team.name}</h3>
      <ul class="team-display">
        ${team.team.map(t => `<li>• ${t}</li>`).join('')}
      </ul>
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
    lockSection.style.display = 'none'; // Hidden until they select
  }

  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.style.display = 'none';
    lockBtn.disabled = true;
    lockBtn.textContent = '🔒 LOCK MY VOTE';
    lockBtn.className = 'btn btn-success btn-lock-vote';
  }

  const votedIndication = document.getElementById('votedIndication');
  if (votedIndication) votedIndication.style.display = 'none';

  const voteLockNotice = document.getElementById('voteLockNotice');
  if (voteLockNotice) voteLockNotice.style.display = 'block';
  
  // Update status badge
  updateVoteStatusBadge('Select Team');

  showScreen('votingScreen');
  showToast('⚖️ Time to vote! Tap a team card to select it.', 'info', 4000);

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
  gameState.currentVoteChoice = null;

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
    card.onclick = () => castVote(team.name);
    card.innerHTML = `
      <h3>👤 ${team.name}</h3>
      <ul class="team-display final-team-display">
        ${team.team.map(t => `<li>• ${t}</li>`).join('')}
      </ul>
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
    lockSection.style.display = 'none'; // Hidden until selection
  }

  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.style.display = 'none';
    lockBtn.disabled = true;
    lockBtn.className = 'btn btn-success btn-lock-vote';
  }

  const votedIndication = document.getElementById('votedIndication');
  if (votedIndication) votedIndication.style.display = 'none';

  const voteLockNotice = document.getElementById('voteLockNotice');
  if (voteLockNotice) voteLockNotice.style.display = 'block';
  
  // Update status badge
  updateVoteStatusBadge('Final Vote');

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
  playVoteSound();
  socket.emit('castVote', playerName);
  gameState.voted = true;
  gameState.currentVoteChoice = playerName;
  
  // Update all vote cards
  document.querySelectorAll('.vote-card').forEach(card => {
    const cardName = card.querySelector('h3').textContent.replace('👤 ', '');
    if (cardName === playerName) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
  
  // Show lock button
  const lockBtn = document.getElementById('lockVoteBtn');
  const lockSection = document.getElementById('voteLockSection');
  if (lockBtn && lockSection) {
    lockSection.style.display = 'block';
    lockBtn.style.display = 'inline-block';
    lockBtn.disabled = false;
  }
  
  // Update status badge
  updateVoteStatusBadge(`Voting for ${playerName}`);

  showToast(`✓ Selected ${playerName}! Click LOCK when ready.`, 'info', 2000);
}

function lockVote() {
  if (!gameState.voted) {
    playErrorSound();
    showToast('⚠️ Please select a team first!', 'warning');
    return;
  }
  playDraftSound();
  socket.emit('lockVote');
  gameState.voteLocked = true;
  
  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = '✓ VOTE LOCKED';
    lockBtn.className = 'btn btn-success';
  }

  updateVoteStatusBadge();
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
  playWinSound();
  document.getElementById('resultRound').textContent = data.round;

  const winnerBox = document.getElementById('roundWinner');
  
  let winnerHTML = '';
  if (data.winner) {
    winnerHTML = `
      <h2>🏆 ${data.winner} WINS! 🏆</h2>
      <p class="winner-round-score">+${data.roundPoints[data.winner]} POINTS</p>
    `;
  }
  
  if (winnerBox) winnerBox.innerHTML = winnerHTML;

  // Build breakdown section
  const breakdownContainer = document.getElementById('resultsBreakdown');
  if (breakdownContainer) {
    let breakdownHTML = '';
    const sorted = [...data.leaderboard].sort((a, b) => b.roundScore - a.roundScore);
    sorted.forEach((player, idx) => {
      const medal = ['🥇', '🥈', '🥉'][idx] || '•';
      breakdownHTML += `
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
    breakdownContainer.innerHTML = breakdownHTML;
  }

  // Reset toggle state
  resultsDetailsOpen = false;
  const details = document.getElementById('resultsDetails');
  const icon = document.getElementById('resultsDetailsIcon');
  if (details) details.style.display = 'none';
  if (icon) icon.textContent = '▼';

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
  playWinSound();
  document.getElementById('resultRound').textContent = '4 (FINAL)';

  const winnerBox = document.getElementById('roundWinner');
  
  let winnerHTML = '';
  if (data.winner) {
    winnerHTML = `
      <h2>🏆 ${data.winner} WINS THE FINAL ROUND!... 🏆</h2>
      <p class="winner-round-score">+${data.roundPoints[data.winner]} POINTS</p>
    `;
  }
  
  if (winnerBox) winnerBox.innerHTML = winnerHTML;

  // Build breakdown section
  const breakdownContainer = document.getElementById('resultsBreakdown');
  if (breakdownContainer) {
    let breakdownHTML = '';
    const sorted = [...data.leaderboard].sort((a, b) => b.roundScore - a.roundScore);
    sorted.forEach((player, idx) => {
      const medal = ['🥇', '🥈', '🥉'][idx] || '•';
      breakdownHTML += `
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
    breakdownContainer.innerHTML = breakdownHTML;
  }

  // Reset toggle state
  resultsDetailsOpen = false;
  const details = document.getElementById('resultsDetails');
  const icon = document.getElementById('resultsDetailsIcon');
  if (details) details.style.display = 'none';
  if (icon) icon.textContent = '▼';

  showScreen('resultsScreen');
});

// ========================
// FINAL LEADERBOARD
// ========================
socket.on('gameEnded', (data) => {
  clearTimers();
  playWinSound();
  setTimeout(() => createConfetti(), 300);

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
      allCharactersDrafted: [],
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

  @keyframes confettiFall {
    to {
      transform: translateY(100vh) rotate(360deg);
      opacity: 0;
    }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .toast {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
  }

  #loadingOverlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 10000;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 5px solid #f0f0f0;
    border-top: 5px solid #ff4081;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .spinner-text {
    color: white;
    margin-top: 20px;
    font-weight: bold;
    font-size: 1.2em;
  }
`;
document.head.appendChild(style);

// ========================
// NEW UI/UX FUNCTIONS
// ========================

// LOBBY TAB SWITCHING
function switchLobbyTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  
  // Deactivate all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  
  // Show selected tab content
  const selectedTab = document.getElementById(`${tabName}Tab`);
  if (selectedTab) selectedTab.classList.add('active');
  
  // Activate selected tab button
  const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (selectedBtn) selectedBtn.classList.add('active');
}

// TUTORIAL ACCORDION
function toggleAccordion(header) {
  const accordionItem = header.parentElement;
  const content = accordionItem.querySelector('.accordion-content');
  const icon = header.querySelector('.accordion-icon');
  
  const isActive = accordionItem.classList.contains('active');
  
  if (isActive) {
    accordionItem.classList.remove('active');
    content.style.display = 'none';
    icon.textContent = '▶';
  } else {
    accordionItem.classList.add('active');
    content.style.display = 'block';
    icon.textContent = '▼';
  }
}

// SCENARIO COLLAPSE TOGGLE
let scenarioCollapsed = false;
function toggleScenario() {
  const scenarioBox = document.getElementById('scenarioBox');
  const icon = document.getElementById('scenarioToggleIcon');
  
  if (!scenarioBox || !icon) return;
  
  scenarioCollapsed = !scenarioCollapsed;
  
  if (scenarioCollapsed) {
    scenarioBox.classList.add('collapsed');
    icon.textContent = '▲';
  } else {
    scenarioBox.classList.remove('collapsed');
    icon.textContent = '▼';
  }
}

// VOTING CONTEXT COLLAPSE TOGGLE
let votingContextCollapsed = false;
function toggleVotingContext() {
  const context = document.getElementById('votingContext');
  const icon = document.getElementById('votingContextIcon');
  
  if (!context || !icon) return;
  
  votingContextCollapsed = !votingContextCollapsed;
  
  if (votingContextCollapsed) {
    context.classList.add('collapsed');
    icon.textContent = '▲';
  } else {
    context.classList.remove('collapsed');
    icon.textContent = '▼';
  }
}

// LIVE PICKS DRAWER TOGGLE
let livePicksOpen = false;
function toggleLivePicks() {
  const drawer = document.getElementById('livePicksDrawer');
  const icon = document.getElementById('livePicksIcon');
  
  if (!drawer || !icon) return;
  
  livePicksOpen = !livePicksOpen;
  
  if (livePicksOpen) {
    drawer.classList.add('open');
    icon.textContent = '▼';
  } else {
    drawer.classList.remove('open');
    icon.textContent = '▲';
  }
}

// RESULTS DETAILS TOGGLE
let resultsDetailsOpen = false;
function toggleResultsDetails() {
  const details = document.getElementById('resultsDetails');
  const icon = document.getElementById('resultsDetailsIcon');
  
  if (!details || !icon) return;
  
  resultsDetailsOpen = !resultsDetailsOpen;
  
  if (resultsDetailsOpen) {
    details.style.display = 'block';
    icon.textContent = '▲';
  } else {
    details.style.display = 'none';
    icon.textContent = '▼';
  }
}

// UPDATE LIVE PICKS COUNT
function updateLivePicksCount(count) {
  const countEl = document.getElementById('livePicksCount');
  if (countEl) countEl.textContent = count;
}

// UPDATE VOTE STATUS BADGE
function updateVoteStatusBadge(status) {
  const badge = document.getElementById('voteStatusBadge');
  if (badge) badge.textContent = status;
}
