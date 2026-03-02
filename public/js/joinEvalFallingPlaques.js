/* =========================================================
   JOIN SCREEN - FALLING EVAL PLAQUES
   ========================================================= */

const PLAQUE_COUNT = 18;
const PORTRAIT_BASE = '/img/eval_portraits/';
const FALLBACK_PORTRAIT = `${PORTRAIT_BASE}p01.jpg`;

const PROFILES = [
  { id: 'p01', name: 'Zendaya', title: 'Charisma Catalyst', ovr: 91, phrase: 'Reads the room before the room exists.' },
  { id: 'p02', name: 'Dwayne Johnson', title: 'Power Tank', ovr: 88, phrase: 'Momentum is a weapon. He brings it.' },
  { id: 'p03', name: 'Keanu Reeves', title: 'Calm Executioner', ovr: 90, phrase: 'No drama, only clean outcomes.' },
  { id: 'p04', name: 'Serena Williams', title: 'Competitive Apex', ovr: 94, phrase: 'Pressure makes the play louder.' },
  { id: 'p05', name: 'Lionel Messi', title: 'Tempo Architect', ovr: 96, phrase: 'Finds angles nobody else can see.' },
  { id: 'p06', name: 'LeBron James', title: 'All-Round Commander', ovr: 95, phrase: 'Turns chaos into a system.' },
  { id: 'p07', name: 'SpongeBob', title: 'Chaos Optimist', ovr: 79, phrase: 'Unbreakable morale. Unreasonable results.' },
  { id: 'p08', name: 'Bluey', title: 'Synergy Engine', ovr: 74, phrase: 'Team-first instincts, always.' },
  { id: 'p09', name: 'Satoru Gojo', title: 'Elite Reality Bender', ovr: 99, phrase: 'Rules apply until he arrives.' },
  { id: 'p10', name: 'Eren Yeager', title: 'Relentless Vanguard', ovr: 92, phrase: 'Escalation is the plan.' },
  { id: 'p11', name: 'Darth Vader', title: 'Fear Controller', ovr: 93, phrase: 'A quiet step then everything shifts.' },
  { id: 'p12', name: 'The Joker (Ledger)', title: 'Anarchy Tactician', ovr: 89, phrase: 'Breaks the board. Wins anyway.' },
  { id: 'p13', name: 'Wolf', title: 'Instinct Hunter', ovr: 77, phrase: 'Silent read. Fast commit.' },
  { id: 'p14', name: 'Doge', title: 'Meme Luck Totem', ovr: 69, phrase: 'Much synergy. Very unpredictable.' },
  { id: 'p15', name: 'Phoenix', title: 'Mythic Reclaimer', ovr: 97, phrase: 'If it burns, good. It returns stronger.' },
  { id: 'p16', name: 'Leonardo da Vinci', title: 'Genius Generalist', ovr: 92, phrase: 'Blueprints the impossible in real time.' }
];

const plaqueState = {
  readyPromise: null,
  layerReady: false,
  portraitsReady: false,
  decodedPortraits: 0,
  failedPortraits: 0,
  startedAt: 0
};

function randomBetween(min, max) {
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
  const value = Math.round((Math.random() - 0.42) * 16);
  return Math.max(-6, Math.min(12, value));
}

function deltaClass(value) {
  if (value >= 3) return 'pos';
  if (value <= -3) return 'neg';
  return 'neu';
}

function confidenceValue() {
  const roll = Math.random();
  if (roll < 0.33) return 'low';
  if (roll < 0.72) return 'medium';
  return 'high';
}

function createNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function buildPlaque(profile, { imageLoading = 'eager' } = {}) {
  const tier = tierFromOVR(profile.ovr);
  const delta = scenarioDelta();
  const dClass = deltaClass(delta);
  const confidence = confidenceValue();
  const deltaText = delta >= 0 ? `+${delta}` : `${delta}`;

  const plaque = document.createElement('article');
  plaque.className = `jevfp-plaque jevfp-tier-${tier}`;
  plaque.setAttribute('aria-label', `${profile.name} eval card`);

  plaque.style.left = `${randomBetween(-8, 108)}%`;
  plaque.style.setProperty('--jevfp-fall-dur', `${randomBetween(14.4, 23.2)}s`);
  plaque.style.setProperty('--jevfp-fall-delay', `${randomBetween(-28, 0)}s`);
  plaque.style.setProperty('--jevfp-scale', `${randomBetween(0.9, 1.1)}`);
  plaque.style.setProperty('--jevfp-rot', `${randomBetween(-7, 7)}deg`);
  plaque.style.setProperty('--jevfp-drift-x', `${randomBetween(-16, 16)}px`);
  plaque.style.setProperty('--jevfp-drift-tilt', `${randomBetween(-1, 1)}deg`);
  plaque.style.setProperty('--jevfp-opacity', `${randomBetween(0.78, 0.84)}`);

  const root = createNode('div', 'jevfp');
  const head = createNode('div', 'jevfp-head');

  const photo = createNode('div', 'jevfp-photo');
  photo.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.src = portraitFor(profile);
  image.alt = '';
  image.loading = imageLoading;
  image.decoding = 'async';
  image.addEventListener('error', () => {
    if (image.src.endsWith('p01.jpg')) return;
    image.src = FALLBACK_PORTRAIT;
  });
  photo.appendChild(image);

  const who = createNode('div', 'jevfp-who');
  const name = createNode('div', 'jevfp-name', profile.name);
  name.title = profile.name;

  const tierPill = createNode('div', 'jevfp-tier');
  tierPill.title = `${tierLabel(tier)} tier`;
  tierPill.appendChild(createNode('i', ''));
  tierPill.appendChild(createNode('span', '', tierLabel(tier)));

  who.appendChild(name);
  who.appendChild(tierPill);

  const ovr = createNode('div', 'jevfp-ovr');
  ovr.setAttribute('aria-label', `Overall rating ${profile.ovr}`);
  ovr.appendChild(createNode('small', '', 'OVR'));
  ovr.appendChild(createNode('strong', '', profile.ovr));

  head.appendChild(photo);
  head.appendChild(who);
  head.appendChild(ovr);

  const tiles = createNode('div', 'jevfp-tiles');
  tiles.setAttribute('aria-label', 'Evaluation tiles');

  const titleTile = createNode('div', 'jevfp-tile');
  titleTile.dataset.span = 'full';
  titleTile.appendChild(createNode('div', 'jevfp-k', 'Title'));
  titleTile.appendChild(createNode('div', 'jevfp-v', profile.title));

  const fitTile = createNode('div', 'jevfp-tile');
  fitTile.appendChild(createNode('div', 'jevfp-k', 'Scenario fit'));
  const fitValue = createNode('div', 'jevfp-v');
  fitValue.appendChild(createNode('span', `jevfp-delta ${dClass}`, deltaText));
  fitTile.appendChild(fitValue);

  const confidenceTile = createNode('div', 'jevfp-tile');
  confidenceTile.appendChild(createNode('div', 'jevfp-k', 'Confidence'));
  const confidenceValueNode = createNode('div', 'jevfp-v');
  const confidencePill = createNode('span', `jevfp-conf ${confidence}`);
  confidencePill.appendChild(createNode('i', ''));
  confidencePill.appendChild(createNode('span', '', confidence));
  confidenceValueNode.appendChild(confidencePill);
  confidenceTile.appendChild(confidenceValueNode);

  tiles.appendChild(titleTile);
  tiles.appendChild(fitTile);
  tiles.appendChild(confidenceTile);

  const phrase = createNode('div', 'jevfp-phrase', `- ${profile.phrase}`);
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

function ensureDomReady() {
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

function initJoinPlaques({ imageLoading = 'eager' } = {}) {
  const join = document.getElementById('join');
  if (!join) return { ok: false, code: 'join-missing', plaqueCount: 0 };

  let layer = join.querySelector('.jevfp-layer');
  if (!layer) {
    layer = createLayer();
    join.appendChild(layer);
  }

  if (!layer.childElementCount) {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < PLAQUE_COUNT; index += 1) {
      const profile = PROFILES[index % PROFILES.length];
      fragment.appendChild(buildPlaque(profile, { imageLoading }));
    }
    layer.appendChild(fragment);
  }

  plaqueState.layerReady = true;
  return { ok: true, plaqueCount: layer.childElementCount || PLAQUE_COUNT };
}

function getUniquePortraitUrls() {
  return Array.from(new Set([
    ...PROFILES.map((profile) => portraitFor(profile)),
    FALLBACK_PORTRAIT
  ]));
}

function shouldUseEagerPortraitPreload() {
  try {
    const ua = navigator.userAgent || '';
    const isMobile = /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua)
      || (navigator.maxTouchPoints > 0)
      || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (!isMobile) return true;

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const effectiveType = String(connection && connection.effectiveType || '').toLowerCase();
    const saveDataEnabled = Boolean(connection && connection.saveData === true);
    const constrainedNetwork = saveDataEnabled || /(^|[^a-z])(slow-2g|2g)($|[^a-z])/i.test(effectiveType);
    const deviceMemory = Math.max(0, Number(navigator.deviceMemory) || 0);
    const hardwareConcurrency = Math.max(0, Number(navigator.hardwareConcurrency) || 0);
    const constrainedMemory = deviceMemory > 0 && deviceMemory <= 2;
    const constrainedCpu = hardwareConcurrency > 0 && hardwareConcurrency <= 4;
    return !(constrainedNetwork || constrainedMemory || constrainedCpu);
  } catch (error) {
    return false;
  }
}

async function decodeImage(src, timeoutMs = 2600) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    image.onload = () => {
      if (typeof image.decode === 'function') {
        image.decode()
          .then(() => {
            window.clearTimeout(timer);
            finish(true);
          })
          .catch(() => {
            window.clearTimeout(timer);
            finish(true);
          });
        return;
      }
      window.clearTimeout(timer);
      finish(true);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    image.decoding = 'async';
    image.src = src;
  });
}

async function preloadPortraits() {
  const urls = getUniquePortraitUrls();
  const eager = shouldUseEagerPortraitPreload();
  const maxWorkers = eager ? 4 : 2;
  const workerCount = Math.max(1, Math.min(maxWorkers, urls.length));
  const results = new Array(urls.length).fill(false);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < urls.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const src = urls[currentIndex];
      results[currentIndex] = await decodeImage(src);
      if (!eager) {
        await new Promise((resolve) => window.setTimeout(resolve, 16));
      }
    }
  }));

  const decodedPortraits = results.filter(Boolean).length;
  const failedPortraits = results.length - decodedPortraits;
  plaqueState.portraitsReady = true;
  plaqueState.decodedPortraits = decodedPortraits;
  plaqueState.failedPortraits = failedPortraits;
  return { decodedPortraits, failedPortraits, totalPortraits: results.length };
}

function emitReadyEvent(detail) {
  document.dispatchEvent(new CustomEvent('joinEvalPlaquesReady', { detail }));
}

function prepareJoinEvalPlaques({
  source = 'unknown',
  preload = true
} = {}) {
  if (plaqueState.readyPromise) return plaqueState.readyPromise;

  plaqueState.startedAt = Date.now();
  plaqueState.readyPromise = ensureDomReady()
    .then(async () => {
      const [layerResult, preloadResult] = await Promise.all([
        Promise.resolve(initJoinPlaques({ imageLoading: 'eager' })),
        preload ? preloadPortraits() : Promise.resolve({
          decodedPortraits: plaqueState.decodedPortraits || 0,
          failedPortraits: plaqueState.failedPortraits || 0,
          totalPortraits: getUniquePortraitUrls().length
        })
      ]);

      const payload = {
        ok: Boolean(layerResult && layerResult.ok),
        source: String(source || 'unknown'),
        plaqueCount: Number(layerResult && layerResult.plaqueCount) || PLAQUE_COUNT,
        decodedPortraits: Number(preloadResult && preloadResult.decodedPortraits) || 0,
        failedPortraits: Number(preloadResult && preloadResult.failedPortraits) || 0,
        elapsedMs: Math.max(0, Date.now() - plaqueState.startedAt)
      };
      emitReadyEvent(payload);
      return payload;
    })
    .catch((error) => {
      const payload = {
        ok: false,
        source: String(source || 'unknown'),
        plaqueCount: 0,
        decodedPortraits: Number(plaqueState.decodedPortraits) || 0,
        failedPortraits: Number(plaqueState.failedPortraits) || 0,
        elapsedMs: Math.max(0, Date.now() - plaqueState.startedAt),
        error: String(error && (error.message || error) || 'unknown')
      };
      emitReadyEvent(payload);
      return payload;
    });

  return plaqueState.readyPromise;
}

function installBridge() {
  const api = {
    prepare: (options = {}) => prepareJoinEvalPlaques(options),
    ensureReady: (options = {}) => prepareJoinEvalPlaques(options),
    getState: () => ({
      layerReady: plaqueState.layerReady,
      portraitsReady: plaqueState.portraitsReady,
      decodedPortraits: plaqueState.decodedPortraits,
      failedPortraits: plaqueState.failedPortraits
    })
  };
  window.JoinEvalPlaques = api;
  window.prepareJoinEvalPlaques = api.prepare;
  document.dispatchEvent(new CustomEvent('joinEvalPlaquesBridgeReady', {
    detail: api.getState()
  }));
}

if (typeof window !== 'undefined') {
  installBridge();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void prepareJoinEvalPlaques({
      source: 'module-autostart',
      preload: shouldUseEagerPortraitPreload()
    });
  }, { once: true });
} else {
  void prepareJoinEvalPlaques({
    source: 'module-autostart',
    preload: shouldUseEagerPortraitPreload()
  });
}
