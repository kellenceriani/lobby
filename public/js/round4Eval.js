// Round 4 Evaluation Screen Controller

let round4State = {
  isEvaluating: false,
  currentIndex: 0,
  totalCharacters: 0,
  evaluations: [],
  allTeamEvaluations: null,
  finalLeaderboard: null,
  totalTeams: 0,
  evaluationId: null,
  rendered: false,
  rendering: false,
  finalResultsRequested: false
};

function updateEvalProgress(current, total) {
  const progress = document.getElementById('evalProgress');
  const bar = document.getElementById('evalProgressBar');
  const fill = bar ? bar.querySelector('.eval-progress-fill') : null;
  const pct = document.getElementById('evalProgressPct');
  const safeTotal = Math.max(1, total || 0);
  const percent = Math.max(0, Math.min(100, Math.round((current / safeTotal) * 100)));

  if (progress) progress.textContent = String(current);
  if (fill) fill.style.width = `${percent}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(percent));
  if (pct) pct.textContent = `${percent}%`;
}

function initRound4Evaluation(data) {
  console.log('🚀 initRound4Evaluation called with data:', data);
  const { scenario, twist, finalTeams } = data;
  
  // Show evaluation screen
  const evalScreen = document.getElementById('round4EvalScreen');
  if (evalScreen) {
    console.log('✅ Showing Round 4 eval screen');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    evalScreen.classList.add('active');
  } else {
    console.error('❌ round4EvalScreen element not found!');
  }
  
  // Display scenario
  const scenarioText = document.getElementById('evalScenarioText');
  const twistText = document.getElementById('evalTwistText');
  if (scenarioText) scenarioText.textContent = scenario;
  if (twistText) twistText.textContent = `🔄 Twist: ${twist}`;
  
  // Calculate total characters to evaluate (up to 36)
  const totalCharacters = Object.values(finalTeams).reduce((sum, team) => sum + team.length, 0);
  const evalTotal = document.getElementById('evalTotal');
  if (evalTotal) evalTotal.textContent = totalCharacters;

  updateEvalProgress(0, totalCharacters);

  const loading = document.getElementById('evalLoading');
  if (loading) loading.style.display = 'flex';

  const loadingTitle = document.getElementById('evalLoadingTitle');
  const loadingSubtitle = document.getElementById('evalLoadingSubtitle');
  if (loadingTitle) loadingTitle.textContent = 'Evaluating teams...';
  if (loadingSubtitle) loadingSubtitle.textContent = 'Fetching details and scoring picks.';
  
  console.log(`📊 Teams: ${Object.keys(finalTeams).length}, Total characters: ${totalCharacters}`);
  
  // Request evaluation from server
  round4State.isEvaluating = true;
  round4State.evaluations = [];
  round4State.currentIndex = 0;
  round4State.totalTeams = Object.keys(finalTeams).length;
  round4State.totalCharacters = totalCharacters;
  round4State.evaluationId = null;
  round4State.rendered = false;
  round4State.rendering = false;
  round4State.finalResultsRequested = false;

  const container = document.getElementById('evalCardsContainer');
  if (container) container.innerHTML = '';

  const continueBtn = document.getElementById('evalContinueBtn');
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Continue to Final Results';
  }

  const status = document.getElementById('evalFinalStatus');
  if (status) status.textContent = '';
  
  // Emit to server
  if (window.socket) {
    console.log('📡 Emitting evaluateRound4 to server...');
    window.socket.emit('evaluateRound4', {
      scenario,
      twist,
      finalTeams
    });
  } else {
    console.error('❌ window.socket not available!');
  }
}

// Receive evaluation results for ALL TEAMS
if (typeof window !== 'undefined' && !window.__round4SocketBound) {
  window.__round4SocketBound = true;
  // Wait for socket to be available
  const checkSocket = setInterval(() => {
    if (window.socket) {
      clearInterval(checkSocket);
      console.log('✅ Socket connected in round4Eval.js');
      
      window.socket.on('round4Evaluated', (data) => {
        console.log('📥 Received round4Evaluated:', data);
        if (round4State.rendering || (round4State.evaluationId && round4State.evaluationId === data.evaluationId && round4State.rendered)) {
          return;
        }
        round4State.evaluationId = data.evaluationId || null;
        round4State.allTeamEvaluations = data.allTeamEvaluations;
        round4State.finalLeaderboard = data.finalLeaderboard;
        round4State.rendered = false;

        const loadingTitle = document.getElementById('evalLoadingTitle');
        const loadingSubtitle = document.getElementById('evalLoadingSubtitle');
        if (loadingTitle) loadingTitle.textContent = 'Rendering evaluations...';
        if (loadingSubtitle) loadingSubtitle.textContent = 'Building cards and summaries.';
        
        displayAllTeamEvaluationsSequentially();
      });

      window.socket.on('round4EvaluationError', (error) => {
        console.error('❌ Round 4 evaluation error:', error);
        alert('Error evaluating teams: ' + error.message);
      });

      window.socket.on('finalResultsWaiting', (data) => {
        const status = document.getElementById('evalFinalStatus');
        if (status) {
          status.textContent = `Waiting for players: ${data.readyCount}/${data.totalPlayers}`;
        }
      });
    }
  }, 100);
}

// Sequential display with delays - iterate through all teams and their characters
async function displayAllTeamEvaluationsSequentially() {
  const container = document.getElementById('evalCardsContainer');
  if (!container) return;

  if (!round4State.allTeamEvaluations) return;
  round4State.rendering = true;

  const loading = document.getElementById('evalLoading');
  if (loading) loading.style.display = 'flex';
  
  container.innerHTML = '';
  
  let charIndex = 0;
  const allTeams = Object.entries(round4State.allTeamEvaluations);
  
  // For each team
  for (const [playerName, teamData] of allTeams) {
    const teamBlock = document.createElement('section');
    teamBlock.className = 'eval-team-block';

    // Add team header
    const teamHeader = document.createElement('div');
    teamHeader.className = 'eval-team-header';
    teamHeader.innerHTML = `<h2>🎮 ${playerName}'s Team</h2>`;
    teamBlock.appendChild(teamHeader);

    const teamCards = document.createElement('div');
    teamCards.className = 'eval-team-cards';
    teamBlock.appendChild(teamCards);
    
    // For each character in team
    for (const evalData of teamData.evaluations) {
      renderEvalCard(evalData, teamCards);
      charIndex++;
      updateEvalProgress(charIndex, round4State.totalCharacters);
      
      // 2.5s delay between characters
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    
    // Add team summary after all characters
    renderTeamSummary(playerName, teamData.teamSummary, teamBlock);
    await new Promise(resolve => setTimeout(resolve, 1500));

    container.appendChild(teamBlock);
  }
  
  // Display final leaderboard after all character evals
  await new Promise(resolve => setTimeout(resolve, 1500));
  displayFinalLeaderboard();
  updateEvalProgress(round4State.totalCharacters, round4State.totalCharacters);
  if (loading) loading.style.display = 'none';
  round4State.rendering = false;
  round4State.rendered = true;
}

// Render single evaluation card
function renderEvalCard(evalData, container) {
  if (!container) return;

  const notes = Array.isArray(evalData.notes) ? evalData.notes.slice(0, 2) : [];
  const notesHtml = notes.map(note => `<li>${note}</li>`).join('');
  
  const card = document.createElement('div');
  card.className = `eval-card eval-card-${evalData.emotion}`;
  card.innerHTML = `
    <div class="eval-card-header">
      <h3 class="eval-card-name">${evalData.character}</h3>
      <div class="eval-card-emotion">
        <img src="/img/emotions/${evalData.emotion}.png" alt="${evalData.emotion}" 
             class="eval-emotion-icon" width="64" height="64" decoding="async">
      </div>
    </div>
    <div class="eval-card-stats">
      <div class="eval-score" title="Score: 0-20">
        <span class="eval-score-value">${evalData.score}</span>
        <span class="eval-score-max">/20</span>
      </div>
      <div class="eval-ovr" title="Overall Rating: 0-99">
        OVR <span class="eval-ovr-value">${evalData.ovr}</span>
      </div>
    </div>
    <div class="eval-card-notes" aria-label="Evaluation notes">
      <ul>
        ${notesHtml}
      </ul>
    </div>
    <div class="eval-card-phrase">
      <p>"${evalData.phrase}"</p>
    </div>
  `;
  
  container.appendChild(card);
}

// Render team summary
function renderTeamSummary(playerName, summary, container) {
  if (!container) return;
  
  const chemistryDetails = Array.isArray(summary.chemistryDetails) ? summary.chemistryDetails : [];
  const chemistryLines = chemistryDetails.length
    ? chemistryDetails.map(detail => {
      const matches = Array.isArray(detail.matches) ? detail.matches.join(', ') : 'N/A';
      const sign = detail.bonus >= 0 ? '+' : '';
      return `<li><strong>${detail.label}</strong> (${sign}${detail.bonus}): ${matches}</li>`;
    }).join('')
    : '<li>No clear chemistry patterns detected.</li>';

  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'eval-team-summary';
  summaryDiv.innerHTML = `
    <h3>📊 ${playerName}'s Team Summary</h3>
    <div class="summary-stats">
      <div class="summary-stat">
        <label>Team OVR</label>
        <span class="summary-value">${summary.totalOVR}</span>
      </div>
      <div class="summary-stat">
        <label>Average OVR</label>
        <span class="summary-value">${summary.averageOVR}</span>
      </div>
      <div class="summary-stat">
        <label>Chemistry</label>
        <span class="summary-value">${summary.chemistryBonus >= 0 ? '+' : ''}${summary.chemistryBonus}</span>
      </div>
      <div class="summary-stat">
        <label>Top Pick</label>
        <span class="summary-value-text">${summary.topPick}</span>
      </div>
      <div class="summary-stat">
        <label>Highest OVR</label>
        <span class="summary-value">${summary.highestOVR || 0}</span>
      </div>
    </div>
    <div class="summary-chemistry">
      <h4>Chemistry Details</h4>
      <ul>
        ${chemistryLines}
      </ul>
    </div>
  `;
  
  container.appendChild(summaryDiv);
}

// Display final leaderboard after all character evaluations
function displayFinalLeaderboard() {
  if (!round4State.finalLeaderboard) return;
  
  const container = document.getElementById('evalCardsContainer');
  if (!container) return;

  const existing = container.querySelector('.eval-final-leaderboard');
  if (existing) existing.remove();
  
  const leaderboardDiv = document.createElement('div');
  leaderboardDiv.className = 'eval-final-leaderboard';
  leaderboardDiv.innerHTML = `<h2>🏆 Round 4 Leaderboard</h2>`;
  
  const table = document.createElement('table');
  table.className = 'leaderboard-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Rank</th>
        <th>Team</th>
        <th>Team OVR</th>
        <th>Chemistry</th>
        <th>Top Pick</th>
      </tr>
    </thead>
    <tbody>
      ${round4State.finalLeaderboard.map((team, idx) => `
        <tr class="rank-${idx + 1}">
          <td>${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx + 1)}</td>
          <td><strong>${team.playerName}</strong></td>
          <td><strong>${team.totalOVR}</strong></td>
          <td>${team.chemistryBonus >= 0 ? '+' : ''}${team.chemistryBonus}</td>
          <td>${team.topPick}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  
  leaderboardDiv.appendChild(table);
  container.appendChild(leaderboardDiv);
  round4State.isEvaluating = false;

  const continueBtn = document.getElementById('evalContinueBtn');
  if (continueBtn) continueBtn.disabled = false;
}

// Utility: Toggle scenario visibility
function toggleEvalScenario() {
  const content = document.getElementById('evalScenarioContent');
  const icon = document.getElementById('evalScenarioIcon');
  
  if (content && icon) {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    icon.textContent = isHidden ? '▼' : '▶';
  }
}

function requestFinalResults() {
  if (round4State.finalResultsRequested) return;
  if (!window.socket) return;
  round4State.finalResultsRequested = true;

  const continueBtn = document.getElementById('evalContinueBtn');
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Waiting for others...';
  }

  const status = document.getElementById('evalFinalStatus');
  if (status) status.textContent = 'Waiting for players...';

  window.socket.emit('requestFinalResults');
}

// Export for module
window.initRound4Evaluation = initRound4Evaluation;
window.toggleEvalScenario = toggleEvalScenario;
window.requestFinalResults = requestFinalResults;
