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
  loadingTwist: '',
  animationPrimed: false,
  animationPrimePromise: null,
  revealPerfMode: null
};

const IMAGE_PRELOAD_CACHE = new Map();

function detectRevealPerfMode() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('round4Lite') === '1') return 'lite';
    if (params.get('round4Lite') === '0') return 'full';
  } catch (error) {
  }

  try {
    const host = String(window.location && window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return 'lite';
  } catch (error) {
  }

  try {
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cores = Number(navigator.hardwareConcurrency) || 0;
    const memory = Number(navigator.deviceMemory) || 0;
    const isLikelyLowEnd = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
    if (reducedMotion || isLikelyLowEnd) return 'lite';
  } catch (error) {
  }

  return 'full';
}

function getRevealPerfMode() {
  if (!round4State.revealPerfMode) {
    round4State.revealPerfMode = detectRevealPerfMode();
  }
  return round4State.revealPerfMode;
}

function applyPerfProfileTuning(baseProfile) {
  const base = baseProfile && typeof baseProfile === 'object' ? baseProfile : {};
  if (getRevealPerfMode() !== 'lite') return { ...base };

  return {
    ...base,
    anticipationMs: Math.max(220, Math.round((Number(base.anticipationMs) || 280) * 0.92)),
    flightMs: Math.max(760, Math.round((Number(base.flightMs) || 900) * 0.9)),
    settleMs: Math.max(220, Math.round((Number(base.settleMs) || 240) * 0.9)),
    cadencePadMs: Math.max(100, Math.round((Number(base.cadencePadMs) || 140) * 0.85)),
    flightArcPx: Math.min(72, Math.max(18, Math.round((Number(base.flightArcPx) || 30) * 0.6))),
    spinDeg: Math.max(-120, Math.min(120, Math.round((Number(base.spinDeg) || 0) * 0.32))),
    midScale: Math.max(0.82, Number(base.midScale) || 0.88),
    endScale: Math.max(0.2, Number(base.endScale) || 0.3),
    endOpacity: Math.max(0.92, Number(base.endOpacity) || 0.95),
    spotlight: false,
    audioMode: 'none',
    crashLanding: false
  };
}

const REVEAL_TIER_PROFILES = {
  lowest: {
    anticipationMs: 280,
    anticipationLift: 16,
    anticipationTilt: -1.8,
    flightMs: 920,
    settleMs: 260,
    cadencePadMs: 160,
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
    anticipationMs: 320,
    anticipationLift: 21,
    anticipationTilt: -2.7,
    flightMs: 1020,
    settleMs: 300,
    cadencePadMs: 190,
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
    anticipationMs: 460,
    anticipationLift: 36,
    anticipationTilt: -3.6,
    flightMs: 1220,
    settleMs: 380,
    cadencePadMs: 220,
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
    anticipationMs: 560,
    anticipationLift: 52,
    anticipationTilt: -5,
    flightMs: 1360,
    settleMs: 440,
    cadencePadMs: 240,
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
    anticipationMs: 680,
    anticipationLift: 78,
    anticipationTilt: -6.3,
    flightMs: 1520,
    settleMs: 520,
    cadencePadMs: 280,
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
    anticipationMs: 780,
    anticipationLift: 110,
    anticipationTilt: -7.4,
    flightMs: 1680,
    settleMs: 620,
    cadencePadMs: 320,
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
  const fallbackBase = applyPerfProfileTuning(REVEAL_TIER_PROFILES[fallbackTier] || REVEAL_TIER_PROFILES.bronze);
  const profile = assignment && assignment.key ? round4State.revealProfiles[assignment.key] : null;
  if (profile) return profile;

  return {
    ...fallbackBase,
    revealTier: fallbackTier,
    offsetMs: (Number(round4State.queueIndex) || 0) * getRevealConfig().stepIntervalMs,
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
      const base = applyPerfProfileTuning(REVEAL_TIER_PROFILES[revealTier] || REVEAL_TIER_PROFILES.bronze);
      const totalMs = base.anticipationMs + base.flightMs + base.settleMs + base.cadencePadMs;
      const cadence = Math.max(config.stepIntervalMs, Math.round(totalMs * 0.9));

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
      ? 'Setup complete. Final evaluation is ready.'
      : (label || 'Fetching intel and preparing reveal assets...');
  }
  if (stageCurrent) {
    stageCurrent.textContent = percent >= 100
      ? 'Stage: Ready'
      : (label ? `Stage: ${label}` : `Stage: ${percent}%`);
  }
  updateLoadingVisualGraph(timelinePercent, percent);
}

function setRevealCeremonyProgress(percent, stageLabel = '') {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const queueBar = document.getElementById('evalProgressBar');
  const queueFill = queueBar ? queueBar.querySelector('.eval-progress-fill') : null;
  const queuePct = document.getElementById('evalProgressPct');
  const stageCurrent = document.getElementById('evalStageCurrent');

  if (queueFill) queueFill.style.width = `${safePercent}%`;
  if (queueBar) queueBar.setAttribute('aria-valuenow', String(safePercent));
  if (queuePct) queuePct.textContent = `${safePercent}%`;
  if (stageCurrent && stageLabel) stageCurrent.textContent = `Stage: ${stageLabel}`;

  updateLoadingVisualGraph(safePercent, readPercentText('evalPreloadPct'));
}

function triggerLoadingPriorityReveal(card) {
  if (!card) return;
  card.classList.remove('is-updated');
  void card.offsetWidth;
  card.classList.add('is-updated');
  window.setTimeout(() => card.classList.remove('is-updated'), 650);
}

function setLoadingBotContext(scenario, twist, speech) {
  const scenarioHeroEl = document.getElementById('evalLoadScenarioHero');
  const twistHeroEl = document.getElementById('evalLoadTwistHero');
  const preloadHint = document.getElementById('evalPreloadHint');
  const scenarioCard = scenarioHeroEl ? scenarioHeroEl.closest('.eval-priority-card') : null;
  const twistCard = twistHeroEl ? twistHeroEl.closest('.eval-priority-card') : null;

  if (scenario) round4State.loadingScenario = String(scenario);
  if (twist) round4State.loadingTwist = String(twist);

  const currentScenario = round4State.loadingScenario || 'Unknown scenario';
  const currentTwist = round4State.loadingTwist || 'Unknown twist';

  if (scenarioHeroEl) scenarioHeroEl.textContent = currentScenario;
  if (twistHeroEl) twistHeroEl.textContent = currentTwist;
  if (scenario) triggerLoadingPriorityReveal(scenarioCard);
  if (twist) triggerLoadingPriorityReveal(twistCard);
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
    button.textContent = 'START REVEAL CEREMONY';
    if (hint) hint.textContent = 'Everything is staged. Start the reveal when everyone is ready.';
    if (status) status.textContent = 'Showdown ready. Tap start to begin the final reveal.';
  } else {
    button.textContent = 'PREPARING REVEAL CEREMONY...';
  }
}

function setRound4LoadingPhase(isLoadingPhase) {
  const screen = document.getElementById('round4EvalScreen');
  if (screen) {
    screen.classList.toggle('is-loading-phase', Boolean(isLoadingPhase));
  }

  if (isLoadingPhase) {
    const completion = document.getElementById('evalCompletionBadge');
    const continueBtn = document.getElementById('evalContinueBtn');
    if (completion) completion.hidden = true;
    if (continueBtn) continueBtn.hidden = true;
  }
}

function setHeaderContextPhase(phase) {
  const screen = document.getElementById('round4EvalScreen');
  const box = document.getElementById('evalScenarioBox');
  const toggle = document.getElementById('evalContextToggle');

  if (!screen || !box || !toggle) return;

  const isRevealPhase = phase === 'reveal';
  screen.classList.toggle('eval-context-hidden', !isRevealPhase);
  box.classList.toggle('is-condensed', !isRevealPhase);
  toggle.setAttribute('aria-expanded', isRevealPhase ? 'true' : 'false');
}

function startRound4Reveal() {
  if (!round4State.preloadDone || !round4State.revealPrepared || !round4State.animationPrimed || !round4State.loadingReadyToStart || round4State.rendered) return;

  ensureRevealAudioReady();

  const loading = document.getElementById('evalLoading');
  const status = document.getElementById('evalFinalStatus');
  if (loading) loading.style.display = 'none';
  setRound4LoadingPhase(false);
  setHeaderContextPhase('reveal');
  if (status) status.textContent = 'Final showdown starting...';

  setLoadingBotContext(null, null, '');
  const kickoffConfig = getRevealConfig();
  round4State.revealConfig = {
    ...(round4State.revealConfig || {}),
    startAtMs: Date.now() + Math.max(700, Number(kickoffConfig.initialDelayMs) || 0)
  };
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
  round4State.animationPrimePromise = null;
  round4State.animationPrimed = false;
  round4State.revealProfiles = Object.create(null);
  clearQueuedAnimationTimers();
  round4State.teamBoardCollapsed = Object.create(null);
  round4State.loadingScenario = '';
  round4State.loadingTwist = '';

  const boards = document.getElementById('evalTeamBoards');
  if (boards) boards.classList.remove('is-elite-crash');

  setHeaderContextPhase('loading');
  setRound4LoadingPhase(true);

  setLoadingReadyState(false);

  const completion = document.getElementById('evalCompletionBadge');
  const status = document.getElementById('evalFinalStatus');
  const continueBtn = document.getElementById('evalContinueBtn');
  if (completion) completion.hidden = true;
  if (status) status.textContent = 'Preparing the final showdown...';
  if (continueBtn) {
    continueBtn.hidden = true;
    continueBtn.disabled = true;
    continueBtn.textContent = '✅ LOCK IN & CONTINUE';
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
  setRound4LoadingPhase(true);

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
  if (causalityText) causalityText.textContent = 'Scenario sets the lane. Twist bends the lane. OVR shows who still dominates.';
  setLoadingBotContext(scenario, twist, '');

  const loading = document.getElementById('evalLoading');
  const loadingTitle = document.getElementById('evalLoadingTitle');
  const loadingSubtitle = document.getElementById('evalLoadingSubtitle');
  if (loading) loading.style.display = 'flex';
  if (loadingTitle) loadingTitle.textContent = 'AI EVALUATOR ROUND';
  if (loadingSubtitle) loadingSubtitle.textContent = '';
  setLoadingReadyState(false);
  setRevealCeremonyProgress(8, 'Initializing evaluator');
  updateLoadingDockProgress(0, Math.max(1, round4State.totalCharacters || 18), 'Initializing evaluator');

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
      const scoreMeta = entry && entry.scoreMeta ? entry.scoreMeta : {};
      const contextExplain = scoreMeta && scoreMeta.contextExplainability ? scoreMeta.contextExplainability : null;
      const shadowInfo = scoreMeta && scoreMeta.contextShadow ? scoreMeta.contextShadow : null;
      const engineMode = scoreMeta && scoreMeta.evaluationEngineMode ? String(scoreMeta.evaluationEngineMode) : 'legacy';
      const engineLabel = scoreMeta && scoreMeta.evaluationEngine ? String(scoreMeta.evaluationEngine) : 'legacy-rules-v1';
      const trustPct = Math.round(Math.max(0, Math.min(100, (Number(scoreMeta && scoreMeta.infoConfidence) || 0) * 100)));
      const explainStatusLabel = contextExplain && contextExplain.statusLabel
        ? String(contextExplain.statusLabel)
        : null;
      const explainTrustLabel = contextExplain && contextExplain.trustLabel
        ? String(contextExplain.trustLabel)
        : null;
      const explainTraceLine = contextExplain && contextExplain.traceLine
        ? String(contextExplain.traceLine)
        : null;
      const explainTone = contextExplain && contextExplain.statusTone
        ? String(contextExplain.statusTone)
        : 'neutral';
      const explainRiskSeverity = contextExplain && contextExplain.riskSeverity
        ? String(contextExplain.riskSeverity)
        : 'low';
      const explainRiskSummary = contextExplain && contextExplain.riskSummary
        ? String(contextExplain.riskSummary)
        : '';
      const resolvePct = Number.isFinite(Number(contextExplain && contextExplain.resolverPct))
        ? Math.max(0, Math.min(100, Number(contextExplain.resolverPct)))
        : Math.round(Math.max(0, Math.min(100, (Number(scoreMeta && scoreMeta.resolverConfidence) || 0) * 100)));
      const contextPct = Number.isFinite(Number(contextExplain && contextExplain.contextPct))
        ? Math.max(0, Math.min(100, Number(contextExplain.contextPct)))
        : Math.round(Math.max(0, Math.min(100, (Number(scoreMeta && scoreMeta.contextFitConfidence) || 0) * 100)));
      const traceStatus = contextExplain && contextExplain.status
        ? String(contextExplain.status)
        : shadowInfo && shadowInfo.status
          ? `shadow:${String(shadowInfo.status)}`
          : engineMode;
      const normalized = {
        ...entry,
        fitDelta: getScenarioDelta(entry),
        roleType: entry.roleType || entry.characterType || 'Balanced',
        shortReason: entry.reason || 'No short reason available.',
        rarity: entry.rarity || 'Common',
        notes: Array.isArray(entry.notes) ? entry.notes.slice(0, 4) : [],
        ovrTierLabel: (entry.ovrTier && entry.ovrTier.label) || (typeof entry.ovrTier === 'string' ? entry.ovrTier : getOVRTierFromValue(entry.ovr).label),
        evalEngineMode: engineMode,
        evalEngineLabel: engineLabel,
        evalTrustPct: trustPct,
        evalTraceStatus: traceStatus,
        evalTraceStatusLabel: explainStatusLabel || traceStatus,
        evalTraceLine: explainTraceLine || '',
        evalTrustLabel: explainTrustLabel || '',
        evalTraceTone: explainTone,
        evalRiskSeverity: explainRiskSeverity,
        evalRiskSummary: explainRiskSummary,
        evalResolvePct: resolvePct,
        evalContextPct: contextPct,
        evalTraceBadge: engineMode === 'context'
          ? `CE ${trustPct}%`
          : engineMode === 'context_shadow'
            ? `SH ${trustPct}%`
            : 'LG'
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
              <span class="eval-docked-ovr ${tierClass}">OVR ${Number(evalData.ovr) || 0} · ${escapeHtml(evalData.evalTraceBadge || 'LG')}</span>
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
          <p>${escapeHtml(evalData.evalEngineMode || 'legacy')} • ${escapeHtml(evalData.evalTraceStatusLabel || evalData.evalTraceStatus || 'n/a')} • ${escapeHtml(evalData.evalTrustLabel || `Trust ${Number(evalData.evalTrustPct) || 0}%`)}</p>
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
        <div class="eval-active-chip"><span>Trust</span><strong>${Number(evalData.evalTrustPct) || 0}%</strong></div>
        <div class="eval-active-chip"><span>Trace (R/C)</span><strong>${Number(evalData.evalResolvePct) || 0}/${Number(evalData.evalContextPct) || 0}</strong></div>
        <div class="eval-active-chip trace-${escapeHtml(String(evalData.evalRiskSeverity || 'low'))}"><span>Risk</span><strong>${escapeHtml(String(evalData.evalRiskSeverity || 'low').toUpperCase())}</strong></div>
      </div>
      <details class="eval-active-details">
        <summary>Details + Notes</summary>
        ${evalData.evalRiskSummary || evalData.evalTraceLine ? `<p class="eval-active-trace-summary">${escapeHtml(evalData.evalTraceLine || '')}${evalData.evalRiskSummary ? ` • ${escapeHtml(evalData.evalRiskSummary)}` : ''}</p>` : ''}
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
  const liteMode = getRevealPerfMode() === 'lite';

  const initialDelayMs = Math.max(liteMode ? 900 : 1100, Math.round((Number(incoming.initialDelayMs) || 3300) * (liteMode ? 1.05 : 1.08)));
  const stepIntervalMs = Math.max(liteMode ? 1900 : 2200, Math.round((Number(incoming.stepIntervalMs) || 3050) * (liteMode ? 1.02 : 1.08)));
  const dockDurationMs = Math.max(liteMode ? 1150 : 1350, Math.round((Number(incoming.dockDurationMs) || 1450) * (liteMode ? 1.02 : 1.08)));
  const finalResultsDelayMs = Math.max(liteMode ? 1500 : 1800, Math.round((Number(incoming.finalResultsDelayMs) || 2850) * (liteMode ? 1.03 : 1.08)));
  const startAtMs = Number(incoming.startAtMs) || (now + initialDelayMs);

  return {
    startAtMs,
    initialDelayMs,
    stepIntervalMs,
    dockDurationMs,
    finalResultsDelayMs,
    perfMode: liteMode ? 'lite' : 'full'
  };
}

function loadImageAsset(url) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return Promise.resolve();

  if (IMAGE_PRELOAD_CACHE.has(normalized)) {
    return IMAGE_PRELOAD_CACHE.get(normalized);
  }

  const preloadTask = new Promise((resolve) => {
    let settled = false;
    let attempt = 0;
    const maxAttempts = getRevealPerfMode() === 'lite' ? 1 : 3;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const loadAttempt = () => {
      const image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';
      image.referrerPolicy = 'no-referrer';

      const onDone = async () => {
        if (typeof image.decode === 'function') {
          try {
            await image.decode();
          } catch (error) {
          }
        }
        finish();
      };

      image.onload = onDone;
      image.onerror = () => {
        attempt += 1;
        if (attempt >= maxAttempts) {
          finish();
          return;
        }
        window.setTimeout(loadAttempt, 110 + (attempt * 120));
      };

      image.src = normalized;
      window.setTimeout(() => {
        if (!settled && attempt + 1 >= maxAttempts) finish();
      }, 1800 + (attempt * 450));
    };

    loadAttempt();
  });

  IMAGE_PRELOAD_CACHE.set(normalized, preloadTask);
  return preloadTask;
}

async function runWithConcurrency(items, concurrency, mapper) {
  const queue = Array.isArray(items) ? items : [];
  const safeConcurrency = Math.max(1, Math.min(Number(concurrency) || 1, queue.length || 1));
  let index = 0;

  const workers = Array.from({ length: safeConcurrency }, async () => {
    while (index < queue.length) {
      const current = index;
      index += 1;
      await mapper(queue[current], current);
    }
  });

  await Promise.all(workers);
}

function waitNextFrames(count = 2) {
  const safeCount = Math.max(1, Number(count) || 1);
  return new Promise((resolve) => {
    let remaining = safeCount;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  });
}

function primeAnimationPipeline() {
  if (round4State.animationPrimePromise) return round4State.animationPrimePromise;

  round4State.animationPrimePromise = (async () => {
    if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.ready === 'object') {
      try {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => window.setTimeout(resolve, 900))
        ]);
      } catch (error) {
      }
    }

    await waitNextFrames(3);

    const stage = document.querySelector('#round4EvalScreen .eval-cinematic-stage');
    const heroHost = document.getElementById('evalHeroHost');
    const board = document.getElementById('evalTeamBoards');
    const slots = Array.from(document.querySelectorAll('.eval-slot')).slice(0, 24);

    if (stage) stage.getBoundingClientRect();
    if (heroHost) heroHost.getBoundingClientRect();
    if (board) board.getBoundingClientRect();
    slots.forEach((slot) => {
      slot.style.willChange = 'transform, opacity';
      slot.getBoundingClientRect();
    });

    round4State.animationPrimed = true;
    return true;
  })();

  return round4State.animationPrimePromise;
}

function preloadCinematicAssets() {
  if (round4State.preloadPromise) return round4State.preloadPromise;

  const urls = Array.from(new Set(
    round4State.queue
      .map((assignment) => assignment && assignment.evalData ? normalizeImageUrl(assignment.evalData.imageUrl) : null)
      .filter(Boolean)
  ));

  const totalAssets = urls.length;
  let completedAssets = 0;

  updateLoadingDockProgress(0, totalAssets || 1, 'Preloading character assets');

  const settlePromise = runWithConcurrency(urls, 4, async (url) => {
    await loadImageAsset(url).catch(() => null);
    completedAssets += 1;
    updateLoadingDockProgress(completedAssets, totalAssets || 1, 'Preloading character assets');
  })
    .then(() => {
      round4State.preloadDone = true;
      updateLoadingDockProgress(totalAssets || 1, totalAssets || 1, 'Assets ready');
      return true;
    })
    .catch(() => {
      round4State.preloadDone = true;
      updateLoadingDockProgress(totalAssets || 1, totalAssets || 1, 'Assets ready');
      return true;
    });

  round4State.preloadPromise = Promise.race([
    settlePromise,
    new Promise((resolve) => window.setTimeout(() => {
      round4State.preloadDone = true;
      updateLoadingDockProgress(totalAssets || 1, totalAssets || 1, 'Assets ready');
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
  if (status) status.textContent = 'Reveal complete. Lock this result when your team is ready.';

  const continueBtn = document.getElementById('evalContinueBtn');
  if (continueBtn) {
    continueBtn.hidden = false;
    continueBtn.disabled = false;
    continueBtn.textContent = '✅ LOCK IN & CONTINUE';
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
        <h3>Final Showdown Leaderboard</h3>
        <p>Round 4 points, full-roster OVR, and top-pick spotlight.</p>
      </header>
      <div class="eval-leaderboard-rich-list">
        ${ranked.map((row, index) => {
          const tierClass = getTierClassFromOVR(Number(row && row.totalOVR) || 0);
          const topPickImage = getLeaderboardTopPickImage(row);
          const cumulativeOVR = Number(row && row.cumulativeOVR);
          const safeCumulativeOVR = Number.isFinite(cumulativeOVR)
            ? cumulativeOVR
            : Math.round((Number(row && row.averageOVR) || 0) * 6);
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
                <span><small>OVR CUM 💦</small><b>${safeCumulativeOVR}</b></span>
                <span><small>OVR AVG 🧢</small><b>${averageOVR}</b></span>
                <span><small>FASTEST LOCK 🔒</small><b>${fastestLock}</b></span>
                <span><small>R4 PTS🫵</small><b>${roundPoints}</b></span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function isRound4EvalScreenActive() {
  const screen = document.getElementById('round4EvalScreen');
  return Boolean(screen && screen.classList.contains('active'));
}

function renderRound4FinaleCeremony(gameEndedData = {}) {
  if (!isRound4EvalScreenActive()) return false;

  const container = document.getElementById('evalLeaderboardContainer');
  if (!container) return false;

  const finalLeaderboard = Array.isArray(gameEndedData && gameEndedData.finalLeaderboard)
    ? gameEndedData.finalLeaderboard
    : [];
  const winnerInfo = gameEndedData && gameEndedData.winner && typeof gameEndedData.winner === 'object'
    ? gameEndedData.winner
    : {};
  const winnerTeamStats = gameEndedData && gameEndedData.winnerTeamStats && typeof gameEndedData.winnerTeamStats === 'object'
    ? gameEndedData.winnerTeamStats
    : {};
  const eliteFinalSix = Array.isArray(gameEndedData && gameEndedData.eliteFinalSix) && gameEndedData.eliteFinalSix.length
    ? gameEndedData.eliteFinalSix
    : (Array.isArray(gameEndedData && gameEndedData.winnerTeamCharacters) ? gameEndedData.winnerTeamCharacters : []);

  const winnerName = String(winnerInfo && winnerInfo.name ? winnerInfo.name : (finalLeaderboard[0] && finalLeaderboard[0].name ? finalLeaderboard[0].name : 'Champion'));
  const winnerScore = Number(finalLeaderboard[0] && finalLeaderboard[0].score) || 0;
  const secondScore = Number(finalLeaderboard[1] && finalLeaderboard[1].score);
  const margin = Number.isFinite(secondScore) ? (winnerScore - secondScore) : null;
  const marginLabel = margin == null
    ? 'No runner-up data'
    : (margin === 0 ? 'Photo-finish tie' : `Margin ${margin > 0 ? '+' : ''}${margin}`);

  const teamOVR = Number(winnerTeamStats.teamOVR) || 0;
  const round4Points = Number(winnerTeamStats.round4Points) || 0;
  const chemistryBonus = Number(winnerTeamStats.chemistryBonus) || 0;
  const rarityScore = Number(winnerTeamStats.rarityScore) || 0;
  const mvp = String(winnerTeamStats.mvp || 'N/A');

  const podiumRows = finalLeaderboard.slice(0, Math.max(3, Math.min(6, finalLeaderboard.length || 0))).map((entry, index) => {
    const score = Number(entry && entry.score) || 0;
    const name = escapeHtml(entry && entry.name ? entry.name : `Player ${index + 1}`);
    const rankLabel = index === 0 ? 'Champion' : index === 1 ? 'Runner-up' : index === 2 ? '3rd' : `#${index + 1}`;
    const breakdown = Array.isArray(entry && entry.breakdown)
      ? entry.breakdown.map((pts, round) => `R${round + 1}:${pts}`).join(' | ')
      : '';
    return `
      <li class="eval-finale-podium-row ${index === 0 ? 'is-champion' : ''}">
        <div class="eval-finale-podium-main">
          <span class="eval-finale-podium-rank">${escapeHtml(rankLabel)}</span>
          <strong class="eval-finale-podium-name">${name}</strong>
        </div>
        <div class="eval-finale-podium-score">${score} pts</div>
        ${breakdown ? `<div class="eval-finale-podium-breakdown">${escapeHtml(breakdown)}</div>` : ''}
      </li>
    `;
  }).join('');

  const eliteSlots = eliteFinalSix.slice(0, 6).map((entry, index) => {
    const rawImage = entry && entry.imageUrl ? String(entry.imageUrl).trim() : '';
    const imageUrl = rawImage ? resolveCharacterImage(rawImage, entry && entry.character ? entry.character : 'No Portrait') : buildMissingCharacterImage('No Portrait');
    const safeName = escapeHtml(entry && entry.character ? entry.character : `Elite ${index + 1}`);
    const eliteRank = Number(entry && entry.eliteRank) || (index + 1);
    const ownerName = entry && entry.ownerName ? String(entry.ownerName) : '';
    const ownerAbbr = ownerName
      ? ownerName.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 3).toUpperCase()
      : '';
    const isChampionMember = entry && entry.isChampionMember === true;
    return `
      <div class="eval-finale-elite-slot ${isChampionMember ? 'is-champion-member' : ''}" title="${safeName}${ownerName ? ` | ${escapeHtml(ownerName)}` : ''}">
        <img src="${escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';">
        <span class="eval-finale-elite-rank">#${eliteRank}</span>
        ${ownerAbbr ? `<span class="eval-finale-elite-owner">${escapeHtml(ownerAbbr)}</span>` : ''}
      </div>
    `;
  }).join('');

  const existing = container.querySelector('.eval-finale-ceremony');
  if (existing) existing.remove();

  container.insertAdjacentHTML('beforeend', `
    <section class="eval-finale-ceremony" aria-live="polite" aria-label="Final game results in round 4 ceremony">
      <header class="eval-finale-hero">
        <div class="eval-finale-eyebrow">Final Verdict | Round 4 Ceremony</div>
        <h3>${escapeHtml(winnerName)} wins the match</h3>
        <p>The finale now lands directly inside the Round 4 phase so the reveal and payoff stay connected.</p>
        <div class="eval-finale-kpis">
          <span>Score <b>${winnerScore}</b></span>
          <span>${escapeHtml(marginLabel)}</span>
          <span>R4 <b>${round4Points}</b></span>
          <span>Team OVR <b>${teamOVR}</b></span>
          <span>Chem ${chemistryBonus >= 0 ? '+' : ''}${chemistryBonus}</span>
          <span>MVP <b>${escapeHtml(mvp)}</b></span>
          <span>Rarity <b>${rarityScore}</b></span>
        </div>
      </header>

      ${eliteSlots ? `
        <section class="eval-finale-elite-strip" aria-label="Elite Final Six preview">
          <div class="eval-finale-section-head">
            <strong>Elite Final Six</strong>
            <small>OVR showcase (score champion remains separate)</small>
          </div>
          <div class="eval-finale-elite-grid">${eliteSlots}</div>
        </section>
      ` : ''}

      <section class="eval-finale-standings" aria-label="Final standings">
        <div class="eval-finale-section-head">
          <strong>Final Standings</strong>
          <small>Full totals with round breakdowns</small>
        </div>
        <ol class="eval-finale-podium">
          ${podiumRows || '<li class="eval-finale-podium-empty">No standings available.</li>'}
        </ol>
      </section>

      <div class="eval-finale-actions">
        <button class="btn btn-secondary" type="button" onclick="openFinalResultsArchive()">OPEN FULL ARCHIVE</button>
        <button class="btn btn-success" type="button" onclick="sendPlayAgain()">PLAY AGAIN</button>
        <button class="btn btn-secondary" type="button" onclick="goToLobby()">NEW GAME</button>
      </div>
    </section>
  `);

  const status = document.getElementById('evalFinalStatus');
  if (status) status.textContent = 'Final verdict revealed here in Round 4.';

  const continueBtn = document.getElementById('evalContinueBtn');
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.hidden = true;
  }

  const panel = container.querySelector('.eval-finale-ceremony');
  if (panel) {
    try {
      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panel.scrollIntoView(reduceMotion ? { block: 'start' } : { behavior: 'smooth', block: 'start' });
    } catch (error) {
    }
  }

  return true;
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

  setRevealCeremonyProgress(56, 'Building reveal sequence');
  updateLoadingDockProgress(0, Math.max(1, round4State.queue.length || 1), 'Stabilizing fetch quality');

  Promise.allSettled([
    preloadCinematicAssets(),
    prepareRevealSequenceProfiles(),
    primeAnimationPipeline()
  ]).finally(() => {
    if (!round4State.animationPrimed) {
      round4State.animationPrimed = true;
    }
    setRevealCeremonyProgress(100, 'Reveal ceremony ready');
    updateLoadingDockProgress(round4State.queue.length || 1, round4State.queue.length || 1, 'Reveal profile ready');
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
  if (status) status.textContent = 'Waiting on players...';

  window.socket.emit('requestFinalResults');
}

function toggleEvalScenario() {
  const screen = document.getElementById('round4EvalScreen');
  const box = document.getElementById('evalScenarioBox');
  const toggle = document.getElementById('evalContextToggle');
  if (!box || !toggle) return;
  if (screen && screen.classList.contains('eval-context-hidden')) return;
  box.classList.toggle('is-condensed');
  toggle.setAttribute('aria-expanded', box.classList.contains('is-condensed') ? 'false' : 'true');
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

function ensureActiveOVRCharacterLayout() {
  const imageWrap = document.getElementById('modalCharacterImageWrap');
  const summaryEl = document.getElementById('modalCharacterSummary');
  if (!imageWrap || !summaryEl) return null;
  const section = summaryEl.closest('.ovr-breakdown-section');
  if (!section) return null;
  const imageHost = imageWrap.parentElement || section;
  const summaryHost = summaryEl.parentElement || imageHost;
  if (!imageHost) return null;

  let shell = section.querySelector('.ovr-character-layout');
  let textPane = section.querySelector('.ovr-character-text-pane');
  let quickPane = section.querySelector('#modalContextQuickViewActive');

  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'ovr-character-layout';
    imageHost.insertBefore(shell, imageWrap);
    shell.appendChild(imageWrap);
  }
  if (!textPane) {
    textPane = document.createElement('div');
    textPane.className = 'ovr-character-text-pane';
    shell.appendChild(textPane);
  }
  if (summaryHost !== textPane) {
    textPane.insertBefore(summaryEl, textPane.firstChild || null);
  }
  if (!quickPane) {
    quickPane = document.createElement('div');
    quickPane.id = 'modalContextQuickViewActive';
    quickPane.className = 'ovr-context-quick-view';
    textPane.appendChild(quickPane);
  }

  section.classList.add('ovr-breakdown-section-character');
  summaryEl.classList.add('ovr-char-summary-rich');
  return { section, summaryEl, quickPane };
}

function splitActiveContextSummaryText(summary) {
  const text = String(summary || '').trim();
  if (!text) return { trace: '', resolver: '', blurb: '' };
  const marker = '. Resolved ';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return { trace: text, resolver: '', blurb: '' };
  const trace = `${text.slice(0, markerIndex + 1).trim()}`;
  const tail = text.slice(markerIndex + 2).trim();
  const nextPeriod = tail.indexOf('. ');
  if (nextPeriod < 0) return { trace, resolver: tail, blurb: '' };
  return {
    trace,
    resolver: tail.slice(0, nextPeriod + 1).trim(),
    blurb: tail.slice(nextPeriod + 2).trim()
  };
}

function buildActiveContextQuickCardHtml({ label, emoji, text, keywords, promptText, toneClass = '', flavorText = '' }) {
  const safeText = String(text || '').trim() || 'No analysis available.';
  const parts = safeText.split(/(?<=[.!?])\s+/).map((part) => String(part || '').trim()).filter(Boolean);
  const headline = parts[0] || safeText;
  const explicitFlavor = String(flavorText || '').trim();
  const flavor = explicitFlavor || (parts.length >= 3 ? parts[parts.length - 1] : '');
  const detail = parts.length > 1 ? parts.slice(1, flavor ? -1 : undefined).join(' ') : '';
  const promptCompact = String(promptText || '').trim().replace(/\s+/g, ' ');
  const safeKeywords = Array.isArray(keywords) ? keywords.filter(Boolean).slice(0, 4) : [];

  return `
    <div class="ovr-context-quick-card ${toneClass}">
      <div class="ovr-context-quick-head"><span>${emoji || ''}</span><strong>${escapeHtml(label || 'Context')}</strong></div>
      <p class="ovr-context-quick-copy ovr-context-quick-headline">${escapeHtml(headline)}</p>
      ${detail ? `<p class="ovr-context-quick-copy ovr-context-quick-detail">${escapeHtml(detail)}</p>` : ''}
      <div class="ovr-context-quick-keywords">
        ${safeKeywords.length
          ? safeKeywords.map((kw) => `<span class="ovr-keyword-chip">${escapeHtml(kw)}</span>`).join('')
          : '<span class="ovr-keywords-empty">No keyword matches</span>'}
      </div>
      ${(flavor && (!promptCompact || flavor !== `${promptCompact}? -> ${headline.replace(/[.!?]+$/, '')}.`)) ? `<p class="ovr-context-quick-flavor">${escapeHtml(flavor)}</p>` : ''}
    </div>
  `;
}

function enhanceActiveOVRBreakdownContextLayout(evalData) {
  if (!evalData || !evalData.breakdown) return;
  const modal = document.getElementById('ovrBreakdownModal');
  if (!modal) return;
  const isContextEngineBreakdown = Boolean(
    /Context Engine/i.test(String(evalData.breakdown.characterSummary || ''))
    || (evalData.breakdown.engineTrace && /context/i.test(String(evalData.breakdown.engineTrace.engine || '')))
    || (evalData.engineMeta && /context/i.test(String(evalData.engineMeta.engine || '')))
  );
  modal.classList.toggle('ovr-context-mode', isContextEngineBreakdown);
  modal.setAttribute('data-ovr-ui-version', isContextEngineBreakdown ? 'ce-compact-v4' : 'legacy');

  const scenarioSection = document.getElementById('modalScenarioRelevance')?.closest('.ovr-breakdown-section') || null;
  const twistSection = document.getElementById('modalTwistRelevance')?.closest('.ovr-breakdown-section') || null;
  if (!isContextEngineBreakdown) {
    if (scenarioSection) { scenarioSection.hidden = false; scenarioSection.style.display = ''; }
    if (twistSection) { twistSection.hidden = false; twistSection.style.display = ''; }
    return;
  }

  const layout = ensureActiveOVRCharacterLayout();
  if (!layout) return;
  const parsed = splitActiveContextSummaryText(evalData.breakdown.characterSummary || '');
  const engineTrace = evalData.breakdown.engineTrace || {};
  const confidence = engineTrace.confidence || {};
  const traits = Array.isArray(engineTrace.matchedTraits) ? engineTrace.matchedTraits.slice(0, 4) : [];
  const flags = Array.isArray(engineTrace.riskFlags) ? engineTrace.riskFlags.slice(0, 4) : [];

  layout.summaryEl.innerHTML = [
    '<div class="ovr-summary-rule"></div>',
    parsed.resolver ? `<div class="ovr-summary-resolver">${escapeHtml(parsed.resolver)}</div>` : '',
    `<div class="ovr-summary-meta">
      <span class="ovr-summary-chip">CE v4</span>
      <span class="ovr-summary-chip">${escapeHtml(`Resolve ${Math.round((Number(confidence.nameResolution) || 0) * 100)}%`)}</span>
      <span class="ovr-summary-chip">${escapeHtml(`Context ${Math.round((Number(confidence.contextFit) || 0) * 100)}%`)}</span>
    </div>`,
    (traits.length || flags.length)
      ? `<div class="ovr-summary-badges">
          ${traits.map((t) => `<span class="ovr-summary-badge trait">${escapeHtml(t)}</span>`).join('')}
          ${flags.map((f) => `<span class="ovr-summary-badge flag">${escapeHtml(f)}</span>`).join('')}
        </div>`
      : '',
    parsed.blurb ? `<div class="ovr-summary-blurb">${escapeHtml(parsed.blurb)}</div>` : '',
    '<div class="ovr-summary-rule"></div>'
  ].filter(Boolean).join('');

  const scenarioText = String(evalData.breakdown.scenarioRelevance || 'No scenario analysis available.');
  const twistText = String(evalData.breakdown.twistRelevance || 'No twist analysis available.');
  const scenarioKeywords = evalData.breakdown.keywordMatches && Array.isArray(evalData.breakdown.keywordMatches.scenario)
    ? evalData.breakdown.keywordMatches.scenario
    : [];
  const twistKeywords = evalData.breakdown.keywordMatches && Array.isArray(evalData.breakdown.keywordMatches.twist)
    ? evalData.breakdown.keywordMatches.twist
    : [];
  const contextPrompts = evalData.breakdown.contextPrompts || {};
  const contextFlavor = evalData.breakdown.contextFlavor || {};

  layout.quickPane.innerHTML = [
    buildActiveContextQuickCardHtml({
      label: 'Scenario Fit',
      emoji: '🎯',
      text: scenarioText,
      keywords: scenarioKeywords,
      promptText: contextPrompts.scenario || '',
      flavorText: contextFlavor.scenario || '',
      toneClass: /excellent|strong/i.test(scenarioText) ? 'boost' : (/weak|low|outside/i.test(scenarioText) ? 'drag' : '')
    }),
    buildActiveContextQuickCardHtml({
      label: 'Twist Fit',
      emoji: '🌀',
      text: twistText,
      keywords: twistKeywords,
      promptText: contextPrompts.twist || '',
      flavorText: contextFlavor.twist || '',
      toneClass: /helps|manageable|works|positive/i.test(twistText) ? 'boost' : (/hurts|removes|strips|negative/i.test(twistText) ? 'drag' : '')
    })
  ].join('');

  if (scenarioSection) {
    scenarioSection.hidden = true;
    scenarioSection.style.display = 'none';
    scenarioSection.setAttribute('aria-hidden', 'true');
  }
  if (twistSection) {
    twistSection.hidden = true;
    twistSection.style.display = 'none';
    twistSection.setAttribute('aria-hidden', 'true');
  }
}

function openOVRBreakdown(evalData) {
  const modal = document.getElementById('ovrBreakdownModal');
  if (!modal || !evalData) return;
  try {
    const modalContent = modal.querySelector('.ovr-modal-content');
    const tierClass = getTierClassFromEval(evalData);
    if (modalContent) {
      modalContent.classList.remove('tier-icon', 'tier-legendary', 'tier-epic', 'tier-rare', 'tier-gold', 'tier-silver', 'tier-bronze');
      modalContent.classList.add('ovr-tiered', tierClass);
      modalContent.setAttribute('data-tier', tierClass.replace('tier-', ''));
    }

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
      const hasContextBreakdown = Boolean(
        evalData && evalData.breakdown
        && (/Context Engine/i.test(String(evalData.breakdown.characterSummary || ''))
        || (evalData.breakdown.engineTrace && /context/i.test(String(evalData.breakdown.engineTrace.engine || ''))))
      );
      modalTitle.textContent = hasContextBreakdown
        ? `OVR Breakdown - ${evalData.character} [CE v4]`
        : `OVR Breakdown - ${evalData.character}`;
    }

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
      const scoreDetails = scoreBreakdownEl.closest('details');
      if (scoreDetails) scoreDetails.open = false;
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

      try {
        setupOVRVisualInteractions(modal);
      } catch (visualError) {
        console.warn('[OVR modal] visual interactions disabled:', visualError);
      }
    }

    try {
      enhanceActiveOVRBreakdownContextLayout(evalData);
    } catch (layoutError) {
      console.error('[OVR modal] context layout enhance failed:', layoutError);
    }
  } catch (error) {
    console.error('[OVR modal] open failed, using minimal fallback:', error);
    try {
      const title = document.getElementById('modalTitle');
      if (title) title.textContent = `OVR Breakdown - ${evalData.character || 'Character'}`;
      const summary = document.getElementById('modalCharacterSummary');
      if (summary) summary.textContent = (evalData && evalData.breakdown && evalData.breakdown.characterSummary) || 'No information available.';
    } catch (fallbackError) {
    }
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
      if (title) title.textContent = 'AI EVALUATOR ROUND';
      if (subtitle) subtitle.textContent = '';
      setLoadingReadyState(false);
      setRevealCeremonyProgress(38, 'Scoring final teams');
      updateLoadingDockProgress(0, 100, 'Scoring final teams');
      setLoadingBotContext(data && data.scenario, data && data.twist, '');

      window.setTimeout(renderCinematicSequence, 420);
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
      status.textContent = `Waiting on players: ${readyCount}/${totalPlayers}`;

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
window.renderRound4FinaleCeremony = renderRound4FinaleCeremony;
