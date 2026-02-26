import { ARCHETYPES } from './archetypes.js';
import { classifyVoiceCueArchetype } from './classifyArchetype.js';
import { getSpeechPresetForArchetype, stylizeVoiceCueText } from './archetypePresets.js';
import { clamp, hashString, normalizeTrimmedText as normalizeText, nowMs } from './coreUtils.js';

function normalizeCue(rawCue = {}) {
  if (!rawCue || typeof rawCue !== 'object') return null;
  const text = normalizeText(rawCue.text);
  if (!text) return null;
  const priority = Number.isFinite(Number(rawCue.priority)) ? Number(rawCue.priority) : 50;
  const type = String(rawCue.type || 'entry').trim() || 'entry';
  const normalized = {
    id: normalizeText(rawCue.id) || `vc-${hashString(`${type}|${text}|${Math.random()}`)}`,
    type,
    text,
    subtitleText: normalizeText(rawCue.subtitleText) || text,
    archetype: rawCue.archetype ? String(rawCue.archetype) : '',
    intensity: clamp(rawCue.intensity, 0, 1, 0.6),
    priority,
    dedupeKey: normalizeText(rawCue.dedupeKey) || `${type}:${text.toLowerCase()}`,
    preempt: rawCue.preempt === true,
    delayMs: Math.max(0, Number(rawCue.delayMs) || 0),
    speechSpec: rawCue.speechSpec && typeof rawCue.speechSpec === 'object' ? { ...rawCue.speechSpec } : {}
  };
  return normalized;
}

function scoreVoiceQuality(voice) {
  const name = String(voice && voice.name || '').toLowerCase();
  const uri = String(voice && voice.voiceURI || '').toLowerCase();
  const lang = String(voice && voice.lang || '').toLowerCase();
  const text = `${name} ${uri}`;
  let score = 0;
  if (lang.startsWith('en-us')) score += 14;
  else if (lang.startsWith('en-gb')) score += 12;
  else if (lang.startsWith('en')) score += 10;
  if (voice && voice.default) score += 5;
  if (/(neural|natural|premium|enhanced)/.test(text)) score += 18;
  if (/(online \(natural\)|online natural)/.test(text)) score += 16;
  if (/(microsoft|google|apple)/.test(text)) score += 4;
  if (/(compact|espeak|festival)/.test(text)) score -= 12;
  return score;
}

export function getVoiceStableId(voice) {
  if (!voice || typeof voice !== 'object') return '';
  const uri = String(voice.voiceURI || '').trim();
  const name = String(voice.name || '').trim();
  const lang = String(voice.lang || '').trim();
  const base = uri || name;
  if (!base) return '';
  return `${base}::${lang}`;
}

function matchesVoiceId(voice, voiceId = '') {
  const target = String(voiceId || '').trim();
  if (!target) return false;
  const stable = getVoiceStableId(voice);
  if (stable && stable === target) return true;
  const uri = String(voice && voice.voiceURI || '').trim();
  const name = String(voice && voice.name || '').trim();
  return target === uri || target === name;
}

export function pickBestVoice(voices = [], {
  lang = 'en-US',
  voiceHints = [],
  diversityKey = '',
  archetype = '',
  qualityBias = 0
} = {}) {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return null;
  const targetLang = String(lang || 'en-US').toLowerCase();
  const hints = (Array.isArray(voiceHints) ? voiceHints : [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  const englishPool = list.filter((voice) => String(voice.lang || '').toLowerCase().startsWith('en'));
  const pool = englishPool.length ? englishPool : list;
  const diversitySeed = hashString(`${diversityKey}|${archetype}`);

  const ranked = pool.map((voice, index) => {
    const name = String(voice && voice.name || '').toLowerCase();
    const uri = String(voice && voice.voiceURI || '').toLowerCase();
    const langCode = String(voice && voice.lang || '').toLowerCase();
    const combined = `${name} ${uri}`;

    let score = scoreVoiceQuality(voice) + Number(qualityBias || 0);
    if (langCode === targetLang) score += 8;
    else if (langCode.startsWith(targetLang.split('-')[0] || 'en')) score += 4;
    for (let i = 0; i < hints.length; i += 1) {
      if (combined.includes(hints[i])) score += 6;
    }
    const diversityBucket = (hashString(`${diversitySeed}|${voice && voice.name || ''}`) % 7);
    score += (6 - Math.abs((diversitySeed % 7) - diversityBucket)) * 0.15;
    score += (index * 0.001);

    return { voice, score };
  }).sort((a, b) => b.score - a.score);

  return ranked[0] ? ranked[0].voice : null;
}

export class VoiceManager {
  constructor(options = {}) {
    this.options = options && typeof options === 'object' ? { ...options } : {};
    this.synth = null;
    this.supported = false;
    this.ready = false;
    this.unlocked = false;
    this.muted = false;
    this.enabled = true;
    this.expressiveMode = true;
    this.queue = [];
    this.maxQueue = Math.max(4, Number(this.options.maxQueue) || 16);
    this.activeCue = null;
    this.activeUtterance = null;
    this.activeCustomCancel = null;
    this.activeCancelPromise = null;
    this.activeToken = 0;
    this.activeDelayTimer = null;
    this.queueSeq = 0;
    this.voices = [];
    this.voiceCacheByArchetype = new Map();
    this.recentDedupe = new Map();
    this.lastPrimeAt = 0;
    this._voicesChangeHandler = null;
  }

  _browserSpeechDisabled() {
    return this.options && this.options.disableBrowserSpeech === true;
  }

  _hasCustomSpeaker() {
    return Boolean(this.options && typeof this.options.customSpeak === 'function');
  }

  init() {
    if (this.ready) return Promise.resolve(this.getState());
    this.supported = this._isSpeechSupported();
    if (!this.supported) {
      this.ready = true;
      this._notifyStateChange();
      return Promise.resolve(this.getState());
    }

    if (this._browserSpeechDisabled() && this._hasCustomSpeaker()) {
      this.synth = null;
      this.voices = [];
      this.ready = true;
      this._notifyStateChange();
      this._drain();
      return Promise.resolve(this.getState());
    }

    this.synth = this._getSynth();
    this._refreshVoices();
    this._installVoiceChangeListener();
    this.ready = true;
    this._notifyStateChange();
    this._drain();
    return Promise.resolve(this.getState());
  }

  unlock() {
    if (!this.ready) {
      void this.init();
    }
    this.unlocked = true;
    this._primeSpeechOnGesture();
    this._notifyStateChange();
    this._drain();
  }

  setMuted(muted) {
    const next = muted === true;
    if (this.muted === next) return;
    this.muted = next;
    if (this.muted) {
      this._cancelActive('muted');
    }
    this._notifyStateChange();
  }

  setEnabled(enabled) {
    const next = enabled !== false;
    if (this.enabled === next) return;
    this.enabled = next;
    if (!this.enabled) {
      this.clearQueue('disabled', { includeActive: true });
    }
    this._notifyStateChange();
    this._drain();
  }

  setExpressiveMode(enabled) {
    this.expressiveMode = enabled !== false;
    this._notifyStateChange();
  }

  refreshVoices() {
    this._refreshVoices();
    this.voiceCacheByArchetype.clear();
    this._notifyStateChange();
    return this.getVoicesCatalog();
  }

  getVoicesCatalog() {
    const list = Array.isArray(this.voices) ? this.voices : [];
    return list.map((voice, index) => ({
      id: getVoiceStableId(voice) || `voice-${index}`,
      name: String(voice && voice.name || '').trim() || `Voice ${index + 1}`,
      lang: String(voice && voice.lang || '').trim() || '',
      voiceURI: String(voice && voice.voiceURI || '').trim() || '',
      default: Boolean(voice && voice.default),
      localService: voice && typeof voice.localService === 'boolean' ? voice.localService : null,
      qualityScore: scoreVoiceQuality(voice)
    }));
  }

  enqueue(rawCue) {
    const cue = normalizeCue(rawCue);
    if (!cue) return { enqueued: false, reason: 'invalid' };
    if (!this.supported) return { enqueued: false, reason: 'unsupported' };
    if (!this.enabled) return { enqueued: false, reason: 'disabled' };

    this._pruneRecentDedupe();
    if (cue.dedupeKey && this.recentDedupe.has(cue.dedupeKey)) {
      return { enqueued: false, reason: 'duplicate' };
    }

    if (cue.preempt === true) {
      this.clearQueue('preempt', { includeActive: true });
    }

    if (this.queue.length >= this.maxQueue && cue.priority <= 35) {
      return { enqueued: false, reason: 'queue_full_low_priority' };
    }

    const queueItem = {
      ...cue,
      _seq: ++this.queueSeq,
      _enqueuedAt: nowMs()
    };

    this.queue.push(queueItem);
    this._pruneQueueBacklog();
    this._sortQueue();
    this._notifyStateChange();
    this._drain();
    return { enqueued: true, cue: queueItem };
  }

  clearQueue(reason = 'clear', options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const types = Array.isArray(opts.types) ? new Set(opts.types.map((t) => String(t))) : null;
    if (types) {
      this.queue = this.queue.filter((cue) => !types.has(String(cue.type || '')));
    } else {
      this.queue = [];
    }

    if (opts.includeActive === true) {
      if (!types || (this.activeCue && types.has(String(this.activeCue.type || '')))) {
        this._cancelActive(reason);
      }
    }

    this._notifyStateChange();
    this._drain();
  }

  getState() {
    return {
      supported: this.supported,
      ready: this.ready,
      unlocked: this.unlocked,
      muted: this.muted,
      enabled: this.enabled,
      expressiveMode: this.expressiveMode,
      queued: this.queue.length,
      speaking: Boolean(this.activeCue),
      voicesLoaded: this.voices.length,
      activeCueType: this.activeCue ? String(this.activeCue.type || '') : '',
      activeCueText: this.activeCue ? String(this.activeCue.subtitleText || this.activeCue.text || '') : ''
    };
  }

  _isSpeechSupported() {
    try {
      if (this._hasCustomSpeaker()) return true;
      return typeof window !== 'undefined'
        && !!window.speechSynthesis
        && typeof window.SpeechSynthesisUtterance === 'function';
    } catch (error) {
      return false;
    }
  }

  _getSynth() {
    try {
      if (this._browserSpeechDisabled()) return null;
      return this._isSpeechSupported() ? window.speechSynthesis : null;
    } catch (error) {
      return null;
    }
  }

  _installVoiceChangeListener() {
    if (!this.synth || typeof this.synth.addEventListener !== 'function') return;
    if (this._voicesChangeHandler) return;
    this._voicesChangeHandler = () => {
      this._refreshVoices();
      this.voiceCacheByArchetype.clear();
      this._notifyStateChange();
    };
    try {
      this.synth.addEventListener('voiceschanged', this._voicesChangeHandler);
    } catch (error) {
    }
  }

  _refreshVoices() {
    if (this._browserSpeechDisabled()) {
      this.voices = [];
      return this.voices;
    }
    if (!this.synth || typeof this.synth.getVoices !== 'function') {
      this.voices = [];
      return this.voices;
    }
    try {
      const next = this.synth.getVoices() || [];
      this.voices = Array.isArray(next) ? next.filter(Boolean) : [];
    } catch (error) {
      this.voices = [];
    }
    return this.voices;
  }

  _primeSpeechOnGesture() {
    if (!this.supported) return;
    if (this._browserSpeechDisabled()) return;
    const synth = this._getSynth();
    if (!synth) return;
    const now = nowMs();
    if ((now - this.lastPrimeAt) < 2000) return;
    this.lastPrimeAt = now;
    try {
      this._refreshVoices();
      const utter = new SpeechSynthesisUtterance('.');
      utter.volume = 0;
      utter.rate = 1;
      utter.pitch = 1;
      utter.onend = () => {};
      utter.onerror = () => {};
      synth.speak(utter);
      window.setTimeout(() => {
        try {
          synth.cancel();
        } catch (error) {
        }
      }, 40);
    } catch (error) {
    }
  }

  _sortQueue() {
    this.queue.sort((a, b) => {
      if (Number(b.priority) !== Number(a.priority)) return Number(b.priority) - Number(a.priority);
      if (Number(a._seq) !== Number(b._seq)) return Number(a._seq) - Number(b._seq);
      return 0;
    });
  }

  _pruneQueueBacklog() {
    if (this.queue.length <= this.maxQueue) return;
    const keep = [];
    const sorted = this.queue.slice().sort((a, b) => {
      if (Number(b.priority) !== Number(a.priority)) return Number(b.priority) - Number(a.priority);
      return Number(a._seq) - Number(b._seq);
    });
    for (let i = 0; i < sorted.length; i += 1) {
      const cue = sorted[i];
      if (keep.length < this.maxQueue) {
        keep.push(cue);
        continue;
      }
      if (cue.type === 'entry' && Number(cue.priority) <= 40) {
        continue;
      }
    }
    this.queue = keep;
    this._sortQueue();
  }

  _pruneRecentDedupe() {
    const now = nowMs();
    const ttl = Math.max(2000, Number(this.options.dedupeTtlMs) || 12000);
    for (const [key, ts] of this.recentDedupe.entries()) {
      if ((now - ts) > ttl) {
        this.recentDedupe.delete(key);
      }
    }
  }

  _computeCueOutputVolume(cue) {
    const getter = this.options && typeof this.options.getVolumeForCue === 'function'
      ? this.options.getVolumeForCue
      : null;
    const base = getter ? Number(getter(cue)) : 1;
    const safeBase = clamp(base, 0, 1, 1);
    return this.muted ? 0 : safeBase;
  }

  _selectVoiceForCue(cue, preset) {
    const preferredVoiceId = this.options && typeof this.options.getPreferredVoiceIdForCue === 'function'
      ? String(this.options.getPreferredVoiceIdForCue(cue, {
        expressiveMode: this.expressiveMode,
        voices: this.getVoicesCatalog()
      }) || '').trim()
      : '';
    if (preferredVoiceId) {
      const explicit = this.voices.find((voice) => matchesVoiceId(voice, preferredVoiceId));
      if (explicit) return explicit;
    }

    const archetype = String(cue.archetype || '');
    const cacheKey = `${this.expressiveMode ? 'x' : 'n'}|${archetype}|${cue.type}|${cue.speechSpec && cue.speechSpec.voiceStyle ? cue.speechSpec.voiceStyle : ''}|${preferredVoiceId}`;
    const cached = this.voiceCacheByArchetype.get(cacheKey);
    if (cached && this.voices.includes(cached)) return cached;
    const voice = pickBestVoice(this.voices, {
      lang: (cue.speechSpec && cue.speechSpec.lang) || 'en-US',
      voiceHints: preset.voiceHints || [],
      diversityKey: `${cue.type}|${cue.dedupeKey || cue.id}`,
      archetype,
      qualityBias: 0
    });
    if (voice) this.voiceCacheByArchetype.set(cacheKey, voice);
    return voice;
  }

  _buildSpeakingPlan(cue) {
    const inferred = cue.archetype
      ? { archetype: cue.archetype, confidence: 0.65, intensity: cue.intensity }
      : classifyVoiceCueArchetype({
        ...cue,
        voiceStyle: cue.speechSpec && cue.speechSpec.voiceStyle
      });

    const neutralPersonaArchetype = (() => {
      const cueType = String(cue && cue.type || '').toLowerCase();
      if (cueType === 'entry') return ARCHETYPES.ANNOUNCER;
      if (cueType === 'twist') return ARCHETYPES.ANNOUNCER;
      if (cueType === 'round4') return ARCHETYPES.NARRATOR;
      return ARCHETYPES.ANNOUNCER;
    })();
    const expressiveArchetype = inferred && inferred.archetype ? inferred.archetype : ARCHETYPES.ANNOUNCER;
    const archetype = this.expressiveMode ? expressiveArchetype : neutralPersonaArchetype;
    const intensity = clamp(
      cue.intensity != null ? cue.intensity : (inferred && inferred.intensity),
      0,
      1,
      0.58
    );
    const preset = getSpeechPresetForArchetype(archetype, { expressive: this.expressiveMode });
    const presetForBackend = this._browserSpeechDisabled()
      ? { ...preset, voiceHints: [] }
      : preset;
    const stylizedText = stylizeVoiceCueText(cue.text, archetype, {
      expressive: this.expressiveMode,
      cueType: cue.type
    });
    const voice = this._selectVoiceForCue(cue, presetForBackend);

    const rawSpeechRate = clamp(cue.speechSpec && cue.speechSpec.rate, 0.6, 2, presetForBackend.rate || 1);
    const rawSpeechPitch = clamp(cue.speechSpec && cue.speechSpec.pitch, 0.4, 2, presetForBackend.pitch || 1);
    const rateBlendWeight = this.expressiveMode ? 0.28 : 0.04;
    const pitchBlendWeight = this.expressiveMode ? 0.24 : 0.03;
    const rateBase = (Number(presetForBackend.rate) * (1 - rateBlendWeight)) + (rawSpeechRate * rateBlendWeight);
    const pitchBase = (Number(presetForBackend.pitch) * (1 - pitchBlendWeight)) + (rawSpeechPitch * pitchBlendWeight);
    const gainBase = clamp(cue.speechSpec && cue.speechSpec.gain, 0, 2, presetForBackend.volume || 1);

    const intensityRateDelta = this.expressiveMode ? ((intensity - 0.5) * 0.32) : ((intensity - 0.5) * 0.12);
    const intensityPitchDelta = this.expressiveMode ? ((intensity - 0.5) * 0.28) : ((intensity - 0.5) * 0.08);

    const rate = clamp(rateBase + intensityRateDelta, this.expressiveMode ? 0.72 : 0.9, this.expressiveMode ? 1.85 : 1.22, 1);
    const pitch = clamp(pitchBase + intensityPitchDelta, this.expressiveMode ? 0.62 : 0.9, this.expressiveMode ? 1.55 : 1.16, 1);

    return {
      archetype,
      stylizedText,
      subtitleText: cue.subtitleText || cue.text,
      voice,
      rate,
      pitch,
      gain: gainBase
    };
  }

  _drain() {
    if (!this.supported || !this.ready || !this.enabled || this.muted || !this.unlocked) return;
    if (this.activeCue || this.activeDelayTimer || this.activeCancelPromise) return;
    if (!this.queue.length) return;

    const nextCue = this.queue.shift();
    if (!nextCue) return;
    this._speakCue(nextCue);
    this._notifyStateChange();
  }

  _speakCue(cue) {
    const plan = this._buildSpeakingPlan(cue);
    const volume = clamp(this._computeCueOutputVolume(cue) * (Number(plan.gain) || 1), 0, 1, 1);
    if (volume <= 0.0001) {
      this._markCueConsumed(cue);
      this._finishActiveCue();
      return;
    }

    const token = ++this.activeToken;
    this.activeCue = cue;

    const startSpeak = () => {
      if (token !== this.activeToken) return;
      const synth = this._getSynth();
      try {
        if (synth && typeof synth.cancel === 'function') synth.cancel();
      } catch (error) {
      }
      const customSpeak = this.options && typeof this.options.customSpeak === 'function'
        ? this.options.customSpeak
        : null;
      if (customSpeak) {
        let startedByCustom = false;
        let endedByCustom = false;
        const startFromCustom = () => {
          if (token !== this.activeToken || startedByCustom) return;
          startedByCustom = true;
          this._markCueConsumed(cue);
          this._notifyCueStart(cue, plan);
          this._notifyStateChange();
        };
        const endFromCustom = (status = 'end') => {
          if (token !== this.activeToken || endedByCustom) return;
          endedByCustom = true;
          if (!startedByCustom) {
            startFromCustom();
          }
          this.activeCustomCancel = null;
          this._notifyCueEnd(cue, plan, status);
          this._finishActiveCue();
        };

        try {
          const customResult = customSpeak({
            cue,
            plan,
            volume,
            expressiveMode: this.expressiveMode,
            start: startFromCustom,
            end: endFromCustom
          });

          const onResolved = (result) => {
            if (token !== this.activeToken) return;
            if (result && result.handled === true) {
              this.activeCustomCancel = typeof result.cancel === 'function' ? result.cancel : null;
              if (result.started === true) startFromCustom();
              return;
            }
            if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
              this._notifyCueEnd(cue, plan, 'error');
              this._finishActiveCue();
              return;
            }
            let utterance;
            try {
              utterance = new SpeechSynthesisUtterance(plan.stylizedText || cue.text);
            } catch (error) {
              this._markCueConsumed(cue);
              this._finishActiveCue();
              return;
            }
            this.activeUtterance = utterance;
            try { utterance.volume = volume; } catch (error) {}
            try { utterance.rate = plan.rate; } catch (error) {}
            try { utterance.pitch = plan.pitch; } catch (error) {}
            if (plan.voice) {
              try { utterance.voice = plan.voice; } catch (error) {}
              try { if (plan.voice.lang) utterance.lang = plan.voice.lang; } catch (error) {}
            }
            utterance.onstart = () => {
              if (token !== this.activeToken) return;
              this._markCueConsumed(cue);
              this._notifyCueStart(cue, plan);
              this._notifyStateChange();
            };
            const finalize = (status) => () => {
              if (token !== this.activeToken) return;
              this._notifyCueEnd(cue, plan, status);
              this._finishActiveCue();
            };
            utterance.onend = finalize('end');
            utterance.onerror = finalize('error');
            try {
              synth.speak(utterance);
            } catch (error) {
              this._notifyCueEnd(cue, plan, 'error');
              this._finishActiveCue();
            }
          };

          if (customResult && typeof customResult.then === 'function') {
            customResult.then(onResolved).catch(() => {
              if (token !== this.activeToken) return;
              this._notifyCueEnd(cue, plan, 'error');
              this._finishActiveCue();
            });
            return;
          }
          onResolved(customResult);
          return;
        } catch (error) {
        }
      }
      if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
        this._notifyCueEnd(cue, plan, 'error');
        this._finishActiveCue();
        return;
      }
      let utterance;
      try {
        utterance = new SpeechSynthesisUtterance(plan.stylizedText || cue.text);
      } catch (error) {
        this._markCueConsumed(cue);
        this._finishActiveCue();
        return;
      }
      this.activeUtterance = utterance;
      try { utterance.volume = volume; } catch (error) {}
      try { utterance.rate = plan.rate; } catch (error) {}
      try { utterance.pitch = plan.pitch; } catch (error) {}
      if (plan.voice) {
        try { utterance.voice = plan.voice; } catch (error) {}
        try { if (plan.voice.lang) utterance.lang = plan.voice.lang; } catch (error) {}
      }
      utterance.onstart = () => {
        if (token !== this.activeToken) return;
        this._markCueConsumed(cue);
        this._notifyCueStart(cue, plan);
        this._notifyStateChange();
      };
      const finalize = (status) => () => {
        if (token !== this.activeToken) return;
        this._notifyCueEnd(cue, plan, status);
        this._finishActiveCue();
      };
      utterance.onend = finalize('end');
      utterance.onerror = finalize('error');
      try {
        synth.speak(utterance);
      } catch (error) {
        this._notifyCueEnd(cue, plan, 'error');
        this._finishActiveCue();
      }
    };

    const delayMs = Math.max(0, Number(cue.delayMs) || 0);
    if (delayMs > 0) {
      this.activeDelayTimer = window.setTimeout(() => {
        if (token !== this.activeToken) return;
        this.activeDelayTimer = null;
        startSpeak();
      }, delayMs);
      return;
    }
    startSpeak();
  }

  _markCueConsumed(cue) {
    if (!cue || !cue.dedupeKey) return;
    this.recentDedupe.set(cue.dedupeKey, nowMs());
  }

  _cancelActive(reason = 'cancel') {
    if (this.activeDelayTimer) {
      window.clearTimeout(this.activeDelayTimer);
      this.activeDelayTimer = null;
    }
    if (this.activeCue || this.activeUtterance) {
      this._notifyCueEnd(this.activeCue, null, reason);
    }
    this.activeCue = null;
    this.activeUtterance = null;
    const customCancel = this.activeCustomCancel;
    this.activeCustomCancel = null;
    let cancelPromise = null;
    if (customCancel) {
      try {
        const customResult = customCancel({
          reason,
          fadeOutMs: reason === 'preempt' ? 85 : 0
        });
        if (customResult && typeof customResult.then === 'function') {
          cancelPromise = customResult;
        }
      } catch (error) {
      }
    }
    this.activeToken += 1;
    try {
      const synth = this._getSynth();
      if (synth && typeof synth.cancel === 'function') synth.cancel();
    } catch (error) {
    }
    if (cancelPromise) {
      const waitFor = Promise.resolve(cancelPromise)
        .catch(() => {})
        .finally(() => {
          if (this.activeCancelPromise === waitFor) {
            this.activeCancelPromise = null;
          }
          this._notifyStateChange();
          this._drain();
        });
      this.activeCancelPromise = waitFor;
    }
    this._notifyStateChange();
  }

  _finishActiveCue() {
    this.activeCue = null;
    this.activeUtterance = null;
    this.activeCustomCancel = null;
    if (this.activeDelayTimer) {
      window.clearTimeout(this.activeDelayTimer);
      this.activeDelayTimer = null;
    }
    this._notifyStateChange();
    this._drain();
  }

  _notifyStateChange() {
    if (typeof this.options.onStateChange !== 'function') return;
    try {
      this.options.onStateChange(this.getState());
    } catch (error) {
    }
  }

  _notifyCueStart(cue, plan) {
    if (typeof this.options.onCueStart !== 'function') return;
    try {
      this.options.onCueStart({
        cue,
        plan,
        state: this.getState()
      });
    } catch (error) {
    }
  }

  _notifyCueEnd(cue, plan, status) {
    if (typeof this.options.onCueEnd !== 'function') return;
    try {
      this.options.onCueEnd({
        cue,
        plan,
        status,
        state: this.getState()
      });
    } catch (error) {
    }
  }
}
