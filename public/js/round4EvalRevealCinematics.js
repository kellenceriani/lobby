// Round 4 reveal/cinematic helper banks + utilities (classic script).
// Loaded before round4Eval.js so global function declarations remain available.

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

