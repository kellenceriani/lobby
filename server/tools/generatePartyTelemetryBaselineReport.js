const fs = require('fs');
const path = require('path');
const {
  TELEMETRY_SCHEMA_VERSION,
  getPartyTelemetryLogPath
} = require('../telemetry/partyTelemetry');

const REQUIRED_EVENT_TYPES = [
  'room_created',
  'player_joined',
  'player_left',
  'player_reconnected',
  'phase_transition',
  'round_completed',
  'final_completed'
];

function parseArgs(argv = []) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = String(argv[i] || '').trim();
    const next = String(argv[i + 1] || '').trim();
    if (key === '--input' && next) {
      args.input = next;
      i += 1;
      continue;
    }
    if (key === '--output' && next) {
      args.output = next;
      i += 1;
      continue;
    }
    if (key === '--dashboard' && next) {
      args.dashboard = next;
      i += 1;
      continue;
    }
  }
  return args;
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) {
    return { events: [], parseErrors: [`missing_log_file:${filePath}`] };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const events = [];
  const parseErrors = [];
  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') {
        events.push(parsed);
      } else {
        parseErrors.push(`invalid_json_object:line_${index + 1}`);
      }
    } catch (error) {
      parseErrors.push(`invalid_json:line_${index + 1}:${String(error && error.message || 'unknown')}`);
    }
  });
  return { events, parseErrors };
}

function toSortedEntries(counter = {}) {
  return Object.entries(counter || {}).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function pct(part, total, digits = 1) {
  if (!Number.isFinite(Number(part)) || !Number.isFinite(Number(total)) || Number(total) <= 0) return 0;
  return Number(((Number(part) / Number(total)) * 100).toFixed(digits));
}

function avg(total, count, digits = 1) {
  if (!Number.isFinite(Number(total)) || !Number.isFinite(Number(count)) || Number(count) <= 0) return 0;
  return Number((Number(total) / Number(count)).toFixed(digits));
}

function summarize(events = [], parseErrors = []) {
  const eventCounts = {};
  const rooms = new Set();
  const phaseCounts = {};
  let invalidSchemaCount = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;
  let joinCount = 0;
  let leaveCount = 0;
  let reconnectCount = 0;
  let roundCount = 0;
  let roundTieCount = 0;
  let roundDurationTotalMs = 0;
  let roundDurationCount = 0;
  let finalCount = 0;
  let finalTieCount = 0;
  let matchDurationTotalMs = 0;
  let matchDurationCount = 0;

  (Array.isArray(events) ? events : []).forEach((event) => {
    const eventType = String(event && event.eventType || '').trim();
    if (!eventType) return;
    eventCounts[eventType] = (eventCounts[eventType] || 0) + 1;

    const roomCode = String(event && event.roomCode || '').trim();
    if (roomCode) rooms.add(roomCode);

    const timestamp = Number(event && event.timestampMs) || 0;
    if (timestamp > 0) {
      if (!firstTimestamp || timestamp < firstTimestamp) firstTimestamp = timestamp;
      if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp;
    }

    if (Number(event && event.schemaVersion) !== TELEMETRY_SCHEMA_VERSION) {
      invalidSchemaCount += 1;
    }

    if (eventType === 'player_joined') joinCount += 1;
    if (eventType === 'player_left') leaveCount += 1;
    if (eventType === 'player_reconnected') reconnectCount += 1;

    if (eventType === 'phase_transition') {
      const fromPhase = String(event && event.fromPhase || 'UNKNOWN');
      const toPhase = String(event && event.toPhase || 'UNKNOWN');
      const key = `${fromPhase}->${toPhase}`;
      phaseCounts[key] = (phaseCounts[key] || 0) + 1;
    }

    if (eventType === 'round_completed') {
      roundCount += 1;
      if (event && event.isTie === true) roundTieCount += 1;
      const roundDurationMs = Number(event && event.roundDurationMs);
      if (Number.isFinite(roundDurationMs) && roundDurationMs >= 0) {
        roundDurationTotalMs += roundDurationMs;
        roundDurationCount += 1;
      }
    }

    if (eventType === 'final_completed') {
      finalCount += 1;
      if (event && event.isTie === true) finalTieCount += 1;
      const matchDurationMs = Number(event && event.matchDurationMs);
      if (Number.isFinite(matchDurationMs) && matchDurationMs >= 0) {
        matchDurationTotalMs += matchDurationMs;
        matchDurationCount += 1;
      }
    }
  });

  const missingEventTypes = REQUIRED_EVENT_TYPES.filter((eventType) => !eventCounts[eventType]);
  const eventWindowMs = (firstTimestamp && lastTimestamp) ? Math.max(0, lastTimestamp - firstTimestamp) : 0;

  return {
    generatedAtIso: new Date().toISOString(),
    expectedSchemaVersion: TELEMETRY_SCHEMA_VERSION,
    parseErrors,
    parseErrorCount: Array.isArray(parseErrors) ? parseErrors.length : 0,
    invalidSchemaCount,
    totals: {
      events: Array.isArray(events) ? events.length : 0,
      rooms: rooms.size,
      joins: joinCount,
      leaves: leaveCount,
      reconnects: reconnectCount,
      reconnectRatePct: pct(reconnectCount, leaveCount),
      roundCompletions: roundCount,
      roundTieRatePct: pct(roundTieCount, roundCount),
      finalCompletions: finalCount,
      finalTieRatePct: pct(finalTieCount, finalCount)
    },
    latencies: {
      avgRoundDurationMs: avg(roundDurationTotalMs, roundDurationCount, 0),
      avgMatchDurationMs: avg(matchDurationTotalMs, matchDurationCount, 0)
    },
    eventWindow: {
      firstTimestampMs: firstTimestamp,
      firstTimestampIso: firstTimestamp ? new Date(firstTimestamp).toISOString() : null,
      lastTimestampMs: lastTimestamp,
      lastTimestampIso: lastTimestamp ? new Date(lastTimestamp).toISOString() : null,
      durationMs: eventWindowMs
    },
    missingEventTypes,
    eventCounts,
    phaseTransitions: phaseCounts
  };
}

function renderMarkdown(summary, { inputPath, dashboardPath }) {
  const eventCountRows = toSortedEntries(summary.eventCounts);
  const phaseRows = toSortedEntries(summary.phaseTransitions);
  const parseErrorPreview = (summary.parseErrors || []).slice(0, 5);
  const status = summary.missingEventTypes.length === 0 && summary.invalidSchemaCount === 0 ? 'Operational' : 'Needs Attention';

  const lines = [
    '# Phase 0 Telemetry Baseline Report',
    '',
    `Generated at: ${summary.generatedAtIso}`,
    `Source log: \`${inputPath}\``,
    `Dashboard snapshot: \`${dashboardPath}\``,
    `Schema version expected: \`${summary.expectedSchemaVersion}\``,
    `Dashboard status: **${status}**`,
    '',
    '## Sample Window',
    '',
    `- First event: ${summary.eventWindow.firstTimestampIso || 'n/a'}`,
    `- Last event: ${summary.eventWindow.lastTimestampIso || 'n/a'}`,
    `- Window duration (ms): ${summary.eventWindow.durationMs}`,
    '',
    '## Baseline KPIs',
    '',
    `- Total events: ${summary.totals.events}`,
    `- Rooms observed: ${summary.totals.rooms}`,
    `- Joins: ${summary.totals.joins}`,
    `- Leaves: ${summary.totals.leaves}`,
    `- Reconnects: ${summary.totals.reconnects} (${summary.totals.reconnectRatePct}% of leaves)`,
    `- Round completions: ${summary.totals.roundCompletions} (tie rate ${summary.totals.roundTieRatePct}%)`,
    `- Final completions: ${summary.totals.finalCompletions} (tie rate ${summary.totals.finalTieRatePct}%)`,
    `- Avg round duration (ms): ${summary.latencies.avgRoundDurationMs}`,
    `- Avg match duration (ms): ${summary.latencies.avgMatchDurationMs}`,
    '',
    '## Event Counts',
    '',
    '| Event Type | Count |',
    '| --- | ---: |'
  ];

  eventCountRows.forEach(([eventType, count]) => {
    lines.push(`| \`${eventType}\` | ${count} |`);
  });

  lines.push('', '## Phase Transition Counts', '', '| Transition | Count |', '| --- | ---: |');
  phaseRows.forEach(([transition, count]) => {
    lines.push(`| \`${transition}\` | ${count} |`);
  });

  lines.push('', '## Schema and Coverage Checks', '');
  lines.push(`- Invalid schema version events: ${summary.invalidSchemaCount}`);
  lines.push(`- Parse errors: ${summary.parseErrorCount}`);
  lines.push(`- Missing required event types: ${summary.missingEventTypes.length ? summary.missingEventTypes.map((x) => `\`${x}\``).join(', ') : 'None'}`);
  if (parseErrorPreview.length) {
    lines.push('- Parse error samples:');
    parseErrorPreview.forEach((item) => lines.push(`  - ${item}`));
  }
  lines.push('');
  lines.push('## Operational Notes');
  lines.push('');
  lines.push('- Baseline generated from emitted Party telemetry events.');
  lines.push('- Report generation is repeatable via `npm run telemetry:party:report`.');
  lines.push('- Full baseline refresh flow: `npm run phase0:baseline`.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input
    ? path.resolve(process.cwd(), args.input)
    : getPartyTelemetryLogPath();
  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.join(process.cwd(), 'md', 'overhaul', 'reports', 'PHASE_0_TELEMETRY_BASELINE.md');
  const dashboardPath = args.dashboard
    ? path.resolve(process.cwd(), args.dashboard)
    : path.join(process.cwd(), 'md', 'overhaul', 'reports', 'PHASE_0_RELIABILITY_DASHBOARD.json');

  const { events, parseErrors } = readNdjson(inputPath);
  const summary = summarize(events, parseErrors);
  const markdown = renderMarkdown(summary, { inputPath, dashboardPath });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, 'utf8');

  fs.mkdirSync(path.dirname(dashboardPath), { recursive: true });
  fs.writeFileSync(dashboardPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`[Party telemetry baseline] events=${summary.totals.events} output=${outputPath}`);
  console.log(`[Party telemetry baseline] dashboard=${dashboardPath}`);
}

main();
