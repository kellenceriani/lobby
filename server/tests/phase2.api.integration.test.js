const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function makeTempStorePath() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lobby-phase2-api-'));
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
    body: {
      displayName,
      guestAlias
    }
  });
  assert.strictEqual(response.status, 201, 'guest creation should return 201');
  assert.strictEqual(Boolean(response.body && response.body.user && response.body.user.userId), true, 'guest userId should exist');
  return {
    userId: String(response.body.user.userId),
    sessionToken: String(response.body && response.body.sessionToken || '')
  };
}

function challengeSignature(challenge = {}) {
  return JSON.stringify({
    seedHash: String(challenge.seedHash || ''),
    scenarioId: String(challenge.scenarioId || ''),
    twistId: String(challenge.twistId || ''),
    candidates: (Array.isArray(challenge.candidatePool) ? challenge.candidatePool : []).map((row) => String(row.id || ''))
  });
}

function buildWeakEntries(seed = 1) {
  const n = Number(seed) || 1;
  return {
    lead: `Object ${n}`,
    anchor: `Thing ${n}`,
    wildcard: `Unknown ${n}`,
    closer: `Placeholder ${n}`
  };
}

async function runFailedAttemptSeries(baseUrl, { userId, runId, count = 2, keyPrefix = 'fail', headers = {} }) {
  let last = null;
  for (let i = 0; i < count; i += 1) {
    const entries = buildWeakEntries(i + 1);
    const submitted = await requestJson(`${baseUrl}/api/solo/runs/submit`, {
      method: 'POST',
      headers,
      body: {
        userId,
        runId,
        idempotencyKey: `${keyPrefix}-submit-${i + 1}`,
        clientSubmittedAtMs: Date.now(),
        entries
      }
    });
    assert.strictEqual(submitted.status, 200, 'failed-attempt submit should succeed');
    last = submitted;
  }
  return last;
}

async function main() {
  const port = 39300 + Math.floor(Math.random() * 400);
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
      SOLO_ENGINE_ENABLED: '1',
      SOLO_ENGINE_EXPOSE_SOLUTION: '1',
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

    const userA = await createGuest(baseUrl, { displayName: 'Solo A', guestAlias: 'dev:solo-a' });
    const userB = await createGuest(baseUrl, { displayName: 'Solo B', guestAlias: 'dev:solo-b' });
    const headersA = { 'x-lw-session': userA.sessionToken };
    const headersB = { 'x-lw-session': userB.sessionToken };

    const startA = await requestJson(`${baseUrl}/api/solo/runs/start`, {
      method: 'POST',
      headers: headersA,
      body: { userId: userA.userId, modeId: 'daily_cipher_clash' }
    });
    const startB = await requestJson(`${baseUrl}/api/solo/runs/start`, {
      method: 'POST',
      headers: headersB,
      body: { userId: userB.userId, modeId: 'daily_cipher_clash' }
    });
    assert.strictEqual(startA.status, 201, 'startA should create run');
    assert.strictEqual(startB.status, 201, 'startB should create run');
    assert.strictEqual(
      challengeSignature(startA.body.challenge),
      challengeSignature(startB.body.challenge),
      'daily challenge must be deterministic across users for the same UTC day'
    );

    const runAId = String(startA.body.run.runId || '');
    const runBId = String(startB.body.run.runId || '');
    const solutionA = startA.body.challenge.debugSolutionBySlot;
    assert.strictEqual(Boolean(solutionA && solutionA.lead), true, 'debug solution should exist in test mode');

    await wait(1700);

    const submitSolved = await requestJson(`${baseUrl}/api/solo/runs/submit`, {
      method: 'POST',
      headers: headersA,
      body: {
        userId: userA.userId,
        runId: runAId,
        idempotencyKey: 'a-submit-1',
        clientSubmittedAtMs: Date.now(),
        picks: solutionA
      }
    });
    assert.strictEqual(submitSolved.status, 200, 'solved submit should succeed');
    assert.strictEqual(Boolean(submitSolved.body.attempt && submitSolved.body.attempt.solved), true, 'attempt should be solved');
    assert.strictEqual(String(submitSolved.body.run.status), 'solved_pending_finalize', 'run should move to solved_pending_finalize');

    const submitSolvedDuplicate = await requestJson(`${baseUrl}/api/solo/runs/submit`, {
      method: 'POST',
      headers: headersA,
      body: {
        userId: userA.userId,
        runId: runAId,
        idempotencyKey: 'a-submit-1',
        clientSubmittedAtMs: Date.now(),
        picks: solutionA
      }
    });
    assert.strictEqual(submitSolvedDuplicate.status, 200, 'duplicate submit should succeed');
    assert.strictEqual(Boolean(submitSolvedDuplicate.body.idempotent), true, 'duplicate submit should be idempotent');
    assert.strictEqual(Number(submitSolvedDuplicate.body.run.attemptsUsed), 1, 'duplicate submit must not add attempts');

    const finalizeSolved = await requestJson(`${baseUrl}/api/solo/runs/finalize`, {
      method: 'POST',
      headers: headersA,
      body: {
        userId: userA.userId,
        runId: runAId,
        idempotencyKey: 'a-final-1',
        clientFinalizedAtMs: Date.now()
      }
    });
    assert.strictEqual(finalizeSolved.status, 201, 'first finalize should create completion');
    assert.strictEqual(String(finalizeSolved.body.summary.outcome), 'solved', 'runA must finalize as solved');
    assert.strictEqual(Boolean(finalizeSolved.body.summary.scored), true, 'runA should be scored');
    assert.strictEqual(Number(finalizeSolved.body.summary.finalScore) > 0, true, 'final score should be positive');

    const finalizeSolvedDuplicate = await requestJson(`${baseUrl}/api/solo/runs/finalize`, {
      method: 'POST',
      headers: headersA,
      body: {
        userId: userA.userId,
        runId: runAId,
        idempotencyKey: 'a-final-1',
        clientFinalizedAtMs: Date.now()
      }
    });
    assert.strictEqual(finalizeSolvedDuplicate.status, 200, 'duplicate finalize should be idempotent');
    assert.strictEqual(Boolean(finalizeSolvedDuplicate.body.idempotent), true, 'duplicate finalize must be idempotent');
    assert.strictEqual(
      Number(finalizeSolvedDuplicate.body.summary.finalScore),
      Number(finalizeSolved.body.summary.finalScore),
      'duplicate finalize must preserve score'
    );

    const startDailyResume = await requestJson(`${baseUrl}/api/solo/runs/start`, {
      method: 'POST',
      headers: headersA,
      body: { userId: userA.userId, modeId: 'daily_cipher_clash' }
    });
    assert.strictEqual(startDailyResume.status, 200, 'second daily start should resume existing run');
    assert.strictEqual(Boolean(startDailyResume.body.idempotent), true, 'second daily start should be idempotent');
    assert.strictEqual(Boolean(startDailyResume.body.run.practice), false, 'daily resume should remain scored run');
    assert.strictEqual(String(startDailyResume.body.run.runId), runAId, 'daily resume should return original daily run');
    assert.strictEqual(
      Number(startDailyResume.body.summary && startDailyResume.body.summary.finalScore),
      Number(finalizeSolved.body.summary.finalScore),
      'daily resume should include locked summary when run already finalized'
    );

    const startPractice = await requestJson(`${baseUrl}/api/solo/runs/start`, {
      method: 'POST',
      headers: headersA,
      body: { userId: userA.userId, modeId: 'daily_cipher_clash', practice: true }
    });
    assert.strictEqual(startPractice.status, 201, 'explicit practice run should create new run');
    assert.strictEqual(Boolean(startPractice.body.run.practice), true, 'explicit practice start should remain practice');
    const practiceRunId = String(startPractice.body.run.runId || '');
    const practiceLastAttempt = await runFailedAttemptSeries(baseUrl, {
      userId: userA.userId,
      runId: practiceRunId,
      count: 2,
      keyPrefix: 'practice-a',
      headers: headersA
    });
    assert.strictEqual(String(practiceLastAttempt.body.run.status), 'failed_pending_finalize', 'practice run should fail after max attempts');

    const finalizePractice = await requestJson(`${baseUrl}/api/solo/runs/finalize`, {
      method: 'POST',
      headers: headersA,
      body: {
        userId: userA.userId,
        runId: practiceRunId,
        idempotencyKey: 'practice-a-final',
        clientFinalizedAtMs: Date.now()
      }
    });
    assert.strictEqual(finalizePractice.status, 201, 'practice finalize should succeed');
    assert.strictEqual(Boolean(finalizePractice.body.summary.practice), true, 'practice summary should be marked practice');
    assert.strictEqual(Boolean(finalizePractice.body.summary.scored), false, 'practice run should not be scored');
    assert.strictEqual(String(finalizePractice.body.summary.xp.status), 'practice_no_xp', 'practice run should grant no XP');

    const failedLastAttemptB = await runFailedAttemptSeries(baseUrl, {
      userId: userB.userId,
      runId: runBId,
      count: 2,
      keyPrefix: 'fail-b',
      headers: headersB
    });
    assert.strictEqual(String(failedLastAttemptB.body.run.status), 'failed_pending_finalize', 'runB should be ready to finalize as failed');

    const finalizeFailedB = await requestJson(`${baseUrl}/api/solo/runs/finalize`, {
      method: 'POST',
      headers: headersB,
      body: {
        userId: userB.userId,
        runId: runBId,
        idempotencyKey: 'b-final-1',
        clientFinalizedAtMs: Date.now()
      }
    });
    assert.strictEqual(finalizeFailedB.status, 201, 'failed finalize should succeed');
    assert.strictEqual(String(finalizeFailedB.body.summary.outcome), 'failed', 'runB must finalize as failed');
    assert.strictEqual(Boolean(finalizeFailedB.body.summary.scored), true, 'runB should be scored despite failure');

    const leaderboard = await requestJson(
      `${baseUrl}/api/solo/leaderboards/daily?modeId=daily_cipher_clash&limit=20&userId=${encodeURIComponent(userA.userId)}`,
      { headers: headersA }
    );
    assert.strictEqual(leaderboard.status, 200, 'leaderboard endpoint should succeed');
    assert.strictEqual(Number(leaderboard.body.totalEntries) >= 2, true, 'leaderboard should include scored runs');
    assert.strictEqual(Boolean(leaderboard.body.percentileBands && typeof leaderboard.body.percentileBands === 'object'), true, 'percentile bands should exist');
    assert.strictEqual(Array.isArray(leaderboard.body.entries), true, 'leaderboard entries should be array');
    assert.strictEqual(Boolean(leaderboard.body.userEntry), true, 'leaderboard should include requested user entry');

    const userC = await createGuest(baseUrl, { displayName: 'Solo C', guestAlias: 'dev:solo-c' });
    const headersC = { 'x-lw-session': userC.sessionToken };
    const startC = await requestJson(`${baseUrl}/api/solo/runs/start`, {
      method: 'POST',
      headers: headersC,
      body: { userId: userC.userId, modeId: 'daily_cipher_clash' }
    });
    const invalidTimestampSubmit = await requestJson(`${baseUrl}/api/solo/runs/submit`, {
      method: 'POST',
      headers: headersC,
      body: {
        userId: userC.userId,
        runId: startC.body.run.runId,
        idempotencyKey: 'c-invalid-ts',
        clientSubmittedAtMs: Date.now() + (10 * 60 * 1000),
        picks: startC.body.challenge.debugSolutionBySlot
      }
    });
    assert.strictEqual(invalidTimestampSubmit.status, 400, 'future timestamp should be rejected');
    assert.strictEqual(String(invalidTimestampSubmit.body.error).includes('timestamp'), true, 'timestamp guard should return timestamp error');

    console.log('[Phase2 API integration] passed');
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
      console.warn(`[Phase2 API integration] server stderr:\n${stderrBuffer.trim()}`);
    }
  }
}

main().catch((error) => {
  console.error(`[Phase2 API integration] failed: ${String(error && error.message || error)}`);
  process.exit(1);
});
