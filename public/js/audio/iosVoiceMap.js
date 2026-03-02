const IOS_CURATED_VOICE_PROFILES = Object.freeze({
  af_heart: Object.freeze({
    preferredLangs: Object.freeze(['en-us', 'en']),
    targetGender: 'female',
    nameHints: Object.freeze(['samantha', 'ava', 'karen', 'victoria', 'serena', 'susan'])
  }),
  af_bella: Object.freeze({
    preferredLangs: Object.freeze(['en-us', 'en']),
    targetGender: 'female',
    nameHints: Object.freeze(['allison', 'zoe', 'moira', 'serena', 'victoria', 'susan'])
  }),
  am_michael: Object.freeze({
    preferredLangs: Object.freeze(['en-us', 'en']),
    targetGender: 'male',
    nameHints: Object.freeze(['aaron', 'nathan', 'tom', 'fred', 'alex', 'daniel'])
  }),
  bm_george: Object.freeze({
    preferredLangs: Object.freeze(['en-gb', 'en']),
    targetGender: 'male',
    nameHints: Object.freeze(['daniel', 'arthur', 'gordon', 'oliver', 'thomas', 'rishi'])
  })
});

const DISALLOWED_VOICE_NAME_RE = /(compact|espeak|festival|robot)/i;
const FEMALE_HINT_RE = /(ava|samantha|allison|zoe|moira|karen|victoria|serena|susan|female|woman|girl)/i;
const MALE_HINT_RE = /(aaron|nathan|tom|fred|alex|daniel|arthur|gordon|oliver|thomas|rishi|male|man|boy)/i;

function getSpeechVoiceStableId(voice = null) {
  if (!voice || typeof voice !== 'object') return '';
  const uri = String(voice.voiceURI || '').trim();
  const name = String(voice.name || '').trim();
  const lang = String(voice.lang || '').trim();
  if (!uri && !name) return '';
  return `${uri || name}::${lang}`;
}

function scoreIosVoiceForProfile(voice = null, profile = null) {
  if (!voice || typeof voice !== 'object') return Number.NEGATIVE_INFINITY;
  const name = String(voice.name || '').toLowerCase();
  const uri = String(voice.voiceURI || '').toLowerCase();
  const lang = String(voice.lang || '').toLowerCase();
  const combined = `${name} ${uri}`.trim();

  if (DISALLOWED_VOICE_NAME_RE.test(combined)) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (!lang.startsWith('en')) score -= 60;
  if (lang.startsWith('en-us')) score += 18;
  else if (lang.startsWith('en-gb')) score += 16;
  else if (lang.startsWith('en')) score += 10;
  if (voice && voice.default) score += 3;
  if (/(enhanced|natural|neural|premium|quality)/.test(combined)) score += 8;
  if (/(apple|ios|iphone|ipad|macos)/.test(combined)) score += 4;
  if (/siri/.test(combined)) score += 2;
  const targetGender = String(profile && profile.targetGender || '').toLowerCase();
  if (targetGender === 'female') {
    if (FEMALE_HINT_RE.test(combined)) score += 12;
    if (MALE_HINT_RE.test(combined)) score -= 26;
  } else if (targetGender === 'male') {
    if (MALE_HINT_RE.test(combined)) score += 12;
    if (FEMALE_HINT_RE.test(combined)) score -= 22;
  }

  const preferredLangs = Array.isArray(profile && profile.preferredLangs) ? profile.preferredLangs : [];
  const nameHints = Array.isArray(profile && profile.nameHints) ? profile.nameHints : [];

  for (let i = 0; i < preferredLangs.length; i += 1) {
    const prefLang = String(preferredLangs[i] || '').trim().toLowerCase();
    if (!prefLang) continue;
    if (lang === prefLang) {
      score += (22 - (i * 2));
      break;
    }
    if (lang.startsWith(prefLang)) {
      score += (14 - i);
      break;
    }
  }

  for (let i = 0; i < nameHints.length; i += 1) {
    const hint = String(nameHints[i] || '').trim().toLowerCase();
    if (!hint) continue;
    if (combined.includes(hint)) {
      score += Math.max(6, 56 - (i * 6));
      break;
    }
  }

  return score;
}

export function pickBestIosVoiceForCuratedId(
  voices = [],
  voiceId = '',
  { excludeStableIds = null } = {}
) {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return null;

  const profile = IOS_CURATED_VOICE_PROFILES[String(voiceId || '').trim()] || null;
  const excluded = excludeStableIds instanceof Set ? excludeStableIds : null;

  const pickBest = (excludeSet = null) => {
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < list.length; i += 1) {
      const voice = list[i];
      const stableId = getSpeechVoiceStableId(voice);
      if (excludeSet && stableId && excludeSet.has(stableId)) continue;
      const score = scoreIosVoiceForProfile(voice, profile) + (i * 0.001);
      if (score > bestScore) {
        bestScore = score;
        best = voice;
      }
    }
    return { best, bestScore };
  };

  const uniquePick = pickBest(excluded);
  if (!excluded || uniquePick.bestScore >= 16 || !uniquePick.best) {
    return uniquePick.best;
  }

  // If uniqueness constraints force a poor voice (common on iOS with small voice pools),
  // allow reusing the best high-quality voice rather than picking a robotic-sounding alternative.
  const relaxedPick = pickBest(null);
  return relaxedPick.best || uniquePick.best;
}

