const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'archetype-anchor-catalog.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) out[arg.slice(2)] = 'true';
    else out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function parseBool(value, fallback = false) {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function scoreAnchor(anchor = {}) {
  const w = {
    speakerMatch: 0.16,
    cadenceFit: 0.22,
    vibeFit: 0.2,
    dialogueIsolation: 0.14,
    transcriptClarity: 0.08,
    sourceStability: 0.08,
    rightsClarity: 0.03,
    sourceQualityBias: 0.09
  };

  const sourceType = String(anchor.sourceType || '').toLowerCase();
  let sourceQualityBias = 0.55;
  if (sourceType.includes('official')) sourceQualityBias = 0.95;
  else if (sourceType.includes('education')) sourceQualityBias = 0.8;
  else if (sourceType.includes('clip_page')) sourceQualityBias = 0.72;
  else if (sourceType.includes('news_embed')) sourceQualityBias = 0.64;
  else if (sourceType.includes('sound_library')) sourceQualityBias = 0.68;
  else if (sourceType.includes('soundboard')) sourceQualityBias = 0.5;
  else if (sourceType.includes('ugc')) sourceQualityBias = 0.38;
  else if (sourceType.includes('site_root')) sourceQualityBias = 0.2;

  const positive = (
    clamp(anchor.speakerMatch, 0, 1, 0.5) * w.speakerMatch +
    clamp(anchor.cadenceFit, 0, 1, 0.5) * w.cadenceFit +
    clamp(anchor.vibeFit, 0, 1, 0.5) * w.vibeFit +
    clamp(anchor.dialogueIsolation, 0, 1, 0.5) * w.dialogueIsolation +
    clamp(anchor.transcriptClarity, 0, 1, 0.4) * w.transcriptClarity +
    clamp(anchor.sourceStability, 0, 1, 0.6) * w.sourceStability +
    clamp(anchor.rightsClarity, 0, 1, 0.3) * w.rightsClarity +
    sourceQualityBias * w.sourceQualityBias
  );

  const penalty = (
    clamp(anchor.backgroundMusicInterference, 0, 1, 0) * 0.13 +
    clamp(anchor.ugcRisk, 0, 1, 0) * 0.12 +
    (anchor.loginRequired ? 0.06 : 0)
  );

  return clamp(positive - penalty, 0, 1, 0);
}

function collectAnchorFlags(anchor = {}, score = 0) {
  const flags = [];
  if (clamp(anchor.cadenceFit, 0, 1, 0.5) < 0.65) flags.push('cadence_weak');
  if (clamp(anchor.vibeFit, 0, 1, 0.5) < 0.65) flags.push('vibe_weak');
  if (clamp(anchor.dialogueIsolation, 0, 1, 0.5) < 0.6) flags.push('isolation_low');
  if (clamp(anchor.backgroundMusicInterference, 0, 1, 0) > 0.35) flags.push('music_interference_high');
  if (clamp(anchor.ugcRisk, 0, 1, 0) > 0.55) flags.push('ugc_risk_high');
  if (clamp(anchor.sourceStability, 0, 1, 0.5) < 0.55) flags.push('stability_risk');
  if (anchor.loginRequired) flags.push('login_required');
  if (score < 0.6) flags.push('overall_weak');
  return flags;
}

async function verifyAnchorUrl(anchor = {}, { timeoutMs = 5000 } = {}) {
  const url = String(anchor.url || '').trim();
  if (!url) return { ok: false, skipped: true, error: 'missing_url' };
  if (typeof fetch !== 'function') return { ok: false, skipped: true, error: 'fetch_unavailable' };

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const startedAt = Date.now();
  try {
    let res = null;
    try {
      res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
    } catch (_headErr) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller ? controller.signal : undefined
      });
    }
    return {
      ok: Boolean(res && res.ok),
      status: res ? res.status : 0,
      redirected: res ? res.redirected : false,
      finalUrl: res ? res.url : url,
      contentType: res && res.headers ? String(res.headers.get('content-type') || '') : '',
      ms: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message || 'request_failed'),
      ms: Date.now() - startedAt
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function auditProfile(profile, options = {}) {
  const rows = [];
  const all = [
    ...(Array.isArray(profile.currentAnchors) ? profile.currentAnchors.map((a) => ({ ...a, group: 'current' })) : []),
    ...(Array.isArray(profile.candidateAnchors) ? profile.candidateAnchors.map((a) => ({ ...a, group: 'candidate' })) : [])
  ];

  for (const anchor of all) {
    const score = scoreAnchor(anchor);
    const flags = collectAnchorFlags(anchor, score);
    const verify = options.verifyUrls ? await verifyAnchorUrl(anchor, { timeoutMs: options.timeoutMs }) : null;
    if (verify && verify.ok === false) flags.push('url_unreachable');
    rows.push({
      ...anchor,
      score: Number(score.toFixed(3)),
      flags,
      verification: verify
    });
  }

  const currentRows = rows.filter((r) => r.group === 'current').sort((a, b) => b.score - a.score);
  const candidateRows = rows.filter((r) => r.group === 'candidate').sort((a, b) => b.score - a.score);
  const bestCurrent = currentRows[0] || null;
  const bestCandidate = candidateRows[0] || null;
  const bestOverall = [...rows].sort((a, b) => b.score - a.score)[0] || null;

  const upgradeDelta = bestCurrent && bestCandidate ? Number((bestCandidate.score - bestCurrent.score).toFixed(3)) : null;
  const recommendation = (() => {
    if (!bestCurrent && bestCandidate) return 'adopt_candidate';
    if (!bestCurrent) return 'missing_current_anchor';
    if (!bestCandidate) return 'keep_current_no_candidates';
    if (upgradeDelta > 0.07) return 'upgrade_candidate_available';
    if (bestCurrent.flags.includes('overall_weak')) return 'replace_current_weak_anchor';
    return 'keep_current_monitor_candidates';
  })();

  return {
    id: String(profile.id || ''),
    archetype: String(profile.archetype || ''),
    goal: String(profile.goal || ''),
    totalAnchors: rows.length,
    bestCurrent,
    bestCandidate,
    bestOverall,
    upgradeDelta,
    recommendation,
    rows
  };
}

function buildConsoleSummary(report) {
  const lines = [];
  lines.push(`Anchor audit: ${report.summary.profileCount} profile(s)`);
  lines.push(`Recommendations: upgrade=${report.summary.upgradeAvailable} keep=${report.summary.keepCurrent} weak=${report.summary.weakCurrent}`);
  for (const p of report.profiles) {
    const current = p.bestCurrent ? `${p.bestCurrent.id} ${p.bestCurrent.score}` : 'none';
    const candidate = p.bestCandidate ? `${p.bestCandidate.id} ${p.bestCandidate.score}` : 'none';
    lines.push(`- ${p.id} (${p.archetype}) rec=${p.recommendation} current=${current} candidate=${candidate}`);
  }
  return lines.join('\n');
}

async function writeOutputs(report, options = {}) {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `anchor-audit-${stamp}.json`);
  await fsp.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  let mdPath = null;
  if (options.writeMarkdown !== false) {
    const md = [];
    md.push('# Archetype Anchor Audit');
    md.push('');
    md.push(`Generated: ${new Date(report.generatedAt).toISOString()}`);
    md.push('');
    md.push(`Profiles: ${report.summary.profileCount}`);
    md.push(`Upgrade candidates: ${report.summary.upgradeAvailable}`);
    md.push('');
    for (const p of report.profiles) {
      md.push(`## ${p.id} (${p.archetype})`);
      md.push('');
      md.push(`Goal: ${p.goal}`);
      md.push(`Recommendation: ${p.recommendation}`);
      if (p.bestCurrent) md.push(`Best current: ${p.bestCurrent.label} (${p.bestCurrent.score})`);
      if (p.bestCandidate) md.push(`Best candidate: ${p.bestCandidate.label} (${p.bestCandidate.score})`);
      md.push('');
      md.push('| Group | Anchor | Score | Flags |');
      md.push('| --- | --- | ---: | --- |');
      for (const row of [...p.rows].sort((a, b) => b.score - a.score)) {
        md.push(`| ${row.group} | ${row.label} | ${row.score.toFixed(3)} | ${row.flags.join(', ') || '-'} |`);
      }
      md.push('');
    }
    mdPath = path.join(OUTPUT_DIR, `anchor-audit-${stamp}.md`);
    await fsp.writeFile(mdPath, md.join('\n'), 'utf8');
  }

  return { jsonPath, mdPath };
}

async function runAnchorAudit(options = {}) {
  const fixturePath = options.fixturePath || FIXTURE_PATH;
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const profiles = Array.isArray(raw && raw.profiles) ? raw.profiles : [];
  const limit = Math.max(1, Number(options.limit) || profiles.length || 1);
  const selected = profiles.slice(0, limit);

  const results = [];
  for (const profile of selected) {
    results.push(await auditProfile(profile, options));
  }

  const summary = {
    profileCount: results.length,
    upgradeAvailable: results.filter((p) => p.recommendation === 'upgrade_candidate_available').length,
    keepCurrent: results.filter((p) => String(p.recommendation || '').startsWith('keep_current')).length,
    weakCurrent: results.filter((p) => p.recommendation === 'replace_current_weak_anchor').length,
    missingCurrent: results.filter((p) => p.recommendation === 'missing_current_anchor').length
  };

  const report = {
    ok: true,
    generatedAt: Date.now(),
    fixturePath,
    options: {
      verifyUrls: Boolean(options.verifyUrls),
      timeoutMs: Number(options.timeoutMs) || 5000
    },
    summary,
    profiles: results
  };

  const files = await writeOutputs(report, options);
  return { report, files };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  runAnchorAudit({
    fixturePath: args.fixture || FIXTURE_PATH,
    verifyUrls: parseBool(args.verifyUrls, false),
    timeoutMs: Number(args.timeoutMs) || 5000,
    limit: Number(args.limit) || undefined,
    writeMarkdown: !parseBool(args.noMarkdown, false)
  })
    .then(({ report, files }) => {
      console.log(buildConsoleSummary(report));
      console.log(`JSON: ${files.jsonPath}`);
      if (files.mdPath) console.log(`MD:   ${files.mdPath}`);
    })
    .catch((error) => {
      console.error('[anchor-audit] failed:', error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = {
  runAnchorAudit,
  scoreAnchor,
  collectAnchorFlags
};
