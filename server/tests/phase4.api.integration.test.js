const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function makeTempStorePath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobby-phase4-api-'));
  return path.join(tempDir, 'meta.store.json');
}

async function waitForServerReady(baseUrl, timeoutMs = 25000) {
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

async function requestJson(url, { method = 'GET', body = null, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers && typeof headers === 'object' ? headers : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_error) {
    throw new Error(`non_json_response status=${response.status} body=${text.slice(0, 240)}`);
  }
  return {
    status: response.status,
    ok: response.ok,
    body: json
  };
}

async function createGuest(baseUrl, { displayName, guestAlias }) {
  const response = await requestJson(`${baseUrl}/api/identity/guest-session`, {
    method: 'POST',
    body: { displayName, guestAlias }
  });
  assert.strictEqual(response.status, 201, 'guest should be created');
  return String(response.body.user.userId || '');
}

async function main() {
  const port = 39500 + Math.floor(Math.random() * 300);
  const baseUrl = `http://127.0.0.1:${port}`;
  const storePath = makeTempStorePath();
  const adminToken = `phase4-token-${Date.now()}`;
  const serverPath = path.join(process.cwd(), 'server.js');

  const serverProc = spawn(process.execPath, [serverPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      META_STORE_PATH: storePath,
      META_PROGRESS_ENABLED: '1',
      META_ACHIEVEMENTS_ENABLED: '1',
      SOLO_ENGINE_ENABLED: '1',
      SOLO_ENGINE_EXPOSE_SOLUTION: '1',
      SEASON_LAYER_ENABLED: '1',
      SEASON_AUTO_OPEN_DEFAULT: '1',
      SEASON_ADMIN_TOKEN: adminToken,
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

    const flags = await requestJson(`${baseUrl}/api/meta/flags`);
    assert.strictEqual(flags.status, 200, 'flags endpoint should succeed');
    assert.strictEqual(Boolean(flags.body.seasonLayerEnabled), true, 'season layer should be enabled');

    const active = await requestJson(`${baseUrl}/api/seasons/active`);
    assert.strictEqual(active.status, 200, 'active season endpoint should succeed');
    assert.strictEqual(Boolean(active.body && active.body.ok), true, 'active season payload should be ok');

    const userA = await createGuest(baseUrl, { displayName: 'Phase4 API A', guestAlias: 'dev:phase4-api-a' });
    const userB = await createGuest(baseUrl, { displayName: 'Phase4 API B', guestAlias: 'dev:phase4-api-b' });

    const start = await requestJson(`${baseUrl}/api/solo/runs/start`, {
      method: 'POST',
      body: { userId: userA, modeId: 'daily_cipher_clash' }
    });
    assert.strictEqual(start.status, 201, 'solo start should create');
    const runId = String(start.body.run.runId || '');
    const solution = start.body.challenge.debugSolutionBySlot;
    await wait(1800);

    const submit = await requestJson(`${baseUrl}/api/solo/runs/submit`, {
      method: 'POST',
      body: {
        userId: userA,
        runId,
        idempotencyKey: 'phase4-api-submit-1',
        clientSubmittedAtMs: Date.now(),
        picks: solution
      }
    });
    assert.strictEqual(submit.status, 200, 'solo submit should succeed');

    const finalize = await requestJson(`${baseUrl}/api/solo/runs/finalize`, {
      method: 'POST',
      body: {
        userId: userA,
        runId,
        idempotencyKey: 'phase4-api-finalize-1',
        clientFinalizedAtMs: Date.now()
      }
    });
    assert.strictEqual(finalize.status, 201, 'solo finalize should succeed');
    assert.strictEqual(Boolean(finalize.body.summary.scored), true, 'solo finalize should be scored');

    const partyEvent = await requestJson(`${baseUrl}/api/seasons/party/results`, {
      method: 'POST',
      body: {
        eventId: 'phase4-api-party-1',
        matchId: 'phase4-api-party-1',
        participants: [
          { userId: userA, placement: 1, teamworkScore: 8, sportsmanshipScore: 5, won: true },
          { userId: userB, placement: 2, teamworkScore: 7, sportsmanshipScore: 4, won: false }
        ]
      }
    });
    assert.strictEqual(partyEvent.status, 201, 'party result should create');

    const partyEventDup = await requestJson(`${baseUrl}/api/seasons/party/results`, {
      method: 'POST',
      body: {
        eventId: 'phase4-api-party-1',
        matchId: 'phase4-api-party-1',
        participants: [
          { userId: userA, placement: 1, teamworkScore: 8, sportsmanshipScore: 5, won: true },
          { userId: userB, placement: 2, teamworkScore: 7, sportsmanshipScore: 4, won: false }
        ]
      }
    });
    assert.strictEqual(partyEventDup.status, 200, 'duplicate party event should be idempotent');
    assert.strictEqual(Boolean(partyEventDup.body.idempotent), true, 'duplicate party event should mark idempotent');

    const soloBoard = await requestJson(`${baseUrl}/api/seasons/leaderboards/solo?limit=20&userId=${encodeURIComponent(userA)}`);
    assert.strictEqual(soloBoard.status, 200, 'solo season leaderboard should succeed');
    assert.strictEqual(Number(soloBoard.body.totalEntries) >= 1, true, 'solo season leaderboard should have entries');

    const partyBoard = await requestJson(`${baseUrl}/api/seasons/leaderboards/party?limit=20&userId=${encodeURIComponent(userA)}`);
    assert.strictEqual(partyBoard.status, 200, 'party season leaderboard should succeed');
    assert.strictEqual(Number(partyBoard.body.totalEntries) >= 2, true, 'party season leaderboard should have entries');

    const profile = await requestJson(`${baseUrl}/api/seasons/profile/${encodeURIComponent(userA)}?includeHistory=1`);
    assert.strictEqual(profile.status, 200, 'season profile should succeed');
    assert.strictEqual(Boolean(profile.body.profile), true, 'season profile payload should exist');

    const claim = await requestJson(`${baseUrl}/api/seasons/quests/claim`, {
      method: 'POST',
      body: {
        userId: userA,
        milestoneId: 'milestone_20',
        idempotencyKey: 'phase4-api-claim-1'
      }
    });
    assert.strictEqual(claim.status, 201, 'milestone claim should create');

    const claimDup = await requestJson(`${baseUrl}/api/seasons/quests/claim`, {
      method: 'POST',
      body: {
        userId: userA,
        milestoneId: 'milestone_20',
        idempotencyKey: 'phase4-api-claim-1'
      }
    });
    assert.strictEqual(claimDup.status, 200, 'duplicate milestone claim should be idempotent');
    assert.strictEqual(Boolean(claimDup.body.idempotent), true, 'duplicate milestone claim should mark idempotent');

    const dryCloseNoToken = await requestJson(`${baseUrl}/api/seasons/admin/close`, {
      method: 'POST',
      body: { dryRun: true }
    });
    assert.strictEqual(dryCloseNoToken.status, 403, 'admin close should require token');

    const dryClose = await requestJson(`${baseUrl}/api/seasons/admin/close`, {
      method: 'POST',
      headers: { 'x-season-admin-token': adminToken },
      body: { dryRun: true }
    });
    assert.strictEqual(dryClose.status, 201, 'dry-run close should return success');
    assert.strictEqual(Boolean(dryClose.body.dryRun), true, 'dry-run close should return dryRun true');

    const applyClose = await requestJson(`${baseUrl}/api/seasons/admin/close`, {
      method: 'POST',
      headers: { 'x-season-admin-token': adminToken },
      body: { dryRun: false }
    });
    assert.strictEqual(applyClose.status, 201, 'apply close should succeed');

    const applyCloseAgain = await requestJson(`${baseUrl}/api/seasons/admin/close`, {
      method: 'POST',
      headers: { 'x-season-admin-token': adminToken },
      body: { dryRun: false }
    });
    assert.strictEqual(applyCloseAgain.status, 200, 'duplicate apply close should be idempotent');
    assert.strictEqual(Boolean(applyCloseAgain.body.idempotent), true, 'duplicate close should mark idempotent');

    console.log('[Phase4 API integration] passed');
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
      console.warn(`[Phase4 API integration] server stderr:\n${stderrBuffer.trim()}`);
    }
  }
}

main().catch((error) => {
  console.error(`[Phase4 API integration] failed: ${String(error && error.message || error)}`);
  process.exit(1);
});
