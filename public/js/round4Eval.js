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
  revealStartTimer: null,
  cinematicRenderTimer: null,
  revealConfig: null,
  pendingFinalResultsTimer: null,
  preloadPromise: null,
  preloadDone: false,
  revealAnnouncerWarmPromise: null,
  revealAnnouncerWarmDone: false,
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
  pendingLoadingReadyVoiceCue: null,
  pendingLoadingReadyVoiceCueEvalId: null,
  loadingReadyVoiceSpokenEvalId: null,
  animationPrimed: false,
  animationPrimePromise: null,
  revealPerfMode: null,
  finaleObserver: null,
  finaleAutoCollapseTimer: null,
  finaleLastTouchedAt: Object.create(null),
  pageObserver: null,
  pageAutoCollapseTimer: null,
  pageLastTouchedAt: Object.create(null),
  pageCollapsed: Object.create(null),
  pageNavActive: 'cards',
  pageNavMenuOpen: false,
  pageNavGlobalHandlersBound: false
};

const IMAGE_PRELOAD_CACHE = new Map();

function getSharedAudioBridge() {
  try {
    return (typeof window !== 'undefined' && window.__lobbyAudio && typeof window.__lobbyAudio === 'object')
      ? window.__lobbyAudio
      : null;
  } catch (error) {
    return null;
  }
}

function ensureSharedAudioReady() {
  const bridge = getSharedAudioBridge();
  if (!bridge) return false;
  try {
    if (typeof bridge.ensureUnlocked === 'function') bridge.ensureUnlocked();
    if (typeof bridge.ensureRunning === 'function') bridge.ensureRunning();
    return true;
  } catch (error) {
    return false;
  }
}

function playSharedCharacterCardBlurb(entry, options = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.playCharacterCardBlurb !== 'function') return false;
  try {
    return bridge.playCharacterCardBlurb(entry, options);
  } catch (error) {
    return false;
  }
}

function playSharedHighestOVRCardBlurb(entries, options = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.playHighestOVRCardBlurb !== 'function') return false;
  try {
    return bridge.playHighestOVRCardBlurb(entries, options);
  } catch (error) {
    return false;
  }
}

function playSharedFinaleMvpVictoryCallout(entries, options = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.playFinaleMvpVictoryCallout !== 'function') return false;
  try {
    return bridge.playFinaleMvpVictoryCallout(entries, options);
  } catch (error) {
    return false;
  }
}

function buildRound4LoadingReadyCue(evaluationId = '') {
  const safeEvalId = String(evaluationId || 'n/a').trim() || 'n/a';
  return {
    id: `round4-loading-ready-${safeEvalId}`,
    type: 'round4',
    text: 'Round four results are in.',
    subtitleText: 'Round 4 evaluation complete',
    priority: 82,
    intensity: 0.64,
    allowLiveGenerate: true,
    dedupeKey: `round4:loading-ready:${safeEvalId}`
  };
}

function prefetchSharedCharacterCardBlurbs(entries, options = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.prefetchCharacterCardBlurbs !== 'function') return false;
  try {
    return bridge.prefetchCharacterCardBlurbs(entries, options);
  } catch (error) {
    return false;
  }
}

function getNarratorLeadLineFromVoiceCues(cues = []) {
  const list = Array.isArray(cues) ? cues : [];
  for (let i = 0; i < list.length; i += 1) {
    const cue = list[i] && typeof list[i] === 'object' ? list[i] : null;
    if (!cue) continue;
    const type = String(cue.type || '').toLowerCase();
    if (type !== 'narration' && type !== 'round4') continue;
    const line = String(cue.subtitleText || cue.text || '').replace(/\s+/g, ' ').trim();
    if (line) return line;
  }
  return 'Final results are in.';
}

function enqueueSharedVoiceCues(cues, options = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.enqueueVoiceCues !== 'function') return false;
  try {
    return bridge.enqueueVoiceCues(cues, options);
  } catch (error) {
    return false;
  }
}

function prefetchSharedVoiceCues(cues, options = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.prefetchVoiceCues !== 'function') return false;
  try {
    return bridge.prefetchVoiceCues(cues, options);
  } catch (error) {
    return false;
  }
}

function warmSharedVoiceCuesNow(cues, options = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.warmVoiceCuesNow !== 'function') return null;
  try {
    return bridge.warmVoiceCuesNow(cues, options);
  } catch (error) {
    return null;
  }
}

function waitForSharedVoiceCueCompletion(cue = null, {
  timeoutMs = 1200,
  minHoldMs = 0,
  startTimeoutMs = null
} = {}) {
  const cueId = String(cue && cue.id || '').trim();
  const cueDedupeKey = String(cue && cue.dedupeKey || '').trim();
  const safeTimeoutMs = Math.max(120, Number(timeoutMs) || 1200);
  const safeMinHoldMs = Math.max(0, Number(minHoldMs) || 0);
  const safeStartTimeoutMs = Math.max(safeTimeoutMs, Number(startTimeoutMs) || (safeTimeoutMs + 400));
  const bridge = getSharedAudioBridge();
  let localVoiceEnabled = true;
  try {
    if (bridge && typeof bridge.getState === 'function') {
      const state = bridge.getState() || {};
      localVoiceEnabled = !(
        state.muted === true
        || state.voiceEnabled === false
        || state.voiceUnlocked === false
        || state.voiceSupported === false
      );
    }
  } catch (error) {
  }

  const minHoldPromise = new Promise((resolve) => window.setTimeout(resolve, safeMinHoldMs));
  if (!cueId && !cueDedupeKey) {
    return minHoldPromise;
  }
  if (!localVoiceEnabled) {
    return minHoldPromise;
  }

  const completionPromise = new Promise((resolve) => {
    let settled = false;
    let pollTimerId = null;
    let startedAt = 0;
    const createdAt = Date.now();
    const matchesCue = (detail) => {
      const eventId = String(detail && detail.id || '').trim();
      const eventDedupeKey = String(detail && detail.dedupeKey || '').trim();
      return Boolean((cueId && eventId === cueId) || (cueDedupeKey && eventDedupeKey === cueDedupeKey));
    };
    const clearTimers = () => {
      if (pollTimerId) {
        window.clearTimeout(pollTimerId);
        pollTimerId = null;
      }
    };
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimers();
      try {
        window.removeEventListener('lobby:voice-cue-start', onStart);
      } catch (error) {
      }
      try {
        window.removeEventListener('lobby:voice-cue-end', onEnd);
      } catch (error) {
      }
      resolve();
    };
    const scheduleTimeoutCheck = () => {
      if (settled) return;
      clearTimers();
      pollTimerId = window.setTimeout(() => {
        if (settled) return;
        const now = Date.now();
        if (startedAt > 0) {
          if ((now - startedAt) >= safeTimeoutMs) {
            done();
            return;
          }
        } else if ((now - createdAt) >= safeStartTimeoutMs) {
          done();
          return;
        }
        scheduleTimeoutCheck();
      }, 90);
    };
    const onStart = (event) => {
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      if (!matchesCue(detail)) return;
      startedAt = Date.now();
      scheduleTimeoutCheck();
    };
    const onEnd = (event) => {
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      if (matchesCue(detail)) done();
    };
    try {
      window.addEventListener('lobby:voice-cue-start', onStart);
      window.addEventListener('lobby:voice-cue-end', onEnd);
    } catch (error) {
      resolve();
      return;
    }
    scheduleTimeoutCheck();
  });

  return Promise.all([minHoldPromise, completionPromise]).then(() => true);
}

function waitForRevealLoadingNarrationToFinish({
  timeoutMs = 9000,
  minQuietMs = 220
} = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.getVoiceState !== 'function') {
    return Promise.resolve({ ok: true, skipped: true, reason: 'bridge-unavailable' });
  }

  const safeTimeoutMs = Math.max(1500, Number(timeoutMs) || 9000);
  const safeMinQuietMs = Math.max(0, Number(minQuietMs) || 220);
  const startAt = Date.now();
  let quietSince = 0;
  let hinted = false;

  const readVoiceGateState = () => {
    let voiceState = null;
    let bridgeState = null;
    try {
      voiceState = bridge.getVoiceState ? (bridge.getVoiceState() || null) : null;
    } catch (error) {
      voiceState = null;
    }
    try {
      bridgeState = bridge.getState ? (bridge.getState() || null) : null;
    } catch (error) {
      bridgeState = null;
    }

    const voiceUnavailable = Boolean(
      !voiceState
      || bridgeState?.muted === true
      || bridgeState?.voiceEnabled === false
      || bridgeState?.voiceUnlocked === false
      || bridgeState?.voiceSupported === false
    );

    return {
      voiceUnavailable,
      speaking: Boolean(voiceState && voiceState.speaking),
      queued: Math.max(0, Number(voiceState && voiceState.queued) || 0)
    };
  };

  return new Promise((resolve) => {
    const tick = () => {
      const now = Date.now();
      const state = readVoiceGateState();
      if (state.voiceUnavailable) {
        resolve({ ok: true, skipped: true, reason: 'voice-unavailable' });
        return;
      }

      const active = state.speaking || state.queued > 0;
      if (active) {
        quietSince = 0;
        if (!hinted) {
          hinted = true;
          const hint = document.getElementById('evalPreloadHint');
          if (hint) hint.textContent = 'Waiting for unfinished assets and narration to stop. ;)';
        }
      } else if (!quietSince) {
        quietSince = now;
      }

      if (quietSince && (now - quietSince) >= safeMinQuietMs) {
        resolve({ ok: true, waitedMs: now - startAt });
        return;
      }

      if ((now - startAt) >= safeTimeoutMs) {
        resolve({ ok: false, timedOut: true, waitedMs: now - startAt });
        return;
      }
      window.setTimeout(tick, 90);
    };
    tick();
  });
}

function pickRevealAnnouncerVariant(options = [], seed = 0) {
  const list = Array.isArray(options) ? options.filter(Boolean) : [];
  if (!list.length) return '';
  const idx = Math.abs(Number(seed) || 0) % list.length;
  return String(list[idx] || '');
}

function getRevealAnnouncerBandKey(ovr = 0) {
  const value = Math.max(0, Math.min(99, Number(ovr) || 0));
  if (value <= 10) return 'appalled';
  if (value <= 30) return 'unimpressed';
  if (value <= 65) return 'dismissive';
  if (value <= 75) return 'content';
  if (value <= 83) return 'impressed';
  if (value <= 91) return 'strong';
  if (value <= 98) return 'elite';
  return 'iconic';
}

function getRevealAnnouncerQueueContext(assignment = null) {
  const queue = Array.isArray(round4State.queue) ? round4State.queue : [];
  const key = assignment && assignment.key ? String(assignment.key) : '';
  const queueIndex = key ? queue.findIndex((item) => String(item && item.key || '') === key) : -1;
  const prior = queueIndex > 0 ? queue.slice(0, queueIndex) : [];
  const lowBefore = prior.filter((item) => (Number(item && item.evalData && item.evalData.ovr) || 0) <= 30).length;
  let lowStreakBefore = 0;
  for (let i = prior.length - 1; i >= 0; i -= 1) {
    const priorOvr = Number(prior[i] && prior[i].evalData && prior[i].evalData.ovr) || 0;
    if (priorOvr > 30) break;
    lowStreakBefore += 1;
  }
  const lowRatioBefore = prior.length ? (lowBefore / prior.length) : 0;
  return {
    queueIndex,
    lowBefore,
    lowStreakBefore,
    lowRatioBefore,
    lowFlood: lowBefore >= 4 || lowStreakBefore >= 2 || lowRatioBefore >= 0.42
  };
}

const REVEAL_ANNOUNCER_BANKS = {
  appalled: {
    intensity: 0.94, rate: 1.19, pitch: 0.96, gain: 0.97,
    openers: ['0!?!?', 'WHAT was that?!', 'Yikes!', 'Oh no.', 'Ha! no way!', 'Brutal.', 'Disaster.'],
    cores: ['{ovr}?!', '{ovr}? no way.', '{ovr}. rough.', '{ovr}. that hurts.', '{ovr}? absolutely not.', '{ovr}. brutal.'],
    numberlessCores: ['that is rough.', 'absolute disaster.', 'that hurts badly.', 'no chance.', 'painful pull.', 'that is chaos.'],
    tails: ['Try again!', 'Reset!', 'Chaos.', 'Painful pull.', 'This is ugly.', 'Recover.'],
    flood: ['Are you even trying?', 'This lobby is farming low rolls.', 'Somebody save this draft.', 'The floor is collapsing.', 'Holy smokes- what a mess.'],
    templates: ['{open} {core}', '{flood} {core}', '{open} {flood}', '{core}'],
    numberlessTemplates: ['{open} {core}', '{flood}', '{open} {tail}', '{core}']
  },
  unimpressed: {
    intensity: 0.78, rate: 1.12, pitch: 0.91, gain: 0.95,
    openers: ["C'mon.", 'Really?', 'Not great.', 'Yeaah-- no.', "That ain't good.", 'OOF.', 'Tough one.'],
    cores: ['{ovr} is not good.', '{ovr}? nah.', '{ovr}. weak.', '{ovr}. keep moving.', '{ovr}... not ideal.'],
    numberlessCores: ['not good.', 'weak pull.', 'rough value.', 'keep moving.', 'not ideal.', 'that is a miss.'],
    tails: ['Need better.', 'That will drag.', 'Do better.', 'Keep searching.', 'No panic. Yet.'],
    flood: ['Another low one?', 'This is a rough streak.', 'The misses are piling up.'],
    templates: ['{open} {core}', '{flood} {core}', '{open} {tail}', '{core}'],
    numberlessTemplates: ['{open} {core}', '{flood}', '{open} {tail}', '{core}']
  },
  dismissive: {
    intensity: 0.62, rate: 1.09, pitch: 0.88, gain: 0.93,
    openers: ['Uh-huh.', 'Okay.', '...riight.', 'Whatever.', 'Sure.', 'Fine.', 'Not ideal.'],
    cores: ['{ovr}.', '{ovr}. serviceable.', '{ovr}. playable.', '{ovr}. move on.', '{ovr}. not special.'],
    numberlessCores: ['serviceable.', 'playable.', 'moving on.', 'not special.', 'fine.', 'it exists.'],
    tails: ['Next.', 'Move.', 'No fireworks.', 'Keep rolling.', 'It exists.'],
    flood: ['At least it is not another single digit.', 'The board needed a reset.', 'Stabilizing???'],
    templates: ['{open} {core}', '{core} {tail}', '{open} {tail}', '{core}'],
    numberlessTemplates: ['{open} {core}', '{core} {tail}', '{open} {tail}', '{tail}']
  },
  content: {
    intensity: 0.68, rate: 1.04, pitch: 0.86, gain: 0.94,
    openers: ['Not bad.', 'Okay!', 'Clean.', 'Solid.', 'Fair enough.', 'That works.', 'Nice.'],
    cores: ['{ovr} is fine', '{ovr} works', '{ovr}. decent add.', '{ovr}. good value', '{ovr}. steady pickup.'],
    numberlessCores: ['clean add.', 'solid pickup.', 'that works.', 'good value.', 'steady pickup.', 'nice little help.'],
    tails: ['No complaints.', 'That helps.', 'Take it.', 'Board stays stable.', 'Respectable.'],
    templates: ['{open} {core}', '{core} {tail}', '{open} {tail}', '{open} {ovr}!'],
    numberlessTemplates: ['{open} {core}', '{core} {tail}', '{open} {tail}', '{open}']
  },
  impressed: {
    intensity: 0.8, rate: 0.99, pitch: 0.84, gain: 0.95,
    openers: ['Very solid add!', 'Now we are talking!', 'Okay, nice!', 'Strong pull!', 'That is value!', 'Good one!'],
    cores: ['{ovr} is real value.', '{ovr}! very solid.', '{ovr}. strong add.', '{ovr}. that plays.', '{ovr}. contributor.'],
    numberlessCores: ['real value.', 'very solid.', 'strong add.', 'that plays.', 'good contributor.', 'very usable.'],
    tails: ['That can win rounds.', 'Big help.', 'Keep stacking.', 'Good momentum.'],
    templates: ['{open} {core}', '{open} {tail}', '{core} {tail}', '{open} {ovr}!', '{core}'],
    numberlessTemplates: ['{open} {core}', '{open} {tail}', '{core} {tail}', '{open}']
  },
  strong: {
    intensity: 0.86, rate: 0.95, pitch: 0.82, gain: 0.97,
    openers: ['Excellent!', 'Huge add!', 'That is premium!', 'Now that is a pickup!', 'Beautiful.', 'Massive value!'],
    cores: ['{ovr}!', '{ovr}! nasty.', '{ovr}. top-tier impact.', '{ovr}. huge value.'],
    numberlessCores: ['top-tier impact.', 'huge value.', 'massive add.', 'that is premium.', 'beautiful pull.', 'major pickup.'],
    tails: ['That changes the board.', 'Heating up now.', 'Serious momentum.', 'Real weapon.'],
    templates: ['{open} {core}', '{core} {tail}', '{open}', '{open} {ovr}!'],
    numberlessTemplates: ['{open} {core}', '{core} {tail}', '{open}', '{tail}']
  },
  elite: {
    intensity: 0.93, rate: 0.92, pitch: 0.8, gain: 0.99,
    openers: ['AMAZING!', 'MONSTER pull!', 'ELITE!', 'Insane!', 'Unbelievable!', 'WOW!'],
    cores: ['{ovr}!', '{ovr}! absurd.', '{ovr}! elite ceiling.', '{ovr}! monster score.'],
    numberlessCores: ['absurd pull.', 'elite ceiling.', 'monster score.', 'this is huge.', 'ridiculous value.', 'big time add.'],
    tails: ['That can carry.', 'The lobby felt that.', 'Game changer.', 'Championship energy.'],
    templates: ['{open} {core}', '{core} {tail}', '{open} {ovr}!', '{open}'],
    numberlessTemplates: ['{open} {core}', '{core} {tail}', '{open}', '{tail}']
  },
  iconic: {
    intensity: 0.98, rate: 0.88, pitch: 0.78, gain: 1.0,
    openers: ['AMAZING!!', 'ICONIC!!', 'UNREAL!!', 'LEGENDARY!!', 'NO WAY!!', 'ABSURD!!'],
    cores: ['{ovr}!!', '{ovr}! maxed out!', '{ovr}! iconic!', '{ovr}! what a hit!'],
    numberlessCores: ['maxed out energy!', 'iconic pull!', 'what a hit!', 'absolute showstopper!', 'legendary moment!', 'the room felt that!'],
    tails: ['That is the moment!', 'The lobby is stunned!', 'Pure endgame power!', 'Showstopper!'],
    templates: ['{open} {core}', '{core} {tail}', '{open}', '{open} {ovr}!'],
    numberlessTemplates: ['{open} {core}', '{core} {tail}', '{open}', '{tail}']
  }
};

function revealNumberToSpeech(value = 0) {
  const n = Math.max(0, Math.min(99, Math.round(Number(value) || 0)));
  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${tens[t]}-${ones[o]}` : tens[t];
}

function escapeRegexLiteral(text = '') {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashRevealAnnouncerRoll(seed = 0, salt = 0) {
  const value = Math.imul((Number(seed) || 0) ^ (Number(salt) || 0), 1103515245) + 12345;
  return ((value >>> 0) % 10000) / 10000;
}

function getRevealAnnouncerMentionMode({ ovr = 0, bandKey = 'dismissive', seed = 0, queueMeta = null } = {}) {
  const band = String(bandKey || '').toLowerCase();
  const baseMentionChanceByBand = {
    appalled: 0.46,
    unimpressed: 0.24,
    dismissive: 0.1,
    content: 0.12,
    impressed: 0.16,
    strong: 0.24,
    elite: 0.36,
    iconic: 0.72
  };
  let mentionChance = Number(baseMentionChanceByBand[band]);
  if (!Number.isFinite(mentionChance)) mentionChance = 0.16;
  const value = Math.max(0, Math.min(99, Number(ovr) || 0));
  if (value <= 5 || value >= 99) mentionChance += 0.12;
  else if (value <= 12 || value >= 95) mentionChance += 0.08;
  else if (value <= 20 || value >= 90) mentionChance += 0.04;
  if (queueMeta && queueMeta.lowFlood === true && (band === 'appalled' || band === 'unimpressed')) {
    mentionChance += 0.05;
  }
  mentionChance = Math.max(0.03, Math.min(0.92, mentionChance));

  const mentionRoll = hashRevealAnnouncerRoll(seed, 913);
  if (mentionRoll >= mentionChance) return 'none';

  const overallRoll = hashRevealAnnouncerRoll(seed, 1777);
  return overallRoll < 0.5 ? 'overall' : 'number';
}

function injectOverallIntoRevealLine(text = '', ovrSpeech = '', seed = 0, bandKey = 'dismissive') {
  let next = String(text || '').trim();
  const spoken = String(ovrSpeech || '').trim();
  if (!next || !spoken) return next;
  if (/\boverall\b/i.test(next)) return next;
  const re = new RegExp(`\\b${escapeRegexLiteral(spoken)}\\b`, 'i');
  if (!re.test(next)) return next;
  const usePrefix = hashRevealAnnouncerRoll(seed, 2411) < (String(bandKey || '').toLowerCase() === 'iconic' ? 0.35 : 0.5);
  return next.replace(re, usePrefix ? `overall ${spoken}` : `${spoken} overall`);
}

function tuneRevealAnnouncerTextPace(text = '', bandKey = 'dismissive') {
  let next = String(text || '').replace(/\s+/g, ' ').trim();
  if (!next) return '';
  next = next
    .replace(/\bthat is\b/gi, "that's")
    .replace(/\byou got a\b/gi, 'you got')
    .replace(/\belite-level\b/gi, 'elite')
    .replace(/\bgame-changing\b/gi, 'game changer')
    .replace(/\bvery solid\b/gi, 'solid')
    .replace(/\bvaluable addition\b/gi, 'value add');
  next = next
    .replace(/\bthat's that's\b/gi, "that's")
    .replace(/\boverall overall\b/gi, 'overall');

  const maxWordsByBand = {
    appalled: 7,
    unimpressed: 7,
    dismissive: 6,
    content: 7,
    impressed: 8,
    strong: 9,
    elite: 10,
    iconic: 12
  };
  const maxWords = Number(maxWordsByBand[String(bandKey || '').toLowerCase()]) || 8;
  const words = next.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    next = words.slice(0, maxWords).join(' ');
    next = next.replace(/[,:;]+$/g, '').trim();
    if (!/[.!?]$/.test(next)) next += (bandKey === 'dismissive' ? '.' : '!');
  }
  return next;
}

function renderRevealAnnouncerTemplate(template = '', ctx = {}) {
  return String(template || '')
    .replace(/\{ovr\}/g, String(ctx.ovr || 0))
    .replace(/\{open\}/g, String(ctx.open || '').trim())
    .replace(/\{core\}/g, String(ctx.core || '').trim())
    .replace(/\{tail\}/g, String(ctx.tail || '').trim())
    .replace(/\{flood\}/g, String(ctx.flood || '').trim())
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateRevealAnnouncerDurationMs(text = '', rate = 1) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const exclamations = (String(text || '').match(/[!?]/g) || []).length;
  const pauses = (String(text || '').match(/[.,;]/g) || []).length;
  const base = 180 + (words * 145) + (exclamations * 36) + (pauses * 26);
  const scaled = base / Math.max(0.72, Math.min(1.35, Number(rate) || 1));
  return Math.max(220, Math.min(1500, Math.round(scaled)));
}

function getRevealAnnouncerLeadInMs(revealTier = 'bronze', cue = null) {
  const tier = String(revealTier || '').toLowerCase();
  const est = Number(cue && cue.estimatedMs) || 520;
  if (tier === 'elite') return Math.max(200, Math.min(420, Math.round(est * 0.33)));
  if (tier === 'diamond') return Math.max(150, Math.min(320, Math.round(est * 0.28)));
  if (tier === 'gold') return Math.max(120, Math.min(240, Math.round(est * 0.22)));
  if (tier === 'silver') return Math.max(90, Math.min(180, Math.round(est * 0.18)));
  return Math.max(70, Math.min(140, Math.round(est * 0.14)));
}

function getRevealAnnouncerPadMs(revealTier = 'bronze', ovr = 0, cue = null) {
  const tier = String(revealTier || '').toLowerCase();
  const value = Math.max(0, Math.min(99, Number(ovr) || 0));
  const lite = getRevealPerfMode() === 'lite';
  let base = lite ? 70 : 120;
  if (tier === 'silver') base = lite ? 90 : 150;
  if (tier === 'gold') base = lite ? 110 : 180;
  if (tier === 'diamond') base = lite ? 130 : 220;
  if (tier === 'elite') base = lite ? 150 : 260;
  if (value >= 96) base += lite ? 30 : 55;
  else if (value >= 90) base += lite ? 18 : 34;
  return Math.max(40, Math.round(base));
}

function getRevealShowcaseHoldMs(revealTier = 'bronze', ovr = 0, cue = null) {
  const tier = String(revealTier || '').toLowerCase();
  const value = Math.max(0, Math.min(99, Number(ovr) || 0));
  const lite = getRevealPerfMode() === 'lite';
  let base;
  switch (tier) {
    case 'elite':
      base = lite ? 260 : 520;
      break;
    case 'diamond':
      base = lite ? 220 : 440;
      break;
    case 'gold':
      base = lite ? 170 : 320;
      break;
    case 'silver':
      base = lite ? 130 : 220;
      break;
    case 'lowest':
      base = lite ? 70 : 130;
      break;
    default:
      base = lite ? 90 : 170;
      break;
  }
  const ovrLift = value >= 96
    ? (lite ? 80 : 180)
    : value >= 90
      ? (lite ? 50 : 120)
      : value >= 78
      ? (lite ? 30 : 70)
        : 0;
  return Math.max(0, Math.round(base + ovrLift));
}

function buildRevealTierAnnouncerCue(assignment = null, profile = null) {
  const evalData = assignment && assignment.evalData ? assignment.evalData : {};
  const ovr = Math.max(0, Math.min(99, Number(evalData && evalData.ovr) || 0));
  if (!ovr) return null;
  const revealTier = String(profile && profile.revealTier || getRevealTierFromEval(evalData) || 'bronze').toLowerCase();
  const queueMeta = getRevealAnnouncerQueueContext(assignment);
  const seed = (Number(ovr) * 31)
    + (Number(assignment && assignment.teamIndex) * 17)
    + (Number(assignment && assignment.slotIndex) * 13)
    + (String(revealTier).length * 7)
    + (Number(queueMeta && queueMeta.queueIndex) * 5);
  const bandKey = getRevealAnnouncerBandKey(ovr);
  const bank = REVEAL_ANNOUNCER_BANKS[bandKey] || REVEAL_ANNOUNCER_BANKS.dismissive;
  const mentionMode = getRevealAnnouncerMentionMode({ ovr, bandKey, seed, queueMeta });
  const mentionNumber = mentionMode === 'number' || mentionMode === 'overall';
  const open = pickRevealAnnouncerVariant(bank.openers, seed + 1);
  const core = pickRevealAnnouncerVariant(mentionNumber ? bank.cores : (bank.numberlessCores || bank.cores), seed + 3);
  const tail = pickRevealAnnouncerVariant(bank.tails, seed + 5);
  const flood = pickRevealAnnouncerVariant(bank.flood || [], seed + 7);
  const templateSource = mentionNumber
    ? (Array.isArray(bank.templates) ? bank.templates : [])
    : (Array.isArray(bank.numberlessTemplates) && bank.numberlessTemplates.length
      ? bank.numberlessTemplates
      : ['{open} {core}', '{core} {tail}', '{open} {tail}', '{core}']);
  const templatePool = []
    .concat(templateSource)
    .concat((queueMeta && queueMeta.lowFlood && Array.isArray(templateSource) && bandKey !== 'iconic' && bandKey !== 'elite')
      ? (mentionNumber ? ['{flood} {core}', '{open} {flood}', '{flood}'] : ['{flood}', '{open} {flood}', '{flood} {tail}'])
      : []);
  let text = renderRevealAnnouncerTemplate(
    pickRevealAnnouncerVariant(templatePool, seed + 11),
    { ovr, open, core, tail, flood }
  );
  text = String(text || '').replace(/\s+/g, ' ').trim();
  const ovrSpeech = revealNumberToSpeech(ovr);
  if (mentionNumber && !new RegExp(`\\b${ovr}\\b`).test(text)) {
    const numberLead = bandKey === 'appalled' || bandKey === 'unimpressed' || bandKey === 'dismissive'
      ? `${ovrSpeech}.`
      : `${ovrSpeech}!`;
    text = `${numberLead} ${text}`.replace(/\s+/g, ' ').trim();
  } else if (mentionNumber) {
    text = text.replace(new RegExp(`\\b${escapeRegexLiteral(String(ovr))}\\b`, 'g'), ovrSpeech);
  }
  if (mentionMode === 'overall') {
    text = injectOverallIntoRevealLine(text, ovrSpeech, seed + 29, bandKey);
  }
  if (!mentionNumber) {
    text = text
      .replace(new RegExp(`\\b${escapeRegexLiteral(String(ovr))}\\b`, 'gi'), '')
      .replace(new RegExp(`\\b${escapeRegexLiteral(ovrSpeech)}\\b`, 'gi'), '')
      .replace(/\boverall\b/gi, '');
  }
  text = text.replace(/\bOVR\b/gi, '').replace(/\s+/g, ' ').trim();
  text = tuneRevealAnnouncerTextPace(text, bandKey);
  if (text && !/[.!?]$/.test(text)) {
    text += (bandKey === 'dismissive' ? '.' : '!');
  }
  if (!text) return null;
  const intensity = Number(bank.intensity) || 0.8;
  const bandRate = Number(bank.rate) || 0.95;
  const bandPitch = Number(bank.pitch) || 0.84;
  const rate = Math.max(0.86, Math.min(1.34, bandRate + (
    (bandKey === 'appalled' || bandKey === 'unimpressed') ? 0.07
      : bandKey === 'dismissive' ? 0.05
      : bandKey === 'content' ? 0.03
      : bandKey === 'impressed' ? 0.01
      : bandKey === 'strong' ? -0.01
      : bandKey === 'elite' ? -0.03
      : -0.05
  )));
  const pitch = Math.max(0.7, Math.min(1.18, bandPitch + (
    (bandKey === 'appalled' || bandKey === 'unimpressed') ? 0.03
      : bandKey === 'dismissive' ? 0.01
      : bandKey === 'elite' ? -0.02
      : bandKey === 'iconic' ? -0.03
      : 0
  )));
  const adjustedRate = mentionMode === 'none'
    ? Math.min(1.38, rate + (bandKey === 'appalled' || bandKey === 'unimpressed' || bandKey === 'dismissive' ? 0.07 : 0.04))
    : mentionMode === 'overall'
      ? Math.max(0.82, rate - 0.03)
      : rate;
  const adjustedPitch = mentionMode === 'none'
    ? Math.min(1.2, pitch + (bandKey === 'appalled' || bandKey === 'unimpressed' ? 0.03 : 0.01))
    : mentionMode === 'overall'
      ? Math.max(0.68, pitch - 0.01)
      : pitch;
  const estimatedMs = estimateRevealAnnouncerDurationMs(text, adjustedRate);
  const leadInMs = getRevealAnnouncerLeadInMs(revealTier, { estimatedMs });
  return {
    id: `round4-reveal-announcer-v4-${assignment && assignment.key ? assignment.key : `ovr-${ovr}`}`,
    type: 'round4',
    text,
    subtitleText: `Reveal call: ${ovr}`,
    intensity,
    priority: 84 + Math.min(10, Math.max(0, Math.round((ovr - 70) / 3))),
    preempt: true,
    allowLiveGenerate: true,
    dedupeKey: `round4:v4:reveal:announcer:${assignment && assignment.key ? assignment.key : ''}:${ovr}:${bandKey}:${mentionMode}`,
    speechSpec: {
      voiceStyle: 'cinematic',
      rate: adjustedRate,
      pitch: adjustedPitch,
      gain: Number(bank.gain) || (revealTier === 'elite' ? 0.98 : 0.94)
    },
    estimatedMs,
    leadInMs
  };
}

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
  const rawFallbackBase = applyPerfProfileTuning(REVEAL_TIER_PROFILES[fallbackTier] || REVEAL_TIER_PROFILES.bronze);
  const fallbackBase = {
    ...rawFallbackBase,
    anticipationMs: Math.round((Number(rawFallbackBase.anticipationMs) || 280) * 1.12),
    flightMs: Math.round((Number(rawFallbackBase.flightMs) || 900) * 1.17),
    settleMs: Math.round((Number(rawFallbackBase.settleMs) || 260) * 1.14),
    cadencePadMs: Math.round((Number(rawFallbackBase.cadencePadMs) || 140) * 1.22),
    flightArcPx: Math.max(18, Math.round((Number(rawFallbackBase.flightArcPx) || 30) * 0.9)),
    spinDeg: Math.round((Number(rawFallbackBase.spinDeg) || 0) * 0.86)
  };
  const fallbackOvr = Number(assignment && assignment.evalData && assignment.evalData.ovr) || 0;
  const announcerCue = buildRevealTierAnnouncerCue(assignment, { revealTier: fallbackTier });
  const announcePadMs = getRevealAnnouncerPadMs(fallbackTier, fallbackOvr, announcerCue);
  const showcaseHoldMs = getRevealShowcaseHoldMs(fallbackTier, fallbackOvr, announcerCue);
  const profile = assignment && assignment.key ? round4State.revealProfiles[assignment.key] : null;
  if (profile) return profile;

  return {
    ...fallbackBase,
    revealTier: fallbackTier,
    announcerCue,
    showcaseHoldMs,
    announcePadMs,
    offsetMs: (Number(round4State.queueIndex) || 0) * getRevealConfig().stepIntervalMs,
    totalMs: fallbackBase.anticipationMs + showcaseHoldMs + fallbackBase.flightMs + fallbackBase.settleMs + fallbackBase.cadencePadMs + announcePadMs
  };
}

function prepareRevealSequenceProfiles() {
  if (round4State.revealPreparePromise) return round4State.revealPreparePromise;

  const config = getRevealConfig();
  round4State.revealPreparePromise = Promise.resolve().then(() => {
    const nextProfiles = Object.create(null);
    let offsetMs = 0;

    round4State.queue.forEach((assignment, index) => {
      const revealTier = getRevealTierFromEval(assignment && assignment.evalData ? assignment.evalData : null);
      const tunedBase = applyPerfProfileTuning(REVEAL_TIER_PROFILES[revealTier] || REVEAL_TIER_PROFILES.bronze);
      const base = {
        ...tunedBase,
        anticipationMs: Math.round((Number(tunedBase.anticipationMs) || 280) * 1.12),
        flightMs: Math.round((Number(tunedBase.flightMs) || 900) * 1.17),
        settleMs: Math.round((Number(tunedBase.settleMs) || 260) * 1.14),
        cadencePadMs: Math.round((Number(tunedBase.cadencePadMs) || 140) * 1.22),
        flightArcPx: Math.max(18, Math.round((Number(tunedBase.flightArcPx) || 30) * 0.9)),
        spinDeg: Math.round((Number(tunedBase.spinDeg) || 0) * 0.86)
      };
      const announcerCue = buildRevealTierAnnouncerCue(assignment, { revealTier });
      const announcePadMs = getRevealAnnouncerPadMs(revealTier, Number(assignment && assignment.evalData && assignment.evalData.ovr) || 0, announcerCue);
      const showcaseHoldMs = getRevealShowcaseHoldMs(
        revealTier,
        Number(assignment && assignment.evalData && assignment.evalData.ovr) || 0,
        announcerCue
      );
      const totalMs = base.anticipationMs + showcaseHoldMs + base.flightMs + base.settleMs + base.cadencePadMs + announcePadMs;
      const cadence = Math.max(config.stepIntervalMs, Math.round(totalMs * 0.98));
      const periodicPauseMs = ((index + 1) % 3 === 0 ? (getRevealPerfMode() === 'lite' ? 240 : 420) : 0)
        + ((revealTier === 'elite' || revealTier === 'diamond') ? (getRevealPerfMode() === 'lite' ? 180 : 320) : 0);

      nextProfiles[assignment.key] = {
        ...base,
        revealTier,
        announcerCue,
        showcaseHoldMs,
        announcePadMs,
        cadencePauseMs: periodicPauseMs,
        offsetMs,
        totalMs
      };

      offsetMs += cadence + periodicPauseMs;
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
  if (ensureSharedAudioReady()) {
    round4State.revealAudioReady = true;
    return;
  }
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
  const bridge = getSharedAudioBridge();
  if (bridge && typeof bridge.playRound4RevealAccent === 'function') {
    try {
      bridge.playRound4RevealAccent(profile, stage);
      return;
    } catch (error) {
    }
  }
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
  const revealButton = document.getElementById('evalStartRevealBtn');
  if (revealButton) {
    revealButton.classList.toggle('is-near-ready', safePercent >= 78 && !round4State.loadingReadyToStart);
  }

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
  button.classList.toggle('is-ready-live', round4State.loadingReadyToStart);
  button.classList.remove('is-near-ready');

  if (round4State.loadingReadyToStart) {
    button.textContent = 'START REVEAL CEREMONY';
    if (hint) hint.textContent = 'Everything is staged, including announcer callouts. You can start the reveal locally as soon as you are ready.';
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
    if (completion) {
      completion.hidden = true;
      completion.textContent = '0 characters placed';
    }
    if (continueBtn) continueBtn.hidden = true;
  }
  refreshRound4PageUi();
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
  if (!round4State.preloadDone || !round4State.revealPrepared || !round4State.animationPrimed || !round4State.loadingReadyToStart || round4State.rendered || round4State.revealStartTimer) return;

  ensureRevealAudioReady();
  const bridge = getSharedAudioBridge();
  if (bridge && typeof bridge.setMusicScene === 'function') {
    try {
      bridge.setMusicScene('round4Reveal', { force: true, transition: 'crescendo', exclusive: true });
    } catch (error) {
    }
  }

  const loading = document.getElementById('evalLoading');
  const status = document.getElementById('evalFinalStatus');
  if (status) status.textContent = 'Cueing ceremony... spotlights are building with the soundtrack.';
  setRevealCeremonyProgress(100, 'Spotlights warming up');

  if (round4State.revealStartTimer) {
    window.clearTimeout(round4State.revealStartTimer);
    round4State.revealStartTimer = null;
  }

  const ceremonyPreludeMs = 1100;
  round4State.revealStartTimer = window.setTimeout(() => {
    round4State.revealStartTimer = null;
    if (loading) loading.style.display = 'none';
    setRound4LoadingPhase(false);
    setHeaderContextPhase('reveal');
    refreshRound4PageUi();
    if (status) status.textContent = 'Final showdown starting...';

    setLoadingBotContext(null, null, '');
    const kickoffConfig = getRevealConfig();
    round4State.revealConfig = {
      ...(round4State.revealConfig || {}),
      startAtMs: Date.now() + Math.max(1100, Number(kickoffConfig.initialDelayMs) || 0)
    };
    scheduleNextAutoReveal();
    round4State.isEvaluating = false;
    round4State.rendered = true;
  }, ceremonyPreludeMs);
}

function signed(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? `+${numeric}` : `${numeric}`;
}

function formatLockDuration(ms) {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  const totalSeconds = Math.max(1, Math.ceil(numeric / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updatePlacementCompletionBadge(count, total, { final = false } = {}) {
  const badge = document.getElementById('evalCompletionBadge');
  if (!badge) return;

  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCount = Math.max(0, Number(count) || 0);

  if (safeTotal <= 0 || safeCount <= 0) {
    badge.hidden = true;
    return;
  }

  badge.hidden = false;
  if (final || safeCount >= safeTotal) {
    badge.textContent = `${safeTotal} characters placed!`;
    return;
  }

  badge.textContent = `${safeCount} character${safeCount === 1 ? '' : 's'} placed`;
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
  if (round4State.revealStartTimer) {
    window.clearTimeout(round4State.revealStartTimer);
    round4State.revealStartTimer = null;
  }
  teardownRound4PageUi();
  teardownRound4FinaleUi();
  const boards = document.getElementById('evalTeamBoards');
  const hero = document.getElementById('evalHeroHost');
  const leaderboard = document.getElementById('evalLeaderboardContainer');
  if (boards) boards.innerHTML = '';
  if (hero) hero.innerHTML = '';
  if (leaderboard) leaderboard.innerHTML = '';
}

function resetCinematicState() {
  teardownRound4PageUi();
  teardownRound4FinaleUi();
  if (round4State.revealTimer) {
    window.clearTimeout(round4State.revealTimer);
    round4State.revealTimer = null;
  }
  if (round4State.cinematicRenderTimer) {
    window.clearTimeout(round4State.cinematicRenderTimer);
    round4State.cinematicRenderTimer = null;
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
  round4State.revealAnnouncerWarmPromise = null;
  round4State.revealAnnouncerWarmDone = false;
  round4State.revealPrepared = false;
  round4State.revealPreparePromise = null;
  round4State.animationPrimePromise = null;
  round4State.animationPrimed = false;
  round4State.revealProfiles = Object.create(null);
  clearQueuedAnimationTimers();
  round4State.teamBoardCollapsed = Object.create(null);
  round4State.loadingScenario = '';
  round4State.loadingTwist = '';
  round4State.pendingLoadingReadyVoiceCue = null;
  round4State.pendingLoadingReadyVoiceCueEvalId = null;
  round4State.loadingReadyVoiceSpokenEvalId = null;
  round4State.pageCollapsed = Object.create(null);
  round4State.pageLastTouchedAt = Object.create(null);
  round4State.pageNavActive = 'cards';
  round4State.pageNavMenuOpen = false;

  const boards = document.getElementById('evalTeamBoards');
  if (boards) boards.classList.remove('is-elite-crash');

  setHeaderContextPhase('loading');
  setRound4LoadingPhase(true);

  setLoadingReadyState(false);

  const completion = document.getElementById('evalCompletionBadge');
  const status = document.getElementById('evalFinalStatus');
  const continueBtn = document.getElementById('evalContinueBtn');
  if (completion) {
    completion.hidden = true;
    completion.textContent = '0 characters placed';
  }
  if (status) status.textContent = 'Preparing the final showdown...';
  if (continueBtn) {
    continueBtn.hidden = true;
    continueBtn.disabled = true;
    continueBtn.textContent = 'LOCK IN & CONTINUE';
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
  refreshRound4PageUi();

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
              <span class="eval-docked-ovr ${tierClass}">OVR ${Number(evalData.ovr) || 0} | ${escapeHtml(evalData.evalTraceBadge || 'LG')}</span>
            </span>
          </button>
        </div>
      `;
    }).join('');

    return `
      <section class="eval-team-board ${boardStateClass(filled)} ${isFocus ? 'is-focus' : ''} ${isMuted ? 'is-muted' : ''} ${isCollapsed ? 'is-collapsed' : ''}" data-team-board="${team.teamIndex}" data-filled="${filled}">
        <header class="eval-team-board-head">
          <h3 class="${teamTierClass}">${escapeHtml(team.playerName)}</h3>
          <p>${filled}/6 placed | Team OVR ${Number(team.teamSummary && team.teamSummary.totalOVR) || 0}</p>
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

  host.innerHTML = `
    <article id="evalActivePlaque" class="eval-active-plaque ${tierClass} reveal-tier-${getRevealTierFromEval(evalData)}" data-reveal-tier="${getRevealTierFromEval(evalData)}" aria-live="polite">
      <div class="eval-active-head">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(evalData.character || 'Character')} portrait" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';">
        <div>
          <h3 class="${tierClass}">${escapeHtml(evalData.character || 'Unknown')}</h3>
          <p>${escapeHtml(evalData.roleType || 'Balanced')} | ${escapeHtml(evalData.rarity || 'Common')}</p>
          <p>${escapeHtml(evalData.evalEngineMode || 'legacy')} | ${escapeHtml(evalData.evalTraceStatusLabel || evalData.evalTraceStatus || 'n/a')} | ${escapeHtml(evalData.evalTrustLabel || `Trust ${Number(evalData.evalTrustPct) || 0}%`)}</p>
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
    </article>
  `;

  const ovrButton = host.querySelector('.eval-active-ovr-btn');
  if (ovrButton) {
    const primeBlurb = () => {
      try {
        prefetchSharedCharacterCardBlurbs([evalData], {
          context: 'ovr-button-prime',
          maxEntries: 1,
          warmTop: 1,
          voiceWarmTop: 1,
          immediate: true
        });
      } catch (_error) {}
    };
    ovrButton.addEventListener('pointerenter', primeBlurb, { once: true });
    ovrButton.addEventListener('focus', primeBlurb, { once: true });
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

  const initialDelayMs = Math.max(liteMode ? 1200 : 1500, Math.round((Number(incoming.initialDelayMs) || 3300) * (liteMode ? 1.12 : 1.22)));
  const stepIntervalMs = Math.max(liteMode ? 2600 : 3200, Math.round((Number(incoming.stepIntervalMs) || 3050) * (liteMode ? 1.12 : 1.25)));
  const dockDurationMs = Math.max(liteMode ? 1300 : 1650, Math.round((Number(incoming.dockDurationMs) || 1450) * (liteMode ? 1.08 : 1.16)));
  const finalResultsDelayMs = Math.max(liteMode ? 1700 : 2200, Math.round((Number(incoming.finalResultsDelayMs) || 2850) * (liteMode ? 1.08 : 1.18)));
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

function prepareRevealAnnouncerVoiceWarmup() {
  if (round4State.revealAnnouncerWarmPromise) return round4State.revealAnnouncerWarmPromise;

  const cues = (Array.isArray(round4State.queue) ? round4State.queue : [])
    .slice(0, 24)
    .map((assignment) => buildRevealTierAnnouncerCue(assignment, null))
    .filter(Boolean);

  if (!cues.length) {
    round4State.revealAnnouncerWarmDone = true;
    round4State.revealAnnouncerWarmPromise = Promise.resolve({ ok: true, skipped: true, reason: 'no-announcer-cues' });
    return round4State.revealAnnouncerWarmPromise;
  }

  round4State.revealAnnouncerWarmDone = false;
  round4State.revealAnnouncerWarmPromise = Promise.race([
    Promise.resolve().then(async () => {
    const perfMode = getRevealPerfMode();
    const warmLimit = Math.max(4, Math.min(cues.length, 24));
    const warmConcurrency = perfMode === 'lite' ? 3 : 5;
    setRevealCeremonyProgress(62, 'Warming announcer callouts');
    setLoadingBotContext(null, null, `Warming announcer callouts (${warmLimit}/${cues.length})...`);

    let warmResult = null;
    const directWarm = warmSharedVoiceCuesNow(cues, {
      source: 'round4-reveal-announcer',
      limit: warmLimit,
      concurrency: warmConcurrency,
      preserveOrder: true,
      onProgress: (progress = {}) => {
        const done = Math.max(0, Number(progress.done) || 0);
        const total = Math.max(1, Number(progress.total) || warmLimit);
        const pct = Math.round((done / total) * 100);
        setRevealCeremonyProgress(62 + Math.round(pct * 0.2), `Warming announcer callouts ${done}/${total}`);
        setLoadingBotContext(null, null, `Priming announcer callouts ${done}/${total}...`);
      }
    });

    if (directWarm && typeof directWarm.then === 'function') {
      warmResult = await directWarm.catch(() => null);
    } else {
      warmResult = { ok: true, deferred: true, unique: cues.length };
      prefetchSharedVoiceCues(cues, { source: 'round4-reveal-announcer', delayMs: 0 });
    }

    prefetchSharedVoiceCues(cues, { source: 'round4-reveal-announcer-tail', delayMs: 0 });
    round4State.revealAnnouncerWarmDone = true;
    setRevealCeremonyProgress(82, 'Announcer callouts primed');
    setLoadingBotContext(null, null, 'Announcer callouts primed for the reveal.');
    return warmResult || { ok: true, unique: cues.length };
  }).catch(() => {
    round4State.revealAnnouncerWarmDone = true;
    prefetchSharedVoiceCues(cues, { source: 'round4-reveal-announcer-fallback', delayMs: 0 });
    setRevealCeremonyProgress(78, 'Announcer callouts queued');
    setLoadingBotContext(null, null, 'Announcer callouts queued. Remaining warmup will continue in the background.');
    return { ok: false, reason: 'announcer-warm-failed' };
  }),
    new Promise((resolve) => {
      const warmupTimeoutMs = Math.max(
        5200,
        getRevealPerfMode() === 'lite'
          ? 6200 + Math.round(cues.length * 110)
          : 7600 + Math.round(cues.length * 90)
      );
      window.setTimeout(() => {
        if (!round4State.revealAnnouncerWarmDone) {
          round4State.revealAnnouncerWarmDone = true;
          prefetchSharedVoiceCues(cues, { source: 'round4-reveal-announcer-timeout-tail', delayMs: 0 });
          setRevealCeremonyProgress(78, 'Announcer callouts queued');
          setLoadingBotContext(null, null, 'Continuing setup... announcer callouts will finish warming in the background.');
        }
        resolve({ ok: false, timedOut: true, reason: 'announcer-warm-timeout' });
      }, warmupTimeoutMs);
    })
  ]);

  return round4State.revealAnnouncerWarmPromise;
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
    updatePlacementCompletionBadge(round4State.queue.length, round4State.queue.length, { final: true });
  }
  if (status) status.textContent = 'Reveal complete. Lock this result when your team is ready.';

  const continueBtn = document.getElementById('evalContinueBtn');
  if (continueBtn) {
    continueBtn.hidden = false;
    continueBtn.disabled = false;
    continueBtn.textContent = 'LOCK IN & CONTINUE';
  }

  const bridge = getSharedAudioBridge();
  if (bridge && typeof bridge.setMusicScene === 'function') {
    try {
      bridge.setMusicScene('round4Bg', { force: true, transition: 'ceremony-to-round4', exclusive: true });
    } catch (error) {
    }
  }

  renderFinalLeaderboard();
}

function animateDockTransition(assignment, onDone) {
  const profile = getRevealProfileForAssignment(assignment);
  const showcaseHoldMs = Math.max(0, Number(profile && profile.showcaseHoldMs) || 0);
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
  active.style.setProperty('--reveal-showcase-ms', `${showcaseHoldMs}ms`);
  {
    const hoverSeed = (
      (Number(assignment && assignment.teamIndex) * 17)
      + (Number(assignment && assignment.slotIndex) * 13)
      + (Number(assignment && assignment.evalData && assignment.evalData.ovr) || 0) * 7
    );
    const tilt = ((((hoverSeed % 9) - 4) * 0.45) || 0.35);
    const driftX = (((Math.floor(hoverSeed / 3) % 7) - 3) * 1.3);
    const driftY = -1 * (2 + ((Math.floor(hoverSeed / 5) % 4)));
    const scale = 1.008 + ((hoverSeed % 4) * 0.006);
    const durationMs = Math.max(520, Math.min(1450, Math.round(showcaseHoldMs * 0.56) || 760));
    active.style.setProperty('--reveal-hover-tilt', `${tilt.toFixed(2)}deg`);
    active.style.setProperty('--reveal-hover-drift-x', `${driftX.toFixed(1)}px`);
    active.style.setProperty('--reveal-hover-drift-y', `${driftY.toFixed(1)}px`);
    active.style.setProperty('--reveal-hover-scale', `${scale.toFixed(3)}`);
    active.style.setProperty('--reveal-hover-ms', `${durationMs}ms`);
  }

  if (host) {
    sanitizeRevealTierClassList(host.classList);
    host.classList.add(`reveal-tier-${profile.revealTier}`);
    host.style.setProperty('--reveal-showcase-ms', `${showcaseHoldMs}ms`);
    if (profile.spotlight) {
      host.classList.add('is-spotlight');
    }
  }

  const announcerCueBase = (profile && profile.announcerCue) ? { ...profile.announcerCue } : buildRevealTierAnnouncerCue(assignment, profile);
  let announcerHoldWait = null;
  if (announcerCueBase) {
    const startOffsetMs = showcaseHoldMs > 0
      ? Math.max(30, Math.min(160, Math.round(showcaseHoldMs * 0.1)))
      : 0;
    const announcerDelayMs = Math.max(0, Number(profile.anticipationMs || 0) + startOffsetMs);
    announcerCueBase.delayMs = announcerDelayMs;
    announcerCueBase.allowLiveGenerate = true;
    const announcerTimeoutMs = Math.max(
      showcaseHoldMs + 620,
      Number(announcerCueBase.estimatedMs || 0) + Number(announcerCueBase.leadInMs || 0) + 1100,
      Number(announcerCueBase.delayMs || 0) + 950
    );
    announcerHoldWait = waitForSharedVoiceCueCompletion(announcerCueBase, {
      timeoutMs: announcerTimeoutMs,
      minHoldMs: showcaseHoldMs,
      startTimeoutMs: Math.max(
        announcerTimeoutMs + 700,
        Number(announcerCueBase.delayMs || 0) + Number(announcerCueBase.estimatedMs || 0) + 1800
      )
    });
    enqueueSharedVoiceCues([announcerCueBase], { clear: false });
  }

  let launchedToSlot = false;
  const launchToSlot = () => {
    if (launchedToSlot) return;
    launchedToSlot = true;
    if (!round4State.transitionRunning || round4State.currentAssignment !== assignment) return;
    const startRect = active.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const clone = active.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.remove('is-reveal-anticipating');
    clone.classList.remove('is-reveal-showcasing');
    clone.classList.add('eval-flight-clone', `reveal-tier-${profile.revealTier}`);
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;
    clone.style.transform = 'translate3d(0,0,0) rotate(0deg) scale(1)';
    clone.style.opacity = '1';
    document.body.appendChild(clone);

    active.style.visibility = 'hidden';
    active.classList.remove('is-reveal-showcasing');
    active.classList.remove('is-reveal-anticipating');
    if (host) host.classList.remove('is-showcase-hold');
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
      if (host) {
        sanitizeRevealTierClassList(host.classList);
      }
      triggerSlotImpact(target, profile);
      triggerPoolCrashEffects(assignment, profile);
      playEliteRevealAudio(profile, 'impact');
      const announcePadMs = Math.max(0, Number(profile && profile.announcePadMs) || 0);
      if (announcePadMs > 0) {
        setAnimTimer(() => onDone(), announcePadMs);
      } else {
        onDone();
      }
    }, profile.flightMs + 12);
  };

  setAnimTimer(() => {
    if (showcaseHoldMs > 0) {
      active.classList.add('is-reveal-showcasing');
      if (host) host.classList.add('is-showcase-hold');
      if (announcerHoldWait && typeof announcerHoldWait.then === 'function') {
        Promise.resolve(announcerHoldWait).finally(() => {
          launchToSlot();
        });
      } else {
        setAnimTimer(launchToSlot, showcaseHoldMs);
      }
      return;
    }
    launchToSlot();
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
    updatePlacementCompletionBadge(round4State.placements.length, round4State.queue.length);
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

  let resultsMount = container.querySelector('.eval-round4-results-mount');
  if (!resultsMount) {
    resultsMount = document.createElement('div');
    resultsMount.className = 'eval-round4-results-mount';
    container.prepend(resultsMount);
  }

  resultsMount.innerHTML = `
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
                <p class="eval-lb-sub">Team OVR ${Number(row && row.totalOVR) || 0} | Chemistry ${signed(Number(row && row.chemistryBonus) || 0)}</p>
              </div>
              <div class="eval-lb-top-pick">
                <img src="${escapeHtml(topPickImage)}" alt="${escapeHtml(row && row.topPick ? row.topPick : 'Top pick')} portrait" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';">
                <div>
                  <small>Top Pick</small>
                  <strong class="${tierClass}">${escapeHtml(row && row.topPick ? row.topPick : 'N/A')}</strong>
                </div>
              </div>
              <div class="eval-lb-stats">
                <span class="eval-lb-stat-chip stat-ovr-cum"><small>OVR CUM &#x1F4A6;</small><b>${safeCumulativeOVR}</b></span>
                <span class="eval-lb-stat-chip stat-ovr-avg"><small>OVR AVG &#x1F9E2;</small><b>${averageOVR}</b></span>
                <span class="eval-lb-stat-chip stat-lock"><small>FASTEST LOCK &#x1F512;</small><b>${fastestLock}</b></span>
                <span class="eval-lb-stat-chip stat-r4"><small>R4 PTS &#x1FAF5;</small><b>${roundPoints}</b></span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
  refreshRound4PageUi();
}

function isRound4EvalScreenActive() {
  const screen = document.getElementById('round4EvalScreen');
  return Boolean(screen && screen.classList.contains('active'));
}

function teardownRound4PageUi() {
  if (round4State.pageObserver && typeof round4State.pageObserver.disconnect === 'function') {
    try {
      round4State.pageObserver.disconnect();
    } catch (error) {
    }
  }
  round4State.pageObserver = null;
  if (round4State.pageAutoCollapseTimer) {
    window.clearTimeout(round4State.pageAutoCollapseTimer);
    round4State.pageAutoCollapseTimer = null;
  }
}

function ensureRound4PageNavigator() {
  const screen = document.getElementById('round4EvalScreen');
  if (!screen) return null;
  let shell = screen.querySelector('.eval-page-nav-shell');
  if (shell) return shell;

  shell = document.createElement('div');
  shell.className = 'eval-page-nav-shell';
  shell.hidden = true;
  shell.innerHTML = `
    <button type="button" class="eval-page-nav-edge-tab" data-page-menu-toggle aria-label="Toggle Round 4 section navigator" aria-expanded="false">
      <span aria-hidden="true">&#9776;</span>
      <span>Sections</span>
    </button>
    <div class="eval-page-nav-rail">
      <div class="eval-page-nav-head">
        <button type="button" class="eval-page-nav-hamburger" data-page-menu-toggle aria-label="Toggle Round 4 section navigator" aria-expanded="false">
          <span aria-hidden="true">&#9776;</span>
          <span>Sections</span>
        </button>
      </div>
      <div class="eval-page-nav" role="tablist" aria-label="Round 4 page sections"></div>
      <button type="button" class="eval-page-nextcue" data-page-next aria-label="Scroll to next section">
        <span class="eval-page-nextcue-label">Scroll for results</span>
        <strong class="eval-page-nextcue-target">Round 4 Results</strong>
        <em aria-hidden="true">&#x2193;</em>
      </button>
    </div>
  `;

  const header = screen.querySelector('.eval-header-sticky');
  if (header && header.parentNode) {
    header.insertAdjacentElement('afterend', shell);
  } else {
    screen.insertAdjacentElement('afterbegin', shell);
  }
  return shell;
}

function getRound4PageSectionEntries() {
  const screen = document.getElementById('round4EvalScreen');
  const resultsContainer = document.getElementById('evalLeaderboardContainer');
  const cardsNode = screen ? screen.querySelector('.eval-cinematic-stage') : null;
  const resultsNode = resultsContainer ? (resultsContainer.querySelector('.eval-round4-results-mount') || null) : null;
  const finaleNode = resultsContainer ? (resultsContainer.querySelector('.eval-finale-ceremony') || null) : null;

  return [
    {
      id: 'cards',
      label: 'Player Cards',
      icon: '&#x1F0CF;',
      node: cardsNode,
      available: Boolean(cardsNode),
      collapsible: Boolean(cardsNode) && !screen?.classList.contains('is-loading-phase') && Boolean(round4State.sequenceComplete || finaleNode)
    },
    {
      id: 'results',
      label: 'Round 4 Results',
      icon: '&#x1F4CA;',
      node: resultsNode,
      available: Boolean(resultsNode),
      collapsible: Boolean(resultsNode)
    },
    {
      id: 'finale',
      label: 'Final Results',
      icon: '&#x1F3C6;',
      node: finaleNode,
      available: Boolean(finaleNode),
      collapsible: false
    }
  ];
}

function setRound4PageSectionCollapsed(sectionId, shouldCollapse) {
  const entries = getRound4PageSectionEntries();
  const entry = entries.find((item) => item.id === sectionId);
  if (!entry || !entry.node || !entry.collapsible) return false;

  const collapsed = Boolean(shouldCollapse);
  round4State.pageCollapsed[sectionId] = collapsed;
  entry.node.classList.toggle('is-page-collapsed', collapsed);
  entry.node.setAttribute('data-page-collapsed', collapsed ? 'true' : 'false');
  return true;
}

function refreshRound4PageUi() {
  const shell = ensureRound4PageNavigator();
  const screen = document.getElementById('round4EvalScreen');
  if (!shell || !screen) return;

  teardownRound4PageUi();

  const isVisible = screen.classList.contains('active') && !screen.classList.contains('is-loading-phase');
  shell.hidden = !isVisible;
  if (!isVisible) return;

  const entries = getRound4PageSectionEntries();
  const nav = shell.querySelector('.eval-page-nav');
  const nextCue = shell.querySelector('[data-page-next]');
  const menuToggles = Array.from(shell.querySelectorAll('[data-page-menu-toggle]'));
  if (!nav) return;

  const headerNode = screen.querySelector('.eval-header-sticky');
  const headerOffset = Math.max(54, Math.round(headerNode?.getBoundingClientRect?.().height || 0));
  shell.style.setProperty('--eval-page-header-offset', `${headerOffset}px`);

  const compactNavMode = window.innerWidth <= 900;
  if (!compactNavMode) round4State.pageNavMenuOpen = false;
  shell.classList.toggle('is-menu-open', Boolean(round4State.pageNavMenuOpen) && compactNavMode);
  menuToggles.forEach((menuToggle) => {
    menuToggle.setAttribute('aria-expanded', (Boolean(round4State.pageNavMenuOpen) && compactNavMode) ? 'true' : 'false');
    if (menuToggle.getAttribute('data-bound') !== 'true') {
      menuToggle.addEventListener('click', () => {
        round4State.pageNavMenuOpen = !round4State.pageNavMenuOpen;
        refreshRound4PageUi();
      });
      menuToggle.setAttribute('data-bound', 'true');
    }
  });

  nav.innerHTML = entries.map((entry) => `
    <div class="eval-page-nav-item ${entry.available ? '' : 'is-disabled'} ${entry.collapsible ? 'has-fold' : 'no-fold'}" data-page-item="${entry.id}">
      <button
        type="button"
        class="eval-page-nav-btn"
        role="tab"
        aria-selected="${entry.id === round4State.pageNavActive ? 'true' : 'false'}"
        data-page-target="${entry.id}"
        ${entry.available ? '' : 'disabled'}
      >
        <span class="eval-page-nav-ico" aria-hidden="true">${entry.icon}</span>
        <span class="eval-page-nav-text">${entry.label}</span>
      </button>
      ${entry.collapsible ? `
        <button
          type="button"
          class="eval-page-nav-fold"
          data-page-toggle="${entry.id}"
          aria-label="${(round4State.pageCollapsed[entry.id] ? 'Expand' : 'Collapse')} ${entry.label}"
          aria-pressed="${round4State.pageCollapsed[entry.id] ? 'true' : 'false'}"
        >
          <span class="eval-page-nav-fold-pointer" aria-hidden="true">&#x2192;</span>
          <span class="eval-page-nav-fold-label">${round4State.pageCollapsed[entry.id] ? 'Expand' : 'Collapse'}</span>
          <span class="eval-page-nav-fold-icon" aria-hidden="true">${round4State.pageCollapsed[entry.id] ? '&#x003E;' : '&#x25BE;'}</span>
        </button>
      ` : ''}
    </div>
  `).join('');

  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const availableEntries = entries.filter((entry) => entry.available && entry.node);

  const updateActive = (id) => {
    if (!id) return;
    round4State.pageNavActive = id;
    nav.querySelectorAll('.eval-page-nav-btn').forEach((button) => {
      const active = (button.getAttribute('data-page-target') || '') === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (nextCue) {
      const sequence = availableEntries.map((entry) => entry.id);
      const currentIndex = sequence.indexOf(id);
      const nextId = currentIndex >= 0 ? sequence[currentIndex + 1] : sequence[0];
      const nextEntry = availableEntries.find((entry) => entry.id === nextId) || availableEntries[0];
      const canShowNext = Boolean(nextEntry && nextEntry.id && nextEntry.id !== id);
      nextCue.hidden = !canShowNext;
      if (canShowNext) {
        nextCue.setAttribute('data-page-next-target', nextEntry.id);
        const labelEl = nextCue.querySelector('.eval-page-nextcue-label');
        const targetEl = nextCue.querySelector('.eval-page-nextcue-target');
        const arrowEl = nextCue.querySelector('em');
        const wrapsToTop = currentIndex >= 0 && currentIndex === (sequence.length - 1);
        if (labelEl) {
          labelEl.textContent = wrapsToTop
            ? 'Scroll up for player cards'
            : (id === 'cards' ? 'Scroll for results' : 'Scroll for final verdict');
        }
        if (targetEl) targetEl.textContent = nextEntry.label;
        if (arrowEl) arrowEl.innerHTML = wrapsToTop ? '&#x2191;' : '&#x2193;';
        nextCue.setAttribute('data-scroll-direction', wrapsToTop ? 'up' : 'down');
        nextCue.setAttribute('aria-label', wrapsToTop ? 'Scroll to previous section' : 'Scroll to next section');
      }
    }
  };

  const markTouched = (id) => {
    round4State.pageLastTouchedAt[id] = Date.now();
  };

  const scheduleAutoCollapse = (focusId) => {
    if (round4State.pageAutoCollapseTimer) {
      window.clearTimeout(round4State.pageAutoCollapseTimer);
    }
    round4State.pageAutoCollapseTimer = window.setTimeout(() => {
      const compactMode = window.innerWidth <= 900;
      if (!compactMode) {
        round4State.pageAutoCollapseTimer = null;
        return;
      }
      const now = Date.now();
      availableEntries.forEach((entry) => {
        if (entry.id === focusId || !entry.collapsible) return;
        if (entry.id === 'finale') return;
        const touchedAt = Number(round4State.pageLastTouchedAt[entry.id]) || 0;
        if ((now - touchedAt) < 2600) return;
        if (entry.node.getAttribute('data-in-view') === 'true') return;
        setRound4PageSectionCollapsed(entry.id, true);
      });
      round4State.pageAutoCollapseTimer = null;
    }, 2000);
  };

  const scrollToPageSection = (id) => {
    const target = availableEntries.find((entry) => entry.id === id);
    if (!target || !target.node) return;
    setRound4PageSectionCollapsed(id, false);
    markTouched(id);
    updateActive(id);
    scheduleAutoCollapse(id);
    try {
      target.node.scrollIntoView(reducedMotion ? { block: 'start' } : { behavior: 'smooth', block: 'start' });
    } catch (error) {
    }
  };

  if (!round4State.pageNavGlobalHandlersBound) {
    document.addEventListener('pointerdown', (event) => {
      if (!round4State.pageNavMenuOpen || window.innerWidth > 900) return;
      if (!shell || shell.hidden) return;
      const target = event && event.target;
      if (target && shell.contains(target)) return;
      round4State.pageNavMenuOpen = false;
      refreshRound4PageUi();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (!round4State.pageNavMenuOpen || window.innerWidth > 900) return;
      if (!event || event.key !== 'Escape') return;
      round4State.pageNavMenuOpen = false;
      refreshRound4PageUi();
    });

    window.addEventListener('resize', () => {
      if (!isRound4EvalScreenActive()) return;
      refreshRound4PageUi();
    }, { passive: true });

    round4State.pageNavGlobalHandlersBound = true;
  }

  nav.querySelectorAll('.eval-page-nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      if (compactNavMode) round4State.pageNavMenuOpen = false;
      scrollToPageSection(button.getAttribute('data-page-target') || 'cards');
    });
  });

  nav.querySelectorAll('.eval-page-nav-fold').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = button.getAttribute('data-page-toggle') || '';
      if (!id) return;
      const current = Boolean(round4State.pageCollapsed[id]);
      const changed = setRound4PageSectionCollapsed(id, !current);
      if (!changed) return;
      markTouched(id);
      if (compactNavMode) round4State.pageNavMenuOpen = false;
      refreshRound4PageUi();
    });
  });

  if (nextCue) {
    nextCue.addEventListener('click', () => {
      const targetId = nextCue.getAttribute('data-page-next-target') || '';
      if (targetId) scrollToPageSection(targetId);
    });
  }

  availableEntries.forEach((entry) => {
    if (!entry.collapsible) {
      round4State.pageCollapsed[entry.id] = false;
    }
    const isCollapsed = entry.collapsible ? Boolean(round4State.pageCollapsed[entry.id]) : false;
    entry.node.setAttribute('data-page-section-id', entry.id);
    entry.node.classList.toggle('is-page-collapsed', isCollapsed);
    entry.node.setAttribute('data-page-collapsed', isCollapsed ? 'true' : 'false');
    if (entry.node.getAttribute('data-page-touch-bound') !== 'true') {
      ['pointerenter', 'focusin', 'click'].forEach((eventName) => {
        entry.node.addEventListener(eventName, () => markTouched(entry.id), { passive: true });
      });
      entry.node.setAttribute('data-page-touch-bound', 'true');
    }
  });

  if (typeof IntersectionObserver === 'function' && availableEntries.length) {
    round4State.pageObserver = new IntersectionObserver((observerEntries) => {
      observerEntries.forEach((observerEntry) => {
        const node = observerEntry.target;
        const id = node.getAttribute('data-page-section-id') || '';
        if (!id) return;
        const inView = observerEntry.isIntersecting && observerEntry.intersectionRatio >= 0.18;
        node.setAttribute('data-in-view', inView ? 'true' : 'false');
        if (inView) updateActive(id);
      });
    }, { threshold: [0.18, 0.35, 0.55], rootMargin: '-10% 0px -35% 0px' });

    availableEntries.forEach((entry) => {
      try {
        round4State.pageObserver.observe(entry.node);
      } catch (error) {
      }
    });
  }

  const preferredActive = availableEntries.find((entry) => entry.id === round4State.pageNavActive)
    || availableEntries[0]
    || entries[0];
  if (preferredActive) updateActive(preferredActive.id);
}

function teardownRound4FinaleUi() {
  if (round4State.finaleObserver && typeof round4State.finaleObserver.disconnect === 'function') {
    try {
      round4State.finaleObserver.disconnect();
    } catch (error) {
    }
  }
  round4State.finaleObserver = null;
  if (round4State.finaleAutoCollapseTimer) {
    window.clearTimeout(round4State.finaleAutoCollapseTimer);
    round4State.finaleAutoCollapseTimer = null;
  }
  round4State.finaleLastTouchedAt = Object.create(null);
}

function getRound4FinaleVerdictTier(teamOVR, margin, rarityScore) {
  const safeOVR = Number(teamOVR) || 0;
  const safeMargin = Number.isFinite(Number(margin)) ? Number(margin) : 0;
  const safeRarity = Number(rarityScore) || 0;
  const score = (safeOVR * 1.1) + (safeMargin * 1.4) + (safeRarity * 0.35);
  if (score >= 135 || safeOVR >= 94) return 'tier-elite';
  if (score >= 112 || safeOVR >= 88) return 'tier-diamond';
  if (score >= 92 || safeOVR >= 82) return 'tier-gold';
  if (score >= 74 || safeOVR >= 74) return 'tier-azure';
  return 'tier-iron';
}

function getFinalStandingRankFlavor(index) {
  if (index === 0) return { medal: '&#x1F947;', accent: 'gold', vibe: 'Champion Lock' };
  if (index === 1) return { medal: '&#x1F948;', accent: 'silver', vibe: 'Runner Pressure' };
  if (index === 2) return { medal: '&#x1F949;', accent: 'bronze', vibe: 'Podium Hold' };
  if (index <= 4) return { medal: '&#x2728;', accent: 'top', vibe: 'Strong Finish' };
  return { medal: '&#x1F3AF;', accent: 'base', vibe: 'Final Board' };
}

function getFinalStandingTopPickMeta(entry) {
  const safeName = String(entry && entry.name ? entry.name : '');
  const round4Row = Array.isArray(round4State.finalLeaderboard)
    ? round4State.finalLeaderboard.find((row) => String(row && row.playerName ? row.playerName : '') === safeName)
    : null;

  const topPick = String(
    (entry && entry.topPick) || (round4Row && round4Row.topPick) || 'No Pick'
  );
  const imageUrl = getLeaderboardTopPickImage({
    ...(round4Row || {}),
    playerName: (round4Row && round4Row.playerName) || safeName,
    topPick,
    topPickImageUrl: (entry && entry.topPickImageUrl) || (round4Row && round4Row.topPickImageUrl) || ''
  });

  return { topPick, imageUrl };
}

function getFinalStandingEmotionMeta(entry, index, championScore) {
  const score = Number(entry && entry.score) || 0;
  const gap = Math.max(0, (Number(championScore) || 0) - score);
  let key = 'neutral';

  if (index === 0) {
    key = gap >= 40 ? 'mindBlown' : 'happy';
  } else if (index === 1) {
    key = gap <= 12 ? 'amazed' : gap <= 28 ? 'neutral' : 'disappointed';
  } else if (index === 2) {
    key = gap <= 20 ? 'amazed' : 'confused';
  } else if (gap >= 50) {
    key = 'mad';
  } else if (gap >= 28) {
    key = 'disappointed';
  } else if (gap >= 16) {
    key = 'confused';
  } else {
    key = 'neutral';
  }

  const labels = {
    happy: 'Happy',
    mindBlown: 'Mind blown',
    amazed: 'Amazed',
    neutral: 'Neutral',
    confused: 'Confused',
    disappointed: 'Disappointed',
    mad: 'Mad'
  };

  return {
    key,
    label: labels[key] || 'Emotion',
    src: `/img/emotions/${key}.png`
  };
}

function bindRound4FinaleUi(root) {
  if (!root) return;
  teardownRound4FinaleUi();

  const tabs = Array.from(root.querySelectorAll('.eval-finale-spotlight-tab'));
  const sections = Array.from(root.querySelectorAll('.eval-finale-panel'));
  const spotlightPanels = Array.from(root.querySelectorAll('.eval-finale-panel[data-finale-spotlight="true"]'));
  const pinnedPanels = Array.from(root.querySelectorAll('.eval-finale-panel[data-finale-pinned="true"]'));
  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let activeSectionId = spotlightPanels[0] ? (spotlightPanels[0].getAttribute('data-finale-section') || 'overview') : 'standings';

  const updateTabs = (sectionId) => {
    activeSectionId = sectionId || activeSectionId;
    tabs.forEach((tab) => {
      const isActive = (tab.getAttribute('data-finale-target') || '') === activeSectionId;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    root.setAttribute('data-active-spotlight', activeSectionId);
  };

  const closeLessRelevantSections = (keepId) => {
    const now = Date.now();
    const compactMode = window.innerWidth <= 900;
    spotlightPanels.forEach((panel) => {
      const id = panel.getAttribute('data-finale-section') || '';
      if (!id || id === keepId) return;
      if (!panel.open) return;
      const touchedAt = Number(round4State.finaleLastTouchedAt[id]) || 0;
      const justTouched = (now - touchedAt) < 3500;
      const inViewport = panel.getAttribute('data-in-view') === 'true';
      if (justTouched) return;
      if (compactMode || !inViewport) {
        panel.open = false;
      }
    });
  };

  const scheduleSmartCollapse = (focusId) => {
    if (!spotlightPanels.length) return;
    if (round4State.finaleAutoCollapseTimer) {
      window.clearTimeout(round4State.finaleAutoCollapseTimer);
    }
    round4State.finaleAutoCollapseTimer = window.setTimeout(() => {
      closeLessRelevantSections(focusId || activeSectionId);
      round4State.finaleAutoCollapseTimer = null;
    }, 2600);
  };

  const openAndFocusSection = (sectionId, { shouldScroll = true } = {}) => {
    const panel = sections.find((item) => (item.getAttribute('data-finale-section') || '') === sectionId);
    if (!panel) return;
    const isSpotlight = panel.getAttribute('data-finale-spotlight') === 'true';
    if (typeof panel.open === 'boolean') {
      panel.open = true;
    }
    if (isSpotlight) {
      spotlightPanels.forEach((item) => {
        if (item !== panel) item.open = false;
      });
    }
    round4State.finaleLastTouchedAt[sectionId] = Date.now();
    if (isSpotlight) {
      updateTabs(sectionId);
      closeLessRelevantSections(sectionId);
      scheduleSmartCollapse(sectionId);
    }
    if (shouldScroll) {
      try {
        panel.scrollIntoView(reducedMotion ? { block: 'start' } : { behavior: 'smooth', block: 'start' });
      } catch (error) {
      }
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-finale-target') || (spotlightPanels[0] && spotlightPanels[0].getAttribute('data-finale-section')) || 'overview';
      openAndFocusSection(targetId, { shouldScroll: false });
    });
  });


  sections.forEach((panel) => {
    const sectionId = panel.getAttribute('data-finale-section') || '';
    if (!sectionId) return;
    const panelIsSpotlight = panel.getAttribute('data-finale-spotlight') === 'true';
    const markTouched = () => {
      round4State.finaleLastTouchedAt[sectionId] = Date.now();
      if (panel.open && panelIsSpotlight) scheduleSmartCollapse(sectionId);
    };

    panel.addEventListener('toggle', () => {
      const isPinned = panel.getAttribute('data-finale-pinned') === 'true';
      const isSpotlight = panel.getAttribute('data-finale-spotlight') === 'true';
      if (isPinned && !panel.open) {
        panel.open = true;
        return;
      }
      if (panel.open) {
        markTouched();
        if (isSpotlight) {
          spotlightPanels.forEach((item) => {
            if (item !== panel) item.open = false;
          });
          updateTabs(sectionId);
          closeLessRelevantSections(sectionId);
        }
      } else if (activeSectionId === sectionId) {
        const fallback = spotlightPanels.find((item) => item.open) || sections.find((item) => item.open) || panel;
        updateTabs(fallback.getAttribute('data-finale-section') || 'overview');
      }
    });

    panel.addEventListener('pointerenter', markTouched);
    panel.addEventListener('focusin', markTouched);
    panel.addEventListener('click', markTouched);
  });

  if (typeof IntersectionObserver === 'function') {
    round4State.finaleObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const panel = entry.target;
        const id = panel && panel.getAttribute ? (panel.getAttribute('data-finale-section') || '') : '';
        if (!id) return;
        const inView = entry.isIntersecting && entry.intersectionRatio >= 0.2;
        panel.setAttribute('data-in-view', inView ? 'true' : 'false');
        if (inView && panel.getAttribute('data-finale-spotlight') === 'true') updateTabs(id);
      });
    }, { root: null, threshold: [0.2, 0.45, 0.7], rootMargin: '-8% 0px -30% 0px' });

    sections.forEach((panel) => {
      try {
        round4State.finaleObserver.observe(panel);
      } catch (error) {
      }
    });
  }

  pinnedPanels.forEach((panel) => {
    if (typeof panel.open === 'boolean') panel.open = true;
  });

  spotlightPanels.forEach((panel) => {
    panel.open = false;
  });
  root.setAttribute('data-active-spotlight', 'none');
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
  const winnerTeamCharacters = Array.isArray(gameEndedData && gameEndedData.winnerTeamCharacters)
    ? gameEndedData.winnerTeamCharacters
    : [];
  const eliteFinalSix = Array.isArray(gameEndedData && gameEndedData.eliteFinalSix) && gameEndedData.eliteFinalSix.length
    ? gameEndedData.eliteFinalSix
    : winnerTeamCharacters;

  const winnerName = String(winnerInfo && winnerInfo.name ? winnerInfo.name : (finalLeaderboard[0] && finalLeaderboard[0].name ? finalLeaderboard[0].name : 'Champion'));
  const winnerScore = Number(finalLeaderboard[0] && finalLeaderboard[0].score) || 0;
  const secondScore = Number(finalLeaderboard[1] && finalLeaderboard[1].score);
  const margin = Number.isFinite(secondScore) ? (winnerScore - secondScore) : null;
  const marginLabel = margin == null
    ? 'No runner-up data'
    : (margin === 0 ? 'Photo-finish tie' : `Margin ${margin > 0 ? '+' : ''}${margin}`);
  const marginKpiHtml = margin == null
    ? 'Margin <b>N/A</b>'
    : (margin === 0 ? 'Margin <b>Tie</b>' : `Margin <b>${escapeHtml(signed(margin))}</b>`);

  const teamOVR = Number(winnerTeamStats.teamOVR) || 0;
  const round4Points = Number(winnerTeamStats.round4Points) || 0;
  const chemistryBonus = Number(winnerTeamStats.chemistryBonus) || 0;
  const rarityScore = Number(winnerTeamStats.rarityScore) || 0;
  const mvp = String(winnerTeamStats.mvp || 'N/A');
  const winnerAverageOVR = Number(winnerTeamStats.averageOVR) || (teamOVR ? Math.round(teamOVR / 6) : 0);
  const fastestLockMs = Number(winnerTeamStats.fastestLockMs);
  const verdictTier = getRound4FinaleVerdictTier(teamOVR, margin, rarityScore);
  const eliteSectionAvailable = Boolean(eliteFinalSix && eliteFinalSix.length);
  const fastestLockText = Number.isFinite(fastestLockMs) ? formatLockDuration(fastestLockMs) : 'n/a';
  const normalizedMvpName = String(mvp || '').trim().toLowerCase();
  const mvpEntry = (winnerTeamCharacters.find((entry) => String(entry && entry.character || '').trim().toLowerCase() === normalizedMvpName)
    || winnerTeamCharacters.slice().sort((a, b) => (Number(b && b.ovr) || 0) - (Number(a && a.ovr) || 0))[0]
    || eliteFinalSix.slice().sort((a, b) => (Number(b && b.ovr) || 0) - (Number(a && a.ovr) || 0))[0]
    || null);
  const mvpPortraitRaw = mvpEntry && mvpEntry.imageUrl ? String(mvpEntry.imageUrl).trim() : '';
  const mvpPortrait = mvpPortraitRaw
    ? resolveCharacterImage(mvpPortraitRaw, mvpEntry && mvpEntry.character ? mvpEntry.character : 'MVP')
    : buildMissingCharacterImage('MVP');
  const mvpDisplayName = String(mvpEntry && mvpEntry.character || mvp || 'MVP');

  const podiumRows = finalLeaderboard.slice(0, Math.max(3, Math.min(6, finalLeaderboard.length || 0))).map((entry, index) => {
    const score = Number(entry && entry.score) || 0;
    const name = escapeHtml(entry && entry.name ? entry.name : `Player ${index + 1}`);
    const rankLabel = index === 0 ? 'Champion' : index === 1 ? 'Runner-up' : index === 2 ? '3rd' : `#${index + 1}`;
    const breakdownList = Array.isArray(entry && entry.breakdown) ? entry.breakdown : [];
    const breakdown = breakdownList.length
      ? breakdownList.map((pts, round) => `R${round + 1}:${pts}`).join(' | ')
      : '';
    const flavor = getFinalStandingRankFlavor(index);
    const topPickMeta = getFinalStandingTopPickMeta(entry || {});
    const emotionMeta = getFinalStandingEmotionMeta(entry || {}, index, winnerScore);
    const gapToLeader = index === 0 ? 0 : (winnerScore - score);
    const gapLabel = index === 0
      ? 'Takes the crown'
      : `-${Math.max(0, gapToLeader)} to champion`;
    const round4Only = Number(entry && entry.round4Points);
    const round4Label = Number.isFinite(round4Only) ? `R4 ${round4Only} pts` : '';
    const breakdownPills = breakdownList.length
      ? breakdownList.map((pts, round) => `<span class="eval-finale-round-pill r${round + 1} place-${flavor.accent}">R${round + 1} ${Number(pts) || 0}</span>`).join('')
      : '';
    return `
      <li class="eval-finale-podium-row ${index === 0 ? 'is-champion' : ''} accent-${flavor.accent}" style="--podium-delay:${index};">
        <div class="eval-finale-podium-medal" aria-hidden="true">${flavor.medal}</div>
        <div class="eval-finale-podium-avatar">
          <img src="${escapeHtml(topPickMeta.imageUrl)}" alt="${escapeHtml(topPickMeta.topPick)} portrait" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';">
        </div>
        <div class="eval-finale-podium-emotion">
          <img src="${escapeHtml(emotionMeta.src)}" alt="${escapeHtml(emotionMeta.label)} reaction" loading="lazy" decoding="async" onerror="this.hidden=true;this.closest('.eval-finale-podium-emotion')?.classList.add('fallback');">
          <span>${escapeHtml(emotionMeta.label)}</span>
        </div>
        <div class="eval-finale-podium-main">
          <span class="eval-finale-podium-rank">${escapeHtml(rankLabel)}</span>
          <strong class="eval-finale-podium-name">${name}</strong>
          <div class="eval-finale-podium-tags">
            <span class="eval-finale-podium-tag vibe">${escapeHtml(flavor.vibe)}</span>
            ${round4Label ? `<span class="eval-finale-podium-tag r4">&#x26A1; ${escapeHtml(round4Label)}</span>` : ''}
          </div>
        </div>
        <div class="eval-finale-podium-score-wrap">
          <div class="eval-finale-podium-score">${score} pts</div>
          <div class="eval-finale-podium-gap">${escapeHtml(gapLabel)}</div>
        </div>
        ${breakdownPills ? `<div class="eval-finale-podium-rounds">${breakdownPills}</div>` : ''}
        ${breakdown ? `<div class="eval-finale-podium-breakdown">${escapeHtml(breakdown)}</div>` : ''}
      </li>
    `;
  }).join('');

  const eliteSlots = eliteFinalSix.slice(0, 6).map((entry, index) => {
    const rawImage = entry && entry.imageUrl ? String(entry.imageUrl).trim() : '';
    const imageUrl = rawImage ? resolveCharacterImage(rawImage, entry && entry.character ? entry.character : 'No Portrait') : buildMissingCharacterImage('No Portrait');
    const safeName = escapeHtml(entry && entry.character ? entry.character : `Elite ${index + 1}`);
    const eliteRank = Number(entry && entry.eliteRank) || (index + 1);
    const eliteOVR = Number(entry && entry.ovr) || 0;
    const ownerName = entry && entry.ownerName ? String(entry.ownerName) : '';
    const ownerAbbr = ownerName
      ? ownerName.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 3).toUpperCase()
      : '';
    const isChampionMember = entry && entry.isChampionMember === true;
    return `
      <div class="eval-finale-elite-slot ${isChampionMember ? 'is-champion-member' : ''}" data-elite-index="${index}" aria-label="${safeName} profile" title="${safeName}${ownerName ? ` | ${escapeHtml(ownerName)}` : ''}">
        <img src="${escapeHtml(imageUrl)}" alt="${safeName}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('No Portrait')}';">
        <span class="eval-finale-elite-ovr" aria-hidden="true"><small>OVR</small><strong>${eliteOVR}</strong></span>
        <span class="eval-finale-elite-rank">#${eliteRank}</span>
        ${ownerAbbr ? `<span class="eval-finale-elite-owner">${escapeHtml(ownerAbbr)}</span>` : ''}
      </div>
    `;
  }).join('');

  let finaleMount = container.querySelector('.eval-finale-mount');
  if (!finaleMount) {
    finaleMount = document.createElement('div');
    finaleMount.className = 'eval-finale-mount';
    container.appendChild(finaleMount);
  }

  const existing = finaleMount.querySelector('.eval-finale-ceremony');
  if (existing) existing.remove();

  finaleMount.insertAdjacentHTML('beforeend', `
    <section class="eval-finale-ceremony ${verdictTier} is-arriving" aria-live="polite" aria-label="Final game results in round 4 ceremony">
      <div class="eval-finale-eyebrow eval-finale-stage-badge">Final Verdict | Round 4 Ceremony</div>
      <header class="eval-finale-hero">
        <h3>${escapeHtml(winnerName)} wins the match</h3>
        <div class="eval-finale-kpis">
          <span class="kpi-score">Score <b>${winnerScore}</b></span>
          <span class="kpi-margin${margin == null ? ' is-empty' : ''}">${marginKpiHtml}</span>
          <span class="kpi-mvp">MVP <b>${escapeHtml(mvp)}</b></span>
          <span class="kpi-rarity">Rarity <b>${rarityScore}</b></span>
        </div>
        <section class="eval-finale-mvp-callout" data-mvp-callout data-state="idle" aria-label="MVP victory callout">
          <div class="eval-finale-mvp-portrait-wrap">
            <img class="eval-finale-mvp-portrait" src="${escapeHtml(mvpPortrait)}" alt="${escapeHtml(mvpDisplayName)} portrait" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${buildMissingCharacterImage('MVP')}';">
          </div>
          <div class="eval-finale-mvp-bubble">
            <div class="eval-finale-mvp-bubble-top">
              <span class="eval-finale-mvp-chip">MVP Voice</span>
              <span class="eval-finale-mvp-name" data-mvp-callout-name>${escapeHtml(mvpDisplayName)}</span>
            </div>
            <p class="eval-finale-mvp-line" data-mvp-callout-line>Preparing victory callout...</p>
            <div class="eval-finale-mvp-meta" data-mvp-callout-meta>Winner-only phrase set - archetype-shaped</div>
          </div>
        </section>
      </header>

      <div class="eval-finale-spotlight-shell">
        ${eliteSectionAvailable ? `
          <nav class="eval-finale-spotlight-nav" role="tablist" aria-label="Final verdict spotlight">
            <button class="eval-finale-spotlight-tab" type="button" role="tab" aria-selected="false" data-finale-target="overview">
              <span aria-hidden="true">&#x1F451;</span>
              <span>Champion Snapshot</span>
            </button>
            <button class="eval-finale-spotlight-tab" type="button" role="tab" aria-selected="false" data-finale-target="elite">
              <span aria-hidden="true">&#x1F525;</span>
              <span>Top 6 Profiles</span>
            </button>
          </nav>
        ` : ''}

        <details class="eval-finale-panel" data-finale-section="overview" data-finale-spotlight="true">
          <summary class="eval-finale-panel-summary">
            <span class="eval-finale-panel-title">Champion Snapshot &#x1F451;</span>
            <span class="eval-finale-panel-meta">${escapeHtml(marginLabel)}</span>
          </summary>
          <div class="eval-finale-panel-body">
            <div class="eval-finale-overview-grid">
              <div class="eval-finale-overview-card ovr">
                <span>Team OVR &#x1F4AA;</span>
                <strong>${teamOVR}</strong>
                <small>Avg ${winnerAverageOVR} | Round 4 ${round4Points} pts | Lock ${escapeHtml(fastestLockText)}</small>
              </div>
              <div class="eval-finale-overview-card chemistry">
                <span>Chem + Rarity &#x2728;</span>
                <strong>${chemistryBonus >= 0 ? '+' : ''}${chemistryBonus} | ${rarityScore}</strong>
                <small>MVP ${escapeHtml(mvp)}</small>
              </div>
              <div class="eval-finale-overview-card archive">
                <span>Archive Access &#x1F5C2;</span>
                <strong>Full Final Results</strong>
                <small>Detailed archive page with a back path to Round 4</small>
              </div>
            </div>
          </div>
        </details>

        ${eliteSlots ? `
          <details class="eval-finale-panel" data-finale-section="elite" data-finale-spotlight="true">
            <summary class="eval-finale-panel-summary">
              <span class="eval-finale-panel-title">Top 6 Profiles &#x1F525;</span>
              <span class="eval-finale-panel-meta">OVR showcase</span>
            </summary>
            <div class="eval-finale-panel-body">
              <section class="eval-finale-elite-strip" aria-label="Top 6 Profiles preview">
                <div class="eval-finale-section-head">
                  <strong>Top 6 Profiles</strong>
                  <small>OVR showcase (score champion remains separate)</small>
                </div>
                <div class="eval-finale-elite-grid">${eliteSlots}</div>
              </section>
            </div>
          </details>
        ` : ''}
      </div>

      <details class="eval-finale-panel eval-finale-panel-pinned" data-finale-section="standings" data-finale-pinned="true" open>
        <summary class="eval-finale-panel-summary">
          <span class="eval-finale-panel-title">Final Standings &#x1F4CB;</span>
          <span class="eval-finale-panel-meta">${finalLeaderboard.length || 0} teams</span>
        </summary>
        <div class="eval-finale-panel-body">
          <section class="eval-finale-standings" aria-label="Final standings">
            <div class="eval-finale-section-head">
              <strong>Final Standings</strong>
              <small>Totals, round pills, gap to champion, and reactions</small>
            </div>
            <ol class="eval-finale-podium">
              ${podiumRows || '<li class="eval-finale-podium-empty">No standings available.</li>'}
            </ol>
          </section>
        </div>
      </details>

      <details class="eval-finale-panel eval-finale-panel-pinned" data-finale-section="actions" data-finale-pinned="true" open>
        <summary class="eval-finale-panel-summary">
          <span class="eval-finale-panel-title">Next Move &#x27A1;</span>
          <span class="eval-finale-panel-meta">Archive + replay</span>
        </summary>
        <div class="eval-finale-panel-body">
          <div class="eval-finale-actions">
            <button class="btn btn-secondary btn-archive-subtle" type="button" onclick="openFinalResultsArchive()"><span>OPEN FULL ARCHIVE</span><small>Legacy Results Page</small></button>
            <button class="btn btn-success" type="button" onclick="sendPlayAgain()">PLAY AGAIN</button>
            <button class="btn btn-secondary" type="button" onclick="goToLobby()">NEW GAME</button>
          </div>
        </div>
      </details>
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
    const bridge = getSharedAudioBridge();
    if (bridge && typeof bridge.setMusicScene === 'function') {
      try {
        bridge.setMusicScene('finale', { force: true, transition: 'crescendo', exclusive: true });
      } catch (error) {
      }
    }

    setRound4PageSectionCollapsed('cards', true);
    setRound4PageSectionCollapsed('results', true);
    setRound4PageSectionCollapsed('finale', false);
    round4State.pageNavActive = 'finale';
    round4State.pageNavMenuOpen = false;
    bindRound4FinaleUi(panel);
    const mvpCalloutNode = panel.querySelector('[data-mvp-callout]');
    const mvpCalloutNameNode = panel.querySelector('[data-mvp-callout-name]');
    const mvpCalloutLineNode = panel.querySelector('[data-mvp-callout-line]');
    const mvpCalloutMetaNode = panel.querySelector('[data-mvp-callout-meta]');
    const updateMvpCalloutOverlay = (payload = {}) => {
      if (!mvpCalloutNode) return;
      const state = String(payload && payload.state || 'idle');
      mvpCalloutNode.setAttribute('data-state', state);
      if (mvpCalloutNameNode && payload && payload.characterName) {
        mvpCalloutNameNode.textContent = String(payload.characterName);
      }
      if (mvpCalloutLineNode) {
        const line = String(payload && (payload.phrase || payload.compositeLine || payload.subtitle) || '').trim();
        if (line) mvpCalloutLineNode.textContent = line;
      }
      if (mvpCalloutMetaNode) {
        const metaBits = [];
        if (payload && payload.classLabel) metaBits.push(String(payload.classLabel));
        if (payload && payload.temperament) metaBits.push(String(payload.temperament).replace(/_/g, ' '));
        else if (payload && payload.voiceStyle) metaBits.push(String(payload.voiceStyle));
        if (state === 'speaking') metaBits.push('MVP victory callout');
        if (!metaBits.length) metaBits.push('Winner-only phrase set - archetype-shaped');
        mvpCalloutMetaNode.textContent = metaBits.join(' - ');
      }
    };

    const finaleCalloutRoster = winnerTeamCharacters.length ? winnerTeamCharacters : eliteFinalSix;
    if (finaleCalloutRoster.length) {
      ensureSharedAudioReady();
      const narratorLeadText = getNarratorLeadLineFromVoiceCues(Array.isArray(gameEndedData && gameEndedData.voiceCues) ? gameEndedData.voiceCues : []);
      const mvpDelayMs = Math.max(
        520,
        Math.min(1900, 520 + Math.round((String(narratorLeadText || '').length || 0) * 14))
      );
      Promise.resolve(playSharedFinaleMvpVictoryCallout(finaleCalloutRoster, {
        context: 'round4-finale-mvp',
        dedupeFinale: true,
        delayMs: mvpDelayMs,
        throttleMs: 0,
        narratorLeadText,
        onOverlayUpdate: updateMvpCalloutOverlay
      })).then((audioResult) => {
        if (!audioResult || audioResult.skipped) return;
      }).catch(() => {
        updateMvpCalloutOverlay({
          state: 'fallback',
          subtitle: 'MVP victory callout unavailable.',
          characterName: mvpDisplayName
        });
      });
    } else {
      updateMvpCalloutOverlay({
        state: 'fallback',
        subtitle: 'No winner roster available for MVP callout.'
      });
    }
    refreshRound4PageUi();
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
  const minLoadingReadyMs = getRevealPerfMode() === 'lite' ? 4800 : 5600;

  Promise.allSettled([
    preloadCinematicAssets(),
    prepareRevealSequenceProfiles(),
    primeAnimationPipeline(),
    prepareRevealAnnouncerVoiceWarmup(),
    waitForRevealLoadingNarrationToFinish({
      timeoutMs: 9000,
      minQuietMs: 260
    }),
    new Promise((resolve) => window.setTimeout(resolve, minLoadingReadyMs))
  ]).finally(() => {
    void (async () => {
      if (!round4State.animationPrimed) {
        round4State.animationPrimed = true;
      }
      setRevealCeremonyProgress(100, 'Reveal ceremony ready');
      updateLoadingDockProgress(round4State.queue.length || 1, round4State.queue.length || 1, 'Reveal profile ready');

      const readyCueEvalId = String(round4State.pendingLoadingReadyVoiceCueEvalId || '').trim();
      const pendingReadyCue = round4State.pendingLoadingReadyVoiceCue && typeof round4State.pendingLoadingReadyVoiceCue === 'object'
        ? { ...round4State.pendingLoadingReadyVoiceCue }
        : null;
      if (
        pendingReadyCue
        && readyCueEvalId
        && round4State.loadingReadyVoiceSpokenEvalId !== readyCueEvalId
      ) {
        round4State.loadingReadyVoiceSpokenEvalId = readyCueEvalId;
        round4State.pendingLoadingReadyVoiceCue = null;
        try {
          enqueueSharedVoiceCues([pendingReadyCue], { clear: false });
          await waitForSharedVoiceCueCompletion(pendingReadyCue, {
            minHoldMs: 120,
            timeoutMs: Math.max(1800, Number(pendingReadyCue.estimatedMs || 0) + 1200),
            startTimeoutMs: 4200
          });
        } catch (error) {
        }
      }

      setLoadingBotContext(null, null, '');
      setLoadingReadyState(true);
    })();
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
      emoji: 'S',
      text: scenarioText,
      keywords: scenarioKeywords,
      promptText: contextPrompts.scenario || '',
      flavorText: contextFlavor.scenario || '',
      toneClass: /excellent|strong/i.test(scenarioText) ? 'boost' : (/weak|low|outside/i.test(scenarioText) ? 'drag' : '')
    }),
    buildActiveContextQuickCardHtml({
      label: 'Twist Fit',
      emoji: 'T',
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

function getOVRBreakdownEmotionMeta(evalData, fallbackOVR = null) {
  const breakdownOVR = Number(
    evalData && evalData.breakdown && evalData.breakdown.ovrBreakdown && evalData.breakdown.ovrBreakdown.finalOVR
  );
  const rawOVR = Number(evalData && evalData.ovr);
  const ovr = Math.max(0, Math.min(99, Number.isFinite(breakdownOVR)
    ? breakdownOVR
    : (Number.isFinite(rawOVR) ? rawOVR : (Number(fallbackOVR) || 0))));

  let key = 'neutral';
  let label = 'Balanced';
  let flavor = 'Stable read';

  if (ovr >= 92) {
    key = 'mindBlown';
    label = 'Mind Blown';
    flavor = 'Elite ceiling';
  } else if (ovr >= 84) {
    key = 'amazed';
    label = 'Amazed';
    flavor = 'High-tier output';
  } else if (ovr >= 72) {
    key = 'happy';
    label = 'Happy';
    flavor = 'Strong lane fit';
  } else if (ovr >= 58) {
    key = 'neutral';
    label = 'Neutral';
    flavor = 'Playable balance';
  } else if (ovr >= 46) {
    key = 'confused';
    label = 'Confused';
    flavor = 'Swingy profile';
  } else if (ovr >= 34) {
    key = 'disappointed';
    label = 'Disappointed';
    flavor = 'Low conversion';
  } else {
    key = 'mad';
    label = 'Mad';
    flavor = 'Severe drag';
  }

  return {
    key,
    label,
    flavor,
    src: `/img/emotions/${key}.png`,
    ovr
  };
}

function openOVRBreakdown(evalData) {
  const modal = document.getElementById('ovrBreakdownModal');
  if (!modal || !evalData) return;
  try {
    prefetchSharedCharacterCardBlurbs([evalData], {
      context: 'ovr-breakdown-open',
      maxEntries: 1,
      warmTop: 1,
      voiceWarmTop: 1,
      immediate: true
    });
  } catch (_prefetchError) {}
  try {
    const modalContent = modal.querySelector('.ovr-modal-content');
    const modalBody = modal.querySelector('.ovr-modal-body');
    const tierClass = getTierClassFromEval(evalData);
    if (modalContent) {
      modalContent.classList.remove('tier-icon', 'tier-legendary', 'tier-epic', 'tier-rare', 'tier-gold', 'tier-silver', 'tier-bronze');
      modalContent.classList.add('ovr-tiered', tierClass);
      modalContent.setAttribute('data-tier', tierClass.replace('tier-', ''));
    }
    if (modalBody) {
      modalBody.setAttribute('data-tier', tierClass.replace('tier-', ''));
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

    const audioStatusEl = document.getElementById('modalCardAudioStatus');
    if (audioStatusEl) {
      audioStatusEl.textContent = '';
      audioStatusEl.classList.remove('is-warning', 'is-ready');
    }

    const playCardAudioBtn = document.getElementById('modalPlayCardAudio');
    if (playCardAudioBtn) {
      const finalResultsRevealActive = Boolean(
        document.querySelector('#round4EvalScreen.active .eval-finale-ceremony')
        || document.querySelector('#finalScreen.active .final-ceremony-shell')
      );
      if (finalResultsRevealActive) {
        playCardAudioBtn.textContent = 'Unavailable after final results reveal';
        playCardAudioBtn.disabled = true;
        playCardAudioBtn.onclick = null;
        if (audioStatusEl) {
          audioStatusEl.textContent = 'Unavailable after final results reveal';
          audioStatusEl.classList.add('is-warning');
          audioStatusEl.classList.remove('is-ready');
        }
      } else {
        playCardAudioBtn.textContent = 'Play Callout';
        playCardAudioBtn.disabled = false;
        playCardAudioBtn.onclick = () => {
        ensureSharedAudioReady();
        const status = document.getElementById('modalCardAudioStatus');
        const requestLabel = 'Play Callout';
        playCardAudioBtn.textContent = 'Loading Callout...';
        playCardAudioBtn.disabled = true;
        if (status) {
          status.textContent = 'Preparing character callout (prefetched when available)...';
          status.classList.remove('is-warning', 'is-ready');
        }
        const clearStatusLater = (expectedText) => {
          if (!status || !expectedText) return;
          window.setTimeout(() => {
            if (status.textContent === expectedText) {
              status.textContent = '';
              status.classList.remove('is-warning', 'is-ready');
            }
          }, 2400);
        };
        const restoreLabel = (label = requestLabel) => {
          window.setTimeout(() => {
            playCardAudioBtn.textContent = label;
            playCardAudioBtn.disabled = false;
          }, 900);
        };

        Promise.resolve(playSharedCharacterCardBlurb(evalData, {
          context: 'ovr-breakdown-click',
          throttleMs: 0,
          preemptVoice: true
        })).then((audioResult) => {
          if (audioResult && audioResult.skipped) {
            const skippedMsg = audioResult.reason === 'superseded'
              ? 'Callout updated to your latest click.'
              : 'Callout skipped.';
            playCardAudioBtn.textContent = 'Callout Queued';
            if (status) {
              status.textContent = skippedMsg;
              status.classList.remove('is-warning');
              status.classList.add('is-ready');
            }
            clearStatusLater(skippedMsg);
            restoreLabel(requestLabel);
            return;
          }

          if (audioResult === false || audioResult == null) {
            playCardAudioBtn.textContent = 'Audio Unavailable';
            if (status) {
              status.textContent = 'Audio system unavailable for this callout.';
              status.classList.add('is-warning');
              status.classList.remove('is-ready');
            }
            clearStatusLater('Audio system unavailable for this callout.');
            restoreLabel(requestLabel);
            return;
          }

          if (audioResult && audioResult.mode === 'no-audio-fallback') {
            const prompt = String(audioResult.prompt || '').trim() || `No callout phrase available for ${evalData.character} yet.`;
            playCardAudioBtn.textContent = 'No Callout :(';
            if (status) {
              status.textContent = prompt;
              status.classList.add('is-warning');
              status.classList.remove('is-ready');
            }
            clearStatusLater(prompt);
            restoreLabel(requestLabel);
            return;
          }

          const isSpeechMode = typeof audioResult.mode === 'string' && audioResult.mode.startsWith('speech');
          playCardAudioBtn.textContent = isSpeechMode ? 'Playing Callout' : 'Playing Audio';
          if (status) {
            status.textContent = isSpeechMode ? 'Character callout queued / playing' : 'Character audio playing';
            status.classList.add('is-ready');
            status.classList.remove('is-warning');
          }
          clearStatusLater(isSpeechMode ? 'Character callout queued / playing' : 'Character audio playing');
          restoreLabel(requestLabel);
        }).catch(() => {
          playCardAudioBtn.textContent = 'Audio Error';
          if (status) {
            status.textContent = 'Callout lookup failed. Try again.';
            status.classList.add('is-warning');
            status.classList.remove('is-ready');
          }
          clearStatusLater('Callout lookup failed. Try again.');
          restoreLabel(requestLabel);
        });
        };
      }
    }

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
    const scoreDetails = scoreBreakdownEl ? scoreBreakdownEl.closest('details') : null;
    const scoreSummary = scoreDetails ? scoreDetails.querySelector('summary.ovr-section-title') : null;
    if (scoreSummary) {
      scoreSummary.textContent = `Score ${Number(evalData.score) || 0}/30`;
    }
    if (scoreBreakdownEl && evalData.breakdown && Array.isArray(evalData.breakdown.scoreBreakdown)) {
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
      const ovrMoodMeta = getOVRBreakdownEmotionMeta(evalData, safeFinalOVR);

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
          <div class="ovr-visual-mood" aria-label="OVR mood read">
            <img src="${escapeHtml(ovrMoodMeta.src)}" alt="${escapeHtml(ovrMoodMeta.label)} emotion" loading="lazy" decoding="async" onerror="this.hidden=true;this.closest('.ovr-visual-mood')?.classList.add('fallback');">
            <div class="ovr-visual-mood-copy">
              <small>OVR Mood</small>
              <strong>${escapeHtml(ovrMoodMeta.label)}</strong>
              <span>${escapeHtml(ovrMoodMeta.flavor)}</span>
            </div>
            <em>${safeFinalOVR}</em>
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
              <b>${scenarioSigned}% (x${Number(ovr.scenarioMultiplier || 1).toFixed(2)})</b>
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
      const incomingEvalId = String(data && data.evaluationId || '').trim();
      if (
        incomingEvalId
        && round4State.evaluationId
        && String(round4State.evaluationId) === incomingEvalId
        && (
          round4State.rendered
          || round4State.cinematicRenderTimer
          || round4State.preloadPromise
          || round4State.revealPreparePromise
          || round4State.animationPrimePromise
        )
      ) {
        return;
      }

      round4State.evaluationId = data.evaluationId || null;
      round4State.allTeamEvaluations = data.allTeamEvaluations || data.teamEvaluations || {};
      round4State.finalLeaderboard = Array.isArray(data.finalLeaderboard) ? data.finalLeaderboard : [];
      round4State.revealConfig = data.revealTimeline || null;
      round4State.pendingLoadingReadyVoiceCueEvalId = incomingEvalId || String(round4State.evaluationId || '').trim() || 'n/a';
      round4State.pendingLoadingReadyVoiceCue = buildRound4LoadingReadyCue(round4State.pendingLoadingReadyVoiceCueEvalId);
      try {
        const prefetchEntries = Object.values(round4State.allTeamEvaluations || {}).flatMap((team) => (
          Array.isArray(team && team.evaluations) ? team.evaluations : []
        ));
        if (prefetchEntries.length) {
          prefetchSharedCharacterCardBlurbs(prefetchEntries, {
            context: 'round4-evaluated',
            maxEntries: 24,
            warmTop: 12,
            voiceWarmTop: 18,
            immediate: true
          });
        }
      } catch (prefetchError) {
      }
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

      if (round4State.cinematicRenderTimer) {
        window.clearTimeout(round4State.cinematicRenderTimer);
        round4State.cinematicRenderTimer = null;
      }
      round4State.cinematicRenderTimer = window.setTimeout(() => {
        round4State.cinematicRenderTimer = null;
        renderCinematicSequence();
      }, 420);
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
        continueBtn.textContent = `WAITING (${readyCount}/${totalPlayers})`;
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

