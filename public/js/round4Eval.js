// Round 4 Cinematic Evaluation Controller

const round4State = {
  isEvaluating: false,
  rendered: false,
  allTeamEvaluations: null,
  finalLeaderboard: null,
  totalCharacters: 0,
  totalTeams: 0,
  evaluationId: null,
  finalResultsRequested: false,
  teams: [],
  queue: [],
  placements: [],
  queueIndex: 0,
  currentAssignment: null,
  transitionRunning: false,
  sequenceComplete: false,
  evalLookup: Object.create(null),
  revealTimer: null,
  revealConfig: null,
  pendingFinalResultsTimer: null,
  preloadPromise: null,
  preloadDone: false,
  revealPrepared: false,
  revealPreparePromise: null,
  revealProfiles: Object.create(null),
  revealAudioContext: null,
  revealAudioReady: false,
  animationTimers: [],
  teamBoardCollapsed: Object.create(null),
  loadingReadyToStart: false,
  loadingScenario: '',
  loadingTwist: ''
};

const REVEAL_TIER_PROFILES = {
  lowest: {
    anticipationMs: 200,
    anticipationLift: 14,
    anticipationTilt: -1.5,
    flightMs: 880,
    settleMs: 220,
    cadencePadMs: 120,
    flightArcPx: 30,
    spinDeg: 0,
    midScale: 0.88,
    endScale: 0.34,
    endOpacity: 0.95,
    flightEasing: 'cubic-bezier(0.22, 0.78, 0.32, 1)',
    spotlight: false,
    audioMode: 'none',
    crashLanding: false
  },
  bronze: {
    anticipationMs: 260,
    anticipationLift: 18,
    anticipationTilt: -2.4,
    flightMs: 980,
    settleMs: 260,
    cadencePadMs: 140,
    flightArcPx: 42,
    spinDeg: 22,
    midScale: 0.86,
    endScale: 0.31,
    endOpacity: 0.95,
    flightEasing: 'cubic-bezier(0.17, 0.84, 0.25, 1)',
    spotlight: false,
    audioMode: 'none',
    crashLanding: false
  },
  silver: {
    anticipationMs: 560,
    anticipationLift: 34,
    anticipationTilt: -3.4,
    flightMs: 1280,
    settleMs: 380,
    cadencePadMs: 180,
    flightArcPx: 64,
    spinDeg: 112,
    midScale: 0.82,
    endScale: 0.27,
    endOpacity: 0.93,
    flightEasing: 'cubic-bezier(0.15, 0.88, 0.18, 1)',
    spotlight: false,
    audioMode: 'none',
    crashLanding: false
  },
  gold: {
    anticipationMs: 840,
    anticipationLift: 48,
    anticipationTilt: -4.8,
    flightMs: 1480,
    settleMs: 500,
    cadencePadMs: 200,
    flightArcPx: 94,
    spinDeg: 290,
    midScale: 0.79,
    endScale: 0.22,
    endOpacity: 0.92,
    flightEasing: 'cubic-bezier(0.11, 0.9, 0.13, 1)',
    spotlight: false,
    audioMode: 'accent',
    crashLanding: false
  },
  diamond: {
    anticipationMs: 1180,
    anticipationLift: 76,
    anticipationTilt: -6.1,
    flightMs: 1760,
    settleMs: 660,
    cadencePadMs: 260,
    flightArcPx: 146,
    spinDeg: 640,
    midScale: 0.74,
    endScale: 0.18,
    endOpacity: 0.9,
    flightEasing: 'cubic-bezier(0.08, 0.94, 0.08, 1)',
    spotlight: true,
    audioMode: 'intense',
    crashLanding: false
  },
  elite: {
    anticipationMs: 1640,
    anticipationLift: 108,
    anticipationTilt: -7.2,
    flightMs: 2120,
    settleMs: 940,
    cadencePadMs: 340,
    flightArcPx: 194,
    spinDeg: 980,
    midScale: 0.7,
    endScale: 0.13,
    endOpacity: 0.88,
    flightEasing: 'cubic-bezier(0.05, 0.98, 0.06, 1)',
    spotlight: true,
    audioMode: 'elite',
    crashLanding: true
  }
};

function readPercentText(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return 0;
  const numeric = Number(String(el.textContent || '').replace('%', ''));
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
}

function updateLoadingVisualGraph(timelinePercent, preloadPercent) {
  const bars = document.querySelectorAll('#evalVisualGraph .eval-visual-bar');
  const blendEl = document.getElementById('evalVisualBlendPct');
  if (!bars.length) return;

  const timeline = Math.max(0, Math.min(100, Number(timelinePercent) || 0));
  const preload = Math.max(0, Math.min(100, Number(preloadPercent) || 0));
  const blend = Math.round((timeline * 0.35) + (preload * 0.65));
  const activeCount = Math.max(0, Math.min(bars.length, Math.round((blend / 100) * bars.length)));

  bars.forEach((bar, index) => {
    const baseHeight = 26 + ((index * 13) % 44);
    const pulseHeight = Math.min(100, baseHeight + Math.round(blend * 0.28));
    bar.style.setProperty('--bar-height', `${pulseHeight}%`);
    bar.classList.toggle('is-active', index < activeCount);
  });

  if (blendEl) blendEl.textContent = `${blend}%`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMissingCharacterImage(label = 'No Image') {
  const safeLabel = escapeHtml(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="fallbackBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2430"/>
          <stop offset="100%" stop-color="#2e3647"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="22" fill="url(#fallbackBg)"/>
      <circle cx="128" cy="94" r="40" fill="#55607a"/>
      <rect x="54" y="148" width="148" height="58" rx="29" fill="#55607a"/>
      <text x="128" y="234" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#d0d8ea">${safeLabel}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeImageUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

function resolveCharacterImage(url, fallbackLabel = 'No Image') {
  return normalizeImageUrl(url) || buildMissingCharacterImage(fallbackLabel);
}

function getScenarioDelta(evalData) {
  const ovrBreakdown = evalData && evalData.breakdown ? evalData.breakdown.ovrBreakdown : null;
  if (ovrBreakdown && Number.isFinite(Number(ovrBreakdown.scenarioDelta))) {
    return Number(ovrBreakdown.scenarioDelta);
  }
  if (ovrBreakdown && Number.isFinite(Number(ovrBreakdown.scenarioMultiplier))) {
    return Math.round((Number(ovrBreakdown.scenarioMultiplier) - 1) * 20);
  }
  return 0;
}

function getOVRTierFromValue(ovr) {
  if (ovr >= 99) return { tier: 'icon', label: 'Icon' };
  if (ovr >= 95) return { tier: 'legendary', label: 'Legendary' };
  if (ovr >= 90) return { tier: 'epic', label: 'Epic' };
  if (ovr >= 85) return { tier: 'rare', label: 'Rare' };
  if (ovr >= 75) return { tier: 'gold', label: 'Gold' };
  if (ovr >= 65) return { tier: 'silver', label: 'Silver' };
  return { tier: 'bronze', label: 'Bronze' };
}

function normalizeTierLabel(label) {
  const raw = String(label || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('icon')) return 'icon';
  if (raw.includes('legend')) return 'legendary';
  if (raw.includes('epic')) return 'epic';
  if (raw.includes('rare')) return 'rare';
  if (raw.includes('gold')) return 'gold';
  if (raw.includes('silver')) return 'silver';
  return 'bronze';
}

function getTierClassFromEval(evalData) {
  const normalized = normalizeTierLabel(evalData && evalData.ovrTierLabel);
  if (normalized) return `tier-${normalized}`;
  const fallback = getOVRTierFromValue(Number(evalData && evalData.ovr) || 0);
  return `tier-${fallback.tier}`;
}

function getTierClassFromOVR(ovr) {
  const tier = getOVRTierFromValue(Number(ovr) || 0);
  return `tier-${tier.tier}`;
}

function getRevealTierFromEval(evalData) {
  const ovr = Number(evalData && evalData.ovr) || 0;
  const tierClass = String(getTierClassFromEval(evalData) || '').replace('tier-', '');

  if (ovr >= 96) return 'elite';
  if (ovr >= 90) return 'diamond';
  if (ovr >= 78) return 'gold';
  if (ovr >= 65) return 'silver';
  if (ovr >= 50) return 'bronze';
  if (ovr > 0) return 'lowest';

  if (tierClass === 'icon' || tierClass === 'legendary') return 'elite';
  if (tierClass === 'epic' || tierClass === 'rare') return 'diamond';
  if (tierClass === 'gold') return 'gold';
  if (tierClass === 'silver') return 'silver';
  if (tierClass === 'bronze') return 'bronze';
  return 'bronze';
}

function clearQueuedAnimationTimers() {
  if (!Array.isArray(round4State.animationTimers)) {
    round4State.animationTimers = [];
    return;
  }
  round4State.animationTimers.forEach((id) => window.clearTimeout(id));
  round4State.animationTimers = [];
}

function setAnimTimer(callback, delayMs) {
  const id = window.setTimeout(() => {
    round4State.animationTimers = round4State.animationTimers.filter((timerId) => timerId !== id);
    callback();
  }, Math.max(0, Number(delayMs) || 0));
  round4State.animationTimers.push(id);
  return id;
}

function sanitizeRevealTierClassList(classList) {
  if (!classList) return;
  classList.remove('reveal-tier-lowest', 'reveal-tier-bronze', 'reveal-tier-silver', 'reveal-tier-gold', 'reveal-tier-diamond', 'reveal-tier-elite', 'is-spotlight');
}

function getRevealProfileForAssignment(assignment) {
  const fallbackTier = getRevealTierFromEval(assignment && assignment.evalData ? assignment.evalData : null);
  const fallbackBase = REVEAL_TIER_PROFILES[fallbackTier] || REVEAL_TIER_PROFILES.bronze;
  const profile = assignment && assignment.key ? round4State.revealProfiles[assignment.key] : null;
  if (profile) return profile;

  return {
    ...fallbackBase,
    revealTier: fallbackTier,
    offsetMs: (Number(round4State.queueIndex) || 0) * 1950,
    totalMs: fallbackBase.anticipationMs + fallbackBase.flightMs + fallbackBase.settleMs + fallbackBase.cadencePadMs
  };
}

function prepareRevealSequenceProfiles() {
  if (round4State.revealPreparePromise) return round4State.revealPreparePromise;

  const config = getRevealConfig();
  round4State.revealPreparePromise = Promise.resolve().then(() => {
    const nextProfiles = Object.create(null);
    let offsetMs = 0;

    round4State.queue.forEach((assignment) => {
      const revealTier = getRevealTierFromEval(assignment && assignment.evalData ? assignment.evalData : null);
      const base = REVEAL_TIER_PROFILES[revealTier] || REVEAL_TIER_PROFILES.bronze;
      const totalMs = base.anticipationMs + base.flightMs + base.settleMs + base.cadencePadMs;
      const cadence = Math.max(config.stepIntervalMs, Math.round(totalMs * 0.86));

      nextProfiles[assignment.key] = {
        ...base,
        revealTier,
        offsetMs,
        totalMs
      };

      offsetMs += cadence;
    });

    round4State.revealProfiles = nextProfiles;
    round4State.revealPrepared = true;

    const host = document.getElementById('evalHeroHost');
    const boards = document.getElementById('evalTeamBoards');
    if (host) host.getBoundingClientRect();
    if (boards) boards.getBoundingClientRect();

    return true;
  }).catch(() => {
    round4State.revealProfiles = Object.create(null);
    round4State.revealPrepared = true;
    return true;
  });

  return round4State.revealPreparePromise;
}

function ensureRevealAudioReady() {
  if (round4State.revealAudioReady) return;
  if (typeof window === 'undefined') return;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  if (!round4State.revealAudioContext) {
    round4State.revealAudioContext = new AudioCtx();
  }

  const context = round4State.revealAudioContext;
  if (context && context.state === 'suspended') {
    context.resume().catch(() => null);
  }
  round4State.revealAudioReady = true;
}

function playEliteRevealAudio(profile, stage) {
  if (!profile || !profile.audioMode || profile.audioMode === 'none') return;
  const context = round4State.revealAudioContext;
  if (!context) return;

  const now = context.currentTime;
  const mainGain = context.createGain();
  mainGain.connect(context.destination);

  if (stage === 'launch') {
    const launchPeakByMode = {
      accent: 0.032,
      intense: 0.045,
      elite: 0.058
    };
    const launchPeak = launchPeakByMode[profile.audioMode] || 0.03;

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = profile.audioMode === 'elite' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(profile.audioMode === 'accent' ? 220 : 170, now);
    osc.frequency.exponentialRampToValueAtTime(profile.audioMode === 'accent' ? 520 : 690, now + 0.42);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(launchPeak, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    osc.connect(gain);
    gain.connect(mainGain);
    osc.start(now);
    osc.stop(now + 0.5);
    return;
  }

  const impactPeakByMode = {
    accent: 0.08,
    intense: 0.11,
    elite: 0.14
  };
  const impactPeak = impactPeakByMode[profile.audioMode] || 0.07;

  const impact = context.createOscillator();
  const impactGain = context.createGain();
  impact.type = profile.audioMode === 'elite' ? 'triangle' : 'sine';
  impact.frequency.setValueAtTime(profile.audioMode === 'accent' ? 170 : 130, now);
  impact.frequency.exponentialRampToValueAtTime(profile.audioMode === 'accent' ? 84 : 46, now + 0.25);
  impactGain.gain.setValueAtTime(0.0001, now);
  impactGain.gain.exponentialRampToValueAtTime(impactPeak, now + 0.02);
  impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  impact.connect(impactGain);
  impactGain.connect(mainGain);
  impact.start(now);
  impact.stop(now + 0.35);
}

function triggerPoolCrashEffects(assignment, profile) {
  if (!profile || !profile.crashLanding) return;

  const boards = document.getElementById('evalTeamBoards');
  if (boards) {
    boards.classList.remove('is-elite-crash');
    boards.classList.add('is-elite-crash');
    setAnimTimer(() => boards.classList.remove('is-elite-crash'), 860);
  }

  const board = document.querySelector(`.eval-team-board[data-team-board='${assignment.teamIndex}']`);
  if (board) {
    board.classList.remove('is-elite-hit');
    board.classList.add('is-elite-hit');
    setAnimTimer(() => board.classList.remove('is-elite-hit'), 760);
  }
}

function triggerSlotImpact(target, profile) {
  if (!target || !profile) return;
  target.classList.remove('is-impacting', 'impact-lowest', 'impact-bronze', 'impact-silver', 'impact-gold', 'impact-diamond', 'impact-elite', 'impact-elite-crash');
  target.classList.add('is-impacting', `impact-${profile.revealTier}`);
  if (profile.crashLanding) {
    target.classList.add('impact-elite-crash');
  }
  const clearMs = Math.max(260, Number(profile.settleMs) || 260) + (profile.crashLanding ? 220 : 0);
  setAnimTimer(() => {
    target.classList.remove('is-impacting', `impact-${profile.revealTier}`, 'impact-elite-crash');
  }, clearMs);
}

function updateLoadingDockProgress(current, total, label) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCurrent = Math.max(0, Math.min(safeTotal, Number(current) || 0));
  const percent = Math.round((safeCurrent / safeTotal) * 100);

  const totalEl = document.getElementById('evalLoadTotal');
  const currentEl = document.getElementById('evalLoadFetched');
  const pctEl = document.getElementById('evalPreloadPct');
  const fillEl = document.getElementById('evalPreloadFill');
  const preloadHint = document.getElementById('evalPreloadHint');
  const stageCurrent = document.getElementById('evalStageCurrent');
  const preloadBar = document.getElementById('evalPreloadBar');
  const timelinePercent = readPercentText('evalProgressPct');

  if (totalEl) totalEl.textContent = String(safeTotal);
  if (currentEl) currentEl.textContent = String(safeCurrent);
  if (pctEl) pctEl.textContent = `${percent}%`;
  if (fillEl) fillEl.style.width = `${percent}%`;
  if (preloadBar) preloadBar.setAttribute('aria-valuenow', String(percent));
  if (preloadHint) {
    preloadHint.textContent = percent >= 100
      ? 'Preload complete. Ready to start reveal.'
      : 'Preparing synchronized reveal visual...';
  }
  if (stageCurrent) {
    stageCurrent.textContent = percent >= 100
      ? 'Preload Stage: Ready'
      : `Preload Stage: ${percent}%`;
  }
  if (!round4State.rendered && !round4State.loadingReadyToStart) {
    const queueBar = document.getElementById('evalProgressBar');
    const queueFill = queueBar ? queueBar.querySelector('.eval-progress-fill') : null;
    const queuePct = document.getElementById('evalProgressPct');
    if (queueFill) queueFill.style.width = `${percent}%`;
    if (queueBar) queueBar.setAttribute('aria-valuenow', String(percent));
    if (queuePct) queuePct.textContent = `${percent}%`;
  }
  updateLoadingVisualGraph(timelinePercent, percent);
}

function setLoadingBotContext(scenario, twist, speech) {
  const scenarioHeroEl = document.getElementById('evalLoadScenarioHero');
  const twistHeroEl = document.getElementById('evalLoadTwistHero');
  const preloadHint = document.getElementById('evalPreloadHint');

  if (scenario) round4State.loadingScenario = String(scenario);
  if (twist) round4State.loadingTwist = String(twist);

  const currentScenario = round4State.loadingScenario || 'Unknown scenario';
  const currentTwist = round4State.loadingTwist || 'Unknown twist';

  if (scenarioHeroEl) scenarioHeroEl.textContent = currentScenario;
  if (twistHeroEl) twistHeroEl.textContent = currentTwist;
  if (preloadHint && speech) preloadHint.textContent = speech;
}

function setLoadingReadyState(isReady) {
  round4State.loadingReadyToStart = Boolean(isReady);
  const button = document.getElementById('evalStartRevealBtn');
  const hint = document.getElementById('evalPreloadHint');
  const status = document.getElementById('evalFinalStatus');

  if (!button) return;
  button.disabled = !round4State.loadingReadyToStart;

  if (round4State.loadingReadyToStart) {
    button.textContent = '▶ START FINAL REVEAL';
    if (hint) hint.textContent = 'All preload checks passed. Start reveal when ready.';
    if (status) status.textContent = 'Preload complete. Start when your team is ready.';
  } else {
    button.textContent = '⏳ FINALIZING PRELOAD...';
  }
}

function startRound4Reveal() {
  if (!round4State.preloadDone || !round4State.revealPrepared || !round4State.loadingReadyToStart || round4State.rendered) return;

  ensureRevealAudioReady();

  const loading = document.getElementById('evalLoading');
  const status = document.getElementById('evalFinalStatus');
  if (loading) loading.style.display = 'none';
  if (status) status.textContent = 'Synchronized reveal in progress...';

  setLoadingBotContext(null, null, '');
  scheduleNextAutoReveal();
  round4State.isEvaluating = false;
  round4State.rendered = true;
}

function signed(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? `+${numeric}` : `${numeric}`;
}

function formatLockDuration(ms) {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  const totalSeconds = Math.max(1, Math.ceil(numeric / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function boardStateClass(filledCount) {
  if (filledCount >= 6) return 'is-complete';
  if (filledCount >= 4) return 'is-filling-low';
  if (filledCount >= 2) return 'is-filling-mid';
  return 'is-fuzzy';
}

function updateEvalProgress(current, total) {
  const progress = document.getElementById('evalProgress');
  const bar = document.getElementById('evalProgressBar');
  const fill = bar ? bar.querySelector('.eval-progress-fill') : null;
  const pct = document.getElementById('evalProgressPct');
  const safeTotal = Math.max(1, Number(total) || 0);
  const safeCurrent = Math.max(0, Number(current) || 0);
  const percent = Math.max(0, Math.min(100, Math.round((safeCurrent / safeTotal) * 100)));

  if (progress) progress.textContent = String(safeCurrent);
  if (fill) fill.style.width = `${percent}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(percent));
  if (pct) pct.textContent = `${percent}%`;
  updateLoadingVisualGraph(percent, readPercentText('evalPreloadPct'));
}

function clearEvalSurface() {
  const boards = document.getElementById('evalTeamBoards');
  const hero = document.getElementById('evalHeroHost');
  const leaderboard = document.getElementById('evalLeaderboardContainer');
  if (boards) boards.innerHTML = '';
  if (hero) hero.innerHTML = '';
  if (leaderboard) leaderboard.innerHTML = '';
}

function resetCinematicState() {
  if (round4State.revealTimer) {
    window.clearTimeout(round4State.revealTimer);
    round4State.revealTimer = null;
  }
  if (round4State.pendingFinalResultsTimer) {
    window.clearTimeout(round4State.pendingFinalResultsTimer);
    round4State.pendingFinalResultsTimer = null;
  }

  round4State.teams = [];
  round4State.queue = [];
  round4State.placements = [];
  round4State.queueIndex = 0;
  round4State.currentAssignment = null;
  round4State.transitionRunning = false;
  round4State.sequenceComplete = false;
  round4State.evalLookup = Object.create(null);
  round4State.revealConfig = null;
  round4State.preloadPromise = null;
  round4State.preloadDone = false;
  round4State.revealPrepared = false;
  round4State.revealPreparePromise = null;
  round4State.revealProfiles = Object.create(null);
  clearQueuedAnimationTimers();
  round4State.teamBoardCollapsed = Object.create(null);
  round4State.loadingScenario = '';
  round4State.loadingTwist = '';

  const boards = document.getElementById('evalTeamBoards');
  if (boards) boards.classList.remove('is-elite-crash');

  setLoadingReadyState(false);

  const completion = document.getElementById('evalCompletionBadge');
  const status = document.getElementById('evalFinalStatus');
  const continueBtn = document.getElementById('evalContinueBtn');
  if (completion) completion.hidden = true;
  if (status) status.textContent = 'Synchronized reveal is starting...';
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = '✅ CONFIRM & CONTINUE';
  }
}

function initRound4Evaluation(data) {
  const scenario = data && data.scenario ? data.scenario : 'Unknown scenario';
  const twist = data && data.twist ? data.twist : 'Unknown twist';
  const finalTeams = data && data.finalTeams ? data.finalTeams : {};

  const evalScreen = document.getElementById('round4EvalScreen');
  if (evalScreen) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
    evalScreen.classList.add('active');
  }

  round4State.totalCharacters = Object.values(finalTeams).reduce((sum, team) => sum + (Array.isArray(team) ? team.length : 0), 0);
  round4State.totalTeams = Object.keys(finalTeams || {}).length;

  const evalTotal = document.getElementById('evalTotal');
  const evalTeamCount = document.getElementById('evalTeamCount');
  if (evalTotal) evalTotal.textContent = String(round4State.totalCharacters);
  if (evalTeamCount) evalTeamCount.textContent = String(round4State.totalTeams);

  updateEvalProgress(0, round4State.totalCharacters);
  clearEvalSurface();
  resetCinematicState();

  const scenarioText = document.getElementById('evalScenarioText');
  const twistText = document.getElementById('evalTwistText');
  const causalityText = document.getElementById('evalContextCausality');
  if (scenarioText) scenarioText.textContent = scenario;
  if (twistText) twistText.textContent = twist;
  if (causalityText) causalityText.textContent = '';
  setLoadingBotContext(scenario, twist, '');

  const loading = document.getElementById('evalLoading');
  const loadingTitle = document.getElementById('evalLoadingTitle');
  const loadingSubtitle = document.getElementById('evalLoadingSubtitle');
  if (loading) loading.style.display = 'flex';
  if (loadingTitle) loadingTitle.textContent = 'Final reveal loading';
  if (loadingSubtitle) loadingSubtitle.textContent = '';
  setLoadingReadyState(false);
  updateLoadingDockProgress(0, Math.max(1, round4State.totalCharacters || 18), '');

  round4State.isEvaluating = true;
  round4State.rendered = false;
  round4State.evaluationId = null;
  round4State.finalResultsRequested = false;
  round4State.allTeamEvaluations = null;
  round4State.finalLeaderboard = null;

  if (window.socket) {
    window.socket.emit('evaluateRound4');
  }
}

function getTeamOrderNames() {
  const fromLeaderboard = Array.isArray(round4State.finalLeaderboard)
    ? round4State.finalLeaderboard.map((row) => row && row.playerName).filter(Boolean)
    : [];
  const fromEvaluations = Object.keys(round4State.allTeamEvaluations || {});
  const seen = new Set();
  const ordered = [];
  [...fromLeaderboard, ...fromEvaluations].forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  });
  return ordered;
}

function buildCinematicData() {
  const all = round4State.allTeamEvaluations || {};
  const teamNames = getTeamOrderNames();
  const teams = [];
  const queue = [];

  teamNames.forEach((playerName, teamIndex) => {
    const teamData = all[playerName] || {};
    const evaluations = Array.isArray(teamData.evaluations) ? teamData.evaluations.slice(0, 6) : [];
    const teamSummary = teamData.teamSummary || {};

    const normalizedEvaluations = evaluations.map((entry, slotIndex) => {
      const normalized = {
        ...entry,
        fitDelta: getScenarioDelta(entry),
        roleType: entry.roleType || entry.characterType || 'Balanced',
        shortReason: entry.reason || 'No short reason available.',
        rarity: entry.rarity || 'Common',
        notes: Array.isArray(entry.notes) ? entry.notes.slice(0, 4) : [],
        ovrTierLabel: (entry.ovrTier && entry.ovrTier.label) || (typeof entry.ovrTier === 'string' ? entry.ovrTier : getOVRTierFromValue(entry.ovr).label)
      };

      queue.push({
        teamIndex,
        slotIndex,
        teamName: playerName,
        evalData: normalized,
        key: `${teamIndex}-${slotIndex}`
      });

      return normalized;
    });

    teams.push({ teamIndex, playerName, teamSummary, evaluations: normalizedEvaluations });
  });

  round4State.teams = teams;
  round4State.queue = queue;
  round4State.totalCharacters = queue.length;
  round4State.totalTeams = teams.length;

  const evalTotal = document.getElementById('evalTotal');
  const evalTeamCount = document.getElementById('evalTeamCount');
  if (evalTotal) evalTotal.textContent = String(round4State.totalCharacters);
  if (evalTeamCount) evalTeamCount.textContent = String(round4State.totalTeams);
}

function findPlacement(teamIndex, slotIndex) {
  return round4State.placements.find((item) => item.teamIndex === teamIndex && item.slotIndex === slotIndex) || null;
}

function renderTeamBoards() {
  const container = document.getElementById('evalTeamBoards');
  if (!container) return;

  const allTeamsComplete = round4State.queue.length > 0 && round4State.placements.length >= round4State.queue.length;
  const activeTeamIndex = round4State.currentAssignment ? round4State.currentAssignment.teamIndex : null;

  container.classList.toggle('is-all-complete', allTeamsComplete);
  container.classList.toggle('has-active-focus', !allTeamsComplete && activeTeamIndex !== null);

  container.innerHTML = round4State.teams.map((team) => {
    const filled = round4State.placements.filter((item) => item.teamIndex === team.teamIndex).length;
    if (filled >= 6 && !allTeamsComplete) {
      round4State.teamBoardCollapsed[team.teamIndex] = true;
    }
    if (filled < 6 && !allTeamsComplete) {
      round4State.teamBoardCollapsed[team.teamIndex] = false;
    }

    const isCollapsed = Boolean(round4State.teamBoardCollapsed[team.teamIndex]);
    const isFocus = activeTeamIndex === team.teamIndex;
    const isMuted = activeTeamIndex !== null && !isFocus && !allTeamsComplete;

    const teamTierClass = getTierClassFromOVR(Math.round((Number(team.teamSummary && team.teamSummary.totalOVR) || 0) / 6));
    const slotsHtml = Array.from({ length: 6 }).map((_, slotIndex) => {
      const placed = findPlacement(team.teamIndex, slotIndex);
      if (!placed) {
        return `<div class="eval-slot" data-team-index="${team.teamIndex}" data-slot-index="${slotIndex}" aria-hidden="true"></div>`;
      }

      const evalData = placed.evalData;
      const image = resolveCharacterImage(evalData.imageUrl, evalData.character || 'No Portrait');
      const tierClass = getTierClassFromEval(evalData);
      return `
        <div class="eval-slot is-filled" data-team-index="${team.teamIndex}" data-slot-index="${slotIndex}">
          <button class="eval-docked-plaque ${tierClass}" type="button" data-eval-key="${escapeHtml(placed.key)}" aria-label="View OVR breakdown for ${escapeHtml(evalData.character || 'character')}">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(evalData.character || 'Character')} portrait" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';">
            <span>
              <span class="eval-docked-name ${tierClass}">${escapeHtml(evalData.character || 'Unknown')}</span>
              <span class="eval-docked-ovr ${tierClass}">OVR ${Number(evalData.ovr) || 0}</span>
            </span>
          </button>
        </div>
      `;
    }).join('');

    return `
      <section class="eval-team-board ${boardStateClass(filled)} ${isFocus ? 'is-focus' : ''} ${isMuted ? 'is-muted' : ''} ${isCollapsed ? 'is-collapsed' : ''}" data-team-board="${team.teamIndex}" data-filled="${filled}">
        <header class="eval-team-board-head">
          <h3 class="${teamTierClass}">${escapeHtml(team.playerName)}</h3>
          <p>${filled}/6 placed • Team OVR ${Number(team.teamSummary && team.teamSummary.totalOVR) || 0}</p>
          <button class="eval-team-toggle" type="button" data-team-toggle="${team.teamIndex}" ${allTeamsComplete ? '' : 'disabled'} aria-expanded="${isCollapsed ? 'false' : 'true'}" aria-label="Toggle ${escapeHtml(team.playerName)} board">${isCollapsed ? 'Expand' : 'Collapse'}</button>
        </header>
        <div class="eval-team-slots">${slotsHtml}</div>
      </section>
    `;
  }).join('');

  container.querySelectorAll('.eval-docked-plaque').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-eval-key');
      if (!key || !round4State.evalLookup[key]) return;
      openOVRBreakdown(round4State.evalLookup[key]);
    });
  });

  if (allTeamsComplete) {
    container.querySelectorAll('[data-team-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const teamIndex = Number(button.getAttribute('data-team-toggle'));
        if (!Number.isFinite(teamIndex)) return;
        round4State.teamBoardCollapsed[teamIndex] = !Boolean(round4State.teamBoardCollapsed[teamIndex]);
        renderTeamBoards();
      });
    });
  }
}

function renderActivePlaque() {
  const host = document.getElementById('evalHeroHost');
  if (!host) return;

  const assignment = round4State.currentAssignment;
  if (!assignment) {
    host.innerHTML = '';
    return;
  }

  const evalData = assignment.evalData;
  const tierClass = getTierClassFromEval(evalData);
  const fitDelta = Number(evalData.fitDelta) || 0;
  const fitClass = fitDelta >= 0 ? 'fit-positive' : 'fit-negative';
  const image = resolveCharacterImage(evalData.imageUrl, evalData.character || 'No Portrait');
  const notes = Array.isArray(evalData.notes) ? evalData.notes : [];

  host.innerHTML = `
    <article id="evalActivePlaque" class="eval-active-plaque ${tierClass} reveal-tier-${getRevealTierFromEval(evalData)}" data-reveal-tier="${getRevealTierFromEval(evalData)}" aria-live="polite">
      <div class="eval-active-head">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(evalData.character || 'Character')} portrait" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';">
        <div>
          <h3 class="${tierClass}">${escapeHtml(evalData.character || 'Unknown')}</h3>
          <p>${escapeHtml(evalData.roleType || 'Balanced')} • ${escapeHtml(evalData.rarity || 'Common')}</p>
          <p>${escapeHtml(evalData.shortReason || 'No reason provided.')}</p>
        </div>
      </div>
      <div class="eval-active-metrics">
        <button class="eval-active-ovr-btn ${tierClass}" type="button" aria-label="View OVR breakdown for ${escapeHtml(evalData.character || 'character')}">
          <span>OVR</span>
          <strong>${Number(evalData.ovr) || 0}</strong>
          <small>${escapeHtml(evalData.ovrTierLabel || '')}</small>
        </button>
        <div class="eval-active-chip"><span>Score</span><strong>${Number(evalData.score) || 0}</strong></div>
        <div class="eval-active-chip ${fitClass}"><span>Fit Delta</span><strong>${signed(fitDelta)}</strong></div>
      </div>
      <details class="eval-active-details">
        <summary>Details + Notes</summary>
        <ul>${notes.length ? notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('') : '<li>No additional evaluator notes.</li>'}</ul>
        <p class="eval-active-phrase">"${escapeHtml(evalData.phrase || 'No phrase available.')}"</p>
      </details>
    </article>
  `;

  const ovrButton = host.querySelector('.eval-active-ovr-btn');
  if (ovrButton) {
    ovrButton.addEventListener('click', () => openOVRBreakdown(evalData));
  }
}

function spawnNextAssignment() {
  round4State.currentAssignment = round4State.queue[round4State.queueIndex] || null;
  renderActivePlaque();
}

function getRevealConfig() {
  const incoming = round4State.revealConfig || {};
  const now = Date.now();

  const initialDelayMs = Math.max(0, Number(incoming.initialDelayMs) || 2200);
  const stepIntervalMs = Math.max(1300, Number(incoming.stepIntervalMs) || 1950);
  const dockDurationMs = Math.max(700, Number(incoming.dockDurationMs) || 980);
  const finalResultsDelayMs = Math.max(900, Number(incoming.finalResultsDelayMs) || 1900);
  const startAtMs = Number(incoming.startAtMs) || (now + initialDelayMs);

  return {
    startAtMs,
    initialDelayMs,
    stepIntervalMs,
    dockDurationMs,
    finalResultsDelayMs
  };
}

function loadImageAsset(url) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return Promise.resolve();

  return new Promise((resolve) => {
    const image = new Image();
    const done = () => resolve();

    image.decoding = 'async';
    image.loading = 'eager';
    image.referrerPolicy = 'no-referrer';
    image.onload = done;
    image.onerror = done;
    image.src = normalized;

    window.setTimeout(done, 1700);
  });
}

function preloadCinematicAssets() {
  if (round4State.preloadPromise) return round4State.preloadPromise;

  const urls = round4State.queue
    .map((assignment) => assignment && assignment.evalData ? assignment.evalData.imageUrl : null);

  const totalAssets = urls.length;
  let completedAssets = 0;

  updateLoadingDockProgress(0, totalAssets || 1, '');

  const preloadTasks = urls.map((url) => loadImageAsset(url)
    .catch(() => null)
    .then(() => {
      completedAssets += 1;
      updateLoadingDockProgress(completedAssets, totalAssets || 1, '');
    }));

  const settlePromise = Promise.all(preloadTasks)
    .catch(() => null)
    .then(() => {
      round4State.preloadDone = true;
      updateLoadingDockProgress(totalAssets || 1, totalAssets || 1, '');
      return true;
    });

  round4State.preloadPromise = Promise.race([
    settlePromise,
    new Promise((resolve) => window.setTimeout(() => {
      round4State.preloadDone = true;
      updateLoadingDockProgress(totalAssets || 1, totalAssets || 1, '');
      resolve(true);
    }, 3200))
  ]);

  return round4State.preloadPromise;
}

function scheduleNextAutoReveal() {
  if (round4State.sequenceComplete) return;
  if (round4State.revealTimer) {
    window.clearTimeout(round4State.revealTimer);
    round4State.revealTimer = null;
  }

  const config = getRevealConfig();
  const assignment = round4State.queue[round4State.queueIndex] || null;
  const profile = getRevealProfileForAssignment(assignment);
  const now = Date.now();
  const targetAt = config.startAtMs + (Number(profile.offsetMs) || (round4State.queueIndex * config.stepIntervalMs));
  const waitMs = Math.max(0, targetAt - now);

  round4State.revealTimer = window.setTimeout(() => {
    round4State.revealTimer = null;
    if (round4State.transitionRunning) {
      scheduleNextAutoReveal();
      return;
    }
    handleNextCharacter(() => {
      if (!round4State.sequenceComplete) {
        scheduleNextAutoReveal();
      }
    });
  }, waitMs);
}

function finishSequenceIfComplete() {
  if (round4State.placements.length < round4State.queue.length) return;
  round4State.sequenceComplete = true;
  round4State.currentAssignment = null;
  renderActivePlaque();

  if (round4State.revealTimer) {
    window.clearTimeout(round4State.revealTimer);
    round4State.revealTimer = null;
  }

  const completion = document.getElementById('evalCompletionBadge');
  const status = document.getElementById('evalFinalStatus');
  if (completion) {
    completion.hidden = false;
    completion.textContent = `All ${round4State.queue.length} characters placed`;
  }
  if (status) status.textContent = 'Reveal complete. Confirm when your screen is ready to continue.';

  const continueBtn = document.getElementById('evalContinueBtn');
  if (continueBtn) {
    continueBtn.disabled = false;
    continueBtn.textContent = '✅ CONFIRM & CONTINUE';
  }

  renderFinalLeaderboard();
}

function animateDockTransition(assignment, onDone) {
  const profile = getRevealProfileForAssignment(assignment);
  const active = document.getElementById('evalActivePlaque');
  const host = document.getElementById('evalHeroHost');
  const target = document.querySelector(`.eval-slot[data-team-index='${assignment.teamIndex}'][data-slot-index='${assignment.slotIndex}']`);
  if (!active || !target) {
    onDone();
    return;
  }

  sanitizeRevealTierClassList(active.classList);
  active.classList.add(`reveal-tier-${profile.revealTier}`, 'is-reveal-anticipating');
  active.style.setProperty('--reveal-anticipation-ms', `${profile.anticipationMs}ms`);
  active.style.setProperty('--reveal-lift', `${profile.anticipationLift}px`);
  active.style.setProperty('--reveal-tilt', `${profile.anticipationTilt}deg`);

  if (host) {
    sanitizeRevealTierClassList(host.classList);
    host.classList.add(`reveal-tier-${profile.revealTier}`);
    if (profile.spotlight) {
      host.classList.add('is-spotlight');
    }
  }

  setAnimTimer(() => {
    const startRect = active.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const clone = active.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.remove('is-reveal-anticipating');
    clone.classList.add('eval-flight-clone', `reveal-tier-${profile.revealTier}`);
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;
    clone.style.transform = 'translate3d(0,0,0) rotate(0deg) scale(1)';
    clone.style.opacity = '1';
    document.body.appendChild(clone);

    active.style.visibility = 'hidden';
    playEliteRevealAudio(profile, 'launch');

    const dx = (targetRect.left + targetRect.width / 2) - (startRect.left + startRect.width / 2);
    const dy = (targetRect.top + targetRect.height / 2) - (startRect.top + startRect.height / 2);
    const arcY = Math.min(dy - profile.flightArcPx, -Math.abs(profile.flightArcPx));

    const flightFrames = [
      { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
      {
        transform: `translate3d(${Math.round(dx * 0.34)}px, ${Math.round(arcY * 0.82)}px, 0) rotate(${Math.round(profile.spinDeg * 0.34)}deg) scale(${Math.max(profile.midScale + 0.08, 0.78)})`,
        opacity: 0.99,
        offset: 0.34
      },
      {
        transform: `translate3d(${Math.round(dx * 0.7)}px, ${Math.round(arcY)}px, 0) rotate(${Math.round(profile.spinDeg * 0.72)}deg) scale(${profile.midScale})`,
        opacity: 0.97,
        offset: 0.7
      }
    ];

    if (profile.crashLanding) {
      flightFrames.push({
        transform: `translate3d(${Math.round(dx)}px, ${Math.round(dy + 10)}px, 0) rotate(${Math.round(profile.spinDeg + 120)}deg) scale(${Math.max(0.08, profile.endScale * 0.72)})`,
        opacity: Math.max(0.76, profile.endOpacity - 0.16),
        offset: 0.92
      });
    }

    flightFrames.push({
      transform: `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0) rotate(${Math.round(profile.spinDeg)}deg) scale(${profile.endScale})`,
      opacity: profile.endOpacity,
      offset: 1
    });

    clone.animate(flightFrames, {
      duration: profile.flightMs,
      easing: profile.flightEasing,
      fill: 'forwards'
    });

    setAnimTimer(() => {
      clone.remove();
      active.style.visibility = '';
      active.classList.remove('is-reveal-anticipating');
      if (host) {
        sanitizeRevealTierClassList(host.classList);
      }
      triggerSlotImpact(target, profile);
      triggerPoolCrashEffects(assignment, profile);
      playEliteRevealAudio(profile, 'impact');
      onDone();
    }, profile.flightMs + 12);
  }, profile.anticipationMs);
}

function handleNextCharacter(onComplete) {
  if (round4State.transitionRunning || !round4State.currentAssignment) return;
  round4State.transitionRunning = true;

  const assignment = round4State.currentAssignment;
  animateDockTransition(assignment, () => {
    round4State.placements.push(assignment);
    round4State.evalLookup[assignment.key] = assignment.evalData;
    round4State.queueIndex += 1;
    round4State.transitionRunning = false;

    updateEvalProgress(round4State.placements.length, round4State.queue.length);
    renderTeamBoards();

    if (round4State.placements.length >= round4State.queue.length) {
      finishSequenceIfComplete();
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    spawnNextAssignment();
    if (typeof onComplete === 'function') onComplete();
  });
}

function bindCinematicControls() {
  return;
}

function getLeaderboardTopPickImage(row) {
  if (row && row.topPickImageUrl) {
    return resolveCharacterImage(row.topPickImageUrl, row.topPick || 'Top Pick');
  }

  const playerName = row && row.playerName ? row.playerName : '';
  const team = round4State.teams.find((entry) => entry.playerName === playerName);
  if (!team || !Array.isArray(team.evaluations)) {
    return buildMissingCharacterImage('No Portrait');
  }

  const topPickName = row && row.topPick ? String(row.topPick) : '';
  const found = team.evaluations.find((entry) => String(entry.character || '').toLowerCase() === topPickName.toLowerCase());
  if (found) {
    return resolveCharacterImage(found.imageUrl, found.character || 'Top Pick');
  }

  const firstWithImage = team.evaluations.find((entry) => normalizeImageUrl(entry.imageUrl));
  if (firstWithImage) {
    return resolveCharacterImage(firstWithImage.imageUrl, firstWithImage.character || 'Top Pick');
  }

  return buildMissingCharacterImage(topPickName || 'Top Pick');
}

function renderFinalLeaderboard() {
  const container = document.getElementById('evalLeaderboardContainer');
  if (!container || !Array.isArray(round4State.finalLeaderboard)) return;

  const ranked = round4State.finalLeaderboard.slice().sort((a, b) => {
    const points = (Number(b && b.round4Points) || 0) - (Number(a && a.round4Points) || 0);
    if (points !== 0) return points;
    const ovr = (Number(b && b.totalOVR) || 0) - (Number(a && a.totalOVR) || 0);
    if (ovr !== 0) return ovr;
    return String(a && a.playerName ? a.playerName : '').localeCompare(String(b && b.playerName ? b.playerName : ''));
  });

  container.innerHTML = `
    <section class="eval-leaderboard-rich" aria-label="Round 4 detailed leaderboard">
      <header class="eval-leaderboard-rich-head">
        <h3>Round 4 Leaderboard</h3>
        <p>Expanded with top pick portraits, OVR tiers, and score breakdown.</p>
      </header>
      <div class="eval-leaderboard-rich-list">
        ${ranked.map((row, index) => {
          const tierClass = getTierClassFromOVR(Number(row && row.totalOVR) || 0);
          const topPickImage = getLeaderboardTopPickImage(row);
          const cumulativeOVR = Number(row && row.totalOVR) || 0;
          const averageOVR = Number(row && row.averageOVR) || 0;
          const fastestLock = formatLockDuration(row && row.fastestLockMs);
          const roundPoints = Number(row && row.round4Points) || 0;

          return `
            <article class="eval-lb-row ${tierClass}" aria-label="${escapeHtml(row && row.playerName ? row.playerName : 'Unknown')} leaderboard row">
              <div class="eval-lb-rank">#${index + 1}</div>
              <div class="eval-lb-player">
                <h4 class="${tierClass}">${escapeHtml(row && row.playerName ? row.playerName : 'Unknown')}</h4>
                <p class="eval-lb-sub">Team OVR ${Number(row && row.totalOVR) || 0} • Chemistry ${signed(Number(row && row.chemistryBonus) || 0)}</p>
              </div>
              <div class="eval-lb-top-pick">
                <img src="${escapeHtml(topPickImage)}" alt="${escapeHtml(row && row.topPick ? row.topPick : 'Top pick')} portrait" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';">
                <div>
                  <small>Top Pick</small>
                  <strong class="${tierClass}">${escapeHtml(row && row.topPick ? row.topPick : 'N/A')}</strong>
                </div>
              </div>
              <div class="eval-lb-stats">
                <span><small>OVR CUM💦</small><b>${cumulativeOVR}</b></span>
                <span><small>OVR AVG🧢</small><b>${averageOVR}</b></span>
                <span><small>Fastest Lock🔒</small><b>${fastestLock}</b></span>
                <span><small>Round 4 pts🫵</small><b>${roundPoints}</b></span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderCinematicSequence() {
  buildCinematicData();
  round4State.placements = [];
  round4State.queueIndex = 0;
  round4State.currentAssignment = null;
  round4State.transitionRunning = false;
  round4State.sequenceComplete = false;
  round4State.evalLookup = Object.create(null);

  updateEvalProgress(0, round4State.queue.length);
  renderTeamBoards();
  spawnNextAssignment();
  bindCinematicControls();

  const subtitle = document.getElementById('evalLoadingSubtitle');
  if (subtitle) subtitle.textContent = '';
  setLoadingBotContext(null, null, '');

  const status = document.getElementById('evalFinalStatus');
  if (status) status.textContent = '';

  Promise.allSettled([
    preloadCinematicAssets(),
    prepareRevealSequenceProfiles()
  ]).finally(() => {
    setLoadingBotContext(null, null, '');
    setLoadingReadyState(true);
  });
}

function requestFinalResults() {
  if (round4State.finalResultsRequested || !window.socket) return;
  round4State.finalResultsRequested = true;

  const continueBtn = document.getElementById('evalContinueBtn');
  const status = document.getElementById('evalFinalStatus');
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Waiting for others...';
  }
  if (status) status.textContent = 'Waiting for players...';

  window.socket.emit('requestFinalResults');
}

function toggleEvalScenario() {
  const box = document.getElementById('evalScenarioBox');
  if (!box) return;
  box.classList.toggle('is-condensed');
}

function switchEvalTab() {
  return;
}

function setupOVRVisualInteractions(modal) {
  if (!modal) return;
  const shell = modal.querySelector('.ovr-visual-shell');
  if (!shell) return;

  const rows = Array.from(shell.querySelectorAll('.ovr-visual-bar-row'));
  let activeRow = null;

  const activateRow = (row) => {
    rows.forEach((entry) => entry.classList.remove('is-emphasis'));
    if (!row) {
      shell.style.setProperty('--focus-hue', '38');
      activeRow = null;
      return;
    }

    row.classList.add('is-emphasis');
    const hue = row.getAttribute('data-hue') || '38';
    shell.style.setProperty('--focus-hue', hue);
    activeRow = row;
  };

  rows.forEach((row) => {
    row.tabIndex = 0;
    row.addEventListener('mouseenter', () => activateRow(row));
    row.addEventListener('focus', () => activateRow(row));
    row.addEventListener('click', () => activateRow(activeRow === row ? null : row));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateRow(activeRow === row ? null : row);
      }
    });
  });

  shell.addEventListener('mouseleave', () => activateRow(activeRow));

  shell.addEventListener('pointermove', (event) => {
    const rect = shell.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;

    const tiltX = (relativeY - 0.5) * -8;
    const tiltY = (relativeX - 0.5) * 9;
    shell.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
    shell.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
    shell.style.setProperty('--glint-x', `${Math.round(relativeX * 100)}%`);
    shell.style.setProperty('--glint-y', `${Math.round(relativeY * 100)}%`);
  });

  shell.addEventListener('pointerleave', () => {
    shell.style.setProperty('--tilt-x', '0deg');
    shell.style.setProperty('--tilt-y', '0deg');
    shell.style.setProperty('--glint-x', '50%');
    shell.style.setProperty('--glint-y', '35%');
  });
}

function openOVRBreakdown(evalData) {
  const modal = document.getElementById('ovrBreakdownModal');
  if (!modal || !evalData) return;

  const modalContent = modal.querySelector('.ovr-modal-content');
  const tierClass = getTierClassFromEval(evalData);
  if (modalContent) {
    modalContent.classList.remove('tier-icon', 'tier-legendary', 'tier-epic', 'tier-rare', 'tier-gold', 'tier-silver', 'tier-bronze');
    modalContent.classList.add('ovr-tiered', tierClass);
    modalContent.setAttribute('data-tier', tierClass.replace('tier-', ''));
  }

  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) modalTitle.textContent = `OVR Breakdown — ${evalData.character}`;

  const modalImage = document.getElementById('modalCharacterImage');
  const modalImageWrap = document.getElementById('modalCharacterImageWrap');
  if (modalImage) {
    const imageSrc = resolveCharacterImage(evalData.imageUrl, 'No Portrait');
    const hasImage = Boolean(normalizeImageUrl(evalData.imageUrl));
    modalImage.src = imageSrc;
    modalImage.alt = `${evalData.character} portrait`;
    if (modalImageWrap) modalImageWrap.classList.toggle('missing', !hasImage);
    modalImage.onerror = function onModalImageError() {
      this.onerror = null;
      this.src = buildMissingCharacterImage('No Portrait');
      if (modalImageWrap) modalImageWrap.classList.add('missing');
    };
  }

  const summaryEl = document.getElementById('modalCharacterSummary');
  if (summaryEl) summaryEl.textContent = evalData.breakdown && evalData.breakdown.characterSummary ? evalData.breakdown.characterSummary : 'No information available.';

  const scenarioEl = document.getElementById('modalScenarioRelevance');
  if (scenarioEl) scenarioEl.textContent = evalData.breakdown && evalData.breakdown.scenarioRelevance ? evalData.breakdown.scenarioRelevance : 'No scenario analysis available.';

  const scenarioKeywordsEl = document.getElementById('modalScenarioKeywords');
  if (scenarioKeywordsEl) {
    const scenarioKeywords = evalData.breakdown && evalData.breakdown.keywordMatches ? evalData.breakdown.keywordMatches.scenario || [] : [];
    scenarioKeywordsEl.innerHTML = scenarioKeywords.length
      ? `<span class="ovr-keywords-label">Keywords:</span>${scenarioKeywords.map((kw) => `<span class="ovr-keyword-chip">${escapeHtml(kw)}</span>`).join('')}`
      : '<span class="ovr-keywords-empty">No keyword matches</span>';
  }

  const twistEl = document.getElementById('modalTwistRelevance');
  if (twistEl) twistEl.textContent = evalData.breakdown && evalData.breakdown.twistRelevance ? evalData.breakdown.twistRelevance : 'No twist analysis available.';

  const twistKeywordsEl = document.getElementById('modalTwistKeywords');
  if (twistKeywordsEl) {
    const twistKeywords = evalData.breakdown && evalData.breakdown.keywordMatches ? evalData.breakdown.keywordMatches.twist || [] : [];
    twistKeywordsEl.innerHTML = twistKeywords.length
      ? `<span class="ovr-keywords-label">Keywords:</span>${twistKeywords.map((kw) => `<span class="ovr-keyword-chip">${escapeHtml(kw)}</span>`).join('')}`
      : '<span class="ovr-keywords-empty">No keyword matches</span>';
  }

  const scoreBreakdownEl = document.getElementById('modalScoreBreakdown');
  if (scoreBreakdownEl && evalData.breakdown && Array.isArray(evalData.breakdown.scoreBreakdown)) {
    const steps = evalData.breakdown.scoreBreakdown;
    scoreBreakdownEl.innerHTML = `
      <div class="score-mini-header"><span class="score-mini-title">Score Flow</span><span class="score-mini-total"><strong>${Number(evalData.score) || 0}/30</strong></span></div>
      <div class="score-mini-legend">
        ${steps.map((step) => {
          const points = Number(step && step.points) || 0;
          const sign = points > 0 ? '+' : '';
          const cls = points > 0 ? 'positive' : points < 0 ? 'negative' : 'neutral';
          const label = step && step.step ? step.step : 'Step';
          const desc = step && step.description ? step.description : '';
          return `<span class="score-mini-chip ${cls}" title="${escapeHtml(desc)}"><strong>${escapeHtml(label)}</strong> ${sign}${points}</span>`;
        }).join('')}
      </div>
    `;
  }

  const ovrBreakdownEl = document.querySelector('.ovr-breakdown-items');
  if (ovrBreakdownEl && evalData.breakdown && evalData.breakdown.ovrBreakdown) {
    const ovr = evalData.breakdown.ovrBreakdown;
    const percentages = ovr.percentages || {};
    const ovrTierClass = tierClass;
    const safeFinalOVR = Math.max(0, Math.min(99, Number(ovr.finalOVR) || 0));
    const toPct = (value) => {
      const numeric = Number(value) || 0;
      return Math.max(0, Math.min(100, Math.round(numeric)));
    };

    const basePct = toPct(percentages.scoreContribution || 0);
    const rarityPct = toPct(percentages.rarityContribution || 0);
    const attributePct = toPct(percentages.attributeContribution || 0);
    const scenarioPct = Math.max(-100, Math.min(100, Math.round(Number(percentages.scenarioEffect) || 0)));
    const scenarioSigned = scenarioPct > 0 ? `+${scenarioPct}` : `${scenarioPct}`;

    ovrBreakdownEl.innerHTML = `
      <div class="ovr-visual-shell ${ovrTierClass}">
        <div class="ovr-visual-ring-wrap">
          <div class="ovr-visual-ring" style="--ovr-fill:${safeFinalOVR};">
            <div class="ovr-visual-center">
              <b>${safeFinalOVR}</b>
            </div>
          </div>
          <div class="ovr-visual-chipset" aria-label="OVR composition quick stats">
            <span class="ovr-chip ovr-chip-base">Base ${ovr.baseFromScore}</span>
            <span class="ovr-chip ovr-chip-rarity">Rarity ${ovr.rarityBonus}</span>
            <span class="ovr-chip ovr-chip-attr">Attr ${ovr.attributeBonus}</span>
            <span class="ovr-chip ovr-chip-scenario">Fit ${scenarioSigned}%</span>
          </div>
        </div>
        <div class="ovr-visual-bars">
          <div class="ovr-visual-bar-row" data-hue="208">
            <span>Base Score</span>
            <div class="ovr-visual-bar"><i class="bar-base" style="width:${basePct}%;--delay:0.02s;"></i></div>
            <b>${ovr.baseFromScore} (${basePct}%)</b>
          </div>
          <div class="ovr-visual-bar-row" data-hue="34">
            <span>Rarity Bonus</span>
            <div class="ovr-visual-bar"><i class="bar-rarity" style="width:${rarityPct}%;--delay:0.09s;"></i></div>
            <b>${ovr.rarityBonus} (${rarityPct}%)</b>
          </div>
          <div class="ovr-visual-bar-row" data-hue="262">
            <span>Attribute Bonus</span>
            <div class="ovr-visual-bar"><i class="bar-attr" style="width:${attributePct}%;--delay:0.16s;"></i></div>
            <b>${ovr.attributeBonus} (${attributePct}%)</b>
          </div>
          <div class="ovr-visual-bar-row ${scenarioPct < 0 ? 'is-negative' : 'is-positive'}" data-hue="144">
            <span>Scenario Effect</span>
            <div class="ovr-visual-bar"><i class="bar-scenario" style="width:${Math.abs(scenarioPct)}%;--delay:0.23s;"></i></div>
            <b>${scenarioSigned}% (×${Number(ovr.scenarioMultiplier || 1).toFixed(2)})</b>
          </div>
        </div>
      </div>
      ${typeof ovr.scenarioDelta === 'number' ? `<div class="ovr-breakdown-item"><div class="ovr-breakdown-label">Scenario Delta</div><div class="ovr-breakdown-value">${ovr.scenarioDelta > 0 ? '+' : ''}${ovr.scenarioDelta}</div></div>` : ''}
      <div class="ovr-breakdown-item ovr-breakdown-total ${ovrTierClass}"><div class="ovr-breakdown-label"><strong>Final OVR</strong></div><div class="ovr-breakdown-value"><strong>${ovr.finalOVR}/99</strong></div></div>
      ${ovr.scenarioDeltaNarrative ? `<p class="ovr-scenario-narrative">${escapeHtml(ovr.scenarioDeltaNarrative)}</p>` : ''}
    `;

    setupOVRVisualInteractions(modal);
  }

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeOVRBreakdown() {
  const modal = document.getElementById('ovrBreakdownModal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (typeof window !== 'undefined' && !window.__round4SocketBound) {
  window.__round4SocketBound = true;
  const socketPoll = setInterval(() => {
    if (!window.socket) return;
    clearInterval(socketPoll);

    window.socket.on('round4Evaluated', (data) => {
      if (!data || round4State.transitionRunning) return;
      if (round4State.evaluationId && round4State.evaluationId === data.evaluationId && round4State.rendered) return;

      round4State.evaluationId = data.evaluationId || null;
      round4State.allTeamEvaluations = data.allTeamEvaluations || data.teamEvaluations || {};
      round4State.finalLeaderboard = Array.isArray(data.finalLeaderboard) ? data.finalLeaderboard : [];
      round4State.revealConfig = data.revealTimeline || null;

      const loading = document.getElementById('evalLoading');
      const title = document.getElementById('evalLoadingTitle');
      const subtitle = document.getElementById('evalLoadingSubtitle');
      if (loading) loading.style.display = 'flex';
      if (title) title.textContent = 'Final reveal loading';
      if (subtitle) subtitle.textContent = '';
      setLoadingReadyState(false);
      setLoadingBotContext(data && data.scenario, data && data.twist, '');

      window.setTimeout(renderCinematicSequence, 180);
    });

    window.socket.on('round4EvaluationError', (error) => {
      const message = error && error.message ? error.message : 'Unknown error';
      alert(`Error evaluating teams: ${message}`);
      const loading = document.getElementById('evalLoading');
      if (loading) loading.style.display = 'none';
      setLoadingReadyState(false);
    });

    window.socket.on('finalResultsWaiting', (data) => {
      const status = document.getElementById('evalFinalStatus');
      if (!status) return;
      const readyCount = Number(data && data.readyCount) || 0;
      const totalPlayers = Number(data && data.totalPlayers) || 0;
      status.textContent = `Waiting for players: ${readyCount}/${totalPlayers}`;

      const continueBtn = document.getElementById('evalContinueBtn');
      if (continueBtn && round4State.finalResultsRequested) {
        continueBtn.textContent = `⏳ WAITING (${readyCount}/${totalPlayers})`;
      }
    });
  }, 100);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeOVRBreakdown();
    return;
  }
});

window.initRound4Evaluation = initRound4Evaluation;
window.toggleEvalScenario = toggleEvalScenario;
window.requestFinalResults = requestFinalResults;
window.startRound4Reveal = startRound4Reveal;
window.openOVRBreakdown = openOVRBreakdown;
window.closeOVRBreakdown = closeOVRBreakdown;
window.switchEvalTab = switchEvalTab;
/*
// Round 4 Cinematic Evaluation Controller

const round4State = {
  isEvaluating: false,
  rendered: false,
  allTeamEvaluations: null,
  finalLeaderboard: null,
  totalCharacters: 0,
  totalTeams: 0,
  evaluationId: null,
  finalResultsRequested: false,
  teams: [],
  queue: [],
  placements: [],
  queueIndex: 0,
  currentAssignment: null,
  transitionRunning: false,
  sequenceComplete: false,
  evalLookup: Object.create(null)
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMissingCharacterImage(label = 'No Image') {
  const safeLabel = escapeHtml(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="fallbackBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2430"/>
          <stop offset="100%" stop-color="#2e3647"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="22" fill="url(#fallbackBg)"/>
      <circle cx="128" cy="94" r="40" fill="#55607a"/>
      <rect x="54" y="148" width="148" height="58" rx="29" fill="#55607a"/>
      <text x="128" y="234" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#d0d8ea">${safeLabel}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeImageUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

function resolveCharacterImage(url, fallbackLabel = 'No Image') {
  return normalizeImageUrl(url) || buildMissingCharacterImage(fallbackLabel);
}

function getScenarioDelta(evalData) {
  const ovrBreakdown = evalData && evalData.breakdown ? evalData.breakdown.ovrBreakdown : null;
  if (ovrBreakdown && Number.isFinite(Number(ovrBreakdown.scenarioDelta))) {
    return Number(ovrBreakdown.scenarioDelta);
  }
  if (ovrBreakdown && Number.isFinite(Number(ovrBreakdown.scenarioMultiplier))) {
    return Math.round((Number(ovrBreakdown.scenarioMultiplier) - 1) * 20);
  }
  return 0;
}

function getOVRTierFromValue(ovr) {
  if (ovr >= 99) return { tier: 'icon', label: 'Icon' };
  if (ovr >= 95) return { tier: 'legendary', label: 'Legendary' };
  if (ovr >= 90) return { tier: 'epic', label: 'Epic' };
  if (ovr >= 85) return { tier: 'rare', label: 'Rare' };
  if (ovr >= 75) return { tier: 'gold', label: 'Gold' };
  if (ovr >= 65) return { tier: 'silver', label: 'Silver' };
  return { tier: 'bronze', label: 'Bronze' };
}

function signed(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? `+${numeric}` : `${numeric}`;
}

function boardStateClass(filledCount) {
  if (filledCount >= 6) return 'is-complete';
  if (filledCount >= 4) return 'is-filling-low';
  if (filledCount >= 2) return 'is-filling-mid';
  return 'is-fuzzy';
}

function updateEvalProgress(current, total) {
  const progress = document.getElementById('evalProgress');
  const bar = document.getElementById('evalProgressBar');
  const fill = bar ? bar.querySelector('.eval-progress-fill') : null;
  const pct = document.getElementById('evalProgressPct');
  const safeTotal = Math.max(1, Number(total) || 0);
  const safeCurrent = Math.max(0, Number(current) || 0);
  const percent = Math.max(0, Math.min(100, Math.round((safeCurrent / safeTotal) * 100)));

  if (progress) progress.textContent = String(safeCurrent);
  if (fill) fill.style.width = `${percent}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(percent));
  if (pct) pct.textContent = `${percent}%`;
}

function clearEvalSurface() {
  const boards = document.getElementById('evalTeamBoards');
  const hero = document.getElementById('evalHeroHost');
  const leaderboard = document.getElementById('evalLeaderboardContainer');
  if (boards) boards.innerHTML = '';
  if (hero) hero.innerHTML = '';
  if (leaderboard) leaderboard.innerHTML = '';
}

function resetCinematicState() {
  round4State.teams = [];
  round4State.queue = [];
  round4State.placements = [];
  round4State.queueIndex = 0;
  round4State.currentAssignment = null;
  round4State.transitionRunning = false;
  round4State.sequenceComplete = false;
  round4State.evalLookup = Object.create(null);

  const completion = document.getElementById('evalCompletionBadge');
  const replay = document.getElementById('evalReplayBtn');
  const next = document.getElementById('evalNextCharacterBtn');
  const continueBtn = document.getElementById('evalContinueBtn');
  const status = document.getElementById('evalFinalStatus');
  if (completion) completion.hidden = true;
  if (replay) replay.hidden = true;
  if (next) {
    next.disabled = true;
    next.textContent = 'Next Character';
  }
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Continue to Final Results';
  }
  if (status) status.textContent = '';
}

function initRound4Evaluation(data) {
  const scenario = data && data.scenario ? data.scenario : 'Unknown scenario';
  const twist = data && data.twist ? data.twist : 'Unknown twist';
  const finalTeams = data && data.finalTeams ? data.finalTeams : {};

  const evalScreen = document.getElementById('round4EvalScreen');
  if (evalScreen) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
    evalScreen.classList.add('active');
  }

  const scenarioText = document.getElementById('evalScenarioText');
  const twistText = document.getElementById('evalTwistText');
  const causalityText = document.getElementById('evalContextCausality');
  if (scenarioText) scenarioText.textContent = scenario;
  if (twistText) twistText.textContent = twist;
  if (causalityText) {
    causalityText.textContent = 'One plaque at a time: inspect, then dock to team board. Fit delta shows scenario/twist impact.';
  }

  round4State.totalCharacters = Object.values(finalTeams).reduce((sum, team) => sum + (Array.isArray(team) ? team.length : 0), 0);
  round4State.totalTeams = Object.keys(finalTeams || {}).length;

  const evalTotal = document.getElementById('evalTotal');
  const evalTeamCount = document.getElementById('evalTeamCount');
  if (evalTotal) evalTotal.textContent = String(round4State.totalCharacters);
  if (evalTeamCount) evalTeamCount.textContent = String(round4State.totalTeams);

  updateEvalProgress(0, round4State.totalCharacters);
  clearEvalSurface();
  resetCinematicState();

  const loading = document.getElementById('evalLoading');
  const loadingTitle = document.getElementById('evalLoadingTitle');
  const loadingSubtitle = document.getElementById('evalLoadingSubtitle');
  if (loading) loading.style.display = 'flex';
  if (loadingTitle) loadingTitle.textContent = 'Evaluating teams...';
  if (loadingSubtitle) loadingSubtitle.textContent = 'Merging cached intel from earlier rounds with final scoring.';

  round4State.isEvaluating = true;
  round4State.rendered = false;
  round4State.evaluationId = null;
  round4State.finalResultsRequested = false;
  round4State.allTeamEvaluations = null;
  round4State.finalLeaderboard = null;

  if (window.socket) {
    window.socket.emit('evaluateRound4');
  }
}

function getTeamOrderNames() {
  const fromLeaderboard = Array.isArray(round4State.finalLeaderboard)
    ? round4State.finalLeaderboard.map((row) => row && row.playerName).filter(Boolean)
    : [];
  const fromEvaluations = Object.keys(round4State.allTeamEvaluations || {});
  const seen = new Set();
  const ordered = [];
  [...fromLeaderboard, ...fromEvaluations].forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  });
  return ordered;
}

function buildCinematicData() {
  const all = round4State.allTeamEvaluations || {};
  const teamNames = getTeamOrderNames();
  const teams = [];
  const queue = [];

  teamNames.forEach((playerName, teamIndex) => {
    const teamData = all[playerName] || {};
    const evaluations = Array.isArray(teamData.evaluations) ? teamData.evaluations.slice(0, 6) : [];
    const teamSummary = teamData.teamSummary || {};

    const normalizedEvaluations = evaluations.map((entry, slotIndex) => {
      const normalized = {
        ...entry,
        fitDelta: getScenarioDelta(entry),
        roleType: entry.roleType || entry.characterType || 'Balanced',
        shortReason: entry.reason || 'No short reason available.',
        rarity: entry.rarity || 'Common',
        notes: Array.isArray(entry.notes) ? entry.notes.slice(0, 4) : [],
        ovrTierLabel: (entry.ovrTier && entry.ovrTier.label) || (typeof entry.ovrTier === 'string' ? entry.ovrTier : getOVRTierFromValue(entry.ovr).label)
      };

      queue.push({
        teamIndex,
        slotIndex,
        teamName: playerName,
        evalData: normalized,
        key: `${teamIndex}-${slotIndex}`
      });
      return normalized;
    });

    teams.push({
      teamIndex,
      playerName,
      teamSummary,
      evaluations: normalizedEvaluations
    });
  });

  round4State.teams = teams;
  round4State.queue = queue;
  round4State.totalCharacters = queue.length;
  round4State.totalTeams = teams.length;

  const evalTotal = document.getElementById('evalTotal');
  const evalTeamCount = document.getElementById('evalTeamCount');
  if (evalTotal) evalTotal.textContent = String(round4State.totalCharacters);
  if (evalTeamCount) evalTeamCount.textContent = String(round4State.totalTeams);
}

function findPlacement(teamIndex, slotIndex) {
  return round4State.placements.find((item) => item.teamIndex === teamIndex && item.slotIndex === slotIndex) || null;
}

function renderTeamBoards() {
  const container = document.getElementById('evalTeamBoards');
  if (!container) return;

  const html = round4State.teams.map((team) => {
    const filled = round4State.placements.filter((item) => item.teamIndex === team.teamIndex).length;
    const boardClass = boardStateClass(filled);
    const slots = Array.from({ length: 6 }).map((_, slotIndex) => {
      const placed = findPlacement(team.teamIndex, slotIndex);
      if (!placed) {
        return `<div class="eval-slot" data-team-index="${team.teamIndex}" data-slot-index="${slotIndex}" aria-hidden="true"></div>`;
      }

      const evalData = placed.evalData;
      const image = resolveCharacterImage(evalData.imageUrl, evalData.character || 'No Portrait');
      return `
        <div class="eval-slot is-filled" data-team-index="${team.teamIndex}" data-slot-index="${slotIndex}">
          <button class="eval-docked-plaque" type="button" data-eval-key="${escapeHtml(placed.key)}" aria-label="View OVR breakdown for ${escapeHtml(evalData.character || 'character')}">
            <img
              src="${escapeHtml(image)}"
              alt="${escapeHtml(evalData.character || 'Character')} portrait"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';"
            >
            <span>
              <span class="eval-docked-name">${escapeHtml(evalData.character || 'Unknown')}</span>
              <span class="eval-docked-ovr">OVR ${Number(evalData.ovr) || 0}</span>
            </span>
          </button>
        </div>
      `;
    }).join('');

    return `
      <section class="eval-team-board ${boardClass}" data-team-board="${team.teamIndex}">
        <header class="eval-team-board-head">
          <h3>${escapeHtml(team.playerName)}</h3>
          <p>${filled}/6 placed • Team OVR ${Number(team.teamSummary && team.teamSummary.totalOVR) || 0}</p>
        </header>
        <div class="eval-team-slots">${slots}</div>
      </section>
    `;
  }).join('');

  container.innerHTML = html;

  container.querySelectorAll('.eval-docked-plaque').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-eval-key');
      if (!key || !round4State.evalLookup[key]) return;
      openOVRBreakdown(round4State.evalLookup[key]);
    });
  });
}

function renderActivePlaque() {
  const host = document.getElementById('evalHeroHost');
  if (!host) return;

  const assignment = round4State.currentAssignment;
  if (!assignment) {
    host.innerHTML = '';
    return;
  }

  const evalData = assignment.evalData;
  const fitDelta = Number(evalData.fitDelta) || 0;
  const fitClass = fitDelta >= 0 ? 'fit-positive' : 'fit-negative';
  const notes = Array.isArray(evalData.notes) ? evalData.notes : [];
  const image = resolveCharacterImage(evalData.imageUrl, evalData.character || 'No Portrait');

  host.innerHTML = `
    <article id="evalActivePlaque" class="eval-active-plaque" aria-live="polite">
      <div class="eval-active-head">
        <img
          src="${escapeHtml(image)}"
          alt="${escapeHtml(evalData.character || 'Character')} portrait"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';"
        >
        <div>
          <h3>${escapeHtml(evalData.character || 'Unknown')}</h3>
          <p>${escapeHtml(evalData.roleType || 'Balanced')} • ${escapeHtml(evalData.rarity || 'Common')}</p>
          <p>${escapeHtml(evalData.shortReason || 'No reason provided.')}</p>
        </div>
      </div>

      <div class="eval-active-metrics">
        <button class="eval-active-ovr-btn" type="button" aria-label="View OVR breakdown for ${escapeHtml(evalData.character || 'character')}">
          <span>OVR</span>
          <strong>${Number(evalData.ovr) || 0}</strong>
          <small>${escapeHtml(evalData.ovrTierLabel || '')}</small>
        </button>
        <div class="eval-active-chip">
          <span>Score</span>
          <strong>${Number(evalData.score) || 0}</strong>
        </div>
        <div class="eval-active-chip ${fitClass}">
          <span>Fit Delta</span>
          <strong>${signed(fitDelta)}</strong>
        </div>
      </div>

      <details class="eval-active-details">
        <summary>Details + Notes</summary>
        <ul>${notes.length ? notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('') : '<li>No additional evaluator notes.</li>'}</ul>
        <p class="eval-active-phrase">"${escapeHtml(evalData.phrase || 'No phrase available.')}"</p>
      </details>
    </article>
  `;

  const ovrBtn = host.querySelector('.eval-active-ovr-btn');
  if (ovrBtn) {
    ovrBtn.addEventListener('click', () => openOVRBreakdown(evalData));
    ovrBtn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openOVRBreakdown(evalData);
      }
    });
  }
}

function updateNextButtonLabel() {
  const next = document.getElementById('evalNextCharacterBtn');
  if (!next) return;
  const total = round4State.queue.length;
  const done = round4State.placements.length;
  if (done >= total) {
    next.textContent = 'All Characters Placed';
    next.disabled = true;
    return;
  }
  next.textContent = `Next Character (${Math.min(done + 1, total)}/${total})`;
}

function spawnNextAssignment() {
  round4State.currentAssignment = round4State.queue[round4State.queueIndex] || null;
  renderActivePlaque();
  updateNextButtonLabel();

  const next = document.getElementById('evalNextCharacterBtn');
  if (next) {
    const enabled = Boolean(round4State.currentAssignment) && !round4State.transitionRunning;
    next.disabled = !enabled;
  }
}

function finishSequenceIfComplete() {
  if (round4State.placements.length < round4State.queue.length) return;
  round4State.sequenceComplete = true;
  round4State.currentAssignment = null;
  renderActivePlaque();

  const completion = document.getElementById('evalCompletionBadge');
  const replay = document.getElementById('evalReplayBtn');
  const continueBtn = document.getElementById('evalContinueBtn');

  if (completion) {
    completion.hidden = false;
    completion.textContent = `All ${round4State.queue.length} characters placed`;
  }
  if (replay) replay.hidden = false;
  if (continueBtn) continueBtn.disabled = false;

  updateNextButtonLabel();
  renderFinalLeaderboard();
}

function animateDockTransition(assignment, onDone) {
  const active = document.getElementById('evalActivePlaque');
  const target = document.querySelector(`.eval-slot[data-team-index='${assignment.teamIndex}'][data-slot-index='${assignment.slotIndex}']`);
  if (!active || !target) {
    onDone();
    return;
  }

  const startRect = active.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clone = active.cloneNode(true);
  clone.classList.add('eval-flight-clone');
  clone.style.left = `${startRect.left}px`;
  clone.style.top = `${startRect.top}px`;
  clone.style.width = `${startRect.width}px`;
  clone.style.height = `${startRect.height}px`;
  clone.style.transform = 'translate3d(0,0,0) scale(1)';
  clone.style.opacity = '1';
  document.body.appendChild(clone);

  active.style.opacity = '0';

  requestAnimationFrame(() => {
    const dx = (targetRect.left + (targetRect.width / 2)) - (startRect.left + (startRect.width / 2));
    const dy = (targetRect.top + (targetRect.height / 2)) - (startRect.top + (startRect.height / 2));
    clone.style.transform = `translate3d(${dx}px, ${dy - 20}px, 0) scale(0.26)`;
    clone.style.opacity = '0.94';
  });

  window.setTimeout(() => {
    clone.remove();
    onDone();
  }, 560);
}

function handleNextCharacter() {
  if (round4State.transitionRunning || !round4State.currentAssignment) return;
  round4State.transitionRunning = true;

  const next = document.getElementById('evalNextCharacterBtn');
  if (next) next.disabled = true;

  const assignment = round4State.currentAssignment;
  animateDockTransition(assignment, () => {
    round4State.placements.push(assignment);
    round4State.evalLookup[assignment.key] = assignment.evalData;
    round4State.queueIndex += 1;
    round4State.transitionRunning = false;

    updateEvalProgress(round4State.placements.length, round4State.queue.length);
    renderTeamBoards();

    if (round4State.placements.length >= round4State.queue.length) {
      finishSequenceIfComplete();
      return;
    }

    spawnNextAssignment();
  });
}

function bindCinematicControls() {
  const next = document.getElementById('evalNextCharacterBtn');
  const replay = document.getElementById('evalReplayBtn');

  if (next && !next.dataset.bound) {
    next.dataset.bound = 'true';
    next.addEventListener('click', handleNextCharacter);
  }

  if (replay && !replay.dataset.bound) {
    replay.dataset.bound = 'true';
    replay.addEventListener('click', () => {
      round4State.placements = [];
      round4State.queueIndex = 0;
      round4State.currentAssignment = null;
      round4State.transitionRunning = false;
      round4State.sequenceComplete = false;
      round4State.evalLookup = Object.create(null);

      const completion = document.getElementById('evalCompletionBadge');
      if (completion) completion.hidden = true;
      replay.hidden = true;

      const continueBtn = document.getElementById('evalContinueBtn');
      if (continueBtn) continueBtn.disabled = true;

      updateEvalProgress(0, round4State.queue.length);
      renderTeamBoards();
      spawnNextAssignment();
    });
  }
}

function renderFinalLeaderboard() {
  const container = document.getElementById('evalLeaderboardContainer');
  if (!container || !Array.isArray(round4State.finalLeaderboard)) return;

  const ranked = round4State.finalLeaderboard.slice().sort((a, b) => {
    const points = (Number(b && b.round4Points) || 0) - (Number(a && a.round4Points) || 0);
    if (points !== 0) return points;
    const ovr = (Number(b && b.totalOVR) || 0) - (Number(a && a.totalOVR) || 0);
    if (ovr !== 0) return ovr;
    return String(a && a.playerName ? a.playerName : '').localeCompare(String(b && b.playerName ? b.playerName : ''));
  });

  container.innerHTML = `
    <div class="eval-leaderboard-mini">
      <h3>Round 4 Leaderboard</h3>
      <ol>
        ${ranked.map((row, index) => `
          <li>
            <span>${index + 1}. ${escapeHtml(row.playerName || 'Unknown')}</span>
            <span>${Number(row.round4Points) || 0} pts • OVR ${Number(row.totalOVR) || 0}</span>
          </li>
        `).join('')}
      </ol>
    </div>
  `;
}

function renderCinematicSequence() {
  buildCinematicData();
  round4State.placements = [];
  round4State.queueIndex = 0;
  round4State.currentAssignment = null;
  round4State.transitionRunning = false;
  round4State.sequenceComplete = false;
  round4State.evalLookup = Object.create(null);

  updateEvalProgress(0, round4State.queue.length);
  renderTeamBoards();
  spawnNextAssignment();
  bindCinematicControls();

  const loading = document.getElementById('evalLoading');
  if (loading) loading.style.display = 'none';

  round4State.isEvaluating = false;
  round4State.rendered = true;
}

function requestFinalResults() {
  if (round4State.finalResultsRequested) return;
  if (!window.socket) return;
  round4State.finalResultsRequested = true;

  const continueBtn = document.getElementById('evalContinueBtn');
  const status = document.getElementById('evalFinalStatus');
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Waiting for others...';
  }
  if (status) status.textContent = 'Waiting for players...';

  window.socket.emit('requestFinalResults');
}

function toggleEvalScenario() {
  const box = document.getElementById('evalScenarioBox');
  if (!box) return;
  box.classList.toggle('is-condensed');
}

function switchEvalTab() {
  return;
}

function openOVRBreakdown(evalData) {
  const modal = document.getElementById('ovrBreakdownModal');
  if (!modal || !evalData) return;

  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) modalTitle.textContent = `OVR Breakdown — ${evalData.character}`;

  const modalImage = document.getElementById('modalCharacterImage');
  const modalImageWrap = document.getElementById('modalCharacterImageWrap');
  if (modalImage) {
    const imageSrc = resolveCharacterImage(evalData.imageUrl, 'No Portrait');
    const hasImage = Boolean(normalizeImageUrl(evalData.imageUrl));
    modalImage.src = imageSrc;
    modalImage.alt = `${evalData.character} portrait`;
    if (modalImageWrap) modalImageWrap.classList.toggle('missing', !hasImage);
    modalImage.onerror = function onModalImageError() {
      this.onerror = null;
      this.src = buildMissingCharacterImage('No Portrait');
      if (modalImageWrap) modalImageWrap.classList.add('missing');
    };
  }

  const summaryEl = document.getElementById('modalCharacterSummary');
  if (summaryEl) {
    summaryEl.textContent = evalData.breakdown && evalData.breakdown.characterSummary
      ? evalData.breakdown.characterSummary
      : 'No information available.';
  }

  const scenarioEl = document.getElementById('modalScenarioRelevance');
  if (scenarioEl) {
    scenarioEl.textContent = evalData.breakdown && evalData.breakdown.scenarioRelevance
      ? evalData.breakdown.scenarioRelevance
      : 'No scenario analysis available.';
  }

  const scenarioKeywordsEl = document.getElementById('modalScenarioKeywords');
  if (scenarioKeywordsEl) {
    const scenarioKeywords = evalData.breakdown && evalData.breakdown.keywordMatches
      ? evalData.breakdown.keywordMatches.scenario || []
      : [];
    scenarioKeywordsEl.innerHTML = scenarioKeywords.length
      ? `<span class="ovr-keywords-label">Keywords:</span>${scenarioKeywords.map((kw) => `<span class="ovr-keyword-chip">${escapeHtml(kw)}</span>`).join('')}`
      : '<span class="ovr-keywords-empty">No keyword matches</span>';
  }

  const twistEl = document.getElementById('modalTwistRelevance');
  if (twistEl) {
    twistEl.textContent = evalData.breakdown && evalData.breakdown.twistRelevance
      ? evalData.breakdown.twistRelevance
      : 'No twist analysis available.';
  }

  const twistKeywordsEl = document.getElementById('modalTwistKeywords');
  if (twistKeywordsEl) {
    const twistKeywords = evalData.breakdown && evalData.breakdown.keywordMatches
      ? evalData.breakdown.keywordMatches.twist || []
      : [];
    twistKeywordsEl.innerHTML = twistKeywords.length
      ? `<span class="ovr-keywords-label">Keywords:</span>${twistKeywords.map((kw) => `<span class="ovr-keyword-chip">${escapeHtml(kw)}</span>`).join('')}`
      : '<span class="ovr-keywords-empty">No keyword matches</span>';
  }

  const scoreBreakdownEl = document.getElementById('modalScoreBreakdown');
  if (scoreBreakdownEl && evalData.breakdown && Array.isArray(evalData.breakdown.scoreBreakdown)) {
    const steps = evalData.breakdown.scoreBreakdown;
    scoreBreakdownEl.innerHTML = `
      <div class="score-mini-header">
        <span class="score-mini-title">Score Flow</span>
        <span class="score-mini-total"><strong>${Number(evalData.score) || 0}/30</strong></span>
      </div>
      <div class="score-mini-legend">
        ${steps.map((step) => {
          const points = Number(step && step.points) || 0;
          const sign = points > 0 ? '+' : '';
          const cls = points > 0 ? 'positive' : points < 0 ? 'negative' : 'neutral';
          const label = step && step.step ? step.step : 'Step';
          const desc = step && step.description ? step.description : '';
          return `<span class="score-mini-chip ${cls}" title="${escapeHtml(desc)}"><strong>${escapeHtml(label)}</strong> ${sign}${points}</span>`;
        }).join('')}
      </div>
    `;
  }

  const ovrBreakdownEl = document.querySelector('.ovr-breakdown-items');
  if (ovrBreakdownEl && evalData.breakdown && evalData.breakdown.ovrBreakdown) {
    const ovr = evalData.breakdown.ovrBreakdown;
    const percentages = ovr.percentages || {};
    ovrBreakdownEl.innerHTML = `
      <div class="ovr-breakdown-item"><div class="ovr-breakdown-label">Base from Score</div><div class="ovr-breakdown-value">${ovr.baseFromScore} (${percentages.scoreContribution || 0}%)</div></div>
      <div class="ovr-breakdown-item"><div class="ovr-breakdown-label">Rarity Bonus</div><div class="ovr-breakdown-value">${ovr.rarityBonus} (${percentages.rarityContribution || 0}%)</div></div>
      <div class="ovr-breakdown-item"><div class="ovr-breakdown-label">Attribute Bonus</div><div class="ovr-breakdown-value">${ovr.attributeBonus} (${percentages.attributeContribution || 0}%)</div></div>
      <div class="ovr-breakdown-item"><div class="ovr-breakdown-label">Scenario Fit</div><div class="ovr-breakdown-value">×${Number(ovr.scenarioMultiplier || 1).toFixed(2)} (${(percentages.scenarioEffect || 0) > 0 ? '+' : ''}${percentages.scenarioEffect || 0}%)</div></div>
      ${typeof ovr.scenarioDelta === 'number' ? `<div class="ovr-breakdown-item"><div class="ovr-breakdown-label">Scenario Delta</div><div class="ovr-breakdown-value">${ovr.scenarioDelta > 0 ? '+' : ''}${ovr.scenarioDelta}</div></div>` : ''}
      <div class="ovr-breakdown-item ovr-breakdown-total"><div class="ovr-breakdown-label"><strong>Final OVR</strong></div><div class="ovr-breakdown-value"><strong>${ovr.finalOVR}/99</strong></div></div>
      ${ovr.scenarioDeltaNarrative ? `<div class="ovr-breakdown-item"><div class="ovr-breakdown-label">Why Scenario Changed OVR</div><div class="ovr-breakdown-value">${escapeHtml(ovr.scenarioDeltaNarrative)}</div></div>` : ''}
    `;
  }

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeOVRBreakdown() {
  const modal = document.getElementById('ovrBreakdownModal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (typeof window !== 'undefined' && !window.__round4SocketBound) {
  window.__round4SocketBound = true;
  const socketPoll = setInterval(() => {
    if (!window.socket) return;
    clearInterval(socketPoll);

    window.socket.on('round4Evaluated', (data) => {
      if (!data) return;
      if (round4State.transitionRunning) return;
      if (round4State.evaluationId && round4State.evaluationId === data.evaluationId && round4State.rendered) return;

      round4State.evaluationId = data.evaluationId || null;
      round4State.allTeamEvaluations = data.allTeamEvaluations || data.teamEvaluations || {};
      round4State.finalLeaderboard = Array.isArray(data.finalLeaderboard) ? data.finalLeaderboard : [];

      const loading = document.getElementById('evalLoading');
      const title = document.getElementById('evalLoadingTitle');
      const subtitle = document.getElementById('evalLoadingSubtitle');
      if (loading) loading.style.display = 'flex';
      if (title) title.textContent = 'Rendering cinematic reveal...';
      if (subtitle) subtitle.textContent = 'Building team boards and reveal order.';

      window.setTimeout(renderCinematicSequence, 80);
    });

    window.socket.on('round4EvaluationError', (error) => {
      const message = error && error.message ? error.message : 'Unknown error';
      alert(`Error evaluating teams: ${message}`);
      const loading = document.getElementById('evalLoading');
      if (loading) loading.style.display = 'none';
    });

    window.socket.on('finalResultsWaiting', (data) => {
      const status = document.getElementById('evalFinalStatus');
      if (!status) return;
      const readyCount = Number(data && data.readyCount) || 0;
      const totalPlayers = Number(data && data.totalPlayers) || 0;
      status.textContent = `Waiting for players: ${readyCount}/${totalPlayers}`;
    });
  }, 100);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeOVRBreakdown();
    return;
  }

  if ((event.key === 'Enter' || event.key === ' ') && document.getElementById('round4EvalScreen')?.classList.contains('active')) {
    const targetTag = document.activeElement && document.activeElement.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
    if (round4State.sequenceComplete || round4State.transitionRunning) return;
    event.preventDefault();
    handleNextCharacter();
  }
});

window.initRound4Evaluation = initRound4Evaluation;
window.toggleEvalScenario = toggleEvalScenario;
window.requestFinalResults = requestFinalResults;
window.openOVRBreakdown = openOVRBreakdown;
window.closeOVRBreakdown = closeOVRBreakdown;
window.switchEvalTab = switchEvalTab;// Round 4 Evaluation Screen Controller

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
  finalResultsRequested: false,
  activeTab: 'overview'
};

function buildMissingCharacterImage(label = 'No Image') {
  const safeLabel = escapeHtml(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2430"/>
          <stop offset="100%" stop-color="#2e3647"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="20" fill="url(#g)"/>
      <circle cx="128" cy="94" r="40" fill="#56607a"/>
      <rect x="54" y="148" width="148" height="58" rx="29" fill="#56607a"/>
      <text x="128" y="235" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#c8d0e3">${safeLabel}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeImageUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

function resolveCharacterImage(url, fallbackLabel = 'No Image') {
  return normalizeImageUrl(url) || buildMissingCharacterImage(fallbackLabel);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCharacterRevealDelay(totalCharacters) {
  if (totalCharacters >= 30) return 180;
  if (totalCharacters >= 18) return 260;
  return 360;
}

function getEmotionFromOVR(ovr) {
  const value = Number(ovr) || 0;
  if (value <= 12) return 'mad';
  if (value <= 28) return 'disappointed';
  if (value <= 44) return 'confused';
  if (value <= 64) return 'neutral';
  if (value <= 78) return 'happy';
  if (value <= 90) return 'amazed';
  return 'mindBlown';
}

function getEmotionIconPath(evalData) {
  const emotionByOVR = getEmotionFromOVR(evalData && evalData.ovr);
  const fallbackEmotion = evalData && evalData.emotion ? String(evalData.emotion) : 'neutral';
  const safeEmotion = encodeURIComponent(emotionByOVR || fallbackEmotion || 'neutral');
  return `/img/emotions/${safeEmotion}.png`;
}

function getTeamDomId(playerName) {
  return `eval-team-${String(playerName || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function formatSigned(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? `+${numeric}` : `${numeric}`;
}

function getScenarioDelta(evalData) {
  const ovrBreakdown = evalData && evalData.breakdown ? evalData.breakdown.ovrBreakdown : null;
  if (ovrBreakdown && Number.isFinite(Number(ovrBreakdown.scenarioDelta))) {
    return Number(ovrBreakdown.scenarioDelta);
  }

  if (ovrBreakdown && Number.isFinite(Number(ovrBreakdown.scenarioMultiplier))) {
    const multiplier = Number(ovrBreakdown.scenarioMultiplier);
    return Math.round((multiplier - 1) * 20);
  }

  return 0;
}

function getFitTone(delta) {
  if (delta >= 2) return 'boost';
  if (delta <= -2) return 'drag';
  return 'neutral';
}

function buildCausalitySummary(evalData) {
  const ovrBreakdown = evalData && evalData.breakdown ? evalData.breakdown.ovrBreakdown : null;
  const baseScore = ovrBreakdown
    ? (Number(ovrBreakdown.baseFromScore) || 0) + (Number(ovrBreakdown.rarityBonus) || 0) + (Number(ovrBreakdown.attributeBonus) || 0)
    : null;

  const delta = getScenarioDelta(evalData);
  return {
    baseScore,
    delta,
    tone: getFitTone(delta)
  };
}

function switchEvalTab(tabName = 'overview') {
  const tabs = ['overview', 'teams', 'leaderboard'];
  const nextTab = tabs.includes(tabName) ? tabName : 'overview';

  tabs.forEach((tab) => {
    const button = document.getElementById(`evalTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);
    const panel = document.getElementById(`evalPanel${tab.charAt(0).toUpperCase()}${tab.slice(1)}`);

    const isActive = tab === nextTab;
    if (button) {
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }

    if (panel) {
      panel.classList.toggle('active', isActive);
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', 'hidden');
      }
    }
  });

  round4State.activeTab = nextTab;
}

function openTeamInTeamsPanel(playerName) {
  switchEvalTab('teams');
  const targetId = getTeamDomId(playerName);
  const target = document.getElementById(targetId);
  if (!target) return;

  if (target.tagName.toLowerCase() === 'details') {
    target.open = true;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
  const causalityText = document.getElementById('evalContextCausality');
  if (scenarioText) scenarioText.textContent = scenario;
  if (twistText) twistText.textContent = twist;
  if (causalityText) {
    causalityText.textContent = 'Compare Fit Delta on each card: high base stats can still drop when twist fit is weak.';
  }
  
  // Calculate total characters to evaluate (up to 36)
  const totalCharacters = Object.values(finalTeams).reduce((sum, team) => sum + team.length, 0);
  const totalTeams = Object.keys(finalTeams || {}).length;
  const evalTotal = document.getElementById('evalTotal');
  if (evalTotal) evalTotal.textContent = totalCharacters;
  const evalTeamCount = document.getElementById('evalTeamCount');
  if (evalTeamCount) evalTeamCount.textContent = String(totalTeams);

  updateEvalProgress(0, totalCharacters);

  const loading = document.getElementById('evalLoading');
  if (loading) loading.style.display = 'flex';

  const loadingTitle = document.getElementById('evalLoadingTitle');
  const loadingSubtitle = document.getElementById('evalLoadingSubtitle');
  if (loadingTitle) loadingTitle.textContent = 'Evaluating teams...';
  if (loadingSubtitle) loadingSubtitle.textContent = 'Merging cached intel from earlier rounds with final scoring.';
  
  console.log(`📊 Teams: ${Object.keys(finalTeams).length}, Total characters: ${totalCharacters}`);
  
  // Request evaluation from server
  round4State.isEvaluating = true;
  round4State.evaluations = [];
  round4State.currentIndex = 0;
  round4State.totalTeams = totalTeams;
  round4State.totalCharacters = totalCharacters;
  round4State.evaluationId = null;
  round4State.rendered = false;
  round4State.rendering = false;
  round4State.finalResultsRequested = false;

  const container = document.getElementById('evalCardsContainer');
  if (container) container.innerHTML = '';

  const overview = document.getElementById('evalTeamOverview');
  if (overview) overview.innerHTML = '';

  const leaderboard = document.getElementById('evalLeaderboardContainer');
  if (leaderboard) leaderboard.innerHTML = '';

  switchEvalTab('overview');

  const scenarioGuide = document.getElementById('evalScenarioContent');
  const scenarioGuideIcon = document.getElementById('evalScenarioIcon');
  if (scenarioGuide) scenarioGuide.style.display = 'none';
  if (scenarioGuideIcon) scenarioGuideIcon.textContent = '▶';

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
    window.socket.emit('evaluateRound4');
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
  const teamContainer = document.getElementById('evalCardsContainer');
  const overviewContainer = document.getElementById('evalTeamOverview');
  if (!teamContainer || !overviewContainer) return;
  if (!round4State.allTeamEvaluations) return;

  round4State.rendering = true;

  const loading = document.getElementById('evalLoading');
  if (loading) loading.style.display = 'flex';

  teamContainer.innerHTML = '';
  overviewContainer.innerHTML = '';

  const teamFragment = document.createDocumentFragment();
  const overviewFragment = document.createDocumentFragment();

  let charIndex = 0;
  const allTeams = Object.entries(round4State.allTeamEvaluations).sort(([, teamA], [, teamB]) => {
    const ovrA = Number(teamA && teamA.teamSummary && teamA.teamSummary.totalOVR) || 0;
    const ovrB = Number(teamB && teamB.teamSummary && teamB.teamSummary.totalOVR) || 0;
    if (ovrB !== ovrA) return ovrB - ovrA;
    return 0;
  });

  for (const [playerName, teamData] of allTeams) {
    const safeSummary = teamData && teamData.teamSummary ? teamData.teamSummary : {};

    const shell = document.createElement('details');
    shell.className = 'eval-team-shell';
    shell.id = getTeamDomId(playerName);
    shell.open = allTeams[0] && allTeams[0][0] === playerName;

    const teamBlock = document.createElement('section');
    teamBlock.className = 'eval-team-block';

    const teamCards = document.createElement('div');
    teamCards.className = 'eval-team-cards';
    teamBlock.appendChild(teamCards);

    const evaluations = Array.isArray(teamData && teamData.evaluations)
      ? [...teamData.evaluations].sort((a, b) => (Number(b && b.ovr) || 0) - (Number(a && a.ovr) || 0))
      : [];
    const fitDeltas = evaluations.map((entry) => getScenarioDelta(entry));
    const fitDeltaAvg = fitDeltas.length
      ? Math.round(fitDeltas.reduce((sum, value) => sum + value, 0) / fitDeltas.length)
      : 0;
    const fitTone = getFitTone(fitDeltaAvg);

    const shellSummary = document.createElement('summary');
    shellSummary.className = 'eval-team-shell-summary';
    shellSummary.innerHTML = `
      <div class="eval-team-shell-heading">
        <strong>🎮 ${escapeHtml(playerName)}</strong>
        <span class="eval-team-shell-sub">Tap to ${shell.open ? 'collapse' : 'expand'} evaluations</span>
      </div>
      <div class="eval-team-shell-kpis">
        <span>OVR ${Number(safeSummary.totalOVR) || 0}</span>
        <span>AVG ${Number(safeSummary.averageOVR) || 0}</span>
        <span>Chem ${Number(safeSummary.chemistryBonus) >= 0 ? '+' : ''}${Number(safeSummary.chemistryBonus) || 0}</span>
        <span class="eval-fit-chip ${fitTone}">Fit ${formatSigned(fitDeltaAvg)}</span>
      </div>
    `;
    shell.appendChild(shellSummary);

    for (const evalData of evaluations) {
      renderEvalCard(evalData, teamCards);
      charIndex++;
      updateEvalProgress(charIndex, round4State.totalCharacters);
    }

    renderTeamSummary(playerName, safeSummary, teamBlock);
    shell.appendChild(teamBlock);
    teamFragment.appendChild(shell);

    const overviewCard = document.createElement('button');
    overviewCard.type = 'button';
    overviewCard.className = 'eval-overview-card';
    overviewCard.setAttribute('aria-label', `Open detailed view for ${playerName}`);
    overviewCard.innerHTML = `
      <h3>${escapeHtml(playerName)}</h3>
      <div class="eval-overview-stats">
        <span><strong>Team OVR</strong> ${Number(safeSummary.totalOVR) || 0}</span>
        <span><strong>Average</strong> ${Number(safeSummary.averageOVR) || 0}</span>
        <span><strong>Chemistry</strong> ${Number(safeSummary.chemistryBonus) >= 0 ? '+' : ''}${Number(safeSummary.chemistryBonus) || 0}</span>
        <span class="eval-overview-fit ${fitTone}"><strong>Fit</strong> ${formatSigned(fitDeltaAvg)}</span>
      </div>
      <p class="eval-overview-top"><strong>Top Pick:</strong> ${escapeHtml(safeSummary.topPick || 'N/A')}</p>
    `;
    overviewCard.addEventListener('click', () => openTeamInTeamsPanel(playerName));
    overviewFragment.appendChild(overviewCard);
  }

  teamContainer.appendChild(teamFragment);
  overviewContainer.appendChild(overviewFragment);

  displayFinalLeaderboard();
  updateEvalProgress(round4State.totalCharacters, round4State.totalCharacters);

  if (loading) loading.style.display = 'none';
  round4State.rendering = false;
  round4State.rendered = true;
}

// Render single evaluation card
function renderEvalCard(evalData, container) {
  if (!container) return;

  const notes = Array.isArray(evalData.notes)
    ? evalData.notes.filter(note => !note.toLowerCase().includes('low relevance')).slice(0, 3)
    : [];
  const notesHtml = notes.length
    ? notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')
    : '<li>No extra evaluator notes.</li>';
  
  const ovrTier = evalData.ovrTier || getOVRTierFromValue(evalData.ovr);
  const ovrClass = `ovr-${ovrTier.tier}`;
  const rarity = evalData.rarity || 'Common';
  const characterType = evalData.characterType || 'balanced';
  const primaryEmotion = getEmotionFromOVR(evalData.ovr);
  const fallbackEmotion = evalData.emotion || 'neutral';
  const emotionIconPath = getEmotionIconPath(evalData);
  const portraitSrc = resolveCharacterImage(evalData.imageUrl, 'No Portrait');
  const hasPortrait = Boolean(normalizeImageUrl(evalData.imageUrl));
  const causality = buildCausalitySummary(evalData);
  const topNote = notes[0] || evalData.reason || 'No immediate fit warning.';
  const detailSummaryLabel = notes.length > 1 || evalData.phrase
    ? `Details (${Math.max(1, notes.length)} notes)`
    : 'Details';
  
  const card = document.createElement('div');
  card.className = `eval-card eval-card-${evalData.emotion}`;
  card.innerHTML = `
    <div class="eval-card-header">
      <div class="eval-card-name-wrap">
        <h3 class="eval-card-name">${escapeHtml(evalData.character)}</h3>
        <div class="eval-card-portrait ${hasPortrait ? '' : 'missing'}">
          <img
            src="${escapeHtml(portraitSrc)}"
            alt="${escapeHtml(evalData.character)} portrait"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';this.closest('.eval-card-portrait')?.classList.add('missing');"
          >
        </div>
      </div>
      <div class="eval-card-emotion">
        <img src="${emotionIconPath}" alt="${escapeHtml(primaryEmotion)}"
             onerror="this.onerror=null;this.src='/img/emotions/${encodeURIComponent(fallbackEmotion)}.png';"
             class="eval-emotion-icon" width="64" height="64" decoding="async">
      </div>
    </div>
    <div class="eval-card-stats">
      <div class="eval-ovr ${ovrClass} eval-ovr-clickable" title="Click for detailed breakdown" role="button" tabindex="0" aria-label="View OVR breakdown for ${escapeHtml(evalData.character)}">
        <div class="eval-ovr-label">OVR</div>
        <div class="eval-ovr-value">${evalData.ovr}</div>
        <div class="eval-ovr-tier">${ovrTier.label}</div>
      </div>
      <div class="eval-score" title="Score: 0-30">
        <span class="eval-score-value">${evalData.score}</span>
        <span class="eval-score-max">/30</span>
      </div>
      <div class="eval-fit-chip ${causality.tone}" title="Scenario/Twist effect on final OVR">
        Fit ${formatSigned(causality.delta)}
      </div>
    </div>
    <div class="eval-causality-row ${causality.tone}">
      <span class="eval-causality-base">Base ${causality.baseScore === null ? '—' : causality.baseScore}</span>
      <span class="eval-causality-arrow">→</span>
      <span class="eval-causality-fit">Context ${formatSigned(causality.delta)}</span>
      <span class="eval-causality-arrow">→</span>
      <span class="eval-causality-final">OVR ${evalData.ovr}</span>
    </div>
    <p class="eval-card-primary-note">${escapeHtml(topNote)}</p>
    <div class="eval-card-meta">
      <span class="eval-rarity" title="Rarity">${escapeHtml(rarity)}</span>
      <span class="eval-type" title="Character Type">${escapeHtml(characterType)}</span>
    </div>
    <details class="eval-card-details">
      <summary>${detailSummaryLabel}</summary>
      <div class="eval-card-notes" aria-label="Evaluation notes">
        <ul>
          ${notesHtml}
        </ul>
      </div>
      <div class="eval-card-phrase">
        <p>"${escapeHtml(evalData.phrase || 'No phrase available.')}"</p>
      </div>
    </details>
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
  const safeSummary = summary && typeof summary === 'object' ? summary : {};
  const totalOVR = Number(safeSummary.totalOVR) || 0;
  const averageOVR = Number(safeSummary.averageOVR) || 0;
  const chemistryBonus = Number(safeSummary.chemistryBonus) || 0;
  const topPick = safeSummary.topPick || 'N/A';
  const highestOVR = Number(safeSummary.highestOVR) || 0;
  
  const chemistryDetails = Array.isArray(safeSummary.chemistryDetails) ? safeSummary.chemistryDetails : [];
  const chemistryLines = chemistryDetails.length
    ? chemistryDetails.map(detail => {
      const matches = Array.isArray(detail.matches) ? detail.matches.map(escapeHtml).join(', ') : 'N/A';
      const sign = detail.bonus >= 0 ? '+' : '';
      return `<li><strong>${escapeHtml(detail.label)}</strong> (${sign}${detail.bonus}): ${matches}</li>`;
    }).join('')
    : '<li>No clear chemistry patterns detected.</li>';

  const summaryDiv = document.createElement('details');
  summaryDiv.className = 'eval-team-summary';
  summaryDiv.innerHTML = `
    <summary class="eval-team-summary-toggle">📊 ${escapeHtml(playerName)} Team Summary</summary>
    <div class="summary-stats">
      <div class="summary-stat">
        <label>Team OVR</label>
        <span class="summary-value">${totalOVR}</span>
      </div>
      <div class="summary-stat">
        <label>Average</label>
        <span class="summary-value">${averageOVR}</span>
      </div>
      <div class="summary-stat">
        <label>Chemistry</label>
        <span class="summary-value">${chemistryBonus >= 0 ? '+' : ''}${chemistryBonus}</span>
      </div>
      <div class="summary-stat">
        <label>Highest</label>
        <span class="summary-value">${highestOVR}</span>
      </div>
      <div class="summary-stat summary-stat-wide">
        <label>Top Pick</label>
        <span class="summary-value-text">${escapeHtml(topPick)}</span>
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

  const container = document.getElementById('evalLeaderboardContainer');
  if (!container) return;

  container.innerHTML = '';
  
  const leaderboardDiv = document.createElement('div');
  leaderboardDiv.className = 'eval-final-leaderboard';
  leaderboardDiv.innerHTML = `<h2>🏆 Round 4 Leaderboard</h2>`;

  const rankedTeams = [...round4State.finalLeaderboard].sort((a, b) => {
    const pointsDiff = (Number(b && b.round4Points) || 0) - (Number(a && a.round4Points) || 0);
    if (pointsDiff !== 0) return pointsDiff;

    const ovrDiff = (Number(b && b.totalOVR) || 0) - (Number(a && a.totalOVR) || 0);
    if (ovrDiff !== 0) return ovrDiff;

    return String(a && a.playerName ? a.playerName : '').localeCompare(String(b && b.playerName ? b.playerName : ''));
  });
  
  const table = document.createElement('table');
  table.className = 'leaderboard-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Rank</th>
        <th>Team</th>
        <th>R4 Pts</th>
        <th>Spotlight</th>
        <th>Team OVR</th>
        <th>Chemistry</th>
      </tr>
    </thead>
    <tbody>
      ${rankedTeams.map((team, idx) => {
        const teamEvaluations = round4State.allTeamEvaluations && round4State.allTeamEvaluations[team.playerName]
          ? round4State.allTeamEvaluations[team.playerName].evaluations
          : [];
        const topPickEval = Array.isArray(teamEvaluations)
          ? teamEvaluations.find((entry) => entry.character === team.topPick)
          : null;
        const portrait = resolveCharacterImage(team.topPickImageUrl || (topPickEval && topPickEval.imageUrl), 'No Portrait');
        const portraitMissing = !(team.topPickImageUrl || (topPickEval && topPickEval.imageUrl));
        const imageHits = Array.isArray(teamEvaluations)
          ? teamEvaluations.filter((entry) => normalizeImageUrl(entry && entry.imageUrl)).length
          : 0;
        const totalPicks = Array.isArray(teamEvaluations) ? teamEvaluations.length : 0;

        return `
          <tr class="rank-${idx + 1}">
            <td>${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx + 1)}</td>
            <td><strong>${escapeHtml(team.playerName)}</strong></td>
            <td><strong>${typeof team.round4Points === 'number' ? team.round4Points : '-'}</strong></td>
            <td>
              <div class="spotlight-cell">
                <div class="spotlight-image ${portraitMissing ? 'missing' : ''}">
                  <img
                    src="${escapeHtml(portrait)}"
                    alt="${escapeHtml(team.topPick || 'Top Pick')} portrait"
                    loading="lazy"
                    decoding="async"
                    referrerpolicy="no-referrer"
                    onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';this.closest('.spotlight-image')?.classList.add('missing');"
                  >
                </div>
                <div class="spotlight-meta">
                  <div class="spotlight-name">${escapeHtml(team.topPick || 'N/A')}</div>
                  <div class="spotlight-sub">Image Intel: ${imageHits}/${totalPicks}</div>
                </div>
              </div>
            </td>
            <td><strong>${team.totalOVR}</strong></td>
            <td>${team.chemistryBonus >= 0 ? '+' : ''}${team.chemistryBonus}</td>
          </tr>
        `;
      }).join('')}
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

  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) {
    modalTitle.textContent = `OVR Breakdown — ${evalData.character}`;
  }

  const modalImage = document.getElementById('modalCharacterImage');
  const modalImageWrap = document.getElementById('modalCharacterImageWrap');
  if (modalImage) {
    const modalImgSrc = resolveCharacterImage(evalData.imageUrl, 'No Portrait');
    const hasImage = Boolean(normalizeImageUrl(evalData.imageUrl));
    modalImage.src = modalImgSrc;
    modalImage.alt = `${evalData.character} portrait`;
    if (modalImageWrap) {
      modalImageWrap.classList.toggle('missing', !hasImage);
    }
    modalImage.onerror = function onModalImageError() {
      this.onerror = null;
      this.src = buildMissingCharacterImage('No Portrait');
      if (modalImageWrap) {
        modalImageWrap.classList.add('missing');
      }
    };
  }

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
      ? `<span class="ovr-keywords-label">Keywords:</span>${scenarioKeywords.map(kw => `<span class="ovr-keyword-chip">${escapeHtml(kw)}</span>`).join('')}`
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
      ? `<span class="ovr-keywords-label">Keywords:</span>${twistKeywords.map(kw => `<span class="ovr-keyword-chip">${escapeHtml(kw)}</span>`).join('')}`
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
      return `<span class="score-mini-segment pos" style="width:${width}%;--segment-hue:${(index * 38) % 360};" title="${escapeHtml(step.step)}: +${step.points}${step.description ? ` — ${escapeHtml(step.description)}` : ''}"></span>`;
    }).join('');

    const negativeSegments = negativeSteps.map((step, index) => {
      const width = Math.max(8, (Math.abs(step.points) / negativeScale) * 100);
      return `<span class="score-mini-segment neg" style="width:${width}%;--segment-hue:${(index * 22) % 360};" title="${escapeHtml(step.step)}: ${step.points}${step.description ? ` — ${escapeHtml(step.description)}` : ''}"></span>`;
    }).join('');

    const legendChips = steps.map((step) => {
      const pointsClass = step.points > 0 ? 'positive' : step.points < 0 ? 'negative' : 'neutral';
      const pointsSign = step.points > 0 ? '+' : '';
      const tag = buildAcronym(step.step) || 'STEP';
      return `<span class="score-mini-chip ${pointsClass}" title="${escapeHtml(step.step)}${step.description ? ` — ${escapeHtml(step.description)}` : ''}"><strong>${escapeHtml(tag)}</strong> ${pointsSign}${step.points}</span>`;
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
      ${typeof ovr.scenarioDelta === 'number' ? `
      <div class="ovr-breakdown-item">
        <div class="ovr-breakdown-label">Scenario Delta</div>
        <div class="ovr-breakdown-value">${ovr.scenarioDelta > 0 ? '+' : ''}${ovr.scenarioDelta}</div>
      </div>` : ''}
      <div class="ovr-breakdown-item ovr-breakdown-total">
        <div class="ovr-breakdown-label"><strong>Final OVR</strong></div>
        <div class="ovr-breakdown-value"><strong>${ovr.finalOVR}/99</strong></div>
      </div>
      ${ovr.scenarioDeltaNarrative ? `<div class="ovr-breakdown-item"><div class="ovr-breakdown-label">Why Scenario Changed OVR</div><div class="ovr-breakdown-value">${ovr.scenarioDeltaNarrative}</div></div>` : ''}
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
window.switchEvalTab = switchEvalTab;
*/
