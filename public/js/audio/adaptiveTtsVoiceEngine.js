// Device detection utility
function detectDeviceType() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mobile|Tablet/.test(ua)) return 'mobile';
  return 'desktop';
}

import { clamp, hashString, normalizeCollapsedText as normalizeText, nowMs } from './coreUtils.js';

const DEFAULT_API_CATALOG_URL = '/api/tts/catalog';
const DEFAULT_API_SYNTH_URL = '/api/tts/synthesize';
const DEFAULT_NARRATOR_VOICE_IDS = Object.freeze(['af_heart', 'af_bella', 'am_michael', 'bm_george']);

const FALLBACK_CATALOG = Object.freeze([
  {
    id: 'af_heart',
    name: 'Jenny',
    language: 'en-US',
    gender: 'female',
    traits: 'warm, host, natural',
    targetQuality: 'humanlike',
    overallGrade: 'A',
    roleHint: 'Narration - Female 1',
    provider: 'edge',
    providerLabel: 'Edge Neural',
    providerGrade: 'A'
  },
  {
    id: 'af_bella',
    name: 'Aria',
    language: 'en-US',
    gender: 'female',
    traits: 'bright, articulate, energetic',
    targetQuality: 'humanlike',
    overallGrade: 'A',
    roleHint: 'Narration - Female 2',
    provider: 'edge',
    providerLabel: 'Edge Neural',
    providerGrade: 'A'
  },
  {
    id: 'am_michael',
    name: 'Guy',
    language: 'en-US',
    gender: 'male',
    traits: 'heroic, steady, cinematic',
    targetQuality: 'humanlike',
    overallGrade: 'A',
    roleHint: 'Narration - Male 1',
    provider: 'edge',
    providerLabel: 'Edge Neural',
    providerGrade: 'A'
  },
  {
    id: 'bm_george',
    name: 'Ryan',
    language: 'en-GB',
    gender: 'male',
    traits: 'dramatic, darker, announcer',
    targetQuality: 'humanlike',
    overallGrade: 'A',
    roleHint: 'Narration - Male 2',
    provider: 'edge',
    providerLabel: 'Edge Neural',
    providerGrade: 'A'
  }
]);

const BROWSER_FALLBACK_HINTS = Object.freeze({
  af_heart: { hints: ['jenny', 'samantha', 'ava', 'female', 'neural', 'natural', 'enhanced'], pitch: 1.02 },
  af_bella: { hints: ['aria', 'emma', 'zira', 'female', 'neural', 'natural', 'enhanced'], pitch: 1.08 },
  am_michael: { hints: ['guy', 'david', 'daniel', 'alex', 'male', 'neural', 'natural', 'enhanced'], pitch: 0.98 },
  bm_george: { hints: ['ryan', 'george', 'male', 'british', 'uk', 'neural', 'natural', 'enhanced'], pitch: 0.9 },
  'arch:heroic': { hints: ['guy', 'male', 'neural'], pitch: 0.98 },
  'arch:villain': { hints: ['ryan', 'male', 'british'], pitch: 0.86 },
  'arch:cartoon': { hints: ['aria', 'female'], pitch: 1.12 },
  'arch:robotic': { hints: ['davis', 'male'], pitch: 0.92 },
  'arch:spooky': { hints: ['ryan', 'male'], pitch: 0.82 },
  'arch:chaotic': { hints: ['aria', 'female'], pitch: 1.14 }
});

function getSpeechVoiceStableId(voice = null) {
  if (!voice || typeof voice !== 'object') return '';
  const uri = String(voice.voiceURI || '').trim();
  const name = String(voice.name || '').trim();
  const lang = String(voice.lang || '').trim();
  if (!uri && !name) return '';
  return `${uri || name}::${lang}`;
}

function rankSpeechSynthesisVoices(voices = [], hints = []) {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return [];
  const normalizedHints = (Array.isArray(hints) ? hints : [])
    .map((v) => String(v || '').toLowerCase())
    .filter(Boolean);
  return list.map((voice, index) => {
    const name = String(voice && voice.name || '').toLowerCase();
    const uri = String(voice && voice.voiceURI || '').toLowerCase();
    const lang = String(voice && voice.lang || '').toLowerCase();
    const combined = `${name} ${uri}`;
    let score = 0;
    if (lang.startsWith('en-us')) score += 12;
    else if (lang.startsWith('en-gb')) score += 10;
    else if (lang.startsWith('en')) score += 8;
    if (voice && voice.default) score += 4;
    if (/(neural|natural|enhanced|premium)/.test(combined)) score += 14;
    if (/(microsoft|google|apple)/.test(combined)) score += 3;
    if (/(espeak|compact|festival)/.test(combined)) score -= 12;
    normalizedHints.forEach((hint) => {
      if (combined.includes(hint)) score += 7;
    });
    score += index * 0.001;
    return { voice, score };
  }).sort((a, b) => b.score - a.score);
}

function pickBestSpeechSynthesisVoice(voices = [], hints = []) {
  const ranked = rankSpeechSynthesisVoices(voices, hints);
  return ranked[0] ? ranked[0].voice : null;
}

function fetchJsonWithTimeout(url, { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(800, Number(timeoutMs) || 12000));
  return fetch(url, { signal: controller.signal })
    .then((res) => {
      if (!res || !res.ok) throw new Error(`http_${res ? res.status : 'fail'}`);
      return res.json();
    })
    .finally(() => window.clearTimeout(timer));
}

function postForAudioWithTimeout(url, payload, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(1200, Number(timeoutMs) || 30000));
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal: controller.signal
  })
    .then(async (res) => {
      if (!res) throw new Error('no_response');
      if (!res.ok) {
        let detail = '';
        try {
          const errJson = await res.json();
          detail = errJson && errJson.message ? `:${String(errJson.message)}` : '';
        } catch (_error) {}
        throw new Error(`http_${res.status}${detail}`);
      }
      const blob = await res.blob();
      return {
        blob,
        providerId: String(res.headers.get('X-Lobby-TTS-Provider') || ''),
        cacheHit: String(res.headers.get('X-Lobby-TTS-Cache') || '') === 'hit'
      };
    })
    .finally(() => window.clearTimeout(timer));
}

export class AdaptiveTtsVoiceEngine {
  constructor(options = {}) {
    this.options = options && typeof options === 'object' ? { ...options } : {};
    this.deviceType = detectDeviceType();
    this.loading = false;
    this.ready = false;
    this.error = '';
    this.lastLoadMs = 0;
    this.catalog = [];
    this.catalogById = new Map();
    this.maxCacheEntries = Math.max(8, Number(this.options.maxCacheEntries) || 40);
    this.allowedVoiceIds = new Set(
      Array.isArray(this.options.allowedVoiceIds)
        ? this.options.allowedVoiceIds.map((v) => String(v || '').trim()).filter(Boolean)
        : []
    );
    this.apiCatalogUrl = String(this.options.catalogUrl || DEFAULT_API_CATALOG_URL);
    this.apiSynthUrl = String(this.options.synthUrl || DEFAULT_API_SYNTH_URL);
    this.loadProgress = {
      phase: 'idle',
      label: '',
      status: '',
      file: '',
      pct: 0,
      loaded: 0,
      total: 0
    };
    this.defaultDevice = 'server';
    this.defaultDtype = 'adaptive';
    this.audioEl = null;
    this.activeJob = null;
    this.activeSpeechUtterance = null;
    this.cache = new Map();
    this.inFlightGeneration = new Map();
    this.loadingPromise = null;
    this.browserVoiceWarmPromise = null;
    this.browserFallbackPrimed = false;
    this.browserFallbackPrimeAt = 0;
    this.browserFallbackVoiceAssignments = new Map();
    this.browserFallbackVoiceAssignmentsSig = '';
    this.serverSynthesisAvailable = true;
    this.serverSynthesisBackoffUntil = 0;
  }

  getState() {
    return {
      supported: true,
      loading: this.loading,
      ready: this.ready,
      error: this.error,
      modelId: 'adaptive-tts-router',
      device: (this.isBrowserFallbackOnly() ? 'browser-fallback' : this.defaultDevice),
      dtype: this.defaultDtype,
      voicesLoaded: this.catalog.length,
      lastLoadMs: this.lastLoadMs,
      loadProgress: { ...this.loadProgress }
    };
  }

  _notifyStateChange() {
    if (typeof this.options.onStateChange !== 'function') return;
    try {
      this.options.onStateChange(this.getState());
    } catch (_error) {}
  }

  _setCatalog(entries = []) {
    const input = Array.isArray(entries) && entries.length ? entries : FALLBACK_CATALOG;
    const filtered = input
      .map((entry) => ({
        id: String(entry && entry.id || ''),
        name: String(entry && (entry.name || entry.id) || ''),
        language: String(entry && (entry.language || entry.lang) || ''),
        gender: String(entry && entry.gender || ''),
        traits: String(entry && entry.traits || ''),
        targetQuality: String(entry && entry.targetQuality || ''),
        overallGrade: String(entry && (entry.overallGrade || entry.providerGrade) || ''),
        roleHint: String(entry && entry.roleHint || ''),
        provider: String(entry && entry.provider || ''),
        providerLabel: String(entry && entry.providerLabel || '')
      }))
      .filter((entry) => entry.id)
      .filter((entry) => !this.allowedVoiceIds.size || this.allowedVoiceIds.has(entry.id));
    const finalList = filtered.length ? filtered : FALLBACK_CATALOG.filter((entry) => !this.allowedVoiceIds.size || this.allowedVoiceIds.has(entry.id));
    this.catalog = finalList.slice();
    this.catalogById.clear();
    this.catalog.forEach((entry) => this.catalogById.set(entry.id, entry));
    return this.catalog;
  }

  getCatalog() {
    return this.catalog.slice();
  }

  _getAudioElement() {
    if (this.audioEl) return this.audioEl;
    const el = new Audio();
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    this.audioEl = el;
    return el;
  }

  _assignBrowserFallbackVoices(voices = [], requestedVoiceIds = []) {
    // Strict, deterministic narrator/archetype mapping for cross-platform consistency
    const source = Array.isArray(voices) ? voices.filter(Boolean) : [];
    if (!source.length) {
      this.browserFallbackVoiceAssignments.clear();
      this.browserFallbackVoiceAssignmentsSig = '';
      return { assigned: 0, available: 0 };
    }
    // Only use English voices, prefer neural/natural, never use default/robotic
    const englishPool = source.filter((voice) => {
      const lang = String(voice && voice.lang || '').toLowerCase();
      return lang.startsWith('en');
    });
    // Filter for neural/natural/enhanced, never use 'default', 'siri', 'robot', or 'compact'
    const qualityPool = englishPool.filter((voice) => {
      const name = String(voice && voice.name || '').toLowerCase();
      const uri = String(voice && voice.voiceURI || '').toLowerCase();
      return (
        /(neural|natural|enhanced|premium)/.test(name + uri)
        && !/(default|siri|robot|compact|espeak|festival)/.test(name + uri)
      );
    });
    const pool = qualityPool.length ? qualityPool : englishPool;
    // Deterministic order: narrator/archetype IDs, then requested
    const voiceIds = [];
    const seenIds = new Set();
    [...DEFAULT_NARRATOR_VOICE_IDS, ...(Array.isArray(requestedVoiceIds) ? requestedVoiceIds : [])].forEach((rawId) => {
      const id = String(rawId || '').trim();
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      voiceIds.push(id);
    });

    const nextAssignments = new Map();
    const usedVoiceSigs = new Set();
    voiceIds.forEach((voiceId) => {
      const hints = BROWSER_FALLBACK_HINTS[voiceId] || BROWSER_FALLBACK_HINTS.af_heart || { hints: [] };
      // Sort by score, then by name for determinism
      const ranked = rankSpeechSynthesisVoices(pool, hints.hints).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.voice.name).localeCompare(String(b.voice.name));
      });
      let picked = null;
      for (let i = 0; i < ranked.length; i += 1) {
        const candidate = ranked[i] && ranked[i].voice;
        const sig = getSpeechVoiceStableId(candidate);
        if (!candidate) continue;
        // Never use a voice that is 'default', 'siri', 'robot', or 'compact'
        const name = String(candidate && candidate.name || '').toLowerCase();
        if (/(default|siri|robot|compact|espeak|festival)/.test(name)) continue;
        if (!sig || !usedVoiceSigs.has(sig)) {
          picked = candidate;
          if (sig) usedVoiceSigs.add(sig);
          break;
        }
      }
      if (!picked) {
        // Visual warning if no good match is found
        if (typeof window !== 'undefined') {
          const msg = `[TTS] No good browser fallback voice for narrator/archetype '${voiceId}' on this platform. Skipping.`;
          if (window.console && window.console.warn) window.console.warn(msg);
          if (typeof window.showTtsWarningToast === 'function') {
            window.showTtsWarningToast(msg);
          } else {
            // Fallback: create a toast
            let toast = document.getElementById('tts-toast');
            if (!toast) {
              toast = document.createElement('div');
              toast.id = 'tts-toast';
              toast.style.position = 'fixed';
              toast.style.bottom = '24px';
              toast.style.left = '50%';
              toast.style.transform = 'translateX(-50%)';
              toast.style.background = 'rgba(30,30,30,0.96)';
              toast.style.color = '#fff';
              toast.style.padding = '12px 24px';
              toast.style.borderRadius = '8px';
              toast.style.fontSize = '1.1em';
              toast.style.zIndex = '99999';
              toast.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)';
              toast.style.maxWidth = '90vw';
              toast.style.textAlign = 'center';
              document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.opacity = '1';
            toast.style.pointerEvents = 'auto';
            clearTimeout(window.__ttsToastTimeout);
            window.__ttsToastTimeout = setTimeout(() => {
              toast.style.opacity = '0';
              toast.style.pointerEvents = 'none';
            }, 4200);
          }
        }
        return;
      }
      const pickedSig = getSpeechVoiceStableId(picked);
      nextAssignments.set(voiceId, pickedSig || picked);
      if (pickedSig) usedVoiceSigs.add(pickedSig);
    });

    const allVoiceSig = source.map((voice) => getSpeechVoiceStableId(voice)).filter(Boolean).join('||');
    this.browserFallbackVoiceAssignments = nextAssignments;
    this.browserFallbackVoiceAssignmentsSig = allVoiceSig;
    // Log assignments for debugging cross-platform issues
    if (typeof window !== 'undefined') {
      window.__lobbyVoiceAssignments = Array.from(nextAssignments.entries());
      if (window.console && window.console.info) {
        window.console.info('[TTS] Browser fallback voice assignments:', window.__lobbyVoiceAssignments);
      }
    }
    return { assigned: nextAssignments.size, available: source.length };
  }

  _resolveAssignedBrowserFallbackVoice(voices = [], voiceId = '') {
    const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
    if (!list.length) return null;
    const currentSig = list.map((voice) => getSpeechVoiceStableId(voice)).filter(Boolean).join('||');
    if (!this.browserFallbackVoiceAssignmentsSig || this.browserFallbackVoiceAssignmentsSig !== currentSig) {
      this._assignBrowserFallbackVoices(list, [voiceId]);
    }
    const target = String(this.browserFallbackVoiceAssignments.get(String(voiceId || '').trim()) || '').trim();
    if (!target) return null;
    for (let i = 0; i < list.length; i += 1) {
      const voice = list[i];
      if (getSpeechVoiceStableId(voice) === target) return voice;
    }
    return null;
  }

  _warmBrowserFallbackVoices({ primeUtterance = false, timeoutMs = 900, voiceIds = [] } = {}) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      return Promise.resolve({ ok: false, reason: 'speech_unsupported' });
    }
    if (this.browserVoiceWarmPromise) return this.browserVoiceWarmPromise;
    this.browserVoiceWarmPromise = (async () => {
      let voices = [];
      try {
        voices = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
      } catch (_error) {
        voices = [];
      }
      if (!voices.length) {
        voices = await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            try {
              window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
            } catch (_error) {}
            let next = [];
            try {
              next = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
            } catch (_error) {
              next = [];
            }
            resolve(next);
          };
          const onVoicesChanged = () => finish();
          try {
            window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged, { once: true });
          } catch (_error) {}
          window.setTimeout(finish, Math.max(200, Number(timeoutMs) || 900));
        });
      }

      // Aggressively prime on iOS/mobile (user gesture required)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const shouldPrime = primeUtterance === true || isIOS;
      if (shouldPrime) {
        try {
          await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            const utter = new SpeechSynthesisUtterance('.');
            utter.volume = 0;
            utter.rate = 1;
            utter.pitch = 1;
            utter.onstart = () => {
              window.setTimeout(() => {
                try { window.speechSynthesis.cancel(); } catch (_error) {}
                finish();
              }, 20);
            };
            utter.onend = finish;
            utter.onerror = finish;
            try { window.speechSynthesis.resume(); } catch (_error) {}
            try {
              window.speechSynthesis.speak(utter);
              window.setTimeout(() => {
                try { window.speechSynthesis.cancel(); } catch (_error) {}
                finish();
              }, 90);
            } catch (_error) {
              finish();
            }
          });
          this.browserFallbackPrimed = true;
          this.browserFallbackPrimeAt = nowMs();
        } catch (_error) {}
      }

      const assignmentInfo = this._assignBrowserFallbackVoices(voices, voiceIds);
      // Log for debugging
      if (typeof window !== 'undefined' && window.console && window.console.info) {
        window.console.info('[TTS] Warmed browser fallback voices:', assignmentInfo, voices);
      }
      return {
        ok: true,
        voicesLoaded: Array.isArray(voices) ? voices.length : 0,
        assignedVoices: Number(assignmentInfo && assignmentInfo.assigned) || 0
      };
    })().finally(() => {
      this.browserVoiceWarmPromise = null;
    });
    return this.browserVoiceWarmPromise;
  }

  _stopAudioElement() {
    if (!this.audioEl) return;
    try { this.audioEl.pause(); } catch (_error) {}
    try { this.audioEl.currentTime = 0; } catch (_error) {}
  }

  _fadeOutAudioElement({ durationMs = 80 } = {}) {
    if (!this.audioEl) return Promise.resolve(false);
    const el = this.audioEl;
    const ms = Math.max(0, Math.min(220, Number(durationMs) || 0));
    if (!ms || el.paused) {
      this._stopAudioElement();
      return Promise.resolve(false);
    }
    const startVolume = clamp(el.volume, 0, 1, 1);
    if (startVolume <= 0.001) {
      this._stopAudioElement();
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let done = false;
      const startedAt = nowMs();
      const finish = () => {
        if (done) return;
        done = true;
        try { el.pause(); } catch (_error) {}
        try { el.currentTime = 0; } catch (_error) {}
        try { el.volume = startVolume; } catch (_error) {}
        resolve(true);
      };
      const tick = () => {
        if (done) return;
        if (el.paused) {
          finish();
          return;
        }
        const elapsed = Math.max(0, nowMs() - startedAt);
        const progress = Math.max(0, Math.min(1, elapsed / ms));
        try {
          el.volume = Math.max(0, startVolume * (1 - progress));
        } catch (_error) {}
        if (progress >= 1) {
          finish();
          return;
        }
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(tick);
        } else {
          window.setTimeout(tick, 16);
        }
      };
      tick();
      window.setTimeout(finish, ms + 40);
    });
  }

  isBrowserFallbackOnly() {
    if (this.serverSynthesisAvailable === false) return true;
    if ((Number(this.serverSynthesisBackoffUntil) || 0) > nowMs()) return true;
    return false;
  }

  stop() {
    if (this.activeJob && typeof this.activeJob.cancel === 'function') {
      try { void this.activeJob.cancel({ reason: 'stop', fadeOutMs: 0 }); } catch (_error) {}
    } else {
      this._stopAudioElement();
    }
    if (this.activeSpeechUtterance && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_error) {}
      this.activeSpeechUtterance = null;
    }
  }

  _cacheKey({ text, voiceId, speed, pitch }) {
    return `${String(voiceId || '')}|${clamp(speed, 0.65, 1.6, 1).toFixed(2)}|${clamp(pitch, 0.7, 1.35, 1).toFixed(2)}|${normalizeText(text).toLowerCase()}`;
  }

  hasCachedClip(spec = {}) {
    const key = this._cacheKey(spec);
    return Boolean(key && this.cache.has(key));
  }

  _getCache(spec = {}) {
    const key = this._cacheKey(spec);
    if (!key) return null;
    const row = this.cache.get(key);
    if (!row) return null;
    row.lastUsedAt = nowMs();
    return row;
  }

  _setCache(spec = {}, value = {}) {
    const key = this._cacheKey(spec);
    if (!key || !value) return null;
    this.cache.set(key, {
      ...value,
      key,
      lastUsedAt: nowMs()
    });
    if (this.cache.size > this.maxCacheEntries) {
      const rows = Array.from(this.cache.values()).sort((a, b) => Number(a.lastUsedAt || 0) - Number(b.lastUsedAt || 0));
      while (rows.length && this.cache.size > this.maxCacheEntries) {
        const victim = rows.shift();
        if (!victim || !victim.key) continue;
        const stored = this.cache.get(victim.key);
        if (stored && stored.objectUrl) {
          try { URL.revokeObjectURL(stored.objectUrl); } catch (_error) {}
        }
        this.cache.delete(victim.key);
      }
    }
    return this.cache.get(key);
  }

  async ensureLoaded() {
    if (this.ready) {
      return { ok: true, state: this.getState() };
    }
    if (this.loadingPromise) return this.loadingPromise;
    this.loading = true;
    this.error = '';
    this.loadProgress = {
      phase: 'catalog',
      label: 'Loading adaptive voice catalog',
      status: 'catalog',
      file: '',
      pct: 10,
      loaded: 0,
      total: 0
    };
    this._notifyStateChange();
    const startedAt = nowMs();
    this.loadingPromise = (async () => {
      try {
        const payload = await fetchJsonWithTimeout(this.apiCatalogUrl, { timeoutMs: 10000 }).catch(() => null);
        const voices = Array.isArray(payload && payload.voices) ? payload.voices : [];
        const providers = Array.isArray(payload && payload.providers) ? payload.providers : [];
        const anyConfigured = providers.some((provider) => provider && provider.configured === true);
        this._setCatalog(voices);
        const usingFallbackCatalog = !voices.length || !anyConfigured;
        this.serverSynthesisAvailable = anyConfigured;
        this.serverSynthesisBackoffUntil = 0;
        this.defaultDevice = usingFallbackCatalog ? 'browser-fallback' : 'server';
        this.defaultDtype = 'adaptive';
        this.ready = true;
        this.error = '';
        this.lastLoadMs = Math.max(1, nowMs() - startedAt);
        this.loadProgress = {
          phase: 'ready',
          label: usingFallbackCatalog ? 'Adaptive voice ready (browser fallback mode)' : 'Adaptive voice router ready',
          status: usingFallbackCatalog ? 'fallback' : 'ready',
          file: '',
          pct: 100,
          loaded: 0,
          total: 0
        };
        this.loading = false;
        this._notifyStateChange();
        void this._warmBrowserFallbackVoices({
          primeUtterance: false,
          timeoutMs: 1200,
          voiceIds: this.catalog.map((entry) => String(entry && entry.id || ''))
        });
        return { ok: true, state: this.getState(), payload };
      } catch (error) {
        // Fall back to local browser speech + fallback catalog without failing the voice system.
        this._setCatalog(FALLBACK_CATALOG);
        this.ready = true;
        this.error = '';
        this.serverSynthesisAvailable = false;
        this.serverSynthesisBackoffUntil = 0;
        this.defaultDevice = 'browser-fallback';
        this.defaultDtype = 'adaptive';
        this.lastLoadMs = Math.max(1, nowMs() - startedAt);
        this.loadProgress = {
          phase: 'ready',
          label: 'Adaptive voice ready (browser fallback mode)',
          status: 'fallback',
          file: '',
          pct: 100,
          loaded: 0,
          total: 0
        };
        this.loading = false;
        this._notifyStateChange();
        void this._warmBrowserFallbackVoices({
          primeUtterance: false,
          timeoutMs: 1200,
          voiceIds: this.catalog.map((entry) => String(entry && entry.id || ''))
        });
        return { ok: true, state: this.getState(), fallback: true };
      } finally {
        this.loadingPromise = null;
      }
    })();
    return this.loadingPromise;
  }

  async _generateClip(spec = {}) {
    if (this.isBrowserFallbackOnly()) {
      throw new Error('server_synthesis_unavailable');
    }
    const normalized = {
      text: normalizeText(spec && spec.text),
      voiceId: String(spec && spec.voiceId || ''),
      speed: clamp(spec && spec.speed, 0.65, 1.6, 1),
      pitch: clamp(spec && spec.pitch, 0.7, 1.35, 1)
    };
    if (!normalized.text) throw new Error('empty_text');
    const key = this._cacheKey(normalized);
    if (this.inFlightGeneration.has(key)) return this.inFlightGeneration.get(key);
    const job = (async () => {
      let result;
      try {
        result = await postForAudioWithTimeout(this.apiSynthUrl, normalized, { timeoutMs: 45000 });
      } catch (error) {
        const message = String(error && (error.message || error) || '');
        if (/no_tts_provider_available/i.test(message) || /http_503/i.test(message)) {
          this.serverSynthesisAvailable = false;
          this.serverSynthesisBackoffUntil = nowMs() + (5 * 60 * 1000);
          this.defaultDevice = 'browser-fallback';
          this.error = '';
          this._notifyStateChange();
        }
        throw error;
      }
      const blob = result && result.blob;
      if (!blob || !blob.size) throw new Error('empty_audio_blob');
      const objectUrl = URL.createObjectURL(blob);
      const row = this._setCache(normalized, {
        objectUrl,
        mimeType: String(blob.type || 'audio/mpeg'),
        cacheHit: Boolean(result && result.cacheHit),
        providerId: String(result && result.providerId || '')
      });
      return {
        ...row,
        cacheHit: Boolean(result && result.cacheHit)
      };
    })();
    this.inFlightGeneration.set(key, job);
    try {
      return await job;
    } finally {
      this.inFlightGeneration.delete(key);
    }
  }

  async _getOrGenerateAudioClip(spec = {}) {
    const cached = this._getCache(spec);
    if (cached && cached.objectUrl) return { ...cached, cacheHit: true };
    return this._generateClip(spec);
  }

  async prewarmVoices({
    voiceIds = [],
    textByVoiceId = {},
    speedByVoiceId = {},
    pitchByVoiceId = {},
    mode = 'cache-clips'
  } = {}) {
    await this.ensureLoaded();
    const deduped = [];
    const seen = new Set();
    (Array.isArray(voiceIds) ? voiceIds : []).forEach((rawId) => {
      const id = String(rawId || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      deduped.push(id);
    });
    if (this.isBrowserFallbackOnly()) {
      const warm = await this._warmBrowserFallbackVoices({
        primeUtterance: false,
        timeoutMs: 1500,
        voiceIds: deduped
      }).catch(() => ({ ok: false }));
      const warmOk = Boolean(warm && warm.ok === true);
      return {
        ok: warmOk && deduped.length > 0,
        warmed: warmOk ? deduped.length : 0,
        results: deduped.map((voiceId) => ({ voiceId, ok: warmOk, cacheHit: false, mode: 'browser-fallback' })),
        browserWarm: warm && typeof warm === 'object' ? warm : null
      };
    }
    const results = [];
    for (let i = 0; i < deduped.length; i += 1) {
      const voiceId = deduped[i];
      const text = normalizeText(textByVoiceId && textByVoiceId[voiceId]) || 'Voice ready.';
      const speed = clamp(speedByVoiceId && speedByVoiceId[voiceId], 0.65, 1.6, 1);
      const pitch = clamp(pitchByVoiceId && pitchByVoiceId[voiceId], 0.7, 1.35, 1);
      try {
        if (String(mode || '').toLowerCase() === 'weights-only') {
          // Remote/local providers do not expose a meaningful "weights-only" warmup. Treat as successful prep.
          results.push({ voiceId, ok: true, cacheHit: false, mode: 'weights-only' });
          continue;
        }
        const clip = await this._getOrGenerateAudioClip({ text, voiceId, speed, pitch });
        results.push({ voiceId, ok: true, cacheHit: Boolean(clip && clip.cacheHit), mode: 'cache-clips' });
      } catch (error) {
        results.push({
          voiceId,
          ok: false,
          error: String(error && (error.message || error) || 'warm_failed').slice(0, 200)
        });
      }
    }
    return {
      ok: results.some((r) => r && r.ok),
      warmed: results.filter((r) => r && r.ok).length,
      results
    };
  }

  _speakViaBrowserFallback({
    text,
    voiceId,
    speed,
    pitch,
    volume,
    onStart,
    onEnd
  }) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      return false;
    }
    let utterance;
    try {
      utterance = new SpeechSynthesisUtterance(text);
    } catch (_error) {
      return false;
    }
    const hints = BROWSER_FALLBACK_HINTS[voiceId] || BROWSER_FALLBACK_HINTS.af_heart || { hints: [] };
    let voices = [];
    try {
      voices = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
    } catch (_error) {}
    const picked = this._resolveAssignedBrowserFallbackVoice(voices, voiceId)
      || pickBestSpeechSynthesisVoice(voices, hints.hints);
    if (picked) {
      try { utterance.voice = picked; } catch (_error) {}
      try { if (picked.lang) utterance.lang = picked.lang; } catch (_error) {}
    }
    const normalizedVoiceId = String(voiceId || '').trim();
    const requestedPitch = clamp(pitch, 0.7, 1.35, 1);
    // Keep curated narrator voices on the caller-requested pitch (neutral narrator cues use 1.0),
    // so iOS browser fallback does not add extra hidden "archetype-like" coloration.
    const shouldBlendHintPitch = normalizedVoiceId.startsWith('arch:');
    const hintPitch = Number(hints.pitch) || 1;
    const blendedPitch = shouldBlendHintPitch
      ? ((hintPitch * 0.6) + (requestedPitch * 0.4))
      : requestedPitch;
    const targetPitch = clamp(blendedPitch, 0.72, 1.35, requestedPitch);
    try { utterance.rate = clamp(speed, 0.7, 1.6, 1); } catch (_error) {}
    try { utterance.pitch = targetPitch; } catch (_error) {}
    try { utterance.volume = clamp(volume, 0, 1, 1); } catch (_error) {}

    utterance.onstart = () => {
      if (typeof onStart === 'function') {
        try { onStart(); } catch (_error) {}
      }
    };
    const finalize = (status) => () => {
      if (this.activeSpeechUtterance === utterance) {
        this.activeSpeechUtterance = null;
      }
      if (typeof onEnd === 'function') {
        try { onEnd(status); } catch (_error) {}
      }
    };
    utterance.onend = finalize('end');
    utterance.onerror = finalize('error');
    this.activeSpeechUtterance = utterance;
    try {
      try { window.speechSynthesis.resume(); } catch (_error) {}
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (_error) {
      this.activeSpeechUtterance = null;
      return false;
    }
  }

  speakText({
    text,
    voiceId = 'af_heart',
    speed = 1,
    pitch = 1,
    volume = 1,
    onStart = null,
    onEnd = null
  } = {}) {
    // Device-specific pipeline entry point
    switch (this.deviceType) {
      case 'ios':
        return this._speakTextIOS({ text, voiceId, speed, pitch, volume, onStart, onEnd });
      case 'android':
      case 'mobile':
        return this._speakTextMobile({ text, voiceId, speed, pitch, volume, onStart, onEnd });
      case 'desktop':
      default:
        return this._speakTextDesktop({ text, voiceId, speed, pitch, volume, onStart, onEnd });
    }
  }


  // iOS-specific TTS/audio pipeline
  _speakTextIOS({
    text,
    voiceId = 'af_heart',
    speed = 1,
    pitch = 1,
    volume = 1,
    onStart = null,
    onEnd = null
  } = {}) {
    // iOS: Always aggressively prewarm and unlock voices
    this._warmBrowserFallbackVoices({ primeUtterance: true, timeoutMs: 1500, voiceIds: [voiceId] }).catch(() => {});

    const spokenText = normalizeText(text);
    if (!spokenText) return { handled: false, reason: 'empty_text' };

    const safeSpeed = clamp(speed, 0.8, 1.4, 1); // iOS voices are sensitive to speed
    const safePitch = clamp(pitch, 0.8, 1.2, 1);
    const safeVolume = clamp(volume, 0, 1, 1);
    let cancelled = false;
    const jobId = `adaptive-ios-${nowMs()}-${hashString(`${voiceId}|${spokenText}`).toString(36).slice(0, 8)}`;
    const job = {
      id: jobId,
      cancel: (options = {}) => {
        cancelled = true;
        if (this.activeJob && this.activeJob.id === jobId) {
          this.activeJob = null;
        }
        if (this.activeSpeechUtterance && window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch (_error) {}
          this.activeSpeechUtterance = null;
        }
      }
    };
    this.activeJob = job;

    let started = false;
    let finished = false;
    const safeStart = () => {
      if (cancelled || started) return;
      started = true;
      if (typeof onStart === 'function') {
        try { onStart(); } catch (_error) {}
      }
    };
    const safeEnd = (status = 'end') => {
      if (cancelled || finished) return;
      finished = true;
      if (this.activeJob && this.activeJob.id === jobId) this.activeJob = null;
      if (typeof onEnd === 'function') {
        try { onEnd(status); } catch (_error) {}
      }
    };

    (async () => {
      try {
        // iOS: Always use browser fallback, never block on server
        await this._warmBrowserFallbackVoices({ primeUtterance: true, timeoutMs: 1200, voiceIds: [voiceId] }).catch(() => {});
        let voices = [];
        try {
          voices = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
        } catch (_error) {}
        // Try to resolve a good voice, but fallback to any English voice if needed
        let picked = this._resolveAssignedBrowserFallbackVoice(voices, voiceId);
        if (!picked) {
          // Fallback: pick any English voice
          picked = voices.find(v => String(v.lang || '').toLowerCase().startsWith('en')) || voices[0] || null;
        }
        if (!picked) {
          // Visual warning for missing voice
          if (typeof window !== 'undefined') {
            const msg = `[TTS] No usable iOS browser voice for '${voiceId}'. Skipping.`;
            if (window.console && window.console.warn) window.console.warn(msg);
            if (typeof window.showTtsWarningToast === 'function') {
              window.showTtsWarningToast(msg);
            }
          }
          safeEnd('error');
          return;
        }
        let utterance;
        try {
          utterance = new SpeechSynthesisUtterance(spokenText);
        } catch (_error) {
          safeEnd('error');
          return;
        }
        try { utterance.voice = picked; } catch (_error) {}
        try { if (picked.lang) utterance.lang = picked.lang; } catch (_error) {}
        try { utterance.rate = safeSpeed; } catch (_error) {}
        try { utterance.pitch = safePitch; } catch (_error) {}
        try { utterance.volume = safeVolume; } catch (_error) {}

        utterance.onstart = () => {
          if (cancelled) return;
          safeStart();
        };
        utterance.onend = () => {
          if (cancelled) return;
          safeEnd('end');
        };
        utterance.onerror = () => {
          if (cancelled) return;
          safeEnd('error');
        };
        this.activeSpeechUtterance = utterance;
        try {
          try { window.speechSynthesis.resume(); } catch (_error) {}
          window.speechSynthesis.speak(utterance);
        } catch (_error) {
          this.activeSpeechUtterance = null;
          safeEnd('error');
        }
      } catch (error) {
        this.error = String(error && (error.message || error) || 'iOS TTS playback failed');
        this._notifyStateChange();
        safeEnd('error');
      }
    })();

    return { handled: true, cancel: job.cancel };
  }

  // Stub for Android/mobile pipeline
  _speakTextMobile(args) {
    // TODO: Implement robust Android/mobile-specific TTS/audio logic here
    // For now, fallback to unified logic
    return this._speakTextDesktop(args);
  }

  // Desktop/server-preferred pipeline (bm_george as default for narration)
  _speakTextDesktop({
    text,
    voiceId = 'bm_george', // Always prefer male UK voice for narration
    speed = 1,
    pitch = 1,
    volume = 1,
    onStart = null,
    onEnd = null
  } = {}) {
    const spokenText = normalizeText(text);
    if (!spokenText) return { handled: false, reason: 'empty_text' };

    // If this is a narrator cue and not explicitly overridden, force bm_george
    let effectiveVoiceId = voiceId;
    if (!voiceId || voiceId === 'af_heart' || voiceId === 'af_bella' || voiceId === 'am_michael') {
      effectiveVoiceId = 'bm_george';
    }

    const safeSpeed = clamp(speed, 0.65, 1.6, 1);
    const safePitch = clamp(pitch, 0.7, 1.35, 1);
    const safeVolume = clamp(volume, 0, 1, 1);
    let cancelled = false;
    const jobId = `adaptive-desktop-${nowMs()}-${hashString(`${effectiveVoiceId}|${spokenText}`).toString(36).slice(0, 8)}`;
    const job = {
      id: jobId,
      cancel: (options = {}) => {
        cancelled = true;
        const opts = options && typeof options === 'object' ? options : {};
        const fadeOutMs = clamp(opts.fadeOutMs, 0, 220, 0);
        let cancelPlaybackPromise = null;
        if (this.activeJob && this.activeJob.id === jobId) {
          this.activeJob = null;
          if (fadeOutMs > 0 && this.audioEl && !this.audioEl.paused) {
            cancelPlaybackPromise = this._fadeOutAudioElement({ durationMs: fadeOutMs }).catch(() => {
              this._stopAudioElement();
              return false;
            });
          } else {
            this._stopAudioElement();
          }
        }
        if (this.activeSpeechUtterance && window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch (_error) {}
          this.activeSpeechUtterance = null;
        }
        return cancelPlaybackPromise;
      }
    };
    this.activeJob = job;

    let started = false;
    let finished = false;
    const safeStart = () => {
      if (cancelled || started) return;
      started = true;
      if (typeof onStart === 'function') {
        try { onStart(); } catch (_error) {}
      }
    };
    const safeEnd = (status = 'end') => {
      if (cancelled || finished) return;
      finished = true;
      if (this.activeJob && this.activeJob.id === jobId) this.activeJob = null;
      if (typeof onEnd === 'function') {
        try { onEnd(status); } catch (_error) {}
      }
    };

    (async () => {
      try {
        const loadResult = await this.ensureLoaded();
        if (!loadResult || loadResult.ok !== true) {
          throw new Error((loadResult && loadResult.error) || 'voice_load_failed');
        }
        if (cancelled || !this.activeJob || this.activeJob.id !== jobId) return;

        let clip = null;
        try {
          clip = await this._getOrGenerateAudioClip({ text: spokenText, voiceId: effectiveVoiceId, speed: safeSpeed, pitch: safePitch });
        } catch (error) {
          clip = null;
        }

        if (cancelled || !this.activeJob || this.activeJob.id !== jobId) return;

        if (!clip || !clip.objectUrl) {
          // If server fails, fallback to browser, but only allow high-quality English voices
          await this._warmBrowserFallbackVoices({ primeUtterance: true, timeoutMs: 900, voiceIds: [effectiveVoiceId] }).catch(() => {});
          let voices = [];
          try {
            voices = Array.isArray(window.speechSynthesis.getVoices()) ? window.speechSynthesis.getVoices() : [];
          } catch (_error) {}
          // Try to resolve bm_george or best UK male voice
          let picked = this._resolveAssignedBrowserFallbackVoice(voices, 'bm_george');
          if (!picked) {
            // Fallback: pick any en-GB male voice
            picked = voices.find(v => String(v.lang || '').toLowerCase().startsWith('en-gb') && String(v.gender || '').toLowerCase() === 'male');
          }
          if (!picked) {
            // Fallback: pick any en-GB voice
            picked = voices.find(v => String(v.lang || '').toLowerCase().startsWith('en-gb'));
          }
          if (!picked) {
            // Fallback: pick any English voice
            picked = voices.find(v => String(v.lang || '').toLowerCase().startsWith('en'));
          }
          if (!picked) {
            // Visual warning for missing voice
            if (typeof window !== 'undefined') {
              const msg = `[TTS] No usable UK/English browser voice for narration. Skipping.`;
              if (window.console && window.console.warn) window.console.warn(msg);
              if (typeof window.showTtsWarningToast === 'function') {
                window.showTtsWarningToast(msg);
              }
            }
            safeEnd('error');
            return;
          }
          let utterance;
          try {
            utterance = new SpeechSynthesisUtterance(spokenText);
          } catch (_error) {
            safeEnd('error');
            return;
          }
          try { utterance.voice = picked; } catch (_error) {}
          try { if (picked.lang) utterance.lang = picked.lang; } catch (_error) {}
          try { utterance.rate = safeSpeed; } catch (_error) {}
          try { utterance.pitch = safePitch; } catch (_error) {}
          try { utterance.volume = safeVolume; } catch (_error) {}

          utterance.onstart = () => {
            if (cancelled) return;
            safeStart();
          };
          utterance.onend = () => {
            if (cancelled) return;
            safeEnd('end');
          };
          utterance.onerror = () => {
            if (cancelled) return;
            safeEnd('error');
          };
          this.activeSpeechUtterance = utterance;
          try {
            try { window.speechSynthesis.resume(); } catch (_error) {}
            window.speechSynthesis.speak(utterance);
          } catch (_error) {
            this.activeSpeechUtterance = null;
            safeEnd('error');
          }
          return;
        }

        const el = this._getAudioElement();
        const currentJobId = jobId;
        let finalized = false;
        const finalize = (status) => {
          if (finalized) return;
          finalized = true;
          el.removeEventListener('playing', handlePlaying);
          el.removeEventListener('ended', handleEnded);
          el.removeEventListener('error', handleError);
          safeEnd(status);
        };
        const handlePlaying = () => {
          if (cancelled || !this.activeJob || this.activeJob.id !== currentJobId) return;
          safeStart();
        };
        const handleEnded = () => finalize('end');
        const handleError = () => finalize('error');

        el.addEventListener('playing', handlePlaying, { once: true });
        el.addEventListener('ended', handleEnded, { once: true });
        el.addEventListener('error', handleError, { once: true });
        el.preload = 'auto';
        el.volume = safeVolume;
        el.src = clip.objectUrl;
        try { el.currentTime = 0; } catch (_error) {}
        const playResult = el.play();
        if (playResult && typeof playResult.then === 'function') {
          playResult.then(() => {
            if (cancelled || !this.activeJob || this.activeJob.id !== currentJobId) return;
            safeStart();
          }).catch(() => {
            void this._warmBrowserFallbackVoices({ primeUtterance: false, timeoutMs: 500 }).catch(() => {});
            if (!finalized) {
              finalized = true;
              el.removeEventListener('playing', handlePlaying);
              el.removeEventListener('ended', handleEnded);
              el.removeEventListener('error', handleError);
              try { el.pause(); } catch (_error) {}
            }
            // If server and browser fallback both fail, show warning
            if (typeof window !== 'undefined') {
              const msg = `[TTS] All desktop TTS options failed for narration.`;
              if (window.console && window.console.warn) window.console.warn(msg);
              if (typeof window.showTtsWarningToast === 'function') {
                window.showTtsWarningToast(msg);
              }
            }
            safeEnd('error');
          });
        } else {
          safeStart();
        }
      } catch (error) {
        this.error = String(error && (error.message || error) || 'Adaptive TTS playback failed');
        this._notifyStateChange();
        safeEnd('error');
      }
    })();

    return { handled: true, cancel: job.cancel };
  }

  async prepareBrowserFallback({
    voiceIds = [],
    primeUtterance = false,
    timeoutMs = 1200
  } = {}) {
    await this.ensureLoaded();
    return this._warmBrowserFallbackVoices({
      primeUtterance: primeUtterance === true,
      timeoutMs,
      voiceIds: Array.isArray(voiceIds) && voiceIds.length ? voiceIds : this.catalog.map((entry) => String(entry && entry.id || ''))
    });
  }
}

export const ADAPTIVE_NARRATOR_VOICE_IDS = DEFAULT_NARRATOR_VOICE_IDS;
