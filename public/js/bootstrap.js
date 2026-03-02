const MODULE_LOAD_ORDER = [
  'js/joinEvalFallingPlaques.js?v=20260228-preflight1',
  'js/settings.js?v=20260302-interactions2',
  'js/app.js?v=20260302-preflight-voice1'
];

const EXPECTED_APP_BUILD = '20260302-preflight-voice1';
const EXPECTED_SETTINGS_BUILD = '20260302-interactions2';

let startupSettled = false;
let startupFailed = false;

function getLoadingOverlayNodes() {
  const overlay = document.getElementById('loadingOverlay');
  const spinner = overlay ? overlay.querySelector('.spinner') : null;
  const label = overlay ? overlay.querySelector('.spinner-text') : null;
  return { overlay, spinner, label };
}

function showStartupFailure(message, detail = '') {
  if (startupSettled && !startupFailed) return;
  startupFailed = true;
  startupSettled = true;

  const { overlay, spinner, label } = getLoadingOverlayNodes();
  if (!overlay || !label) return;

  overlay.classList.add('active');
  overlay.removeAttribute('aria-hidden');
  if (spinner) spinner.style.display = 'none';

  const prettyMessage = String(message || 'Startup failed').trim() || 'Startup failed';
  const prettyDetail = String(detail || '').trim();
  label.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = prettyMessage;
  label.appendChild(title);

  if (prettyDetail) {
    const sub = document.createElement('div');
    sub.style.marginTop = '8px';
    sub.style.fontSize = '0.9em';
    sub.style.opacity = '0.85';
    sub.textContent = prettyDetail;
    label.appendChild(sub);
  }

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'btn btn-primary';
  retryBtn.style.marginTop = '14px';
  retryBtn.textContent = 'Retry Startup';
  retryBtn.addEventListener('click', () => {
    window.location.reload();
  });
  label.appendChild(retryBtn);
}

function markStartupSuccess() {
  startupSettled = true;
  startupFailed = false;
  unbindStartupErrorHandlers();
  try {
    const { overlay, spinner, label } = getLoadingOverlayNodes();
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (spinner) spinner.style.display = '';
    if (label) {
      label.textContent = '⏳ Loading...';
    }
  } catch (error) {
  }
}

function summarizeError(error) {
  if (!error) return 'unknown error';
  return String(error.message || error.reason || error).slice(0, 180);
}

async function loadScriptWithRetry(src, { timeoutMs = 9000, retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const script = document.createElement('script');
        const bust = `__bootRetry=${Date.now()}-${attempt}`;
        script.src = src.includes('?') ? `${src}&${bust}` : `${src}?${bust}`;
        script.async = true;

        const finish = (ok, err) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timerId);
          script.onload = null;
          script.onerror = null;
          if (ok) resolve();
          else reject(err || new Error('script-load-failed'));
        };

        script.onload = () => finish(true);
        script.onerror = () => finish(false, new Error(`script-load-failed:${src}`));

        const timerId = window.setTimeout(() => {
          finish(false, new Error(`script-timeout:${src}`));
        }, Math.max(1200, Number(timeoutMs) || 9000));

        document.head.appendChild(script);
      });
      return true;
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 220 + (attempt * 180)));
    }
  }
  return false;
}

async function importModuleWithRetry(modulePath, { retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const bust = `__bootImport=${Date.now()}-${attempt}`;
      const href = modulePath.includes('?') ? `${modulePath}&${bust}` : `${modulePath}?${bust}`;
      await import(`/${href.replace(/^\/+/, '')}`);
      return true;
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 180 + (attempt * 140)));
    }
  }
  return false;
}

async function ensureSocketClientAvailable() {
  if (typeof window.io === 'function') return true;
  await loadScriptWithRetry('/socket.io/socket.io.js', { timeoutMs: 9000, retries: 2 });
  if (typeof window.io !== 'function') {
    throw new Error('socket-client-missing');
  }
  return true;
}

function verifyBuildConsistency() {
  try {
    const build = window.__lobbyBuild && typeof window.__lobbyBuild === 'object'
      ? window.__lobbyBuild
      : {};
    const appBuild = String(build.app || '').trim();
    const settingsBuild = String(build.settings || '').trim();
    if (appBuild !== EXPECTED_APP_BUILD || settingsBuild !== EXPECTED_SETTINGS_BUILD) {
      throw new Error(`stale-module-build app=${appBuild || 'missing'} settings=${settingsBuild || 'missing'} expected=${EXPECTED_APP_BUILD}`);
    }
    return true;
  } catch (error) {
    throw error;
  }
}

const handleStartupUnhandledRejection = (event) => {
  if (startupSettled) return;
  const reason = summarizeError(event && event.reason);
  if (/startup|bootstrap|socket|module|import|load/i.test(reason)) {
    showStartupFailure('Startup ran into an error.', reason);
  }
};

function bindStartupErrorHandlers() {
  window.addEventListener('unhandledrejection', handleStartupUnhandledRejection);
}

function unbindStartupErrorHandlers() {
  window.removeEventListener('unhandledrejection', handleStartupUnhandledRejection);
}

bindStartupErrorHandlers();

(async () => {
  try {
    await ensureSocketClientAvailable();
    for (let i = 0; i < MODULE_LOAD_ORDER.length; i += 1) {
      await importModuleWithRetry(MODULE_LOAD_ORDER[i], { retries: 1 });
    }
    verifyBuildConsistency();
    markStartupSuccess();
  } catch (error) {
    showStartupFailure('LobbyWARS could not start.', summarizeError(error));
    console.error('[startup bootstrap] failed:', error);
  }
})();
