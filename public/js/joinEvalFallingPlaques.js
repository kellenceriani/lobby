/* =========================================================
   JOIN SCREEN – FALLING EVAL PLAQUES (ROUND 4 CLEAN GLASS v2)

   Why v2 exists:
   - The old join plaque markup/classes were too "generic" and could get
     reshaped by other global game CSS.
   - v2 uses a new namespace (jevfp-*) and the CSS uses `all: unset` on
     the plaque root to prevent overrides.

   This script is a classic IIFE (no module import) to match index.html.
   ========================================================= */

(function () {
  const PLAQUE_COUNT = 18;
  const PORTRAIT_BASE = '/img/eval_portraits/';
  const FALLBACK_PORTRAIT = `${PORTRAIT_BASE}fallback.png`;

  // Fixed roster (p01..p16)
  const PROFILES = [
    { id: 'p01', name: 'Zendaya', title: 'Charisma Catalyst', ovr: 91, phrase: 'Reads the room before the room exists.' },
    { id: 'p02', name: 'Dwayne Johnson', title: 'Power Tank', ovr: 88, phrase: 'Momentum is a weapon. He brings it.' },
    { id: 'p03', name: 'Keanu Reeves', title: 'Calm Executioner', ovr: 90, phrase: 'No drama—only clean outcomes.' },
    { id: 'p04', name: 'Serena Williams', title: 'Competitive Apex', ovr: 94, phrase: 'Pressure makes the play louder.' },
    { id: 'p05', name: 'Lionel Messi', title: 'Tempo Architect', ovr: 96, phrase: 'Finds angles nobody else can see.' },
    { id: 'p06', name: 'LeBron James', title: 'All-Round Commander', ovr: 95, phrase: 'Turns chaos into a system.' },
    { id: 'p07', name: 'SpongeBob', title: 'Chaos Optimist', ovr: 79, phrase: 'Unbreakable morale. Unreasonable results.' },
    { id: 'p08', name: 'Bluey', title: 'Synergy Engine', ovr: 74, phrase: 'Team-first instincts, always.' },
    { id: 'p09', name: 'Satoru Gojo', title: 'Elite Reality Bender', ovr: 99, phrase: 'Rules apply… until he arrives.' },
    { id: 'p10', name: 'Eren Yeager', title: 'Relentless Vanguard', ovr: 92, phrase: 'Escalation is the plan.' },
    { id: 'p11', name: 'Darth Vader', title: 'Fear Controller', ovr: 93, phrase: 'A quiet step—then everything shifts.' },
    { id: 'p12', name: 'The Joker (Ledger)', title: 'Anarchy Tactician', ovr: 89, phrase: 'Breaks the board. Wins anyway.' },
    { id: 'p13', name: 'Wolf', title: 'Instinct Hunter', ovr: 77, phrase: 'Silent read. Fast commit.' },
    { id: 'p14', name: 'Doge', title: 'Meme Luck Totem', ovr: 69, phrase: 'Much synergy. Very unpredictable.' },
    { id: 'p15', name: 'Phoenix', title: 'Mythic Reclaimer', ovr: 97, phrase: 'If it burns—good. It returns stronger.' },
    { id: 'p16', name: 'Leonardo da Vinci', title: 'Genius Generalist', ovr: 92, phrase: 'Blueprints the impossible in real time.' }
  ];

  function r(min, max) {
    return Math.random() * (max - min) + min;
  }

  function tierFromOVR(ovr) {
    if (ovr >= 96) return 'elite';
    if (ovr >= 90) return 'diamond';
    if (ovr >= 78) return 'gold';
    if (ovr >= 65) return 'silver';
    return 'bronze';
  }

  function tierLabel(tier) {
    if (tier === 'elite') return 'ELITE';
    if (tier === 'diamond') return 'DIAMOND';
    if (tier === 'gold') return 'GOLD';
    if (tier === 'silver') return 'SILVER';
    return 'BRONZE';
  }

  function portraitFor(profile) {
    return `${PORTRAIT_BASE}${profile.id}.jpg`;
  }

  function scenarioDelta() {
    // filler delta: roughly -6..+12 with more central values
    const v = Math.round((Math.random() - 0.42) * 16);
    return Math.max(-6, Math.min(12, v));
  }

  function deltaClass(v) {
    if (v >= 3) return 'pos';
    if (v <= -3) return 'neg';
    return 'neu';
  }

  function confidenceValue() {
    const roll = Math.random();
    if (roll < 0.33) return 'low';
    if (roll < 0.72) return 'medium';
    return 'high';
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function buildPlaque(profile) {
    const tier = tierFromOVR(profile.ovr);
    const delta = scenarioDelta();
    const dClass = deltaClass(delta);
    const conf = confidenceValue();
    const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;

    const plaque = document.createElement('article');
    plaque.className = `jevfp-plaque jevfp-tier-${tier}`;
    plaque.setAttribute('aria-label', `${profile.name} eval card`);

    // Motion + placement
    plaque.style.left = `${r(-8, 108)}%`;
    plaque.style.setProperty('--jevfp-fall-dur', `${r(14.4, 23.2)}s`);
    plaque.style.setProperty('--jevfp-fall-delay', `${r(-28, 0)}s`);
    plaque.style.setProperty('--jevfp-scale', `${r(0.90, 1.10)}`);
    plaque.style.setProperty('--jevfp-rot', `${r(-7, 7)}deg`);
    plaque.style.setProperty('--jevfp-drift-x', `${r(-16, 16)}px`);
    plaque.style.setProperty('--jevfp-drift-tilt', `${r(-1.0, 1.0)}deg`);
    plaque.style.setProperty('--jevfp-opacity', `${r(0.78, 0.84)}`);

    const root = el('div', 'jevfp');

    // Header
    const head = el('div', 'jevfp-head');

    const photo = el('div', 'jevfp-photo');
    photo.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.src = portraitFor(profile);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      if (img.src.endsWith('fallback.png')) return;
      img.src = FALLBACK_PORTRAIT;
    });
    photo.appendChild(img);

    const who = el('div', 'jevfp-who');
    const name = el('div', 'jevfp-name', profile.name);
    name.title = profile.name;

    const tierPill = el('div', 'jevfp-tier');
    tierPill.title = `${tierLabel(tier)} tier`;
    tierPill.appendChild(el('i', ''));
    tierPill.appendChild(el('span', '', tierLabel(tier)));

    who.appendChild(name);
    who.appendChild(tierPill);

    const ovr = el('div', 'jevfp-ovr');
    ovr.setAttribute('aria-label', `Overall rating ${profile.ovr}`);
    ovr.appendChild(el('small', '', 'OVR'));
    ovr.appendChild(el('strong', '', profile.ovr));

    head.appendChild(photo);
    head.appendChild(who);
    head.appendChild(ovr);

    // Tiles
    const tiles = el('div', 'jevfp-tiles');
    tiles.setAttribute('aria-label', 'Evaluation tiles');

    const titleTile = el('div', 'jevfp-tile');
    titleTile.dataset.span = 'full';
    titleTile.appendChild(el('div', 'jevfp-k', 'Title'));
    titleTile.appendChild(el('div', 'jevfp-v', profile.title));

    const fitTile = el('div', 'jevfp-tile');
    fitTile.appendChild(el('div', 'jevfp-k', 'Scenario fit'));
    const fitV = el('div', 'jevfp-v');
    const deltaSpan = el('span', `jevfp-delta ${dClass}`, deltaText);
    fitV.appendChild(deltaSpan);
    fitTile.appendChild(fitV);

    const confTile = el('div', 'jevfp-tile');
    confTile.appendChild(el('div', 'jevfp-k', 'Confidence'));
    const confV = el('div', 'jevfp-v');
    const confSpan = el('span', `jevfp-conf ${conf}`);
    confSpan.appendChild(el('i', ''));
    confSpan.appendChild(el('span', '', conf));
    confV.appendChild(confSpan);
    confTile.appendChild(confV);

    tiles.appendChild(titleTile);
    tiles.appendChild(fitTile);
    tiles.appendChild(confTile);

    // Phrase
    const phrase = el('div', 'jevfp-phrase', `— ${profile.phrase}`);
    phrase.title = profile.phrase;

    root.appendChild(head);
    root.appendChild(tiles);
    root.appendChild(phrase);

    plaque.appendChild(root);
    return plaque;
  }

  function createLayer() {
    const layer = document.createElement('div');
    layer.className = 'jevfp-layer';
    return layer;
  }

  function initJoinPlaques() {
    const join = document.getElementById('join');
    if (!join) return;

    // prevent duplicates
    if (join.querySelector('.jevfp-layer')) return;

    const layer = createLayer();
    join.appendChild(layer);

    const frag = document.createDocumentFragment();
    for (let i = 0; i < PLAQUE_COUNT; i += 1) {
      const profile = PROFILES[i % PROFILES.length];
      frag.appendChild(buildPlaque(profile));
    }
    layer.appendChild(frag);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJoinPlaques);
  } else {
    initJoinPlaques();
  }
})();
