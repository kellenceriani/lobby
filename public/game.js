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
  myFinalTeam: []
};

let activeTimers = [];

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
  showScreen('preRound');
});

socket.on('roundStart', (data) => {
  gameState.currentRound = data.roundNumber;
  gameState.myTeam = [];
  gameState.allDrafts = {};
  gameState.voted = false;

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
    if (timeLeft <= 0) clearInterval(draftTimer);
  }, 1000);

  activeTimers.push(draftTimer);
});

// ========================
// DRAFT PHASE
// ========================
document.getElementById('charInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    const char = e.target.value.trim();
    
    if (gameState.myTeam.length >= 2) {
      alert('⚠️ You can draft a maximum of 2 characters per round!');
      return;
    }
    
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
  }
});

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
  const errorDiv = document.createElement('div');
  errorDiv.style.position = 'fixed';
  errorDiv.style.top = '20px';
  errorDiv.style.right = '20px';
  errorDiv.style.background = '#ff5252';
  errorDiv.style.color = 'white';
  errorDiv.style.padding = '15px 20px';
  errorDiv.style.borderRadius = '8px';
  errorDiv.style.zIndex = '9999';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 3000);
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
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.background = '#4caf50';
    notification.style.color = 'white';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '8px';
    notification.style.zIndex = '9999';
    notification.textContent = `🔒 ${data.playerName} locked in their team!`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
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
    // Display existing characters from rounds 1-3
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

  document.getElementById('scenarioText').textContent = `🎯 ADD TO YOUR ULTIMATE TEAM (${gameState.myFinalTeam.length} so far)`;

  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.style.display = 'block';
    lockBtn.disabled = true;
    lockBtn.textContent = '🔒 LOCK FINAL TEAM';
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

// Update draft event listener for final round
const charInputEl = document.getElementById('charInput');
if (charInputEl) {
  charInputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const char = e.target.value.trim();
      
      // Determine if in final round
      const isFinalRound = document.getElementById('scenarioText').textContent.includes('ULTIMATE TEAM');
      
      if (isFinalRound) {
        if (gameState.myFinalTeam.length >= 6) {
          alert('⚠️ Your team is full (6 characters max)!');
          return;
        }
        
        if (gameState.myFinalTeam.some(c => c.toLowerCase() === char.toLowerCase())) {
          alert(`⚠️ You already have "${char}" in your team!`);
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
            if (lockBtn) lockBtn.disabled = false;
          }
        }
        
        e.target.value = '';
      }
    }
  });
}

function lockFinalDraft() {
  socket.emit('lockFinalDraft');
  const lockBtn = document.getElementById('lockDraftBtn');
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = '✅ FINAL TEAM LOCKED!';
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
  if (twistDisplay) twistDisplay.textContent = data.twist;

  const grid = document.getElementById('votingTeams');
  if (grid) grid.innerHTML = '';

  data.teams.forEach((team, idx) => {
    if (!team.team || team.team.length === 0) {
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
      <button class="btn btn-vote" onclick="castVote('${team.name}')">VOTE</button>
      <p class="vote-count"><span class="vote-badge">${team.votes || 0}</span></p>
    `;
    if (grid) grid.appendChild(card);
  });

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

  data.teams.forEach((team, idx) => {
    if (!team.team || team.team.length === 0) {
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
      <button class="btn btn-vote" onclick="castVote('${team.name}')">VOTE</button>
      <p class="vote-count"><span class="vote-badge">${team.votes || 0}</span></p>
    `;
    if (grid) grid.appendChild(card);
  });

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
  const isOwnTeam = playerName === player.name;
  if (isOwnTeam) {
    alert('Nice try! You can\'t vote for your own team!');
    return;
  }
  
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
      voteBtn.textContent = 'VOTE';
      voteBtn.className = 'btn btn-vote';
    }
  });
  
  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.style.display = 'inline-block';
    lockBtn.disabled = false;
  }
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
}

socket.on('voteUpdate', (voteCount) => {
  document.querySelectorAll('.vote-card').forEach(card => {
    const playerName = card.querySelector('h3').textContent;
    const badge = card.querySelector('.vote-badge');
    badge.textContent = voteCount[playerName] || 0;
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
// RESULTS
// ========================
socket.on('roundResults', (data) => {
  clearTimers();
  document.getElementById('resultRound').textContent = data.round;

  const winnerBox = document.getElementById('roundWinner');
  if (data.winner) {
    winnerBox.innerHTML = `
      <div class="winner-announcement">
        <p>🏆 <span class="winner-name">${data.winner}</span> WINS THIS ROUND!</p>
        <p class="winner-points">+${data.roundPoints[data.winner] || 0} points</p>
      </div>
    `;
  } else {
    winnerBox.innerHTML = '<p>🤝 It\'s a TIE! Everyone gets bonus points!</p>';
  }

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
  document.getElementById('resultRound').textContent = '4';

  const winnerBox = document.getElementById('roundWinner');
  if (data.winner) {
    winnerBox.innerHTML = `
      <div class="winner-announcement">
        <p>🏆 <span class="winner-name">${data.winner}</span> WINS THE FINAL ROUND!</p>
        <p class="winner-points">+${data.roundPoints[data.winner] || 0} points</p>
      </div>
    `;
  } else {
    winnerBox.innerHTML = '<p>🤝 It\'s a TIE in the Final Round!</p>';
  }

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
    myFinalTeam: []
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
