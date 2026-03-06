const { spawnSync } = require('child_process');
const path = require('path');
const assert = require('assert');

function main() {
  const scriptPath = path.join(__dirname, '..', 'tools', 'runPhase0PartyTelemetrySample.js');
  const result = spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      META_PROGRESS_ENABLED: '0',
      META_ACHIEVEMENTS_ENABLED: '0',
      SOLO_ENGINE_ENABLED: '0',
      DUAL_HUB_UI_ENABLED: '1'
    },
    encoding: 'utf8'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `phase3_party_regression_failed status=${result.status} stderr=${String(result.stderr || '').trim()}`
    );
  }
  assert.strictEqual(
    String(result.stdout || '').includes('[Phase0 telemetry sample]'),
    true,
    'party sample flow should complete with phase0 marker output'
  );
  console.log('[Phase3 party regression] passed');
}

main();
