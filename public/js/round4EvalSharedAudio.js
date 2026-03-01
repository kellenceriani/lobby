// Shared Round 4 audio bridge + voice cue helpers (classic script).
// Loaded before round4Eval.js so its global function declarations remain available.

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
  let unlocked = false;
  try {
    if (bridge && typeof bridge.ensureUnlocked === 'function') bridge.ensureUnlocked();
    if (bridge && typeof bridge.ensureRunning === 'function') bridge.ensureRunning();
    unlocked = true;
  } catch (error) {
    unlocked = false;
  }
  // Prewarm iOS/browser fallback voice assignments through the shared audio bridge.
  try {
    if (bridge && typeof bridge.prepareVoiceFallback === 'function') {
      Promise.resolve(bridge.prepareVoiceFallback({ primeUtterance: true, timeoutMs: 1500 })).catch(() => {});
    }
  } catch (error) {
    if (window && window.console && window.console.warn) {
      window.console.warn('[TTS] Failed to prewarm browser fallback voices:', error);
    }
  }
  if (window && window.console && window.console.info) {
    window.console.info('[TTS] ensureSharedAudioReady', { unlocked });
  }
  return unlocked;
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
  timeoutMs = 1200,
  minQuietMs = 120,
  includeQueue = false
} = {}) {
  const bridge = getSharedAudioBridge();
  if (!bridge || typeof bridge.getVoiceState !== 'function') {
    return Promise.resolve({ ok: true, skipped: true, reason: 'bridge-unavailable' });
  }

  const safeTimeoutMs = Math.max(250, Number(timeoutMs) || 1200);
  const safeMinQuietMs = Math.max(0, Number(minQuietMs) || 120);
  const trackQueue = includeQueue === true;
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

      const active = state.speaking || (trackQueue && state.queued > 0);
      if (active) {
        quietSince = 0;
        if (!hinted) {
          hinted = true;
          const hint = document.getElementById('evalPreloadHint');
          if (hint) hint.textContent = 'Finalizing reveal setup...';
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

