const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function makeTempStorePath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobby-phase1-api-'));
  return path.join(tempDir, 'meta.store.json');
}

async function waitForServerReady(baseUrl, timeoutMs = 20000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/meta/flags`);
      if (response.ok) return;
    } catch (_error) {}
    await wait(250);
  }
  throw new Error('server_start_timeout');
}

async function requestJson(url, { method = 'GET', body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_error) {
    throw new Error(`non_json_response status=${response.status} body=${text.slice(0, 240)}`);
  }
  return { status: response.status, ok: response.ok, body: json };
}

async function main() {
  const port = 39100 + Math.floor(Math.random() * 400);
  const baseUrl = `http://127.0.0.1:${port}`;
  const storePath = makeTempStorePath();
  const serverPath = path.join(process.cwd(), 'server.js');

  const serverProc = spawn(process.execPath, [serverPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      META_STORE_PATH: storePath,
      META_PROGRESS_ENABLED: '1',
      META_ACHIEVEMENTS_ENABLED: '1',
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

    const guestSession = await requestJson(`${baseUrl}/api/identity/guest-session`, {
      method: 'POST',
      body: {
        displayName: 'Api Tester',
        guestAlias: 'dev:api-tester'
      }
    });
    assert.strictEqual(guestSession.status, 201, 'guest-session should create user');
    assert.strictEqual(Boolean(guestSession.body && guestSession.body.user), true, 'guest-session should return user');
    const userId = String(guestSession.body.user.userId || '');
    assert.strictEqual(Boolean(userId), true, 'userId must be present');

    const profileGet = await requestJson(`${baseUrl}/api/meta/profile/${encodeURIComponent(userId)}`);
    assert.strictEqual(profileGet.status, 200, 'profile read should succeed');

    const profilePatch = await requestJson(`${baseUrl}/api/meta/profile/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: {
        displayName: 'Api Tester Prime',
        bio: 'API integration validation.'
      }
    });
    assert.strictEqual(profilePatch.status, 200, 'profile patch should succeed');
    assert.strictEqual(String(profilePatch.body.profile.displayName), 'Api Tester Prime', 'display name should update');

    const linkAccount = await requestJson(`${baseUrl}/api/identity/link-account`, {
      method: 'POST',
      body: {
        userId,
        provider: 'discord',
        providerAccountId: 'acct_api_1',
        email: 'api.tester@example.com'
      }
    });
    assert.strictEqual(linkAccount.status, 200, 'account link should succeed');
    assert.strictEqual(String(linkAccount.body.user.kind), 'linked', 'linked account kind should be linked');

    const xpGrant = await requestJson(`${baseUrl}/api/meta/xp-grants`, {
      method: 'POST',
      body: {
        userId,
        grantId: 'grant_api_test_1',
        source: 'party_participation',
        amount: 140,
        reason: 'api_integration_round'
      }
    });
    assert.strictEqual(xpGrant.status, 201, 'first xp grant should create entry');
    assert.strictEqual(Number(xpGrant.body.grant.amountGranted), 140, 'xp amount should be applied');

    const xpGrantDuplicate = await requestJson(`${baseUrl}/api/meta/xp-grants`, {
      method: 'POST',
      body: {
        userId,
        grantId: 'grant_api_test_1',
        source: 'party_participation',
        amount: 140
      }
    });
    assert.strictEqual(xpGrantDuplicate.status, 200, 'duplicate xp grant should be idempotent');
    assert.strictEqual(Boolean(xpGrantDuplicate.body.idempotent), true, 'duplicate xp grant must be idempotent');

    const xpLedger = await requestJson(`${baseUrl}/api/meta/xp-ledger/${encodeURIComponent(userId)}?limit=10`);
    assert.strictEqual(xpLedger.status, 200, 'xp ledger read should succeed');
    assert.strictEqual(Array.isArray(xpLedger.body.entries), true, 'xp ledger entries should be an array');
    assert.strictEqual(xpLedger.body.entries.length >= 1, true, 'xp ledger should have at least one entry');

    const achievements = await requestJson(`${baseUrl}/api/meta/achievements/${encodeURIComponent(userId)}`);
    assert.strictEqual(achievements.status, 200, 'achievement read should succeed');
    assert.strictEqual(Array.isArray(achievements.body.definitions), true, 'achievement definitions should be present');
    assert.strictEqual(Array.isArray(achievements.body.unlocks), true, 'achievement unlocks should be present');

    console.log('[Phase1 API integration] passed');
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
      console.warn(`[Phase1 API integration] server stderr:\n${stderrBuffer.trim()}`);
    }
  }
}

main().catch((error) => {
  console.error(`[Phase1 API integration] failed: ${String(error && error.message || error)}`);
  process.exit(1);
});
