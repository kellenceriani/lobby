import {
  player,
  roomState,
  gameState,
  clearTimers,
  addTimer,
  resetAllState
} from './state.js';
import {
  showScreen,
  showHelp,
  closeHelp,
  showToast,
  createConfetti,
  updateDraftWarning,
  updateAutoFillWarning,
  updateDraftCounter,
  updateLivePicksCount,
  updateVoteStatusBadge,
  resetResultsDetails,
  switchLobbyTab,
  toggleAccordion,
  toggleScenario,
  toggleResultsDetails
} from './ui.js';

const socket = io(window.location.origin, {
  path: '/socket.io',
  transports: ['websocket', 'polling']
});
window.socket = socket; // Expose to window for round4Eval.js

const mobileChromeState = {
  enabled: false,
  fullscreenAttempted: false,
  nudgeTimerIds: []
};

const installPromptState = {
  deferredPrompt: null,
  initialized: false,
  sessionDismissed: false,
  fallbackTimerId: null
};

const INSTALL_PROMPT_DISMISS_KEY = 'lobbywars_install_prompt_dismissed_session_v1';
const CONNECTION_DEBUG_KEY = 'lobbywars_connection_debug_v1';

const connectionDebugState = {
  enabled: false,
  lastSignature: '',
  lastShownAt: 0
};

function resolveConnectionDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('debugConnection') === '1') {
      window.localStorage.setItem(CONNECTION_DEBUG_KEY, '1');
      return true;
    }
    if (params.get('debugConnection') === '0') {
      window.localStorage.removeItem(CONNECTION_DEBUG_KEY);
      return false;
    }
    return window.localStorage.getItem(CONNECTION_DEBUG_KEY) === '1';
  } catch (error) {
    return false;
  }
}

function shouldAutoOpenRound4Loading() {
  try {
    const params = new URLSearchParams(window.location.search || '');
    return params.get('debugRound4Loading') === '1';
  } catch (error) {
    return false;
  }
}

function openRound4LoadingDebugView() {
  if (typeof window.initRound4Evaluation !== 'function') return;

  const debugData = {
    scenario: 'PULL OFF A HEIST',
    twist: 'WITH GODZILLA AS BANKER',
    finalTeams: {
      ALPHA: [
        { name: 'Batman', ovr: 92 },
        { name: 'Sherlock Holmes', ovr: 89 }
      ],
      BRAVO: [
        { name: 'Hermione Granger', ovr: 90 },
        { name: 'Dwayne Johnson', ovr: 87 }
      ],
      CHARLIE: [
        { name: 'Gandalf', ovr: 95 },
        { name: 'SpongeBob', ovr: 84 }
      ]
    }
  };

  window.initRound4Evaluation(debugData);
}

function getSocketTransportName() {
  return socket && socket.io && socket.io.engine && socket.io.engine.transport
    ? socket.io.engine.transport.name
    : 'n/a';
}

function showConnectionDebugToast(status, detail = '') {
  if (!connectionDebugState.enabled) return;

  const now = Date.now();
  const origin = window.location.origin;
  const transport = getSocketTransportName();
  const socketId = socket && socket.id ? socket.id.slice(0, 8) : 'none';
  const signature = `${status}|${detail}|${transport}|${socketId}`;

  if (connectionDebugState.lastSignature === signature && (now - connectionDebugState.lastShownAt) < 2000) {
    return;
  }

  connectionDebugState.lastSignature = signature;
  connectionDebugState.lastShownAt = now;

  const roomTag = player && player.room ? ` room=${player.room}` : '';
  const suffix = detail ? ` • ${detail}` : '';
  const message = `ConnDebug: ${status}${suffix} • origin=${origin} • transport=${transport} • id=${socketId}${roomTag}`;
  showToast(message, status === 'error' ? 'warning' : 'info', 7000);
}

connectionDebugState.enabled = resolveConnectionDebugEnabled();
if (connectionDebugState.enabled) {
  showConnectionDebugToast('init', 'debugConnection=1 active');
}

function isLikelyMobileDevice() {
  const ua = navigator.userAgent || '';
  const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = navigator.maxTouchPoints > 0;
  return /android|iphone|ipad|ipod|mobile|windows phone/i.test(ua) || coarsePointer || hasTouch;
}

function setMobileAppHeightVar() {
  const viewportHeight = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
  if (!viewportHeight || !Number.isFinite(viewportHeight)) return;
  document.documentElement.style.setProperty('--app-height', `${Math.round(viewportHeight)}px`);
}

function nudgeBrowserChrome() {
  if (!mobileChromeState.enabled) return;
  if (window.scrollY > 0) return;
  window.scrollTo(0, 1);
}

function clearChromeNudges() {
  mobileChromeState.nudgeTimerIds.forEach((id) => clearTimeout(id));
  mobileChromeState.nudgeTimerIds = [];
}

function scheduleChromeNudges() {
  clearChromeNudges();
  const delays = [0, 80, 180, 320, 600, 1000, 1600, 2400];
  delays.forEach((delay) => {
    const timerId = setTimeout(() => {
      setMobileAppHeightVar();
      nudgeBrowserChrome();
    }, delay);
    mobileChromeState.nudgeTimerIds.push(timerId);
  });
}

function tryEnterFullscreenOnGesture() {
  if (mobileChromeState.fullscreenAttempted) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;

  const root = document.documentElement;
  const requestFullscreen =
    root.requestFullscreen
    || root.webkitRequestFullscreen
    || root.msRequestFullscreen;

  if (typeof requestFullscreen !== 'function') return;

  mobileChromeState.fullscreenAttempted = true;
  try {
    const maybePromise = requestFullscreen.call(root);
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => {
        mobileChromeState.fullscreenAttempted = false;
      });
    }
  } catch (error) {
    mobileChromeState.fullscreenAttempted = false;
  }
}

function installMobileChromeController() {
  if (!isLikelyMobileDevice()) return;

  mobileChromeState.enabled = true;
  document.body.classList.add('mobile-chrome-hack');
  setMobileAppHeightVar();
  scheduleChromeNudges();

  const refreshLayoutAndChrome = () => {
    setMobileAppHeightVar();
    scheduleChromeNudges();
  };

  window.addEventListener('load', refreshLayoutAndChrome, { passive: true });
  window.addEventListener('resize', refreshLayoutAndChrome, { passive: true });
  window.addEventListener('orientationchange', refreshLayoutAndChrome, { passive: true });
  window.addEventListener('pageshow', refreshLayoutAndChrome, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshLayoutAndChrome();
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setMobileAppHeightVar, { passive: true });
    window.visualViewport.addEventListener('scroll', setMobileAppHeightVar, { passive: true });
  }

  const unlockImmersiveMode = () => {
    tryEnterFullscreenOnGesture();
    nudgeBrowserChrome();
  };

  ['touchstart', 'touchend', 'pointerup', 'click'].forEach((eventName) => {
    document.addEventListener(eventName, unlockImmersiveMode, { passive: true });
  });
}

installMobileChromeController();

function isStandaloneDisplayMode() {
  const standaloneByMedia = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const standaloneByNavigator = window.navigator.standalone === true;
  return standaloneByMedia || standaloneByNavigator;
}

function isIOS() {
  const ua = navigator.userAgent || '';
  const classicIOS = /iphone|ipad|ipod/i.test(ua);
  const iPadDesktopMode = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return classicIOS || iPadDesktopMode;
}

function canShowInstallPromptNow() {
  try {
    return window.sessionStorage.getItem(INSTALL_PROMPT_DISMISS_KEY) !== '1';
  } catch (error) {
    return true;
  }
}

function rememberInstallPromptDismissal() {
  try {
    window.sessionStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, '1');
  } catch (error) {
    // no-op
  }
}

function isJoinScreenActive() {
  const joinScreen = document.getElementById('join');
  return Boolean(joinScreen && joinScreen.classList.contains('active'));
}

function syncInstallPromptReopenVisibility() {
  const reopenBtn = document.getElementById('installPromptReopen');
  if (!reopenBtn) return;

  const shouldShowReopen = isLikelyMobileDevice()
    && !isStandaloneDisplayMode()
    && isJoinScreenActive();

  reopenBtn.hidden = !shouldShowReopen;
}

function hideInstallPrompt() {
  const root = document.getElementById('installPrompt');
  const instructionEl = document.getElementById('installPromptInstruction');
  if (!root) return;
  root.style.display = 'none';
  root.hidden = true;
  if (instructionEl) {
    instructionEl.textContent = '';
    instructionEl.hidden = true;
  }

  syncInstallPromptReopenVisibility();
}

function showPersistentInstallInstruction(message) {
  const instructionEl = document.getElementById('installPromptInstruction');
  if (!instructionEl) return;
  instructionEl.textContent = message;
  instructionEl.hidden = false;
}

function showInstallPrompt({ copy, actionLabel, onAction }) {
  if (installPromptState.sessionDismissed) return;
  if (isStandaloneDisplayMode()) {
    hideInstallPrompt();
    return;
  }

  const root = document.getElementById('installPrompt');
  const copyEl = document.getElementById('installPromptCopy');
  const instructionEl = document.getElementById('installPromptInstruction');
  const actionBtn = document.getElementById('installPromptAction');
  const dismissBtn = document.getElementById('installPromptDismiss');
  const closeBtn = document.getElementById('installPromptClose');
  const reopenBtn = document.getElementById('installPromptReopen');

  if (!root || !copyEl || !actionBtn || !dismissBtn || !closeBtn) return;

  copyEl.textContent = copy;
  if (instructionEl) {
    instructionEl.textContent = '';
    instructionEl.hidden = true;
  }
  actionBtn.textContent = actionLabel;
  actionBtn.onclick = onAction;
  closeBtn.onclick = () => {
    installPromptState.sessionDismissed = true;
    hideInstallPrompt();
    rememberInstallPromptDismissal();
  };
  dismissBtn.onclick = () => {
    installPromptState.sessionDismissed = true;
    hideInstallPrompt();
    rememberInstallPromptDismissal();
  };

  root.style.removeProperty('display');
  root.hidden = false;
  if (reopenBtn) {
    reopenBtn.hidden = true;
    reopenBtn.onclick = () => {
      installPromptState.sessionDismissed = false;
      showInstallPrompt({ copy, actionLabel, onAction });
    };
  }
}

function installFullscreenPromptFlow() {
  if (installPromptState.initialized) return;
  installPromptState.initialized = true;

  document.addEventListener('screenChanged', syncInstallPromptReopenVisibility);
  syncInstallPromptReopenVisibility();

  if (!isLikelyMobileDevice()) {
    hideInstallPrompt();
    return;
  }

  const reopenBtn = document.getElementById('installPromptReopen');
  if (reopenBtn) {
    reopenBtn.onclick = () => {
      installPromptState.sessionDismissed = false;
      if (isIOS()) {
        showInstallPrompt({
          copy: 'Install to play in fullscreen with hidden browser bars.',
          actionLabel: 'Install',
          onAction: () => {
            showPersistentInstallInstruction('Chrome on iOS: Share → More → Add to Home Screen. Safari on iOS: Share → Add to Home Screen.');
          }
        });
        return;
      }

      showInstallPrompt({
        copy: 'Install from your browser menu for true fullscreen mode and hidden browser bars.',
        actionLabel: 'Install',
        onAction: async () => {
          const deferred = installPromptState.deferredPrompt;
          if (deferred && typeof deferred.prompt === 'function') {
            try {
              deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice && choice.outcome === 'accepted') {
                installPromptState.sessionDismissed = true;
                rememberInstallPromptDismissal();
                hideInstallPrompt();
              }
            } catch (error) {
              showPersistentInstallInstruction('Install prompt could not open. Use browser menu and choose Install App or Add to Home Screen.');
            }
            return;
          }

          showPersistentInstallInstruction('Use your browser menu and choose Install App or Add to Home Screen.');
        }
      });
    };
  }

  if (isStandaloneDisplayMode()) {
    hideInstallPrompt();
    return;
  }

  if (!canShowInstallPromptNow()) {
    installPromptState.sessionDismissed = true;
    hideInstallPrompt();
    return;
  }

  const standaloneModeQuery = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
  if (standaloneModeQuery && typeof standaloneModeQuery.addEventListener === 'function') {
    standaloneModeQuery.addEventListener('change', (event) => {
      if (event.matches) {
        hideInstallPrompt();
      }
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (installPromptState.fallbackTimerId) {
      clearTimeout(installPromptState.fallbackTimerId);
      installPromptState.fallbackTimerId = null;
    }
    installPromptState.deferredPrompt = event;

    showInstallPrompt({
      copy: 'Install LobbyWARS to launch with fullscreen behavior and hidden browser bars.',
      actionLabel: 'Install',
      onAction: async () => {
        const deferred = installPromptState.deferredPrompt;
        if (!deferred) {
          showPersistentInstallInstruction('Use your browser menu and choose Install App or Add to Home Screen.');
          return;
        }

        try {
          deferred.prompt();
        } catch (error) {
          showPersistentInstallInstruction('Native install prompt could not open. Use browser menu and choose Install App or Add to Home Screen.');
          return;
        }

        try {
          const choice = await deferred.userChoice;
          if (choice && choice.outcome === 'accepted') {
            installPromptState.sessionDismissed = true;
            rememberInstallPromptDismissal();
            hideInstallPrompt();
          } else {
            showPersistentInstallInstruction('Install canceled. You can still install later from your browser menu.');
          }
        } catch (error) {
          showPersistentInstallInstruction('Install result unavailable. You can install from your browser menu anytime.');
        }

        installPromptState.deferredPrompt = null;
      }
    });
  });

  window.addEventListener('appinstalled', () => {
    installPromptState.deferredPrompt = null;
    installPromptState.sessionDismissed = true;
    rememberInstallPromptDismissal();
    hideInstallPrompt();
    const reopenBtnAfterInstall = document.getElementById('installPromptReopen');
    if (reopenBtnAfterInstall) reopenBtnAfterInstall.hidden = true;
    showToast('Installed! Open LobbyWARS from your home screen for true fullscreen mode.', 'info', 5000);
  });

  if (isIOS()) {
    showInstallPrompt({
      copy: 'Install to play in fullscreen with hidden browser bars.',
      actionLabel: 'Install',
      onAction: () => {
        showPersistentInstallInstruction('Chrome on iOS: Share → More → Add to Home Screen. Safari on iOS: Share → Add to Home Screen.');
      }
    });
    return;
  }

  showInstallPrompt({
    copy: 'Install from your browser menu for true fullscreen mode and hidden browser bars.',
    actionLabel: 'Install',
    onAction: async () => {
      const deferred = installPromptState.deferredPrompt;
      if (deferred && typeof deferred.prompt === 'function') {
        try {
          deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice && choice.outcome === 'accepted') {
            installPromptState.sessionDismissed = true;
            rememberInstallPromptDismissal();
            hideInstallPrompt();
          }
        } catch (error) {
          showPersistentInstallInstruction('Install prompt could not open. Use browser menu and choose Install App or Add to Home Screen.');
        }
        return;
      }

      showPersistentInstallInstruction('Use your browser menu and choose Install App or Add to Home Screen.');
    }
  });
}

installFullscreenPromptFlow();

// ========================
// SOUND SYSTEM
// ========================
let audioContext = null;
const AUDIO_PREFS_KEY = 'lobbywars_audio_prefs_v1';
const audioState = {
  unlocked: false,
  masterGain: null,
  sfxGain: null,
  muted: false,
  masterVolume: 0.9,
  sfxVolume: 0.9,
  hasPlayedLobbyEntry: false,
  listenerCleanup: null,
  controlsInitialized: false
};

const preRoundAudioState = {
  lastMilestone: -1
};

const voteTallyLoadingState = {
  active: false,
  totalFetches: 0,
  completedFetches: 0,
  stallTarget: 78,
  pulseTimer: null,
  finalizeTimer: null
};

const draftLockVisualState = {
  availableSince: 0,
  urgencyTicker: null,
  waitTicker: null,
  waitEmojiIndex: 0,
  waitDotIndex: 0
};

function clampAudioLevel(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function loadAudioPreferences() {
  try {
    const raw = window.localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    audioState.muted = parsed.muted === true;
    audioState.masterVolume = clampAudioLevel(parsed.masterVolume, 0.9);
    audioState.sfxVolume = clampAudioLevel(parsed.sfxVolume, 0.9);
  } catch (error) {
    console.log('Audio preferences unavailable');
  }
}

function saveAudioPreferences() {
  try {
    window.localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify({
      muted: audioState.muted,
      masterVolume: audioState.masterVolume,
      sfxVolume: audioState.sfxVolume
    }));
  } catch (error) {
    console.log('Unable to save audio preferences');
  }
}

function syncAudioControlUI() {
  const muteBtn = document.getElementById('audioToggleMute');

  if (muteBtn) {
    muteBtn.textContent = audioState.muted ? 'Audio: Off' : 'Audio: On';
    muteBtn.setAttribute('aria-pressed', audioState.muted ? 'true' : 'false');
    muteBtn.setAttribute('aria-label', audioState.muted ? 'Unmute sound effects' : 'Mute sound effects');
  }
}

function applyAudioLevels() {
  if (audioState.masterGain) {
    audioState.masterGain.gain.value = audioState.muted ? 0 : audioState.masterVolume;
  }
  if (audioState.sfxGain) {
    audioState.sfxGain.gain.value = audioState.sfxVolume;
  }

  syncAudioControlUI();
}

function setupAudioControls() {
  if (audioState.controlsInitialized) return;

  const mute = document.getElementById('audioToggleMute');

  if (!mute) return;

  const ensureUnlockedByControlGesture = () => {
    unlockAudioFromGesture();
  };

  mute.addEventListener('click', () => {
    ensureUnlockedByControlGesture();
    audioState.muted = !audioState.muted;
    applyAudioLevels();
    saveAudioPreferences();
  });

  audioState.controlsInitialized = true;
  applyAudioLevels();
}

loadAudioPreferences();

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext = new AudioCtor();
  return audioContext;
}

function initializeAudioGraph() {
  const ctx = getAudioContext();
  if (!ctx || audioState.masterGain) return;

  audioState.masterGain = ctx.createGain();
  audioState.sfxGain = ctx.createGain();

  audioState.masterGain.gain.value = audioState.muted ? 0 : audioState.masterVolume;
  audioState.sfxGain.gain.value = audioState.sfxVolume;

  audioState.sfxGain.connect(audioState.masterGain);
  audioState.masterGain.connect(ctx.destination);
}

function ensureAudioRunning() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  initializeAudioGraph();
  if (ctx.state === 'running') return true;
  ctx.resume().catch(() => {});
  return false;
}

function scheduleTone({
  frequency = 440,
  duration = 120,
  type = 'sine',
  volume = 0.2,
  attack = 0.008,
  release = 0.09,
  when = null,
  retryOnResume = true
} = {}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  initializeAudioGraph();

  if (ctx.state !== 'running') {
    if (!retryOnResume) return;
    ctx.resume().then(() => {
      scheduleTone({
        frequency,
        duration,
        type,
        volume,
        attack,
        release,
        when,
        retryOnResume: false
      });
    }).catch(() => {});
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(audioState.sfxGain);

  const startAt = Math.max(ctx.currentTime + 0.002, Number(when) || ctx.currentTime);
  const lengthSec = Math.max(0.03, duration / 1000);
  const attackSec = Math.max(0.003, attack);
  const releaseSec = Math.max(0.03, release);
  const peak = Math.max(0.0001, volume);

  osc.frequency.setValueAtTime(Math.max(20, Number(frequency) || 440), startAt);
  osc.type = type;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + attackSec);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + lengthSec + releaseSec);

  osc.start(startAt);
  osc.stop(startAt + lengthSec + releaseSec + 0.01);
}

function playSound(frequency = 800, duration = 100, type = 'sine', volume = 0.3) {
  scheduleTone({ frequency, duration, type, volume });
}

function runNoteSequence(sequence = [], stepMs = 70) {
  if (!Array.isArray(sequence) || !sequence.length) return;
  sequence.forEach((note, idx) => {
    const at = idx * stepMs;
    setTimeout(() => {
      scheduleTone({
        frequency: note.frequency,
        duration: note.duration,
        type: note.type,
        volume: note.volume
      });
    }, at);
  });
}

function playDraftSound() {
  runNoteSequence([
    { frequency: 622, duration: 90, type: 'triangle', volume: 0.16 },
    { frequency: 740, duration: 90, type: 'triangle', volume: 0.16 },
    { frequency: 880, duration: 130, type: 'sine', volume: 0.17 }
  ], 62);
}

function playVoteSound() {
  runNoteSequence([
    { frequency: 330, duration: 65, type: 'square', volume: 0.14 },
    { frequency: 392, duration: 70, type: 'square', volume: 0.14 },
    { frequency: 494, duration: 95, type: 'triangle', volume: 0.15 }
  ], 70);
}

function playWinSound() {
  runNoteSequence([
    { frequency: 523.3, duration: 160, type: 'triangle', volume: 0.18 },
    { frequency: 659.3, duration: 170, type: 'triangle', volume: 0.18 },
    { frequency: 784, duration: 210, type: 'triangle', volume: 0.18 },
    { frequency: 1046.5, duration: 280, type: 'sine', volume: 0.16 }
  ], 130);
}

function playErrorSound() {
  runNoteSequence([
    { frequency: 280, duration: 100, type: 'sawtooth', volume: 0.16 },
    { frequency: 220, duration: 120, type: 'sawtooth', volume: 0.16 }
  ], 95);
}

function playJoinSound() {
  runNoteSequence([
    { frequency: 392, duration: 110, type: 'triangle', volume: 0.14 },
    { frequency: 523.3, duration: 130, type: 'triangle', volume: 0.14 }
  ], 90);
}

function playReadyToggleSound(isReady = true) {
  if (isReady) {
    runNoteSequence([
      { frequency: 494, duration: 90, type: 'triangle', volume: 0.13 },
      { frequency: 659.3, duration: 120, type: 'triangle', volume: 0.13 }
    ], 90);
  } else {
    runNoteSequence([
      { frequency: 392, duration: 80, type: 'triangle', volume: 0.12 },
      { frequency: 349.2, duration: 100, type: 'triangle', volume: 0.12 }
    ], 90);
  }
}

function playPhaseShiftSound() {
  runNoteSequence([
    { frequency: 220, duration: 120, type: 'sawtooth', volume: 0.11 },
    { frequency: 277.2, duration: 120, type: 'triangle', volume: 0.12 },
    { frequency: 329.6, duration: 150, type: 'triangle', volume: 0.12 }
  ], 110);
}

function playTwistSound() {
  runNoteSequence([
    { frequency: 220, duration: 80, type: 'square', volume: 0.13 },
    { frequency: 293.7, duration: 70, type: 'square', volume: 0.13 },
    { frequency: 196, duration: 120, type: 'sawtooth', volume: 0.13 },
    { frequency: 370, duration: 140, type: 'triangle', volume: 0.12 }
  ], 75);
}

function playCountdownTick(secondValue) {
  const sec = Number(secondValue);
  if (sec <= 1) {
    scheduleTone({ frequency: 880, duration: 140, type: 'square', volume: 0.15 });
    return;
  }
  scheduleTone({ frequency: 660, duration: 80, type: 'square', volume: 0.13 });
}

function playMessageSound() {
  runNoteSequence([
    { frequency: 659.3, duration: 55, type: 'sine', volume: 0.1 },
    { frequency: 784, duration: 60, type: 'sine', volume: 0.1 }
  ], 55);
}

function playSliceInteractionSound(tone = 'core', cleared = false) {
  if (cleared) {
    scheduleTone({ frequency: 340, duration: 55, type: 'triangle', volume: 0.1 });
    return;
  }

  if (tone === 'vote') {
    runNoteSequence([
      { frequency: 470, duration: 50, type: 'square', volume: 0.11 },
      { frequency: 560, duration: 65, type: 'triangle', volume: 0.11 }
    ], 45);
    return;
  }
  if (tone === 'intel') {
    runNoteSequence([
      { frequency: 620, duration: 55, type: 'triangle', volume: 0.11 },
      { frequency: 740, duration: 70, type: 'sine', volume: 0.11 }
    ], 45);
    return;
  }
  runNoteSequence([
    { frequency: 390, duration: 50, type: 'sawtooth', volume: 0.11 },
    { frequency: 440, duration: 70, type: 'triangle', volume: 0.1 }
  ], 45);
}

function playLoadingMilestoneSound(percent = 0) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  const frequency = 300 + Math.round((safe / 100) * 360);
  scheduleTone({ frequency, duration: 52, type: 'triangle', volume: 0.085 });
}

function playFetchCompleteSound(success = true) {
  if (success === false) {
    scheduleTone({ frequency: 250, duration: 60, type: 'sawtooth', volume: 0.095 });
    return;
  }
  runNoteSequence([
    { frequency: 700, duration: 50, type: 'sine', volume: 0.095 },
    { frequency: 820, duration: 65, type: 'triangle', volume: 0.095 }
  ], 40);
}

function unlockAudioFromGesture() {
  const ctx = getAudioContext();
  if (!ctx) return;

  initializeAudioGraph();
  const onUnlock = () => {
    audioState.unlocked = true;
    applyAudioLevels();
    scheduleTone({ frequency: 220, duration: 20, type: 'sine', volume: 0.0002 });
    if (typeof audioState.listenerCleanup === 'function') {
      audioState.listenerCleanup();
      audioState.listenerCleanup = null;
    }
  };

  if (ctx.state === 'running') {
    onUnlock();
    return;
  }

  ctx.resume().then(onUnlock).catch(() => {});
}

function installAudioUnlockHandlers() {
  const handlers = [
    ['pointerdown', unlockAudioFromGesture, { capture: true }],
    ['pointerup', unlockAudioFromGesture, { capture: true }],
    ['touchstart', unlockAudioFromGesture, { passive: true, capture: true }],
    ['touchend', unlockAudioFromGesture, { passive: true, capture: true }],
    ['click', unlockAudioFromGesture, { capture: true }],
    ['keydown', unlockAudioFromGesture, { capture: true }]
  ];

  handlers.forEach(([eventName, handler, options]) => {
    document.addEventListener(eventName, handler, options);
  });

  audioState.listenerCleanup = () => {
    handlers.forEach(([eventName, handler, options]) => {
      document.removeEventListener(eventName, handler, options);
    });
  };
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

const CHAT_CLIENT_MAX_MESSAGES = 10;
const CHAT_CLIENT_PRUNE_BATCH = 1;

function getChatToneIndex(name = '') {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return 0;

  let hash = 0;
  for (let idx = 0; idx < normalized.length; idx += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(idx);
    hash |= 0;
  }
  return Math.abs(hash) % 6;
}

function normalizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((msg) => msg && typeof msg === 'object' && typeof msg.player === 'string' && typeof msg.text === 'string')
    .map((msg) => ({
      player: msg.player,
      text: msg.text,
      timestamp: Number(msg.timestamp) || Date.now(),
      isReaction: msg.isReaction === true
    }));
}

function pruneChatMessages(messages) {
  if (!Array.isArray(messages)) return { messages: [], prunedCount: 0 };

  const next = messages.slice();
  let prunedCount = 0;
  while (next.length > CHAT_CLIENT_MAX_MESSAGES) {
    const removeCount = Math.min(CHAT_CLIENT_PRUNE_BATCH, next.length);
    next.splice(0, removeCount);
    prunedCount += removeCount;
  }

  return { messages: next, prunedCount };
}

function isChatNearBottom(container, threshold = 56) {
  if (!container) return true;
  return (container.scrollHeight - container.scrollTop - container.clientHeight) <= threshold;
}

function updateChatEraseNotice({ prunedCount = 0 } = {}) {
  const notice = document.getElementById('chatEraseNotice');
  if (!notice) return;

  if (prunedCount > 0) {
    const noun = prunedCount === 1 ? 'message was' : 'messages were';
    notice.textContent = `${prunedCount} older ${noun} permanently erased. Only latest 10 remain.`;
    notice.classList.add('recent');
    if (notice._resetTimer) {
      clearTimeout(notice._resetTimer);
    }
    notice._resetTimer = setTimeout(() => {
      notice.textContent = 'Auto-erase active: only latest 10 messages are kept. Older messages are permanently deleted.';
      notice.classList.remove('recent');
    }, 4200);
    return;
  }

  if (!notice.textContent.trim()) {
    notice.textContent = 'Auto-erase active: only latest 10 messages are kept. Older messages are permanently deleted.';
  }
}

function syncChatComposerState() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (!input || !sendBtn) return;

  const hasText = input.value.trim().length > 0;
  sendBtn.disabled = !hasText;
  sendBtn.setAttribute('aria-disabled', hasText ? 'false' : 'true');
}

function triggerTransientClass(element, className, duration = 220) {
  if (!element || !className) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => {
    element.classList.remove(className);
  }, Math.max(120, Number(duration) || 220));
}

function buildChatItem(msg) {
  const li = document.createElement('li');
  const isMine = msg.player === player.name;
  const toneIndex = getChatToneIndex(msg.player);
  li.className = `chat-row ${isMine ? 'mine' : 'theirs'}`;
  li.setAttribute('role', 'listitem');

  const bubble = document.createElement('article');
  bubble.className = `chat-bubble${msg.isReaction ? ' reaction' : ''}`;
  if (!isMine) {
    bubble.classList.add(`chat-bubble-tone-${toneIndex}`);
  }

  if (!isMine) {
    const sender = document.createElement('span');
    sender.className = `chat-sender chat-sender-tone-${toneIndex}`;
    sender.textContent = msg.player;
    bubble.appendChild(sender);
  }

  const text = document.createElement('span');
  text.className = 'chat-text';
  text.textContent = msg.text;
  bubble.appendChild(text);

  li.appendChild(bubble);
  return li;
}

function renderChatMessages({ forceBottom = false } = {}) {
  const chatContainer = document.getElementById('chatMessages');
  if (!chatContainer) return;

  const shouldPinToBottom = forceBottom || isChatNearBottom(chatContainer);
  chatContainer.innerHTML = '';

  roomState.messages.forEach((msg) => {
    chatContainer.appendChild(buildChatItem(msg));
  });

  if (shouldPinToBottom) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function setPreRoundProgress(percent = 0, fetchLabel = 'Preparing next phase…') {
  const bounded = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const progressFill = document.getElementById('preRoundProgressFill');
  const progressPct = document.getElementById('preRoundProgressPct');
  const fetchEl = document.getElementById('preRoundFetchLabel');
  const progressTrack = document.querySelector('#preRoundLoading .pre-round-progress');

  if (progressFill) progressFill.style.width = `${bounded}%`;
  if (progressPct) progressPct.textContent = `${bounded}%`;
  if (fetchEl) fetchEl.textContent = fetchLabel;
  if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(bounded));

  const milestone = Math.floor(bounded / 10) * 10;
  if (milestone >= 10 && milestone !== preRoundAudioState.lastMilestone) {
    preRoundAudioState.lastMilestone = milestone;
    playLoadingMilestoneSound(milestone);
  }
}

function hidePreRoundLoadingState() {
  const loading = document.getElementById('preRoundLoading');
  const messageEl = document.getElementById('preRoundMessage');
  if (loading) loading.style.display = 'none';
  if (messageEl) messageEl.textContent = '⚡ Get Ready for Chaos ⚡';
  preRoundAudioState.lastMilestone = -1;
  setPreRoundProgress(0, 'Preparing next phase…');
}

function buildCharacterFetchLabels(teamMap, { maxPlayers = 4, maxCharsPerPlayer = 2 } = {}) {
  if (!teamMap || typeof teamMap !== 'object') return [];
  return Object.entries(teamMap)
    .slice(0, maxPlayers)
    .map(([playerName, picks]) => {
      const items = (Array.isArray(picks) ? picks : [])
        .map((entry) => {
          if (entry && typeof entry === 'object') {
            return entry.character || entry.name || entry.label || '';
          }
          return String(entry || '');
        })
        .map((name) => String(name).trim())
        .filter(Boolean)
        .slice(0, maxCharsPerPlayer);

      if (!items.length) return null;
      return `${playerName}: ${items.join(', ')}`;
    })
    .filter(Boolean);
}

function buildCharacterFetchItems(teamMap, { maxPlayers = 5, maxCharsPerPlayer = 2 } = {}) {
  if (!teamMap || typeof teamMap !== 'object') return [];
  return Object.entries(teamMap)
    .slice(0, maxPlayers)
    .flatMap(([playerName, picks]) => {
      return (Array.isArray(picks) ? picks : [])
        .map((entry) => {
          if (entry && typeof entry === 'object') {
            return entry.character || entry.name || entry.label || '';
          }
          return String(entry || '');
        })
        .map((name) => String(name).trim())
        .filter(Boolean)
        .slice(0, maxCharsPerPlayer)
        .map((character) => ({
          playerName,
          character,
          label: `${playerName}: ${character}`
        }));
    });
}

function resetVoteTallyLoadingState() {
  voteTallyLoadingState.active = false;
  voteTallyLoadingState.totalFetches = 0;
  voteTallyLoadingState.completedFetches = 0;
  if (voteTallyLoadingState.pulseTimer) {
    clearInterval(voteTallyLoadingState.pulseTimer);
    voteTallyLoadingState.pulseTimer = null;
  }
  if (voteTallyLoadingState.finalizeTimer) {
    clearInterval(voteTallyLoadingState.finalizeTimer);
    voteTallyLoadingState.finalizeTimer = null;
  }
}

function applyVoteTallyProgressUpdate(payload = {}) {
  if (!voteTallyLoadingState.active) return;

  const total = Math.max(1, Number(payload.total) || voteTallyLoadingState.totalFetches || 1);
  const completed = Math.max(0, Math.min(total, Number(payload.completed) || 0));
  voteTallyLoadingState.totalFetches = total;
  voteTallyLoadingState.completedFetches = completed;

  if (voteTallyLoadingState.pulseTimer) {
    clearInterval(voteTallyLoadingState.pulseTimer);
    voteTallyLoadingState.pulseTimer = null;
  }

  const ratio = total > 0 ? (completed / total) : 0;
  const progress = Math.max(voteTallyLoadingState.stallTarget, Math.min(96, Math.round(78 + (ratio * 18))));
  const playerName = payload.playerName ? String(payload.playerName) : '';
  const character = payload.character ? String(payload.character) : '';
  const success = payload.success !== false;
  const statusPrefix = success ? 'Fetched' : 'Fallback';
  const statusText = playerName && character
    ? `${statusPrefix}: ${character} (${playerName})`
    : `Fetched ${completed}/${total} roster entries…`;

  setPreRoundProgress(progress, `Fetching matchup intel… • ${statusText}`);
  playFetchCompleteSound(success);

  if (completed >= total) {
    if (!voteTallyLoadingState.finalizeTimer) {
      let pulse = 0;
      voteTallyLoadingState.finalizeTimer = setInterval(() => {
        const boundedPct = 96 + Math.round(Math.sin(pulse) * 1);
        setPreRoundProgress(Math.max(95, Math.min(98, boundedPct)), 'Applying scoring rules and final tie checks…');
        pulse += 0.9;
      }, 500);
      addTimer(voteTallyLoadingState.finalizeTimer);
    }
  }
}

function showPreRoundLoadingState({
  title,
  message,
  stages = [],
  progress = 0,
  showCountdown = false,
  countdownValue = ''
}) {
  const roundLabel = document.getElementById('roundLabel');
  const messageEl = document.getElementById('preRoundMessage');
  const countdown = document.getElementById('countdown');
  const loading = document.getElementById('preRoundLoading');

  if (roundLabel && title) roundLabel.textContent = title;
  if (messageEl && message) messageEl.textContent = message;

  if (countdown) {
    countdown.style.display = showCountdown ? 'block' : 'none';
    if (showCountdown) {
      countdown.style.fontSize = '10em';
      countdown.textContent = String(countdownValue);
    }
  }

  if (loading) {
    loading.style.display = 'block';
  }

  const stageList = Array.isArray(stages) && stages.length ? stages : ['Fetching scenario data…'];
  const stageIndex = Math.max(0, Math.min(stageList.length - 1, Math.floor((Math.max(0, Math.min(99, progress)) / 100) * stageList.length)));
  setPreRoundProgress(progress, stageList[stageIndex]);
}

function startPreRoundLoadingSequence({
  title,
  message,
  stages = [],
  durationMs = 3000,
  showCountdown = false,
  onComplete = null,
  characterLabels = []
}) {
  const safeDuration = Math.max(600, Number(durationMs) || 3000);
  const safeStages = Array.isArray(stages) && stages.length ? stages : ['Fetching scenario data…'];
  const startedAt = Date.now();

  showPreRoundLoadingState({
    title,
    message,
    stages: safeStages,
    progress: 0,
    showCountdown,
    countdownValue: Math.ceil(safeDuration / 1000)
  });

  const tick = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const progress = Math.max(0, Math.min(100, Math.round((elapsed / safeDuration) * 100)));
    const stageIndex = Math.max(0, Math.min(safeStages.length - 1, Math.floor((Math.min(99, progress) / 100) * safeStages.length)));
    const stageText = safeStages[stageIndex];
    const fetchContext = characterLabels.length && progress >= 66
      ? characterLabels[Math.floor((elapsed / 650) % characterLabels.length)]
      : '';

    if (showCountdown) {
      const countdown = document.getElementById('countdown');
      if (countdown) {
        const secondsLeft = Math.max(0, Math.ceil((safeDuration - elapsed) / 1000));
        countdown.textContent = String(secondsLeft);
      }
    }

    setPreRoundProgress(progress, fetchContext ? `${stageText} • Fetching: ${fetchContext}` : stageText);

    if (progress >= 100) {
      clearInterval(tick);
      if (typeof onComplete === 'function') onComplete();
    }
  }, 120);

  addTimer(tick);
}

// ========================
// JOIN & LOBBY
// ========================
function joinRoom() {
  const name = document.getElementById('name').value.trim();
  const room = document.getElementById('room').value.trim().toUpperCase();
  const joinAsHost = document.getElementById('joinAsHost')?.checked === true;

  if (!name) {
    showToast('Please enter your name!', 'warning');
    document.getElementById('name').focus();
    return;
  }
  if (!room) {
    showToast('Please enter a room code!', 'warning');
    document.getElementById('room').focus();
    return;
  }
  if (name.length < 2) {
    showToast('Name must be at least 2 characters.', 'warning');
    return;
  }
  if (room.length < 2) {
    showToast('Room code must be at least 2 characters.', 'warning');
    return;
  }

  player.name = name;
  player.room = room;

  console.log(`Attempting to join room ${room} as ${name}${joinAsHost ? ' (host)' : ''}`);
  socket.emit('joinRoom', { name, room, joinAsHost });
}

function leaveRoom() {
  if (confirm('Are you sure you want to leave? You\'ll disconnect from the room.')) {
    audioState.hasPlayedLobbyEntry = false;
    socket.disconnect();
    socket.connect();
    showScreen('join');
    document.getElementById('name').value = '';
    document.getElementById('room').value = '';
    const joinAsHost = document.getElementById('joinAsHost');
    if (joinAsHost) joinAsHost.checked = false;
    resetAllState();
  }
}

socket.on('connect', () => {
  console.log('✓ Socket connected:', socket.id);
  showConnectionDebugToast('connected');
});

socket.on('disconnect', (reason) => {
  showConnectionDebugToast('disconnected', String(reason || 'unknown'));
});

socket.on('connect_error', (error) => {
  const detail = error && error.message ? error.message : 'connect_error';
  showConnectionDebugToast('error', detail);
});

socket.on('joinError', (msg) => {
  showToast(msg, 'error', 5000);
});

socket.on('gameError', (msg) => {
  showToast(msg, 'error', 5000);
});

socket.on('roomData', (data) => {
  console.log('📍 Received roomData:', data);
  Object.assign(roomState, data);
  roomState.messages = normalizeChatMessages(data.messages);
  const prunedHistory = pruneChatMessages(roomState.messages);
  roomState.messages = prunedHistory.messages;
  updateChatEraseNotice({ prunedCount: prunedHistory.prunedCount });
  const isHost = data.host === player.name;

  document.getElementById('roomCode').textContent = player.room;
  document.getElementById('playerCountBadge').textContent = `${data.players.length}/6`;

  const badge = document.getElementById('playerCountBadge');
  badge.classList.remove('available', 'almost-full', 'full');
  if (data.players.length >= 6) {
    badge.classList.add('full');
  } else if (data.players.length >= 5) {
    badge.classList.add('almost-full');
  } else {
    badge.classList.add('available');
  }

  const settingsContent = document.getElementById('settingsContent');
  const hostNote = document.getElementById('hostNote');

  if (isHost) {
    settingsContent.style.display = 'block';
    hostNote.style.display = 'none';
    if (data.settings) {
      if (data.settings.difficulty) document.getElementById('difficulty').value = data.settings.difficulty;
      if (data.settings.plotTwists !== undefined) document.getElementById('plotTwists').checked = data.settings.plotTwists;
    }
  } else {
    settingsContent.style.display = 'none';
    hostNote.style.display = 'block';
    document.getElementById('hostNameDisplay').textContent = data.host || 'No host selected yet (a player must join as host)';
  }

  const ul = document.getElementById('playerList');
  ul.innerHTML = '';
  data.players.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = `player-item ${p.ready ? 'ready' : 'not-ready'}`;
    li.setAttribute('role', 'listitem');

    const readyBadge = document.createElement('span');
    readyBadge.className = 'ready-badge';

    const nameWrap = document.createElement('span');
    if (p.name === data.host) {
      const hostStar = document.createElement('span');
      hostStar.className = 'host-star';
      hostStar.textContent = '★';
      nameWrap.appendChild(hostStar);
      appendText(nameWrap, ' ');
    }

    const strong = document.createElement('strong');
    strong.textContent = p.name;
    nameWrap.appendChild(strong);

    if (p.name === player.name) {
      appendText(nameWrap, ' ');
      const youBadge = document.createElement('span');
      youBadge.className = 'you-badge';
      youBadge.textContent = '(YOU)';
      nameWrap.appendChild(youBadge);
    }

    const idxSpan = document.createElement('span');
    idxSpan.style.marginLeft = 'auto';
    idxSpan.style.fontSize = '0.85em';
    idxSpan.style.opacity = '0.7';
    idxSpan.textContent = `#${idx + 1}`;

    li.appendChild(readyBadge);
    li.appendChild(nameWrap);
    li.appendChild(idxSpan);
    ul.appendChild(li);
  });

  if (!data.isGameActive) {
    console.log('✅ Showing lobby - game not active');
    showScreen('lobby');
    if (!audioState.hasPlayedLobbyEntry) {
      playJoinSound();
      audioState.hasPlayedLobbyEntry = true;
    }

    const startBtn = document.getElementById('startBtn');
    const readyBtn = document.getElementById('readyBtn');
    const minPlayersMsg = document.getElementById('minPlayersMsg');
    const hostWaiting = document.getElementById('hostWaiting');
    const currentPlayer = data.players.find(p => p.name === player.name);

    if (isHost) {
      startBtn.style.display = 'block';
      hostWaiting.style.display = 'none';
      const readyCount = data.players.filter(p => p.ready).length;
      const allReady = readyCount === data.players.length && data.players.length >= 3;
      if (allReady) {
        startBtn.disabled = false;
        startBtn.className = 'btn btn-success pulsing-glow';
        minPlayersMsg.style.display = 'none';
      } else {
        startBtn.disabled = true;
        startBtn.className = 'btn';
        minPlayersMsg.style.display = 'block';
        minPlayersMsg.innerHTML = `
          <strong>⏳ Waiting:</strong>
          ${readyCount}/${data.players.length} ready
          ${data.players.length < 3 ? '(Need 3+)' : ''}
        `;
      }
    } else {
      startBtn.style.display = 'none';
      minPlayersMsg.style.display = 'none';
      hostWaiting.style.display = 'block';
      hostWaiting.textContent = data.host
        ? `⏳ Waiting for ${data.host} to start...`
        : '⏳ Waiting for someone to join as host...';
    }

    if (currentPlayer) {
      player.ready = currentPlayer.ready;
      if (currentPlayer.ready) {
        readyBtn.innerHTML = '<span class="ready-indicator">✓</span> READY';
        readyBtn.className = 'btn btn-success btn-ready pulsing';
      } else {
        readyBtn.innerHTML = '<span class="ready-indicator">○</span> NOT READY';
        readyBtn.className = 'btn btn-ready';
      }
    }
  }

  renderChatMessages({ forceBottom: true });
});

socket.on('settingsUpdated', (settings) => {
  roomState.settings = settings;
  const difficulty = document.getElementById('difficulty');
  const scenarioTheme = document.getElementById('scenarioTheme');
  const customScenario = document.getElementById('customScenario');
  const plotTwists = document.getElementById('plotTwists');
  if (difficulty && settings.difficulty) difficulty.value = settings.difficulty;
  if (scenarioTheme && settings.scenarioTheme) scenarioTheme.value = settings.scenarioTheme;
  if (customScenario && settings.customScenario !== undefined) customScenario.value = settings.customScenario;
  if (plotTwists && settings.plotTwists !== undefined) plotTwists.checked = settings.plotTwists;
});

function toggleReady() {
  playReadyToggleSound(!player.ready);
  socket.emit('toggleReady');
}

function updateSetting(key, value) {
  if (roomState.host !== player.name) return;
  const settings = { ...roomState.settings };
  settings[key] = value;
  socket.emit('updateSettings', settings);
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const sendBtn = document.getElementById('chatSendBtn');
  const composer = document.querySelector('.chat-input-modern');
  const message = input.value.trim();
  if (!message) return;

  triggerTransientClass(sendBtn, 'send-burst', 260);
  triggerTransientClass(composer, 'composer-sent', 260);
  playMessageSound();
  socket.emit('sendMessage', message);
  input.value = '';
  syncChatComposerState();
  input.focus();
}

function sendReaction(emoji) {
  playMessageSound();
  socket.emit('sendReaction', emoji);
}

socket.on('newMessage', (msg) => {
  const cleanMessage = normalizeChatMessages([msg])[0];
  if (!cleanMessage) return;

  const serverPrunedCount = Math.max(0, Number(msg.prunedCount) || 0);
  if (serverPrunedCount > 0 && roomState.messages.length > 0) {
    roomState.messages.splice(0, Math.min(serverPrunedCount, roomState.messages.length));
  }
  updateChatEraseNotice({ prunedCount: serverPrunedCount });

  roomState.messages.push(cleanMessage);
  const localPruned = pruneChatMessages(roomState.messages);
  roomState.messages = localPruned.messages;
  renderChatMessages();

  if (msg.player !== player.name) {
    playMessageSound();
  }
});

function sendStartGame() {
  socket.emit('startGame');
}

// ========================
// GAME EVENTS
// ========================
socket.on('gameStarting', (data) => {
  gameState.totalRounds = data.totalRounds;
  gameState.myTeam = [];
  gameState.draftEntryCount = 0;
  gameState.draftLocked = false;
  gameState.myFinalTeam = [];
  gameState.voted = false;
  gameState.voteLocked = false;
  gameState.draftWarnings = {};
  playPhaseShiftSound();
  showToast('🎉 Game starting! Get ready!', 'info');
  showScreen('preRound');
});

socket.on('roundStart', (data) => {
  gameState.currentRound = data.roundNumber;
  gameState.myTeam = [];
  gameState.draftEntryCount = 0;
  gameState.draftLocked = false;
  gameState.allDrafts = {};
  gameState.voted = false;
  gameState.draftWarnings = {};

  clearTimers();

  const isFinal = data.isFinalRound;
  playPhaseShiftSound();
  
  // Skip preRound screen for Round 4 (goes straight to transition message)
  if (isFinal) {
    console.log('Round 4 starting - skipping preRound countdown');
    return; // Don't show preRound for Round 4, wait for round4Start event
  }

  hidePreRoundLoadingState();
  document.getElementById('roundLabel').textContent = `📍 ROUND ${data.roundNumber} OF 3`;

  let countdown = 3;
  document.getElementById('countdown').textContent = countdown;
  document.getElementById('countdown').style.fontSize = '10em';
  document.getElementById('countdown').style.display = 'block';

  const timer = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      document.getElementById('countdown').textContent = countdown;
      playCountdownTick(countdown);
    } else {
      playCountdownTick(0);
      clearInterval(timer);
    }
  }, 1000);

  addTimer(timer);

  showScreen('preRound');
});

socket.on('scenarioRevealed', (data) => {
  clearTimers();
  gameState.currentScenario = data.scenario;
  gameState.myTeam = [];
  gameState.draftEntryCount = 0;
  gameState.draftLocked = false;
  gameState.voteLocked = false;
  gameState.currentVoteChoice = null;
  syncDraftEntryComposerVisibility();

  document.getElementById('currentRound').textContent = gameState.currentRound;
  document.getElementById('scenarioText').textContent = `BUILD A TEAM TO: ${data.scenario}`;
  const wordApiIndicator = document.getElementById('wordApiIndicator');
  if (wordApiIndicator) {
    const sourceLabel = typeof data.wordApiSource === 'string' && data.wordApiSource.trim()
      ? data.wordApiSource.trim()
      : 'Fallback Word Pool';
    wordApiIndicator.textContent = `Auto-fill source: ${sourceLabel}`;
  }

  const myTeamList = document.getElementById('myTeam');
  if (myTeamList) myTeamList.innerHTML = '';

  const livePicksList = document.getElementById('livePicksList');
  if (livePicksList) livePicksList.innerHTML = '';

  const charInput = document.getElementById('charInput');
  if (charInput) {
    charInput.value = '';
    charInput.focus();
  }

  let warningEl = document.getElementById('draftWarning');
  if (!warningEl) {
    warningEl = document.createElement('div');
    warningEl.id = 'draftWarning';
    warningEl.style.cssText = `
      display: none;
      padding: 12px;
      margin: 15px auto;
      max-width: 350px;
      border-left: 4px solid;
      border-radius: 6px;
      font-size: 0.9em;
      font-weight: bold;
    `;
    charInput.parentElement.insertBefore(warningEl, charInput.nextSibling);
  }

  syncDraftActionControls();

  if (document.getElementById('draftCounter')) {
    document.getElementById('draftCounter').textContent = '(0/2)';
    document.getElementById('draftCounter').style.color = '#666';
  }

  showScreen('scenarioScreen');
  playDraftSound();

  let timeLeft = data.draftTimeRemaining;
  document.getElementById('draftTimer').textContent = timeLeft;

  const draftTimer = setInterval(() => {
    timeLeft--;
    const timerEl = document.getElementById('draftTimer');
    if (timerEl) {
      timerEl.textContent = timeLeft;
      if (timeLeft <= 10) {
        timerEl.style.color = '#ff5252';
        timerEl.style.fontWeight = 'bold';
      }
    }
    if (timeLeft <= 0) {
      clearInterval(draftTimer);
      updateAutoFillWarning();
    }
  }, 1000);

  addTimer(draftTimer);
});

// ========================
// DRAFT PHASE
// ========================
document.addEventListener('DOMContentLoaded', () => {
  const charInput = document.getElementById('charInput');
  if (charInput) {
    charInput.addEventListener('keypress', handleDraftInput);
    charInput.addEventListener('input', handleDraftChange);
  }

  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      sendMessage();
    });

    chatInput.addEventListener('input', () => {
      syncChatComposerState();
    });

    syncChatComposerState();
  }

  document.querySelectorAll('.reaction-btn-modern').forEach((button) => {
    button.addEventListener('click', () => {
      triggerTransientClass(button, 'reaction-pop', 240);
      const composer = document.querySelector('.chat-composer-modern');
      triggerTransientClass(composer, 'composer-react', 240);
    });
  });
});

function handleDraftChange(e) {
  const char = e.target.value.trim();
  if (!char) {
    updateDraftWarning('', false);
    return;
  }

  const charLower = char.toLowerCase();
  const isDuplicate = gameState.myTeam.some(c => c.toLowerCase() === charLower);
  const otherPlayersHave = gameState.allDraftsList.some(p =>
    p.name !== player.name && p.character.toLowerCase() === charLower
  );

  if (isDuplicate || otherPlayersHave) {
    updateDraftWarning(char, true);
  } else {
    updateDraftWarning(char, false);
  }
}

function handleDraftInput(e) {
  if (e.key === 'Enter' && e.target.value.trim()) {
    submitDraft(e.target.value.trim());
  }
}

function syncDraftEntryComposerVisibility() {
  const draftInputSticky = document.querySelector('.draft-input-sticky');
  const scenarioScreen = document.getElementById('scenarioScreen');
  if (!draftInputSticky || !scenarioScreen) return;

  const shouldHideComposer = gameState.draftEntryCount >= 2;
  draftInputSticky.classList.toggle('is-hidden', shouldHideComposer);
  scenarioScreen.classList.toggle('draft-input-hidden', shouldHideComposer);
  draftInputSticky.setAttribute('aria-hidden', shouldHideComposer ? 'true' : 'false');
}

function stopDraftWaitTicker() {
  if (!draftLockVisualState.waitTicker) return;
  clearInterval(draftLockVisualState.waitTicker);
  draftLockVisualState.waitTicker = null;
}

function stopDraftUrgencyTicker() {
  if (!draftLockVisualState.urgencyTicker) return;
  clearInterval(draftLockVisualState.urgencyTicker);
  draftLockVisualState.urgencyTicker = null;
}

function ensureDraftUrgencyTicker() {
  if (draftLockVisualState.urgencyTicker) return;
  draftLockVisualState.urgencyTicker = setInterval(() => {
    if (gameState.draftLocked || gameState.draftEntryCount < 2) {
      stopDraftUrgencyTicker();
      return;
    }
    syncDraftActionControls();
  }, 1000);
  addTimer(draftLockVisualState.urgencyTicker);
}

function setDraftWaitVisual(isLocked) {
  const waitVisual = document.getElementById('draftWaitVisual');
  const livePicksSection = document.querySelector('.live-picks-section');
  const myTeamList = document.getElementById('myTeam');
  if (!waitVisual) return;

  if (!isLocked) {
    waitVisual.style.display = 'none';
    waitVisual.classList.remove('waiting-active');
    waitVisual.textContent = '';
    if (livePicksSection) livePicksSection.classList.remove('draft-live-erased');
    if (myTeamList) myTeamList.classList.remove('draft-team-locked');
    stopDraftWaitTicker();
    draftLockVisualState.waitDotIndex = 0;
    return;
  }

  if (livePicksSection) livePicksSection.classList.add('draft-live-erased');
  if (myTeamList) myTeamList.classList.add('draft-team-locked');
  waitVisual.style.display = 'block';
  waitVisual.classList.add('waiting-active');

  const emojiCycle = ['⏳', '⚡', '🌀', '🔥'];
  const renderWaitingText = () => {
    const dotCount = (draftLockVisualState.waitDotIndex % 3) + 1;
    const dots = '.'.repeat(dotCount);
    const emoji = emojiCycle[draftLockVisualState.waitEmojiIndex % emojiCycle.length];
    waitVisual.textContent = `${emoji} WAITING FOR SLOWER PLAYERS${dots}`;
    draftLockVisualState.waitDotIndex += 1;
    draftLockVisualState.waitEmojiIndex += 1;
  };

  renderWaitingText();
  if (draftLockVisualState.waitTicker) return;

  draftLockVisualState.waitTicker = setInterval(renderWaitingText, 760);
  addTimer(draftLockVisualState.waitTicker);
}

function syncDraftActionControls() {
  const lockBtn = document.getElementById('lockDraftBtn');
  const charInput = document.getElementById('charInput');
  const submitBtn = document.querySelector('.btn-submit-draft');
  const isLocked = gameState.draftLocked === true;
  const isReadyToLock = !isLocked && gameState.draftEntryCount >= 2;

  if (lockBtn) {
    lockBtn.classList.remove('pulsing-glow', 'draft-lock-ready', 'draft-lock-shake');

    if (isLocked) {
      lockBtn.disabled = true;
      lockBtn.textContent = '✅ TEAM LOCKED!';
      lockBtn.style.display = 'block';
      lockBtn.className = 'btn btn-success btn-lock-draft';
      lockBtn.setAttribute('aria-pressed', 'true');
    } else if (gameState.draftEntryCount >= 2) {
      lockBtn.disabled = false;
      lockBtn.textContent = '🔒 LOCK TEAM';
      lockBtn.style.display = 'block';
      lockBtn.className = 'btn btn-success btn-lock-draft';
      lockBtn.setAttribute('aria-pressed', 'false');
    } else {
      lockBtn.disabled = true;
      lockBtn.textContent = `🔓 LOCK TEAM (${gameState.draftEntryCount}/2)`;
      lockBtn.style.display = gameState.draftEntryCount > 0 ? 'block' : 'none';
      lockBtn.className = 'btn btn-success btn-lock-draft';
      lockBtn.setAttribute('aria-pressed', 'false');
    }

    if (isReadyToLock) {
      if (!draftLockVisualState.availableSince) {
        draftLockVisualState.availableSince = Date.now();
      }

      ensureDraftUrgencyTicker();

      const readyDurationMs = Date.now() - draftLockVisualState.availableSince;
      lockBtn.classList.add('pulsing-glow', 'draft-lock-ready');
      if (readyDurationMs >= 9000) {
        lockBtn.classList.add('draft-lock-shake');
      }
    } else {
      draftLockVisualState.availableSince = 0;
      stopDraftUrgencyTicker();
    }
  }

  if (charInput) {
    charInput.disabled = isLocked;
    if (isLocked) {
      charInput.blur();
    }
  }

  if (submitBtn) {
    submitBtn.disabled = isLocked;
    submitBtn.setAttribute('aria-pressed', isLocked ? 'true' : 'false');
  }

  setDraftWaitVisual(isLocked);
}

function submitDraft(char) {
  if (gameState.draftLocked) {
    showToast('🔒 Your team is already locked in!', 'info');
    return;
  }

  if (gameState.draftEntryCount >= 2) {
    showToast('⚠️ You can draft max 2 characters!', 'warning');
    return;
  }

  const charLower = char.toLowerCase();
  const isDupOwn = gameState.myTeam.some(c => c.toLowerCase() === charLower);
  const isDupOther = gameState.allDraftsList.some(p =>
    p.name !== player.name && p.character.toLowerCase() === charLower
  );
  const isDupAcrossRounds = gameState.allCharactersDrafted.includes(charLower);

  if (isDupOwn) {
    playErrorSound();
    showToast(`❌ You already drafted "${char}" this round! Auto-filling instead...`, 'error', 4000);
  } else if (isDupAcrossRounds) {
    playErrorSound();
    showToast(`❌ You already drafted "${char}" in a previous round! Auto-filling instead...`, 'error', 4000);
  } else if (isDupOther) {
    playErrorSound();
    showToast(`❌ "${char}" was picked by another player! Auto-filling instead...`, 'error', 4000);
  } else {
    playDraftSound();
  }

  if (!isDupOwn && !isDupOther && !isDupAcrossRounds) {
    gameState.allCharactersDrafted.push(charLower);
  }
  socket.emit('draftCharacter', char);
  const charInput = document.getElementById('charInput');
  if (charInput) {
    charInput.value = '';
    charInput.focus();
  }
  updateDraftWarning('', false);
}

function lockDraft() {
  if (gameState.draftLocked) return;

  if (gameState.draftEntryCount < 2) {
    playErrorSound();
    showToast('⚠️ You must have 2 characters to lock in!', 'warning');
    return;
  }
  playDraftSound();
  socket.emit('lockDraft');
  gameState.draftLocked = true;
  syncDraftActionControls();
  showToast('🔒 Your team is locked in!', 'info');
}

socket.on('draftError', (message) => {
  showToast(message, 'error');
});

socket.on('draftUpdate', (data) => {
  gameState.allDraftsList = data.allDrafts || [];

  const picksList = document.getElementById('livePicksList');
  if (!picksList) return;
  picksList.innerHTML = '';

  [...data.allDrafts].reverse().forEach((pick, idx) => {
    const li = document.createElement('li');
    const autoFillBadge = pick.autoFilled ? ' 🔄 (auto-filled)' : '';
    li.textContent = `${pick.name} → ${pick.character}${autoFillBadge}`;
    li.classList.add('live-pick');
    if (pick.autoFilled) li.classList.add('live-pick-duplicate');
    li.style.animationDelay = `${idx * 0.05}s`;
    picksList.appendChild(li);
  });

  picksList.scrollTop = 0;

  updateLivePicksCount(data.allDrafts.length);

  const myTeamList = document.getElementById('myTeam');
  if (myTeamList) myTeamList.innerHTML = '';

  gameState.myTeam = data.allDrafts
    .filter(p => p.name === player.name)
    .map(p => p.character);

  const reportedEntryCount = Number(data.playerEntryCounts && data.playerEntryCounts[player.name]);
  gameState.draftEntryCount = Number.isFinite(reportedEntryCount)
    ? reportedEntryCount
    : gameState.myTeam.length;
  syncDraftEntryComposerVisibility();

  data.allDrafts
    .filter(p => p.name === player.name)
    .forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.character;
      if (p.autoFilled) {
        li.classList.add('draft-autofill');
      }
      if (myTeamList) myTeamList.appendChild(li);
    });

  updateDraftCounter();
  syncDraftActionControls();
});

socket.on('draftSuccess', (data) => {
  console.log(`✓ Drafted: ${data.character} (${data.teamSize}/2)`);
});

socket.on('playerLocked', (data) => {
  if (data.phase === 'DRAFT') {
    if (data.playerName === player.name) {
      gameState.draftLocked = true;
      syncDraftActionControls();
    }
    showToast(`🔒 ${data.playerName} locked in!`, 'info', 2000);
  }
});

// ========================
// PLOT TWIST
// ========================
socket.on('plotTwistRevealed', (data) => {
  clearTimers();
  gameState.currentTwist = data.twist;
  document.getElementById('twistText').textContent = `"${data.twist}"`;
  showScreen('twistScreen');
  playTwistSound();
  showToast('🌀 Plot twist incoming!', 'warning');
});

// ========================
// VOTING PHASE
// ========================
socket.on('votingPhaseStart', (data) => {
  clearTimers();
  playPhaseShiftSound();
  const charInput = document.getElementById('charInput');
  if (charInput) charInput.value = '';
  gameState.voted = false;
  gameState.voteLocked = false;
  gameState.currentVoteChoice = null;

  const scenarioDisplay = document.getElementById('votingScenario');
  const twistDisplay = document.getElementById('votingTwist');
  const safeScenario = data.scenario || 'No scenario available';
  const safeTwist = data.twist || 'No twist this round';
  if (scenarioDisplay) scenarioDisplay.textContent = safeScenario;
  if (twistDisplay) twistDisplay.textContent = safeTwist;

  const grid = document.getElementById('votingTeams');
  if (grid) grid.innerHTML = '';

  data.teams.forEach((team, idx) => {
    if (!team.team || team.team.length === 0) {
      return;
    }

    if (team.name === player.name) {
      return;
    }

    const card = document.createElement('div');
    card.className = 'vote-card';
    card.style.animationDelay = `${idx * 0.1}s`;
    card.onclick = () => castVote(team.name);

    const title = document.createElement('h3');
    title.textContent = `👤 ${team.name}`;
    card.appendChild(title);

    const teamList = document.createElement('ul');
    teamList.className = 'team-display';
    team.team.forEach((member) => {
      const li = document.createElement('li');
      li.textContent = `• ${member}`;
      teamList.appendChild(li);
    });
    card.appendChild(teamList);

    const voteP = document.createElement('p');
    voteP.className = 'vote-count';
    const voteBadge = document.createElement('span');
    voteBadge.className = 'vote-badge';
    voteBadge.textContent = String(team.votes || 0);
    voteP.appendChild(voteBadge);
    appendText(voteP, ' votes');
    card.appendChild(voteP);

    if (grid) grid.appendChild(card);
  });

  if (grid && grid.children.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = '(Your own team isn\'t shown—no voting for yourself!)';
    msg.style.cssText = 'color: #999; font-size: 1.1em; margin: 20px; font-weight: bold;';
    grid.appendChild(msg);
  }

  const lockSection = document.getElementById('voteLockSection');
  if (lockSection) {
    lockSection.style.display = 'none';
  }

  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.style.display = 'none';
    lockBtn.disabled = true;
    lockBtn.textContent = '🔒 LOCK MY VOTE';
    lockBtn.className = 'btn btn-success btn-lock-vote';
  }

  const votedIndication = document.getElementById('votedIndication');
  if (votedIndication) votedIndication.style.display = 'none';

  const voteLockNotice = document.getElementById('voteLockNotice');
  if (voteLockNotice) voteLockNotice.style.display = 'block';

  updateVoteStatusBadge('Select Team');

  showScreen('votingScreen');
  showToast('⚖️ Time to vote. Community vote + intel fit decides this round.', 'info', 4200);

  let timeLeft = 30;
  document.getElementById('voteTimer').textContent = timeLeft;

  const voteTimer = setInterval(() => {
    timeLeft--;
    const timerEl = document.getElementById('voteTimer');
    if (timerEl) {
      timerEl.textContent = timeLeft;
      if (timeLeft <= 10) {
        timerEl.style.color = '#ff5252';
      }
    }
    if (timeLeft <= 0) clearInterval(voteTimer);
  }, 1000);

  addTimer(voteTimer);
});

// ========================
// ROUND 4: AI EVALUATION (NEW)
// ========================
socket.on('round4Start', (data) => {
  console.log('🎮 Round 4 Start event received:', data);
  clearTimers();
  playPhaseShiftSound();
  if (typeof window.initRound4Evaluation === 'function') {
    window.initRound4Evaluation(data);
  } else {
    console.error('❌ Round 4 evaluation function not found');
  }
});

function castVote(playerName) {
  playVoteSound();
  socket.emit('castVote', playerName);
  gameState.voted = true;
  gameState.currentVoteChoice = playerName;

  document.querySelectorAll('.vote-card').forEach(card => {
    const cardName = card.querySelector('h3').textContent.replace('👤 ', '');
    if (cardName === playerName) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  const lockBtn = document.getElementById('lockVoteBtn');
  const lockSection = document.getElementById('voteLockSection');
  if (lockBtn && lockSection) {
    lockSection.style.display = 'block';
    lockBtn.style.display = 'inline-block';
    lockBtn.disabled = false;
  }

  updateVoteStatusBadge(`Voting for ${playerName}`);

  showToast(`✓ Selected ${playerName}! Click LOCK when ready.`, 'info', 2000);
}

function lockVote() {
  if (!gameState.voted) {
    playErrorSound();
    showToast('⚠️ Please select a team first!', 'warning');
    return;
  }
  playDraftSound();
  socket.emit('lockVote');
  gameState.voteLocked = true;

  const lockBtn = document.getElementById('lockVoteBtn');
  if (lockBtn) {
    lockBtn.disabled = true;
    lockBtn.textContent = '✓ VOTE LOCKED';
    lockBtn.className = 'btn btn-success';
  }

  updateVoteStatusBadge();
  showToast('🔒 Your vote is locked!', 'info', 2000);
}

socket.on('voteUpdate', (voteCount) => {
  document.querySelectorAll('.vote-card').forEach(card => {
    const playerName = card.querySelector('h3').textContent.replace('👤 ', '');
    const badge = card.querySelector('.vote-badge');
    if (badge) badge.textContent = voteCount[playerName] || 0;
  });
});

socket.on('voteLockUpdate', (data) => {
  const statusDiv = document.getElementById('voteLockStatus');
  if (statusDiv) {
    statusDiv.textContent = `🔒 ${data.lockedPlayers.length}/${data.totalPlayers} votes locked`;
    if (data.lockedPlayers.length === data.totalPlayers) {
      statusDiv.textContent = '✓ All votes locked! Tallying results...';
      statusDiv.style.color = '#4caf50';
    }
  }
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMissingWinnerImage() {
  const text = 'Womp Womp, Shoulda picked a real thing bro';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#2b2b2b"/>
          <stop offset="100%" stop-color="#1d1d1d"/>
        </linearGradient>
      </defs>
      <rect width="360" height="360" fill="url(#bg)" rx="22"/>
      <text x="180" y="150" fill="#f5f5f5" font-size="20" font-family="Arial, sans-serif" text-anchor="middle">Womp Womp,</text>
      <text x="180" y="185" fill="#f5f5f5" font-size="20" font-family="Arial, sans-serif" text-anchor="middle">Shoulda picked a</text>
      <text x="180" y="220" fill="#f5f5f5" font-size="20" font-family="Arial, sans-serif" text-anchor="middle">real thing bro</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatNameList(names) {
  const safeNames = names.map(escapeHtml);
  if (safeNames.length <= 1) return safeNames[0] || '';
  if (safeNames.length === 2) return `${safeNames[0]} & ${safeNames[1]}`;
  return `${safeNames.slice(0, -1).join(', ')}, & ${safeNames[safeNames.length - 1]}`;
}

function getRoundLeaders(roundPoints = {}) {
  const entries = Object.entries(roundPoints || {});
  if (entries.length === 0) {
    return { leaders: [], maxPoints: 0, isTie: false };
  }

  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const maxPoints = sorted[0][1];
  const leaders = sorted.filter(([, score]) => score === maxPoints).map(([name]) => name);

  return {
    leaders,
    maxPoints,
    isTie: leaders.length > 1
  };
}

function showVoteTallyLoading(payload = {}) {
  resetVoteTallyLoadingState();
  const trigger = payload && payload.trigger ? payload.trigger : 'timer';
  const triggerText = trigger === 'all_locked'
    ? 'All votes locked. Finalizing scores now…'
    : 'Voting window closed. Finalizing scores…';
  const fetchQueue = buildCharacterFetchLabels(payload.fetchQueue || {}, {
    maxPlayers: 5,
    maxCharsPerPlayer: 2
  });
  const fetchItems = buildCharacterFetchItems(payload.fetchQueue || {}, {
    maxPlayers: 5,
    maxCharsPerPlayer: 2
  });
  const totalFetches = Math.max(1, fetchItems.length);
  voteTallyLoadingState.active = true;
  voteTallyLoadingState.totalFetches = totalFetches;
  voteTallyLoadingState.completedFetches = 0;
  voteTallyLoadingState.stallTarget = 78;

  showPreRoundLoadingState({
    title: '⏳ TALLYING ROUND RESULTS',
    message: triggerText,
    stages: [
      'Verifying locked votes…',
      'Fetching matchup intel for submitted teams…',
      'Applying scoring rules and tie checks…'
    ],
    progress: 52,
    showCountdown: false
  });

  let progress = 52;
  let queueIndex = 0;
  const ramp = setInterval(() => {
    progress = Math.min(voteTallyLoadingState.stallTarget, progress + 1);
    const stageText = progress < 64
      ? 'Verifying locked votes…'
      : progress < 74
        ? 'Fetching matchup intel for submitted teams…'
        : 'Waiting on roster intel fetches…';

    const fetchContext = fetchQueue.length ? fetchQueue[queueIndex % fetchQueue.length] : '';
    queueIndex += 1;
    const label = fetchContext ? `${stageText} • Fetching: ${fetchContext}` : stageText;
    setPreRoundProgress(progress, label);

    if (progress >= voteTallyLoadingState.stallTarget) {
      clearInterval(ramp);
      let pulse = 0;
      voteTallyLoadingState.pulseTimer = setInterval(() => {
        if (!voteTallyLoadingState.active || voteTallyLoadingState.completedFetches > 0) {
          clearInterval(voteTallyLoadingState.pulseTimer);
          voteTallyLoadingState.pulseTimer = null;
          return;
        }
        const pulsePct = 77 + Math.round(Math.sin(pulse) * 1);
        const boundedPct = Math.max(76, Math.min(79, pulsePct));
        const rotatingContext = fetchQueue.length ? fetchQueue[queueIndex % fetchQueue.length] : '';
        queueIndex += 1;
        const pulseLabel = rotatingContext
          ? `Queueing roster intel… • Fetching: ${rotatingContext}`
          : 'Queueing roster intel…';
        setPreRoundProgress(boundedPct, pulseLabel);
        pulse += 0.65;
      }, 600);
      addTimer(voteTallyLoadingState.pulseTimer);
    }
  }, 160);
  addTimer(ramp);

  showScreen('preRound');
}

function categorizeBreakdownLines(lines = []) {
  const groups = {
    vote: [],
    intel: [],
    core: []
  };

  (Array.isArray(lines) ? lines : []).forEach((line) => {
    const normalized = String(line || '').toLowerCase();
    if (/vote|runner-up|tied for most|didn't vote/.test(normalized)) {
      groups.vote.push(line);
      return;
    }
    if (/intel|relevance|adaptability|confidence|trusted/.test(normalized)) {
      groups.intel.push(line);
      return;
    }
    groups.core.push(line);
  });

  return groups;
}

function dedupeBreakdownLines(lines = []) {
  const seen = new Set();
  return (Array.isArray(lines) ? lines : []).filter((line) => {
    const normalized = String(line || '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function extractLinePoints(line) {
  const text = String(line || '');
  const matches = text.match(/[+-]\d+/g);
  if (!matches || !matches.length) return 0;
  return Number(matches[matches.length - 1]) || 0;
}

function formatSignedNumber(value) {
  const numeric = Number(value) || 0;
  return numeric >= 0 ? `+${numeric}` : `${numeric}`;
}

function summarizeBreakdown(lines = []) {
  const grouped = categorizeBreakdownLines(lines);
  const sum = (arr) => (Array.isArray(arr) ? arr.reduce((acc, line) => acc + extractLinePoints(line), 0) : 0);
  const votePoints = sum(grouped.vote);
  const intelPoints = sum(grouped.intel);
  const corePoints = sum(grouped.core);
  const totalAbs = Math.max(1, Math.abs(votePoints) + Math.abs(intelPoints) + Math.abs(corePoints));

  return {
    grouped,
    votePoints,
    intelPoints,
    corePoints,
    votePct: Math.max(8, Math.round((Math.abs(votePoints) / totalAbs) * 100)),
    intelPct: Math.max(8, Math.round((Math.abs(intelPoints) / totalAbs) * 100)),
    corePct: Math.max(8, Math.round((Math.abs(corePoints) / totalAbs) * 100)),
    totalAbs
  };
}

function compactBreakdownLine(line, maxLength = 64) {
  const cleaned = String(line || '')
    .replace(/\s*[+-]\d+\s*$/, '')
    .replace(/^\s*(full team|vote share|round intel bonus|avg relevance|trusted intel)\s*[:|-]?\s*/i, '')
    .trim();

  if (!cleaned) return 'No scoring note.';
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function buildRadialSliceData(lines = [], emptyLabel = 'No scoring notes.') {
  const safeLines = dedupeBreakdownLines(lines);
  const topLine = safeLines[0] || '';
  const topPoints = extractLinePoints(topLine);
  return {
    note: compactBreakdownLine(topLine || emptyLabel),
    notePoints: topLine ? formatSignedNumber(topPoints) : '±0',
    rawTopPoints: topPoints,
    moreCount: Math.max(0, safeLines.length - 1)
  };
}

function getImpactDescriptor(points = 0) {
  if (points > 0) return 'Boost';
  if (points < 0) return 'Drag';
  return 'Neutral';
}

function getRadialShares(summary) {
  const voteAbs = Math.abs(Number(summary.votePoints) || 0);
  const intelAbs = Math.abs(Number(summary.intelPoints) || 0);
  const coreAbs = Math.abs(Number(summary.corePoints) || 0);
  const total = voteAbs + intelAbs + coreAbs;

  if (!total) {
    return { vote: 34, intel: 33, core: 33 };
  }

  const vote = Math.round((voteAbs / total) * 100);
  const intel = Math.round((intelAbs / total) * 100);
  let core = 100 - vote - intel;
  if (core < 0) core = 0;

  const delta = 100 - (vote + intel + core);
  core += delta;

  return { vote, intel, core };
}

function getRoundTier(roundScore = 0) {
  const score = Number(roundScore) || 0;
  if (score >= 80) return 'elite';
  if (score >= 60) return 'diamond';
  if (score >= 45) return 'high';
  if (score >= 20) return 'mid';
  if (score >= 0) return 'low';
  return 'black';
}

function getRoundTierLabel(roundTier = 'low') {
  if (roundTier === 'elite') return 'ELITE TIER';
  if (roundTier === 'diamond') return 'DIAMOND TIER';
  if (roundTier === 'high') return 'GOLD TIER';
  if (roundTier === 'mid') return 'SILVER TIER';
  if (roundTier === 'low') return 'BRONZE TIER';
  return 'BLACK TIER';
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = (angleDeg - 90) * (Math.PI / 180);
  return {
    x: Number((cx + (radius * Math.cos(angleRad))).toFixed(2)),
    y: Number((cy + (radius * Math.sin(angleRad))).toFixed(2))
  };
}

function buildDonutSlicePath(cx, cy, innerRadius, outerRadius, startDeg, endDeg) {
  const sweep = Math.max(0.2, endDeg - startDeg);
  const safeEnd = startDeg + Math.min(359.8, sweep);
  const largeArc = safeEnd - startDeg > 180 ? 1 : 0;

  const outerStart = polarToCartesian(cx, cy, outerRadius, startDeg);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, safeEnd);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, safeEnd);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startDeg);

  return `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}

function buildInteractiveRingMarkup(shares, labels) {
  const start = -90;
  const voteEnd = start + ((shares.vote / 100) * 360);
  const intelEnd = voteEnd + ((shares.intel / 100) * 360);
  const coreEnd = start + 360;

  const votePath = buildDonutSlicePath(90, 90, 42, 68, start, voteEnd);
  const intelPath = buildDonutSlicePath(90, 90, 42, 68, voteEnd, intelEnd);
  const corePath = buildDonutSlicePath(90, 90, 42, 68, intelEnd, coreEnd);

  return `
    <svg class="radial-ring-svg" viewBox="0 0 180 180" aria-label="Score contribution ring">
      <circle class="radial-ring-track" cx="90" cy="90" r="68"></circle>
      <path class="ring-segment vote" role="button" tabindex="0" data-tone="vote" aria-pressed="false" aria-label="${labels.vote}" d="${votePath}"></path>
      <path class="ring-segment intel" role="button" tabindex="0" data-tone="intel" aria-pressed="false" aria-label="${labels.intel}" d="${intelPath}"></path>
      <path class="ring-segment core" role="button" tabindex="0" data-tone="core" aria-pressed="false" aria-label="${labels.core}" d="${corePath}"></path>
    </svg>
  `;
}

function initializeRadialMaps(root) {
  if (!root) return;
  const maps = root.querySelectorAll('.breakdown-radial-map');
  maps.forEach((map) => {
    const segments = Array.from(map.querySelectorAll('.ring-segment'));
    if (!segments.length) return;
    const keyToggle = map.querySelector('.radial-key-toggle');

    const activateTone = (tone) => {
      map.setAttribute('data-active-tone', tone || 'none');
      segments.forEach((segment) => {
        segment.setAttribute('aria-pressed', segment.dataset.tone === tone ? 'true' : 'false');
      });
    };

    const setKeyOpen = (isOpen) => {
      map.setAttribute('data-key-open', isOpen ? 'true' : 'false');
      if (keyToggle) keyToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    segments.forEach((segment) => {
      segment.addEventListener('click', () => {
        const tone = segment.dataset.tone;
        const current = map.getAttribute('data-active-tone') || 'none';
        const nextTone = current === tone ? null : tone;
        playSliceInteractionSound(tone, nextTone === null);
        activateTone(nextTone);
      });

      segment.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const tone = segment.dataset.tone;
        const current = map.getAttribute('data-active-tone') || 'none';
        const nextTone = current === tone ? null : tone;
        playSliceInteractionSound(tone, nextTone === null);
        activateTone(nextTone);
      });
    });

    if (keyToggle) {
      keyToggle.addEventListener('click', () => {
        const isOpen = map.getAttribute('data-key-open') === 'true';
        scheduleTone({ frequency: isOpen ? 330 : 520, duration: 55, type: 'triangle', volume: 0.085 });
        setKeyOpen(!isOpen);
      });
    }

    activateTone(null);
    setKeyOpen(true);
  });
}

function buildRoundWinnerHTML(data, isFinalRound = false) {
  const winnerInfo = getRoundLeaders(data.roundPoints);
  if (!winnerInfo.leaders.length) {
    return {
      html: '<h2>🏁 Round complete</h2>',
      isTie: false
    };
  }

  if (winnerInfo.isTie) {
    const names = formatNameList(winnerInfo.leaders);
    const tieHeadline = winnerInfo.leaders.length === 2
      ? `${names} tied for first!`
      : `${names} all tied for first!`;
    const tieSubtitle = isFinalRound
      ? 'Photo finish. The evaluator called this one dead even.'
      : 'No daylight between them this round.';

    return {
      html: `
        <h2>🤝 ${tieHeadline}</h2>
        <p class="winner-round-score">+${winnerInfo.maxPoints} POINTS EACH</p>
        <p class="winner-subtitle">${tieSubtitle}</p>
      `,
      isTie: true
    };
  }

  const winnerName = escapeHtml(winnerInfo.leaders[0]);
  const headline = isFinalRound
    ? `🏆 ${winnerName} WINS THE FINAL ROUND! 🏆`
    : `🏆 ${winnerName} WINS! 🏆`;

  return {
    html: `
      <h2>${headline}</h2>
      <p class="winner-round-score">+${winnerInfo.maxPoints} POINTS</p>
    `,
    isTie: false
  };
}

// ========================
// RESULTS SCREEN
// ========================
socket.on('roundResults', (data) => {
  resetVoteTallyLoadingState();
  clearTimers();
  playWinSound();
  document.getElementById('resultRound').textContent = data.round;

  const winnerBox = document.getElementById('roundWinner');
  const winnerView = buildRoundWinnerHTML(data, false);
  if (winnerBox) {
    winnerBox.classList.remove('tie', 'animate-in');
    winnerBox.innerHTML = winnerView.html;
    if (winnerView.isTie) winnerBox.classList.add('tie');
    void winnerBox.offsetWidth;
    winnerBox.classList.add('animate-in');
  }

  const breakdownContainer = document.getElementById('resultsBreakdown');
  if (breakdownContainer) {
    let breakdownHTML = '';
    const sorted = [...data.leaderboard].sort((a, b) => b.roundScore - a.roundScore);
    const topRoundScore = sorted.length ? sorted[0].roundScore : 0;
    sorted.forEach((playerEntry, idx) => {
      const summary = summarizeBreakdown(playerEntry.breakdown);
      const grouped = summary.grouped;
      const voteLines = dedupeBreakdownLines(grouped.vote || []);
      const intelLines = dedupeBreakdownLines(grouped.intel || []);
      const modifierLines = dedupeBreakdownLines(grouped.core || []);

      const voteSlice = buildRadialSliceData(voteLines, 'No vote-based changes.');
      const intelSlice = buildRadialSliceData(intelLines, 'No intel-fit changes.');
      const coreSlice = buildRadialSliceData(modifierLines, 'No extra modifiers applied.');
      const voteImpact = getImpactDescriptor(summary.votePoints);
      const intelImpact = getImpactDescriptor(summary.intelPoints);
      const coreImpact = getImpactDescriptor(summary.corePoints);
      const shares = getRadialShares(summary);
      const roundTier = getRoundTier(playerEntry.roundScore);
      const roundTierLabel = getRoundTierLabel(roundTier);
      const ringMarkup = buildInteractiveRingMarkup(shares, {
        vote: `Votes ${formatSignedNumber(summary.votePoints)} points, ${shares.vote}% of swing`,
        intel: `Intel ${formatSignedNumber(summary.intelPoints)} points, ${shares.intel}% of swing`,
        core: `Other ${formatSignedNumber(summary.corePoints)} points, ${shares.core}% of swing`
      });

      breakdownHTML += `
        <div class="player-breakdown ${playerEntry.roundScore === topRoundScore ? 'top-score' : ''}" style="--result-index:${idx};">
          <details class="player-breakdown-dropdown">
            <summary class="breakdown-summary-row" aria-label="Open detailed score breakdown for ${playerEntry.name}">
              <span class="breakdown-toggle-arrow" aria-hidden="true"></span>
              <span class="breakdown-header">${playerEntry.name}</span>
              <span class="breakdown-points">${formatSignedNumber(playerEntry.roundScore)} pts</span>
            </summary>
            <div class="breakdown-details" aria-label="Detailed score notes">
              <div
                class="breakdown-radial-map tier-${roundTier}"
                data-active-tone="none"
                data-key-open="true"
                aria-label="Radial score map with votes, intel fit, and other modifiers"
              >
                <button type="button" class="radial-key-toggle" aria-expanded="true" aria-label="Toggle chart key">Key</button>
                <aside class="radial-key-panel" aria-label="Chart legend">
                  <h6>Chart Key</h6>
                  <div class="key-item vote"><span></span> Votes = community picks</div>
                  <div class="key-item intel"><span></span> Intel = scenario/twist fit</div>
                  <div class="key-item core"><span></span> Other = rule modifiers</div>
                </aside>
                <div class="radial-ring-wrap">
                  ${ringMarkup}
                </div>
                <div class="radial-center">
                  <b class="radial-tier-label">${roundTierLabel}</b>
                  <span>Momentum</span>
                  <strong>${formatSignedNumber(playerEntry.roundScore)}</strong>
                </div>

                <article
                  class="radial-bubble vote"
                >
                  <h5>Votes ${formatSignedNumber(summary.votePoints)} • ${shares.vote}%</h5>
                  <p><b>${voteImpact}:</b> ${escapeHtml(voteSlice.note)}</p>
                  <small>${voteSlice.moreCount ? `+${voteSlice.moreCount} hidden vote notes` : 'No hidden vote notes'}</small>
                </article>

                <article
                  class="radial-bubble intel"
                >
                  <h5>Intel ${formatSignedNumber(summary.intelPoints)} • ${shares.intel}%</h5>
                  <p><b>${intelImpact}:</b> ${escapeHtml(intelSlice.note)}</p>
                  <small>${intelSlice.moreCount ? `+${intelSlice.moreCount} hidden intel notes` : 'No hidden intel notes'}</small>
                </article>

                <article
                  class="radial-bubble core"
                >
                  <h5>Other ${formatSignedNumber(summary.corePoints)} • ${shares.core}%</h5>
                  <p><b>${coreImpact}:</b> ${escapeHtml(coreSlice.note)}</p>
                  <small>${coreSlice.moreCount ? `+${coreSlice.moreCount} hidden modifier notes` : 'No hidden modifier notes'}</small>
                </article>
              </div>
            </div>
          </details>
        </div>
      `;
    });
    breakdownContainer.innerHTML = breakdownHTML;
    initializeRadialMaps(breakdownContainer);
  }

  const scoringMeta = document.getElementById('roundScoringMeta');
  if (scoringMeta) {
    scoringMeta.innerHTML = '<strong>Scoring:</strong> Community votes + contextual intel fit + other rule-based modifiers';
  }

  const intelSummaryContainer = document.getElementById('resultsIntelSummary');
  if (intelSummaryContainer) {
    intelSummaryContainer.style.display = 'none';
    intelSummaryContainer.innerHTML = '';
  }

  const resultsDetails = document.getElementById('resultsDetails');
  if (resultsDetails) {
    resultsDetails.style.display = 'block';
  }

  const readyButton = document.getElementById('nextRoundReadyBtn');
  if (readyButton) {
    readyButton.style.display = 'inline-block';
    readyButton.disabled = false;
    readyButton.textContent = '✓ READY FOR NEXT ROUND';
  }

  showScreen('resultsScreen');
  showToast(winnerView.isTie ? '🤝 Tie at the top (votes + intel)!' : '📊 Round results are in (votes + intel)!', 'info');
});

socket.on('voteTallying', (data) => {
  clearTimers();
  showVoteTallyLoading(data || {});
});

socket.on('voteTallyProgress', (payload) => {
  applyVoteTallyProgressUpdate(payload || {});
});

function readyForNextRound() {
  socket.emit('readyForNextRound');
  const readyButton = document.getElementById('nextRoundReadyBtn');
  if (readyButton) {
    readyButton.disabled = true;
    readyButton.textContent = '✓ READY';
    showToast('Waiting for other players...', 'info');
  }
}

socket.on('finalRoundResults', (data) => {
  clearTimers();
  playWinSound();
  const tie = data && data.isTie === true;
  showToast(tie ? '🤝 Final round locked with a tie.' : '🏁 Final round tally locked.', 'info', 2200);
});

// ========================
// FINAL LEADERBOARD
// ========================
socket.on('gameEnded', (data) => {
  clearTimers();
  playWinSound();
  setTimeout(() => createConfetti(), 300);

  const placeholderImage = buildMissingWinnerImage();
  const winnerGallery = document.getElementById('finalWinnerCharacters');
  if (winnerGallery) {
    const winnerCharacters = Array.isArray(data.winnerCharacters) ? data.winnerCharacters : [];
    if (winnerCharacters.length) {
      const stats = data && data.winnerTeamStats ? data.winnerTeamStats : {};
      const safeMVP = escapeHtml(stats.mvp || 'N/A');
      const teamOVR = Number(stats.teamOVR) || 0;
      const round4Points = Number(stats.round4Points) || 0;
      const chemistryBonus = Number(stats.chemistryBonus) || 0;
      const chemistryLabel = chemistryBonus >= 0 ? `+${chemistryBonus}` : String(chemistryBonus);
      const rarityScore = Number(stats.rarityScore) || 0;
      const pickCountForRarity = Number(stats.picks) || winnerCharacters.length || 6;
      const rarityMax = Math.max(1, pickCountForRarity * 7);
      const rarityPercent = Math.max(0, Math.min(100, Math.round((rarityScore / rarityMax) * 100)));
      const rarityGems = '◆'.repeat(Math.max(1, Math.min(5, Math.round(rarityPercent / 20))));
      const avgDraftValue = winnerCharacters.length
        ? Math.round(
          winnerCharacters.reduce((acc, entry) => acc + (Number(entry && entry.valueVsDraftExpected) || 0), 0)
          / winnerCharacters.length
        )
        : 0;
      const avgDraftValueLabel = avgDraftValue >= 0 ? `+${avgDraftValue}` : `${avgDraftValue}`;
      const powerIndex = Math.max(
        0,
        Math.round((teamOVR * 0.54) + (round4Points * 0.34) + (rarityScore * 0.18) + (chemistryBonus * 2.25))
      );
      const powerTier = powerIndex >= 140 ? 'S+' : powerIndex >= 120 ? 'S' : powerIndex >= 98 ? 'A' : powerIndex >= 82 ? 'B' : 'C';
      const teamOvrClass = teamOVR >= 92 ? 'ovr-elite' : teamOVR >= 86 ? 'ovr-high' : teamOVR >= 78 ? 'ovr-mid' : 'ovr-low';

      const compactSlots = winnerCharacters.map((entry, index) => {
        const safeName = escapeHtml(entry && entry.character ? entry.character : 'Unknown');
        const rawImage = entry && entry.imageUrl ? String(entry.imageUrl).trim() : '';
        const imageUrl = rawImage.startsWith('//') ? `https:${rawImage}` : (rawImage || placeholderImage);
        return `
          <div class="winner-compact-slot ${rawImage ? '' : 'missing'}" data-slot="${index + 1}" title="${safeName}">
            <img
              src="${escapeHtml(imageUrl)}"
              alt="${safeName}"
              loading="lazy"
              decoding="async"
              onerror="this.onerror=null;this.src='${placeholderImage}';this.closest('.winner-compact-slot')?.classList.add('missing');"
            >
            <span class="winner-compact-index">${index + 1}</span>
          </div>
        `;
      }).join('');

      const expandedSlots = winnerCharacters.map((entry, index) => {
        const safeName = escapeHtml(entry && entry.character ? entry.character : 'Unknown');
        const rawImage = entry && entry.imageUrl ? String(entry.imageUrl).trim() : '';
        const imageUrl = rawImage.startsWith('//') ? `https:${rawImage}` : (rawImage || placeholderImage);
        const rarity = escapeHtml(entry && entry.rarity ? entry.rarity : 'Bronze');
        const rarityRaw = String(entry && entry.rarity ? entry.rarity : 'bronze').toLowerCase();
        const rarityClass = rarityRaw.includes('legend') ? 'rarity-legendary'
          : rarityRaw.includes('epic') ? 'rarity-epic'
            : rarityRaw.includes('rare') ? 'rarity-rare'
              : 'rarity-common';
        const ovr = Number(entry && entry.ovr) || 0;
        const ovrTier = escapeHtml(entry && entry.ovrTierLabel ? entry.ovrTierLabel : 'Tiered');
        const source = escapeHtml(entry && entry.infoSource ? entry.infoSource : 'unknown');
        const sourceRaw = String(entry && entry.infoSource ? entry.infoSource : '').toLowerCase();
        const sourceClass = sourceRaw.includes('wikipedia') || sourceRaw.includes('wikidata')
          ? 'source-wiki'
          : sourceRaw.includes('web')
            ? 'source-web'
            : sourceRaw.includes('llm')
              ? 'source-llm'
              : 'source-unknown';
        const characterType = escapeHtml(entry && entry.characterType ? entry.characterType : 'balanced');
        const draftRound = Number(entry && entry.draftRound) || (Math.floor(index / 2) + 1);
        const draftPick = Number(entry && entry.pickNumberInRound) || ((index % 2) + 1);
        const expectedAtDraft = Number(entry && entry.expectedAtDraft) || 0;
        const expectedNearEnd = Number(entry && entry.expectedNearEnd) || 0;
        const valueDraft = Number(entry && entry.valueVsDraftExpected) || 0;
        const valueLate = Number(entry && entry.valueVsLateExpected) || 0;
        const valueDraftLabel = valueDraft >= 0 ? `+${valueDraft}` : `${valueDraft}`;
        const valueLateLabel = valueLate >= 0 ? `+${valueLate}` : `${valueLate}`;
        const ovrToneClass = ovr >= 94 ? 'ovr-elite' : ovr >= 86 ? 'ovr-high' : ovr >= 78 ? 'ovr-mid' : 'ovr-low';
        const draftedAtMs = Number(entry && entry.draftedAtMs);
        const draftedAtLabel = Number.isFinite(draftedAtMs) ? `${(draftedAtMs / 1000).toFixed(1)}s` : 'n/a';
        const draftOrderLabel = Number.isFinite(Number(entry && entry.globalDraftOrder)) ? `#${Number(entry.globalDraftOrder)}` : 'n/a';
        const insightA = escapeHtml(entry && Array.isArray(entry.notes) && entry.notes[0] ? entry.notes[0] : 'Role fit stabilized under final scenario pressure.');
        const insightB = escapeHtml(entry && Array.isArray(entry.notes) && entry.notes[1] ? entry.notes[1] : 'Draft value remained resilient into endgame.');
        const originalScenario = escapeHtml(entry && entry.originalScenario ? entry.originalScenario : 'N/A');
        const originalTwist = escapeHtml(entry && entry.originalTwist ? entry.originalTwist : 'N/A');
        return `
          <article class="winner-char-card winner-flip-card ${rarityClass} tier-${ovrToneClass} ${rawImage ? '' : 'missing'}" data-slot="${index + 1}" role="button" tabindex="0" aria-label="Flip ${safeName} card">
            <div class="winner-flip-inner">
              <div class="winner-flip-face winner-flip-front">
                <span class="winner-slot">${index + 1}</span>
                <div class="winner-char-frame">
                  <img
                    src="${escapeHtml(imageUrl)}"
                    alt="${safeName}"
                    loading="lazy"
                    decoding="async"
                    onerror="this.onerror=null;this.src='${placeholderImage}';this.closest('article')?.classList.add('missing');"
                  >
                </div>
                <figcaption>${safeName}</figcaption>
                <div class="winner-char-meta">
                  <span class="winner-char-ovr ${ovrToneClass}">OVR ${ovr}</span>
                  <span class="winner-char-rarity">${rarity}</span>
                </div>
                <div class="winner-char-submeta">
                  <span class="winner-char-source ${sourceClass}">${source}</span>
                  <span class="winner-char-type">${characterType}</span>
                </div>
                <div class="winner-flip-hint">Tap to flip</div>
              </div>
              <div class="winner-flip-face winner-flip-back">
                <div class="winner-back-title">${safeName}</div>
                <div class="winner-back-grid">
                  <div><span>Tier</span><strong>${ovrTier}</strong></div>
                  <div><span>Type</span><strong>${characterType}</strong></div>
                  <div><span>Source</span><strong>${source}</strong></div>
                  <div><span>Draft</span><strong>R${draftRound} · Pick ${draftPick}</strong></div>
                  <div><span>Global Slot</span><strong>${draftOrderLabel}</strong></div>
                  <div><span>Locked At</span><strong>${draftedAtLabel}</strong></div>
                  <div><span>EV @ Draft</span><strong>${expectedAtDraft}</strong></div>
                  <div><span>EV Near End</span><strong>${expectedNearEnd}</strong></div>
                  <div><span>Value vs Draft</span><strong class="${valueDraft >= 0 ? 'plus' : 'minus'}">${valueDraftLabel}</strong></div>
                  <div><span>Value vs Late</span><strong class="${valueLate >= 0 ? 'plus' : 'minus'}">${valueLateLabel}</strong></div>
                </div>
                <div class="winner-back-origin">Drafted Into: ${originalScenario}</div>
                <div class="winner-back-origin">Twist Context: ${originalTwist}</div>
                <ul class="winner-back-notes">
                  <li>${insightA}</li>
                  <li>${insightB}</li>
                </ul>
              </div>
            </div>
          </article>
        `;
      }).join('');

      winnerGallery.innerHTML = `
        <section class="winner-squad-stage" aria-label="Champion squad stage">
          <button class="winner-squad-compact" type="button" aria-expanded="false" aria-controls="winnerSquadExpanded" aria-label="Expand Champion Squad">
            <div class="winner-compact-title">🏆 ELITE FINAL SIX</div>
            <div class="winner-compact-lineup">${compactSlots}</div>
            <div class="winner-compact-stats" aria-label="Champion stats">
              <span class="winner-stat-chip mvp">MVP: ${safeMVP}</span>
              <span class="winner-stat-chip ovr ${teamOvrClass}">Team OVR: ${teamOVR}</span>
              <span class="winner-stat-chip">Chemistry: ${chemistryLabel}</span>
              <span class="winner-stat-chip">Rarity Score: ${rarityScore}</span>
              <span class="winner-stat-chip">Power Index: ${powerIndex}</span>
              <span class="winner-stat-chip">Avg Draft Value: ${avgDraftValueLabel}</span>
            </div>
            <div class="winner-compact-hint">Tap to morph into full squad intel • Tap cards to flip</div>
          </button>
          <div id="winnerSquadExpanded" class="winner-squad-shell winner-squad-shell-expanded" role="region" aria-label="Champion team expanded" aria-hidden="true">
          <button class="winner-squad-close" type="button" aria-label="Close Champion Squad">✕</button>
          <div class="winner-squad-banner">🏆 ELITE FINAL SIX • CHAMPION BREAKDOWN</div>
          <div class="winner-squad-tools">
            <button class="winner-flip-all" type="button" aria-pressed="false">🃏 FLIP ALL</button>
          </div>
          <div class="winner-expanded-stats" aria-label="Champion detail stats">
            <div class="winner-expanded-stat mvp wide"><span>MVP</span><strong>${safeMVP} (${Number(stats.mvpOVR) || 0} OVR)</strong></div>
            <div class="winner-expanded-stat team-ovr"><span>Team OVR</span><strong class="${teamOvrClass}">${teamOVR}</strong></div>
            <div class="winner-expanded-stat power"><span>Power Index</span><strong>${powerIndex}</strong><em>Tier ${powerTier}</em></div>
            <div class="winner-expanded-stat rarity wide"><span>Rarity Score</span><div class="rarity-topline"><strong>${rarityScore}</strong><strong class="rarity-rareplus">Rare+: ${Number(stats.rarePlusCount) || 0}/${Number(stats.picks) || winnerCharacters.length}</strong></div><div class="rarity-meter" aria-hidden="true"><span style="width:${rarityPercent}%"></span></div><div class="rarity-gems" aria-label="Rarity intensity">${rarityGems}</div></div>
            <div class="winner-expanded-stat"><span>Chemistry</span><strong>${chemistryLabel}</strong></div>
            <div class="winner-expanded-stat"><span>Avg Draft Value</span><strong class="${avgDraftValue >= 0 ? 'plus' : 'minus'}">${avgDraftValueLabel}</strong></div>
          </div>
          <div class="winner-char-gallery">
            ${expandedSlots}
          </div>
          <div class="winner-squad-footer">Elite Final Six.</div>
          </div>
        </section>
      `;

      const compactButton = winnerGallery.querySelector('.winner-squad-compact');
      const expandedShell = winnerGallery.querySelector('.winner-squad-shell-expanded');
      const closeButton = winnerGallery.querySelector('.winner-squad-close');
      const flipAllButton = winnerGallery.querySelector('.winner-flip-all');
      const finalContainer = document.querySelector('.final-container-modern');
      const squadStage = winnerGallery.querySelector('.winner-squad-stage');
      const flipCards = winnerGallery.querySelectorAll('.winner-flip-card');

      const setFlipAllState = (flipped) => {
        if (!flipCards || !flipCards.length) return;
        flipCards.forEach((card) => {
          card.classList.toggle('is-flipped', flipped === true);
        });
        if (flipAllButton) {
          flipAllButton.setAttribute('aria-pressed', flipped === true ? 'true' : 'false');
          flipAllButton.textContent = flipped === true ? '↺ SHOW FRONTS' : '🃏 FLIP ALL';
        }
      };

      const closeExpanded = () => {
        if (!expandedShell || !compactButton) return;
        expandedShell.classList.remove('is-open');
        expandedShell.setAttribute('aria-hidden', 'true');
        compactButton.setAttribute('aria-expanded', 'false');
        if (finalContainer) finalContainer.classList.remove('squad-open');
        if (squadStage) squadStage.classList.remove('expanded');
        setFlipAllState(false);
      };

      const openExpanded = () => {
        if (!expandedShell || !compactButton) return;
        expandedShell.classList.add('is-open');
        expandedShell.setAttribute('aria-hidden', 'false');
        compactButton.setAttribute('aria-expanded', 'true');
        if (finalContainer) finalContainer.classList.add('squad-open');
        if (squadStage) squadStage.classList.add('expanded');
      };

      if (compactButton) {
        compactButton.addEventListener('click', openExpanded);
      }
      if (closeButton) {
        closeButton.addEventListener('click', closeExpanded);
      }

      if (flipAllButton) {
        flipAllButton.addEventListener('click', () => {
          const shouldFlip = flipAllButton.getAttribute('aria-pressed') !== 'true';
          setFlipAllState(shouldFlip);
        });
      }

      if (flipCards && flipCards.length) {
        flipCards.forEach((card) => {
          card.addEventListener('click', () => {
            card.classList.toggle('is-flipped');
            if (flipAllButton) {
              const allFlipped = Array.from(flipCards).every((tile) => tile.classList.contains('is-flipped'));
              flipAllButton.setAttribute('aria-pressed', allFlipped ? 'true' : 'false');
              flipAllButton.textContent = allFlipped ? '↺ SHOW FRONTS' : '🃏 FLIP ALL';
            }
          });
          card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              card.classList.toggle('is-flipped');
              if (flipAllButton) {
                const allFlipped = Array.from(flipCards).every((tile) => tile.classList.contains('is-flipped'));
                flipAllButton.setAttribute('aria-pressed', allFlipped ? 'true' : 'false');
                flipAllButton.textContent = allFlipped ? '↺ SHOW FRONTS' : '🃏 FLIP ALL';
              }
            }
          });
        });
      }
    } else {
      winnerGallery.innerHTML = '';
    }
  }

  const final = document.getElementById('finalLeaderboard');
  final.innerHTML = '';

  data.finalLeaderboard.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-entry final-entry';
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[idx] || '•';
    const emoji = idx === 0 ? '👑 CHAMPION' : idx === 1 ? '⭐ RUNNER-UP' : '🌟 TOP 3';
    const breakdown = entry.breakdown.map((pts, round) => `R${round + 1}: ${pts}`).join(' | ');
    li.innerHTML = `
      <div class="final-entry-content">
        <div class="final-entry-header">
          <span class="medal">${medal}</span>
          <span class="name">${entry.name}</span>
          <span class="score">${entry.score}pts</span>
          <span class="emoji">${emoji}</span>
        </div>
        <div class="final-entry-detail">${breakdown}</div>
      </div>
    `;
    final.appendChild(li);
  });

  showScreen('finalScreen');
  showToast('🎉 Game Over! Check the results!', 'info');
});

function sendPlayAgain() {
  socket.emit('playAgain');
  showToast('Starting new game with same players...', 'info');
}

function goToLobby() {
  if (confirm('Are you sure? This will return to the lobby.')) {
    clearTimers();
    audioState.hasPlayedLobbyEntry = false;
    resetAllState();
    socket.disconnect();
    socket.connect();
    showScreen('join');
    document.getElementById('name').value = '';
    document.getElementById('room').value = '';
  }
}

// ========================
// INITIALIZATION
// ========================
window.addEventListener('beforeunload', () => {
  socket.disconnect();
});

installAudioUnlockHandlers();
setupAudioControls();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audioState.unlocked) {
    ensureAudioRunning();
    applyAudioLevels();
  }
});

// Expose UI actions used by inline handlers
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.showHelp = showHelp;
window.closeHelp = closeHelp;
window.switchLobbyTab = switchLobbyTab;
window.toggleAccordion = toggleAccordion;
window.toggleScenario = toggleScenario;
window.toggleResultsDetails = toggleResultsDetails;
window.toggleReady = toggleReady;
window.updateSetting = updateSetting;
window.sendMessage = sendMessage;
window.sendReaction = sendReaction;
window.sendStartGame = sendStartGame;
window.submitDraft = submitDraft;
window.lockDraft = lockDraft;
window.lockVote = lockVote;
window.readyForNextRound = readyForNextRound;
window.sendPlayAgain = sendPlayAgain;
window.goToLobby = goToLobby;

if (shouldAutoOpenRound4Loading()) {
  window.setTimeout(() => {
    openRound4LoadingDebugView();
  }, 0);
}
