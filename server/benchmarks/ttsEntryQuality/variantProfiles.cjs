const fs = require('fs');
const path = require('path');

function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeArchetype(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeGenderHint(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return 'neutral';
}

const UNIVERSAL_VOICES = Object.freeze([
  {
    id: 'af_heart',
    label: 'Jenny',
    gender: 'female',
    persona: {
      warmth: 0.92, brightness: 0.57, darkness: 0.22, energy: 0.56,
      menace: 0.18, heroism: 0.48, spooky: 0.34, robotic: 0.28,
      cartoon: 0.46, chaos: 0.44, clarity: 0.88
    }
  },
  {
    id: 'af_bella',
    label: 'Aria',
    gender: 'female',
    persona: {
      warmth: 0.66, brightness: 0.94, darkness: 0.12, energy: 0.91,
      menace: 0.16, heroism: 0.57, spooky: 0.25, robotic: 0.35,
      cartoon: 0.94, chaos: 0.88, clarity: 0.89
    }
  },
  {
    id: 'am_michael',
    label: 'Guy',
    gender: 'male',
    persona: {
      warmth: 0.46, brightness: 0.45, darkness: 0.58, energy: 0.62,
      menace: 0.54, heroism: 0.94, spooky: 0.52, robotic: 0.71,
      cartoon: 0.24, chaos: 0.34, clarity: 0.86
    }
  },
  {
    id: 'bm_george',
    label: 'Ryan',
    gender: 'male',
    persona: {
      warmth: 0.34, brightness: 0.26, darkness: 0.93, energy: 0.56,
      menace: 0.96, heroism: 0.63, spooky: 0.9, robotic: 0.48,
      cartoon: 0.14, chaos: 0.48, clarity: 0.84
    }
  }
]);

const UNIVERSAL_VOICE_BY_ID = Object.freeze(
  UNIVERSAL_VOICES.reduce((acc, voice) => {
    acc[voice.id] = voice;
    return acc;
  }, {})
);

const CURRENT_ARCHETYPE_CAST_MAP = Object.freeze({
  VILLAIN: 'bm_george',
  MYSTERIOUS: 'bm_george',
  SPOOKY: 'bm_george',
  MONSTER: 'bm_george',
  REGAL: 'bm_george',
  ANCIENT: 'bm_george',
  PIRATE: 'bm_george',
  STEALTHY: 'bm_george',
  DETECTIVE: 'bm_george',
  HEROIC: 'am_michael',
  GRUFF: 'am_michael',
  COMMANDER: 'am_michael',
  MENTOR: 'am_michael',
  WESTERN: 'am_michael',
  ROBOTIC: 'am_michael',
  CORPORATE: 'am_michael',
  SCIENTIST: 'am_michael',
  OBJECT: 'am_michael',
  SPORTY: 'am_michael',
  KID_CARTOON: 'af_bella',
  CUTE: 'af_bella',
  CHAOTIC: 'af_bella',
  ABSURD: 'af_bella',
  MEME: 'af_bella',
  CREATURE: 'af_bella',
  TRICKSTER: 'af_bella',
  COSMIC: 'af_heart',
  MAGICAL: 'af_heart',
  SWEET: 'af_heart',
  CELEBRITY: 'af_heart',
  ANNOUNCER: 'af_heart',
  NARRATOR: 'af_heart'
});

const BASE_ARCHETYPE_PRESETS = Object.freeze({
  NARRATOR: { rate: 0.97, pitch: 0.95 },
  ANNOUNCER: { rate: 1.03, pitch: 1.0 },
  HEROIC: { rate: 0.93, pitch: 0.89 },
  VILLAIN: { rate: 0.84, pitch: 0.76 },
  MYSTERIOUS: { rate: 0.88, pitch: 0.9 },
  CHAOTIC: { rate: 1.21, pitch: 1.16 },
  ROBOTIC: { rate: 0.99, pitch: 0.85 },
  SPOOKY: { rate: 0.82, pitch: 0.78 },
  CUTE: { rate: 1.07, pitch: 1.18 },
  KID_CARTOON: { rate: 1.18, pitch: 1.24 },
  GRUFF: { rate: 0.93, pitch: 0.82 },
  SWEET: { rate: 1.0, pitch: 1.1 },
  SCIENTIST: { rate: 1.04, pitch: 0.98 },
  WESTERN: { rate: 0.97, pitch: 0.88 },
  PIRATE: { rate: 0.94, pitch: 0.86 },
  SPORTY: { rate: 1.12, pitch: 1.02 },
  ABSURD: { rate: 1.05, pitch: 1.04 },
  MEME: { rate: 1.2, pitch: 1.16 },
  OBJECT: { rate: 1.02, pitch: 0.94 },
  CREATURE: { rate: 0.98, pitch: 1.14 },
  MONSTER: { rate: 0.88, pitch: 0.8 },
  COSMIC: { rate: 0.95, pitch: 0.99 },
  DETECTIVE: { rate: 0.96, pitch: 0.92 },
  COMMANDER: { rate: 0.98, pitch: 0.88 },
  MAGICAL: { rate: 0.97, pitch: 1.06 },
  CELEBRITY: { rate: 1.03, pitch: 1.01 },
  STEALTHY: { rate: 0.96, pitch: 0.9 },
  MENTOR: { rate: 0.93, pitch: 0.93 },
  TRICKSTER: { rate: 1.14, pitch: 1.09 }
});

const ENTRY_SPEED_DELTAS = Object.freeze({
  VILLAIN: -0.03, MYSTERIOUS: -0.12, SPOOKY: 0.01, MONSTER: -0.08, REGAL: -0.1,
  ANCIENT: -0.12, PIRATE: -0.06, STEALTHY: -0.12, HEROIC: -0.06, GRUFF: -0.05,
  COMMANDER: -0.07, DETECTIVE: -0.07, MENTOR: -0.06, WESTERN: -0.04, ROBOTIC: -0.09,
  CORPORATE: -0.03, SCIENTIST: -0.01, OBJECT: -0.07, KID_CARTOON: 0.09, CUTE: 0.08,
  CHAOTIC: 0.07, MEME: 0.22, CREATURE: 0.06, MAGICAL: 0.03, TRICKSTER: 0.14,
  COSMIC: -0.04, ANNOUNCER: -0.03, NARRATOR: -0.05
});

const ENTRY_PITCH_DELTAS = Object.freeze({
  VILLAIN: 0.01, SPOOKY: 0.01, MONSTER: -0.06, REGAL: -0.05, ROBOTIC: -0.02,
  OBJECT: -0.04, HEROIC: 0, COMMANDER: -0.04, GRUFF: -0.05, KID_CARTOON: 0.01,
  CUTE: 0.1, CHAOTIC: 0.03, MEME: 0.1, TRICKSTER: 0.06, CREATURE: 0.07, MAGICAL: 0.05
});

function currentRuntimeEntryProsody(archetype) {
  const key = normalizeArchetype(archetype);
  const preset = BASE_ARCHETYPE_PRESETS[key] || { rate: 1, pitch: 1 };
  let speed = 1 + ((Number(preset.rate) - 1) * 0.95);
  speed += Number(ENTRY_SPEED_DELTAS[key] || 0);
  speed = clamp(speed, 0.78, 1.35, 1);

  let pitch = 1 + ((Number(preset.pitch) - 1) * 0.95);
  pitch += Number(ENTRY_PITCH_DELTAS[key] || 0);
  pitch = clamp(pitch, 0.72, 1.35, 1);

  return { speed, pitch };
}

const ARCHETYPE_TARGETS = Object.freeze({
  VILLAIN: {
    anchorProfile: 'villain_menace',
    speed: 0.82,
    pitch: 0.78,
    preferredTextStyle: 'villain',
    traitWeights: { menace: 0.36, darkness: 0.26, clarity: 0.12, heroism: 0.06, warmth: -0.05, cartoon: -0.05 },
    genderBias: 'male'
  },
  HEROIC: {
    anchorProfile: 'heroic_batman',
    speed: 0.87,
    pitch: 0.89,
    preferredTextStyle: 'heroic',
    traitWeights: { heroism: 0.34, clarity: 0.2, darkness: 0.12, warmth: 0.08, energy: 0.08, chaos: -0.08 },
    genderBias: 'male'
  },
  KID_CARTOON: {
    anchorProfile: 'cartoon_spongebob',
    speed: 1.27,
    pitch: 1.25,
    preferredTextStyle: 'cartoon',
    traitWeights: { cartoon: 0.34, brightness: 0.22, energy: 0.18, chaos: 0.08, menace: -0.12, darkness: -0.12 },
    genderBias: 'female'
  },
  ROBOTIC: {
    anchorProfile: 'robotic_hal',
    speed: 0.9,
    pitch: 0.84,
    preferredTextStyle: 'robotic',
    traitWeights: { robotic: 0.34, clarity: 0.24, energy: -0.1, chaos: -0.1, cartoon: -0.08, menace: 0.05 },
    genderBias: 'neutral'
  },
  SPOOKY: {
    anchorProfile: 'spooky_whisper',
    speed: 0.84,
    pitch: 0.8,
    preferredTextStyle: 'spooky',
    traitWeights: { spooky: 0.34, darkness: 0.22, clarity: 0.08, warmth: -0.06, cartoon: -0.12, chaos: -0.05 },
    genderBias: 'neutral'
  },
  CHAOTIC: {
    anchorProfile: 'chaotic_mask',
    speed: 1.28,
    pitch: 1.18,
    preferredTextStyle: 'chaotic',
    traitWeights: { chaos: 0.28, energy: 0.22, cartoon: 0.14, brightness: 0.12, menace: -0.08, darkness: -0.06 },
    genderBias: 'male'
  }
});

function makeVariant(id, label, archetype, speed, pitch, options = {}) {
  return {
    subsetId: id,
    label,
    archetype: normalizeArchetype(archetype),
    speed: clamp(speed, 0.72, 1.35, 1),
    pitch: clamp(pitch, 0.72, 1.35, 1),
    gain: clamp(options.gain == null ? 1 : options.gain, 0.7, 1.2, 1),
    textStyle: String(options.textStyle || 'neutral'),
    notes: String(options.notes || ''),
    tags: Array.isArray(options.tags) ? options.tags.slice() : [],
    source: String(options.source || 'manual')
  };
}

function buildVariantProfiles() {
  const out = {};
  const keys = ['VILLAIN', 'HEROIC', 'KID_CARTOON', 'ROBOTIC', 'SPOOKY', 'CHAOTIC'];
  for (const archetype of keys) {
    const current = currentRuntimeEntryProsody(archetype);
    const target = ARCHETYPE_TARGETS[archetype];
    const variants = [
      makeVariant('current_runtime', 'Current Runtime', archetype, current.speed, current.pitch, {
        textStyle: target ? target.preferredTextStyle : 'neutral',
        source: 'runtime'
      })
    ];

    if (archetype === 'VILLAIN') {
      variants.push(makeVariant('villain_menace_balanced', 'Menace Balanced', archetype, 0.82, 0.78, { textStyle: 'villain', tags: ['menace', 'balanced'] }));
      variants.push(makeVariant('villain_velvet', 'Velvet Menace', archetype, 0.86, 0.9, { textStyle: 'villain', tags: ['female_tilt', 'smooth'] }));
      variants.push(makeVariant('villain_cold_order', 'Cold Order', archetype, 0.9, 0.83, { textStyle: 'villain', tags: ['command', 'clean'] }));
      variants.push(makeVariant('villain_bass_extreme', 'Bass Extreme', archetype, 0.78, 0.72, { textStyle: 'villain', tags: ['extreme', 'legacyish'] }));
    } else if (archetype === 'HEROIC') {
      variants.push(makeVariant('heroic_cinematic', 'Cinematic Heroic', archetype, 0.87, 0.89, { textStyle: 'heroic', tags: ['cinematic'] }));
      variants.push(makeVariant('heroic_bright_command', 'Bright Command', archetype, 0.92, 0.97, { textStyle: 'heroic', tags: ['clear', 'uplifting'] }));
      variants.push(makeVariant('heroic_grounded', 'Grounded Hero', archetype, 0.9, 0.93, { textStyle: 'heroic', tags: ['modern', 'natural'] }));
    } else if (archetype === 'KID_CARTOON') {
      variants.push(makeVariant('cartoon_bright_spring', 'Bright Spring', archetype, 1.26, 1.24, { textStyle: 'cartoon', tags: ['ideal'] }));
      variants.push(makeVariant('cartoon_clean_fast', 'Clean Fast', archetype, 1.21, 1.2, { textStyle: 'cartoon', tags: ['intelligibility'] }));
      variants.push(makeVariant('cartoon_hyper', 'Hyper Cartoon', archetype, 1.32, 1.3, { textStyle: 'cartoon', tags: ['extreme'] }));
      variants.push(makeVariant('cartoon_tween', 'Tween Energy', archetype, 1.15, 1.11, { textStyle: 'cartoon', tags: ['less_chipmunk'] }));
    } else if (archetype === 'ROBOTIC') {
      variants.push(makeVariant('robotic_hal_flat', 'HAL Flat', archetype, 0.9, 0.84, { textStyle: 'robotic', tags: ['hal'] }));
      variants.push(makeVariant('robotic_operator', 'Operator Crisp', archetype, 0.95, 0.9, { textStyle: 'robotic', tags: ['crisp'] }));
      variants.push(makeVariant('robotic_low_bus', 'Low Bus', archetype, 0.86, 0.78, { textStyle: 'robotic', tags: ['cold', 'machine'] }));
    } else if (archetype === 'SPOOKY') {
      variants.push(makeVariant('spooky_whisper_control', 'Whisper Control', archetype, 0.84, 0.8, { textStyle: 'spooky', tags: ['ideal'] }));
      variants.push(makeVariant('spooky_ghost_story', 'Ghost Story', archetype, 0.88, 0.86, { textStyle: 'spooky', tags: ['clearer'] }));
      variants.push(makeVariant('spooky_deep_void', 'Deep Void', archetype, 0.8, 0.74, { textStyle: 'spooky', tags: ['extreme'] }));
    } else if (archetype === 'CHAOTIC') {
      variants.push(makeVariant('chaotic_hype_balanced', 'Hype Balanced', archetype, 1.27, 1.18, { textStyle: 'chaotic', tags: ['ideal'] }));
      variants.push(makeVariant('chaotic_mask_snap', 'Mask Snap', archetype, 1.31, 1.16, { textStyle: 'chaotic', tags: ['punchy'] }));
      variants.push(makeVariant('chaotic_meme_burst', 'Meme Burst', archetype, 1.35, 1.25, { textStyle: 'chaotic', tags: ['extreme'] }));
      variants.push(makeVariant('chaotic_clear_fast', 'Clear Fast', archetype, 1.22, 1.12, { textStyle: 'chaotic', tags: ['clearer'] }));
    }

    out[archetype] = Object.freeze(variants);
  }
  return Object.freeze(out);
}

const ARCHETYPE_VARIANT_SUBSETS = buildVariantProfiles();

const LATENCY_TARGETS_DEFAULT = Object.freeze({
  firstGenerateMs: { good: 650, acceptable: 1400, fail: 2400 },
  cacheHitMs: { good: 45, acceptable: 120, fail: 300 },
  estimatedPrejoinBatchMs: { good: 3500, acceptable: 7000, fail: 12000, assumedConcurrency: 3 },
  cuePreemptFadeOutMs: { good: 70, acceptable: 120, fail: 180 }
});

function loadLatencyTargets() {
  const file = path.join(__dirname, 'fixtures', 'latency-targets.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.targets) return LATENCY_TARGETS_DEFAULT;
    return parsed.targets;
  } catch (_error) {
    return LATENCY_TARGETS_DEFAULT;
  }
}

function getVariantSubsetsForArchetype(archetype) {
  const key = normalizeArchetype(archetype);
  return Array.isArray(ARCHETYPE_VARIANT_SUBSETS[key])
    ? ARCHETYPE_VARIANT_SUBSETS[key]
    : [makeVariant('current_runtime', 'Current Runtime', key || 'ABSURD', 1, 1, { source: 'fallback' })];
}

function getCurrentVoiceForArchetype(archetype) {
  return CURRENT_ARCHETYPE_CAST_MAP[normalizeArchetype(archetype)] || 'af_heart';
}

function getArchetypeTarget(archetype) {
  return ARCHETYPE_TARGETS[normalizeArchetype(archetype)] || null;
}

function getVoiceById(voiceId) {
  return UNIVERSAL_VOICE_BY_ID[String(voiceId || '')] || null;
}

function stylizeEntryTextForArchetype(text, archetype, textStyle) {
  let next = String(text || '').replace(/\s+/g, ' ').trim();
  if (!next) return '';
  const style = String(textStyle || '').toLowerCase();
  const arch = normalizeArchetype(archetype);

  if (style === 'villain' || arch === 'VILLAIN') {
    next = next.replace(/:\s+/g, '... ').replace(/,\s+/g, '... ');
    if (!/[.!?]$/.test(next)) next = `${next}.`;
    return next;
  }
  if (style === 'heroic' || arch === 'HEROIC') {
    next = next.replace(/:\s+/g, '. ');
    if (!/[.!?]$/.test(next)) next = `${next}.`;
    return next;
  }
  if (style === 'robotic' || arch === 'ROBOTIC') {
    next = next.replace(/:\s+/g, '. ').replace(/,\s+/g, '. ');
    if (!/\bbeep\b/i.test(next) && next.length > 12) next = `Beep. ${next}`;
    if (!/[.!?]$/.test(next)) next = `${next}.`;
    return next;
  }
  if (style === 'spooky' || arch === 'SPOOKY') {
    next = next.replace(/:\s+/g, '... ').replace(/,\s+/g, '... ');
    if (!/[.!?]$/.test(next)) next = `${next}...`;
    return next;
  }
  if (style === 'chaotic' || arch === 'CHAOTIC') {
    next = next.replace(/:\s+/g, '! ');
    if (!/[!?]$/.test(next)) next = `${next}!`;
    return next;
  }
  if (style === 'cartoon' || arch === 'KID_CARTOON') {
    next = next.replace(/^([^:]{2,32}):\s+/i, '$1! ');
    if (!/[!?]$/.test(next)) next = `${next}!`;
    return next;
  }
  if (!/[.!?]$/.test(next)) next = `${next}.`;
  return next;
}

function scoreLatencyBand(valueMs, targetBand) {
  const ms = Number(valueMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0.35;
  const good = Number(targetBand && targetBand.good) || 1;
  const acceptable = Number(targetBand && targetBand.acceptable) || (good * 2);
  const fail = Number(targetBand && targetBand.fail) || (acceptable * 2);
  if (ms <= good) return 1;
  if (ms <= acceptable) {
    const t = (ms - good) / Math.max(1, acceptable - good);
    return 1 - (t * 0.35);
  }
  if (ms <= fail) {
    const t = (ms - acceptable) / Math.max(1, fail - acceptable);
    return 0.65 - (t * 0.5);
  }
  return 0.08;
}

function scoreProsodyFit(archetype, speed, pitch) {
  const target = getArchetypeTarget(archetype);
  if (!target) return 0.5;
  const speedNorm = Math.min(1, Math.abs(Number(speed) - target.speed) / 0.28);
  const pitchNorm = Math.min(1, Math.abs(Number(pitch) - target.pitch) / 0.22);
  const dist = (speedNorm * 0.55) + (pitchNorm * 0.45);
  return Math.max(0, 1 - dist);
}

function scoreVoicePersonaFit(archetype, voiceId) {
  const target = getArchetypeTarget(archetype);
  const voice = getVoiceById(voiceId);
  if (!target || !voice) return 0.45;
  const weights = target.traitWeights || {};
  let weighted = 0;
  let weightSum = 0;
  for (const [trait, weight] of Object.entries(weights)) {
    const val = Number(voice.persona[trait]);
    if (!Number.isFinite(val)) continue;
    const wAbs = Math.abs(weight);
    const desiredMatch = weight >= 0 ? val : (1 - val);
    weighted += desiredMatch * wAbs;
    weightSum += wAbs;
  }
  if (weightSum <= 0) return 0.5;
  return clamp(weighted / weightSum, 0, 1, 0.5);
}

function scoreGenderFit(genderHint, voiceId, archetype) {
  const voice = getVoiceById(voiceId);
  if (!voice) return 0.5;
  const hint = normalizeGenderHint(genderHint);
  const target = getArchetypeTarget(archetype);
  const bias = target && target.genderBias ? String(target.genderBias) : 'neutral';

  if (hint === 'neutral') {
    if (bias === 'neutral') return 1;
    return voice.gender === bias ? 0.92 : 0.84;
  }
  if (voice.gender === hint) return 1;
  if (bias !== 'neutral' && voice.gender === bias) return 0.85;
  return 0.62;
}

function scoreTextStyleFit(archetype, variant) {
  const target = getArchetypeTarget(archetype);
  if (!target) return 0.5;
  const textStyle = String(variant && variant.textStyle || '').toLowerCase();
  if (!textStyle) return 0.45;
  if (textStyle === String(target.preferredTextStyle || '').toLowerCase()) return 1;
  if (normalizeArchetype(archetype) === 'CHAOTIC' && textStyle === 'cartoon') return 0.82;
  if (normalizeArchetype(archetype) === 'KID_CARTOON' && textStyle === 'chaotic') return 0.8;
  return 0.58;
}

function scoreCandidateProxy(sample, candidate, latencyMetrics = null, latencyTargets = null) {
  const archetype = normalizeArchetype(sample && sample.archetype);
  const prosodyScore = scoreProsodyFit(archetype, candidate.speed, candidate.pitch);
  const voiceScore = scoreVoicePersonaFit(archetype, candidate.voiceId);
  const genderScore = scoreGenderFit(sample && sample.genderHint, candidate.voiceId, archetype);
  const textScore = scoreTextStyleFit(archetype, candidate.variant);

  let latencyScore = 0.7;
  if (latencyMetrics && latencyTargets) {
    const cold = scoreLatencyBand(latencyMetrics.firstGenerateMs, latencyTargets.firstGenerateMs);
    const warm = scoreLatencyBand(latencyMetrics.cacheHitMs, latencyTargets.cacheHitMs);
    const instant = scoreLatencyBand(
      latencyMetrics.cacheHitMs,
      latencyTargets.instantaneousAppliedMs || latencyTargets.cacheHitMs
    );
    const warmHit = latencyMetrics.warmCacheHit === true ? 1 : 0.18;
    const firstHit = latencyMetrics.firstCacheHit === true ? 1 : 0.55;
    latencyScore = (
      (cold * 0.2) +
      (warm * 0.2) +
      (instant * 0.35) +
      (warmHit * 0.15) +
      (firstHit * 0.1)
    );
  }

  const total = (
    (prosodyScore * 0.3) +
    (voiceScore * 0.34) +
    (genderScore * 0.12) +
    (textScore * 0.12) +
    (latencyScore * 0.12)
  );

  return {
    total: clamp(total, 0, 1, 0),
    components: {
      prosody: prosodyScore,
      voice: voiceScore,
      gender: genderScore,
      text: textScore,
      latency: latencyScore
    }
  };
}

function buildCandidateMatrixForSample(sample, options = {}) {
  const archetype = normalizeArchetype(sample && sample.archetype);
  const variants = getVariantSubsetsForArchetype(archetype);
  const currentVoiceId = getCurrentVoiceForArchetype(archetype);
  const rows = [];

  for (const voice of UNIVERSAL_VOICES) {
    for (const variant of variants) {
      const text = stylizeEntryTextForArchetype(sample && sample.text, archetype, variant.textStyle);
      const preScore = scoreCandidateProxy(sample, {
        voiceId: voice.id,
        speed: variant.speed,
        pitch: variant.pitch,
        variant
      }, null, null);
      rows.push({
        sampleId: String(sample && sample.id || ''),
        archetype,
        voiceId: voice.id,
        voiceLabel: voice.label,
        variant,
        subsetId: variant.subsetId,
        speed: variant.speed,
        pitch: variant.pitch,
        gain: variant.gain,
        text,
        isCurrentPick: (voice.id === currentVoiceId) && (variant.subsetId === 'current_runtime'),
        preScore: preScore.total,
        preScoreComponents: preScore.components
      });
    }
  }

  rows.sort((a, b) => {
    if (b.preScore !== a.preScore) return b.preScore - a.preScore;
    if (a.isCurrentPick !== b.isCurrentPick) return a.isCurrentPick ? -1 : 1;
    return a.voiceId.localeCompare(b.voiceId) || a.subsetId.localeCompare(b.subsetId);
  });

  const maxCandidates = Math.max(1, Number(options.maxCandidates) || 8);
  const picked = [];
  const seen = new Set();

  const current = rows.find((row) => row.isCurrentPick);
  if (current) {
    picked.push(current);
    seen.add(`${current.voiceId}|${current.subsetId}`);
  }

  for (const row of rows) {
    const key = `${row.voiceId}|${row.subsetId}`;
    if (seen.has(key)) continue;
    picked.push(row);
    seen.add(key);
    if (picked.length >= maxCandidates) break;
  }

  return picked;
}

function suggestSubsetAddition(sample, rankedRows) {
  if (!Array.isArray(rankedRows) || rankedRows.length < 2) return null;
  const best = rankedRows[0];
  const current = rankedRows.find((row) => row.isCurrentPick) || null;
  if (!current) return null;

  const delta = Number(best.finalScore || best.preScore || 0) - Number(current.finalScore || current.preScore || 0);
  if (delta < 0.08) return null;

  const sameVoiceUpgrade = String(best.voiceId) === String(current.voiceId) && String(best.subsetId) !== String(current.subsetId);
  const lowAbsoluteQuality = Number(best.finalScore || 0) < 0.72;
  if (!sameVoiceUpgrade && !lowAbsoluteQuality) return null;

  return {
    recommended: true,
    reason: sameVoiceUpgrade
      ? 'same voice significantly improves with a different prosody subset'
      : 'best available option still misses target score; add a new subset',
    archetype: normalizeArchetype(sample && sample.archetype),
    basedOnSampleId: String(sample && sample.id || ''),
    subsetCandidate: {
      subsetId: `${String(best.variant && best.variant.subsetId || 'variant')}_candidate`,
      label: `${String(best.variant && best.variant.label || 'Variant')} (Candidate)`,
      speed: Number(best.speed) || 1,
      pitch: Number(best.pitch) || 1,
      gain: Number(best.gain) || 1,
      textStyle: String(best.variant && best.variant.textStyle || 'neutral')
    },
    improvementDelta: Number(delta.toFixed(3))
  };
}

module.exports = {
  UNIVERSAL_VOICES,
  CURRENT_ARCHETYPE_CAST_MAP,
  BASE_ARCHETYPE_PRESETS,
  ENTRY_SPEED_DELTAS,
  ENTRY_PITCH_DELTAS,
  ARCHETYPE_TARGETS,
  ARCHETYPE_VARIANT_SUBSETS,
  LATENCY_TARGETS_DEFAULT,
  clamp,
  normalizeArchetype,
  normalizeGenderHint,
  currentRuntimeEntryProsody,
  getVariantSubsetsForArchetype,
  getCurrentVoiceForArchetype,
  getArchetypeTarget,
  getVoiceById,
  stylizeEntryTextForArchetype,
  scoreLatencyBand,
  scoreProsodyFit,
  scoreVoicePersonaFit,
  scoreGenderFit,
  scoreTextStyleFit,
  scoreCandidateProxy,
  buildCandidateMatrixForSample,
  suggestSubsetAddition,
  loadLatencyTargets
};
