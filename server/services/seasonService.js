const { sanitizeText } = require('../storage/metaStoreAdapter');

const SEASON_SCHEMA_VERSION = 1;
const TRACK_IDS = Object.freeze(['solo', 'party']);

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function clampInt(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function toUtcDayKey(inputMs = Date.now()) {
  const d = new Date(Number(inputMs) || Date.now());
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dayDiff(a = '', b = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(b))) return 0;
  const ams = Date.parse(`${a}T00:00:00.000Z`);
  const bms = Date.parse(`${b}T00:00:00.000Z`);
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) return 0;
  return Math.max(0, Math.floor((bms - ams) / 86400000));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeId(value, max = 80) {
  const id = sanitizeText(value, max).toLowerCase();
  return /^[a-z0-9_:\-./]{3,}$/.test(id) ? id : '';
}

function safeUserId(value = '') {
  const id = sanitizeText(value, 120);
  return /^[A-Za-z0-9_-]{6,120}$/.test(id) ? id : '';
}

function defaultDefinition(nowMs = Date.now()) {
  const d = new Date(Number(nowMs) || Date.now());
  const year = d.getUTCFullYear();
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  const startMonth = (quarter - 1) * 3;
  const startsAtMs = Date.UTC(year, startMonth, 1, 0, 0, 0, 0);
  const endsAtMs = Date.UTC(year, startMonth + 3, 1, 0, 0, 0, 0);
  const seasonId = `season_${year}_q${quarter}`;
  return {
    seasonId,
    name: `Season ${year} Q${quarter}`,
    status: 'scheduled',
    startsAtMs,
    endsAtMs,
    trackConfig: {
      solo: {
        divisionThresholds: [{ id: 'bronze', min: 0 }, { id: 'silver', min: 140 }, { id: 'gold', min: 280 }, { id: 'platinum', min: 450 }, { id: 'diamond', min: 650 }],
        decayGraceDays: 2,
        dailyDecayPoints: 6,
        maxPointsPerDay: 260,
        maxEventsPerDay: 24
      },
      party: {
        divisionThresholds: [{ id: 'bronze', min: 0 }, { id: 'silver', min: 160 }, { id: 'gold', min: 320 }, { id: 'platinum', min: 520 }, { id: 'diamond', min: 760 }],
        decayGraceDays: 2,
        dailyDecayPoints: 5,
        maxPointsPerDay: 320,
        maxEventsPerDay: 36
      }
    },
    quests: [
      { id: 'quest_solo_1', metric: 'solo_scored_runs', target: 1, questPoints: 20 },
      { id: 'quest_party_1', metric: 'party_matches', target: 1, questPoints: 20 },
      { id: 'quest_dual_3', metric: 'combined_sessions', target: 3, questPoints: 40 }
    ],
    milestones: [
      { id: 'milestone_20', requiredQuestPoints: 20, rewardXp: 35 },
      { id: 'milestone_60', requiredQuestPoints: 60, rewardXp: 70 },
      { id: 'milestone_100', requiredQuestPoints: 100, rewardXp: 110 }
    ],
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    openedAtMs: null,
    closedAtMs: null
  };
}

function ensureRuntimeRow(state, seasonId = '', nowMs = Date.now()) {
  const sid = safeId(seasonId, 80);
  if (!sid) return null;
  state.seasonRuntime = state.seasonRuntime && typeof state.seasonRuntime === 'object' ? state.seasonRuntime : {};
  state.seasonRuntime.seasonsById = state.seasonRuntime.seasonsById && typeof state.seasonRuntime.seasonsById === 'object' ? state.seasonRuntime.seasonsById : {};
  if (!state.seasonRuntime.seasonsById[sid]) {
    state.seasonRuntime.seasonsById[sid] = {
      seasonId: sid,
      openedAtMs: null,
      closedAtMs: null,
      tracks: { solo: { entries: {} }, party: { entries: {} } },
      questsByUser: {},
      eventLedger: {},
      partyLedger: {},
      closeLedger: {},
      antiAbuse: { dailyTrack: {}, dailyClaim: {} },
      snapshotId: '',
      updatedAtMs: nowMs
    };
  }
  const row = state.seasonRuntime.seasonsById[sid];
  row.tracks = row.tracks && typeof row.tracks === 'object' ? row.tracks : { solo: { entries: {} }, party: { entries: {} } };
  TRACK_IDS.forEach((trackId) => {
    row.tracks[trackId] = row.tracks[trackId] && typeof row.tracks[trackId] === 'object' ? row.tracks[trackId] : { entries: {} };
    row.tracks[trackId].entries = row.tracks[trackId].entries && typeof row.tracks[trackId].entries === 'object' ? row.tracks[trackId].entries : {};
  });
  row.questsByUser = row.questsByUser && typeof row.questsByUser === 'object' ? row.questsByUser : {};
  row.eventLedger = row.eventLedger && typeof row.eventLedger === 'object' ? row.eventLedger : {};
  row.partyLedger = row.partyLedger && typeof row.partyLedger === 'object' ? row.partyLedger : {};
  row.closeLedger = row.closeLedger && typeof row.closeLedger === 'object' ? row.closeLedger : {};
  row.antiAbuse = row.antiAbuse && typeof row.antiAbuse === 'object' ? row.antiAbuse : { dailyTrack: {}, dailyClaim: {} };
  row.antiAbuse.dailyTrack = row.antiAbuse.dailyTrack && typeof row.antiAbuse.dailyTrack === 'object' ? row.antiAbuse.dailyTrack : {};
  row.antiAbuse.dailyClaim = row.antiAbuse.dailyClaim && typeof row.antiAbuse.dailyClaim === 'object' ? row.antiAbuse.dailyClaim : {};
  return row;
}

function ensureState(state, nowMs = Date.now()) {
  if (!state || typeof state !== 'object') return;
  state.seasonSchemaVersion = Math.max(Number(state.seasonSchemaVersion) || 0, SEASON_SCHEMA_VERSION);
  state.seasonDefinitions = state.seasonDefinitions && typeof state.seasonDefinitions === 'object' ? state.seasonDefinitions : {};
  state.seasonRuntime = state.seasonRuntime && typeof state.seasonRuntime === 'object' ? state.seasonRuntime : {};
  state.seasonRuntime.activeSeasonId = safeId(state.seasonRuntime.activeSeasonId || '', 80);
  state.seasonRuntime.snapshotsBySeasonId = state.seasonRuntime.snapshotsBySeasonId && typeof state.seasonRuntime.snapshotsBySeasonId === 'object'
    ? state.seasonRuntime.snapshotsBySeasonId
    : {};
  state.seasonRuntime.actionLog = Array.isArray(state.seasonRuntime.actionLog) ? state.seasonRuntime.actionLog : [];
  Object.keys(state.seasonDefinitions).forEach((key) => {
    const sid = safeId(key, 80);
    if (!sid) return delete state.seasonDefinitions[key];
    const def = state.seasonDefinitions[key] || {};
    def.seasonId = sid;
    def.status = ['scheduled', 'open', 'closed', 'archived'].includes(String(def.status || '').toLowerCase()) ? String(def.status).toLowerCase() : 'scheduled';
    def.trackConfig = def.trackConfig && typeof def.trackConfig === 'object' ? def.trackConfig : defaultDefinition(nowMs).trackConfig;
    def.quests = Array.isArray(def.quests) ? def.quests : defaultDefinition(nowMs).quests;
    def.milestones = Array.isArray(def.milestones) ? def.milestones : defaultDefinition(nowMs).milestones;
    def.updatedAtMs = Number(def.updatedAtMs) > 0 ? Number(def.updatedAtMs) : nowMs;
    state.seasonDefinitions[sid] = def;
    if (sid !== key) delete state.seasonDefinitions[key];
    ensureRuntimeRow(state, sid, nowMs);
  });
  if (state.seasonRuntime.activeSeasonId && !state.seasonDefinitions[state.seasonRuntime.activeSeasonId]) {
    state.seasonRuntime.activeSeasonId = '';
  }
}

function entryFor(runtimeRow, trackId, userId, nowMs = Date.now()) {
  const uid = safeUserId(userId);
  if (!uid) return null;
  runtimeRow.tracks[trackId].entries[uid] = runtimeRow.tracks[trackId].entries[uid] || {
    userId: uid,
    trackId,
    points: 0,
    division: 'bronze',
    highestDivision: 'bronze',
    promotions: 0,
    demotions: 0,
    wins: 0,
    losses: 0,
    matches: 0,
    lastDay: toUtcDayKey(nowMs),
    decayDaysApplied: 0,
    updatedAtMs: nowMs
  };
  return runtimeRow.tracks[trackId].entries[uid];
}

function applyDivision(entry, cfg) {
  const list = Array.isArray(cfg && cfg.divisionThresholds) ? cfg.divisionThresholds : [];
  let next = 'bronze';
  list.forEach((row) => {
    if ((Number(entry.points) || 0) >= (Number(row.min) || 0)) next = String(row.id || next);
  });
  const idx = (id) => Math.max(0, list.findIndex((row) => String(row.id) === String(id)));
  if (entry.division !== next) {
    if (idx(next) > idx(entry.division)) entry.promotions += 1;
    if (idx(next) < idx(entry.division)) entry.demotions += 1;
  }
  entry.division = next;
  if (idx(next) > idx(entry.highestDivision)) entry.highestDivision = next;
}

function applyDecay(entry, cfg, nowDay = toUtcDayKey()) {
  const grace = Math.max(0, Number(cfg && cfg.decayGraceDays) || 0);
  const perDay = Math.max(0, Number(cfg && cfg.dailyDecayPoints) || 0);
  if (perDay <= 0) return;
  const inactive = dayDiff(entry.lastDay || nowDay, nowDay);
  const targetDays = Math.max(0, inactive - grace);
  const additional = Math.max(0, targetDays - (Number(entry.decayDaysApplied) || 0));
  if (additional <= 0) return;
  entry.points = Math.max(0, (Number(entry.points) || 0) - (additional * perDay));
  entry.decayDaysApplied = (Number(entry.decayDaysApplied) || 0) + additional;
  applyDivision(entry, cfg);
}

function questRow(runtimeRow, userId, nowMs = Date.now()) {
  const uid = safeUserId(userId);
  if (!uid) return null;
  runtimeRow.questsByUser[uid] = runtimeRow.questsByUser[uid] || {
    userId: uid,
    metrics: { solo_scored_runs: 0, solo_solves: 0, party_matches: 0, party_wins: 0, combined_sessions: 0 },
    questPoints: 0,
    completed: {},
    milestoneClaims: {},
    idempotencyClaims: {},
    updatedAtMs: nowMs
  };
  return runtimeRow.questsByUser[uid];
}

function applyQuestProgress(def, runtimeRow, userId, increments, nowMs = Date.now()) {
  const q = questRow(runtimeRow, userId, nowMs);
  if (!q) return { completed: [], row: null };
  const inc = increments && typeof increments === 'object' ? increments : {};
  Object.keys(inc).forEach((metric) => {
    const add = Math.max(0, Number(inc[metric]) || 0);
    if (add <= 0) return;
    q.metrics[metric] = Math.max(0, Number(q.metrics[metric]) || 0) + add;
  });
  const completed = [];
  (def.quests || []).forEach((quest) => {
    const qid = safeId(quest && quest.id, 80);
    if (!qid || q.completed[qid]) return;
    const metric = String(quest.metric || '');
    const target = Math.max(1, Number(quest.target) || 1);
    if ((Number(q.metrics[metric]) || 0) < target) return;
    const row = { id: qid, metric, target, value: Number(q.metrics[metric]) || 0, questPoints: Math.max(1, Number(quest.questPoints) || 1), completedAtMs: nowMs };
    q.completed[qid] = row;
    q.questPoints += row.questPoints;
    completed.push(row);
  });
  q.updatedAtMs = nowMs;
  return { completed, row: q };
}

function rankRows(entries, profiles, limit = 200) {
  const rows = Object.values(entries || {}).map((entry) => ({
    userId: entry.userId,
    displayName: profiles && profiles[entry.userId] && profiles[entry.userId].displayName ? profiles[entry.userId].displayName : entry.userId,
    points: Math.max(0, Number(entry.points) || 0),
    division: String(entry.division || 'bronze'),
    highestDivision: String(entry.highestDivision || entry.division || 'bronze'),
    wins: Math.max(0, Number(entry.wins) || 0),
    losses: Math.max(0, Number(entry.losses) || 0),
    matches: Math.max(0, Number(entry.matches) || 0),
    promotions: Math.max(0, Number(entry.promotions) || 0),
    demotions: Math.max(0, Number(entry.demotions) || 0),
    updatedAtMs: Math.max(0, Number(entry.updatedAtMs) || 0)
  }));
  rows.sort((a, b) => (b.points - a.points) || (b.wins - a.wins) || (a.losses - b.losses) || (a.updatedAtMs - b.updatedAtMs) || String(a.userId).localeCompare(String(b.userId)));
  const bands = { top_1: 0, top_10: 0, top_25: 0, top_50: 0, lower_50: 0 };
  const ranked = rows.map((row, i) => {
    const rank = i + 1;
    const total = rows.length;
    const percentile = total <= 1 ? 100 : clampInt(((total - rank) / Math.max(1, total - 1)) * 100, 0, 100);
    const band = percentile >= 99 ? 'top_1' : percentile >= 90 ? 'top_10' : percentile >= 75 ? 'top_25' : percentile >= 50 ? 'top_50' : 'lower_50';
    bands[band] += 1;
    return { ...row, rank, percentile, percentileBand: band };
  });
  return { totalEntries: ranked.length, percentileBands: bands, entries: ranked.slice(0, clampInt(limit, 1, 2000)) };
}

function soloPointsFromSummary(summary = {}) {
  const score = Math.max(0, Number(summary && summary.finalScore) || 0);
  const solved = String(summary && summary.outcome || '') === 'solved';
  const streak = Math.max(0, Number(summary && summary.streak && summary.streak.currentStreak) - 1);
  return clampInt(10 + (score / 5) + (solved ? 8 : 0) + Math.min(12, streak), 8, 90);
}

function partyPointsFromParticipant(participant = {}) {
  const placement = Math.max(1, Number(participant && participant.placement) || 1);
  const teamwork = clampInt(participant && participant.teamworkScore, 0, 10);
  const sports = clampInt(participant && participant.sportsmanshipScore, 0, 5);
  const win = participant && participant.won === true ? 4 : 0;
  const base = [28, 20, 14, 10, 8, 6, 4, 2][Math.min(7, placement - 1)] || 2;
  return clampInt(base + teamwork + sports + win, 2, 120);
}

function closeRewardXp(row = {}) {
  const baseByDivision = { bronze: 20, silver: 40, gold: 70, platinum: 110, diamond: 160 };
  const base = baseByDivision[String(row.division || 'bronze')] || 20;
  const rank = Math.max(1, Number(row.rank) || 1);
  const bonus = rank === 1 ? 40 : (rank <= 3 ? 20 : (rank <= 10 ? 10 : 0));
  return clampInt(base + bonus, 10, 400);
}

function buildSeasonService({ adapter, metaService = null, featureFlags = {} } = {}) {
  if (!adapter) throw new Error('season_service_adapter_required');
  const flags = {
    seasonEnabled: featureFlags.seasonEnabled === true || boolEnv('SEASON_LAYER_ENABLED', false),
    autoOpenDefaultSeason: featureFlags.autoOpenDefaultSeason === true || boolEnv('SEASON_AUTO_OPEN_DEFAULT', true)
  };
  const antiAbuse = {
    maxPointsPerEvent: Math.max(1, Number(process.env.SEASON_MAX_POINTS_PER_EVENT) || 120),
    maxEventsPerUserTrackDay: Math.max(1, Number(process.env.SEASON_MAX_EVENTS_PER_DAY) || 40),
    maxPointsPerUserTrackDay: Math.max(20, Number(process.env.SEASON_MAX_POINTS_PER_DAY) || 320),
    maxQuestClaimsPerUserDay: Math.max(1, Number(process.env.SEASON_MAX_CLAIMS_PER_DAY) || 10),
    maxPartyParticipants: Math.max(1, Number(process.env.SEASON_MAX_PARTY_PARTICIPANTS) || 12)
  };

  function resolve(state, seasonId = '', { requireOpen = true } = {}) {
    ensureState(state);
    let sid = safeId(seasonId, 80) || safeId(state.seasonRuntime.activeSeasonId || '', 80);
    if (!sid && requireOpen === false) {
      const latest = Object.values(state.seasonDefinitions || {})
        .sort((a, b) => (Number(b.startsAtMs) || 0) - (Number(a.startsAtMs) || 0))[0] || null;
      sid = latest ? safeId(latest.seasonId, 80) : '';
    }
    if (!sid || !state.seasonDefinitions[sid]) return { ok: false, code: 'season_not_found' };
    const def = state.seasonDefinitions[sid];
    if (requireOpen && def.status !== 'open') return { ok: false, code: 'season_not_open' };
    return { ok: true, seasonId: sid, def, runtime: ensureRuntimeRow(state, sid) };
  }

  function applyTrack(state, payload = {}) {
    const res = resolve(state, payload.seasonId, { requireOpen: true });
    if (!res.ok) return res;
    const track = String(payload.trackId || '');
    const uid = safeUserId(payload.userId);
    const eventId = safeId(payload.eventId, 160);
    if (!TRACK_IDS.includes(track) || !uid || !eventId) return { ok: false, code: 'invalid_league_event_payload' };
    if (!state.users || !state.users[uid]) return { ok: false, code: 'user_not_found' };
    if (res.runtime.eventLedger[eventId]) return { ok: true, idempotent: true, ...clone(res.runtime.eventLedger[eventId]) };

    const cfg = res.def.trackConfig && res.def.trackConfig[track] ? res.def.trackConfig[track] : defaultDefinition().trackConfig[track];
    const dayKey = toUtcDayKey(payload.nowMs);
    const entry = entryFor(res.runtime, track, uid, payload.nowMs);
    applyDecay(entry, cfg, dayKey);
    const req = clampInt(payload.points, 0, antiAbuse.maxPointsPerEvent);
    const dailyKey = `${uid}|${track}|${dayKey}`;
    const daily = res.runtime.antiAbuse.dailyTrack[dailyKey] || { events: 0, points: 0, dayKey, userId: uid, trackId: track };
    res.runtime.antiAbuse.dailyTrack[dailyKey] = daily;
    let applied = 0;
    let status = 'applied';
    const maxEvents = Math.max(1, Number(cfg.maxEventsPerDay) || antiAbuse.maxEventsPerUserTrackDay);
    const maxPoints = Math.max(1, Number(cfg.maxPointsPerDay) || antiAbuse.maxPointsPerUserTrackDay);
    if (daily.events >= maxEvents) {
      status = 'daily_event_limit';
    } else {
      const remaining = Math.max(0, maxPoints - (Number(daily.points) || 0));
      applied = Math.max(0, Math.min(req, remaining));
      if (remaining <= 0) status = 'daily_point_cap';
      else if (applied < req) status = 'daily_point_cap_applied';
    }

    entry.points = Math.max(0, Number(entry.points) || 0) + applied;
    entry.matches += 1;
    if (payload.extra && payload.extra.won === true) entry.wins += 1;
    else if (payload.extra && payload.extra.won === false) entry.losses += 1;
    entry.lastDay = dayKey;
    entry.decayDaysApplied = 0;
    entry.updatedAtMs = payload.nowMs;
    applyDivision(entry, cfg);
    daily.events = Math.max(0, Number(daily.events) || 0) + 1;
    daily.points = Math.max(0, Number(daily.points) || 0) + applied;
    const q = applyQuestProgress(res.def, res.runtime, uid, payload.extra && payload.extra.questIncrements, payload.nowMs);
    const out = { seasonId: res.seasonId, trackId: track, userId: uid, eventId, requestedPoints: req, appliedPoints: applied, status, entry: clone(entry), questCompleted: clone(q.completed || []), questProgress: clone(q.row || null), idempotent: false, ok: true };
    res.runtime.eventLedger[eventId] = clone(out);
    return out;
  }

  function startup(nowMs = Date.now()) {
    let out = null;
    adapter.writeState((state) => {
      ensureState(state, nowMs);
      if (!Object.keys(state.seasonDefinitions).length) {
        const def = defaultDefinition(nowMs);
        state.seasonDefinitions[def.seasonId] = def;
        ensureRuntimeRow(state, def.seasonId, nowMs);
      }
      const openDefs = Object.values(state.seasonDefinitions).filter((d) => d && d.status === 'open');
      if (openDefs.length) {
        openDefs.sort((a, b) => (Number(b.startsAtMs) || 0) - (Number(a.startsAtMs) || 0));
        state.seasonRuntime.activeSeasonId = safeId(openDefs[0].seasonId, 80);
      } else if (flags.seasonEnabled === true && flags.autoOpenDefaultSeason === true) {
        const pick = Object.values(state.seasonDefinitions).find((d) => d && d.status === 'scheduled') || null;
        if (pick) {
          pick.status = 'open';
          pick.openedAtMs = nowMs;
          pick.updatedAtMs = nowMs;
          state.seasonRuntime.activeSeasonId = safeId(pick.seasonId, 80);
          const runtime = ensureRuntimeRow(state, pick.seasonId, nowMs);
          runtime.openedAtMs = nowMs;
        }
      }
      out = {
        ok: true,
        seasonSchemaVersion: SEASON_SCHEMA_VERSION,
        seasonEnabled: flags.seasonEnabled === true,
        activeSeasonId: safeId(state.seasonRuntime.activeSeasonId || '', 80),
        seasonDefinitionCount: Object.keys(state.seasonDefinitions).length,
        snapshotCount: Object.keys(state.seasonRuntime.snapshotsBySeasonId || {}).length
      };
    });
    return out;
  }

  function upsertDefinition({
    seasonId = '',
    name = '',
    startsAtMs = Date.now(),
    endsAtMs = Date.now() + (90 * 86400000),
    status = 'scheduled',
    trackConfig = null,
    quests = null,
    milestones = null,
    nowMs = Date.now()
  } = {}) {
    const sid = safeId(seasonId, 80);
    if (!sid) return { ok: false, code: 'invalid_season_id' };
    return adapter.writeState((state) => {
      ensureState(state, nowMs);
      const existing = state.seasonDefinitions[sid];
      if (!existing) {
        const def = defaultDefinition(nowMs);
        def.seasonId = sid;
        def.name = sanitizeText(name, 120) || sid;
        def.status = ['scheduled', 'open', 'closed', 'archived'].includes(String(status || '').toLowerCase()) ? String(status).toLowerCase() : 'scheduled';
        def.startsAtMs = Number(startsAtMs) > 0 ? Number(startsAtMs) : def.startsAtMs;
        def.endsAtMs = Number(endsAtMs) > def.startsAtMs ? Number(endsAtMs) : def.endsAtMs;
        if (trackConfig && typeof trackConfig === 'object') def.trackConfig = trackConfig;
        if (Array.isArray(quests) && quests.length) def.quests = quests;
        if (Array.isArray(milestones) && milestones.length) def.milestones = milestones;
        def.createdAtMs = nowMs;
        def.updatedAtMs = nowMs;
        state.seasonDefinitions[sid] = def;
        ensureRuntimeRow(state, sid, nowMs);
        return { ok: true, created: true, definition: clone(def) };
      }
      if (existing.status !== 'scheduled') return { ok: false, code: 'season_definition_locked' };
      existing.name = sanitizeText(name, 120) || existing.name;
      existing.startsAtMs = Number(startsAtMs) > 0 ? Number(startsAtMs) : existing.startsAtMs;
      existing.endsAtMs = Number(endsAtMs) > existing.startsAtMs ? Number(endsAtMs) : existing.endsAtMs;
      if (trackConfig && typeof trackConfig === 'object') existing.trackConfig = trackConfig;
      if (Array.isArray(quests) && quests.length) existing.quests = quests;
      if (Array.isArray(milestones) && milestones.length) existing.milestones = milestones;
      existing.updatedAtMs = nowMs;
      return { ok: true, created: false, definition: clone(existing) };
    });
  }

  function openSeason({
    seasonId = '',
    name = '',
    startsAtMs = null,
    endsAtMs = null,
    adminActor = 'system',
    dryRun = false,
    nowMs = Date.now()
  } = {}) {
    if (flags.seasonEnabled !== true) return { ok: false, code: 'season_layer_disabled' };
    const work = (state) => {
      ensureState(state, nowMs);
      const sid = safeId(seasonId, 80) || defaultDefinition(nowMs).seasonId;
      if (!state.seasonDefinitions[sid]) {
        const def = defaultDefinition(nowMs);
        def.seasonId = sid;
        def.name = sanitizeText(name, 120) || def.name;
        if (Number(startsAtMs) > 0) def.startsAtMs = Number(startsAtMs);
        if (Number(endsAtMs) > def.startsAtMs) def.endsAtMs = Number(endsAtMs);
        state.seasonDefinitions[sid] = def;
      }
      const def = state.seasonDefinitions[sid];
      if (def.status === 'open') {
        state.seasonRuntime.activeSeasonId = sid;
        return { ok: true, idempotent: true, dryRun, season: clone(def) };
      }
      if (def.status !== 'scheduled') return { ok: false, code: 'season_open_invalid_state' };
      const active = safeId(state.seasonRuntime.activeSeasonId || '', 80);
      if (active && active !== sid && state.seasonDefinitions[active] && state.seasonDefinitions[active].status === 'open') {
        return { ok: false, code: 'active_season_exists', activeSeasonId: active };
      }
      def.status = 'open';
      def.openedAtMs = nowMs;
      def.updatedAtMs = nowMs;
      state.seasonRuntime.activeSeasonId = sid;
      const runtime = ensureRuntimeRow(state, sid, nowMs);
      runtime.openedAtMs = nowMs;
      runtime.updatedAtMs = nowMs;
      state.seasonRuntime.actionLog.push({ action: 'open', seasonId: sid, actor: sanitizeText(adminActor, 80) || 'system', atMs: nowMs, dryRun: dryRun === true });
      return { ok: true, idempotent: false, dryRun, season: clone(def) };
    };
    return dryRun ? work(adapter.readState()) : adapter.writeState(work);
  }

  function closeSeason({ seasonId = '', adminActor = 'system', dryRun = false, nowMs = Date.now() } = {}) {
    if (flags.seasonEnabled !== true) return { ok: false, code: 'season_layer_disabled' };
    const rewardRequests = [];
    const work = (state) => {
      ensureState(state, nowMs);
      const res = resolve(state, seasonId, { requireOpen: false });
      if (!res.ok) return res;
      if (res.def.status === 'closed') {
        return { ok: true, idempotent: true, dryRun, seasonId: res.seasonId, snapshot: clone(state.seasonRuntime.snapshotsBySeasonId[res.seasonId] || null) };
      }
      if (res.def.status !== 'open') return { ok: false, code: 'season_close_invalid_state' };
      TRACK_IDS.forEach((trackId) => {
        const cfg = res.def.trackConfig[trackId] || defaultDefinition().trackConfig[trackId];
        Object.values(res.runtime.tracks[trackId].entries || {}).forEach((entry) => {
          applyDecay(entry, cfg, toUtcDayKey(nowMs));
          applyDivision(entry, cfg);
          entry.updatedAtMs = nowMs;
        });
      });
      const solo = rankRows(res.runtime.tracks.solo.entries, state.profiles, 2000);
      const party = rankRows(res.runtime.tracks.party.entries, state.profiles, 2000);
      TRACK_IDS.forEach((trackId) => {
        const board = trackId === 'solo' ? solo : party;
        (board.entries || []).forEach((row) => {
          const grantId = `season_close:${res.seasonId}:${trackId}:${row.userId}`;
          if (res.runtime.closeLedger[grantId]) return;
          res.runtime.closeLedger[grantId] = { grantId, seasonId: res.seasonId, trackId, userId: row.userId, requestedXp: closeRewardXp(row), grantedXp: 0, status: 'pending', processedAtMs: null };
          rewardRequests.push({ grantId, seasonId: res.seasonId, trackId, userId: row.userId, amount: closeRewardXp(row), rank: row.rank, division: row.division, occurredAtMs: nowMs });
        });
      });
      const profiles = {};
      const ids = new Set([...Object.keys(res.runtime.questsByUser || {}), ...Object.keys(res.runtime.tracks.solo.entries || {}), ...Object.keys(res.runtime.tracks.party.entries || {})]);
      ids.forEach((uid) => {
        const q = questRow(res.runtime, uid, nowMs);
        profiles[uid] = {
          userId: uid,
          displayName: state.profiles && state.profiles[uid] && state.profiles[uid].displayName ? state.profiles[uid].displayName : uid,
          solo: (solo.entries || []).find((r) => r.userId === uid) || null,
          party: (party.entries || []).find((r) => r.userId === uid) || null,
          questPoints: Math.max(0, Number(q && q.questPoints) || 0),
          completedQuestCount: Object.keys(q && q.completed || {}).length,
          milestonesClaimed: Object.keys(q && q.milestoneClaims || {}),
          closeRewards: { solo: 0, party: 0, total: 0 },
          closedAtMs: nowMs
        };
      });
      const snap = { snapshotId: `snapshot_${res.seasonId}_${nowMs}`, seasonId: res.seasonId, generatedAtMs: nowMs, status: 'closed', leaderboards: { solo, party }, profilesByUserId: profiles };
      state.seasonRuntime.snapshotsBySeasonId[res.seasonId] = snap;
      res.runtime.snapshotId = snap.snapshotId;
      res.runtime.closedAtMs = nowMs;
      res.def.status = 'closed';
      res.def.closedAtMs = nowMs;
      res.def.updatedAtMs = nowMs;
      if (safeId(state.seasonRuntime.activeSeasonId || '', 80) === res.seasonId) state.seasonRuntime.activeSeasonId = '';
      state.seasonRuntime.actionLog.push({ action: 'close', seasonId: res.seasonId, actor: sanitizeText(adminActor, 80) || 'system', atMs: nowMs, dryRun: dryRun === true });
      return { ok: true, idempotent: false, dryRun, seasonId: res.seasonId, snapshot: clone(snap), payoutRequestCount: rewardRequests.length };
    };
    const closed = dryRun ? work(adapter.readState()) : adapter.writeState(work);
    if (!closed || closed.ok !== true || closed.idempotent === true || dryRun === true || !rewardRequests.length) return closed;
    const payouts = rewardRequests.map((req) => {
      if (!metaService || typeof metaService.grantXp !== 'function') return { ...req, ok: false, code: 'meta_service_unavailable', grantedXp: 0 };
      const result = metaService.grantXp({ userId: req.userId, grantId: req.grantId, source: 'season_close_reward', amount: req.amount, reason: `season_close_${req.trackId}`, metadata: { seasonId: req.seasonId, trackId: req.trackId, rank: req.rank, division: req.division }, occurredAtMs: req.occurredAtMs });
      return { ...req, ok: Boolean(result && result.ok === true), code: result && result.code ? result.code : '', idempotent: Boolean(result && result.idempotent === true), grantedXp: result && result.grant ? Number(result.grant.amountGranted) || 0 : 0 };
    });
    adapter.writeState((state) => {
      ensureState(state, nowMs);
      const runtime = ensureRuntimeRow(state, closed.seasonId, nowMs);
      const snap = state.seasonRuntime.snapshotsBySeasonId[closed.seasonId] || null;
      payouts.forEach((row) => {
        const id = sanitizeText(row.grantId, 200);
        if (!id) return;
        const ledger = runtime.closeLedger[id] || { grantId: id, seasonId: closed.seasonId, trackId: row.trackId, userId: row.userId, requestedXp: row.amount, grantedXp: 0, status: 'pending', processedAtMs: null };
        ledger.grantedXp = Math.max(0, Number(row.grantedXp) || 0);
        ledger.status = row.ok ? (row.idempotent ? 'idempotent' : 'applied') : (row.code || 'grant_failed');
        ledger.processedAtMs = nowMs;
        runtime.closeLedger[id] = ledger;
      });
      if (snap && snap.profilesByUserId && typeof snap.profilesByUserId === 'object') {
        Object.values(snap.profilesByUserId).forEach((profile) => {
          if (!profile || !profile.userId) return;
          const agg = Object.values(runtime.closeLedger || {}).filter((x) => x && x.userId === profile.userId).reduce((a, x) => {
            const t = TRACK_IDS.includes(String(x.trackId)) ? String(x.trackId) : 'solo';
            const gx = Math.max(0, Number(x.grantedXp) || 0);
            a[t] = (a[t] || 0) + gx;
            a.total += gx;
            return a;
          }, { solo: 0, party: 0, total: 0 });
          profile.closeRewards = agg;
        });
      }
    });
    return { ...closed, payouts };
  }

  function recordSoloRunFinalized({ userId = '', runId = '', summary = {}, modeId = 'daily_cipher_clash', dateKey = '', nowMs = Date.now() } = {}) {
    if (flags.seasonEnabled !== true) return { ok: false, code: 'season_layer_disabled' };
    const uid = safeUserId(userId);
    const rid = sanitizeText(runId, 160);
    if (!uid || !rid) return { ok: false, code: 'invalid_solo_season_payload' };
    if (!summary || summary.scored !== true) return { ok: true, skipped: true, code: 'solo_not_scored' };
    if (summary.antiCheat && summary.antiCheat.suspicious === true) return { ok: true, skipped: true, code: 'solo_flagged_suspicious' };
    return adapter.writeState((state) => applyTrack(state, {
      seasonId: '',
      trackId: 'solo',
      userId: uid,
      points: soloPointsFromSummary(summary),
      eventId: `solo_finalize:${rid}`,
      nowMs,
      extra: {
        modeId: sanitizeText(modeId, 64) || 'daily_cipher_clash',
        dateKey: /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? String(dateKey) : toUtcDayKey(nowMs),
        won: String(summary && summary.outcome || '') === 'solved',
        questIncrements: {
          solo_scored_runs: 1,
          solo_solves: String(summary && summary.outcome || '') === 'solved' ? 1 : 0,
          combined_sessions: 1
        }
      }
    }));
  }

  function recordPartyMatchResult({ seasonId = '', eventId = '', matchId = '', participants = [], nowMs = Date.now() } = {}) {
    if (flags.seasonEnabled !== true) return { ok: false, code: 'season_layer_disabled' };
    const eid = safeId(eventId || `party:${matchId || nowMs}`, 160);
    if (!eid) return { ok: false, code: 'invalid_party_event_id' };
    const rows = Array.isArray(participants) ? participants.map((p) => ({
      userId: safeUserId(p && p.userId),
      placement: clampInt(p && p.placement, 1, 20),
      teamworkScore: clampInt(p && p.teamworkScore, 0, 10),
      sportsmanshipScore: clampInt(p && p.sportsmanshipScore, 0, 5),
      won: p && p.won === true
    })).filter((p) => p.userId) : [];
    if (!rows.length) return { ok: false, code: 'invalid_party_participants' };
    if (rows.length > antiAbuse.maxPartyParticipants) return { ok: false, code: 'party_participant_limit' };
    return adapter.writeState((state) => {
      const res = resolve(state, seasonId, { requireOpen: true });
      if (!res.ok) return res;
      const fingerprint = JSON.stringify(rows.slice().sort((a, b) => String(a.userId).localeCompare(String(b.userId))));
      if (res.runtime.partyLedger[eid]) {
        if (String(res.runtime.partyLedger[eid].fingerprint || '') !== fingerprint) return { ok: false, code: 'party_event_id_conflict' };
        return { ok: true, idempotent: true, seasonId: res.seasonId, eventId: eid, rows: clone(res.runtime.partyLedger[eid].rows || []) };
      }
      const appliedRows = rows.map((p) => ({
        userId: p.userId,
        requestedPoints: partyPointsFromParticipant(p),
        result: applyTrack(state, {
          seasonId: res.seasonId,
          trackId: 'party',
          userId: p.userId,
          points: partyPointsFromParticipant(p),
          eventId: `${eid}:${p.userId}`,
          nowMs,
          extra: { matchId: sanitizeText(matchId, 120) || null, won: p.won, questIncrements: { party_matches: 1, party_wins: p.won ? 1 : 0, combined_sessions: 1 } }
        })
      }));
      res.runtime.partyLedger[eid] = { eventId: eid, seasonId: res.seasonId, fingerprint, rows: clone(appliedRows), createdAtMs: nowMs };
      return { ok: true, idempotent: false, seasonId: res.seasonId, eventId: eid, rows: appliedRows };
    });
  }

  function claimMilestoneReward({ userId = '', seasonId = '', milestoneId = '', idempotencyKey = '', nowMs = Date.now() } = {}) {
    if (flags.seasonEnabled !== true) return { ok: false, code: 'season_layer_disabled' };
    const uid = safeUserId(userId);
    const mid = safeId(milestoneId, 80);
    const key = safeId(idempotencyKey, 160);
    if (!uid || !mid || !key) return { ok: false, code: 'invalid_milestone_claim_payload' };
    let request = null;
    const initial = adapter.writeState((state) => {
      const res = resolve(state, seasonId, { requireOpen: false });
      if (!res.ok) return res;
      if (!['open', 'closed'].includes(res.def.status)) return { ok: false, code: 'season_claim_invalid_state' };
      const dayKey = toUtcDayKey(nowMs);
      const claimDailyKey = `${uid}|${dayKey}`;
      const daily = res.runtime.antiAbuse.dailyClaim[claimDailyKey] || { claimCount: 0, dayKey, userId: uid };
      res.runtime.antiAbuse.dailyClaim[claimDailyKey] = daily;
      if ((Number(daily.claimCount) || 0) >= antiAbuse.maxQuestClaimsPerUserDay) return { ok: false, code: 'daily_claim_limit' };
      const q = questRow(res.runtime, uid, nowMs);
      if (q.idempotencyClaims[key]) {
        const mId = q.idempotencyClaims[key];
        const claim = q.milestoneClaims[mId] || null;
        if (!claim) return { ok: false, code: 'claim_idempotency_broken' };
        return { ok: true, idempotent: true, seasonId: res.seasonId, claim: clone(claim), progress: clone(q) };
      }
      const m = (res.def.milestones || []).find((row) => String(row.id || '') === mid) || null;
      if (!m) return { ok: false, code: 'milestone_not_found' };
      if (q.milestoneClaims[mid]) {
        q.idempotencyClaims[key] = mid;
        return { ok: true, idempotent: true, seasonId: res.seasonId, claim: clone(q.milestoneClaims[mid]), progress: clone(q) };
      }
      if ((Number(q.questPoints) || 0) < (Number(m.requiredQuestPoints) || 0)) return { ok: false, code: 'milestone_not_eligible' };
      const claim = {
        seasonId: res.seasonId,
        milestoneId: mid,
        userId: uid,
        idempotencyKey: key,
        claimAtMs: nowMs,
        requiredQuestPoints: Math.max(1, Number(m.requiredQuestPoints) || 1),
        rewardXpRequested: Math.max(1, Number(m.rewardXp) || 1),
        rewardXpGranted: 0,
        rewardStatus: 'pending',
        grantId: `season_milestone:${res.seasonId}:${mid}:${uid}`
      };
      q.milestoneClaims[mid] = claim;
      q.idempotencyClaims[key] = mid;
      q.updatedAtMs = nowMs;
      daily.claimCount = Math.max(0, Number(daily.claimCount) || 0) + 1;
      request = { userId: uid, seasonId: res.seasonId, milestoneId: mid, grantId: claim.grantId, rewardXp: claim.rewardXpRequested, occurredAtMs: nowMs };
      return { ok: true, idempotent: false, seasonId: res.seasonId, claim: clone(claim), progress: clone(q) };
    });
    if (!initial || initial.ok !== true || initial.idempotent === true || !request) return initial;
    const reward = !metaService || typeof metaService.grantXp !== 'function'
      ? { ok: false, code: 'meta_service_unavailable' }
      : metaService.grantXp({ userId: request.userId, grantId: request.grantId, source: 'season_milestone_reward', amount: request.rewardXp, reason: `milestone_${request.milestoneId}`, metadata: { seasonId: request.seasonId, milestoneId: request.milestoneId }, occurredAtMs: request.occurredAtMs });
    const patched = adapter.writeState((state) => {
      const runtime = ensureRuntimeRow(state, request.seasonId, nowMs);
      const q = questRow(runtime, request.userId, nowMs);
      const claim = q.milestoneClaims[request.milestoneId];
      if (!claim) return null;
      if (!reward || reward.ok !== true) {
        claim.rewardXpGranted = 0;
        claim.rewardStatus = reward && reward.code ? reward.code : 'reward_grant_failed';
      } else {
        claim.rewardXpGranted = Number(reward.grant && reward.grant.amountGranted) || 0;
        claim.rewardStatus = reward.idempotent ? 'idempotent' : 'applied';
      }
      claim.rewardProcessedAtMs = nowMs;
      q.milestoneClaims[request.milestoneId] = claim;
      q.updatedAtMs = nowMs;
      return { claim: clone(claim), progress: clone(q) };
    });
    return { ok: true, idempotent: false, seasonId: request.seasonId, claim: patched ? patched.claim : initial.claim, progress: patched ? patched.progress : initial.progress };
  }

  function getSeasonLeaderboard({ seasonId = '', trackId = 'solo', limit = 50, userId = '', nowMs = Date.now() } = {}) {
    const track = TRACK_IDS.includes(String(trackId)) ? String(trackId) : 'solo';
    const uid = safeUserId(userId || '');
    return adapter.writeState((state) => {
      const res = resolve(state, seasonId, { requireOpen: false });
      if (!res.ok) return res;
      const snap = state.seasonRuntime.snapshotsBySeasonId[res.seasonId] || null;
      let board = null;
      if (res.def.status === 'closed' && snap && snap.leaderboards && snap.leaderboards[track]) {
        board = clone(snap.leaderboards[track]);
      } else {
        const cfg = res.def.trackConfig[track] || defaultDefinition().trackConfig[track];
        Object.values(res.runtime.tracks[track].entries || {}).forEach((entry) => {
          applyDecay(entry, cfg, toUtcDayKey(nowMs));
          applyDivision(entry, cfg);
          entry.updatedAtMs = nowMs;
        });
        board = rankRows(res.runtime.tracks[track].entries || {}, state.profiles || {}, clampInt(limit, 1, 2000));
      }
      return {
        ok: true,
        seasonId: res.seasonId,
        seasonStatus: res.def.status,
        trackId: track,
        totalEntries: Number(board.totalEntries) || 0,
        percentileBands: board.percentileBands || { top_1: 0, top_10: 0, top_25: 0, top_50: 0, lower_50: 0 },
        entries: Array.isArray(board.entries) ? board.entries.slice(0, clampInt(limit, 1, 200)) : [],
        userEntry: uid && Array.isArray(board.entries) ? board.entries.find((row) => row.userId === uid) || null : null,
        historical: res.def.status === 'closed',
        updatedAtMs: nowMs
      };
    });
  }

  function getSeasonProfile({ userId = '', seasonId = '', includeHistory = true, historyLimit = 5, nowMs = Date.now() } = {}) {
    const uid = safeUserId(userId);
    if (!uid) return { ok: false, code: 'invalid_user_id' };
    return adapter.writeState((state) => {
      const res = resolve(state, seasonId, { requireOpen: false });
      if (!res.ok) return res;
      const snap = state.seasonRuntime.snapshotsBySeasonId[res.seasonId] || null;
      let profile = null;
      if (res.def.status === 'closed' && snap && snap.profilesByUserId && snap.profilesByUserId[uid]) {
        profile = clone(snap.profilesByUserId[uid]);
      } else {
        const soloCfg = res.def.trackConfig.solo || defaultDefinition().trackConfig.solo;
        const partyCfg = res.def.trackConfig.party || defaultDefinition().trackConfig.party;
        Object.values(res.runtime.tracks.solo.entries || {}).forEach((entry) => {
          applyDecay(entry, soloCfg, toUtcDayKey(nowMs));
          applyDivision(entry, soloCfg);
          entry.updatedAtMs = nowMs;
        });
        Object.values(res.runtime.tracks.party.entries || {}).forEach((entry) => {
          applyDecay(entry, partyCfg, toUtcDayKey(nowMs));
          applyDivision(entry, partyCfg);
          entry.updatedAtMs = nowMs;
        });
        const soloBoard = rankRows(res.runtime.tracks.solo.entries || {}, state.profiles || {}, 2000);
        const partyBoard = rankRows(res.runtime.tracks.party.entries || {}, state.profiles || {}, 2000);
        const q = questRow(res.runtime, uid, nowMs);
        const closeRewards = Object.values(res.runtime.closeLedger || {}).filter((row) => row && row.userId === uid).reduce((acc, row) => {
          const t = TRACK_IDS.includes(String(row.trackId)) ? String(row.trackId) : 'solo';
          const gx = Math.max(0, Number(row.grantedXp) || 0);
          acc[t] = (acc[t] || 0) + gx;
          acc.total += gx;
          return acc;
        }, { solo: 0, party: 0, total: 0 });
        profile = {
          userId: uid,
          displayName: state.profiles && state.profiles[uid] && state.profiles[uid].displayName ? state.profiles[uid].displayName : uid,
          solo: (soloBoard.entries || []).find((row) => row.userId === uid) || null,
          party: (partyBoard.entries || []).find((row) => row.userId === uid) || null,
          questPoints: Math.max(0, Number(q && q.questPoints) || 0),
          completedQuestCount: Object.keys(q && q.completed || {}).length,
          milestonesClaimed: Object.keys(q && q.milestoneClaims || {}),
          closeRewards,
          updatedAtMs: nowMs
        };
      }
      const history = [];
      if (includeHistory === true) {
        const seasons = Object.values(state.seasonDefinitions || {}).filter((row) => row && row.status === 'closed').sort((a, b) => (Number(b.closedAtMs) || 0) - (Number(a.closedAtMs) || 0));
        for (let i = 0; i < seasons.length && history.length < clampInt(historyLimit, 1, 20); i += 1) {
          const sid = safeId(seasons[i] && seasons[i].seasonId, 80);
          const hsnap = sid ? state.seasonRuntime.snapshotsBySeasonId[sid] : null;
          if (!sid || !hsnap || !hsnap.profilesByUserId || !hsnap.profilesByUserId[uid]) continue;
          history.push({ seasonId: sid, name: seasons[i].name, closedAtMs: Number(seasons[i].closedAtMs) || null, profile: clone(hsnap.profilesByUserId[uid]) });
        }
      }
      return { ok: true, seasonId: res.seasonId, seasonStatus: res.def.status, profile, history };
    });
  }

  function listSeasons({ limit = 20 } = {}) {
    const state = adapter.readState();
    ensureState(state);
    const seasons = Object.values(state.seasonDefinitions || {})
      .sort((a, b) => (Number(b.startsAtMs) || 0) - (Number(a.startsAtMs) || 0))
      .slice(0, clampInt(limit, 1, 200))
      .map((def) => clone(def));
    return { ok: true, activeSeasonId: safeId(state.seasonRuntime.activeSeasonId || '', 80), seasons };
  }

  function getActiveSeason() {
    const state = adapter.readState();
    ensureState(state);
    const sid = safeId(state.seasonRuntime.activeSeasonId || '', 80);
    return { ok: true, activeSeasonId: sid, season: sid ? clone(state.seasonDefinitions[sid] || null) : null };
  }

  return {
    flags,
    antiAbuse,
    runStartupMigrations: startup,
    createOrUpdateSeasonDefinition: upsertDefinition,
    openSeason,
    closeSeason,
    recordSoloRunFinalized,
    recordPartyMatchResult,
    claimMilestoneReward,
    getSeasonLeaderboard,
    getSeasonProfile,
    listSeasons,
    getActiveSeason,
    toUtcDayKey
  };
}

module.exports = {
  SEASON_SCHEMA_VERSION,
  TRACK_IDS,
  buildSeasonService,
  createSeasonDefinition: defaultDefinition,
  ensureSeasonStateInPlace: ensureState,
  toUtcDayKey
};
