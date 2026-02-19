import { gameState } from './state.js';

let scenarioCollapsed = false;
let votingContextCollapsed = false;
let livePicksOpen = false;
let resultsDetailsOpen = false;

export function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    const firstFocusable = screen.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable && !document.activeElement.matches('input[type="text"]')) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
  }
}

export function showHelp() {
  showScreen('tutorial');
}

export function closeHelp() {
  showScreen('join');
}

export function createConfetti() {
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

export function showToast(message, type = 'info', duration = 3000) {
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

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function updateDraftWarning(character, isDuplicate = false) {
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

export function updateAutoFillWarning() {
  const warningEl = document.getElementById('draftWarning');
  if (!warningEl) return;

  if (gameState.myTeam.length === 0) {
    warningEl.className = 'draft-warning-modern info';
    warningEl.textContent = 'ℹ️ Time running out! No picks? Random words will fill your team.';
    warningEl.style.display = 'block';
  }
}

export function updateDraftCounter() {
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

export function switchLobbyTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  const selectedTab = document.getElementById(`${tabName}Tab`);
  if (selectedTab) selectedTab.classList.add('active');

  const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (selectedBtn) selectedBtn.classList.add('active');
}

export function toggleAccordion(header) {
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

export function toggleScenario() {
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

export function toggleVotingContext() {
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

export function toggleLivePicks() {
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

export function toggleResultsDetails() {
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

export function resetResultsDetails() {
  resultsDetailsOpen = false;
  const details = document.getElementById('resultsDetails');
  const icon = document.getElementById('resultsDetailsIcon');
  if (details) details.style.display = 'none';
  if (icon) icon.textContent = '▼';
}

export function updateLivePicksCount(count) {
  const countEl = document.getElementById('livePicksCount');
  if (countEl) countEl.textContent = count;
}

export function updateVoteStatusBadge(status) {
  const badge = document.getElementById('voteStatusBadge');
  if (badge) badge.textContent = status;
}
