import {
  player,
  roomState,
  gameState,
  clearTimers,
  addTimer,
  resetAllState
} from './state.js';
import {
  showScreen,
  showHelp,
  closeHelp,
  showToast,
  showLoading,
  createConfetti,
  updateDraftWarning,
  updateAutoFillWarning,
  updateDraftCounter,
  updateLivePicksCount,
  updateVoteStatusBadge,
  resetResultsDetails,
  switchLobbyTab,
  toggleAccordion,
  toggleScenario,
  toggleVotingContext,
  toggleLivePicks,
  toggleResultsDetails
} from './ui.js';

const socket = io();
window.socket = socket; // Expose to window for round4Eval.js

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
    resetAllState();
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
  Object.assign(roomState, data);
  const isHost = data.host === player.name;

  document.getElementById('roomCode').textContent = player.room;
  document.getElementById('playerCountBadge').textContent = `${data.players.length}/6`;

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
    const hostBadge = p.name === data.host ? '<span class="host-star">★</span> ' : '';
    const isMe = p.name === player.name ? ' <span class="you-badge">(YOU)</span>' : '';
    li.innerHTML = `
      <span class="ready-badge"></span>
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
  
  // Skip preRound screen for Round 4 (goes straight to transition message)
  if (isFinal) {
    console.log('Round 4 starting - skipping preRound countdown');
    return; // Don't show preRound for Round 4, wait for round4Start event
  }
  
  document.getElementById('roundLabel').textContent = `📍 ROUND ${data.roundNumber} OF 3`;

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

  addTimer(timer);
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

  addTimer(draftTimer);
});

// ========================
// DRAFT PHASE
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

  updateLivePicksCount(data.allDrafts.length);

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

  addTimer(draftTimer);
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
    lockSection.style.display = 'none';
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

  addTimer(voteTimer);
});

// ========================
// ROUND 4: AI EVALUATION (NEW)
// ========================
socket.on('round4Start', (data) => {
  console.log('🎮 Round 4 Start event received:', data);
  clearTimers();
  
  // Show transition message modal
  showScreen('preRound');
  const roundLabel = document.getElementById('roundLabel');
  const countdown = document.querySelector('#preRound .countdown');
  
  if (roundLabel) {
    roundLabel.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 3rem; margin-bottom: 20px;">🌪️</div>
        <h2 style="margin-bottom: 15px;">THE ARENA TRANSFORMS</h2>
        <p style="margin: 10px 0;">Your rosters are locked.</p>
        <p style="margin: 10px 0;">Your picks are final.</p>
        <p style="margin: 10px 0;">The voting stage dissolves away.</p>
        <div style="height: 2px; background: linear-gradient(90deg, transparent, #ff4081, transparent); margin: 20px 0;"></div>
        <p style="margin: 15px 0; font-size: 1.2rem; color: #ff4081;">
          <strong>Now enters: 🤖 THE EVALUATOR</strong>
        </p>
        <p style="margin: 10px 0;">One machine. ${Object.keys(data.finalTeams).length * 6} characters. Unlimited takes.</p>
        <p style="margin: 10px 0;">Your teams face the algorithm.</p>
        <p style="margin: 15px 0; font-size: 1.1rem; font-weight: bold; color: #f7931e;">
          Who cooked? Who got cooked? Find out.
        </p>
      </div>
    `;
  }
  
  if (countdown) countdown.style.display = 'none';
  
  // Auto-transition to evaluation screen after 5 seconds
  setTimeout(() => {
    console.log('⏰ Transition timeout complete, starting evaluation...');
    if (typeof window.initRound4Evaluation === 'function') {
      window.initRound4Evaluation(data);
    } else {
      console.error('❌ Round 4 evaluation function not found');
    }
  }, 5000);
});

/* COMMENTED OUT - Old Round 4 voting system, replaced by AI evaluation
socket.on('finalVotingPhaseStart', (data) => {
  clearTimers();
  gameState.voted = false;
  gameState.voteLocked = false;
  gameState.currentVoteChoice = null;

  const scenarioDisplay = document.getElementById('votingScenario');
  const twistDisplay = document.getElementById('votingTwist');
  if (scenarioDisplay) scenarioDisplay.textContent = data.finalPrompt || 'Which team is the BEST?';
  if (twistDisplay) twistDisplay.innerHTML = '<strong style="color: #ff4081;">ROUND 4: FINAL VOTING!</strong>';

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
    lockSection.style.display = 'none';
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

  addTimer(voteTimer);
});
END OF COMMENTED OUT CODE */

function castVote(playerName) {
  playVoteSound();
  socket.emit('castVote', playerName);
  gameState.voted = true;
  gameState.currentVoteChoice = playerName;

  document.querySelectorAll('.vote-card').forEach(card => {
    const cardName = card.querySelector('h3').textContent.replace('👤 ', '');
    if (cardName === playerName) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  const lockBtn = document.getElementById('lockVoteBtn');
  const lockSection = document.getElementById('voteLockSection');
  if (lockBtn && lockSection) {
    lockSection.style.display = 'block';
    lockBtn.style.display = 'inline-block';
    lockBtn.disabled = false;
  }

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

  const breakdownContainer = document.getElementById('resultsBreakdown');
  if (breakdownContainer) {
    let breakdownHTML = '';
    const sorted = [...data.leaderboard].sort((a, b) => b.roundScore - a.roundScore);
    sorted.forEach((playerEntry, idx) => {
      const medal = ['🥇', '🥈', '🥉'][idx] || '•';
      breakdownHTML += `
        <div class="player-breakdown">
          <div class="breakdown-header">${medal} ${playerEntry.name}</div>
          <div class="breakdown-points">+${playerEntry.roundScore} points</div>
          <div class="breakdown-details">
            ${playerEntry.breakdown.map(line => {
              const isNegative = line.includes('-') || line.toLowerCase().includes("didn't vote");
              return `<div class="breakdown-line ${isNegative ? 'negative' : ''}">${line}</div>`;
            }).join('')}
          </div>
        </div>
      `;
    });
    breakdownContainer.innerHTML = breakdownHTML;
  }

  resetResultsDetails();

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

  const breakdownContainer = document.getElementById('resultsBreakdown');
  if (breakdownContainer) {
    let breakdownHTML = '';
    const sorted = [...data.leaderboard].sort((a, b) => b.roundScore - a.roundScore);
    sorted.forEach((playerEntry, idx) => {
      const medal = ['🥇', '🥈', '🥉'][idx] || '•';
      breakdownHTML += `
        <div class="player-breakdown">
          <div class="breakdown-header">${medal} ${playerEntry.name}</div>
          <div class="breakdown-points">+${playerEntry.roundScore} points</div>
          <div class="breakdown-details">
            ${playerEntry.breakdown.map(line => {
              const isNegative = line.includes('-') || line.toLowerCase().includes("didn't vote");
              return `<div class="breakdown-line ${isNegative ? 'negative' : ''}">${line}</div>`;
            }).join('')}
          </div>
        </div>
      `;
    });
    breakdownContainer.innerHTML = breakdownHTML;
  }

  resetResultsDetails();

  const readyButton = document.getElementById('nextRoundReadyBtn');
  if (readyButton) {
    readyButton.style.display = 'none';
  }

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
    resetAllState();
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

// Expose UI actions used by inline handlers
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.showHelp = showHelp;
window.closeHelp = closeHelp;
window.switchLobbyTab = switchLobbyTab;
window.toggleAccordion = toggleAccordion;
window.toggleScenario = toggleScenario;
window.toggleVotingContext = toggleVotingContext;
window.toggleLivePicks = toggleLivePicks;
window.toggleResultsDetails = toggleResultsDetails;
window.toggleReady = toggleReady;
window.updateSetting = updateSetting;
window.sendMessage = sendMessage;
window.sendReaction = sendReaction;
window.sendStartGame = sendStartGame;
window.submitDraft = submitDraft;
window.lockDraft = lockDraft;
window.lockVote = lockVote;
window.readyForNextRound = readyForNextRound;
window.sendPlayAgain = sendPlayAgain;
window.goToLobby = goToLobby;

// Keep for future usage
window.showLoading = showLoading;
