const BLURB_BATCH_CACHE_TTL_MS = 1000 * 90;
const MAX_BATCH_ENTRIES = 72;
const BATCH_VERSION = 4;

const blurbBatchCache = new Map();

const CATEGORY_PHRASES = Object.freeze({
  superhero: {
    label: 'Superhero Class',
    phrases: [
      'I will save them and keep moving.',
      'I will not give up on this city.',
      'Stand back. I can hold the line.',
      'I protect people first, always.',
      'I am here to stop the threat.',
      'No one gets left behind today.',
      'I will take the hit and push through.',
      'Never surrender. We finish the mission.',
      'I can still turn this around.',
      'I will keep fighting until they are safe.',
      'Hope stays up while I am standing.',
      'I do not run when people need help.'
    ]
  },
  villain: {
    label: 'Villain Class',
    phrases: [
      'You will watch the plan unfold.',
      'I already control the outcome.',
      'Fear is useful. I use it well.',
      'You are late. I prepared for this.',
      'I do not bluff when I make threats.',
      'I do not waste time on mercy.',
      'I break resolve before I strike.',
      'Every move you make will help me.',
      'I prefer silence before the collapse.',
      'This ends exactly how I designed it.',
      'Your panic is part of my strategy.',
      'I never needed your permission.'
    ]
  },
  cartoon: {
    label: 'Cartoon Class',
    phrases: [
      'I am ready. Let us do this.',
      'I bring a big smile, a big plan, and a big finish.',
      'I can fix this with extra energy.',
      'Time for a bright idea and a fast move.',
      'I am not worried. This is fun.',
      'We can save the day and laugh after.',
      'I brought chaos, snacks, and solutions.',
      'Okay, team, watch this move.',
      'I bounce back faster than the problem.',
      'This challenge needs cartoon confidence, and I can bring it.',
      'I am still cheerful and still winning.',
      'Let us make this look easy.'
    ]
  },
  athlete: {
    label: 'Athlete Class',
    phrases: [
      'I stay focused and finish strong.',
      'I can outlast this pressure.',
      'Discipline first. Results after.',
      'I trust the reps and the timing.',
      'I can adjust and win the next play.',
      'Keep the pace. Do not break form.',
      'I perform when the moment gets loud.',
      'I can carry this drive to the end.',
      'One more push and we take it.',
      'I train for chaos like this.'
    ]
  },
  cook: {
    label: 'Cook Class',
    phrases: [
      'Keep the station clean and move with purpose.',
      'I can salvage this service and still plate strong.',
      'Heat, timing, and discipline. I can handle all three.',
      'I stay sharp when the kitchen gets loud.',
      'I can turn pressure into execution.',
      'Prep first, panic never.',
      'I can fix this before the next order lands.',
      'Good fundamentals solve ugly situations.'
    ]
  },
  business: {
    label: 'Business Class',
    phrases: [
      'I can turn this chaos into a plan that scales.',
      'I read the risk first, then move.',
      'Execution matters more than noise, and I can execute.',
      'I can make this work with tight constraints.',
      'Strategy first. Optics second.',
      'I can close this with leverage and timing.',
      'Pressure is where decisions get valuable.',
      'I can stabilize this operation and keep momentum.'
    ]
  },
  entertainment: {
    label: 'Entertainment Class',
    phrases: [
      'I can carry the moment and keep the room with me.',
      'Timing, presence, and commitment. I am on it.',
      'I can turn pressure into a clean performance.',
      'The scene is messy, but I can still land it.',
      'I know how to make this look effortless.',
      'I can keep the energy up and the nerves down.',
      'Big moment. Clean finish. I can do both.',
      'I can hold attention while the plan resets.'
    ]
  },
  musician: {
    label: 'Musician Class',
    phrases: [
      'I hear the rhythm in the chaos.',
      'I can lead this with timing.',
      'The crowd follows confidence and tempo.',
      'I build momentum one beat at a time.',
      'I know when to hold and when to hit.',
      'Let the noise rise. I can shape it.',
      'I turn pressure into performance.',
      'I keep the energy and control the room.',
      'Every cue matters. I stay on beat.',
      'I can make this moment land.'
    ]
  },
  scientist: {
    label: 'Scientist Class',
    phrases: [
      'I need data, then I can solve it.',
      'This is messy, but the pattern is clear.',
      'I can test a faster solution.',
      'Give me one minute and a working model.',
      'The system can be stabilized.',
      'I trust evidence more than panic.',
      'I can reduce the failure risk.',
      'There is a method here. I can use it.',
      'We fix this by measuring first.',
      'I can build a cleaner approach.'
    ]
  },
  detective: {
    label: 'Detective Class',
    phrases: [
      'Something is off. I can prove it.',
      'I follow details before I trust stories.',
      'The answer is already in the pattern.',
      'I can read the room and the lie.',
      'Give me the timeline and I will find the gap.',
      'I do not guess when clues are talking.',
      'Every mistake leaves a trail.',
      'I can solve this without forcing it.',
      'Start with motive. The rest will move.',
      'I know where to look next.'
    ]
  },
  leader: {
    label: 'Leader Class',
    phrases: [
      'Stay steady. I will call the next move.',
      'We do this in order and we do it clean.',
      'I can keep this team aligned.',
      'Hold position. I will set the pace.',
      'Panic wastes time. Follow the plan.',
      'I take responsibility for the outcome.',
      'We move together and finish together.',
      'I can turn pressure into direction.',
      'Listen once, move fast, and stay sharp.',
      'I will lead from the front on this one.'
    ]
  },
  robot: {
    label: 'Robot Class',
    phrases: [
      'Directive acknowledged. Executing recovery plan.',
      'I can optimize this response path.',
      'I detected the threat. Countermeasures are ready.',
      'Processing is complete, and I selected the best option.',
      'I will stabilize the system now.',
      'Input accepted. Precision mode enabled.',
      'I can maintain output under stress.',
      'Sequence is locked, and I will proceed without delay.',
      'Analysis confirms a viable solution.',
      'Operational focus is stable, and I can continue.'
    ]
  },
  spooky: {
    label: 'Spooky Class',
    phrases: [
      'Do not look back. Keep moving.',
      'The silence knows your name, and I can hear it.',
      'I can feel the room shifting.',
      'Stay close. Something follows the noise.',
      'The air changed, and we are not alone.',
      'I move quietly when the lights fail.',
      'The hall remembers what happened here, and I can feel it.',
      'I can hear the warning before it lands.',
      'Do not panic. Breathe and listen.',
      'The shadows are active tonight.'
    ]
  },
  monster: {
    label: 'Monster Class',
    phrases: [
      'I hit hard and keep advancing.',
      'I can break through the front line.',
      'This pressure only wakes me up.',
      'I do not scare easy. I scare others.',
      'I can absorb chaos and push back.',
      'The threat grows louder when I move.',
      'I force space and take control.',
      'I can tear open a path through this.',
      'Do not mistake size for slowness.',
      'I finish what starts hunting me.'
    ]
  },
  outlaw: {
    label: 'Outlaw Class',
    phrases: [
      'I play rough, but I finish the job.',
      'I can work with bad odds and worse weather.',
      'I move first and ask later.',
      'Keep your hands steady and your head down.',
      'I know how to survive messy situations.',
      'Pressure makes people slow. I get faster.',
      'I can ride this chaos out.',
      'Trust the move, not the noise.',
      'I keep one plan and one backup.',
      'I do not fold under heat.'
    ]
  },
  anime: {
    label: 'Anime Class',
    phrases: [
      'I can push past my limit right now.',
      'This is where resolve becomes power.',
      'I will protect everyone and keep moving.',
      'Do not blink. The next move is mine.',
      'I can win this with pure focus.',
      'My will is stronger than this pressure.',
      'I trained for a moment like this.',
      'I will rise again if I fall.',
      'The fight changes when I get serious.',
      'I can turn doubt into momentum.'
    ]
  },
  celebrity: {
    label: 'Celebrity Class',
    phrases: [
      'I can handle the spotlight and the pressure.',
      'The room is loud, but I stay composed.',
      'I know how to make this moment land.',
      'I can command attention and keep control.',
      'Performance matters, so I show up.',
      'I can turn chaos into a clean entrance.',
      'This is pressure, not a problem.',
      'I know how to sell the finish.',
      'I can keep the crowd with me.',
      'Timing and confidence carry this.'
    ]
  },
  object: {
    label: 'Object Class',
    phrases: [
      'I may be simple, but I still matter.',
      'Use me correctly and I solve the problem.',
      'I can be more useful than I look.',
      'I fit the plan if you think clearly.',
      'I do one job and I do it well.',
      'Do not underestimate practical tools.',
      'I can change the outcome in the right hands.',
      'I am not flashy. I am effective.',
      'A smart move makes me dangerous.',
      'I can carry more value than expected.'
    ]
  },
  wildcard: {
    label: 'Wildcard Class',
    phrases: [
      'I can adapt before the next problem lands.',
      'Give me a direction and I will move.',
      'I work best when the plan gets messy.',
      'I can still contribute under pressure.',
      'The situation changed, so I changed too.',
      'I can make this useful right now.',
      'Do not count me out yet.',
      'I can find an angle that works.',
      'We still have options, and I am one of them.',
      'I can help turn this around.',
      'This setup is strange, but I can work with it.',
      'I am ready for the improvised version.'
    ]
  }
});

const CATEGORY_HINTS = Object.freeze([
  ['superhero', ['superhero', 'super hero', 'avenger', 'justice league', 'marvel', 'dc comics', 'vigilante', 'cape', 'batman', 'superman', 'wonder woman', 'spider', 'iron man', 'the flash', 'captain america', 'powerpuff']],
  ['villain', ['villain', 'supervillain', 'evil', 'dark lord', 'tyrant', 'doom', 'joker', 'vader', 'thanos', 'maleficent', 'sauron']],
  ['cartoon', ['cartoon', 'animated', 'animation', 'toon', 'spongebob', 'nickelodeon', 'disney', 'pixar', 'looney', 'powerpuff', 'mickey', 'minnie']],
  ['robot', ['robot', 'android', 'cyborg', 'artificial intelligence', 'ai ', ' ai', 'droid', 'mech', 'machine', 'protocol', 'unit ', 'hologram']],
  ['spooky', ['ghost', 'phantom', 'haunted', 'spirit', 'specter', 'zombie', 'horror', 'witch', 'vampire', 'demon']],
  ['monster', ['monster', 'creature', 'beast', 'kaiju', 'dragon', 'godzilla', 'xenomorph', 'werewolf', 'alien']],
  ['athlete', ['athlete', 'basketball', 'baseball', 'football', 'soccer', 'tennis', 'olympic', 'nba', 'nfl', 'mlb', 'pitcher', 'quarterback', 'lebron', 'ohtani']],
  ['cook', ['chef', 'cook', 'kitchen', 'culinary', 'restaurant', 'recipe', 'gordon ramsay', 'ramsay', 'baker', 'food network']],
  ['business', ['business', 'entrepreneur', 'ceo', 'founder', 'investor', 'executive', 'startup', 'company', 'corporation', 'boardroom']],
  ['entertainment', ['actor', 'actress', 'comedian', 'director', 'performer', 'entertainer', 'movie star', 'hollywood', 'wrestler', 'show host']],
  ['musician', ['musician', 'singer', 'rapper', 'songwriter', 'guitarist', 'drummer', 'band', 'album', 'vocalist', 'rock']],
  ['scientist', ['scientist', 'inventor', 'engineer', 'physicist', 'chemist', 'researcher', 'professor', 'laboratory', 'lab']],
  ['detective', ['detective', 'investigator', 'sleuth', 'forensic', 'sherlock', 'holmes']],
  ['leader', ['president', 'prime minister', 'king', 'queen', 'emperor', 'monarch', 'ruler', 'dictator', 'chancellor']],
  ['outlaw', ['outlaw', 'cowboy', 'gunslinger', 'bandit', 'sheriff', 'western', 'pirate', 'rogue', 'mercenary']],
  ['anime', ['anime', 'manga', 'shinobi', 'ninja', 'samurai', 'one piece', 'naruto', 'dragon ball', 'otaku']],
  ['celebrity', ['actor', 'actress', 'comedian', 'director', 'celebrity', 'host', 'influencer', 'television personality', 'tv personality']],
  ['object', ['object', 'tool', 'device', 'weapon', 'ball', 'racket', 'chair', 'banana', 'sword', 'gun']]
]);

const CATEGORY_PRIORITY = Object.freeze({
  superhero: 120,
  villain: 115,
  spooky: 110,
  robot: 108,
  monster: 106,
  cartoon: 104,
  anime: 102,
  athlete: 90,
  cook: 89,
  business: 89,
  entertainment: 89,
  musician: 88,
  detective: 86,
  scientist: 84,
  leader: 82,
  outlaw: 80,
  celebrity: 78,
  object: 72,
  wildcard: 0
});

const FINALE_VICTORY_PHRASES = Object.freeze({
  heroic: [
    'We did it. I kept the line and we brought it home.',
    'Victory secured. I told you we would finish this.',
    'That is a clean win. We never stopped pushing.',
    'Mission complete. I will take this one proudly.',
    'We held steady and took the crown.'
  ],
  villain: [
    'Of course we won. I planned for this.',
    'Predictable. I already saw the ending.',
    'I guess I did the heavy lifting again.',
    'You can call it a win. I call it inevitability.',
    'They never had the leverage to stop us.'
  ],
  cartoon: [
    'Wow, we won!? Okay, that was awesome.',
    'We did it! Big energy, big finish, big win.',
    'That was wild and I loved every second.',
    'Victory unlocked. Somebody celebrate loudly.',
    'That was fun. Let us do that again.'
  ],
  robotic: [
    'Victory confirmed. Outcome aligned with projection.',
    'Result complete. Team performance exceeded threshold.',
    'Final status: win secured. Efficiency acceptable.',
    'Objective achieved. Recording successful outcome.',
    'Analysis complete. We won.'
  ],
  spooky: [
    'The room went quiet, and then we won.',
    'The shadows stayed with us. So did the victory.',
    'I felt the turn before it happened. We won.',
    'Keep your voice down. The win is ours.',
    'Something followed us here, but so did the crown.'
  ],
  chaotic: [
    'GGs everybody, that was chaos and I loved it.',
    'That was easy. Okay, maybe not easy, but still a win.',
    'We broke the plan, rebuilt it, and won anyway.',
    'Absolute madness. Absolute victory.',
    'I cannot believe that worked. Run it back.'
  ],
  cinematic: [
    'That was a strong finish. We earned this win.',
    'Great composure. Great timing. Great result.',
    'We stayed sharp and closed it out.',
    'That was fun. Clean work from the whole team.',
    'I will take that win every time.'
  ],
  neutral: [
    'GGs everybody. We got the win.',
    'Nice work. We closed it out.',
    'That was fun. Good finish.',
    'We stayed in it and got the result.',
    'Solid win. I will take it.'
  ]
});

function nowIso() {
  return new Date().toISOString();
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSlug(text = '') {
  let normalized = String(text || '').trim();
  if (!normalized) return '';
  try {
    normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch (_error) {
  }
  return normalized
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\u2019'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function tokenize(value = '') {
  const slug = sanitizeSlug(value);
  return slug ? slug.split('-').filter(Boolean) : [];
}

function normalizeText(value = '') {
  try {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  } catch (_error) {
    return String(value || '').toLowerCase();
  }
}

function shortHash(value = '') {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function pickDeterministicIndex(seedText = '', length = 1) {
  const size = Math.max(1, Number(length) || 1);
  return shortHash(seedText) % size;
}

function getCached(cache, key) {
  const row = cache.get(key);
  if (!row) return null;
  if ((Number(row.expiresAt) || 0) <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

function setCached(cache, key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || 1000) });
  return value;
}

function pruneCache(cache) {
  const now = Date.now();
  for (const [key, row] of cache.entries()) {
    if (!row || (Number(row.expiresAt) || 0) <= now) cache.delete(key);
  }
}

function normalizeMeta(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const aliases = Array.isArray(src.aliases) ? src.aliases : [];
  const riskFlags = Array.isArray(src.riskFlags) ? src.riskFlags : [];
  return {
    character: String(src.character || src.name || '').trim(),
    resolvedTitle: String(src.resolvedTitle || '').trim(),
    aliases: aliases.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 16),
    description: String(src.description || src.resolvedDescriptionSnippet || '').replace(/\s+/g, ' ').trim().slice(0, 700),
    resolvedSource: String(src.resolvedSource || src.source || '').trim(),
    riskFlags: riskFlags.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 16),
    imageSynthetic: Boolean(src.imageSynthetic),
    infoConfidence: clamp(src.infoConfidence, 0, 1, 0),
    resolverConfidence: clamp(src.resolverConfidence, 0, 1, 0),
    ovr: clamp(src.ovr, 0, 99, 0)
  };
}

function buildMetaSignature(meta = {}) {
  const m = normalizeMeta(meta);
  return [
    m.character,
    m.resolvedTitle,
    m.aliases.join('|'),
    sanitizeSlug(m.description).slice(0, 120),
    m.resolvedSource,
    m.riskFlags.slice(0, 6).join('|'),
    String(m.infoConfidence || 0),
    String(m.resolverConfidence || 0),
    String(m.ovr || 0)
  ].join('||');
}

function phraseLibraryPayload() {
  return {
    version: 1,
    mode: 'phrase-association',
    indexedClipCount: 0,
    manifestClipCount: 0,
    totalResolvableSources: 0,
    libraryEmpty: true,
    librarySignature: `phrase-association-v${BATCH_VERSION}`,
    generatedAt: nowIso()
  };
}

function scoreCategoryFromText(text = '', categoryId = '') {
  const hints = CATEGORY_HINTS.find((row) => row[0] === categoryId);
  if (!hints) return 0;
  const tokens = hints[1] || [];
  let score = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const hint = String(tokens[i] || '').toLowerCase();
    if (!hint) continue;
    if (text.includes(hint)) score += hint.includes(' ') ? 10 : 6;
  }
  return score;
}

function inferAssociationCategory(meta = {}) {
  const m = normalizeMeta(meta);
  const joined = `${m.character} ${m.resolvedTitle} ${(m.aliases || []).join(' ')} ${m.description}`;
  const text = normalizeText(joined);
  const source = normalizeText(m.resolvedSource || '');
  const scores = new Map();

  for (const [categoryId] of CATEGORY_HINTS) {
    scores.set(categoryId, scoreCategoryFromText(text, categoryId));
  }

  if (/wikiquote|wikipedia/.test(source) && /fictional character/.test(text)) {
    scores.set('superhero', (scores.get('superhero') || 0) + 2);
    scores.set('cartoon', (scores.get('cartoon') || 0) + 1);
  }
  if (/band|singer|rapper|album/.test(text)) {
    scores.set('musician', (scores.get('musician') || 0) + 4);
  }
  if (/chef|cook|kitchen|culinary|restaurant/.test(text)) {
    scores.set('cook', (scores.get('cook') || 0) + 5);
  }
  if (/ceo|founder|entrepreneur|executive|investor|startup|company/.test(text)) {
    scores.set('business', (scores.get('business') || 0) + 5);
  }
  if (/actor|actress|comedian|performer|director|host|entertainment/.test(text)) {
    scores.set('entertainment', (scores.get('entertainment') || 0) + 5);
    scores.set('celebrity', (scores.get('celebrity') || 0) + 2);
  }
  if (/player|athlete|league|team/.test(text)) {
    scores.set('athlete', (scores.get('athlete') || 0) + 4);
  }
  if (/president|prime minister|king|queen|ruler/.test(text)) {
    scores.set('leader', (scores.get('leader') || 0) + 4);
  }
  if (/detective|investigator|sleuth/.test(text)) {
    scores.set('detective', (scores.get('detective') || 0) + 4);
  }

  let bestId = 'wildcard';
  let bestScore = 0;
  for (const [categoryId, score] of scores.entries()) {
    const total = Number(score) || 0;
    if (total <= 0) continue;
    const priority = Number(CATEGORY_PRIORITY[categoryId]) || 0;
    const bestPriority = Number(CATEGORY_PRIORITY[bestId]) || 0;
    if (total > bestScore || (total === bestScore && priority > bestPriority)) {
      bestId = categoryId;
      bestScore = total;
    }
  }

  const categoryInfo = CATEGORY_PHRASES[bestId] || CATEGORY_PHRASES.wildcard;
  const confidence = clamp(
    bestId === 'wildcard' ? 0.52 : (0.58 + (Math.min(5, bestScore) * 0.06)),
    0.35,
    0.93,
    0.6
  );
  return {
    id: bestId,
    label: String(categoryInfo && categoryInfo.label || 'Wildcard Class'),
    confidence,
    score: bestScore
  };
}

function inferVoiceProfile(meta = {}, categoryInfo = null) {
  const m = normalizeMeta(meta);
  const text = normalizeText(`${m.character} ${m.resolvedTitle} ${(m.aliases || []).join(' ')} ${m.description}`);
  const categoryId = String(categoryInfo && categoryInfo.id || 'wildcard');

  const has = (terms = []) => terms.some((term) => {
    const token = String(term || '').toLowerCase().trim();
    if (!token) return false;
    if (token.length <= 3 && /^[a-z0-9]+$/i.test(token)) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
    }
    return text.includes(token);
  });

  if (has(['ghost', 'phantom', 'haunt', 'specter', 'vampire', 'witch', 'horror', 'spirit'])) {
    return { voiceStyle: 'spooky', temperament: 'spooky_whisper', rate: 0.84, pitch: 0.8, gain: 0.94 };
  }
  if (has(['robot', 'android', 'cyborg', 'droid', 'ai', 'protocol', 'unit', 'machine', 'hologram'])) {
    return { voiceStyle: 'robotic', temperament: 'robotic_controlled', rate: 0.9, pitch: 0.84, gain: 0.95 };
  }
  if (has(['joker', 'harley', 'chaos', 'trickster', 'mad', 'meme', 'wild'])) {
    return { voiceStyle: 'chaotic', temperament: 'chaotic_hype', rate: 1.2, pitch: 1.12, gain: 0.96 };
  }
  if (has(['villain', 'supervillain', 'doom', 'vader', 'thanos', 'maleficent', 'dark lord', 'tyrant'])) {
    return { voiceStyle: 'villain', temperament: 'villain_dark', rate: 0.84, pitch: 0.8, gain: 0.95 };
  }
  if (has(['cartoon', 'animated', 'toon', 'spongebob', 'mickey', 'minnie', 'powerpuff', 'pixar', 'disney'])) {
    return { voiceStyle: 'cartoon', temperament: 'cartoon_bright', rate: 1.18, pitch: 1.18, gain: 0.95 };
  }
  if (has(['superhero', 'hero', 'avenger', 'justice league', 'batman', 'superman', 'wonder woman', 'captain america'])) {
    return { voiceStyle: 'heroic', temperament: 'heroic', rate: 0.92, pitch: 0.94, gain: 0.95 };
  }

  switch (categoryId) {
    case 'superhero': return { voiceStyle: 'heroic', temperament: 'heroic', rate: 0.92, pitch: 0.94, gain: 0.95 };
    case 'villain': return { voiceStyle: 'villain', temperament: 'villain_dark', rate: 0.84, pitch: 0.8, gain: 0.95 };
    case 'cartoon': return { voiceStyle: 'cartoon', temperament: 'cartoon_bright', rate: 1.18, pitch: 1.18, gain: 0.95 };
    case 'robot': return { voiceStyle: 'robotic', temperament: 'robotic_controlled', rate: 0.9, pitch: 0.84, gain: 0.95 };
    case 'spooky': return { voiceStyle: 'spooky', temperament: 'spooky_whisper', rate: 0.84, pitch: 0.8, gain: 0.94 };
    case 'monster': return { voiceStyle: 'villain', temperament: 'monster_brutal', rate: 0.88, pitch: 0.84, gain: 0.96 };
    case 'outlaw': return { voiceStyle: 'villain', temperament: 'outlaw_gritty', rate: 0.9, pitch: 0.9, gain: 0.95 };
    case 'anime': return { voiceStyle: 'heroic', temperament: 'anime_resolve', rate: 1.02, pitch: 1.02, gain: 0.95 };
    case 'athlete': return { voiceStyle: 'cinematic', temperament: 'neutral_expressive', rate: 1.01, pitch: 1.0, gain: 0.95 };
    case 'cook': return { voiceStyle: 'cinematic', temperament: 'neutral_expressive', rate: 1.02, pitch: 1.03, gain: 0.95 };
    case 'business': return { voiceStyle: 'cinematic', temperament: 'neutral_expressive', rate: 0.98, pitch: 0.98, gain: 0.95 };
    case 'entertainment': return { voiceStyle: 'cinematic', temperament: 'neutral_expressive', rate: 1.04, pitch: 1.04, gain: 0.95 };
    case 'musician': return { voiceStyle: 'chaotic', temperament: 'expressive_performer', rate: 1.06, pitch: 1.05, gain: 0.95 };
    case 'scientist': return { voiceStyle: 'cinematic', temperament: 'neutral_expressive', rate: 0.96, pitch: 0.98, gain: 0.95 };
    case 'detective': return { voiceStyle: 'cinematic', temperament: 'neutral_expressive', rate: 0.9, pitch: 0.93, gain: 0.95 };
    case 'leader': return { voiceStyle: 'heroic', temperament: 'neutral_expressive', rate: 0.92, pitch: 0.95, gain: 0.95 };
    case 'celebrity': return { voiceStyle: 'cinematic', temperament: 'neutral_expressive', rate: 1.0, pitch: 1.02, gain: 0.95 };
    case 'object': return { voiceStyle: 'robotic', temperament: 'object_practical', rate: 0.95, pitch: 0.92, gain: 0.95 };
    default: return { voiceStyle: 'cinematic', temperament: 'neutral_expressive', rate: 0.98, pitch: 1.0, gain: 0.95 };
  }
}

function isDangerousTitleDiff(meta = {}) {
  return Array.isArray(meta.riskFlags) && meta.riskFlags.some((flag) => /dangerous_title_diff/i.test(String(flag || '')));
}

function pickDisplayName(meta = {}, { preferResolved = false } = {}) {
  const m = normalizeMeta(meta);
  const character = String(m.character || '').trim();
  const resolved = String(m.resolvedTitle || '').trim();
  if (preferResolved && resolved && !isDangerousTitleDiff(m)) return resolved;
  return character || resolved || 'Unknown';
}

function pickFinaleVictoryPhrase(meta = {}, voice = {}, category = {}) {
  const style = String(voice && voice.voiceStyle || 'cinematic').toLowerCase();
  const pool = FINALE_VICTORY_PHRASES[style]
    || FINALE_VICTORY_PHRASES.cinematic
    || FINALE_VICTORY_PHRASES.neutral;
  const seed = [
    'finale-victory',
    String(category && category.id || 'wildcard'),
    String(meta.character || ''),
    String(meta.resolvedTitle || ''),
    String(meta.ovr || 0)
  ].join('|');
  const index = pickDeterministicIndex(seed, pool.length);
  const raw = String(pool[index] || pool[0] || 'We won.').trim();
  const name = pickDisplayName(meta, { preferResolved: true });
  return {
    text: raw.replace(/\{entry name\}|\{name\}/gi, name),
    index
  };
}

function pickAssociationPhrase(meta = {}, categoryInfo = null) {
  const categoryId = String(categoryInfo && categoryInfo.id || 'wildcard');
  const poolObj = CATEGORY_PHRASES[categoryId] || CATEGORY_PHRASES.wildcard;
  const pool = Array.isArray(poolObj && poolObj.phrases) && poolObj.phrases.length ? poolObj.phrases : CATEGORY_PHRASES.wildcard.phrases;
  const seed = [
    categoryId,
    String(meta.character || ''),
    String(meta.resolvedTitle || ''),
    String(meta.ovr || 0),
    String(meta.resolvedSource || '')
  ].join('|');
  const index = pickDeterministicIndex(seed, pool.length);
  return {
    text: String(pool[index] || pool[0] || 'I can help turn this around.'),
    index
  };
}

function buildAssociationSpeech(meta = {}) {
  const m = normalizeMeta(meta);
  const category = inferAssociationCategory(m);
  const phrase = pickAssociationPhrase(m, category);
  const voice = inferVoiceProfile(m, category);
  const displayName = pickDisplayName(m, { preferResolved: false });
  const trust = Math.max(Number(m.infoConfidence) || 0, Number(m.resolverConfidence) || 0);
  const confidence = clamp(Math.max(0.55, (Number(category.confidence) || 0.55) * 0.75 + trust * 0.25), 0.45, 0.96, 0.7);

  return {
    mode: 'speech-fact',
    speech: {
      text: phrase.text,
      displayText: `${displayName} (${category.label}) - ${phrase.text}`,
      source: `association-${category.id}`,
      sourceTitle: category.label,
      sourceUrl: null,
      confidence,
      voiceStyle: voice.voiceStyle,
      rate: voice.rate,
      pitch: voice.pitch,
      gain: voice.gain,
      temperament: String(voice.temperament || ''),
      classId: category.id,
      classLabel: category.label,
      phraseIndex: phrase.index
    },
    association: {
      classId: category.id,
      classLabel: category.label,
      classConfidence: category.confidence,
      classScore: category.score,
      phraseIndex: phrase.index,
      voiceStyle: voice.voiceStyle,
      temperament: String(voice.temperament || '')
    }
  };
}

function buildFinaleMvpVictorySpeech(meta = {}) {
  const m = normalizeMeta(meta);
  const category = inferAssociationCategory(m);
  const voice = inferVoiceProfile(m, category);
  const phrase = pickFinaleVictoryPhrase(m, voice, category);
  const displayName = pickDisplayName(m, { preferResolved: true });
  const trust = Math.max(Number(m.infoConfidence) || 0, Number(m.resolverConfidence) || 0);
  const confidence = clamp(Math.max(0.62, (Number(category.confidence) || 0.55) * 0.7 + trust * 0.3), 0.48, 0.98, 0.75);

  return {
    mode: 'speech-fact',
    speech: {
      text: phrase.text,
      displayText: `${displayName} (MVP) - ${phrase.text}`,
      source: 'association-finale-victory',
      sourceTitle: 'Finale MVP Victory Callout',
      sourceUrl: null,
      confidence,
      voiceStyle: voice.voiceStyle,
      rate: Math.max(0.72, Math.min(1.24, Number(voice.rate) || 1)),
      pitch: Math.max(0.72, Math.min(1.24, Number(voice.pitch) || 1)),
      gain: Math.max(0.7, Math.min(1.05, Number(voice.gain) || 0.95)),
      temperament: String(voice.temperament || ''),
      classId: category.id,
      classLabel: category.label,
      phraseIndex: phrase.index,
      variant: 'finale-mvp-victory',
      correctedName: displayName
    },
    association: {
      classId: category.id,
      classLabel: category.label,
      classConfidence: category.confidence,
      classScore: category.score,
      phraseIndex: phrase.index,
      voiceStyle: voice.voiceStyle,
      temperament: String(voice.temperament || ''),
      variant: 'finale-mvp-victory'
    }
  };
}

async function resolveAudioBlurbBatch(_clipsDir, entries = [], options = {}) {
  const startedAt = Date.now();
  pruneCache(blurbBatchCache);
  const purpose = String(options && options.purpose || 'entry-callout').trim().toLowerCase() || 'entry-callout';
  const isFinaleVictoryMode = purpose === 'finale-mvp-victory';

  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .slice(0, MAX_BATCH_ENTRIES)
    .map((entry) => normalizeMeta(entry));

  const library = phraseLibraryPayload();
  const batchKey = `${library.librarySignature}|purpose:${purpose}|${normalizedEntries.map((meta) => buildMetaSignature(meta)).join('~')}`;
  const cached = getCached(blurbBatchCache, batchKey);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const classCounts = {};
  const sourceCounts = {};
  const finalRows = normalizedEntries.map((meta, index) => {
    const resolved = isFinaleVictoryMode ? buildFinaleMvpVictorySpeech(meta) : buildAssociationSpeech(meta);
    const source = String(resolved && resolved.speech && resolved.speech.source || '').trim();
    if (source) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    const classId = String(resolved && resolved.association && resolved.association.classId || 'wildcard');
    classCounts[classId] = (classCounts[classId] || 0) + 1;
    return {
      index,
      signature: buildMetaSignature(meta),
      character: meta.character || '',
      resolvedTitle: meta.resolvedTitle || '',
      mode: String(resolved.mode || 'speech-fact'),
      snippet: null,
      speech: resolved.speech,
      association: resolved.association,
      matchScore: Number(resolved && resolved.association && resolved.association.classScore) || 0,
      matchSource: 'association',
      quoteFetchMs: 0,
      clipLibraryEmpty: false
    };
  });

  const stats = {
    requested: normalizedEntries.length,
    audioClip: 0,
    speechQuote: 0,
    speechFact: finalRows.length,
    speechAssociation: finalRows.length,
    libraryEmpty: 0,
    misses: 0,
    wikiquoteEligible: 0,
    wikiquoteBudget: 0,
    wikiquoteAllowed: 0,
    wikiquoteSkippedBudget: 0,
    externalFactEligible: 0,
    externalFactBudget: 0,
    externalFactAllowed: 0,
    externalFactSkippedBudget: 0,
    externalFactHits: 0,
    localFirstPlanned: 0,
    quoteFetchMsAvg: 0,
    associationClassCounts: classCounts,
    associationSourceCounts: sourceCounts,
    purpose,
    finaleMvpVictory: isFinaleVictoryMode ? finalRows.length : 0,
    elapsedMs: Math.max(0, Date.now() - startedAt)
  };

  const payload = {
    version: BATCH_VERSION,
    generatedAt: nowIso(),
    cacheHit: false,
    library,
    results: finalRows,
    stats
  };

  setCached(blurbBatchCache, batchKey, payload, BLURB_BATCH_CACHE_TTL_MS);
  return payload;
}

module.exports = {
  resolveAudioBlurbBatch,
  resolveAudioCalloutBatch: resolveAudioBlurbBatch
};
