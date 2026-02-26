import { ARCHETYPES } from './archetypes.js';

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeText(value = '') {
  try {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  } catch (error) {
    return String(value || '').toLowerCase();
  }
}

function keywordScore(text, terms = []) {
  let score = 0;
  for (let i = 0; i < terms.length; i += 1) {
    if (text.includes(terms[i])) score += 1;
  }
  return score;
}

export function mapSpeechStyleToArchetype(style = '') {
  const value = normalizeText(style);
  if (!value) return null;
  if (value.includes('villain')) return ARCHETYPES.VILLAIN;
  if (value.includes('spooky') || value.includes('ghost') || value.includes('whisper')) return ARCHETYPES.SPOOKY;
  if (value.includes('hero') || value.includes('cinematic')) return ARCHETYPES.HEROIC;
  if (value.includes('cartoon') || value.includes('bright') || value.includes('toon')) return ARCHETYPES.KID_CARTOON;
  if (value.includes('chaotic') || value.includes('chaos') || value.includes('meme')) return ARCHETYPES.CHAOTIC;
  if (value.includes('synthetic') || value.includes('robot')) return ARCHETYPES.ROBOTIC;
  if (value.includes('creature')) return ARCHETYPES.CREATURE;
  if (value.includes('command')) return ARCHETYPES.COMMANDER;
  if (value.includes('fast')) return ARCHETYPES.SPORTY;
  return null;
}

export function classifyEntryArchetype(entryName = '', context = {}) {
  const name = String(entryName || '').trim();
  const scenario = String(context && context.scenario || '').trim();
  const twist = String(context && context.twist || '').trim();
  const text = normalizeText(`${name} ${scenario} ${twist}`);
  const baseName = normalizeText(name);

  const explicitStyle = mapSpeechStyleToArchetype(context && context.voiceStyle);
  if (explicitStyle) {
    return { archetype: explicitStyle, confidence: 0.72, intensity: clamp01(context && context.intensity, 0.58) };
  }

  if (!name) {
    return { archetype: ARCHETYPES.ANNOUNCER, confidence: 0.32, intensity: 0.45 };
  }

  if (/^[A-Z0-9 !?._:-]{5,}$/.test(name) && /[A-Z]/.test(name)) {
    return { archetype: ARCHETYPES.ANNOUNCER, confidence: 0.84, intensity: 0.7 };
  }

  if (/\bmk\.?\s*[ivx0-9]+|\bunit\b|\bprotocol\b|\bmodel\b/.test(baseName)) {
    return { archetype: ARCHETYPES.ROBOTIC, confidence: 0.82, intensity: 0.62 };
  }

  const checks = [
    [ARCHETYPES.VILLAIN, ['doom', 'dark', 'evil', 'lord', 'vader', 'thanos', 'galactus', 'joker', 'devil', 'demon'], 0.84, 0.7],
    [ARCHETYPES.HEROIC, ['hero', 'captain', 'superman', 'batman', 'wonder', 'spider', 'knight', 'guardian'], 0.8, 0.68],
    [ARCHETYPES.CREATURE, ['dragon', 'wolf', 'bear', 'cat', 'dog', 'lion', 'tiger', 'pokemon', 'stitch', 'dinosaur'], 0.78, 0.62],
    [ARCHETYPES.MONSTER, ['kraken', 'godzilla', 'monster', 'ghoul', 'zombie', 'xenomorph'], 0.82, 0.72],
    [ARCHETYPES.KID_CARTOON, ['cartoon', 'spongebob', 'ben10', 'ben 10', 'scooby', 'dora', 'barney', 'icarly', 'avatar'], 0.86, 0.73],
    [ARCHETYPES.CUTE, ['hello kitty', 'pikachu', 'kirby', 'cute', 'baby', 'chibi'], 0.8, 0.72],
    [ARCHETYPES.SCIENTIST, ['dr ', 'doctor', 'professor', 'scientist', 'einstein', 'newton', 'senku', 'okabe'], 0.85, 0.6],
    [ARCHETYPES.DETECTIVE, ['detective', 'sherlock', 'holmes', 'batman', 'noir'], 0.77, 0.56],
    [ARCHETYPES.CORPORATE, ['ceo', 'manager', 'executive', 'corporate', 'accountant'], 0.8, 0.5],
    [ARCHETYPES.REGAL, ['king', 'queen', 'prince', 'princess', 'emperor', 'duke'], 0.84, 0.62],
    [ARCHETYPES.ANCIENT, ['ancient', 'pharaoh', 'zeus', 'odin', 'atlas', 'myth'], 0.76, 0.58],
    [ARCHETYPES.SPOOKY, ['ghost', 'phantom', 'spooky', 'haunt', 'specter', 'witch'], 0.82, 0.64],
    [ARCHETYPES.WESTERN, ['cowboy', 'ranger', 'sheriff', 'outlaw'], 0.8, 0.58],
    [ARCHETYPES.PIRATE, ['pirate', 'captain hook', 'blackbeard'], 0.82, 0.6],
    [ARCHETYPES.SPORTY, ['athlete', 'lebron', 'jordan', 'bolt', 'ohtani', 'soccer', 'nba', 'nfl'], 0.83, 0.7],
    [ARCHETYPES.COSMIC, ['space', 'cosmic', 'galaxy', 'star', 'alien', 'astro'], 0.74, 0.58],
    [ARCHETYPES.MAGICAL, ['wizard', 'mage', 'magic', 'gandalf', 'witch', 'sorcerer'], 0.84, 0.6],
    [ARCHETYPES.CELEBRITY, ['actor', 'singer', 'rapper', 'celebrity', 'peywdie', 'hemsworth', 'ross'], 0.68, 0.55],
    [ARCHETYPES.STEALTHY, ['ninja', 'assassin', 'spy', 'wick', 'shadow', 'stealth'], 0.82, 0.68],
    [ARCHETYPES.MENTOR, ['mentor', 'master', 'sensei', 'teacher', 'coach'], 0.76, 0.52],
    [ARCHETYPES.TRICKSTER, ['trickster', 'loki', 'prank', 'chaos', 'joker'], 0.8, 0.66],
    [ARCHETYPES.MEME, ['meme', 'shitpost', 'skibidi', 'pepe', 'doge'], 0.86, 0.78],
    [ARCHETYPES.OBJECT, ['gun', 'sword', 'portal gun', 'chair', 'sandwich', 'banana', 'device', 'machine'], 0.78, 0.52]
  ];

  let best = null;
  let bestHits = 0;
  for (let i = 0; i < checks.length; i += 1) {
    const [archetype, terms, confidence, intensity] = checks[i];
    const hits = keywordScore(text, terms);
    if (hits > bestHits) {
      bestHits = hits;
      best = { archetype, confidence, intensity };
    }
  }

  if (best) {
    const confidenceBoost = Math.min(0.12, (bestHits - 1) * 0.06);
    return {
      archetype: best.archetype,
      confidence: clamp01(best.confidence + confidenceBoost, best.confidence),
      intensity: clamp01(best.intensity + Math.min(0.1, (bestHits - 1) * 0.04), best.intensity)
    };
  }

  if (/\b(tv|show|movie|film|series)\b/.test(text)) {
    return { archetype: ARCHETYPES.ANNOUNCER, confidence: 0.58, intensity: 0.54 };
  }

  if (/\b(a|an|the)\s+[a-z]+\b/.test(baseName) || /\bwith a\b/.test(baseName)) {
    return { archetype: ARCHETYPES.ABSURD, confidence: 0.61, intensity: 0.66 };
  }

  if (/\d/.test(name) || /[!?]{2,}/.test(name)) {
    return { archetype: ARCHETYPES.CHAOTIC, confidence: 0.57, intensity: 0.7 };
  }

  if (/\bmr\.?\b|\bms\.?\b|\bdr\.?\b|\bprof/.test(baseName)) {
    return { archetype: ARCHETYPES.CORPORATE, confidence: 0.55, intensity: 0.48 };
  }

  return { archetype: ARCHETYPES.ABSURD, confidence: 0.42, intensity: 0.56 };
}

export function classifyVoiceCueArchetype(cue = {}) {
  const type = String(cue && cue.type || '').toLowerCase();
  if (type === 'twist') return { archetype: ARCHETYPES.ANNOUNCER, confidence: 0.8, intensity: 0.74 };
  if (type === 'round4') return { archetype: ARCHETYPES.NARRATOR, confidence: 0.85, intensity: 0.7 };
  if (type === 'narration') return { archetype: ARCHETYPES.NARRATOR, confidence: 0.75, intensity: 0.58 };
  return classifyEntryArchetype(cue && cue.text ? cue.text : '', cue || {});
}
