import { showScreen, showToast } from './ui.js';

const DUAL_HUB_BUILD = '20260306-phase3-1';
try {
  window.__lobbyBuild = window.__lobbyBuild || {};
  window.__lobbyBuild.dualHub = DUAL_HUB_BUILD;
} catch (_error) {}

const ONBOARDING_DONE_KEY = 'lobbywars_dual_hub_onboarding_done_v1';
const IDENTITY_KEY = 'lobbywars_dual_hub_identity_v1';
const SOLO_MODE_ID = 'daily_cipher_clash';
const SOLO_SLOT_IDS = ['lead', 'anchor', 'wildcard', 'closer'];
const HUB_ROUTES = Object.freeze({
  home: 'homeHub',
  solo: 'soloHub',
  party: 'join',
  profile: 'profileHub',
  progression: 'progressionHub',
  achievements: 'achievementsHub'
});

const HUB_SCREEN_IDS = new Set([
  'dualPathOnboarding',
  'homeHub',
  'soloHub',
  'join',
  'profileHub',
  'progressionHub',
  'achievementsHub'
]);

const state = {
  initialized: false,
  flags: {
    progressionEnabled: false,
    achievementsEnabled: false,
    soloEngineEnabled: true,
    dualHubUiEnabled: true
  },
  identity: {
    userId: '',
    guestAlias: '',
    displayName: 'Guest'
  },
  profileBundle: null,
  achievements: {
    definitions: [],
    unlocks: []
  },
  onboarding: {
    timerId: null,
    remainingSeconds: 8,
    start: null
  },
  solo: {
    run: null,
    challenge: null,
    entries: {
      lead: '',
      anchor: '',
      wildcard: '',
      closer: ''
    },
    attempts: [],
    summary: null,
    leaderboard: null,
    resetCountdownTimerId: null
  }
};

function safeStorageGet(key = '') {
  try {
    return window.localStorage.getItem(String(key || ''));
  } catch (_error) {
    return null;
  }
}

function safeStorageSet(key = '', value = '') {
  try {
    window.localStorage.setItem(String(key || ''), String(value || ''));
  } catch (_error) {}
}

function safeStorageJsonGet(key = '') {
  try {
    const raw = safeStorageGet(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function safeStorageJsonSet(key = '', value = {}) {
  try {
    safeStorageSet(key, JSON.stringify(value || {}));
  } catch (_error) {}
}

function makeGuestAlias() {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
  return `device:${suffix}`.slice(0, 120);
}

function makeIdempotencyKey(prefix = 'hub') {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function routeForScreenId(screenId = '') {
  const safeScreenId = String(screenId || '');
  if (safeScreenId === 'join') return 'party';
  if (safeScreenId === 'homeHub') return 'home';
  if (safeScreenId === 'soloHub') return 'solo';
  if (safeScreenId === 'profileHub') return 'profile';
  if (safeScreenId === 'progressionHub') return 'progression';
  if (safeScreenId === 'achievementsHub') return 'achievements';
  return '';
}

function formatDateTime(iso = '') {
  if (!iso) return '--';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
  } catch (_error) {
    return '--';
  }
}

function formatNumber(value = 0) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return '0';
  return Math.round(safe).toLocaleString();
}

function formatResetCountdown(msUntilReset = 0) {
  const safeMs = Math.max(0, Number(msUntilReset) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function nextUtcResetMs(nowMs = Date.now()) {
  const now = new Date(Number(nowMs) || Date.now());
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
}

function getStoredIdentity() {
  const stored = safeStorageJsonGet(IDENTITY_KEY);
  if (!stored || typeof stored !== 'object') return null;
  return {
    userId: String(stored.userId || '').trim(),
    guestAlias: String(stored.guestAlias || '').trim(),
    displayName: String(stored.displayName || 'Guest').trim() || 'Guest'
  };
}

function setStoredIdentity(identity = {}) {
  safeStorageJsonSet(IDENTITY_KEY, {
    userId: String(identity.userId || '').trim(),
    guestAlias: String(identity.guestAlias || '').trim(),
    displayName: String(identity.displayName || 'Guest').trim() || 'Guest'
  });
}

async function requestJson(url, { method = 'GET', body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_error) {
    payload = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    body: payload
  };
}

async function loadFlags() {
  try {
    const response = await requestJson('/api/meta/flags');
    if (!response.ok || !response.body) return;
    if (Object.prototype.hasOwnProperty.call(response.body, 'progressionEnabled')) {
      state.flags.progressionEnabled = response.body.progressionEnabled === true;
    }
    if (Object.prototype.hasOwnProperty.call(response.body, 'achievementsEnabled')) {
      state.flags.achievementsEnabled = response.body.achievementsEnabled === true;
    }
    if (Object.prototype.hasOwnProperty.call(response.body, 'soloEngineEnabled')) {
      state.flags.soloEngineEnabled = response.body.soloEngineEnabled === true;
    }
    if (Object.prototype.hasOwnProperty.call(response.body, 'dualHubUiEnabled')) {
      state.flags.dualHubUiEnabled = response.body.dualHubUiEnabled !== false;
    }
  } catch (_error) {}
}

function getPreferredDisplayName() {
  const nameInput = document.getElementById('name');
  const fromInput = nameInput ? String(nameInput.value || '').trim() : '';
  if (fromInput) return fromInput.slice(0, 32);
  const stored = getStoredIdentity();
  if (stored && stored.displayName) return stored.displayName.slice(0, 32);
  return 'Guest';
}

async function ensureIdentity() {
  const stored = getStoredIdentity();
  const guestAlias = stored && stored.guestAlias ? stored.guestAlias : makeGuestAlias();
  const displayName = getPreferredDisplayName();
  const response = await requestJson('/api/identity/guest-session', {
    method: 'POST',
    body: {
      displayName,
      guestAlias
    }
  });
  if (!response.ok || !response.body || !response.body.user || !response.body.user.userId) {
    throw new Error('identity_bootstrap_failed');
  }

  state.identity.userId = String(response.body.user.userId || '');
  state.identity.guestAlias = guestAlias;
  state.identity.displayName = String(
    (response.body.profile && response.body.profile.displayName)
    || displayName
    || 'Guest'
  ).trim() || 'Guest';

  setStoredIdentity(state.identity);

  const partyNameInput = document.getElementById('name');
  if (partyNameInput && !String(partyNameInput.value || '').trim()) {
    partyNameInput.value = state.identity.displayName;
  }
}

function getUserId() {
  return String(state.identity.userId || '').trim();
}

async function loadProfileBundle() {
  const userId = getUserId();
  if (!userId) return;
  const response = await requestJson(`/api/meta/profile/${encodeURIComponent(userId)}`);
  if (!response.ok || !response.body) return;
  state.profileBundle = response.body;
}

async function loadAchievements() {
  const userId = getUserId();
  if (!userId) return;
  if (state.flags.achievementsEnabled !== true) {
    state.achievements = { definitions: [], unlocks: [] };
    return;
  }
  const response = await requestJson(`/api/meta/achievements/${encodeURIComponent(userId)}`);
  if (!response.ok || !response.body) return;
  state.achievements = {
    definitions: Array.isArray(response.body.definitions) ? response.body.definitions : [],
    unlocks: Array.isArray(response.body.unlocks) ? response.body.unlocks : []
  };
}

function getSoloProgressState() {
  const progression = state.profileBundle && state.profileBundle.progression ? state.profileBundle.progression : {};
  const solo = progression && progression.solo && typeof progression.solo === 'object' ? progression.solo : {};
  const modes = solo && solo.modes && typeof solo.modes === 'object' ? solo.modes : {};
  return modes[SOLO_MODE_ID] && typeof modes[SOLO_MODE_ID] === 'object'
    ? modes[SOLO_MODE_ID]
    : {
      currentStreak: 0,
      longestStreak: 0,
      totalScoredRuns: 0,
      bestScore: 0
    };
}

function renderHome() {
  const profile = state.profileBundle && state.profileBundle.profile ? state.profileBundle.profile : null;
  const progression = state.profileBundle && state.profileBundle.progression ? state.profileBundle.progression : null;
  const soloProgress = getSoloProgressState();
  const greeting = document.getElementById('homeHubGreeting');
  if (greeting) {
    greeting.textContent = profile
      ? `${profile.displayName || 'Guest'}, your cross-mode profile is ready.`
      : 'Guest profile active. Start Solo or jump into Party.';
  }

  const levelNode = document.getElementById('homeStatLevel');
  if (levelNode) levelNode.textContent = formatNumber(progression && progression.level);
  const xpNode = document.getElementById('homeStatXp');
  if (xpNode) xpNode.textContent = formatNumber(progression && progression.totalXp);
  const streakNode = document.getElementById('homeStatSoloStreak');
  if (streakNode) streakNode.textContent = formatNumber(soloProgress.currentStreak);
}

function renderProfile() {
  const user = state.profileBundle && state.profileBundle.user ? state.profileBundle.user : null;
  const profile = state.profileBundle && state.profileBundle.profile ? state.profileBundle.profile : null;
  const soloProgress = getSoloProgressState();

  const displayNameNode = document.getElementById('profileDisplayName');
  if (displayNameNode) displayNameNode.textContent = String((profile && profile.displayName) || state.identity.displayName || 'Guest');
  const identityNode = document.getElementById('profileIdentityLine');
  if (identityNode) identityNode.textContent = `User ID: ${getUserId() || '--'}`;
  const accountTypeNode = document.getElementById('profileAccountType');
  if (accountTypeNode) accountTypeNode.textContent = String((user && user.kind) || 'guest');
  const createdNode = document.getElementById('profileCreatedAt');
  if (createdNode) createdNode.textContent = formatDateTime(user && user.createdAt);
  const updatedNode = document.getElementById('profileUpdatedAt');
  if (updatedNode) updatedNode.textContent = formatDateTime(profile && profile.updatedAt);

  const bestScoreNode = document.getElementById('profileSoloBestScore');
  if (bestScoreNode) bestScoreNode.textContent = formatNumber(soloProgress.bestScore || 0);
  const streakNode = document.getElementById('profileSoloCurrentStreak');
  if (streakNode) streakNode.textContent = formatNumber(soloProgress.currentStreak || 0);
  const longestNode = document.getElementById('profileSoloLongestStreak');
  if (longestNode) longestNode.textContent = formatNumber(soloProgress.longestStreak || 0);
}

function renderProgression() {
  const progression = state.profileBundle && state.profileBundle.progression ? state.profileBundle.progression : null;
  const soloProgress = getSoloProgressState();
  const level = Math.max(1, Number(progression && progression.level) || 1);
  const totalXp = Math.max(0, Number(progression && progression.totalXp) || 0);
  const xpIntoLevel = Math.max(0, Number(progression && progression.xpIntoLevel) || 0);
  const xpForNextLevel = Math.max(1, Number(progression && progression.xpForNextLevel) || 1);
  const pct = Math.max(0, Math.min(100, (xpIntoLevel / xpForNextLevel) * 100));

  const levelNode = document.getElementById('progressionLevel');
  if (levelNode) levelNode.textContent = formatNumber(level);
  const totalXpNode = document.getElementById('progressionTotalXp');
  if (totalXpNode) totalXpNode.textContent = formatNumber(totalXp);
  const fillNode = document.getElementById('progressionXpFill');
  if (fillNode) fillNode.style.width = `${pct.toFixed(1)}%`;
  const labelNode = document.getElementById('progressionXpLabel');
  if (labelNode) labelNode.textContent = `${formatNumber(xpIntoLevel)} / ${formatNumber(xpForNextLevel)} XP`;

  const runsNode = document.getElementById('progressionSoloRuns');
  if (runsNode) runsNode.textContent = formatNumber(soloProgress.totalScoredRuns || 0);
  const streakNode = document.getElementById('progressionSoloStreak');
  if (streakNode) streakNode.textContent = formatNumber(soloProgress.currentStreak || 0);
  const longestNode = document.getElementById('progressionSoloLongest');
  if (longestNode) longestNode.textContent = formatNumber(soloProgress.longestStreak || 0);
}

function renderAchievements() {
  const statusNode = document.getElementById('achievementsStatusMessage');
  const countNode = document.getElementById('achievementsUnlockedCount');
  const listNode = document.getElementById('achievementsList');
  if (!listNode) return;

  listNode.innerHTML = '';
  if (state.flags.achievementsEnabled !== true) {
    if (statusNode) statusNode.textContent = 'Achievements are disabled by feature flag.';
    if (countNode) countNode.textContent = '0';
    const row = document.createElement('li');
    row.className = 'empty';
    row.textContent = 'No achievements available in this environment.';
    listNode.appendChild(row);
    return;
  }

  const unlockMap = new Map(
    (state.achievements.unlocks || []).map((entry) => [String(entry.achievementId || ''), entry])
  );
  const definitions = Array.isArray(state.achievements.definitions) ? state.achievements.definitions : [];
  const unlockedCount = (state.achievements.unlocks || []).length;
  if (countNode) countNode.textContent = formatNumber(unlockedCount);
  if (statusNode) statusNode.textContent = `Unlocked ${unlockedCount} of ${definitions.length} definitions.`;

  if (!definitions.length) {
    const row = document.createElement('li');
    row.className = 'empty';
    row.textContent = 'No definitions loaded.';
    listNode.appendChild(row);
    return;
  }

  definitions.forEach((definition) => {
    const id = String(definition && definition.id || '');
    const unlocked = unlockMap.get(id);
    const row = document.createElement('li');
    row.innerHTML = `
      <strong>${String(definition && definition.title || id || 'Untitled')}</strong>
      <div>${String(definition && definition.category || 'Uncategorized')}</div>
      <small>${unlocked ? `Unlocked ${formatDateTime(unlocked.unlockedAt)}` : 'Locked'}</small>
    `;
    listNode.appendChild(row);
  });
}

function renderMetaViews() {
  renderHome();
  renderProfile();
  renderProgression();
  renderAchievements();
}

function setHubNavVisibilityForScreen(screenId = '') {
  const nav = document.getElementById('hubNav');
  if (!nav) return;
  const safeScreenId = String(screenId || '');
  const shouldShow = HUB_SCREEN_IDS.has(safeScreenId);
  nav.hidden = !shouldShow;
  document.body.classList.toggle('hub-nav-visible', shouldShow);
}

function setActiveRoute(route = '') {
  const safeRoute = String(route || '').trim();
  const navButtons = Array.from(document.querySelectorAll('#hubNav .hub-nav-btn'));
  navButtons.forEach((button) => {
    const active = String(button.getAttribute('data-route') || '') === safeRoute;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function navigateToRoute(route = 'home') {
  const safeRoute = Object.prototype.hasOwnProperty.call(HUB_ROUTES, route) ? route : 'home';
  const screenId = HUB_ROUTES[safeRoute];
  showScreen(screenId);
  setActiveRoute(safeRoute);
  if (safeRoute === 'party') {
    const roomInput = document.getElementById('room');
    if (roomInput && !String(roomInput.value || '').trim()) {
      roomInput.focus();
    }
  }
}

function bindHubNavigation() {
  const nav = document.getElementById('hubNav');
  if (!nav) return;
  nav.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target ? target.closest('.hub-nav-btn') : null;
    if (!button) return;
    const route = String(button.getAttribute('data-route') || '').trim();
    if (!route) return;
    navigateToRoute(route);
  });
}

function clearOnboardingTimer() {
  if (state.onboarding.timerId) {
    window.clearInterval(state.onboarding.timerId);
    state.onboarding.timerId = null;
  }
}

function markOnboardingDone() {
  safeStorageSet(ONBOARDING_DONE_KEY, '1');
}

function shouldShowOnboarding() {
  return safeStorageGet(ONBOARDING_DONE_KEY) !== '1';
}

function bindOnboarding() {
  const soloBtn = document.getElementById('onboardingSoloBtn');
  const partyBtn = document.getElementById('onboardingPartyBtn');
  const skipBtn = document.getElementById('onboardingSkipBtn');
  const countdown = document.getElementById('onboardingCountdown');
  if (!soloBtn || !partyBtn || !skipBtn || !countdown) return;

  function endOnboarding(nextRoute = 'home') {
    clearOnboardingTimer();
    markOnboardingDone();
    navigateToRoute(nextRoute);
  }

  soloBtn.addEventListener('click', () => endOnboarding('solo'));
  partyBtn.addEventListener('click', () => endOnboarding('party'));
  skipBtn.addEventListener('click', () => endOnboarding('home'));

  state.onboarding.start = () => {
    state.onboarding.remainingSeconds = 8;
    countdown.textContent = `Auto-close in ${state.onboarding.remainingSeconds}s`;
    clearOnboardingTimer();
    state.onboarding.timerId = window.setInterval(() => {
      state.onboarding.remainingSeconds -= 1;
      if (state.onboarding.remainingSeconds <= 0) {
        endOnboarding('home');
        return;
      }
      countdown.textContent = `Auto-close in ${state.onboarding.remainingSeconds}s`;
    }, 1000);
  };
}

function renderSoloRunMeta(run = null) {
  const metaRow = document.getElementById('soloRunMeta');
  if (!metaRow) return;
  metaRow.innerHTML = '';
  if (!run) {
    const chip = document.createElement('span');
    chip.className = 'hub-chip';
    chip.textContent = 'No active run';
    metaRow.appendChild(chip);
    return;
  }
  const chips = [
    `Run ${run.runId || '--'}`,
    `Status ${run.status || '--'}`,
    run.practice ? 'Practice' : 'Scored',
    `Attempts ${Number(run.attemptsUsed) || 0}/${Number(run.maxAttempts) || 6}`,
    `Hints ${Number(run.hintsUsed) || 0}/${Number(run.maxHints) || 2}`
  ];
  chips.forEach((text) => {
    const chip = document.createElement('span');
    chip.className = 'hub-chip';
    chip.textContent = text;
    metaRow.appendChild(chip);
  });
}

function updateSoloCounterChips(run = null) {
  const attemptsChip = document.getElementById('soloAttemptsChip');
  const hintsChip = document.getElementById('soloHintsChip');
  if (attemptsChip) {
    const used = run ? Number(run.attemptsUsed) || 0 : 0;
    const max = run ? Number(run.maxAttempts) || 6 : 6;
    attemptsChip.textContent = `Attempts ${used}/${max}`;
  }
  if (hintsChip) {
    const used = run ? Number(run.hintsUsed) || 0 : 0;
    const max = run ? Number(run.maxHints) || 2 : 2;
    hintsChip.textContent = `Hints ${used}/${max}`;
  }
}

function renderSoloEntryPrompts() {
  const grid = document.getElementById('soloPromptGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const prompts = state.solo.challenge && Array.isArray(state.solo.challenge.entryPrompts)
    ? state.solo.challenge.entryPrompts
    : [];
  prompts.forEach((prompt) => {
    const slotId = String(prompt.slotId || '');
    const card = document.createElement('article');
    card.className = 'solo-entry-card';
    card.innerHTML = `
      <header>
        <strong>${String(prompt.label || slotId)}</strong>
        <small>${String(prompt.role || 'Draft slot')}</small>
      </header>
      <p>${String(prompt.prompt || '')}</p>
      <input
        type="text"
        maxlength="80"
        data-solo-entry-slot="${slotId}"
        placeholder="Type an entry..."
        value="${String(state.solo.entries[slotId] || '').replace(/\"/g, '&quot;')}"
      />
    `;
    grid.appendChild(card);
  });
}

function renderSoloAttempts() {
  const list = document.getElementById('soloAttemptLog');
  if (!list) return;
  list.innerHTML = '';
  if (!state.solo.attempts.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No attempts submitted yet.';
    list.appendChild(empty);
    return;
  }
  state.solo.attempts.forEach((attempt) => {
    const row = document.createElement('li');
    const grades = Array.isArray(attempt.slotFeedback)
      ? attempt.slotFeedback.map((slot) => `${slot.label}:${slot.grade}${slot.ovr ? `(${formatNumber(slot.ovr)})` : ''}`).join(' | ')
      : 'No slot feedback';
    const team = attempt.teamSummary && typeof attempt.teamSummary === 'object' ? attempt.teamSummary : null;
    row.innerHTML = `
      <strong>Attempt ${formatNumber(attempt.attemptNumber)}</strong>
      <div>${grades}</div>
      <div>Team OVR ${formatNumber(team && team.averageOVR)} | In Category ${formatNumber(team && team.inCategoryCount)}</div>
      <small>Trend ${attempt.teamSynergyTrend || 'Flat'} | ${attempt.clueLine || ''}</small>
    `;
    list.appendChild(row);
  });
}

function renderSoloSummary() {
  const card = document.getElementById('soloSummaryCard');
  const content = document.getElementById('soloSummaryContent');
  if (!card || !content) return;
  if (!state.solo.summary) {
    card.hidden = true;
    content.innerHTML = '';
    return;
  }
  const summary = state.solo.summary;
  const team = summary.team && typeof summary.team === 'object' ? summary.team : null;
  const bestCards = Array.isArray(summary.bestCards) ? summary.bestCards : [];
  card.hidden = false;
  content.innerHTML = `
    <div class="hub-field-row"><span>Outcome</span><strong>${String(summary.outcome || '--')}</strong></div>
    <div class="hub-field-row"><span>Final Score</span><strong>${formatNumber(summary.finalScore || 0)}</strong></div>
    <div class="hub-field-row"><span>Team OVR</span><strong>${formatNumber(team && team.averageOVR)}</strong></div>
    <div class="hub-field-row"><span>In Category</span><strong>${formatNumber(team && team.inCategoryCount)}</strong></div>
    <div class="hub-field-row"><span>Scored</span><strong>${summary.scored ? 'Yes' : 'No'}</strong></div>
    <div class="hub-field-row"><span>Practice</span><strong>${summary.practice ? 'Yes' : 'No'}</strong></div>
    <div class="hub-field-row"><span>Streak</span><strong>${formatNumber(summary.streak && summary.streak.currentStreak)}</strong></div>
    <div class="hub-field-row"><span>XP Granted</span><strong>${formatNumber(summary.xp && summary.xp.grantedXp)}</strong></div>
    ${bestCards.length ? `<div class="hub-field-row"><span>Top Cards</span><strong>${bestCards.map((card) => `${String(card.character || '--')} (${formatNumber(card.ovr || 0)})`).join(', ')}</strong></div>` : ''}
  `;
}

function updateSoloActionButtons() {
  const run = state.solo.run;
  const submitBtn = document.getElementById('soloSubmitBtn');
  const hintBtn = document.getElementById('soloHintBtn');
  const finalizeBtn = document.getElementById('soloFinalizeBtn');
  const canSubmit = Boolean(
    run
    && run.status === 'active'
    && SOLO_SLOT_IDS.every((slotId) => Boolean(state.solo.entries[slotId]))
  );
  const canHint = Boolean(run && run.status === 'active');
  const canFinalize = Boolean(run && (run.status === 'solved_pending_finalize' || run.status === 'failed_pending_finalize'));
  if (submitBtn) submitBtn.disabled = !canSubmit;
  if (hintBtn) hintBtn.disabled = !canHint;
  if (finalizeBtn) finalizeBtn.disabled = !canFinalize;
}

function setSoloStatusMessage(message = '') {
  const node = document.getElementById('soloStatusMessage');
  if (!node) return;
  node.textContent = String(message || '');
}

function resetSoloDraftState() {
  state.solo.entries = {
    lead: '',
    anchor: '',
    wildcard: '',
    closer: ''
  };
  renderSoloEntryPrompts();
  updateSoloActionButtons();
}

function applyRunAndChallenge(run = null, challenge = null) {
  state.solo.run = run;
  state.solo.challenge = challenge;
  const card = document.getElementById('soloChallengeCard');
  if (card) card.hidden = !(run && challenge);
  const title = document.getElementById('soloChallengeTitle');
  if (title) title.textContent = challenge ? `${String(challenge.modeId || SOLO_MODE_ID)} | ${String(challenge.dateKey || '--')}` : 'Challenge';
  const scenario = document.getElementById('soloScenarioLine');
  if (scenario) {
    const category = challenge && challenge.lockedCategory && challenge.lockedCategory.displayName
      ? ` | Category: ${challenge.lockedCategory.displayName}`
      : '';
    scenario.textContent = `Scenario: ${String(challenge && challenge.scenarioId || '--')}${category}`;
  }
  const twist = document.getElementById('soloTwistLine');
  if (twist) twist.textContent = `Twist: ${String(challenge && challenge.twistId || '--')}`;
  renderSoloRunMeta(run);
  updateSoloCounterChips(run);
  resetSoloDraftState();
}

async function startSoloRun({ practice = false } = {}) {
  if (state.flags.soloEngineEnabled !== true) {
    setSoloStatusMessage('Solo engine is disabled in this environment.');
    return;
  }
  const userId = getUserId();
  if (!userId) return;
  const response = await requestJson('/api/solo/runs/start', {
    method: 'POST',
    body: {
      userId,
      modeId: SOLO_MODE_ID,
      practice: practice === true,
      clientStartedAtMs: Date.now()
    }
  });
  if (!response.ok || !response.body || !response.body.run || !response.body.challenge) {
    setSoloStatusMessage(`Start failed (${response.body && response.body.error ? response.body.error : response.status})`);
    return;
  }
  state.solo.attempts = [];
  state.solo.summary = null;
  applyRunAndChallenge(response.body.run, response.body.challenge);
  renderSoloAttempts();
  renderSoloSummary();
  updateSoloActionButtons();
  const practiceTag = response.body.run.practice ? 'Practice run active.' : 'Scored run active.';
  setSoloStatusMessage(`${practiceTag} Draft four entries and submit your attempt.`);
}

async function submitSoloAttempt() {
  const userId = getUserId();
  const run = state.solo.run;
  if (!userId || !run) return;
  const response = await requestJson('/api/solo/runs/submit', {
    method: 'POST',
    body: {
      userId,
      runId: run.runId,
      idempotencyKey: makeIdempotencyKey('submit'),
      clientSubmittedAtMs: Date.now(),
      entries: state.solo.entries
    }
  });
  if (!response.ok || !response.body) {
    setSoloStatusMessage(`Submit failed (${response.body && response.body.error ? response.body.error : response.status})`);
    return;
  }
  if (response.body.idempotent !== true && response.body.attempt) {
    state.solo.attempts.push(response.body.attempt);
  }
  if (response.body.run) {
    state.solo.run = response.body.run;
  }
  renderSoloRunMeta(state.solo.run);
  updateSoloCounterChips(state.solo.run);
  renderSoloAttempts();
  updateSoloActionButtons();
  const attempt = response.body.attempt || {};
  const solved = attempt.solved === true;
  if (solved) {
    setSoloStatusMessage('Solved. Finalize your run to award score and XP.');
  } else if (state.solo.run && state.solo.run.status === 'failed_pending_finalize') {
    setSoloStatusMessage('Attempts exhausted. Finalize to capture summary.');
  } else {
    setSoloStatusMessage(`Attempt ${formatNumber(attempt.attemptNumber)} submitted. ${attempt.clueLine || ''}`);
  }
}

async function requestSoloHint() {
  const userId = getUserId();
  const run = state.solo.run;
  if (!userId || !run) return;
  const response = await requestJson('/api/solo/runs/hint', {
    method: 'POST',
    body: {
      userId,
      runId: run.runId,
      idempotencyKey: makeIdempotencyKey('hint'),
      clientRequestedAtMs: Date.now()
    }
  });
  if (!response.ok || !response.body) {
    setSoloStatusMessage(`Hint failed (${response.body && response.body.error ? response.body.error : response.status})`);
    return;
  }
  if (response.body.run) {
    state.solo.run = response.body.run;
  }
  renderSoloRunMeta(state.solo.run);
  updateSoloCounterChips(state.solo.run);
  updateSoloActionButtons();
  const hint = response.body.hint || {};
  setSoloStatusMessage(`Hint: ${hint.message || 'No hint text available.'}`);
}

async function finalizeSoloRun() {
  const userId = getUserId();
  const run = state.solo.run;
  if (!userId || !run) return;
  const response = await requestJson('/api/solo/runs/finalize', {
    method: 'POST',
    body: {
      userId,
      runId: run.runId,
      idempotencyKey: makeIdempotencyKey('finalize'),
      clientFinalizedAtMs: Date.now()
    }
  });
  if (!response.ok || !response.body) {
    setSoloStatusMessage(`Finalize failed (${response.body && response.body.error ? response.body.error : response.status})`);
    return;
  }
  if (response.body.run) {
    state.solo.run = response.body.run;
  }
  state.solo.summary = response.body.summary || null;
  renderSoloRunMeta(state.solo.run);
  updateSoloCounterChips(state.solo.run);
  renderSoloSummary();
  updateSoloActionButtons();
  setSoloStatusMessage('Run finalized. Summary and leaderboard updated.');
  await Promise.all([
    loadProfileBundle(),
    loadAchievements(),
    refreshSoloLeaderboard()
  ]);
  renderMetaViews();
}

async function refreshSoloLeaderboard() {
  const userId = getUserId();
  const response = await requestJson(
    `/api/solo/leaderboards/daily?modeId=${encodeURIComponent(SOLO_MODE_ID)}&limit=20&userId=${encodeURIComponent(userId)}`
  );
  const list = document.getElementById('soloLeaderboardRows');
  if (!list) return;
  list.innerHTML = '';
  if (!response.ok || !response.body) {
    const row = document.createElement('li');
    row.className = 'empty';
    row.textContent = `Leaderboard unavailable (${response.status}).`;
    list.appendChild(row);
    return;
  }
  state.solo.leaderboard = response.body;
  const entries = Array.isArray(response.body.entries) ? response.body.entries : [];
  if (!entries.length) {
    const row = document.createElement('li');
    row.className = 'empty';
    row.textContent = 'No scored entries for this UTC day yet.';
    list.appendChild(row);
  } else {
    entries.forEach((entry) => {
      const row = document.createElement('li');
      const isUser = getUserId() && String(entry.userId || '') === getUserId();
      row.innerHTML = `
        <strong>#${formatNumber(entry.rank)} ${String(entry.displayName || entry.userId || '--')}</strong>
        <div>Score ${formatNumber(entry.finalScore)} | Percentile ${formatNumber(entry.percentile)} (${String(entry.percentileBand || '--')})</div>
      `;
      if (isUser) {
        row.style.borderColor = 'rgba(0, 188, 212, 0.55)';
        row.style.boxShadow = '0 0 0 2px rgba(0, 188, 212, 0.16)';
      }
      list.appendChild(row);
    });
  }

  const bands = response.body.percentileBands || {};
  const userEntry = response.body.userEntry || null;
  let suffix = `Bands: top1 ${formatNumber(bands.top_1)} | top10 ${formatNumber(bands.top_10)} | top25 ${formatNumber(bands.top_25)}`;
  if (userEntry) {
    suffix += ` | You: #${formatNumber(userEntry.rank)} (${formatNumber(userEntry.percentile)}th)`;
  }
  setSoloStatusMessage(suffix);
}

function bindSoloUiEvents() {
  const startBtn = document.getElementById('soloStartBtn');
  const startPracticeBtn = document.getElementById('soloStartPracticeBtn');
  const submitBtn = document.getElementById('soloSubmitBtn');
  const hintBtn = document.getElementById('soloHintBtn');
  const finalizeBtn = document.getElementById('soloFinalizeBtn');
  const refreshBtn = document.getElementById('soloRefreshLeaderboardBtn');
  const promptGrid = document.getElementById('soloPromptGrid');
  if (startBtn) startBtn.addEventListener('click', () => { void startSoloRun({ practice: false }); });
  if (startPracticeBtn) startPracticeBtn.addEventListener('click', () => { void startSoloRun({ practice: true }); });
  if (submitBtn) submitBtn.addEventListener('click', () => { void submitSoloAttempt(); });
  if (hintBtn) hintBtn.addEventListener('click', () => { void requestSoloHint(); });
  if (finalizeBtn) finalizeBtn.addEventListener('click', () => { void finalizeSoloRun(); });
  if (refreshBtn) refreshBtn.addEventListener('click', () => { void refreshSoloLeaderboard(); });

  if (promptGrid) {
    promptGrid.addEventListener('input', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const input = target ? target.closest('input[data-solo-entry-slot]') : null;
      if (!input) return;
      const slotId = String(input.getAttribute('data-solo-entry-slot') || '');
      if (!SOLO_SLOT_IDS.includes(slotId)) return;
      state.solo.entries[slotId] = String(input.value || '').trim().slice(0, 80);
      updateSoloActionButtons();
    });
  }
}

function updateSoloResetCountdown() {
  const node = document.getElementById('soloResetCountdown');
  if (!node) return;
  const nowMs = Date.now();
  const resetMs = nextUtcResetMs(nowMs);
  node.textContent = formatResetCountdown(resetMs - nowMs);
}

function startSoloCountdownTimer() {
  updateSoloResetCountdown();
  if (state.solo.resetCountdownTimerId) {
    window.clearInterval(state.solo.resetCountdownTimerId);
  }
  state.solo.resetCountdownTimerId = window.setInterval(updateSoloResetCountdown, 1000);
}

function bindHomeActions() {
  const homeSoloBtn = document.getElementById('homeGoSoloBtn');
  const homePartyBtn = document.getElementById('homeGoPartyBtn');
  if (homeSoloBtn) {
    homeSoloBtn.addEventListener('click', () => navigateToRoute('solo'));
  }
  if (homePartyBtn) {
    homePartyBtn.addEventListener('click', () => navigateToRoute('party'));
  }
}

function bindPartyInputSync() {
  const nameInput = document.getElementById('name');
  if (!nameInput) return;
  nameInput.addEventListener('change', () => {
    const safeName = String(nameInput.value || '').trim();
    if (!safeName) return;
    state.identity.displayName = safeName.slice(0, 32);
    setStoredIdentity(state.identity);
  });
}

function bindScreenStateSync() {
  document.addEventListener('screenChanged', (event) => {
    const screenId = event && event.detail ? String(event.detail.screenId || '') : '';
    setHubNavVisibilityForScreen(screenId);
    const route = routeForScreenId(screenId);
    if (route) setActiveRoute(route);
    if (screenId === 'soloHub') {
      updateSoloResetCountdown();
    }
  });
}

async function initializeDualHub() {
  if (state.initialized) return;
  state.initialized = true;
  await loadFlags();
  if (state.flags.dualHubUiEnabled !== true) {
    return;
  }

  bindHubNavigation();
  bindOnboarding();
  bindHomeActions();
  bindSoloUiEvents();
  bindPartyInputSync();
  bindScreenStateSync();
  startSoloCountdownTimer();

  try {
    await ensureIdentity();
    await Promise.all([
      loadProfileBundle(),
      loadAchievements()
    ]);
    renderMetaViews();
    await refreshSoloLeaderboard();
  } catch (error) {
    showToast(`Dual hub init warning: ${String(error && error.message || error)}`, 'warning', 3600);
  }

  if (shouldShowOnboarding()) {
    showScreen('dualPathOnboarding');
    setHubNavVisibilityForScreen('dualPathOnboarding');
    if (typeof state.onboarding.start === 'function') {
      state.onboarding.start();
    }
  } else {
    navigateToRoute('home');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void initializeDualHub();
  }, { once: true });
} else {
  void initializeDualHub();
}
