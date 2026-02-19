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

  // Filter out "Low relevance" notes since detail is now in modal
  const notes = Array.isArray(evalData.notes) 
    ? evalData.notes.filter(note => !note.toLowerCase().includes('low relevance')).slice(0, 2) 
    : [];
  const notesHtml = notes.map(note => `<li>${note}</li>`).join('');
  
  // Determine OVR tier and color
  const ovrTier = evalData.ovrTier || getOVRTierFromValue(evalData.ovr);
  const ovrClass = `ovr-${ovrTier.tier}`;
  const rarity = evalData.rarity || 'Common';
  const characterType = evalData.characterType || 'balanced';
  
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
      <div class="eval-score" title="Score: 0-30">
        <span class="eval-score-value">${evalData.score}</span>
        <span class="eval-score-max">/30</span>
      </div>
      <div class="eval-ovr ${ovrClass} eval-ovr-clickable" title="Click for detailed breakdown" role="button" tabindex="0" aria-label="View OVR breakdown for ${evalData.character}">
        <div class="eval-ovr-label">OVR</div>
        <div class="eval-ovr-value">${evalData.ovr}</div>
        <div class="eval-ovr-tier">${ovrTier.label}</div>
      </div>
    </div>
    <div class="eval-card-meta">
      <span class="eval-rarity" title="Rarity">${rarity}</span>
      <span class="eval-type" title="Character Type">${characterType}</span>
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
  
  // Add click handler to OVR element
  const ovrElement = card.querySelector('.eval-ovr-clickable');
  if (ovrElement) {
    ovrElement.addEventListener('click', () => openOVRBreakdown(evalData));
    ovrElement.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openOVRBreakdown(evalData);
      }
    });
  }
  
  container.appendChild(card);
}

// Helper function to get OVR tier from value (client-side fallback)
function getOVRTierFromValue(ovr) {
  if (ovr >= 99) return { tier: 'icon', label: 'Icon', color: '#f39c12' };
  if (ovr >= 95) return { tier: 'legendary', label: 'Legendary', color: '#e74c3c' };
  if (ovr >= 90) return { tier: 'epic', label: 'Epic', color: '#9b59b6' };
  if (ovr >= 85) return { tier: 'rare', label: 'Rare', color: '#ff6b35' };
  if (ovr >= 75) return { tier: 'gold', label: 'Gold', color: '#ffd700' };
  if (ovr >= 65) return { tier: 'silver', label: 'Silver', color: '#c0c0c0' };
  return { tier: 'bronze', label: 'Bronze', color: '#cd7f32' };
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

// Open OVR Breakdown Modal
function openOVRBreakdown(evalData) {
  const modal = document.getElementById('ovrBreakdownModal');
  if (!modal) return;

  // Populate character summary
  const summaryEl = document.getElementById('modalCharacterSummary');
  if (summaryEl && evalData.breakdown) {
    summaryEl.textContent = evalData.breakdown.characterSummary || 'No information available.';
  }

  // Populate scenario relevance
  const scenarioEl = document.getElementById('modalScenarioRelevance');
  if (scenarioEl && evalData.breakdown) {
    scenarioEl.textContent = evalData.breakdown.scenarioRelevance || 'No scenario analysis available.';
  }
  const scenarioKeywordsEl = document.getElementById('modalScenarioKeywords');
  if (scenarioKeywordsEl) {
    const scenarioKeywords = evalData.breakdown && evalData.breakdown.keywordMatches
      ? evalData.breakdown.keywordMatches.scenario || []
      : [];
    scenarioKeywordsEl.innerHTML = scenarioKeywords.length
      ? `<span class="ovr-keywords-label">Keywords:</span>${scenarioKeywords.map(kw => `<span class="ovr-keyword-chip">${kw}</span>`).join('')}`
      : '<span class="ovr-keywords-empty">No keyword matches</span>';
  }

  // Populate twist relevance
  const twistEl = document.getElementById('modalTwistRelevance');
  if (twistEl && evalData.breakdown) {
    twistEl.textContent = evalData.breakdown.twistRelevance || 'No twist analysis available.';
  }
  const twistKeywordsEl = document.getElementById('modalTwistKeywords');
  if (twistKeywordsEl) {
    const twistKeywords = evalData.breakdown && evalData.breakdown.keywordMatches
      ? evalData.breakdown.keywordMatches.twist || []
      : [];
    twistKeywordsEl.innerHTML = twistKeywords.length
      ? `<span class="ovr-keywords-label">Keywords:</span>${twistKeywords.map(kw => `<span class="ovr-keyword-chip">${kw}</span>`).join('')}`
      : '<span class="ovr-keywords-empty">No keyword matches</span>';
  }

  // Populate score breakdown
  const scoreBreakdownEl = document.getElementById('modalScoreBreakdown');
  if (scoreBreakdownEl && evalData.breakdown && evalData.breakdown.scoreBreakdown) {
    const steps = evalData.breakdown.scoreBreakdown;
    const positiveSteps = steps.filter(step => step.points > 0);
    const negativeSteps = steps.filter(step => step.points < 0);
    const positiveTotal = positiveSteps.reduce((sum, step) => sum + step.points, 0);
    const negativeTotal = Math.abs(negativeSteps.reduce((sum, step) => sum + step.points, 0));
    const positiveScale = Math.max(30, positiveTotal || 1);
    const negativeScale = Math.max(6, negativeTotal || 1);

    const buildAcronym = (label) => String(label || '')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(part => part[0].toUpperCase())
      .join('');

    const positiveSegments = positiveSteps.map((step, index) => {
      const width = Math.max(6, (step.points / positiveScale) * 100);
      return `<span class="score-mini-segment pos" style="width:${width}%;--segment-hue:${(index * 38) % 360};" title="${step.step}: +${step.points}${step.description ? ` — ${step.description}` : ''}"></span>`;
    }).join('');

    const negativeSegments = negativeSteps.map((step, index) => {
      const width = Math.max(8, (Math.abs(step.points) / negativeScale) * 100);
      return `<span class="score-mini-segment neg" style="width:${width}%;--segment-hue:${(index * 22) % 360};" title="${step.step}: ${step.points}${step.description ? ` — ${step.description}` : ''}"></span>`;
    }).join('');

    const legendChips = steps.map((step) => {
      const pointsClass = step.points > 0 ? 'positive' : step.points < 0 ? 'negative' : 'neutral';
      const pointsSign = step.points > 0 ? '+' : '';
      const tag = buildAcronym(step.step) || 'STEP';
      return `<span class="score-mini-chip ${pointsClass}" title="${step.step}${step.description ? ` — ${step.description}` : ''}"><strong>${tag}</strong> ${pointsSign}${step.points}</span>`;
    }).join('');

    scoreBreakdownEl.innerHTML = `
      <div class="score-mini-header">
        <span class="score-mini-title">Score Flow</span>
        <span class="score-mini-total"><strong>${evalData.score}/30</strong></span>
      </div>
      <div class="score-mini-track" aria-label="Positive score contributions">
        ${positiveSegments || '<span class="score-mini-empty">No positive modifiers</span>'}
      </div>
      ${negativeSegments ? `<div class="score-mini-track penalties" aria-label="Negative score contributions">${negativeSegments}</div>` : ''}
      <div class="score-mini-legend">${legendChips}</div>
    `;
  }

  // Populate OVR breakdown with percentages
  const ovrBreakdownEl = document.querySelector('.ovr-breakdown-items');
  if (ovrBreakdownEl && evalData.breakdown && evalData.breakdown.ovrBreakdown) {
    const ovr = evalData.breakdown.ovrBreakdown;
    const percentages = ovr.percentages || {};
    
    ovrBreakdownEl.innerHTML = `
      <div class="ovr-breakdown-item">
        <div class="ovr-breakdown-label">Base from Score</div>
        <div class="ovr-breakdown-value">${ovr.baseFromScore} (${percentages.scoreContribution || 0}%)</div>
      </div>
      <div class="ovr-breakdown-item">
        <div class="ovr-breakdown-label">Rarity Bonus</div>
        <div class="ovr-breakdown-value">${ovr.rarityBonus} (${percentages.rarityContribution || 0}%)</div>
      </div>
      <div class="ovr-breakdown-item">
        <div class="ovr-breakdown-label">Attribute Bonus</div>
        <div class="ovr-breakdown-value">${ovr.attributeBonus} (${percentages.attributeContribution || 0}%)</div>
      </div>
      <div class="ovr-breakdown-item">
        <div class="ovr-breakdown-label">Scenario Fit</div>
        <div class="ovr-breakdown-value">×${ovr.scenarioMultiplier.toFixed(2)} (${percentages.scenarioEffect > 0 ? '+' : ''}${percentages.scenarioEffect || 0}%)</div>
      </div>
      <div class="ovr-breakdown-item ovr-breakdown-total">
        <div class="ovr-breakdown-label"><strong>Final OVR</strong></div>
        <div class="ovr-breakdown-value"><strong>${ovr.finalOVR}/99</strong></div>
      </div>
    `;
  }

  // Show modal
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

// Close OVR Breakdown Modal
function closeOVRBreakdown() {
  const modal = document.getElementById('ovrBreakdownModal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

// Draw simple pie chart for OVR breakdown
function drawOVRPieChart(percentages) {
  const canvas = document.getElementById('ovrBreakdownChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 100;
  
  const data = [
    { label: 'Score', value: percentages.scoreContribution || 0, color: '#00bcd4' },
    { label: 'Rarity', value: percentages.rarityContribution || 0, color: '#ffd700' },
    { label: 'Attributes', value: percentages.attributeContribution || 0, color: '#4caf50' },
    { label: 'Scenario', value: Math.abs(percentages.scenarioEffect || 0), color: (percentages.scenarioEffect || 0) >= 0 ? '#9b59b6' : '#ff5252' }
  ];
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw pie slices
  let currentAngle = -Math.PI / 2; // Start at top
  data.forEach(segment => {
    const sliceAngle = (segment.value / 100) * 2 * Math.PI;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = segment.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    currentAngle += sliceAngle;
  });
  
  // Draw center circle for donut effect
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

// Close modal when clicking outside or pressing Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeOVRBreakdown();
  }
});

// Export for module
window.initRound4Evaluation = initRound4Evaluation;
window.toggleEvalScenario = toggleEvalScenario;
window.requestFinalResults = requestFinalResults;
window.openOVRBreakdown = openOVRBreakdown;
window.closeOVRBreakdown = closeOVRBreakdown;
