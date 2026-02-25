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
  document.addEventListener('screenChanged', (event) => {
    const screenId = event && event.detail ? event.detail.screenId : '';
    if (screenId === 'lobby' && getActiveLobbyTabName() === 'chat') {
      resetChatTabPing();
    }
    if (screenId !== 'scenarioScreen') {
      resetDraftWaitIntelPreview({ hide: true, statusText: 'Checking cached evaluator prep...' });
    }
  });
  document.addEventListener('lobbyTabChanged', (event) => {
    const tabName = event && event.detail ? event.detail.tabName : '';
    if (tabName === 'chat') {
      resetChatTabPing();
      renderChatMessages({ forceBottom: true });
    }
  });
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
const AUDIO_PREFS_KEY = 'lobbywars_audio_prefs_v2';
const AUDIO_CATEGORY_KEYS = ['music', 'sfx', 'reveal', 'card'];
const AUDIO_CATEGORY_DEFAULTS = {
  music: { enabled: true, volume: 0.42 },
  sfx: { enabled: true, volume: 0.9 },
  reveal: { enabled: true, volume: 0.88 },
  card: { enabled: true, volume: 0.92 }
};
const audioState = {
  unlocked: false,
  htmlMediaUnlocked: false,
  managedHtmlMediaPrimed: false,
  masterGain: null,
  sfxGain: null,
  musicGain: null,
  revealGain: null,
  cardGain: null,
  muted: false,
  masterVolume: 0.9,
  sfxVolume: AUDIO_CATEGORY_DEFAULTS.sfx.volume,
  musicVolume: AUDIO_CATEGORY_DEFAULTS.music.volume,
  revealVolume: AUDIO_CATEGORY_DEFAULTS.reveal.volume,
  cardVolume: AUDIO_CATEGORY_DEFAULTS.card.volume,
  sfxEnabled: AUDIO_CATEGORY_DEFAULTS.sfx.enabled,
  musicEnabled: AUDIO_CATEGORY_DEFAULTS.music.enabled,
  revealEnabled: AUDIO_CATEGORY_DEFAULTS.reveal.enabled,
  cardEnabled: AUDIO_CATEGORY_DEFAULTS.card.enabled,
  currentMusicScene: 'join',
  currentScreenScene: 'join',
  musicLoopToken: 0,
  musicLoopTimer: null,
  musicPreviewTimer: null,
  musicPreviewActive: false,
  musicPreviewRestoreScene: '',
  musicPreviewRestoreMusicEnabled: null,
  musicPreviewStatusText: '',
  musicPreviewStatusTone: '',
  musicDecks: [],
  musicActiveDeckIndex: -1,
  musicTransitionToken: 0,
  musicFadeRaf: null,
  musicTransitionState: null,
  musicSceneRequestSeq: 0,
  musicCurrentTrackUrl: '',
  musicCurrentSceneSpec: null,
  lastMusicSceneLogSig: '',
  previewSceneSelection: 'join',
  quickPanelOpen: false,
  audioDeckExpanded: false,
  quickPanelHandlersBound: false,
  globalAudioHandlersBound: false,
  quickFabDotDismissed: false,
  lastCardBlurbAt: 0,
  lastCardBlurbSig: '',
  lastFinaleAutoplaySig: '',
  lastFinaleNoAudioToastSig: '',
  cardClipProbeCache: new Map(),
  cardClipStats: null,
  cardClipStatsPromise: null,
  cardClipStatsFetchedAt: 0,
  cardClipLibrarySignature: '',
  cardClipResolverApiAvailable: null,
  cardClipResolverApiRetryAt: 0,
  cardClipIndex: null,
  cardClipIndexPromise: null,
  cardSnippetManifest: null,
  cardSnippetManifestPromise: null,
  cardSnippetMatchCache: new Map(),
  cardSnippetBatchMetaCache: new Map(),
  cardClipPrefetchQueue: [],
  cardClipPrefetchQueuedKeys: new Set(),
  cardClipPrefetchDrainTimer: null,
  cardClipPrefetchInFlight: false,
  cardClipPrefetchLastLogAt: 0,
  cardClipWarmUrlCache: new Set(),
  cardClipWarmQueue: [],
  cardClipWarmQueuedUrls: new Set(),
  cardClipWarmActive: 0,
  cardClipWarmers: [],
  mediaUrlProbeCache: new Map(),
  cardPlaybackElement: null,
  cardPlaybackGainScalar: 1,
  cardPlaybackStopTimer: null,
  cardPlaybackToken: 0,
  cardSpeechToken: 0,
  speechVoices: [],
  speechVoicesLoaded: false,
  speechVoicesLoading: false,
  htmlUnlockElement: null,
  lastManagedMediaPlayErrorSig: '',
  lastManagedMediaPlayErrorAt: 0,
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

const chatPingState = {
  unreadCount: 0,
  roomCode: '',
  lastMessageTs: 0
};

const draftWaitIntelPreviewState = {
  pollTimer: null,
  pollStopAtMs: 0,
  receivedRound: null,
  requestRound: null
};

function clampAudioLevel(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function clampAudioPan(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-1, Math.min(1, numeric));
}

function clampAudioRate(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.5, Math.min(2.5, numeric));
}

function hashAudioSeed(input = '') {
  const text = String(input || '');
  let hash = 0;
  for (let idx = 0; idx < text.length; idx += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(idx);
    hash |= 0;
  }
  return Math.abs(hash >>> 0);
}

function writeAsciiToView(view, offset, text) {
  for (let idx = 0; idx < text.length; idx += 1) {
    view.setUint8(offset + idx, text.charCodeAt(idx));
  }
}

function encodeAudioPathSegment(filename = '') {
  return String(filename || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function buildSilentWavDataUri(durationMs = 90) {
  try {
    const sampleRate = 8000;
    const sampleCount = Math.max(1, Math.round((Math.max(10, Number(durationMs) || 90) / 1000) * sampleRate));
    const dataSize = sampleCount;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeAsciiToView(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAsciiToView(view, 8, 'WAVE');
    writeAsciiToView(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    writeAsciiToView(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    for (let idx = 0; idx < dataSize; idx += 1) {
      view.setUint8(44 + idx, 128);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let idx = 0; idx < bytes.length; idx += 1) {
      binary += String.fromCharCode(bytes[idx]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  } catch (error) {
    return '';
  }
}

function getAudioCategoryMeta(category = 'sfx') {
  const key = String(category || 'sfx').toLowerCase();
  if (key === 'music') return { enabledKey: 'musicEnabled', volumeKey: 'musicVolume', gainKey: 'musicGain', label: 'Music' };
  if (key === 'reveal') return { enabledKey: 'revealEnabled', volumeKey: 'revealVolume', gainKey: 'revealGain', label: 'Reveal' };
  if (key === 'card' || key === 'cards' || key === 'blurb' || key === 'voice') return { enabledKey: 'cardEnabled', volumeKey: 'cardVolume', gainKey: 'cardGain', label: 'Cards' };
  return { enabledKey: 'sfxEnabled', volumeKey: 'sfxVolume', gainKey: 'sfxGain', label: 'UI' };
}

function setAudioButtonPressed(button, pressed, labels = null) {
  if (!button) return;
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  if (labels && labels.on && labels.off) {
    button.textContent = pressed ? labels.on : labels.off;
  }
}

function getAudioStatusText() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return 'Audio unavailable in this browser';
  if (!audioState.unlocked) return 'Tap any audio control to unlock audio on iOS/mobile';
  if (!audioState.htmlMediaUnlocked) return 'Audio unlocked, but HTML media may still need one tap (iOS)';
  if (audioState.muted) return 'Muted (master)';

  const enabled = AUDIO_CATEGORY_KEYS.filter((key) => audioState[`${key}Enabled`] === true)
    .map((key) => (key === 'sfx' ? 'UI' : (key === 'card' ? 'Cards' : key[0].toUpperCase() + key.slice(1))));
  if (!enabled.length) return 'All categories disabled';
  return `Ready • ${enabled.join(' / ')}`;
}

function setAudioPreviewStatus(text = '', tone = '') {
  audioState.musicPreviewStatusText = String(text || '').trim();
  audioState.musicPreviewStatusTone = String(tone || '').trim().toLowerCase();
  syncAudioControlUI();
}

function loadAudioPreferences() {
  try {
    const raw = window.localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    audioState.muted = parsed.muted === true;
    audioState.masterVolume = clampAudioLevel(parsed.masterVolume, 0.9);
    const legacySfxVolume = clampAudioLevel(parsed.sfxVolume, AUDIO_CATEGORY_DEFAULTS.sfx.volume);
    audioState.sfxVolume = clampAudioLevel(parsed.sfxVolume, legacySfxVolume);
    audioState.musicVolume = clampAudioLevel(parsed.musicVolume, AUDIO_CATEGORY_DEFAULTS.music.volume);
    audioState.revealVolume = clampAudioLevel(parsed.revealVolume, legacySfxVolume);
    audioState.cardVolume = clampAudioLevel(parsed.cardVolume, legacySfxVolume);

    audioState.sfxEnabled = parsed.sfxEnabled !== false;
    audioState.musicEnabled = parsed.musicEnabled !== false;
    audioState.revealEnabled = parsed.revealEnabled !== false;
    audioState.cardEnabled = parsed.cardEnabled !== false;
    audioState.quickFabDotDismissed = parsed.quickFabDotDismissed === true;
    // Always start compact/collapsed; expanded state should not persist between sessions.
    audioState.audioDeckExpanded = false;
    if (parsed.previewSceneSelection) {
      audioState.previewSceneSelection = resolveMusicSceneKey(String(parsed.previewSceneSelection));
    }
  } catch (error) {
    console.log('Audio preferences unavailable');
  }
}

function saveAudioPreferences() {
  try {
    window.localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify({
      muted: audioState.muted,
      masterVolume: audioState.masterVolume,
      sfxVolume: audioState.sfxVolume,
      musicVolume: audioState.musicVolume,
      revealVolume: audioState.revealVolume,
      cardVolume: audioState.cardVolume,
      sfxEnabled: audioState.sfxEnabled,
      musicEnabled: audioState.musicEnabled,
      revealEnabled: audioState.revealEnabled,
      cardEnabled: audioState.cardEnabled,
      quickFabDotDismissed: audioState.quickFabDotDismissed === true,
      previewSceneSelection: resolveMusicSceneKey(audioState.previewSceneSelection || 'join')
    }));
  } catch (error) {
    console.log('Unable to save audio preferences');
  }
}

function syncAudioControlUI() {
  const legacyMuteBtn = document.getElementById('audioToggleMute');
  if (legacyMuteBtn) {
    legacyMuteBtn.textContent = audioState.muted ? 'Audio: Off' : 'Audio: On';
    legacyMuteBtn.setAttribute('aria-pressed', audioState.muted ? 'true' : 'false');
    legacyMuteBtn.setAttribute('aria-label', audioState.muted ? 'Unmute sound effects' : 'Mute sound effects');
  }

  setAudioButtonPressed(document.getElementById('audioMasterMuteBtn'), !audioState.muted, {
    on: 'All Audio: On',
    off: 'All Audio: Off'
  });

  setAudioButtonPressed(document.getElementById('audioMusicToggle'), audioState.musicEnabled, { on: 'On', off: 'Off' });
  setAudioButtonPressed(document.getElementById('audioUiToggle'), audioState.sfxEnabled, { on: 'On', off: 'Off' });
  setAudioButtonPressed(document.getElementById('audioRevealToggle'), audioState.revealEnabled, { on: 'On', off: 'Off' });
  setAudioButtonPressed(document.getElementById('audioCardToggle'), audioState.cardEnabled, { on: 'On', off: 'Off' });

  setAudioButtonPressed(document.getElementById('audioQuickMusicToggleBtn'), audioState.musicEnabled, {
    on: 'Music On',
    off: 'Music Off'
  });

  const statusText = getAudioStatusText();
  const unlockStatus = document.getElementById('audioUnlockStatus');
  if (unlockStatus) {
    unlockStatus.textContent = statusText;
    unlockStatus.classList.toggle('is-warning', !audioState.unlocked);
    unlockStatus.classList.toggle('is-ready', audioState.unlocked && !audioState.muted);
  }
  const quickStatus = document.getElementById('audioQuickPanelStatus');
  if (quickStatus) quickStatus.textContent = statusText;

  const deck = document.querySelector('.audio-control-deck');
  const deckBody = document.getElementById('audioControlDeckBody');
  const deckToggleBtn = document.getElementById('audioDeckToggleBtn');
  if (deck) {
    deck.classList.toggle('is-collapsed', !audioState.audioDeckExpanded);
  }
  if (deckBody) {
    deckBody.hidden = !audioState.audioDeckExpanded;
  }
  if (deckToggleBtn) {
    deckToggleBtn.setAttribute('aria-expanded', audioState.audioDeckExpanded ? 'true' : 'false');
    deckToggleBtn.setAttribute('aria-label', audioState.audioDeckExpanded ? 'Collapse audio controls' : 'Expand audio controls');
    deckToggleBtn.textContent = audioState.audioDeckExpanded ? 'v' : '>';
  }

  const quickFab = document.getElementById('audioQuickFab');
  const quickFabState = document.getElementById('audioQuickFabState');
  if (quickFab) {
    quickFab.classList.toggle('is-muted', audioState.muted);
    quickFab.classList.toggle('dot-dismissed', audioState.quickFabDotDismissed === true);
    quickFab.setAttribute('aria-expanded', audioState.quickPanelOpen ? 'true' : 'false');
  }
  if (quickFabState) {
    if (audioState.muted) {
      quickFabState.textContent = 'OFF';
    } else if (!audioState.musicEnabled) {
      quickFabState.textContent = 'MUSIC OFF';
    } else {
      quickFabState.textContent = 'ON';
    }
  }

  const panel = document.getElementById('audioQuickPanel');
  if (panel) {
    panel.hidden = !audioState.quickPanelOpen;
  }

  [
    ['audioMasterVolume', 'audioMasterVolumeValue', audioState.masterVolume],
    ['audioMusicVolume', 'audioMusicVolumeValue', audioState.musicVolume],
    ['audioUiVolume', 'audioUiVolumeValue', audioState.sfxVolume],
    ['audioRevealVolume', 'audioRevealVolumeValue', audioState.revealVolume],
    ['audioCardVolume', 'audioCardVolumeValue', audioState.cardVolume]
  ].forEach(([inputId, valueId, numeric]) => {
    const input = document.getElementById(inputId);
    const valueEl = document.getElementById(valueId);
    const percent = Math.round(clampAudioLevel(numeric, 0) * 100);
    if (input && document.activeElement !== input) input.value = String(percent);
    if (valueEl) valueEl.textContent = `${percent}%`;
  });

  const quickMusicVolume = document.getElementById('audioQuickMusicVolume');
  if (quickMusicVolume && document.activeElement !== quickMusicVolume) {
    quickMusicVolume.value = String(Math.round(clampAudioLevel(audioState.musicVolume, 0) * 100));
  }

  const previewSelect = document.getElementById('audioPreviewSceneSelect');
  const previewSelection = resolveMusicSceneKey(audioState.previewSceneSelection || audioState.currentScreenScene || audioState.currentMusicScene || 'join');
  if (previewSelect && document.activeElement !== previewSelect && previewSelect.value !== previewSelection) {
    previewSelect.value = previewSelection;
  }

  const previewStatus = document.getElementById('audioPreviewSceneStatus');
  if (previewStatus) {
    previewStatus.textContent = audioState.musicPreviewStatusText || 'Preview mode temporarily overrides live music, then restores the active scene.';
    previewStatus.classList.toggle('is-warning', audioState.musicPreviewStatusTone === 'warning');
    previewStatus.classList.toggle('is-active', audioState.musicPreviewActive === true);
  }
}

function applyAudioLevels() {
  if (audioState.masterGain) {
    audioState.masterGain.gain.value = audioState.muted ? 0 : audioState.masterVolume;
  }
  if (audioState.sfxGain) {
    audioState.sfxGain.gain.value = audioState.sfxEnabled ? audioState.sfxVolume : 0;
  }
  if (audioState.musicGain) {
    audioState.musicGain.gain.value = audioState.musicEnabled ? audioState.musicVolume : 0;
  }
  if (audioState.revealGain) {
    audioState.revealGain.gain.value = audioState.revealEnabled ? audioState.revealVolume : 0;
  }
  if (audioState.cardGain) {
    audioState.cardGain.gain.value = audioState.cardEnabled ? audioState.cardVolume : 0;
  }

  syncManagedMediaAudioLevels();
  syncAudioControlUI();
}

function setAudioMuted(nextMuted, { persist = true } = {}) {
  audioState.muted = nextMuted === true;
  applyAudioLevels();
  syncMusicLoopState();
  if (persist) saveAudioPreferences();
}

function setMasterAudioVolume(value, { persist = true } = {}) {
  audioState.masterVolume = clampAudioLevel(value, 0.9);
  applyAudioLevels();
  if (persist) saveAudioPreferences();
}

function setAudioCategoryEnabled(category, enabled, { persist = true } = {}) {
  const meta = getAudioCategoryMeta(category);
  audioState[meta.enabledKey] = enabled === true;
  applyAudioLevels();
  if (meta.gainKey === 'musicGain') {
    syncMusicLoopState();
  }
  if (persist) saveAudioPreferences();
}

function toggleAudioCategory(category) {
  const meta = getAudioCategoryMeta(category);
  setAudioCategoryEnabled(category, !Boolean(audioState[meta.enabledKey]));
}

function setAudioCategoryVolume(category, value, { persist = true } = {}) {
  const meta = getAudioCategoryMeta(category);
  const fallbackKey = meta.gainKey === 'musicGain' ? 'music'
    : meta.gainKey === 'revealGain' ? 'reveal'
      : meta.gainKey === 'cardGain' ? 'card'
        : 'sfx';
  audioState[meta.volumeKey] = clampAudioLevel(value, AUDIO_CATEGORY_DEFAULTS[fallbackKey].volume);
  applyAudioLevels();
  if (meta.gainKey === 'musicGain') {
    syncMusicLoopState();
  }
  if (persist) saveAudioPreferences();
}

function setAudioQuickPanelOpen(open) {
  audioState.quickPanelOpen = open === true;
  syncAudioControlUI();
}

function setAudioControlDeckExpanded(open) {
  audioState.audioDeckExpanded = open === true;
  syncAudioControlUI();
}

const AUDIO_MUSIC_SCENE_DEFS = {
  join: {
    label: 'Join',
    files: ['DeepUrbanHouse - Join.mp3'],
    baseGain: 0.22,
    playbackRate: 1,
    transitionInMs: 2200,
    transitionOutMs: 1600
  },
  lobby: {
    label: 'Lobby',
    files: ['HipHop - Lobby.mp3'],
    baseGain: 0.84,
    playbackRate: 1,
    transitionInMs: 1350,
    transitionOutMs: 1000
  },
  entry: {
    label: 'Entry',
    files: ["Can't Get You Off My Mind - Entry.mp3"],
    baseGain: 0.4,
    playbackRate: 1,
    transitionInMs: 1500,
    transitionOutMs: 1200
  },
  voting: {
    label: 'Voting',
    files: ["Can't Get You Off My Mind - Entry.mp3"],
    baseGain: 0.48,
    playbackRate: 1.65,
    transitionInMs: 850,
    transitionOutMs: 750
  },
  ceremony: {
    label: 'Ceremony',
    files: ['Complicated - Ceremony.mp3'],
    baseGain: 0.8,
    playbackRate: 1,
    transitionInMs: 6400,
    transitionOutMs: 2000,
    transitionInCurve: 'easeOutQuint',
    transitionOutCurve: 'easeInCubic'
  },
  round4Bg: {
    label: 'Round 4 Background',
    files: ['GamesWorldbeat - Round4BG.mp3'],
    baseGain: 0.46,
    playbackRate: 1,
    transitionInMs: 1800,
    transitionOutMs: 1100
  }
};

const AUDIO_MUSIC_SCENE_ALIASES = {
  draft: 'entry',
  scenario: 'entry',
  twist: 'entry',
  results: 'entry',
  round4Reveal: 'ceremony',
  finale: 'ceremony',
  round4bg: 'round4Bg',
  round4_bg: 'round4Bg'
};

function createManagedAudioElement(kind = 'audio') {
  const el = new Audio();
  el.preload = 'auto';
  el.loop = false;
  el.playsInline = true;
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  el.setAttribute('data-managed-audio-kind', kind);
  return el;
}

function ensureMusicDecks() {
  if (Array.isArray(audioState.musicDecks) && audioState.musicDecks.length >= 2) return audioState.musicDecks;
  audioState.musicDecks = [0, 1].map((index) => {
    const el = createManagedAudioElement('music');
    el.loop = true;
    el.volume = 0;
    return {
      index,
      el,
      sceneKey: '',
      sourceUrl: '',
      currentGain: 0,
      targetGain: 0,
      playbackRate: 1,
      isPrimary: false
    };
  });
  return audioState.musicDecks;
}

function resolveMusicSceneKey(sceneKey = '') {
  const raw = String(sceneKey || '').trim();
  if (!raw) return 'lobby';
  if (AUDIO_MUSIC_SCENE_DEFS[raw]) return raw;
  const lowered = raw.toLowerCase();
  if (AUDIO_MUSIC_SCENE_DEFS[lowered]) return lowered;
  if (AUDIO_MUSIC_SCENE_ALIASES[raw]) return AUDIO_MUSIC_SCENE_ALIASES[raw];
  if (AUDIO_MUSIC_SCENE_ALIASES[lowered]) return AUDIO_MUSIC_SCENE_ALIASES[lowered];
  return 'lobby';
}

function getMusicSceneSpec(sceneKey = '') {
  const key = resolveMusicSceneKey(sceneKey);
  return { key, ...(AUDIO_MUSIC_SCENE_DEFS[key] || AUDIO_MUSIC_SCENE_DEFS.lobby) };
}

function getManagedMusicMasterScalar() {
  if (!audioState.unlocked || document.hidden || audioState.muted || !audioState.musicEnabled) {
    return 0;
  }
  return clampAudioLevel(audioState.masterVolume, 0.9) * clampAudioLevel(audioState.musicVolume, AUDIO_CATEGORY_DEFAULTS.music.volume);
}

function safePlayManagedAudioElement(el) {
  if (!el) return;
  try {
    try {
      if (el.muted) el.muted = false;
    } catch (muteError) {
    }
    const result = el.play();
    if (result && typeof result.catch === 'function') {
      result.catch((error) => {
        try {
          const kind = String(el.getAttribute && el.getAttribute('data-managed-audio-kind') || 'audio');
          const src = String(el.currentSrc || el.src || '').replace(window.location.origin, '');
          const errName = String(error && error.name || 'Error');
          const errMsg = String(error && error.message || '').trim();
          const sig = `${kind}|${src}|${errName}|${errMsg}`;
          const now = Date.now();
          if (audioState.lastManagedMediaPlayErrorSig !== sig || (now - audioState.lastManagedMediaPlayErrorAt) > 3500) {
            audioState.lastManagedMediaPlayErrorSig = sig;
            audioState.lastManagedMediaPlayErrorAt = now;
            console.warn(`[audio] managed play blocked (${kind}) ${errName}${errMsg ? `: ${errMsg}` : ''} src=${src || 'n/a'}`);
          }
        } catch (logError) {
        }
      });
    }
  } catch (error) {
  }
}

function safePauseManagedAudioElement(el) {
  if (!el) return;
  try {
    el.pause();
  } catch (error) {
  }
}

function syncManagedMediaAudioLevels() {
  const musicScalar = getManagedMusicMasterScalar();
  ensureMusicDecks().forEach((deck) => {
    if (!deck || !deck.el) return;
    const effective = Math.max(0, Math.min(1, musicScalar * clampAudioLevel(deck.currentGain, 0)));
    try {
      deck.el.volume = effective;
    } catch (error) {
    }

    if (effective <= 0.0008) {
      if (deck.el && !deck.el.paused) safePauseManagedAudioElement(deck.el);
    } else if (deck.sourceUrl && deck.el && deck.el.paused) {
      safePlayManagedAudioElement(deck.el);
    }
  });

  if (audioState.cardPlaybackElement) {
    try {
      const cardScalar = (audioState.unlocked && !audioState.muted && audioState.cardEnabled)
        ? (clampAudioLevel(audioState.masterVolume, 0.9) * clampAudioLevel(audioState.cardVolume, AUDIO_CATEGORY_DEFAULTS.card.volume))
        : 0;
      const clipGain = clampAudioLevel(audioState.cardPlaybackGainScalar, 1);
      audioState.cardPlaybackElement.volume = Math.max(0, Math.min(1, cardScalar * clipGain));
    } catch (error) {
    }
  }
}

function getMusicFadeCurveValue(progress, curve = 'easeInOutSine') {
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  if (curve === 'linear') return t;
  if (curve === 'easeInCubic') return t * t * t;
  if (curve === 'easeOutCubic') return 1 - ((1 - t) ** 3);
  if (curve === 'easeOutQuint') return 1 - ((1 - t) ** 5);
  if (curve === 'easeInOutQuad') return t < 0.5 ? (2 * t * t) : (1 - ((-2 * t + 2) ** 2) / 2);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function cancelMusicFadeAnimation() {
  audioState.musicTransitionToken += 1;
  if (audioState.musicFadeRaf) {
    window.cancelAnimationFrame(audioState.musicFadeRaf);
    audioState.musicFadeRaf = null;
  }
  audioState.musicTransitionState = null;
}

function enforceMusicDeckExclusivity(keepIndexes = []) {
  const keep = new Set((Array.isArray(keepIndexes) ? keepIndexes : [keepIndexes])
    .filter((idx) => Number.isFinite(idx))
    .map((idx) => Number(idx)));

  let changed = false;
  ensureMusicDecks().forEach((deck) => {
    if (!deck) return;
    if (keep.has(deck.index)) return;
    if ((deck.currentGain || 0) > 0) changed = true;
    deck.currentGain = 0;
    deck.targetGain = 0;
    safePauseManagedAudioElement(deck.el);
  });
  if (changed) {
    syncManagedMediaAudioLevels();
  }
}

function stepMusicFadeAnimation() {
  const state = audioState.musicTransitionState;
  if (!state) return;
  if (state.token !== audioState.musicTransitionToken) return;

  const now = performance.now();
  const elapsed = now - state.startedAt;
  let done = true;

  if (state.outDeck) {
    const outElapsed = Math.max(0, elapsed - state.outDelayMs);
    const outDuration = Math.max(1, state.outDurationMs);
    const outProgress = Math.max(0, Math.min(1, outElapsed / outDuration));
    const outCurve = getMusicFadeCurveValue(outProgress, state.outCurve);
    state.outDeck.currentGain = Math.max(0, state.outStartGain * (1 - outCurve));
    if (outProgress < 1) done = false;
  }

  if (state.inDeck) {
    const inElapsed = Math.max(0, elapsed - state.inDelayMs);
    const inDuration = Math.max(1, state.inDurationMs);
    const inProgress = Math.max(0, Math.min(1, inElapsed / inDuration));
    const inCurve = getMusicFadeCurveValue(inProgress, state.inCurve);
    state.inDeck.currentGain = state.inStartGain + ((state.inTargetGain - state.inStartGain) * inCurve);
    if (inProgress < 1) done = false;
  }

  syncManagedMediaAudioLevels();

  if (done) {
    if (state.outDeck && state.outDeck.el) {
      state.outDeck.currentGain = 0;
      safePauseManagedAudioElement(state.outDeck.el);
    }
    if (state.inDeck) {
      state.inDeck.currentGain = state.inTargetGain;
    }
    enforceMusicDeckExclusivity(state.inDeck ? [state.inDeck.index] : []);
    syncManagedMediaAudioLevels();
    audioState.musicFadeRaf = null;
    audioState.musicTransitionState = null;
    return;
  }

  audioState.musicFadeRaf = window.requestAnimationFrame(stepMusicFadeAnimation);
}

function beginMusicCrossfade({ inDeck = null, outDeck = null, inTargetGain = 0, inStartGain = 0, inDelayMs = 0, inDurationMs = 1200, inCurve = 'easeInOutSine', outDelayMs = 0, outDurationMs = 1000, outCurve = 'easeOutCubic' } = {}) {
  cancelMusicFadeAnimation();
  const token = ++audioState.musicTransitionToken;
  audioState.musicTransitionState = {
    token,
    startedAt: performance.now(),
    inDeck,
    outDeck,
    inTargetGain: clampAudioLevel(inTargetGain, 0),
    inStartGain: clampAudioLevel(inStartGain, 0),
    inDelayMs: Math.max(0, Number(inDelayMs) || 0),
    inDurationMs: Math.max(1, Number(inDurationMs) || 1),
    inCurve: String(inCurve || 'easeInOutSine'),
    outStartGain: clampAudioLevel(outDeck && outDeck.currentGain, 0),
    outDelayMs: Math.max(0, Number(outDelayMs) || 0),
    outDurationMs: Math.max(1, Number(outDurationMs) || 1),
    outCurve: String(outCurve || 'easeOutCubic')
  };

  if (inDeck) {
    inDeck.currentGain = clampAudioLevel(inStartGain, 0);
  }
  syncManagedMediaAudioLevels();
  audioState.musicFadeRaf = window.requestAnimationFrame(stepMusicFadeAnimation);
}

function stopAllMusicDecks() {
  ensureMusicDecks().forEach((deck) => {
    if (!deck) return;
    deck.currentGain = 0;
    deck.targetGain = 0;
    safePauseManagedAudioElement(deck.el);
  });
  syncManagedMediaAudioLevels();
}

function stopMusicLoop() {
  audioState.musicLoopToken += 1;
  if (audioState.musicLoopTimer) {
    window.clearTimeout(audioState.musicLoopTimer);
    audioState.musicLoopTimer = null;
  }
  cancelMusicFadeAnimation();
  stopAllMusicDecks();
}

async function probeManagedMediaUrl(url = '') {
  const key = String(url || '').trim();
  if (!key) return false;
  if (audioState.mediaUrlProbeCache.has(key)) {
    return audioState.mediaUrlProbeCache.get(key);
  }

  const pending = (async () => {
    try {
      const response = await fetch(key, { method: 'HEAD', cache: 'force-cache' });
      if (response && (response.ok || response.status === 304)) return true;
    } catch (error) {
    }
    return false;
  })();

  audioState.mediaUrlProbeCache.set(key, pending);
  return pending;
}

function resolveMusicSceneSourceUrl(sceneSpec) {
  const spec = sceneSpec && typeof sceneSpec === 'object' ? sceneSpec : getMusicSceneSpec('lobby');
  const candidates = Array.isArray(spec.files) ? spec.files : [];
  const urls = candidates
    .map((filename) => `/audio/${encodeAudioPathSegment(filename)}`)
    .filter(Boolean);
  if (!urls.length) return '';
  return urls[0];
}

function getMusicTransitionProfile(fromSceneKey, toSceneKey, options = {}) {
  const fromKey = resolveMusicSceneKey(fromSceneKey);
  const toKey = resolveMusicSceneKey(toSceneKey);
  const explicit = String(options && options.transition || '').trim().toLowerCase();

  let profile = {
    inDelayMs: 0,
    inDurationMs: 1200,
    inCurve: 'easeInOutSine',
    inStartGain: 0,
    outDelayMs: 0,
    outDurationMs: 1000,
    outCurve: 'easeOutCubic'
  };

  const targetSpec = AUDIO_MUSIC_SCENE_DEFS[toKey] || AUDIO_MUSIC_SCENE_DEFS.lobby;
  const sourceSpec = AUDIO_MUSIC_SCENE_DEFS[fromKey] || null;
  if (targetSpec) {
    profile.inDurationMs = Math.max(profile.inDurationMs, Number(targetSpec.transitionInMs) || profile.inDurationMs);
    if (targetSpec.transitionInCurve) profile.inCurve = targetSpec.transitionInCurve;
  }
  if (sourceSpec) {
    profile.outDurationMs = Math.max(profile.outDurationMs, Number(sourceSpec.transitionOutMs) || profile.outDurationMs);
    if (sourceSpec.transitionOutCurve) profile.outCurve = sourceSpec.transitionOutCurve;
  }

  if (toKey === 'ceremony' || explicit === 'crescendo') {
    profile.inStartGain = 0.03;
    profile.inDurationMs = Math.max(profile.inDurationMs, 5200);
    profile.inCurve = 'easeOutQuint';
    profile.outDurationMs = Math.min(Math.max(profile.outDurationMs, 850), 1200);
    profile.outCurve = 'easeInCubic';
  }

  if ((fromKey === 'ceremony' && toKey === 'round4Bg') || explicit === 'ceremony-to-round4' || explicit === 'decrescendo') {
    profile.outDurationMs = Math.max(profile.outDurationMs, 2400);
    profile.outCurve = 'easeInCubic';
    profile.inDelayMs = Math.max(profile.inDelayMs, 420);
    profile.inStartGain = 0;
    profile.inDurationMs = Math.max(profile.inDurationMs, 1800);
    profile.inCurve = 'easeInOutQuad';
  }

  if (explicit === 'fast') {
    profile.inDurationMs = 450;
    profile.outDurationMs = 400;
    profile.inDelayMs = 0;
  }

  if (explicit === 'preview') {
    profile.inDurationMs = 700;
    profile.outDurationMs = 520;
    profile.inDelayMs = 0;
    profile.outDelayMs = 0;
    profile.inCurve = 'easeInOutQuad';
    profile.outCurve = 'easeOutCubic';
  }

  return profile;
}

async function playMusicSceneInternal(sceneKey, options = {}) {
  const spec = getMusicSceneSpec(sceneKey);
  const requestSeq = ++audioState.musicSceneRequestSeq;

  if (!audioState.unlocked || audioState.muted || !audioState.musicEnabled || document.hidden) {
    syncManagedMediaAudioLevels();
    return false;
  }

  const decks = ensureMusicDecks();
  const activeDeck = Number.isFinite(audioState.musicActiveDeckIndex) && audioState.musicActiveDeckIndex >= 0
    ? decks[audioState.musicActiveDeckIndex]
    : null;
  const sourceUrl = resolveMusicSceneSourceUrl(spec);
  if (requestSeq !== audioState.musicSceneRequestSeq) return false;
  if (!sourceUrl) return false;

  const sameScene = activeDeck && activeDeck.sceneKey === spec.key;
  const sameSource = activeDeck && activeDeck.sourceUrl === sourceUrl;
  const targetGain = clampAudioLevel(spec.baseGain, 0.75);
  const nextRate = clampAudioRate(spec.playbackRate, 1);

  if (activeDeck && sameSource) {
    activeDeck.sceneKey = spec.key;
    activeDeck.targetGain = targetGain;
    activeDeck.playbackRate = nextRate;
    try {
      activeDeck.el.playbackRate = nextRate;
    } catch (error) {
    }
    enforceMusicDeckExclusivity([activeDeck.index]);
    beginMusicCrossfade({
      inDeck: activeDeck,
      outDeck: null,
      inTargetGain: targetGain,
      inStartGain: clampAudioLevel(activeDeck.currentGain, 0),
      inDurationMs: sameScene ? 650 : 900,
      inCurve: 'easeInOutSine',
      outDurationMs: 1
    });
    audioState.musicCurrentTrackUrl = sourceUrl;
    audioState.musicCurrentSceneSpec = spec;
    const sameSceneLogSig = `${spec.key}|${sourceUrl}|${nextRate}|${targetGain}|refresh`;
    if (audioState.lastMusicSceneLogSig !== sameSceneLogSig) {
      audioState.lastMusicSceneLogSig = sameSceneLogSig;
      console.info(`[audio] music scene active scene=${spec.key} track=${sourceUrl} gain=${targetGain.toFixed(2)} rate=${nextRate}`);
    }
    return true;
  }

  const nextDeck = decks.find((deck) => !activeDeck || deck.index !== activeDeck.index) || decks[0];
  nextDeck.sceneKey = spec.key;
  nextDeck.sourceUrl = sourceUrl;
  nextDeck.targetGain = targetGain;
  nextDeck.playbackRate = nextRate;
  nextDeck.isPrimary = true;

  const shouldResetTime = !activeDeck || activeDeck.sourceUrl !== sourceUrl || options.force === true;
  try {
    if (nextDeck.el.src !== `${window.location.origin}${sourceUrl}` && nextDeck.el.src !== sourceUrl) {
      nextDeck.el.src = sourceUrl;
      try {
        nextDeck.el.load();
      } catch (loadError) {
      }
    }
  } catch (error) {
    nextDeck.el.src = sourceUrl;
    try {
      nextDeck.el.load();
    } catch (loadError) {
    }
  }
  nextDeck.el.loop = true;
  nextDeck.el.preload = 'auto';
  try {
    nextDeck.el.playbackRate = nextRate;
  } catch (error) {
  }

  if (!shouldResetTime && activeDeck && activeDeck.el && Number.isFinite(activeDeck.el.currentTime)) {
    try {
      nextDeck.el.currentTime = Math.max(0, Number(activeDeck.el.currentTime) || 0);
    } catch (error) {
    }
  } else {
    try {
      nextDeck.el.currentTime = 0;
    } catch (error) {
    }
  }

  safePlayManagedAudioElement(nextDeck.el);
  audioState.musicActiveDeckIndex = nextDeck.index;
  audioState.musicCurrentTrackUrl = sourceUrl;
  audioState.musicCurrentSceneSpec = spec;
  const startLogSig = `${spec.key}|${sourceUrl}|${nextRate}|${targetGain}|deck:${nextDeck.index}`;
  if (audioState.lastMusicSceneLogSig !== startLogSig) {
    audioState.lastMusicSceneLogSig = startLogSig;
    console.info(`[audio] music scene start scene=${spec.key} deck=${nextDeck.index} track=${sourceUrl} gain=${targetGain.toFixed(2)} rate=${nextRate}`);
  }

  const transition = getMusicTransitionProfile(activeDeck && activeDeck.sceneKey, spec.key, options);
  if (options && options.exclusive === true) {
    enforceMusicDeckExclusivity([activeDeck ? activeDeck.index : NaN, nextDeck.index]);
  } else {
    enforceMusicDeckExclusivity([activeDeck ? activeDeck.index : NaN, nextDeck.index]);
  }
  beginMusicCrossfade({
    inDeck: nextDeck,
    outDeck: activeDeck || null,
    inTargetGain: targetGain,
    inStartGain: transition.inStartGain,
    inDelayMs: transition.inDelayMs,
    inDurationMs: transition.inDurationMs,
    inCurve: transition.inCurve,
    outDelayMs: transition.outDelayMs,
    outDurationMs: transition.outDurationMs,
    outCurve: transition.outCurve
  });

  return true;
}

function syncMusicLoopState(options = {}) {
  if (!audioState.currentMusicScene) {
    cancelMusicFadeAnimation();
    stopAllMusicDecks();
    return;
  }

  if (!audioState.unlocked || audioState.muted || !audioState.musicEnabled || document.hidden) {
    cancelMusicFadeAnimation();
    syncManagedMediaAudioLevels();
    return;
  }

  ensureAudioRunning();
  if (!audioState.htmlMediaUnlocked) {
    tryUnlockHtmlMediaStack();
  }
  void playMusicSceneInternal(audioState.currentMusicScene, options);
}

function stopMusicScenePreview({ restore = true } = {}) {
  if (audioState.musicPreviewTimer) {
    window.clearTimeout(audioState.musicPreviewTimer);
    audioState.musicPreviewTimer = null;
  }

  const wasActive = audioState.musicPreviewActive === true;
  audioState.musicPreviewActive = false;

  if (typeof audioState.musicPreviewRestoreMusicEnabled === 'boolean') {
    audioState.musicEnabled = audioState.musicPreviewRestoreMusicEnabled;
  }

  if (restore) {
    const restoreScene = audioState.musicPreviewRestoreScene || audioState.currentScreenScene || 'lobby';
    audioState.currentMusicScene = resolveMusicSceneKey(restoreScene);
    syncMusicLoopState({ force: true, transition: 'fast', exclusive: true });
  }

  audioState.musicPreviewRestoreScene = '';
  audioState.musicPreviewRestoreMusicEnabled = null;
  if (wasActive) {
    setAudioPreviewStatus('Preview ended. Live scene music is restored.', 'info');
  }
}

function previewMusicScene(sceneKey, options = {}) {
  const selectedKey = resolveMusicSceneKey(sceneKey);
  const durationMs = Math.max(1200, Number(options && options.previewMs) || 6500);
  audioState.previewSceneSelection = selectedKey;
  saveAudioPreferences();

  stopMusicScenePreview({ restore: false });
  audioState.musicPreviewActive = true;
  audioState.musicPreviewRestoreScene = resolveMusicSceneKey(audioState.currentScreenScene || audioState.currentMusicScene || 'lobby');
  audioState.musicPreviewRestoreMusicEnabled = audioState.musicEnabled === true;
  if (!audioState.musicEnabled) {
    audioState.musicEnabled = true;
  }

  // Kill any in-flight crossfade and stale deck before preview so only one scene is audible.
  cancelMusicFadeAnimation();
  stopAllMusicDecks();

  audioState.currentMusicScene = selectedKey;
  setAudioPreviewStatus(`Previewing ${getMusicSceneSpec(selectedKey).label}. Live music is temporarily paused${audioState.musicPreviewRestoreMusicEnabled ? '' : ' and Music was auto-enabled for this test'}.`, 'warning');
  syncAudioControlUI();
  syncMusicLoopState({ force: true, transition: 'preview', exclusive: true });

  audioState.musicPreviewTimer = window.setTimeout(() => {
    audioState.musicPreviewTimer = null;
    stopMusicScenePreview({ restore: true });
  }, durationMs);
}

function setMusicScene(sceneKey, options = {}) {
  const nextKey = resolveMusicSceneKey(sceneKey);
  const force = options && options.force === true;
  const persist = options && options.persist === true;
  const previousScreenScene = resolveMusicSceneKey(audioState.currentScreenScene || 'lobby');

  if (force || audioState.currentMusicScene !== nextKey) {
    audioState.currentMusicScene = nextKey;
    if (persist) saveAudioPreferences();
  }
  syncAudioControlUI();
  syncMusicLoopState(options);
  if (!audioState.musicPreviewActive && !audioState.musicPreviewTimer && previousScreenScene === nextKey) {
    setAudioPreviewStatus('', '');
  }
}

function mapScreenToMusicScene(screenId) {
  const id = String(screenId || '');
  if (id === 'join' || id === 'tutorial') return 'join';
  if (id === 'lobby') return 'lobby';
  if (id === 'preRound') return 'entry';
  if (id === 'scenarioScreen') return 'entry';
  if (id === 'twistScreen') return 'entry';
  if (id === 'votingScreen') return 'voting';
  if (id === 'resultsScreen') return 'entry';
  if (id === 'round4EvalScreen') return 'ceremony';
  if (id === 'finalScreen') return 'ceremony';
  return 'lobby';
}

function runAudioMixSelfTest() {
  playMessageSound();
  window.setTimeout(() => playRound4RevealAccent({ audioMode: 'accent' }, 'launch'), 80);
  window.setTimeout(() => playRound4RevealAccent({ audioMode: 'intense' }, 'impact'), 260);
  window.setTimeout(() => playCharacterCardBlurb({ character: 'Audio Test', ovr: 88, rarity: 'Epic' }, { context: 'test' }), 420);
}

function setupAudioControls() {
  if (audioState.controlsInitialized) return;

  const ensureUnlockedByControlGesture = () => {
    unlockAudioFromGesture({ type: 'audio-control' });
  };

  const toggleMasterMute = () => {
    ensureUnlockedByControlGesture();
    setAudioMuted(!audioState.muted);
  };

  const legacyMute = document.getElementById('audioToggleMute');
  if (legacyMute) {
    legacyMute.addEventListener('click', toggleMasterMute);
  }

  const masterMuteBtn = document.getElementById('audioMasterMuteBtn');
  if (masterMuteBtn) {
    masterMuteBtn.addEventListener('click', toggleMasterMute);
  }

  const deckToggleBtn = document.getElementById('audioDeckToggleBtn');
  if (deckToggleBtn) {
    deckToggleBtn.addEventListener('click', () => {
      ensureUnlockedByControlGesture();
      setAudioControlDeckExpanded(!audioState.audioDeckExpanded);
    });
  }

  const bindSlider = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    const onInput = () => handler((Number(el.value) || 0) / 100);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
  };

  bindSlider('audioMasterVolume', (value) => setMasterAudioVolume(value));
  bindSlider('audioMusicVolume', (value) => setAudioCategoryVolume('music', value));
  bindSlider('audioUiVolume', (value) => setAudioCategoryVolume('sfx', value));
  bindSlider('audioRevealVolume', (value) => setAudioCategoryVolume('reveal', value));
  bindSlider('audioCardVolume', (value) => setAudioCategoryVolume('card', value));
  bindSlider('audioQuickMusicVolume', (value) => setAudioCategoryVolume('music', value));

  const bindToggleBtn = (id, category) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      ensureUnlockedByControlGesture();
      toggleAudioCategory(category);
    });
  };

  bindToggleBtn('audioMusicToggle', 'music');
  bindToggleBtn('audioUiToggle', 'sfx');
  bindToggleBtn('audioRevealToggle', 'reveal');
  bindToggleBtn('audioCardToggle', 'card');
  bindToggleBtn('audioQuickMusicToggleBtn', 'music');

  const previewSceneBtn = document.getElementById('audioPreviewSceneBtn');
  const previewSceneSelect = document.getElementById('audioPreviewSceneSelect');
  if (previewSceneBtn && previewSceneSelect) {
    previewSceneSelect.addEventListener('change', () => {
      audioState.previewSceneSelection = resolveMusicSceneKey(previewSceneSelect.value || 'join');
      saveAudioPreferences();
      syncAudioControlUI();
    });
    previewSceneBtn.addEventListener('click', () => {
      ensureUnlockedByControlGesture();
      previewMusicScene(previewSceneSelect.value || 'join', { previewMs: 6200 });
      playMessageSound();
    });
  }

  const testMixBtn = document.getElementById('audioTestSoundscapeBtn');
  if (testMixBtn) {
    testMixBtn.addEventListener('click', () => {
      ensureUnlockedByControlGesture();
      runAudioMixSelfTest();
    });
  }

  const quickFab = document.getElementById('audioQuickFab');
  if (quickFab) {
    quickFab.addEventListener('click', () => {
      ensureUnlockedByControlGesture();
      if (!audioState.quickFabDotDismissed) {
        audioState.quickFabDotDismissed = true;
        saveAudioPreferences();
      }
      setAudioQuickPanelOpen(!audioState.quickPanelOpen);
    });
  }

  const quickClose = document.getElementById('audioQuickCloseBtn');
  if (quickClose) {
    quickClose.addEventListener('click', () => setAudioQuickPanelOpen(false));
  }

  if (!audioState.globalAudioHandlersBound) {
    audioState.globalAudioHandlersBound = true;

    document.addEventListener('screenChanged', (event) => {
      const screenId = event && event.detail ? event.detail.screenId : '';
      const scene = mapScreenToMusicScene(screenId);
      audioState.currentScreenScene = scene;
      if (audioState.musicPreviewActive) {
        stopMusicScenePreview({ restore: false });
      }
      if (!audioState.musicPreviewTimer && !audioState.musicPreviewActive) {
        setMusicScene(scene, { force: true });
      }
      if (screenId !== 'lobby') {
        setAudioQuickPanelOpen(false);
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (!audioState.quickPanelOpen) return;
      const panel = document.getElementById('audioQuickPanel');
      const fab = document.getElementById('audioQuickFab');
      const target = event.target;
      if (!panel || !fab) return;
      if (panel.contains(target) || fab.contains(target)) return;
      setAudioQuickPanelOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && audioState.quickPanelOpen) {
        setAudioQuickPanelOpen(false);
      }
    });

    window.addEventListener('pageshow', () => {
      if (audioState.unlocked) {
        ensureAudioRunning();
        applyAudioLevels();
        syncMusicLoopState();
      }
    });
  }

  audioState.controlsInitialized = true;
  applyAudioLevels();
  syncMusicLoopState();
  ensureSpeechVoicesLoadedSoon();
  // Warm clip metadata so the server-side resolver and status UI are ready before Round 4.
  void loadCardSnippetManifest();
  void loadCardClipStats();
}

const startupBootstrapState = {
  started: false,
  completed: false,
  total: 0,
  done: 0
};

function updateStartupBootstrapUi(done = 0, total = 0, label = '') {
  const panel = document.getElementById('startupBootstrapPanel');
  const status = document.getElementById('startupBootstrapStatus');
  const fill = document.getElementById('startupBootstrapFill');
  const count = document.getElementById('startupBootstrapCount');
  const bar = document.querySelector('#startupBootstrapPanel .startup-bootstrap-bar');
  if (!panel) return;

  const safeTotal = Math.max(1, Number(total) || 1);
  const safeDone = Math.max(0, Math.min(safeTotal, Number(done) || 0));
  const pct = Math.round((safeDone / safeTotal) * 100);

  panel.hidden = false;
  panel.classList.toggle('is-done', safeDone >= safeTotal);
  if (status) status.textContent = label || (safeDone >= safeTotal ? 'Startup ready. Join anytime.' : 'Warming local game services...');
  if (fill) fill.style.width = `${pct}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(pct));
  if (count) count.textContent = `${safeDone}/${safeTotal}`;
}

function hideStartupBootstrapUiSoon() {
  const panel = document.getElementById('startupBootstrapPanel');
  if (!panel) return;
  window.setTimeout(() => {
    panel.hidden = true;
  }, 900);
}

function seedAudioSceneFromActiveScreen({ syncUi = false } = {}) {
  const activeScreen = document.querySelector('.screen.active');
  const activeScreenId = activeScreen && activeScreen.id ? String(activeScreen.id) : 'join';
  const scene = resolveMusicSceneKey(mapScreenToMusicScene(activeScreenId));
  audioState.currentScreenScene = scene;
  audioState.currentMusicScene = scene;
  if (!audioState.previewSceneSelection) {
    audioState.previewSceneSelection = scene;
  }
  if (syncUi) syncAudioControlUI();
}

async function runStartupBootstrapPreflight() {
  if (startupBootstrapState.started) return;
  startupBootstrapState.started = true;

  const taskList = [
    {
      label: 'Pack catalog',
      run: async () => fetch('/api/packs', { cache: 'force-cache' }).then((r) => r && r.ok ? r.json() : null)
    },
    {
      label: 'Pack metrics',
      run: async () => fetch('/api/packs/metrics', { cache: 'force-cache' }).then((r) => r && r.ok ? r.json() : null)
    },
    {
      label: 'Clip manifest',
      run: async () => loadCardSnippetManifest()
    },
    {
      label: 'Clip resolver',
      run: async () => loadCardClipStats().then((stats) => {
        const total = Number(stats && (stats.totalResolvableSources || stats.indexedClipCount)) || 0;
        setAudioPreviewStatus(total > 0
          ? `Clip library indexed (${total} local clips ready).`
          : 'Clip library is empty right now. Add quote clips to audio/clips/ for OVR/finale blurbs.', total > 0 ? 'info' : 'warning');
        return stats;
      })
    },
    {
      label: 'Join track',
      run: async () => probeManagedMediaUrl(`/audio/${encodeAudioPathSegment('DeepUrbanHouse - Join.mp3')}`)
    },
    {
      label: 'Lobby track',
      run: async () => probeManagedMediaUrl(`/audio/${encodeAudioPathSegment('HipHop - Lobby.mp3')}`)
    }
  ];

  startupBootstrapState.total = taskList.length;
  startupBootstrapState.done = 0;
  updateStartupBootstrapUi(0, taskList.length, 'Starting quick preflight...');

  await Promise.allSettled(taskList.map(async (task) => {
    try {
      await task.run();
    } catch (error) {
    } finally {
      startupBootstrapState.done += 1;
      updateStartupBootstrapUi(startupBootstrapState.done, taskList.length, startupBootstrapState.done >= taskList.length
        ? 'Startup ready. Join screen is warm.'
        : `Warming ${task.label}...`);
    }
  }));

  startupBootstrapState.completed = true;
  hideStartupBootstrapUiSoon();
}

loadAudioPreferences();
seedAudioSceneFromActiveScreen();
publishGlobalAudioBridge();

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
  audioState.musicGain = ctx.createGain();
  audioState.revealGain = ctx.createGain();
  audioState.cardGain = ctx.createGain();

  audioState.masterGain.gain.value = audioState.muted ? 0 : audioState.masterVolume;
  audioState.sfxGain.gain.value = audioState.sfxEnabled ? audioState.sfxVolume : 0;
  audioState.musicGain.gain.value = audioState.musicEnabled ? audioState.musicVolume : 0;
  audioState.revealGain.gain.value = audioState.revealEnabled ? audioState.revealVolume : 0;
  audioState.cardGain.gain.value = audioState.cardEnabled ? audioState.cardVolume : 0;

  audioState.sfxGain.connect(audioState.masterGain);
  audioState.musicGain.connect(audioState.masterGain);
  audioState.revealGain.connect(audioState.masterGain);
  audioState.cardGain.connect(audioState.masterGain);
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

function getAudioBusGain(bus = 'sfx') {
  const meta = getAudioCategoryMeta(bus);
  return audioState[meta.gainKey] || audioState.sfxGain || null;
}

function scheduleTone({
  frequency = 440,
  frequencyEnd = null,
  duration = 120,
  type = 'sine',
  volume = 0.2,
  attack = 0.008,
  release = 0.09,
  when = null,
  retryOnResume = true,
  bus = 'sfx',
  pan = 0
} = {}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  initializeAudioGraph();

  if (ctx.state !== 'running') {
    if (!retryOnResume) return;
    ctx.resume().then(() => {
      scheduleTone({
        frequency,
        frequencyEnd,
        duration,
        type,
        volume,
        attack,
        release,
        when,
        retryOnResume: false,
        bus,
        pan
      });
    }).catch(() => {});
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const targetGain = getAudioBusGain(bus);
  let tailNode = gain;
  osc.connect(gain);
  if (typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = clampAudioPan(pan);
    gain.connect(panner);
    tailNode = panner;
  }
  if (targetGain) {
    tailNode.connect(targetGain);
  } else {
    tailNode.connect(ctx.destination);
  }

  const startAt = Math.max(ctx.currentTime + 0.002, Number(when) || ctx.currentTime);
  const lengthSec = Math.max(0.03, duration / 1000);
  const attackSec = Math.max(0.003, attack);
  const releaseSec = Math.max(0.03, release);
  const peak = Math.max(0.0001, volume);

  osc.frequency.setValueAtTime(Math.max(20, Number(frequency) || 440), startAt);
  osc.type = type;
  if (Number.isFinite(Number(frequencyEnd)) && Number(frequencyEnd) > 20) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, Number(frequencyEnd)), startAt + Math.max(0.02, lengthSec * 0.92));
  }

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + attackSec);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + lengthSec + releaseSec);

  osc.start(startAt);
  osc.stop(startAt + lengthSec + releaseSec + 0.01);
}

function playSound(frequency = 800, duration = 100, type = 'sine', volume = 0.3) {
  scheduleTone({ frequency, duration, type, volume, bus: 'sfx' });
}

function runNoteSequence(sequence = [], stepMs = 70, options = {}) {
  if (!Array.isArray(sequence) || !sequence.length) return;
  const defaultBus = options && options.bus ? options.bus : 'sfx';
  const baseDelayMs = Math.max(0, Number(options && options.baseDelayMs) || 0);
  sequence.forEach((note, idx) => {
    const at = baseDelayMs + (idx * stepMs);
    window.setTimeout(() => {
      scheduleTone({
        frequency: note.frequency,
        frequencyEnd: note.frequencyEnd,
        duration: note.duration,
        type: note.type,
        volume: note.volume,
        attack: note.attack,
        release: note.release,
        bus: note.bus || defaultBus,
        pan: note.pan
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
  ], 130, { bus: 'reveal' });
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
  ], 110, { bus: 'reveal' });
}

function playTwistSound() {
  runNoteSequence([
    { frequency: 220, duration: 80, type: 'square', volume: 0.13 },
    { frequency: 293.7, duration: 70, type: 'square', volume: 0.13 },
    { frequency: 196, duration: 120, type: 'sawtooth', volume: 0.13 },
    { frequency: 370, duration: 140, type: 'triangle', volume: 0.12 }
  ], 75, { bus: 'reveal' });
}

function playCountdownTick(secondValue) {
  const sec = Number(secondValue);
  if (sec <= 1) {
    scheduleTone({ frequency: 880, duration: 140, type: 'square', volume: 0.15, bus: 'reveal' });
    return;
  }
  scheduleTone({ frequency: 660, duration: 80, type: 'square', volume: 0.13, bus: 'reveal' });
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
  scheduleTone({ frequency, duration: 52, type: 'triangle', volume: 0.085, bus: 'reveal' });
}

function playFetchCompleteSound(success = true) {
  if (success === false) {
    scheduleTone({ frequency: 250, duration: 60, type: 'sawtooth', volume: 0.095, bus: 'reveal' });
    return;
  }
  runNoteSequence([
    { frequency: 700, duration: 50, type: 'sine', volume: 0.095 },
    { frequency: 820, duration: 65, type: 'triangle', volume: 0.095 }
  ], 40, { bus: 'reveal' });
}

function getHtmlUnlockAudioElement() {
  if (audioState.htmlUnlockElement) return audioState.htmlUnlockElement;
  try {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = false;
    el.muted = true;
    el.volume = 0;
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    const dataUri = buildSilentWavDataUri(110);
    if (dataUri) el.src = dataUri;
    audioState.htmlUnlockElement = el;
    return el;
  } catch (error) {
    return null;
  }
}

function shouldWarmManagedMediaForIos() {
  try {
    const ua = String(navigator.userAgent || '');
    const platform = String(navigator.platform || '');
    const touchPoints = Number(navigator.maxTouchPoints) || 0;
    const isIPhoneIPadIPod = /iphone|ipad|ipod/i.test(ua);
    const isIPadDesktopMode = /MacIntel/i.test(platform) && touchPoints > 1;
    return isIPhoneIPadIPod || isIPadDesktopMode;
  } catch (error) {
    return false;
  }
}

function tryUnlockHtmlMediaStack() {
  if (audioState.htmlMediaUnlocked) return;
  const media = getHtmlUnlockAudioElement();
  if (!media) return;
  try {
    const result = media.play();
    if (result && typeof result.then === 'function') {
      result.then(() => {
        audioState.htmlMediaUnlocked = true;
        media.pause();
        media.currentTime = 0;
        primeManagedHtmlAudioElementsForUnlock({ force: true });
        syncAudioControlUI();
        syncMusicLoopState({ transition: 'fast' });
        maybeCleanupAudioUnlockHandlers();
      }).catch(() => {});
      return;
    }
    audioState.htmlMediaUnlocked = true;
    media.pause();
    media.currentTime = 0;
    primeManagedHtmlAudioElementsForUnlock({ force: true });
    syncAudioControlUI();
    syncMusicLoopState({ transition: 'fast' });
    maybeCleanupAudioUnlockHandlers();
  } catch (error) {
  }
}

function warmupManagedMediaElementForIos(el) {
  if (!el) return;
  try {
    const warmupToken = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    el.__iosWarmupToken = warmupToken;
    const originalSrc = el.src || '';
    const originalMuted = el.muted;
    const originalVolume = el.volume;
    const originalLoop = el.loop;
    const dataUri = buildSilentWavDataUri(70);
    if (!dataUri) return;
    let restored = false;
    let restoreTimer = null;
    const restoreElement = () => {
      if (restored) return;
      restored = true;
      try {
        if (restoreTimer) {
          window.clearTimeout(restoreTimer);
          restoreTimer = null;
        }
      } catch (timerError) {
      }
      const currentSrc = String(el.src || '');
      const stillWarmupSrc = currentSrc.startsWith('data:audio/');
      if (!stillWarmupSrc) {
        // The element was repurposed for real playback before warmup completed.
        // Do not pause/reset/restore stale values or we can kill active music.
        return;
      }
      try {
        if (el.__iosWarmupToken !== warmupToken) return;
        el.pause();
      } catch (pauseError) {
      }
      try {
        if (el.__iosWarmupToken !== warmupToken) return;
        el.currentTime = 0;
      } catch (timeError) {
      }
      try {
        if (el.__iosWarmupToken !== warmupToken) return;
        el.src = originalSrc;
        el.loop = originalLoop;
        el.muted = originalMuted;
        el.volume = originalVolume;
        if (el.__iosWarmupToken === warmupToken) {
          el.__iosWarmupToken = '';
        }
      } catch (restoreError) {
      }
    };

    el.loop = false;
    el.muted = true;
    el.volume = 0;
    el.src = dataUri;
    restoreTimer = window.setTimeout(restoreElement, 900);
    const maybe = el.play();
    if (maybe && typeof maybe.then === 'function') {
      maybe.then(() => {
        try {
          restoreElement();
        } catch (error) {
        }
      }).catch(() => {
        restoreElement();
      });
      return;
    }
    restoreElement();
  } catch (error) {
  }
}

function primeManagedHtmlAudioElementsForUnlock(options = {}) {
  if (!shouldWarmManagedMediaForIos()) return;
  const force = options && options.force === true;
  const markPrimed = !(options && options.markPrimed === false);
  if (audioState.managedHtmlMediaPrimed && !force) return;
  if (markPrimed) {
    audioState.managedHtmlMediaPrimed = true;
  }
  try {
    ensureMusicDecks().forEach((deck) => {
      if (deck && deck.el) warmupManagedMediaElementForIos(deck.el);
    });
  } catch (error) {
  }
  try {
    const cardEl = ensureCardPlaybackElement();
    if (cardEl) warmupManagedMediaElementForIos(cardEl);
  } catch (error) {
  }
}

function maybeCleanupAudioUnlockHandlers() {
  if (!audioState.unlocked || !audioState.htmlMediaUnlocked) return;
  if (typeof audioState.listenerCleanup === 'function') {
    audioState.listenerCleanup();
    audioState.listenerCleanup = null;
  }
}

function unlockAudioFromGesture(event = null) {
  const ctx = getAudioContext();
  if (!ctx) return;

  initializeAudioGraph();
  tryUnlockHtmlMediaStack();
  // iOS often requires warming each actual HTMLAudio element in the same gesture.
  primeManagedHtmlAudioElementsForUnlock({ markPrimed: false });
  const onUnlock = () => {
    audioState.unlocked = true;
    applyAudioLevels();
    scheduleTone({ frequency: 220, duration: 20, type: 'sine', volume: 0.0002, bus: 'sfx' });
    primeManagedHtmlAudioElementsForUnlock({ markPrimed: false });
    syncMusicLoopState();
    maybeCleanupAudioUnlockHandlers();
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
    ['mousedown', unlockAudioFromGesture, { capture: true }],
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

function playRound4RevealAccent(profile = null, stage = 'impact') {
  const mode = String(profile && profile.audioMode ? profile.audioMode : 'none');
  if (mode === 'none') return;

  if (stage === 'launch') {
    const peak = mode === 'elite' ? 0.075 : mode === 'intense' ? 0.06 : 0.048;
    scheduleTone({
      frequency: mode === 'accent' ? 220 : 170,
      frequencyEnd: mode === 'accent' ? 520 : 690,
      duration: 420,
      type: mode === 'elite' ? 'sawtooth' : 'triangle',
      volume: peak,
      attack: 0.02,
      release: 0.12,
      bus: 'reveal'
    });
    return;
  }

  const impactPeak = mode === 'elite' ? 0.13 : mode === 'intense' ? 0.105 : 0.075;
  scheduleTone({
    frequency: mode === 'accent' ? 170 : 130,
    frequencyEnd: mode === 'accent' ? 84 : 46,
    duration: 240,
    type: mode === 'elite' ? 'triangle' : 'sine',
    volume: impactPeak,
    attack: 0.01,
    release: 0.09,
    bus: 'reveal'
  });
  if (mode !== 'accent') {
    scheduleTone({
      frequency: mode === 'elite' ? 920 : 740,
      frequencyEnd: mode === 'elite' ? 620 : 520,
      duration: 100,
      type: 'square',
      volume: mode === 'elite' ? 0.05 : 0.038,
      attack: 0.004,
      release: 0.05,
      bus: 'reveal',
      pan: 0.18
    });
  }
}

function normalizeCharacterAudioMeta(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const scoreMeta = source.scoreMeta && typeof source.scoreMeta === 'object' ? source.scoreMeta : {};
  const infoConfidence = Number(scoreMeta.infoConfidence);
  const resolverConfidence = Number(scoreMeta.resolverConfidence);
  const rawAliases = []
    .concat(Array.isArray(scoreMeta.aliases) ? scoreMeta.aliases : [])
    .concat(Array.isArray(source.aliases) ? source.aliases : [])
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return {
    character: String(source.character || source.name || source.topPick || 'Unknown').trim() || 'Unknown',
    ownerName: String(source.ownerName || source.playerName || source.owner || '').trim(),
    rarity: String(source.rarity || source.rarityLabel || '').trim(),
    ovr: Math.max(0, Math.min(99, Number(source.ovr) || Number(source.finalOVR) || 0)),
    tier: String(source.ovrTierLabel || source.revealTier || source.tier || '').trim(),
    resolvedTitle: String(scoreMeta.resolvedTitle || source.resolvedTitle || '').trim(),
    resolvedSource: String(scoreMeta.resolvedSource || source.infoSource || '').trim(),
    infoConfidence: Number.isFinite(infoConfidence) ? Math.max(0, Math.min(1, infoConfidence)) : 0,
    resolverConfidence: Number.isFinite(resolverConfidence) ? Math.max(0, Math.min(1, resolverConfidence)) : 0,
    aliases: Array.from(new Set(rawAliases)).slice(0, 12)
  };
}

function buildCharacterAudioSignature(input = {}) {
  const meta = normalizeCharacterAudioMeta(input);
  return `${meta.character}|${meta.resolvedTitle}|${meta.ownerName}|${meta.ovr}|${meta.rarity}|${meta.tier}`;
}

const AUDIO_CARD_CLIP_DIRS = ['/audio/clips', '/audio/card-clips', '/audio'];
const AUDIO_CARD_CLIP_EXTS = ['mp3'];
const AUDIO_CARD_CLIP_INDEX_URL = '/api/audio-clips/index';
const AUDIO_CARD_CLIP_STATS_URL = '/api/audio-clips/stats';
const AUDIO_CARD_CLIP_RESOLVE_BATCH_URL = '/api/audio-clips/resolve-batch';
const AUDIO_CARD_BLURB_RESOLVE_BATCH_URL = '/api/audio-blurbs/resolve-batch';
const AUDIO_CARD_SNIPPET_MANIFEST_URL = '/audio/clips/manifest.json';
const AUDIO_CARD_NAME_ALIASES = {
  '007': ['007', 'james-bond'],
  spongebob: ['spongebob', 'spongebob-squarepants'],
  'the-flash': ['the-flash', 'flash'],
  'john-wick': ['john-wick', 'wick'],
  'kim-jung-un': ['kim-jung-un', 'kim-jong-un']
};

function ensureCardPlaybackElement() {
  if (audioState.cardPlaybackElement) return audioState.cardPlaybackElement;
  const el = createManagedAudioElement('card');
  el.loop = false;
  el.preload = 'auto';
  el.volume = 0;
  audioState.cardPlaybackElement = el;
  return el;
}

function clearCardPlaybackStopTimer() {
  if (audioState.cardPlaybackStopTimer) {
    window.clearTimeout(audioState.cardPlaybackStopTimer);
    audioState.cardPlaybackStopTimer = null;
  }
}

function sanitizeCardAudioSlug(text = '') {
  let normalized = String(text || '').trim();
  if (!normalized) return '';
  try {
    normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch (error) {
  }
  return normalized
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function getCardAudioCandidateSlugs(meta) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  const rawCandidates = [
    safeMeta.character,
    safeMeta.resolvedTitle,
    ...(Array.isArray(safeMeta.aliases) ? safeMeta.aliases : [])
  ];
  const slugs = new Set();
  const aliasHits = new Set();
  rawCandidates.filter(Boolean).forEach((candidate) => {
    const text = String(candidate).trim();
    if (!text) return;
    const base = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const noArticle = base.replace(/^(a|an|the)\s+/i, '').trim();
    [text, base, noArticle].forEach((variantText) => {
      const slug = sanitizeCardAudioSlug(variantText);
      if (!slug) return;
      slugs.add(slug);
      const aliases = AUDIO_CARD_NAME_ALIASES[slug] || [];
      aliases.forEach((alias) => aliasHits.add(sanitizeCardAudioSlug(alias)));
    });
  });
  aliasHits.forEach((slug) => {
    if (slug) slugs.add(slug);
  });
  return Array.from(slugs);
}

function buildCardAudioClipCandidateUrls(meta) {
  const slugs = getCardAudioCandidateSlugs(meta);
  const urls = [];
  slugs.forEach((slug) => {
    AUDIO_CARD_CLIP_DIRS.forEach((dir) => {
      AUDIO_CARD_CLIP_EXTS.forEach((ext) => {
        urls.push(`${dir}/${encodeAudioPathSegment(`${slug}.${ext}`)}`);
      });
    });
  });
  return urls;
}

async function resolveCharacterCardClipUrl(meta) {
  const key = `cardclip:${getCardAudioCandidateSlugs(meta).join('|') || 'unknown'}`;
  if (audioState.cardClipProbeCache.has(key)) {
    return audioState.cardClipProbeCache.get(key);
  }

  const pending = (async () => {
    const index = await loadCardClipIndex().catch(() => null);
    if (index && Array.isArray(index.clips) && index.clips.length === 0) {
      return '';
    }
    const candidates = buildCardAudioClipCandidateUrls(meta).slice(0, 8);
    for (let idx = 0; idx < candidates.length; idx += 1) {
      const url = candidates[idx];
      const exists = await probeManagedMediaUrl(url);
      if (exists) return url;
    }
    return '';
  })();

  audioState.cardClipProbeCache.set(key, pending);
  return pending;
}

function stopCardSpeechFallback() {
  audioState.cardSpeechToken += 1;
  try {
    if (window.speechSynthesis && typeof window.speechSynthesis.cancel === 'function') {
      window.speechSynthesis.cancel();
    }
  } catch (error) {
  }
}

function stopCardPlaybackElement() {
  clearCardPlaybackStopTimer();
  audioState.cardPlaybackGainScalar = 1;
  if (!audioState.cardPlaybackElement) return;
  safePauseManagedAudioElement(audioState.cardPlaybackElement);
  try {
    audioState.cardPlaybackElement.currentTime = 0;
  } catch (error) {
  }
}

async function loadCardSnippetManifest() {
  if (audioState.cardSnippetManifest) return audioState.cardSnippetManifest;
  if (audioState.cardSnippetManifestPromise) return audioState.cardSnippetManifestPromise;

  audioState.cardSnippetManifestPromise = (async () => {
    try {
      const response = await fetch(AUDIO_CARD_SNIPPET_MANIFEST_URL, { cache: 'no-cache' });
      if (!response || !response.ok) {
        audioState.cardSnippetManifest = { version: 1, clips: [] };
        return audioState.cardSnippetManifest;
      }
      const parsed = await response.json();
      const clips = Array.isArray(parsed && parsed.clips) ? parsed.clips : [];
      audioState.cardSnippetManifest = {
        version: Number(parsed && parsed.version) || 1,
        clips
      };
      return audioState.cardSnippetManifest;
    } catch (error) {
      audioState.cardSnippetManifest = { version: 1, clips: [] };
      return audioState.cardSnippetManifest;
    } finally {
      audioState.cardSnippetManifestPromise = null;
    }
  })();

  return audioState.cardSnippetManifestPromise;
}

async function loadCardClipStats() {
  if (audioState.cardClipStats) return audioState.cardClipStats;
  if (audioState.cardClipStatsPromise) return audioState.cardClipStatsPromise;

  const syncCardClipLibrarySignature = (statsObj = {}) => {
    const nextSig = String(statsObj && statsObj.librarySignature || '').trim();
    if (!nextSig) return;
    if (audioState.cardClipLibrarySignature && audioState.cardClipLibrarySignature !== nextSig) {
      audioState.cardSnippetMatchCache.clear();
      audioState.cardSnippetBatchMetaCache.clear();
      audioState.cardClipProbeCache.clear();
      audioState.cardClipWarmUrlCache.clear();
    }
    audioState.cardClipLibrarySignature = nextSig;
  };

  audioState.cardClipStatsPromise = (async () => {
    try {
      const response = await fetch(AUDIO_CARD_CLIP_STATS_URL, { cache: 'no-cache' });
      if (!response || !response.ok) {
        audioState.cardClipStats = {
          version: 1,
          indexedClipCount: 0,
          manifestClipCount: 0,
          totalResolvableSources: 0,
          libraryEmpty: true
        };
        return audioState.cardClipStats;
      }
      const parsed = await response.json();
      audioState.cardClipStats = {
        version: Number(parsed && parsed.version) || 1,
        indexedClipCount: Number(parsed && parsed.indexedClipCount) || 0,
        manifestClipCount: Number(parsed && parsed.manifestClipCount) || 0,
        totalResolvableSources: Number(parsed && parsed.totalResolvableSources) || 0,
        libraryEmpty: parsed && parsed.libraryEmpty === true,
        librarySignature: String(parsed && parsed.librarySignature || ''),
        generatedAt: String(parsed && parsed.generatedAt || '')
      };
      audioState.cardClipStatsFetchedAt = Date.now();
      syncCardClipLibrarySignature(audioState.cardClipStats);
      audioState.cardClipResolverApiAvailable = true;
      return audioState.cardClipStats;
    } catch (error) {
      audioState.cardClipResolverApiAvailable = false;
      audioState.cardClipResolverApiRetryAt = Date.now() + 12000;
      audioState.cardClipStats = {
        version: 1,
        indexedClipCount: 0,
        manifestClipCount: 0,
        totalResolvableSources: 0,
        libraryEmpty: true
      };
      audioState.cardClipStatsFetchedAt = Date.now();
      return audioState.cardClipStats;
    } finally {
      audioState.cardClipStatsPromise = null;
    }
  })();

  return audioState.cardClipStatsPromise;
}

function tokenizeCardAudioSearchText(value = '') {
  const slug = sanitizeCardAudioSlug(value);
  if (!slug) return [];
  return slug.split('-').filter((token) => token && token.length >= 2);
}

async function loadCardClipIndex() {
  if (audioState.cardClipIndex) return audioState.cardClipIndex;
  if (audioState.cardClipIndexPromise) return audioState.cardClipIndexPromise;

  audioState.cardClipIndexPromise = (async () => {
    try {
      const response = await fetch(AUDIO_CARD_CLIP_INDEX_URL, { cache: 'no-cache' });
      if (!response || !response.ok) {
        audioState.cardClipIndex = { version: 1, total: 0, clips: [] };
        return audioState.cardClipIndex;
      }
      const parsed = await response.json();
      const rawClips = Array.isArray(parsed && parsed.clips) ? parsed.clips : [];
      const clips = rawClips
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const url = String(entry.url || '').trim();
          const file = String(entry.file || '').trim();
          const slug = sanitizeCardAudioSlug(entry.slug || file || entry.label || '');
          const tokenSet = new Set();
          tokenizeCardAudioSearchText(entry.label || '').forEach((t) => tokenSet.add(t));
          tokenizeCardAudioSearchText(file).forEach((t) => tokenSet.add(t));
          (Array.isArray(entry.tokens) ? entry.tokens : []).forEach((t) => {
            tokenizeCardAudioSearchText(t).forEach((token) => tokenSet.add(token));
          });
          return {
            ...entry,
            url,
            file,
            slug,
            tokens: Array.from(tokenSet)
          };
        })
        .filter((entry) => entry.url && entry.slug);
      audioState.cardClipIndex = {
        version: Number(parsed && parsed.version) || 1,
        total: Number(parsed && parsed.total) || clips.length,
        clips
      };
      return audioState.cardClipIndex;
    } catch (error) {
      audioState.cardClipIndex = { version: 1, total: 0, clips: [] };
      return audioState.cardClipIndex;
    } finally {
      audioState.cardClipIndexPromise = null;
    }
  })();

  return audioState.cardClipIndexPromise;
}

function getCardSnippetCacheKey(meta = {}) {
  const slugs = getCardAudioCandidateSlugs(meta);
  const resolvedSlug = sanitizeCardAudioSlug(meta && meta.resolvedTitle ? meta.resolvedTitle : '');
  return `snippet:${slugs.join('|')}|${resolvedSlug}`;
}

function buildCardClipResolveBatchRequestEntry(meta = {}) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  return {
    character: String(safeMeta.character || '').trim(),
    resolvedTitle: String(safeMeta.resolvedTitle || '').trim(),
    aliases: Array.isArray(safeMeta.aliases) ? safeMeta.aliases.slice(0, 16) : [],
    infoConfidence: Number.isFinite(Number(safeMeta.infoConfidence)) ? Number(safeMeta.infoConfidence) : 0,
    resolverConfidence: Number.isFinite(Number(safeMeta.resolverConfidence)) ? Number(safeMeta.resolverConfidence) : 0,
    ovr: Number.isFinite(Number(safeMeta.ovr)) ? Number(safeMeta.ovr) : 0
  };
}

function cacheCardSnippetMatchResult(meta = {}, resolvedRow = null) {
  const cacheKey = getCardSnippetCacheKey(meta);
  let payload = null;
  let mode = 'miss';
  if (resolvedRow && resolvedRow.mode === 'library-empty') {
    payload = { __libraryEmpty: true };
    mode = 'library-empty';
  } else if (resolvedRow && resolvedRow.speech && typeof resolvedRow.speech === 'object') {
    payload = {
      __speechQuote: true,
      ...resolvedRow.speech
    };
    mode = String(resolvedRow.mode || 'speech-quote');
  } else if (resolvedRow && resolvedRow.snippet) {
    const snippet = normalizeSnippetSpec(resolvedRow.snippet, {
      durationSec: 1.35,
      playbackRate: 1,
      gain: 1
    });
    if (snippet) {
      payload = snippet;
      mode = String(resolvedRow.mode || snippet.source || 'snippet');
    }
  }
  audioState.cardSnippetMatchCache.set(cacheKey, Promise.resolve(payload));
  audioState.cardSnippetBatchMetaCache.set(cacheKey, {
    mode,
    source: resolvedRow && resolvedRow.matchSource ? String(resolvedRow.matchSource) : 'none',
    matchScore: Number(resolvedRow && resolvedRow.matchScore) || 0,
    updatedAt: Date.now()
  });
  return payload;
}

async function resolveCharacterCardSnippetsViaServerBatch(metaList = [], options = {}) {
  const metas = (Array.isArray(metaList) ? metaList : [])
    .map((meta) => normalizeCharacterAudioMeta(meta))
    .filter((meta) => meta && (meta.character || meta.resolvedTitle));
  if (!metas.length) return null;

  if (audioState.cardClipResolverApiAvailable === false && Date.now() < (audioState.cardClipResolverApiRetryAt || 0)) {
    return null;
  }

  const uniqueMetas = [];
  const seen = new Set();
  metas.forEach((meta) => {
    const key = getCardSnippetCacheKey(meta);
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueMetas.push(meta);
  });
  if (!uniqueMetas.length) return null;

  const requestEntries = uniqueMetas.map((meta) => buildCardClipResolveBatchRequestEntry(meta));

  let parsed = null;
  try {
    const response = await fetch(AUDIO_CARD_BLURB_RESOLVE_BATCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ entries: requestEntries })
    });
    if (!response || !response.ok) {
      throw new Error(`blurb-batch-${response ? response.status : 'fail'}`);
    }
    parsed = await response.json();
    audioState.cardClipResolverApiAvailable = true;
  } catch (error) {
    audioState.cardClipResolverApiAvailable = false;
    audioState.cardClipResolverApiRetryAt = Date.now() + 12000;
    return null;
  }

  const rows = Array.isArray(parsed && parsed.results) ? parsed.results : [];
  rows.forEach((row, index) => {
    const meta = uniqueMetas[index];
    if (!meta) return;
    cacheCardSnippetMatchResult(meta, row || null);
  });

  if (parsed && parsed.library && typeof parsed.library === 'object') {
    const mergedStats = {
      ...(audioState.cardClipStats || {}),
      ...parsed.library
    };
    audioState.cardClipStats = mergedStats;
    audioState.cardClipStatsFetchedAt = Date.now();
    const nextSig = String(mergedStats.librarySignature || '').trim();
    if (nextSig && audioState.cardClipLibrarySignature && audioState.cardClipLibrarySignature !== nextSig) {
      audioState.cardSnippetMatchCache.clear();
      audioState.cardSnippetBatchMetaCache.clear();
      audioState.cardClipProbeCache.clear();
      audioState.cardClipWarmUrlCache.clear();
    }
    if (nextSig) audioState.cardClipLibrarySignature = nextSig;
  }

  const shouldLog = options && options.log !== false;
  if (shouldLog) {
    const now = Date.now();
    if ((now - (audioState.cardClipPrefetchLastLogAt || 0)) > 1400) {
      audioState.cardClipPrefetchLastLogAt = now;
      const stats = parsed && parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {};
      console.info(
        `[audio blurbs] batch resolve requested=${Number(stats.requested) || uniqueMetas.length}` +
        ` clip=${Number(stats.audioClip) || 0}` +
        ` speechQ=${Number(stats.speechQuote) || 0}` +
        ` speechF=${Number(stats.speechFact) || 0}` +
        ` miss=${Number(stats.misses) || 0}` +
        ` empty=${Number(stats.libraryEmpty) || 0}` +
        ` ${parsed && parsed.cacheHit ? 'cache=hit ' : ''}` +
        `ms=${Number(stats.elapsedMs || stats.quoteFetchMsAvg) || 0}`
      );
    }
  }

  return {
    endpointOk: true,
    parsed,
    metas: uniqueMetas
  };
}

async function resolveCharacterCardSnippetViaServer(meta = {}) {
  const safeMeta = normalizeCharacterAudioMeta(meta);
  const result = await resolveCharacterCardSnippetsViaServerBatch([safeMeta], { log: false });
  if (!result || !result.endpointOk) {
    return { endpointOk: false, blurb: null, libraryEmpty: false };
  }
  const cacheKey = getCardSnippetCacheKey(safeMeta);
  const cached = audioState.cardSnippetMatchCache.get(cacheKey);
  if (cached && typeof cached.then === 'function') {
    const blurb = await cached;
    if (blurb && blurb.__libraryEmpty) {
      return { endpointOk: true, blurb: null, libraryEmpty: true };
    }
    return { endpointOk: true, blurb: blurb || null, libraryEmpty: false };
  }
  return { endpointOk: true, blurb: null, libraryEmpty: false };
}

function getCardAudioCandidateTokens(meta) {
  const values = []
    .concat(meta && meta.character ? meta.character : '')
    .concat(meta && meta.resolvedTitle ? meta.resolvedTitle : '')
    .concat(Array.isArray(meta && meta.aliases) ? meta.aliases : []);
  const tokenSet = new Set();
  values.forEach((value) => {
    tokenizeCardAudioSearchText(value).forEach((token) => tokenSet.add(token));
  });
  return Array.from(tokenSet);
}

function scoreIndexedCardClipCandidate(entry = {}, meta = {}) {
  const entrySlug = sanitizeCardAudioSlug(entry.slug || entry.file || entry.label || '');
  if (!entrySlug) return 0;

  const metaSlugs = getCardAudioCandidateSlugs(meta);
  if (!metaSlugs.length) return 0;
  const resolvedSlug = sanitizeCardAudioSlug(meta && meta.resolvedTitle ? meta.resolvedTitle : '');
  const characterSlug = sanitizeCardAudioSlug(meta && meta.character ? meta.character : '');
  const entryCharacterHintSlug = sanitizeCardAudioSlug(entry && entry.characterHint ? entry.characterHint : '');
  const entryFolderHintSlugs = Array.isArray(entry && entry.folderHints)
    ? entry.folderHints.map((value) => sanitizeCardAudioSlug(value)).filter(Boolean)
    : [];
  const entryTokens = new Set(Array.isArray(entry.tokens) ? entry.tokens : tokenizeCardAudioSearchText(entrySlug));
  const metaTokens = getCardAudioCandidateTokens(meta);

  let score = 0;
  metaSlugs.forEach((slug) => {
    if (!slug) return;
    if (entryCharacterHintSlug && slug === entryCharacterHintSlug) {
      score += (resolvedSlug && slug === resolvedSlug) ? 180 : 150;
    }
    if (entryFolderHintSlugs.includes(slug)) {
      score += (resolvedSlug && slug === resolvedSlug) ? 140 : 110;
    }
    if (slug === entrySlug) {
      score += (resolvedSlug && slug === resolvedSlug) ? 240 : (characterSlug && slug === characterSlug) ? 210 : 175;
      return;
    }
    if (entrySlug.startsWith(`${slug}-`)) {
      score += (resolvedSlug && slug === resolvedSlug) ? 120 : 90;
    }
    if (entrySlug.includes(slug) || slug.includes(entrySlug)) {
      score += 50;
    }
    const slugParts = slug.split('-').filter(Boolean);
    slugParts.forEach((part) => {
      if (part.length >= 3 && entryTokens.has(part)) score += 14;
    });
  });

  metaTokens.forEach((token) => {
    if (!token) return;
    if (entryTokens.has(token)) score += 12;
  });

  if ((Number(meta.infoConfidence) || 0) >= 0.75 && resolvedSlug && entrySlug === resolvedSlug) {
    score += 50;
  }
  if ((Number(meta.infoConfidence) || 0) >= 0.75 && characterSlug && entrySlug.startsWith(`${characterSlug}-`)) {
    score += 30;
  }
  if ((Number(meta.infoConfidence) || 0) >= 0.75 && (Number(meta.resolverConfidence) || 0) >= 0.75) {
    score += 20;
  }

  if (entryCharacterHintSlug && metaSlugs.length) {
    const bestDistance = metaSlugs.reduce((best, slug) => Math.min(best, quickSlugDistance(entryCharacterHintSlug, slug)), 99);
    if (bestDistance === 1) score += 34;
    if (bestDistance === 2) score += 16;
  }
  return score;
}

function quickSlugDistance(a = '', b = '') {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || !y) return 99;
  if (x === y) return 0;
  if (Math.abs(x.length - y.length) > 3) return 99;
  const rows = y.length + 1;
  const cols = x.length + 1;
  const dp = Array.from({ length: rows }, (_, r) => {
    const row = new Array(cols).fill(0);
    row[0] = r;
    return row;
  });
  for (let c = 0; c < cols; c += 1) dp[0][c] = c;
  for (let r = 1; r < rows; r += 1) {
    let rowMin = dp[r][0];
    for (let c = 1; c < cols; c += 1) {
      const cost = y[r - 1] === x[c - 1] ? 0 : 1;
      dp[r][c] = Math.min(
        dp[r - 1][c] + 1,
        dp[r][c - 1] + 1,
        dp[r - 1][c - 1] + cost
      );
      if (dp[r][c] < rowMin) rowMin = dp[r][c];
    }
    if (rowMin > 3) return 99;
  }
  return dp[rows - 1][cols - 1];
}

async function resolveCharacterCardIndexedSnippetSpec(meta) {
  const index = await loadCardClipIndex();
  const clips = Array.isArray(index && index.clips) ? index.clips : [];
  if (!clips.length) return null;

  let best = null;
  let bestScore = 0;
  for (let idx = 0; idx < clips.length; idx += 1) {
    const clip = clips[idx];
    const score = scoreIndexedCardClipCandidate(clip, meta);
    if (score <= 0) continue;
    if (best == null || score > bestScore) {
      best = clip;
      bestScore = score;
    }
  }
  if (!best || bestScore < 42) return null;

  return normalizeSnippetSpec({
    ...best,
    url: best.url,
    source: 'indexed-file',
    startSec: Number.isFinite(Number(best.startSec)) ? Number(best.startSec) : 0.16,
    durationSec: Number.isFinite(Number(best.durationSec)) ? Number(best.durationSec) : 1.35,
    gain: Number.isFinite(Number(best.gain)) ? Number(best.gain) : 1
  }, {
    durationSec: 1.35,
    playbackRate: 1,
    gain: 1
  });
}

function normalizeManifestClipUrl(rawEntry = {}) {
  const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
  const explicitUrl = String(entry.url || '').trim();
  if (explicitUrl) {
    if (/^https?:\/\//i.test(explicitUrl) || explicitUrl.startsWith('/')) return explicitUrl;
    return `/audio/clips/${encodeAudioPathSegment(explicitUrl)}`;
  }
  const file = String(entry.file || '').trim();
  if (!file) return '';
  return `/audio/clips/${encodeAudioPathSegment(file)}`;
}

function getManifestClipSearchSlugs(entry = {}) {
  const safeEntry = entry && typeof entry === 'object' ? entry : {};
  const values = []
    .concat(safeEntry.id || '')
    .concat(safeEntry.character || '')
    .concat(safeEntry.name || '')
    .concat(safeEntry.title || '')
    .concat(Array.isArray(safeEntry.keys) ? safeEntry.keys : [])
    .concat(Array.isArray(safeEntry.aliases) ? safeEntry.aliases : [])
    .concat(Array.isArray(safeEntry.characters) ? safeEntry.characters : [])
    .concat(Array.isArray(safeEntry.titles) ? safeEntry.titles : [])
    .concat(Array.isArray(safeEntry.resolvedTitles) ? safeEntry.resolvedTitles : []);
  const slugs = new Set();
  values.forEach((value) => {
    const slug = sanitizeCardAudioSlug(value);
    if (slug) slugs.add(slug);
  });
  return Array.from(slugs);
}

function scoreManifestClipCandidate(entry = {}, meta = {}) {
  const clipSlugs = new Set(getManifestClipSearchSlugs(entry));
  if (!clipSlugs.size) return 0;

  const metaSlugs = getCardAudioCandidateSlugs(meta);
  if (!metaSlugs.length) return 0;
  const resolvedSlug = sanitizeCardAudioSlug(meta && meta.resolvedTitle ? meta.resolvedTitle : '');
  const characterSlug = sanitizeCardAudioSlug(meta && meta.character ? meta.character : '');
  let score = 0;

  metaSlugs.forEach((slug) => {
    if (!slug) return;
    if (clipSlugs.has(slug)) {
      if (resolvedSlug && slug === resolvedSlug) score += 220;
      else if (characterSlug && slug === characterSlug) score += 180;
      else score += 120;
      return;
    }
    clipSlugs.forEach((clipSlug) => {
      if (!clipSlug) return;
      if (clipSlug.includes(slug) || slug.includes(clipSlug)) {
        score += 28;
      }
    });
  });

  const minConfidence = Number(entry.minInfoConfidence);
  if (Number.isFinite(minConfidence) && (Number(meta.infoConfidence) || 0) < minConfidence) {
    score -= 200;
  }
  if ((Number(meta.infoConfidence) || 0) >= 0.75 && resolvedSlug && clipSlugs.has(resolvedSlug)) {
    score += 40;
  }
  return score;
}

function clampSnippetDurationSeconds(seconds, fallback = 1.35) {
  const numeric = Number(seconds);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0.85, Math.min(2.2, numeric));
}

function normalizeSnippetSpec(rawSpec = {}, defaults = {}) {
  const raw = rawSpec && typeof rawSpec === 'object' ? rawSpec : {};
  const url = String(raw.url || defaults.url || '').trim();
  if (!url) return null;
  const startSec = Math.max(0, Number.isFinite(Number(raw.startSec)) ? Number(raw.startSec)
    : Number.isFinite(Number(raw.startMs)) ? (Number(raw.startMs) / 1000)
      : Number.isFinite(Number(defaults.startSec)) ? Number(defaults.startSec) : 0);
  const endSec = Number.isFinite(Number(raw.endSec)) ? Number(raw.endSec)
    : Number.isFinite(Number(raw.endMs)) ? (Number(raw.endMs) / 1000) : null;
  const rawDurationSec = Number.isFinite(Number(raw.durationSec)) ? Number(raw.durationSec)
    : Number.isFinite(Number(raw.durationMs)) ? (Number(raw.durationMs) / 1000)
      : (endSec != null ? Math.max(0.25, endSec - startSec) : (Number(defaults.durationSec) || 1.35));
  const playbackRate = clampAudioRate(raw.playbackRate != null ? raw.playbackRate : defaults.playbackRate, 1);
  return {
    url,
    startSec,
    durationSec: clampSnippetDurationSeconds(rawDurationSec, Number(defaults.durationSec) || 1.35),
    playbackRate,
    gain: clampAudioLevel(raw.gain != null ? raw.gain : defaults.gain, 1),
    id: String(raw.id || defaults.id || '').trim(),
    source: String(raw.source || defaults.source || 'manifest').trim() || 'manifest'
  };
}

async function resolveCharacterCardSnippetSpec(meta) {
  const signatureKey = getCardSnippetCacheKey(meta);
  if (audioState.cardSnippetMatchCache.has(signatureKey)) {
    return audioState.cardSnippetMatchCache.get(signatureKey);
  }

  const pending = (async () => {
    const serverResolved = await resolveCharacterCardSnippetViaServer(meta).catch(() => ({ endpointOk: false }));
    if (serverResolved && serverResolved.endpointOk) {
      if (serverResolved.libraryEmpty) return { __libraryEmpty: true };
      if (serverResolved.blurb) return serverResolved.blurb;
      return null;
    }

    const manifest = await loadCardSnippetManifest();
    const clips = Array.isArray(manifest && manifest.clips) ? manifest.clips : [];
    let best = null;
    let bestScore = 0;
    for (let idx = 0; idx < clips.length; idx += 1) {
      const clip = clips[idx];
      const url = normalizeManifestClipUrl(clip);
      if (!url) continue;
      const score = scoreManifestClipCandidate(clip, meta);
      if (score <= 0) continue;
      if (best == null || score > bestScore) {
        best = clip;
        bestScore = score;
      }
    }

    if (best) {
      const bestUrl = normalizeManifestClipUrl(best);
      const normalized = normalizeSnippetSpec({
        ...best,
        url: bestUrl,
        source: 'manifest'
      }, {
        durationSec: 1.35,
        playbackRate: 1,
        gain: 1
      });
      if (normalized) return normalized;
    }

    const index = await loadCardClipIndex();
    const indexedSnippet = Array.isArray(index && index.clips) && index.clips.length
      ? await resolveCharacterCardIndexedSnippetSpec(meta)
      : null;
    if (indexedSnippet) {
      return indexedSnippet;
    }

    if (Array.isArray(index && index.clips) && index.clips.length === 0) {
      return { __libraryEmpty: true };
    }

    const directClipUrl = await resolveCharacterCardClipUrl(meta);
    if (directClipUrl) {
      return normalizeSnippetSpec({
        url: directClipUrl,
        source: 'direct-file',
        startSec: 0,
        durationSec: 1.35
      }, {
        durationSec: 1.35,
        playbackRate: 1,
        gain: 1
      });
    }

    return null;
  })();

  audioState.cardSnippetMatchCache.set(signatureKey, pending);
  return pending;
}

function scoreCardClipPrefetchPriority(meta = {}, options = {}) {
  const safeMeta = normalizeCharacterAudioMeta(meta);
  const info = Number(safeMeta.infoConfidence) || 0;
  const resolver = Number(safeMeta.resolverConfidence) || 0;
  const ovr = Number(safeMeta.ovr) || 0;
  const hasResolved = safeMeta.resolvedTitle ? 1 : 0;
  const aliasBoost = Array.isArray(safeMeta.aliases) ? Math.min(4, safeMeta.aliases.length) : 0;
  const context = String(options && options.context || '').toLowerCase();
  const contextBoost = context.includes('final') ? 22 : context.includes('round4') ? 14 : 0;
  return (info * 120) + (resolver * 90) + (ovr * 0.35) + (hasResolved * 18) + (aliasBoost * 2.5) + contextBoost;
}

function getCachedSnippetForMeta(meta = {}) {
  const cacheKey = getCardSnippetCacheKey(meta);
  const cached = audioState.cardSnippetMatchCache.get(cacheKey);
  if (!cached || typeof cached.then !== 'function') return null;
  return cached;
}

function warmCardClipMediaUrl(url = '', { force = false } = {}) {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) return;
  if (!force && audioState.cardClipWarmUrlCache.has(targetUrl)) return;
  if (audioState.cardClipWarmQueuedUrls.has(targetUrl)) return;
  audioState.cardClipWarmQueuedUrls.add(targetUrl);
  audioState.cardClipWarmQueue.push(targetUrl);
  drainCardClipWarmQueue();
}

function drainCardClipWarmQueue() {
  const maxConcurrent = 2;
  while (audioState.cardClipWarmActive < maxConcurrent && audioState.cardClipWarmQueue.length) {
    const url = String(audioState.cardClipWarmQueue.shift() || '').trim();
    if (!url) continue;
    audioState.cardClipWarmQueuedUrls.delete(url);
    if (audioState.cardClipWarmUrlCache.has(url)) continue;

    audioState.cardClipWarmActive += 1;
    const warmer = createManagedAudioElement('card-warm');
    warmer.preload = 'metadata';
    warmer.muted = true;
    warmer.volume = 0;
    warmer.src = url;
    audioState.cardClipWarmers.push(warmer);

    const cleanup = () => {
      try {
        warmer.pause();
      } catch (error) {
      }
      try {
        warmer.removeAttribute('src');
        warmer.load();
      } catch (error) {
      }
      audioState.cardClipWarmActive = Math.max(0, audioState.cardClipWarmActive - 1);
      const idx = audioState.cardClipWarmers.indexOf(warmer);
      if (idx >= 0) audioState.cardClipWarmers.splice(idx, 1);
      drainCardClipWarmQueue();
    };

    const markReady = () => {
      audioState.cardClipWarmUrlCache.add(url);
      cleanup();
    };

    let finished = false;
    const finalize = (fn) => () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      warmer.removeEventListener('loadedmetadata', onMetaFinal);
      warmer.removeEventListener('canplay', onMetaFinal);
      warmer.removeEventListener('error', onErrorFinal);
      fn();
    };
    const onMetaFinal = finalize(markReady);
    const onErrorFinal = finalize(cleanup);
    const timeout = window.setTimeout(onErrorFinal, 2200);

    warmer.addEventListener('loadedmetadata', onMetaFinal, { once: true });
    warmer.addEventListener('canplay', onMetaFinal, { once: true });
    warmer.addEventListener('error', onErrorFinal, { once: true });
    try {
      warmer.load();
    } catch (error) {
      onErrorFinal();
    }
  }
}

function canUseSpeechSynthesis() {
  try {
    return typeof window !== 'undefined'
      && !!window.speechSynthesis
      && typeof window.SpeechSynthesisUtterance === 'function';
  } catch (error) {
    return false;
  }
}

function getSpeechSynthesisSafe() {
  try {
    return canUseSpeechSynthesis() ? window.speechSynthesis : null;
  } catch (error) {
    return null;
  }
}

function refreshSpeechVoicesCache() {
  const synth = getSpeechSynthesisSafe();
  if (!synth || typeof synth.getVoices !== 'function') return [];
  let voices = [];
  try {
    voices = synth.getVoices() || [];
  } catch (error) {
    voices = [];
  }
  const normalized = Array.isArray(voices)
    ? voices.filter((v) => v && typeof v === 'object')
    : [];
  audioState.speechVoices = normalized;
  audioState.speechVoicesLoaded = normalized.length > 0;
  return normalized;
}

function ensureSpeechVoicesLoadedSoon() {
  if (!canUseSpeechSynthesis()) return;
  if (audioState.speechVoicesLoading) return;
  audioState.speechVoicesLoading = true;
  const synth = getSpeechSynthesisSafe();
  const finish = () => {
    audioState.speechVoicesLoading = false;
    refreshSpeechVoicesCache();
  };
  try {
    refreshSpeechVoicesCache();
    if (synth && typeof synth.addEventListener === 'function') {
      const onChanged = () => {
        synth.removeEventListener('voiceschanged', onChanged);
        finish();
      };
      synth.addEventListener('voiceschanged', onChanged, { once: true });
      window.setTimeout(() => {
        try {
          synth.removeEventListener('voiceschanged', onChanged);
        } catch (error) {
        }
        finish();
      }, 1600);
      return;
    }
  } catch (error) {
  }
  finish();
}

function pickSpeechVoiceForBlurb(meta = {}, speechSpec = {}) {
  const voices = Array.isArray(audioState.speechVoices) && audioState.speechVoices.length
    ? audioState.speechVoices
    : refreshSpeechVoicesCache();
  if (!voices || !voices.length) return null;

  const style = String(speechSpec && speechSpec.voiceStyle || '').toLowerCase();
  const candidates = voices.filter((voice) => {
    const lang = String(voice && voice.lang || '').toLowerCase();
    return !lang || lang.startsWith('en');
  });
  const pool = candidates.length ? candidates : voices;

  const scoreVoice = (voice) => {
    const name = String(voice && voice.name || '').toLowerCase();
    const lang = String(voice && voice.lang || '').toLowerCase();
    let score = 0;
    if (lang.startsWith('en-us')) score += 6;
    else if (lang.startsWith('en')) score += 4;
    if (voice && voice.default) score += 4;
    if (style === 'villain' && /(david|mark|daniel|male|english|uk|deep)/i.test(name)) score += 8;
    if (style === 'creature' && /(zira|samantha|victoria|female)/i.test(name)) score += 6;
    if (style === 'synthetic' && /(zira|microsoft|google)/i.test(name)) score += 4;
    if (style === 'command' && /(david|george|alex|male)/i.test(name)) score += 6;
    if (style === 'fast' && /(zira|aria|female)/i.test(name)) score += 4;
    return score;
  };

  let best = pool[0];
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i += 1) {
    const voice = pool[i];
    const score = scoreVoice(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best || null;
}

function getCardSpeechUtteranceVolume(speechSpec = {}) {
  if (audioState.muted || !audioState.cardEnabled) return 0;
  const master = clampAudioLevel(audioState.masterVolume, 0.9);
  const card = clampAudioLevel(audioState.cardVolume, AUDIO_CATEGORY_DEFAULTS.card.volume);
  const gain = clampAudioLevel(speechSpec && speechSpec.gain != null ? speechSpec.gain : 1, 1);
  return Math.max(0, Math.min(1, master * card * gain));
}

function playCardSpeechQuote(speechSpec = {}, meta = {}, options = {}) {
  if (!canUseSpeechSynthesis()) return false;
  if (audioState.muted || !audioState.cardEnabled) return false;

  const text = String(speechSpec && (speechSpec.text || speechSpec.displayText) || '').trim();
  if (!text) return false;

  const synth = getSpeechSynthesisSafe();
  if (!synth) return false;
  ensureSpeechVoicesLoadedSoon();

  stopCardPlaybackElement();
  stopCardSpeechFallback();

  const requestToken = ++audioState.cardPlaybackToken;
  const startDelayMs = Math.max(0, Number(options && options.delayMs) || 0);
  const start = () => {
    if (requestToken !== audioState.cardPlaybackToken) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickSpeechVoiceForBlurb(meta, speechSpec);
    if (voice) {
      try { utterance.voice = voice; } catch (error) {}
      try { if (voice.lang) utterance.lang = voice.lang; } catch (error) {}
    }
    utterance.rate = clampAudioRate(speechSpec && speechSpec.rate != null ? speechSpec.rate : 1.15, 1.15);
    utterance.pitch = Math.max(0, Math.min(2, Number(speechSpec && speechSpec.pitch != null ? speechSpec.pitch : 1) || 1));
    utterance.volume = getCardSpeechUtteranceVolume(speechSpec);
    if (utterance.volume <= 0.0001) return false;
    try {
      synth.cancel();
    } catch (error) {
    }
    try {
      synth.speak(utterance);
      return true;
    } catch (error) {
      return false;
    }
  };

  if (startDelayMs > 0) {
    window.setTimeout(start, startDelayMs);
    return true;
  }
  return start();
}

async function prefetchCharacterCardBlurbsNow(metaList = [], options = {}) {
  const metas = (Array.isArray(metaList) ? metaList : [])
    .map((meta) => normalizeCharacterAudioMeta(meta))
    .filter((meta) => meta && (meta.character || meta.resolvedTitle));
  if (!metas.length) return { queued: 0, fetched: 0, warmed: 0 };

  const deduped = [];
  const seen = new Set();
  metas.forEach((meta) => {
    const key = getCardSnippetCacheKey(meta);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(meta);
  });

  deduped.sort((a, b) => scoreCardClipPrefetchPriority(b, options) - scoreCardClipPrefetchPriority(a, options));

  const maxEntries = Math.max(1, Math.min(36, Number(options && options.maxEntries) || 18));
  const selected = deduped.slice(0, maxEntries);

  // Avoid re-requesting entries that already have a resolved cache promise.
  const pendingRequest = selected.filter((meta) => !getCachedSnippetForMeta(meta));
  if (pendingRequest.length) {
    await resolveCharacterCardSnippetsViaServerBatch(pendingRequest, { log: true });
  }

  let warmed = 0;
  const warmLimit = Math.max(0, Math.min(8, Number(options && options.warmTop) || 0));
  if (warmLimit > 0) {
    const warmedCandidates = [];
    for (let i = 0; i < selected.length; i += 1) {
      const meta = selected[i];
      const cached = await Promise.resolve(getCachedSnippetForMeta(meta) || null);
      if (!cached || cached.__libraryEmpty) continue;
      const snippet = normalizeSnippetSpec(cached);
      if (!snippet || !snippet.url) continue;
      warmedCandidates.push(snippet.url);
      if (warmedCandidates.length >= warmLimit) break;
    }
    warmedCandidates.forEach((url) => {
      warmCardClipMediaUrl(url);
      warmed += 1;
    });
  }

  return {
    queued: metas.length,
    fetched: pendingRequest.length,
    warmed
  };
}

function scheduleCharacterCardBlurbPrefetch(entries = [], options = {}) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  if (!list.length) return false;
  const context = String(options && options.context || 'generic');
  const maxEntries = Number(options && options.maxEntries) || 18;
  const warmTop = Number(options && options.warmTop) || 0;

  list.forEach((entry) => {
    const meta = normalizeCharacterAudioMeta(entry);
    if (!meta.character && !meta.resolvedTitle) return;
    const key = getCardSnippetCacheKey(meta);
    if (!key || audioState.cardClipPrefetchQueuedKeys.has(key)) return;
    if (audioState.cardSnippetMatchCache.has(key)) return;
    audioState.cardClipPrefetchQueuedKeys.add(key);
    audioState.cardClipPrefetchQueue.push({ meta, context, maxEntries, warmTop, enqueuedAt: Date.now() });
  });

  if (audioState.cardClipPrefetchDrainTimer) return true;
  const drain = () => {
    audioState.cardClipPrefetchDrainTimer = null;
    void drainCharacterCardBlurbPrefetchQueue();
  };
  if (typeof window.requestIdleCallback === 'function') {
    audioState.cardClipPrefetchDrainTimer = window.requestIdleCallback(drain, { timeout: 450 });
  } else {
    audioState.cardClipPrefetchDrainTimer = window.setTimeout(drain, 90);
  }
  return true;
}

async function drainCharacterCardBlurbPrefetchQueue() {
  if (audioState.cardClipPrefetchInFlight) return;
  if (!audioState.cardClipPrefetchQueue.length) return;
  audioState.cardClipPrefetchInFlight = true;

  try {
    const queue = audioState.cardClipPrefetchQueue.splice(0, 48);
    queue.forEach((task) => {
      if (task && task.meta) {
        const key = getCardSnippetCacheKey(task.meta);
        if (key) audioState.cardClipPrefetchQueuedKeys.delete(key);
      }
    });
    const metas = queue.map((task) => task.meta).filter(Boolean);
    const warmTop = queue.reduce((best, task) => Math.max(best, Number(task && task.warmTop) || 0), 0);
    const maxEntries = queue.reduce((best, task) => Math.max(best, Number(task && task.maxEntries) || 0), 0);
    const context = queue[0] && queue[0].context ? queue[0].context : 'prefetch';
    await prefetchCharacterCardBlurbsNow(metas, { context, warmTop, maxEntries });
  } catch (error) {
  } finally {
    audioState.cardClipPrefetchInFlight = false;
    if (audioState.cardClipPrefetchQueue.length) {
      if (audioState.cardClipPrefetchDrainTimer) {
        try {
          if (typeof window.cancelIdleCallback === 'function') {
            window.cancelIdleCallback(audioState.cardClipPrefetchDrainTimer);
          } else {
            window.clearTimeout(audioState.cardClipPrefetchDrainTimer);
          }
        } catch (cancelError) {
        }
      }
      audioState.cardClipPrefetchDrainTimer = window.setTimeout(() => {
        audioState.cardClipPrefetchDrainTimer = null;
        void drainCharacterCardBlurbPrefetchQueue();
      }, 120);
    }
  }
}

function playCardSnippet(snippet, options = {}) {
  const spec = normalizeSnippetSpec(snippet);
  if (!spec) return false;
  if (audioState.muted || !audioState.cardEnabled) return false;

  const el = ensureCardPlaybackElement();
  clearCardPlaybackStopTimer();
  stopCardSpeechFallback();

  const requestToken = ++audioState.cardPlaybackToken;
  const startDelayMs = Math.max(0, Number(options && options.delayMs) || 0);
  const applyAndPlay = () => {
    if (requestToken !== audioState.cardPlaybackToken) return false;
    try {
      el.playbackRate = spec.playbackRate;
    } catch (error) {
    }
    audioState.cardPlaybackGainScalar = clampAudioLevel(spec.gain, 1);
    try {
      if (Math.abs((Number(el.currentTime) || 0) - spec.startSec) > 0.05) {
        el.currentTime = spec.startSec;
      }
    } catch (error) {
    }
    syncManagedMediaAudioLevels();
    safePlayManagedAudioElement(el);
    const stopAfterMs = Math.max(350, Math.round((spec.durationSec / Math.max(0.5, spec.playbackRate || 1)) * 1000) + 30);
    audioState.cardPlaybackStopTimer = window.setTimeout(() => {
      if (requestToken !== audioState.cardPlaybackToken) return;
      safePauseManagedAudioElement(el);
    }, stopAfterMs);
    return true;
  };

  const startPlayback = () => {
    const needsSourceSwap = (() => {
      try {
        return el.src !== `${window.location.origin}${spec.url}` && el.src !== spec.url;
      } catch (error) {
        return true;
      }
    })();

    if (needsSourceSwap) {
      try {
        el.src = spec.url;
      } catch (error) {
        return false;
      }
      el.preload = 'auto';
    }

    const run = () => applyAndPlay();
    if (Number(spec.startSec) > 0 && (!el.readyState || el.readyState < 1)) {
      const onLoaded = () => {
        el.removeEventListener('loadedmetadata', onLoaded);
        run();
      };
      el.addEventListener('loadedmetadata', onLoaded, { once: true });
      try {
        el.load();
      } catch (error) {
      }
      return true;
    }
    return run();
  };

  if (startDelayMs > 0) {
    window.setTimeout(startPlayback, startDelayMs);
    return true;
  }
  return startPlayback();
}

function buildNoAudioPromptText(meta = {}, options = {}) {
  const name = String(meta && (meta.character || meta.resolvedTitle) || '').trim() || 'this card';
  const context = String(options && options.context || '').toLowerCase();
  if (context.includes('final')) {
    return `Archive scan miss: no quote audio found for ${name} yet. Playing fallback sting.`;
  }
  return `Archive scan miss: no quote audio found for ${name} yet.`;
}

function playNoAudioSadCue(meta = {}, options = {}) {
  const ovr = Math.max(0, Math.min(99, Number(meta && meta.ovr) || 0));
  const context = String(options && options.context || '').toLowerCase();
  const softer = context.includes('reveal') ? 0.72 : 1;
  const base = 240 + Math.round(ovr * 0.32);
  const delay = Math.max(0, Number(options && options.delayMs) || 0);
  runNoteSequence([
    { frequency: base * 1.2, frequencyEnd: base * 0.95, duration: 70, type: 'square', volume: 0.036 * softer, attack: 0.005, release: 0.04, pan: -0.18, bus: 'card' },
    { frequency: base * 0.92, frequencyEnd: base * 0.56, duration: 210, type: 'triangle', volume: 0.056 * softer, attack: 0.01, release: 0.12, pan: 0.08, bus: 'card' },
    { frequency: base * 0.66, frequencyEnd: Math.max(75, base * 0.38), duration: 260, type: 'sawtooth', volume: 0.052 * softer, attack: 0.01, release: 0.18, pan: -0.04, bus: 'card' }
  ], 125, { bus: 'card', baseDelayMs: delay });
  window.setTimeout(() => {
    scheduleTone({
      frequency: 980,
      frequencyEnd: 720,
      duration: 85,
      type: 'triangle',
      volume: 0.022 * softer,
      attack: 0.004,
      release: 0.05,
      bus: 'card'
    });
  }, delay + 36);
}

async function playCharacterCardBlurb(input = {}, options = {}) {
  const meta = normalizeCharacterAudioMeta(input);
  const signature = buildCharacterAudioSignature(meta);
  const contextLabel = String(options && options.context || '').toLowerCase();
  if (contextLabel.includes('round4-reveal') || contextLabel.includes('round4-finale')) {
    return { skipped: true, reason: 'ceremony_blurbs_disabled', signature };
  }
  const now = Date.now();
  const throttleMs = Math.max(0, Number(options && options.throttleMs) || 0);
  if (throttleMs > 0 && audioState.lastCardBlurbSig === signature && (now - audioState.lastCardBlurbAt) < throttleMs) {
    return { skipped: true, signature };
  }

  audioState.lastCardBlurbSig = signature;
  audioState.lastCardBlurbAt = now;

  ensureAudioRunning();
  tryUnlockHtmlMediaStack();

  const requestToken = ++audioState.cardPlaybackToken;
  const snippetSpec = await resolveCharacterCardSnippetSpec(meta);
  if (requestToken !== audioState.cardPlaybackToken) {
    return { skipped: true, reason: 'superseded', signature };
  }

  if (snippetSpec && snippetSpec.__speechQuote) {
    const speechPlayed = playCardSpeechQuote(snippetSpec, meta, options);
    if (speechPlayed) {
      return {
        signature,
        meta,
        mode: String(snippetSpec.source || 'speech-quote'),
        speech: snippetSpec,
        prompt: String(snippetSpec.displayText || snippetSpec.text || '').trim()
      };
    }
  }

  if (snippetSpec && !snippetSpec.__libraryEmpty && !snippetSpec.__speechQuote) {
    const played = playCardSnippet(snippetSpec, options);
    if (played) {
      return { signature, meta, mode: snippetSpec.source || 'snippet', url: snippetSpec.url, snippet: snippetSpec };
    }
  }

  stopCardPlaybackElement();

  playNoAudioSadCue(meta, options);
  return {
    signature,
    meta,
    mode: snippetSpec && snippetSpec.__libraryEmpty ? 'no-audio-library-empty' : 'no-audio-fallback',
    prompt: (snippetSpec && snippetSpec.__libraryEmpty)
      ? `Quote clip library is empty. Add local clips to audio/clips/ for ${meta.character || meta.resolvedTitle || 'this card'}.`
      : buildNoAudioPromptText(meta, options)
  };
}

function pickHighestOVRCard(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return null;
  return entries.reduce((best, entry) => {
    if (!entry || typeof entry !== 'object') return best;
    if (!best) return entry;
    const a = Number(entry.ovr) || 0;
    const b = Number(best.ovr) || 0;
    if (a !== b) return a > b ? entry : best;
    const aRank = Number(entry.eliteRank) || 999;
    const bRank = Number(best.eliteRank) || 999;
    return aRank < bRank ? entry : best;
  }, null);
}

function playHighestOVRCardBlurb(entries = [], options = {}) {
  const best = pickHighestOVRCard(entries);
  if (!best) return null;
  const dedupeKey = `${buildCharacterAudioSignature(best)}|${String(options && options.context || '')}`;
  if (options && options.dedupeFinale === true && audioState.lastFinaleAutoplaySig === dedupeKey) {
    return { skipped: true, reason: 'duplicate_finale' };
  }
  if (options && options.dedupeFinale === true) {
    audioState.lastFinaleAutoplaySig = dedupeKey;
  }
  return playCharacterCardBlurb(best, options);
}

function prefetchCharacterCardBlurbs(entries = [], options = {}) {
  return scheduleCharacterCardBlurbPrefetch(entries, options);
}

function publishGlobalAudioBridge() {
  window.__lobbyAudio = {
    version: '2026-02-24-audio-bridge2-mp3-xfade',
    ensureUnlocked() {
      unlockAudioFromGesture({ type: 'bridge' });
      return audioState.unlocked === true;
    },
    ensureRunning() {
      return ensureAudioRunning();
    },
    isUnlocked() {
      return audioState.unlocked === true;
    },
    getState() {
      return {
        muted: audioState.muted,
        unlocked: audioState.unlocked,
        masterVolume: audioState.masterVolume,
        sfxVolume: audioState.sfxVolume,
        musicVolume: audioState.musicVolume,
        revealVolume: audioState.revealVolume,
        cardVolume: audioState.cardVolume,
        musicEnabled: audioState.musicEnabled,
        sfxEnabled: audioState.sfxEnabled,
        revealEnabled: audioState.revealEnabled,
        cardEnabled: audioState.cardEnabled,
        currentMusicScene: audioState.currentMusicScene
      };
    },
    setMusicScene(sceneKey, options = {}) {
      setMusicScene(sceneKey, options);
      return true;
    },
    playRound4RevealAccent(profile, stage) {
      playRound4RevealAccent(profile, stage);
      return true;
    },
    playCharacterCardBlurb(entry, options = {}) {
      return playCharacterCardBlurb(entry, options);
    },
    playHighestOVRCardBlurb(entries, options = {}) {
      return playHighestOVRCardBlurb(entries, options);
    },
    prefetchCharacterCardBlurbs(entries, options = {}) {
      return prefetchCharacterCardBlurbs(entries, options);
    },
    getCardClipStats() {
      return loadCardClipStats();
    },
    openQuickPanel() {
      setAudioQuickPanelOpen(true);
      return true;
    }
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

function getActiveLobbyTabName() {
  const active = document.querySelector('.tab-btn.active[data-tab]');
  return active ? String(active.getAttribute('data-tab') || '').trim() : '';
}

function isLobbyScreenActive() {
  const lobby = document.getElementById('lobby');
  return Boolean(lobby && lobby.classList.contains('active'));
}

function syncChatTabPingBadge() {
  const badge = document.getElementById('chatTabPing');
  if (!badge) return;
  const count = Math.max(0, Number(chatPingState.unreadCount) || 0);
  const show = count > 0;
  badge.hidden = !show;
  if (!show) {
    badge.textContent = '';
    badge.classList.remove('is-live');
    badge.removeAttribute('aria-label');
    return;
  }
  badge.textContent = count > 9 ? '9+' : String(count);
  badge.classList.add('is-live');
  badge.setAttribute('aria-label', `${count} unread chat ${count === 1 ? 'message' : 'messages'}`);
}

function resetChatTabPing() {
  chatPingState.unreadCount = 0;
  syncChatTabPingBadge();
}

function incrementChatTabPing(messageTimestamp) {
  const ts = Number(messageTimestamp) || Date.now();
  if (ts && ts <= (Number(chatPingState.lastMessageTs) || 0)) return;
  chatPingState.lastMessageTs = ts;
  chatPingState.unreadCount = Math.min(99, (Number(chatPingState.unreadCount) || 0) + 1);
  syncChatTabPingBadge();
}

function maybeHandleIncomingChatPing(msg) {
  if (!msg || msg.player === player.name) return;
  if (!isLobbyScreenActive()) return;
  if (getActiveLobbyTabName() === 'chat') {
    resetChatTabPing();
    return;
  }
  incrementChatTabPing(msg.timestamp);
}

function stopDraftWaitIntelPreviewPolling() {
  if (draftWaitIntelPreviewState.pollTimer) {
    clearInterval(draftWaitIntelPreviewState.pollTimer);
    draftWaitIntelPreviewState.pollTimer = null;
  }
  draftWaitIntelPreviewState.pollStopAtMs = 0;
}

function resetDraftWaitIntelPreview({ hide = true, statusText = 'Checking cached evaluator prep...' } = {}) {
  stopDraftWaitIntelPreviewPolling();
  draftWaitIntelPreviewState.receivedRound = null;
  draftWaitIntelPreviewState.requestRound = null;

  const panel = document.getElementById('draftWaitIntelPreview');
  const body = document.getElementById('draftWaitIntelPreviewBody');
  const status = document.getElementById('draftWaitIntelPreviewStatus');
  if (status) status.textContent = statusText;
  if (body) body.innerHTML = '';
  if (panel) panel.hidden = Boolean(hide);
}

function getEarlyIntelEmotionEmoji(entry = {}) {
  const confidence = Number(entry.confidence) || 0;
  const emotion = String(entry.emotion || '').toLowerCase();
  if (emotion.includes('mad')) return '&#x1F621;';
  if (emotion.includes('confused')) return '&#x1F615;';
  if (emotion.includes('disappointed')) return '&#x1F61E;';
  if (emotion.includes('amazed')) return '&#x1F929;';
  if (emotion.includes('happy')) return '&#x1F60A;';
  if (entry.ready === false) return '&#x23F3;';
  if (confidence >= 0.9) return '&#x1F92F;';
  if (confidence >= 0.75) return '&#x2728;';
  if (confidence >= 0.5) return '&#x1F60C;';
  return '&#x1F914;';
}

function renderDraftWaitIntelPreview(preview) {
  const panel = document.getElementById('draftWaitIntelPreview');
  const body = document.getElementById('draftWaitIntelPreviewBody');
  const status = document.getElementById('draftWaitIntelPreviewStatus');
  if (!panel || !body) return;

  const entries = Array.isArray(preview && preview.evaluations) ? preview.evaluations : [];
  const summary = preview && preview.summary && typeof preview.summary === 'object' ? preview.summary : {};
  if (!entries.length) {
    panel.hidden = false;
    body.innerHTML = '<p class="draft-wait-intel-preview-empty">No cached evaluator prep was ready before the twist.</p>';
    if (status) status.textContent = 'No cached preview ready in time.';
    return;
  }

  const avgConfidencePct = Number.isFinite(Number(summary.averageConfidence))
    ? Math.round(Number(summary.averageConfidence) * 100)
    : null;
  const trustedCount = Number(summary.trustedCount) || 0;
  const totalEvalCount = Number(summary.totalCount) || entries.length;
  const readyCount = Number(summary.readyCount) || entries.filter((entry) => entry && entry.ready === true).length;

  body.innerHTML = `
    <div class="draft-wait-intel-preview-summary">
      <span><small>Ready</small><b>${readyCount}/${totalEvalCount}</b></span>
      <span><small>Trusted</small><b>${trustedCount}/${totalEvalCount}</b></span>
      <span><small>Confidence</small><b>${avgConfidencePct == null ? 'n/a' : `${avgConfidencePct}%`}</b></span>
    </div>
    <div class="draft-wait-intel-preview-list">
      ${entries.map((entry, idx) => {
        const confidencePct = Number.isFinite(Number(entry.confidence)) ? Math.round(Number(entry.confidence) * 100) : null;
        const source = entry.ready === true
          ? (entry.source ? String(entry.source) : 'cache')
          : 'warming';
        const note = entry.ready === true
          ? `${entry.contextPreseeded ? 'Context ready' : 'Resolver ready'}${entry.imageUrl ? ' + portrait' : ''}${entry.imageSynthetic ? ' (synthetic)' : ''}`
          : 'Cached prep still warming. Twist has not been revealed yet.';
        const mood = getEarlyIntelEmotionEmoji(entry);
        return `
          <article class="draft-wait-intel-card" style="--draft-wait-intel-index:${idx};">
            <div class="draft-wait-intel-card-head">
              <strong>${escapeHtml(entry.character || `Pick ${idx + 1}`)}</strong>
              <span class="draft-wait-intel-card-mood" aria-hidden="true">${mood}</span>
            </div>
            <div class="draft-wait-intel-card-metrics">
              <span>${entry.ready === true ? 'Ready' : 'Status'} <b>${entry.ready === true ? 'Yes' : 'Warming'}</b></span>
              <span>Source <b>${escapeHtml(source)}</b></span>
              <span>${confidencePct == null ? 'Confidence n/a' : `Confidence ${confidencePct}%`}</span>
            </div>
            <p>${escapeHtml(note)}</p>
          </article>
        `;
      }).join('')}
    </div>
  `;

  if (status) {
    status.textContent = `Cache-only preview while waiting${readyCount < totalEvalCount ? ' (still warming...)' : ''}.`;
  }
  panel.hidden = false;
}

function startDraftWaitIntelPreviewPolling() {
  const scenarioScreen = document.getElementById('scenarioScreen');
  if (!scenarioScreen || !scenarioScreen.classList.contains('active')) return;
  if (!gameState.draftLocked) return;

  const currentRound = Number(gameState.currentRound) || 0;
  if (
    draftWaitIntelPreviewState.requestRound === currentRound
    && (draftWaitIntelPreviewState.pollTimer || draftWaitIntelPreviewState.receivedRound === currentRound)
  ) {
    return;
  }

  resetDraftWaitIntelPreview({ hide: false, statusText: 'Checking cached evaluator prep...' });
  draftWaitIntelPreviewState.pollStopAtMs = Date.now() + 3400;
  draftWaitIntelPreviewState.receivedRound = null;
  draftWaitIntelPreviewState.requestRound = currentRound;

  const requestPreview = () => {
    if (!socket || typeof socket.emit !== 'function') return;
    if (!document.getElementById('scenarioScreen')?.classList.contains('active')) return;
    if (!gameState.draftLocked) return;
    if (Date.now() > draftWaitIntelPreviewState.pollStopAtMs) {
      stopDraftWaitIntelPreviewPolling();
      const status = document.getElementById('draftWaitIntelPreviewStatus');
      if (status && !draftWaitIntelPreviewState.receivedRound) {
        status.textContent = 'No cached peek this time. Twist is next.';
      }
      return;
    }
    socket.emit('requestDraftWaitPreview');
  };

  requestPreview();
  draftWaitIntelPreviewState.pollTimer = setInterval(requestPreview, 450);
  addTimer(draftWaitIntelPreviewState.pollTimer);
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

function normalizePackMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const visuals = meta.visuals && typeof meta.visuals === 'object' ? meta.visuals : {};
  return {
    id: meta.id ? String(meta.id) : 'default',
    label: meta.label ? String(meta.label) : 'Default',
    description: meta.description ? String(meta.description) : '',
    themeTags: Array.isArray(meta.themeTags) ? meta.themeTags.map((tag) => String(tag)).filter(Boolean).slice(0, 6) : [],
    visuals: {
      chipLabel: visuals.chipLabel ? String(visuals.chipLabel) : '',
      accentColor: visuals.accentColor ? String(visuals.accentColor) : '',
      tone: visuals.tone ? String(visuals.tone) : ''
    }
  };
}

function getPackCatalogPacks() {
  const catalog = roomState.packCatalog && typeof roomState.packCatalog === 'object' ? roomState.packCatalog : null;
  return catalog && Array.isArray(catalog.packs) ? catalog.packs : [];
}

function getCatalogPackEntry(packId) {
  const id = String(packId || '').toLowerCase() || 'default';
  return getPackCatalogPacks().find((entry) => entry && String(entry.id || '').toLowerCase() === id) || null;
}

function resolveActivePackMeta(incomingMeta = null) {
  const normalizedIncoming = normalizePackMeta(incomingMeta);
  if (normalizedIncoming) return normalizedIncoming;
  const fromGameState = normalizePackMeta(gameState.activePackMeta);
  if (fromGameState) return fromGameState;
  const fromRoom = normalizePackMeta(roomState.selectedPackMeta);
  if (fromRoom) return fromRoom;
  const packId = roomState && roomState.settings ? roomState.settings.contentPackId : 'default';
  return normalizePackMeta(getCatalogPackEntry(packId)) || {
    id: 'default',
    label: 'Default',
    description: 'Core LobbyWARS pack.',
    themeTags: [],
    visuals: { chipLabel: 'CORE', accentColor: '', tone: '' }
  };
}

function buildPackChipMarkup(meta) {
  const pack = resolveActivePackMeta(meta);
  const chipLabel = pack.visuals && pack.visuals.chipLabel ? pack.visuals.chipLabel : pack.label;
  const accent = pack.visuals && pack.visuals.accentColor ? pack.visuals.accentColor : '';
  const style = accent ? ` style="--pack-accent:${escapeHtml(accent)}"` : '';
  return `<span class="pack-meta-pill"${style}>${escapeHtml(chipLabel)}</span> ${escapeHtml(pack.label)}`;
}

function updateContentPackDescription(selectedPackId) {
  const helpEl = document.getElementById('contentPackDescription');
  if (!helpEl) return;
  const selected = getCatalogPackEntry(selectedPackId || (roomState.settings && roomState.settings.contentPackId));
  const featuredPackId = roomState.packCatalog && roomState.packCatalog.featuredPackId
    ? String(roomState.packCatalog.featuredPackId)
    : '';
  const isFeatured = selected && featuredPackId && String(selected.id) === featuredPackId;
  const baseDescription = selected && selected.description
    ? String(selected.description)
    : 'Curated pack themes for scenarios, twists, and finals.';
  helpEl.textContent = isFeatured ? `Featured today: ${baseDescription}` : baseDescription;
}

function renderContentPackOptions() {
  const select = document.getElementById('contentPack');
  if (!select) return;

  const catalogPacks = getPackCatalogPacks();
  const fallbackOptions = [{ id: 'default', label: 'Default', description: 'Core LobbyWARS pack.', visuals: { chipLabel: 'CORE' } }];
  const packs = catalogPacks.length ? catalogPacks : fallbackOptions;
  const currentValue = String((roomState.settings && roomState.settings.contentPackId) || select.value || 'default');

  select.innerHTML = '';
  packs.forEach((entry) => {
    const option = document.createElement('option');
    const id = entry && entry.id ? String(entry.id) : 'default';
    const label = entry && entry.label ? String(entry.label) : id;
    const chip = entry && entry.visuals && entry.visuals.chipLabel ? String(entry.visuals.chipLabel) : '';
    const featuredId = roomState.packCatalog && roomState.packCatalog.featuredPackId
      ? String(roomState.packCatalog.featuredPackId)
      : '';
    const featuredTag = featuredId && featuredId === id ? ' (Featured)' : '';
    option.value = id;
    option.textContent = chip ? `${label} [${chip}]${featuredTag}` : `${label}${featuredTag}`;
    select.appendChild(option);
  });

  select.value = packs.some((entry) => String(entry && entry.id) === currentValue) ? currentValue : 'default';
  updateContentPackDescription(select.value);
}

function setFinalPackMetaLine(meta) {
  const line = document.getElementById('finalPackMeta');
  if (!line) return;
  const pack = resolveActivePackMeta(meta);
  const tags = Array.isArray(pack.themeTags) && pack.themeTags.length
    ? ` <span class="pack-meta-tags">${escapeHtml(pack.themeTags.slice(0, 3).join(' • '))}</span>`
    : '';
  line.innerHTML = `<span class="pack-meta-caption">Pack:</span> ${buildPackChipMarkup(pack)}${tags}`;
  line.hidden = false;
}

function buildRoundScoringMetaText(packMeta = null) {
  const pack = resolveActivePackMeta(packMeta);
  const packSuffix = pack && pack.label ? ` • Pack: ${pack.label}` : '';
  return `<strong>Scoring:</strong> Community votes + contextual intel fit + other rule-based modifiers${escapeHtml(packSuffix)}`;
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
  roomState.packCatalog = data && data.packCatalog ? data.packCatalog : roomState.packCatalog;
  roomState.selectedPackMeta = normalizePackMeta(data && data.selectedPackMeta) || roomState.selectedPackMeta;
  roomState.messages = normalizeChatMessages(data.messages);
  const prunedHistory = pruneChatMessages(roomState.messages);
  roomState.messages = prunedHistory.messages;
  updateChatEraseNotice({ prunedCount: prunedHistory.prunedCount });
  if (chatPingState.roomCode !== (player.room || '')) {
    chatPingState.roomCode = player.room || '';
    resetChatTabPing();
  } else {
    syncChatTabPingBadge();
  }
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
  renderContentPackOptions();

  if (isHost) {
    settingsContent.style.display = 'block';
    hostNote.style.display = 'none';
    if (data.settings) {
      if (data.settings.difficulty) document.getElementById('difficulty').value = data.settings.difficulty;
      if (data.settings.scenarioTheme) document.getElementById('scenarioTheme').value = data.settings.scenarioTheme;
      if (data.settings.customScenario !== undefined) document.getElementById('customScenario').value = data.settings.customScenario;
      if (data.settings.contentPackId) document.getElementById('contentPack').value = data.settings.contentPackId;
      if (data.settings.plotTwists !== undefined) document.getElementById('plotTwists').checked = data.settings.plotTwists;
      updateContentPackDescription(data.settings.contentPackId);
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
  const contentPack = document.getElementById('contentPack');
  const plotTwists = document.getElementById('plotTwists');
  if (difficulty && settings.difficulty) difficulty.value = settings.difficulty;
  if (scenarioTheme && settings.scenarioTheme) scenarioTheme.value = settings.scenarioTheme;
  if (customScenario && settings.customScenario !== undefined) customScenario.value = settings.customScenario;
  if (contentPack && settings.contentPackId) contentPack.value = settings.contentPackId;
  if (plotTwists && settings.plotTwists !== undefined) plotTwists.checked = settings.plotTwists;
  updateContentPackDescription(settings && settings.contentPackId);
});

function toggleReady() {
  playReadyToggleSound(!player.ready);
  socket.emit('toggleReady');
}

function updateSetting(key, value) {
  if (roomState.host !== player.name) return;
  const settings = { ...roomState.settings };
  settings[key] = value;
  if (key === 'contentPackId') {
    updateContentPackDescription(value);
  }
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
  maybeHandleIncomingChatPing(cleanMessage);

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
  resetDraftWaitIntelPreview({ hide: true });
  gameState.totalRounds = data.totalRounds;
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
  gameState.myTeam = [];
  gameState.draftEntryCount = 0;
  gameState.draftLocked = false;
  gameState.myFinalTeam = [];
  gameState.voted = false;
  gameState.voteLocked = false;
  gameState.draftWarnings = {};
  playPhaseShiftSound();
  showToast('🎉 Game starting! Get ready!', 'info');
  const finalPackMeta = document.getElementById('finalPackMeta');
  if (finalPackMeta) {
    finalPackMeta.hidden = true;
    finalPackMeta.innerHTML = '';
  }
  showScreen('preRound');
});

socket.on('roundStart', (data) => {
  resetDraftWaitIntelPreview({ hide: true });
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
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
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
    const sourceIndex = Number.isFinite(Number(data.wordApiSourceIndex)) ? Number(data.wordApiSourceIndex) : null;
    const sourceTotal = Number.isFinite(Number(data.wordApiSourceTotal)) ? Number(data.wordApiSourceTotal) : null;
    const sourceSuffix = sourceIndex && sourceTotal ? ` (API ${sourceIndex}/${sourceTotal})` : '';
    const activePack = resolveActivePackMeta(data && data.packMeta);
    wordApiIndicator.textContent = `Auto-fill source: ${sourceLabel}${sourceSuffix} | Pack: ${activePack.label}`;
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
  const waitStatus = document.getElementById('draftWaitStatus');
  const livePicksSection = document.querySelector('.live-picks-section');
  const myTeamList = document.getElementById('myTeam');
  if (!waitVisual) return;

  if (!isLocked) {
    waitVisual.style.display = 'none';
    waitVisual.classList.remove('waiting-active');
    if (waitStatus) {
      waitStatus.textContent = '';
    } else {
      waitVisual.textContent = '';
    }
    if (livePicksSection) livePicksSection.classList.remove('draft-live-erased');
    if (myTeamList) myTeamList.classList.remove('draft-team-locked');
    stopDraftWaitTicker();
    resetDraftWaitIntelPreview({ hide: true, statusText: 'Checking cached evaluator prep...' });
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
    const statusText = `${emoji} WAITING FOR SLOWER PLAYERS${dots}`;
    if (waitStatus) {
      waitStatus.textContent = statusText;
    } else {
      waitVisual.textContent = statusText;
    }
    draftLockVisualState.waitDotIndex += 1;
    draftLockVisualState.waitEmojiIndex += 1;
  };

  renderWaitingText();
  startDraftWaitIntelPreviewPolling();
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
  stopDraftWaitIntelPreviewPolling();
  resetDraftWaitIntelPreview({ hide: true });
  showScreen('twistScreen');
  playTwistSound();
  showToast('🌀 Plot twist incoming!', 'warning');
});

// ========================
// VOTING PHASE
// ========================
socket.on('votingPhaseStart', (data) => {
  clearTimers();
  stopDraftWaitIntelPreviewPolling();
  resetDraftWaitIntelPreview({ hide: true });
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

socket.on('draftWaitIntelPreview', (data) => {
  if (!data || typeof data !== 'object') return;
  if (!document.getElementById('scenarioScreen')?.classList.contains('active')) return;
  if (!gameState.draftLocked) return;
  const incomingRound = Number(data.roundNumber) || 0;
  const activeRound = Number(gameState.currentRound) || 0;
  if (incomingRound && activeRound && incomingRound !== activeRound) return;
  draftWaitIntelPreviewState.receivedRound = incomingRound || activeRound || null;
  renderDraftWaitIntelPreview(data);
  const summary = data && data.summary && typeof data.summary === 'object' ? data.summary : {};
  const readyCount = Number(summary.readyCount) || 0;
  const totalCount = Number(summary.totalCount) || 0;
  if (totalCount > 0 && readyCount >= totalCount) {
    stopDraftWaitIntelPreviewPolling();
  }
});

// ========================
// ROUND 4: AI EVALUATION (NEW)
// ========================
socket.on('round4Start', (data) => {
  console.log('🎮 Round 4 Start event received:', data);
  clearTimers();
  playPhaseShiftSound();
  try {
    const finalTeams = data && data.finalTeams && typeof data.finalTeams === 'object' ? data.finalTeams : {};
    const prefetchEntries = Object.entries(finalTeams).flatMap(([ownerName, roster]) => (
      Array.isArray(roster)
        ? roster.map((character) => ({ character, ownerName }))
        : []
    ));
    if (prefetchEntries.length) {
      scheduleCharacterCardBlurbPrefetch(prefetchEntries, {
        context: 'round4-start',
        maxEntries: 18,
        warmTop: 2
      });
    }
  } catch (prefetchError) {
  }
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
    hasLines: safeLines.length > 0,
    moreCount: Math.max(0, safeLines.length - 1)
  };
}

function buildRadialSliceHiddenNotesLabel(slice, laneKey = 'vote') {
  const safeSlice = slice && typeof slice === 'object' ? slice : {};
  const moreCount = Math.max(0, Number(safeSlice.moreCount) || 0);
  if (moreCount <= 0) {
    if (laneKey === 'intel') return 'No hidden intel notes';
    if (laneKey === 'core') return 'No hidden modifier notes';
    return 'No hidden vote notes';
  }
  if (laneKey === 'intel') return `+${moreCount} hidden intel notes`;
  if (laneKey === 'core') return `+${moreCount} hidden modifier notes`;
  return `+${moreCount} hidden vote notes`;
}

function getRadialBubblePrimaryNote(slice, impactLabel) {
  const safeSlice = slice && typeof slice === 'object' ? slice : {};
  if (String(impactLabel || '').toLowerCase() === 'boost' && safeSlice.hasLines !== true) {
    return 'N/A';
  }
  return String(safeSlice.note || 'No scoring note.');
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

function getEvalModeBadgeLabel(mode) {
  const normalized = String(mode || '').toLowerCase();
  if (normalized === 'context') return 'CE';
  if (normalized === 'context_shadow') return 'SHADOW';
  if (normalized === 'legacy') return 'LEGACY';
  return normalized ? normalized.toUpperCase() : 'UNKNOWN';
}

function buildRoundIntelDiagnosticsMarkup(roundIntelDiagnostics = {}, roundIntelSummary = {}) {
  const rows = Object.entries(roundIntelDiagnostics || {});
  if (!rows.length) return '';

  const markup = rows.map(([playerName, diag]) => {
    const safeDiag = diag && typeof diag === 'object' ? diag : {};
    const summary = roundIntelSummary && roundIntelSummary[playerName] ? roundIntelSummary[playerName] : null;
    const avgConfidence = Number.isFinite(Number(safeDiag.avgConfidence))
      ? Math.round(Number(safeDiag.avgConfidence) * 100)
      : (summary && Number.isFinite(Number(summary.averageConfidence)) ? Math.round(Number(summary.averageConfidence) * 100) : 0);
    const trustedCount = Number(safeDiag.trustedCount) || 0;
    const evaluationCount = Number(safeDiag.evaluationCount) || 0;
    const engineModes = Array.isArray(safeDiag.engineModes) ? safeDiag.engineModes : [];
    const contextStatuses = Array.isArray(safeDiag.contextStatuses) ? safeDiag.contextStatuses : [];
    const contextStatusLabels = Array.isArray(safeDiag.contextStatusLabels) ? safeDiag.contextStatusLabels : [];
    const shadowStatuses = Array.isArray(safeDiag.shadowStatuses) ? safeDiag.shadowStatuses : [];
    const statusText = contextStatusLabels[0] || contextStatuses[0] || shadowStatuses[0] || 'n/a';
    const modeBadge = getEvalModeBadgeLabel(engineModes[0]);
    const avgResolver = Number.isFinite(Number(safeDiag.avgResolverConfidence)) ? Math.round(Number(safeDiag.avgResolverConfidence) * 100) : null;
    const avgContext = Number.isFinite(Number(safeDiag.avgContextConfidence)) ? Math.round(Number(safeDiag.avgContextConfidence) * 100) : null;
    const topRiskFlags = Array.isArray(safeDiag.topRiskFlags) ? safeDiag.topRiskFlags : [];
    const topRiskText = topRiskFlags.length
      ? topRiskFlags.slice(0, 2).map((row) => `${row.flag}x${row.count}`).join(', ')
      : 'none';

    return `
      <details class="results-intel-row">
        <summary class="results-intel-row-summary" aria-label="Toggle evaluator summary for ${escapeHtml(playerName)}">
          <div class="results-intel-row-left">
            <strong>${escapeHtml(playerName)}</strong>
            <small>Engine ${escapeHtml(modeBadge)} | ${escapeHtml(statusText)}</small>
          </div>
          <div class="results-intel-row-right">
            <span class="results-intel-badge">${escapeHtml(modeBadge)}</span>
            <span class="results-intel-confidence">${avgConfidence}%</span>
          </div>
        </summary>
        <div class="results-intel-row-body">
          <div class="results-intel-mini-grid" aria-label="Evaluator trace details">
            <span><b>Trusted</b> ${trustedCount}/${evaluationCount}</span>
            <span><b>Resolve</b> ${avgResolver == null ? 'n/a' : `${avgResolver}%`}</span>
            <span><b>Context</b> ${avgContext == null ? 'n/a' : `${avgContext}%`}</span>
            <span><b>Risks</b> ${escapeHtml(topRiskText)}</span>
          </div>
        </div>
      </details>
    `;
  }).join('');

  return `
    <details class="results-intel-panel">
      <summary class="results-intel-panel-summary" aria-label="Toggle evaluator trace panel">
        <div class="results-intel-panel-title-wrap">
          <strong>Evaluator Trace</strong>
          <small>Per-player engine + trust summary</small>
        </div>
        <span class="results-intel-panel-count">${rows.length}</span>
      </summary>
      <div class="results-intel-panel-body">
        ${markup}
      </div>
    </details>
  `;
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
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
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
                  <p><b>${voteImpact}:</b> ${escapeHtml(getRadialBubblePrimaryNote(voteSlice, voteImpact))}</p>
                  <small>${escapeHtml(buildRadialSliceHiddenNotesLabel(voteSlice, 'vote'))}</small>
                </article>

                <article
                  class="radial-bubble intel"
                >
                  <h5>Intel ${formatSignedNumber(summary.intelPoints)} • ${shares.intel}%</h5>
                  <p><b>${intelImpact}:</b> ${escapeHtml(getRadialBubblePrimaryNote(intelSlice, intelImpact))}</p>
                  <small>${escapeHtml(buildRadialSliceHiddenNotesLabel(intelSlice, 'intel'))}</small>
                </article>

                <article
                  class="radial-bubble core"
                >
                  <h5>Other ${formatSignedNumber(summary.corePoints)} • ${shares.core}%</h5>
                  <p><b>${coreImpact}:</b> ${escapeHtml(getRadialBubblePrimaryNote(coreSlice, coreImpact))}</p>
                  <small>${escapeHtml(buildRadialSliceHiddenNotesLabel(coreSlice, 'core'))}</small>
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
    scoringMeta.innerHTML = buildRoundScoringMetaText(data && data.packMeta);
  }

  const intelSummaryContainer = document.getElementById('resultsIntelSummary');
  if (intelSummaryContainer) {
    const diagnosticsMarkup = buildRoundIntelDiagnosticsMarkup(data.roundIntelDiagnostics || {}, data.roundIntelSummary || {});
    if (diagnosticsMarkup) {
      intelSummaryContainer.style.display = 'block';
      intelSummaryContainer.innerHTML = diagnosticsMarkup;
    } else {
      intelSummaryContainer.style.display = 'none';
      intelSummaryContainer.innerHTML = '';
    }
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
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
  playWinSound();
  const tie = data && data.isTie === true;
  showToast(tie ? '🤝 Final round locked with a tie.' : '🏁 Final round tally locked.', 'info', 2200);
});

// ========================
// FINAL LEADERBOARD
// ========================
socket.on('gameEnded', (data) => {
  clearTimers();
  gameState.activePackMeta = normalizePackMeta(data && data.packMeta) || resolveActivePackMeta();
  playWinSound();
  setTimeout(() => createConfetti(), 300);
  setFinalPackMetaLine(data && data.packMeta);
  const finalStandings = Array.isArray(data && data.finalLeaderboard) ? data.finalLeaderboard : [];

  const placeholderImage = buildMissingWinnerImage();
  const winnerGallery = document.getElementById('finalWinnerCharacters');
  const finalContainerRoot = document.querySelector('.final-container-modern');
  if (finalContainerRoot) {
    finalContainerRoot.classList.remove('from-round4-archive');
    finalContainerRoot.removeAttribute('data-final-view');
    const staleArchiveBackbar = finalContainerRoot.querySelector('.final-archive-backbar');
    if (staleArchiveBackbar) staleArchiveBackbar.remove();
  }
  if (winnerGallery && finalContainerRoot) {
    const dockedFinalList = winnerGallery.querySelector('#finalLeaderboard');
    const dockedFinalActions = winnerGallery.querySelector('.final-actions-modern');
    if (dockedFinalList) finalContainerRoot.appendChild(dockedFinalList);
    if (dockedFinalActions) finalContainerRoot.appendChild(dockedFinalActions);
  }
  if (winnerGallery) {
    const legacyWinnerCharacters = Array.isArray(data.winnerCharacters) ? data.winnerCharacters : [];
    const championCharacters = Array.isArray(data.winnerTeamCharacters) && data.winnerTeamCharacters.length
      ? data.winnerTeamCharacters
      : legacyWinnerCharacters;
    const eliteShowcaseCharacters = Array.isArray(data.eliteFinalSix) && data.eliteFinalSix.length
      ? data.eliteFinalSix
      : championCharacters;
    const eliteMeta = data && data.eliteFinalSixMeta && typeof data.eliteFinalSixMeta === 'object'
      ? data.eliteFinalSixMeta
      : {};
    const usingGlobalEliteShowcase = Array.isArray(data.eliteFinalSix) && data.eliteFinalSix.length > 0;
    try {
      const prefetchPool = []
        .concat(Array.isArray(eliteShowcaseCharacters) ? eliteShowcaseCharacters : [])
        .concat(Array.isArray(championCharacters) ? championCharacters : []);
      if (prefetchPool.length) {
        scheduleCharacterCardBlurbPrefetch(prefetchPool, {
          context: 'final-screen',
          maxEntries: 18,
          warmTop: 4
        });
      }
    } catch (prefetchError) {
    }
    if (eliteShowcaseCharacters.length || championCharacters.length) {
      const stats = data && data.winnerTeamStats ? data.winnerTeamStats : {};
      const safeMVP = escapeHtml(stats.mvp || 'N/A');
      const safeChampionName = escapeHtml((data && data.winner && data.winner.name) || 'Champion');
      const teamOVR = Number(stats.teamOVR) || 0;
      const round4Points = Number(stats.round4Points) || 0;
      const chemistryBonus = Number(stats.chemistryBonus) || 0;
      const chemistryLabel = chemistryBonus >= 0 ? `+${chemistryBonus}` : String(chemistryBonus);
      const rarityScore = Number(stats.rarityScore) || 0;
      const pickCountForRarity = Number(stats.picks) || championCharacters.length || 6;
      const rarityMax = Math.max(1, pickCountForRarity * 7);
      const rarityPercent = Math.max(0, Math.min(100, Math.round((rarityScore / rarityMax) * 100)));
      const rarityGems = '◆'.repeat(Math.max(1, Math.min(5, Math.round(rarityPercent / 20))));
      const avgDraftValue = championCharacters.length
        ? Math.round(
          championCharacters.reduce((acc, entry) => acc + (Number(entry && entry.valueVsDraftExpected) || 0), 0)
          / championCharacters.length
        )
        : 0;
      const avgDraftValueLabel = avgDraftValue >= 0 ? `+${avgDraftValue}` : `${avgDraftValue}`;
      const powerIndex = Math.max(
        0,
        Math.round((teamOVR * 0.54) + (round4Points * 0.34) + (rarityScore * 0.18) + (chemistryBonus * 2.25))
      );
      const powerTier = powerIndex >= 140 ? 'S+' : powerIndex >= 120 ? 'S' : powerIndex >= 98 ? 'A' : powerIndex >= 82 ? 'B' : 'C';
      const teamOvrClass = teamOVR >= 92 ? 'ovr-elite' : teamOVR >= 86 ? 'ovr-high' : teamOVR >= 78 ? 'ovr-mid' : 'ovr-low';
      const showcaseAverageOVR = Number(eliteMeta.averageOVR) || (eliteShowcaseCharacters.length
        ? Math.round(eliteShowcaseCharacters.reduce((sum, entry) => sum + (Number(entry && entry.ovr) || 0), 0) / eliteShowcaseCharacters.length)
        : 0);
      const showcaseTeamsRepresented = Number(eliteMeta.teamsRepresented) || new Set(
        eliteShowcaseCharacters.map((entry) => entry && entry.ownerName).filter(Boolean)
      ).size;
      const championEliteCount = Number(eliteMeta.championMembers) || eliteShowcaseCharacters.filter((entry) => entry && entry.isChampionMember).length;
      const winnerScore = Number(finalStandings[0] && finalStandings[0].score) || 0;
      const runnerScore = Number(finalStandings[1] && finalStandings[1].score);
      const finalMargin = Number.isFinite(runnerScore) ? (winnerScore - runnerScore) : null;
      const finalMarginLabel = finalMargin == null
        ? 'No runner-up data'
        : (finalMargin === 0 ? 'Photo-finish tie' : `Final margin ${finalMargin > 0 ? '+' : ''}${finalMargin}`);
      const bridgeNarrative = usingGlobalEliteShowcase
        ? 'Round 4 reveals where everyone lands. Final Results now splits the score champion from the league-wide elite OVR showcase so both payoffs stay readable.'
        : 'Round 4 locks placement. Final Results closes the ceremony with standings and the champion squad breakdown.';
      const podiumPreviewMarkup = finalStandings.slice(0, 3).map((entry, idx) => {
        const safeName = escapeHtml(entry && entry.name ? entry.name : `Player ${idx + 1}`);
        const score = Number(entry && entry.score) || 0;
        const rankLabel = idx === 0 ? 'Champion' : idx === 1 ? 'Runner-up' : '3rd';
        return `
          <li class="final-podium-preview-row">
            <span class="final-podium-preview-rank">${rankLabel}</span>
            <span class="final-podium-preview-name">${safeName}</span>
            <strong class="final-podium-preview-score">${score} pts</strong>
          </li>
        `;
      }).join('');

      const compactSlots = eliteShowcaseCharacters.map((entry, index) => {
        const safeName = escapeHtml(entry && entry.character ? entry.character : 'Unknown');
        const rawImage = entry && entry.imageUrl ? String(entry.imageUrl).trim() : '';
        const imageUrl = rawImage.startsWith('//') ? `https:${rawImage}` : (rawImage || placeholderImage);
        const ownerName = entry && entry.ownerName ? String(entry.ownerName) : '';
        const ownerAbbr = ownerName
          ? ownerName.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 3).toUpperCase()
          : '';
        const isChampionMember = entry && entry.isChampionMember === true;
        const eliteRank = Number(entry && entry.eliteRank) || (index + 1);
        return `
          <div class="winner-compact-slot ${rawImage ? '' : 'missing'} ${isChampionMember ? 'champion-member' : 'non-champion'}" data-slot="${index + 1}" title="${safeName}${ownerName ? ` • ${escapeHtml(ownerName)}` : ''}">
            <img
              src="${escapeHtml(imageUrl)}"
              alt="${safeName}"
              loading="lazy"
              decoding="async"
              onerror="this.onerror=null;this.src='${placeholderImage}';this.closest('.winner-compact-slot')?.classList.add('missing');"
            >
            <span class="winner-compact-index">${eliteRank}</span>
            ${ownerAbbr ? `<span class="winner-compact-owner ${isChampionMember ? 'champion' : ''}" aria-label="Owned by ${escapeHtml(ownerName)}">${escapeHtml(ownerAbbr)}</span>` : ''}
          </div>
        `;
      }).join('');

      const expandedSlots = eliteShowcaseCharacters.map((entry, index) => {
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
        const ownerName = escapeHtml(entry && entry.ownerName ? entry.ownerName : 'Unknown Team');
        const ownerFinalRank = Number(entry && entry.ownerFinalRank) || 0;
        const eliteRank = Number(entry && entry.eliteRank) || (index + 1);
        const isChampionMember = entry && entry.isChampionMember === true;
        const evalTrustPct = Math.max(0, Math.min(100, Number(entry && entry.evalTrustPct) || 0));
        const evalStatusLabel = escapeHtml(entry && entry.evalStatusLabel ? entry.evalStatusLabel : (entry && entry.evalStatus ? entry.evalStatus : 'n/a'));
        const evalEngineMode = escapeHtml(entry && entry.evalEngineMode ? entry.evalEngineMode : 'legacy');
        return `
          <article class="winner-char-card winner-flip-card ${rarityClass} tier-${ovrToneClass} ${rawImage ? '' : 'missing'} ${isChampionMember ? 'champion-member' : ''}" data-slot="${index + 1}" role="button" tabindex="0" aria-label="Flip ${safeName} card">
            <div class="winner-flip-inner">
              <div class="winner-flip-face winner-flip-front">
                <span class="winner-slot">${eliteRank}</span>
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
                  <span class="winner-char-owner ${isChampionMember ? 'champion' : ''}">${ownerName}</span>
                  <span class="winner-char-trace">${evalEngineMode.toUpperCase()} ${evalTrustPct}%</span>
                </div>
                <div class="winner-char-elite-badges">
                  <span class="winner-char-badge elite-rank">Elite #${eliteRank}</span>
                  ${ownerFinalRank ? `<span class="winner-char-badge team-rank">Team #${ownerFinalRank}</span>` : ''}
                  ${isChampionMember ? '<span class="winner-char-badge champion">Champion</span>' : ''}
                </div>
                <div class="winner-flip-hint">Tap to flip</div>
              </div>
              <div class="winner-flip-face winner-flip-back">
                <div class="winner-back-title">${safeName}</div>
                <div class="winner-back-grid">
                  <div><span>Elite Rank</span><strong>#${eliteRank}</strong></div>
                  <div><span>Owner</span><strong>${ownerName}</strong></div>
                  <div><span>Tier</span><strong>${ovrTier}</strong></div>
                  <div><span>Type</span><strong>${characterType}</strong></div>
                  <div><span>Source</span><strong>${source}</strong></div>
                  <div><span>Draft</span><strong>R${draftRound} · Pick ${draftPick}</strong></div>
                  <div><span>Trace</span><strong>${evalEngineMode.toUpperCase()} ${evalTrustPct}%</strong></div>
                  <div><span>Status</span><strong>${evalStatusLabel}</strong></div>
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
        <section class="winner-squad-stage" aria-label="${usingGlobalEliteShowcase ? 'Global Top 6 Profiles showcase' : 'Champion squad stage'}">
          <button class="winner-squad-compact" type="button" aria-expanded="false" aria-controls="winnerSquadExpanded" aria-label="${usingGlobalEliteShowcase ? 'Expand Top 6 Profiles showcase' : 'Expand Champion Squad'}">
            <div class="winner-compact-title">${usingGlobalEliteShowcase ? '🏆 GLOBAL TOP 6 PROFILES' : '🏆 TOP 6 PROFILES'}</div>
            <div class="winner-compact-lineup">${compactSlots}</div>
            <div class="winner-compact-stats" aria-label="${usingGlobalEliteShowcase ? 'Champion and Top 6 showcase stats' : 'Champion stats'}">
              <span class="winner-stat-chip champion">Champion: ${safeChampionName}</span>
              <span class="winner-stat-chip mvp">MVP: ${safeMVP}</span>
              <span class="winner-stat-chip ovr ${teamOvrClass}">Champion Team OVR: ${teamOVR}</span>
              <span class="winner-stat-chip">Champion Chemistry: ${chemistryLabel}</span>
              <span class="winner-stat-chip">Champion Rarity: ${rarityScore}</span>
              <span class="winner-stat-chip">Champion Power Index: ${powerIndex}</span>
              <span class="winner-stat-chip">Avg Draft Value: ${avgDraftValueLabel}</span>
              ${usingGlobalEliteShowcase ? `<span class="winner-stat-chip elite-meta">Top 6 Avg OVR: ${showcaseAverageOVR}</span>` : ''}
              ${usingGlobalEliteShowcase ? `<span class="winner-stat-chip elite-meta">Teams in Top 6: ${showcaseTeamsRepresented}</span>` : ''}
              ${usingGlobalEliteShowcase ? `<span class="winner-stat-chip elite-meta">Champion Picks in Top 6: ${championEliteCount}/6</span>` : ''}
            </div>
            <div class="winner-compact-hint">${usingGlobalEliteShowcase ? 'Tap to open global Top 6 showcase • Tap cards to flip' : 'Tap to morph into full squad intel • Tap cards to flip'}</div>
          </button>
          <div id="winnerSquadExpanded" class="winner-squad-shell winner-squad-shell-expanded" role="region" aria-label="${usingGlobalEliteShowcase ? 'Global Top 6 Profiles showcase expanded' : 'Champion team expanded'}" aria-hidden="true">
          <button class="winner-squad-close" type="button" aria-label="${usingGlobalEliteShowcase ? 'Close Global Top 6 Profiles Showcase' : 'Close Champion Squad'}">✕</button>
          <div class="winner-squad-banner">${usingGlobalEliteShowcase ? '🏆 GLOBAL TOP 6 PROFILES • LEAGUE SHOWCASE' : '🏆 TOP 6 PROFILES • CHAMPION BREAKDOWN'}</div>
          <div class="winner-squad-tools">
            <button class="winner-flip-all" type="button" aria-pressed="false">🃏 FLIP ALL</button>
          </div>
          <div class="winner-expanded-stats" aria-label="Champion detail stats">
            <div class="winner-expanded-stat mvp wide"><span>MVP</span><strong>${safeMVP} (${Number(stats.mvpOVR) || 0} OVR)</strong></div>
            <div class="winner-expanded-stat team-ovr"><span>Champion Team OVR</span><strong class="${teamOvrClass}">${teamOVR}</strong></div>
            <div class="winner-expanded-stat power"><span>Champion Power Index</span><strong>${powerIndex}</strong><em>Tier ${powerTier}</em></div>
            <div class="winner-expanded-stat rarity wide"><span>Champion Rarity Score</span><div class="rarity-topline"><strong>${rarityScore}</strong><strong class="rarity-rareplus">Rare+: ${Number(stats.rarePlusCount) || 0}/${Number(stats.picks) || championCharacters.length}</strong></div><div class="rarity-meter" aria-hidden="true"><span style="width:${rarityPercent}%"></span></div><div class="rarity-gems" aria-label="Rarity intensity">${rarityGems}</div></div>
            <div class="winner-expanded-stat"><span>Champion Chemistry</span><strong>${chemistryLabel}</strong></div>
            <div class="winner-expanded-stat"><span>Avg Draft Value</span><strong class="${avgDraftValue >= 0 ? 'plus' : 'minus'}">${avgDraftValueLabel}</strong></div>
            ${usingGlobalEliteShowcase ? `<div class="winner-expanded-stat elite wide"><span>Top 6 Profiles Snapshot</span><strong>Avg OVR ${showcaseAverageOVR} • Teams ${showcaseTeamsRepresented}</strong><em>Champion entries in Top 6: ${championEliteCount}/6</em></div>` : ''}
          </div>
          <div class="winner-char-gallery">
            ${expandedSlots}
          </div>
          <div class="winner-squad-footer">${usingGlobalEliteShowcase ? 'Top 6 Profiles by final OVR. Champion result remains score-based.' : 'Top 6 Profiles.'}</div>
          </div>
        </section>
      `;

      const initialSquadStage = winnerGallery.querySelector('.winner-squad-stage');
      if (initialSquadStage) {
        const ceremonyShell = document.createElement('section');
        ceremonyShell.className = 'final-ceremony-shell';
        ceremonyShell.innerHTML = `
          <header class="final-ceremony-hero" aria-label="Round 4 to final bridge summary">
            <div class="final-ceremony-eyebrow">Round 4 -> Final Ceremony</div>
            <h2 class="final-ceremony-headline">${safeChampionName} closes the match</h2>
            <p class="final-ceremony-subtitle">${bridgeNarrative}</p>
            <div class="final-ceremony-kpis" aria-label="Champion quick summary">
              <span class="final-ceremony-kpi champion">Champion ${safeChampionName}</span>
              <span class="final-ceremony-kpi">Champion R4 ${round4Points} pts</span>
              <span class="final-ceremony-kpi ${teamOvrClass}">Champion Team OVR ${teamOVR}</span>
              <span class="final-ceremony-kpi">Champion Power ${powerIndex}</span>
              <span class="final-ceremony-kpi">${finalMarginLabel}</span>
              ${usingGlobalEliteShowcase ? `<span class="final-ceremony-kpi">Top 6 Split ${championEliteCount}/6</span>` : ''}
            </div>
          </header>
          <div class="final-ceremony-tabs" role="tablist" aria-label="Final result views">
            <button type="button" class="final-ceremony-tab is-active" data-final-view="story" role="tab" aria-selected="true" aria-controls="finalCeremonyPanelStory">Bridge</button>
            <button type="button" class="final-ceremony-tab" data-final-view="elite" role="tab" aria-selected="false" aria-controls="finalCeremonyPanelElite">Top 6 Profiles</button>
            <button type="button" class="final-ceremony-tab" data-final-view="standings" role="tab" aria-selected="false" aria-controls="finalCeremonyPanelStandings">Standings</button>
          </div>
          <section id="finalCeremonyPanelStory" class="final-ceremony-panel is-active" data-final-panel="story" role="tabpanel" aria-label="Bridge summary">
            <div class="final-bridge-grid">
              <article class="final-bridge-card">
                <h3>Ceremony Handoff</h3>
                <p>Round 4 handles the placement drama. Final Results now gives three clean views so mobile players can focus one layer at a time.</p>
                <ul class="final-bridge-list">
                  <li>MVP: ${safeMVP}</li>
                  <li>Champion Chemistry: ${chemistryLabel} | Champion Rarity: ${rarityScore}</li>
                  <li>Avg Draft Value: ${avgDraftValueLabel} | Power Tier: ${powerTier}</li>
                  ${usingGlobalEliteShowcase ? `<li>Top 6 Avg OVR: ${showcaseAverageOVR} | Teams: ${showcaseTeamsRepresented}</li>` : ''}
                </ul>
              </article>
              <article class="final-bridge-card podium">
                <h3>Podium Preview</h3>
                <ol class="final-podium-preview" aria-label="Top finish preview">
                  ${podiumPreviewMarkup || '<li class="final-podium-preview-empty">Standings unavailable.</li>'}
                </ol>
                <div class="final-bridge-actions">
                  <button type="button" class="final-bridge-jump" data-final-jump="elite">Open Top 6 Profiles</button>
                  <button type="button" class="final-bridge-jump alt" data-final-jump="standings">Open Standings</button>
                </div>
              </article>
            </div>
          </section>
          <section id="finalCeremonyPanelElite" class="final-ceremony-panel" data-final-panel="elite" role="tabpanel" aria-label="Top 6 Profiles showcase" hidden></section>
          <section id="finalCeremonyPanelStandings" class="final-ceremony-panel" data-final-panel="standings" role="tabpanel" aria-label="Final standings" hidden>
            <div class="final-standings-intro">
              <div>
                <strong>Scoreboard Verdict</strong>
                <p>Score-based final standings with per-round breakdowns (separate from the Top 6 OVR showcase).</p>
              </div>
              <button type="button" class="final-bridge-jump alt" data-final-jump="elite">Back to Top 6 Profiles</button>
            </div>
            <div id="finalStandingsMount"></div>
          </section>
          <div class="final-ceremony-actions-tray" aria-label="Final actions">
            <div id="finalActionsMount"></div>
          </div>
        `;
        const elitePanel = ceremonyShell.querySelector('[data-final-panel=\"elite\"]');
        if (elitePanel) elitePanel.appendChild(initialSquadStage);
        winnerGallery.innerHTML = '';
        winnerGallery.appendChild(ceremonyShell);
      }

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

      const ceremonyTabs = Array.from(winnerGallery.querySelectorAll('.final-ceremony-tab'));
      const ceremonyPanels = Array.from(winnerGallery.querySelectorAll('.final-ceremony-panel'));
      const ceremonyJumpButtons = Array.from(winnerGallery.querySelectorAll('[data-final-jump]'));
      const setCeremonyView = (requestedView) => {
        const view = ['story', 'elite', 'standings'].includes(String(requestedView)) ? String(requestedView) : 'story';
        if (view !== 'elite') closeExpanded();
        ceremonyTabs.forEach((tabButton) => {
          const active = (tabButton.getAttribute('data-final-view') || '') === view;
          tabButton.classList.toggle('is-active', active);
          tabButton.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        ceremonyPanels.forEach((panel) => {
          const active = (panel.getAttribute('data-final-panel') || '') === view;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
        if (finalContainer) finalContainer.setAttribute('data-final-view', view);
      };

      ceremonyTabs.forEach((tabButton) => {
        tabButton.addEventListener('click', () => {
          setCeremonyView(tabButton.getAttribute('data-final-view') || 'story');
        });
      });

      ceremonyJumpButtons.forEach((button) => {
        button.addEventListener('click', () => {
          setCeremonyView(button.getAttribute('data-final-jump') || 'story');
        });
      });

      setCeremonyView('story');

      try {
        if (window.__lobbyAudio && typeof window.__lobbyAudio.playHighestOVRCardBlurb === 'function') {
          Promise.resolve(window.__lobbyAudio.playHighestOVRCardBlurb(eliteShowcaseCharacters, {
            context: 'final-screen-autoplay',
            dedupeFinale: true,
            throttleMs: 100
          })).then((audioResult) => {
            if (!audioResult || (audioResult.mode !== 'no-audio-fallback' && audioResult.mode !== 'no-audio-library-empty')) return;
            const prompt = String(audioResult.prompt || '').trim() || 'No quote clip found yet. Playing fallback sting.';
            const sig = `${audioResult.signature || ''}|${prompt}`;
            if (audioState.lastFinaleNoAudioToastSig === sig) return;
            audioState.lastFinaleNoAudioToastSig = sig;
            showToast(`🎙️ ${prompt}`, 'info', 2400);
          }).catch(() => {});
        }
      } catch (finalAudioError) {
        console.warn('[final results] audio cue failed:', finalAudioError);
      }
    } else {
      winnerGallery.innerHTML = '';
    }
  }

  const final = document.getElementById('finalLeaderboard');
  if (!final) {
    showScreen('finalScreen');
    showToast('ðŸŽ‰ Game Over! Check the results!', 'info');
    return;
  }
  final.innerHTML = '';

  finalStandings.forEach((entry, idx) => {
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

  if (winnerGallery) {
    const standingsMount = winnerGallery.querySelector('#finalStandingsMount');
    const actionsMount = winnerGallery.querySelector('#finalActionsMount');
    const finalActions = document.querySelector('.final-actions-modern');
    if (standingsMount) standingsMount.appendChild(final);
    if (actionsMount && finalActions) actionsMount.appendChild(finalActions);
  }

  let renderedInRound4Ceremony = false;
  try {
    if (typeof window.renderRound4FinaleCeremony === 'function') {
      renderedInRound4Ceremony = window.renderRound4FinaleCeremony(data) === true;
    }
  } catch (round4FinaleError) {
    console.warn('[final results] round4 finale render failed:', round4FinaleError);
  }

  if (renderedInRound4Ceremony) {
    showToast('Final verdict revealed inside Round 4. Full archive is available.', 'info');
    return;
  }

  try {
    if (window.__lobbyAudio && typeof window.__lobbyAudio.setMusicScene === 'function') {
      window.__lobbyAudio.setMusicScene('finale', { force: true, transition: 'crescendo', exclusive: true });
    }
  } catch (finalMusicError) {
    console.warn('[final results] music scene failed:', finalMusicError);
  }

  showScreen('finalScreen');
  showToast('Game Over! Check the results!', 'info');
});

function sendPlayAgain() {
  socket.emit('playAgain');
  showToast('Starting new game with same players...', 'info');
}

function openFinalResultsArchive() {
  const finalContainer = document.querySelector('.final-container-modern');
  if (finalContainer) {
    finalContainer.classList.add('from-round4-archive');
    if (!finalContainer.querySelector('.final-archive-backbar')) {
      const backbar = document.createElement('div');
      backbar.className = 'final-archive-backbar';
      backbar.innerHTML = `
        <button type="button" class="final-archive-backbtn" onclick="returnToRound4Finale()">
          <span aria-hidden="true">←</span>
          <span>Back to Round 4 Finale</span>
        </button>
        <div class="final-archive-backmeta">
          <strong>Final Results Archive</strong>
          <small>Detailed archive view (Round 4 remains the primary finale)</small>
        </div>
      `;
      finalContainer.insertBefore(backbar, finalContainer.firstChild);
    }
  }
  showScreen('finalScreen');

  const standingsTab = document.querySelector('.final-ceremony-tab[data-final-view="standings"]');
  if (standingsTab && typeof standingsTab.click === 'function') {
    standingsTab.click();
  }
}

function returnToRound4Finale() {
  showScreen('round4EvalScreen');
  const finale = document.querySelector('.eval-finale-ceremony');
  if (finale) {
    try {
      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      finale.scrollIntoView(reduceMotion ? { block: 'start' } : { behavior: 'smooth', block: 'start' });
    } catch (error) {
    }
  }
}

function goToLobby() {
  if (confirm('Are you sure? This will return to the lobby.')) {
    clearTimers();
    resetDraftWaitIntelPreview({ hide: true });
    chatPingState.roomCode = '';
    resetChatTabPing();
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
void runStartupBootstrapPreflight();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audioState.unlocked) {
    ensureAudioRunning();
    applyAudioLevels();
  }
  syncMusicLoopState();
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
window.openFinalResultsArchive = openFinalResultsArchive;
window.returnToRound4Finale = returnToRound4Finale;
window.goToLobby = goToLobby;

if (shouldAutoOpenRound4Loading()) {
  window.setTimeout(() => {
    openRound4LoadingDebugView();
  }, 0);
}
