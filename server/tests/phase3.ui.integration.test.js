const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function waitForServerReady(baseUrl, timeoutMs = 25000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/meta/flags`);
      if (response.ok) return;
    } catch (_error) {}
    await wait(200);
  }
  throw new Error('server_start_timeout');
}

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

async function main() {
  const port = 39400 + Math.floor(Math.random() * 350);
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverPath = path.join(process.cwd(), 'server.js');

  const serverProc = spawn(process.execPath, [serverPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      META_PROGRESS_ENABLED: '1',
      META_ACHIEVEMENTS_ENABLED: '1',
      SOLO_ENGINE_ENABLED: '1',
      DUAL_HUB_UI_ENABLED: '1',
      LOBBY_TTS_STARTUP_PREWARM: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderrBuffer = '';
  serverProc.stderr.on('data', (chunk) => {
    stderrBuffer += String(chunk || '');
  });

  try {
    await waitForServerReady(baseUrl, 25000);

    const indexDoc = await fetchText(`${baseUrl}/`);
    assert.strictEqual(indexDoc.ok, true, 'index.html should load');
    assert.strictEqual(indexDoc.text.includes('id="hubNav"'), true, 'hub nav should exist');
    assert.strictEqual(indexDoc.text.includes('id="dualPathOnboarding"'), true, 'onboarding screen should exist');
    assert.strictEqual(indexDoc.text.includes('id="homeHub"'), true, 'home hub screen should exist');
    assert.strictEqual(indexDoc.text.includes('id="soloHub"'), true, 'solo hub screen should exist');
    assert.strictEqual(indexDoc.text.includes('id="profileHub"'), true, 'profile hub screen should exist');
    assert.strictEqual(indexDoc.text.includes('id="progressionHub"'), true, 'progression hub screen should exist');
    assert.strictEqual(indexDoc.text.includes('id="achievementsHub"'), true, 'achievements hub screen should exist');
    assert.strictEqual(indexDoc.text.includes('viewport-fit=cover'), true, 'viewport should include viewport-fit=cover for iOS safe areas');
    assert.strictEqual(indexDoc.text.includes('css/dual-hub.css'), true, 'dual hub stylesheet should be linked');

    const dualCss = await fetchText(`${baseUrl}/css/dual-hub.css`);
    assert.strictEqual(dualCss.ok, true, 'dual-hub.css should load');
    assert.strictEqual(dualCss.text.includes('env(safe-area-inset-top)'), true, 'dual hub css should use safe-area-inset-top');
    assert.strictEqual(dualCss.text.includes('env(safe-area-inset-bottom)'), true, 'dual hub css should use safe-area-inset-bottom');
    assert.strictEqual(dualCss.text.includes('100dvh'), true, 'dual hub css should support 100dvh');
    assert.strictEqual(dualCss.text.includes('min-height: 44px'), true, 'tap targets should enforce minimum 44px');
    assert.strictEqual(dualCss.text.includes('@media (max-width: 680px)'), true, 'mobile viewport media query should exist');

    const dualJs = await fetchText(`${baseUrl}/js/dualHub.js`);
    assert.strictEqual(dualJs.ok, true, 'dualHub.js should load');
    assert.strictEqual(dualJs.text.includes('/api/solo/runs/start'), true, 'solo start endpoint should be wired in client');
    assert.strictEqual(dualJs.text.includes('/api/solo/runs/submit'), true, 'solo submit endpoint should be wired in client');
    assert.strictEqual(dualJs.text.includes('/api/solo/runs/hint'), true, 'solo hint endpoint should be wired in client');
    assert.strictEqual(dualJs.text.includes('/api/solo/runs/finalize'), true, 'solo finalize endpoint should be wired in client');
    assert.strictEqual(dualJs.text.includes('/api/meta/profile/'), true, 'profile endpoint should be wired in client');
    assert.strictEqual(dualJs.text.includes('/api/meta/achievements/'), true, 'achievements endpoint should be wired in client');
    assert.strictEqual(dualJs.text.includes('Auto-close in'), true, 'onboarding countdown copy should be present');

    console.log('[Phase3 UI integration] passed');
  } finally {
    try {
      serverProc.kill('SIGTERM');
    } catch (_error) {}
    await wait(300);
    if (!serverProc.killed) {
      try {
        serverProc.kill('SIGKILL');
      } catch (_error) {}
    }
    if (stderrBuffer.trim()) {
      console.warn(`[Phase3 UI integration] server stderr:\n${stderrBuffer.trim()}`);
    }
  }
}

main().catch((error) => {
  console.error(`[Phase3 UI integration] failed: ${String(error && error.message || error)}`);
  process.exit(1);
});
