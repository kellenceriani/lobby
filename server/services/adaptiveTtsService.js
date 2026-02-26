const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { pathToFileURL } = require('url');
const { spawn, spawnSync } = require('child_process');

const MAX_TEXT_LEN = 320;
const DEFAULT_TIMEOUT_MS = 30000;
const CACHE_DIR = path.join(__dirname, '..', '..', 'audio', 'generated-tts');

const inFlightSynth = new Map();
let cacheDirReady = false;
let edgeNodeModulePromise = null;
let edgeNodeModuleCache = null;
let edgeNodeModulePath = '';
let edgeNodeModuleKind = '';
let edgeNodeProbeCache = {
  checkedAt: 0,
  available: false,
  path: '',
  detail: ''
};
let edgePythonProbeCache = {
  checkedAt: 0,
  available: false,
  runner: '',
  detail: ''
};

const PROVIDER_GRADES = Object.freeze({
  edge: { label: 'Edge Neural', grade: 'A', score: 9.1, type: 'edge_hybrid' },
  chatterbox_bridge: { label: 'Chatterbox Bridge', grade: 'A+', score: 9.4, type: 'http_bridge', envPrefix: 'CHATTERBOX' },
  openvoice_bridge: { label: 'OpenVoice V2 Bridge', grade: 'A', score: 9.1, type: 'http_bridge', envPrefix: 'OPENVOICE' },
  xtts_bridge: { label: 'Coqui XTTS Bridge', grade: 'A-', score: 8.8, type: 'http_bridge', envPrefix: 'XTTS' },
  parler_bridge: { label: 'Parler-TTS Bridge', grade: 'A-', score: 8.5, type: 'http_bridge', envPrefix: 'PARLER' },
  f5_bridge: { label: 'F5-TTS Bridge', grade: 'A', score: 9.0, type: 'http_bridge', envPrefix: 'F5' },
  e2_bridge: { label: 'E2-TTS Bridge', grade: 'A', score: 9.0, type: 'http_bridge', envPrefix: 'E2' },
  fish_bridge: { label: 'Fish Audio S1 Bridge', grade: 'A', score: 9.0, type: 'http_bridge', envPrefix: 'FISH' },
  spark_bridge: { label: 'Spark-TTS Bridge', grade: 'A', score: 8.9, type: 'http_bridge', envPrefix: 'SPARK' },
  zonos_bridge: { label: 'Zonos Bridge', grade: 'A', score: 9.0, type: 'http_bridge', envPrefix: 'ZONOS' },
  piper: { label: 'Piper Local', grade: 'B', score: 7.4, type: 'piper_cli' }
});

// Keep these stable IDs for saved preferences + room sync compatibility, but remap them to the new backend.
const NARRATOR_VOICES = Object.freeze([
  {
    id: 'af_heart',
    name: 'Jenny',
    language: 'en-US',
    gender: 'female',
    traits: 'warm, host, natural',
    roleHint: 'Narration • Female 1',
    targetQuality: 'humanlike',
    overallGrade: 'A',
    provider: 'edge',
    edgeVoice: 'en-US-JennyNeural',
    providerOrder: ['edge', 'piper']
  },
  {
    id: 'af_bella',
    name: 'Aria',
    language: 'en-US',
    gender: 'female',
    traits: 'bright, articulate, energetic',
    roleHint: 'Narration • Female 2',
    targetQuality: 'humanlike',
    overallGrade: 'A',
    provider: 'edge',
    edgeVoice: 'en-US-AriaNeural',
    providerOrder: ['edge', 'piper']
  },
  {
    id: 'am_michael',
    name: 'Guy',
    language: 'en-US',
    gender: 'male',
    traits: 'heroic, steady, cinematic',
    roleHint: 'Narration • Male 1',
    targetQuality: 'humanlike',
    overallGrade: 'A',
    provider: 'edge',
    edgeVoice: 'en-US-GuyNeural',
    providerOrder: ['edge', 'piper']
  },
  {
    id: 'bm_george',
    name: 'Ryan',
    language: 'en-GB',
    gender: 'male',
    traits: 'dramatic, darker, announcer',
    roleHint: 'Narration • Male 2',
    targetQuality: 'humanlike',
    overallGrade: 'A',
    provider: 'edge',
    edgeVoice: 'en-GB-RyanNeural',
    providerOrder: ['edge', 'piper']
  }
]);

const NARRATOR_VOICE_BY_ID = new Map(NARRATOR_VOICES.map((v) => [v.id, v]));

// Hidden runtime routes used by entry/archetype cues.
const SPECIAL_VOICE_ROUTES = Object.freeze({
  'arch:heroic': {
    id: 'arch:heroic',
    providerOrder: ['chatterbox_bridge', 'xtts_bridge', 'edge', 'piper'],
    edgeVoice: 'en-US-GuyNeural',
    bridgePersona: 'heroic-cinematic',
    grade: 'A+'
  },
  'arch:villain': {
    id: 'arch:villain',
    providerOrder: ['openvoice_bridge', 'zonos_bridge', 'edge', 'piper'],
    edgeVoice: 'en-GB-RyanNeural',
    bridgePersona: 'villain-dark',
    grade: 'A'
  },
  'arch:cartoon': {
    id: 'arch:cartoon',
    providerOrder: ['chatterbox_bridge', 'fish_bridge', 'edge', 'piper'],
    edgeVoice: 'en-US-AriaNeural',
    bridgePersona: 'cartoon-bright',
    grade: 'A'
  },
  'arch:robotic': {
    id: 'arch:robotic',
    providerOrder: ['parler_bridge', 'spark_bridge', 'edge', 'piper'],
    edgeVoice: 'en-US-DavisNeural',
    bridgePersona: 'robotic-synthetic',
    grade: 'A-'
  },
  'arch:spooky': {
    id: 'arch:spooky',
    providerOrder: ['f5_bridge', 'e2_bridge', 'edge', 'piper'],
    edgeVoice: 'en-GB-RyanNeural',
    bridgePersona: 'spooky-whisper',
    grade: 'A'
  },
  'arch:chaotic': {
    id: 'arch:chaotic',
    providerOrder: ['spark_bridge', 'fish_bridge', 'edge', 'piper'],
    edgeVoice: 'en-US-AriaNeural',
    bridgePersona: 'chaotic-animated',
    grade: 'A-'
  }
});

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeText(text = '') {
  const collapsed = String(text || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  if (collapsed.length <= MAX_TEXT_LEN) return collapsed;
  return collapsed.slice(0, MAX_TEXT_LEN).trim();
}

function normalizeSpeed(value) {
  return clamp(value, 0.65, 1.6, 1);
}

function normalizePitch(value) {
  return clamp(value, 0.7, 1.35, 1);
}

function safeJsonParse(text = '') {
  try {
    return JSON.parse(String(text || ''));
  } catch (_error) {
    return null;
  }
}

function sha1(input = '') {
  return crypto.createHash('sha1').update(String(input || '')).digest('hex');
}

async function ensureCacheDir() {
  if (cacheDirReady) return CACHE_DIR;
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  cacheDirReady = true;
  return CACHE_DIR;
}

function buildCacheKey({ voiceId, speed, pitch, text, version = 'v3' }) {
  return sha1(
    `${version}|${String(voiceId || '')}|${normalizeSpeed(speed).toFixed(2)}|${normalizePitch(pitch).toFixed(2)}|${normalizeText(text).toLowerCase()}`
  );
}

function buildCachePath(cacheKey, ext = 'mp3') {
  return path.join(CACHE_DIR, `${cacheKey}.${ext}`);
}

function edgeRateFromSpeed(speed = 1) {
  const pct = Math.round((normalizeSpeed(speed) - 1) * 100);
  const clamped = Math.max(-40, Math.min(60, pct));
  return `${clamped >= 0 ? '+' : ''}${clamped}%`;
}

function edgePitchFromPitch(pitch = 1) {
  const pct = Math.round((normalizePitch(pitch) - 1) * 100);
  const clamped = Math.max(-40, Math.min(40, pct));
  return `${clamped >= 0 ? '+' : ''}${clamped}%`;
}

function resolveVoiceRoute(voiceId = '') {
  const raw = String(voiceId || '').trim();
  if (!raw) return { ...NARRATOR_VOICES[0] };
  if (NARRATOR_VOICE_BY_ID.has(raw)) return { ...NARRATOR_VOICE_BY_ID.get(raw) };
  if (SPECIAL_VOICE_ROUTES[raw]) return { ...SPECIAL_VOICE_ROUTES[raw] };
  if (raw.startsWith('edge:')) {
    return {
      id: raw,
      providerOrder: ['edge', 'piper'],
      edgeVoice: raw.slice('edge:'.length) || 'en-US-JennyNeural',
      grade: 'A'
    };
  }
  // Generic compatibility route for unknown IDs: try high-quality stacks then local fallbacks.
  return {
    id: raw,
    providerOrder: ['edge', 'xtts_bridge', 'openvoice_bridge', 'piper'],
    edgeVoice: 'en-US-JennyNeural',
    bridgePersona: raw,
    grade: 'A-'
  };
}

function getProviderEnv(providerId, suffix = 'URL') {
  const meta = PROVIDER_GRADES[providerId];
  if (!meta || !meta.envPrefix) return '';
  return String(process.env[`LOBBY_TTS_${meta.envPrefix}_${suffix}`] || '').trim();
}

function isHttpBridgeConfigured(providerId) {
  return Boolean(getProviderEnv(providerId, 'URL'));
}

function getEdgeDisableFlag() {
  const value = String(process.env.LOBBY_TTS_EDGE_DISABLE || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function getEdgeForceEnableFlag() {
  const value = String(process.env.LOBBY_TTS_EDGE_FORCE_ENABLE || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function getEdgeNodeModuleCandidates() {
  const envPath = String(process.env.LOBBY_TTS_EDGE_NODE_MODULE_PATH || '').trim();
  const rootDir = path.join(__dirname, '..', '..');
  return [
    envPath,
    path.join(process.cwd(), 'node_modules', 'node-edge-tts', 'dist', 'edge-tts.js'),
    path.join(rootDir, 'node_modules', 'node-edge-tts', 'dist', 'edge-tts.js'),
    path.join(rootDir, '.tmp_edge_tts_runtime', 'node_modules', 'node-edge-tts', 'dist', 'edge-tts.js'),
    path.join(process.cwd(), 'node_modules', 'edge-tts', 'out', 'index.js'),
    path.join(rootDir, 'node_modules', 'edge-tts', 'out', 'index.js'),
    path.join(rootDir, '.tmp_edge_tts_runtime', 'node_modules', 'edge-tts', 'out', 'index.js')
  ]
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function isEdgeNodeConfiguredSync() {
  const ttlMs = clamp(process.env.LOBBY_TTS_EDGE_PROBE_TTL_MS, 2000, 300000, 30000);
  if ((Date.now() - Number(edgeNodeProbeCache.checkedAt || 0)) < ttlMs) {
    return edgeNodeProbeCache.available === true;
  }

  let available = false;
  let resolvedPath = '';
  let detail = 'module_missing';
  const candidates = getEdgeNodeModuleCandidates();
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      if (fs.existsSync(candidate)) {
        available = true;
        resolvedPath = candidate;
        detail = 'ok';
        break;
      }
    } catch (error) {
      detail = String(error && error.message || 'probe_error').slice(0, 120);
    }
  }

  edgeNodeProbeCache = {
    checkedAt: Date.now(),
    available,
    path: resolvedPath,
    detail
  };
  return available;
}

async function loadEdgeNodeModule() {
  if (
    edgeNodeModuleCache
    && (typeof edgeNodeModuleCache.tts === 'function' || typeof edgeNodeModuleCache.EdgeTTS === 'function')
  ) {
    return edgeNodeModuleCache;
  }
  if (edgeNodeModulePromise) return edgeNodeModulePromise;

  edgeNodeModulePromise = (async () => {
    let lastError = null;
    const candidates = getEdgeNodeModuleCandidates();

    for (let i = 0; i < candidates.length; i += 1) {
      const filePath = candidates[i];
      try {
        if (!fs.existsSync(filePath)) continue;
        let mod;
        if (filePath.toLowerCase().includes('node-edge-tts')) {
          mod = require(filePath);
        } else {
          mod = await import(pathToFileURL(filePath).href);
        }
        if (mod && (typeof mod.tts === 'function' || typeof mod.EdgeTTS === 'function')) {
          edgeNodeModuleCache = mod;
          edgeNodeModulePath = filePath;
          edgeNodeModuleKind = typeof mod.EdgeTTS === 'function' ? 'node-edge-tts' : 'edge-tts';
          edgeNodeProbeCache = {
            checkedAt: Date.now(),
            available: true,
            path: filePath,
            detail: 'loaded'
          };
          return mod;
        }
        lastError = new Error('edge_node_invalid_module');
      } catch (error) {
        lastError = error;
      }
    }

    try {
      const mod = await import('edge-tts');
      if (mod && typeof mod.tts === 'function') {
        edgeNodeModuleCache = mod;
        edgeNodeModulePath = 'edge-tts';
        edgeNodeModuleKind = 'edge-tts';
        edgeNodeProbeCache = {
          checkedAt: Date.now(),
          available: true,
          path: 'edge-tts',
          detail: 'loaded'
        };
        return mod;
      }
      lastError = new Error('edge_node_invalid_module');
    } catch (error) {
      lastError = error;
    }

    edgeNodeProbeCache = {
      checkedAt: Date.now(),
      available: false,
      path: '',
      detail: String(lastError && lastError.message || 'module_missing').slice(0, 160)
    };
    const err = new Error(`edge_node_module_unavailable:${String(lastError && lastError.message || 'unknown')}`.slice(0, 300));
    err.providerId = 'edge';
    throw err;
  })();

  try {
    return await edgeNodeModulePromise;
  } finally {
    edgeNodeModulePromise = null;
  }
}

function isEdgeConfiguredSync() {
  if (getEdgeDisableFlag()) {
    edgeNodeProbeCache = {
      checkedAt: Date.now(),
      available: false,
      path: '',
      detail: 'disabled_by_env'
    };
    edgePythonProbeCache = {
      checkedAt: Date.now(),
      available: false,
      runner: '',
      detail: 'disabled_by_env'
    };
    return false;
  }
  if (getEdgeForceEnableFlag()) {
    return true;
  }
  if (isEdgeNodeConfiguredSync()) return true;
  return isEdgePythonConfiguredSync();
}

function isEdgePythonConfiguredSync() {
  if (getEdgeDisableFlag()) {
    edgePythonProbeCache = {
      checkedAt: Date.now(),
      available: false,
      runner: '',
      detail: 'disabled_by_env'
    };
    return false;
  }
  if (getEdgeForceEnableFlag()) {
    edgePythonProbeCache = {
      checkedAt: Date.now(),
      available: true,
      runner: 'forced',
      detail: 'forced_by_env'
    };
    return true;
  }

  const ttlMs = clamp(process.env.LOBBY_TTS_EDGE_PROBE_TTL_MS, 2000, 300000, 30000);
  if ((Date.now() - Number(edgePythonProbeCache.checkedAt || 0)) < ttlMs) {
    return edgePythonProbeCache.available === true;
  }

  const runners = [
    { command: String(process.env.LOBBY_TTS_EDGE_PYTHON_CMD || '').trim(), args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
    { command: 'py', args: [] }
  ].filter((item, index, arr) => item.command && arr.findIndex((x) => `${x.command}|${x.args.join(' ')}` === `${item.command}|${item.args.join(' ')}`) === index);

  let available = false;
  let detail = 'no_python_runner';
  let runnerLabel = '';
  for (let i = 0; i < runners.length; i += 1) {
    const runner = runners[i];
    const label = `${runner.command} ${runner.args.join(' ')}`.trim();
    try {
      const result = spawnSync(runner.command, [
        ...runner.args,
        '-c',
        'import edge_tts'
      ], {
        windowsHide: true,
        timeout: clamp(process.env.LOBBY_TTS_EDGE_PROBE_TIMEOUT_MS, 200, 5000, 1200),
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8'
      });
      if (result && result.error) {
        const code = String(result.error && result.error.code || result.error.message || '');
        detail = code || 'probe_error';
        if (code.includes('ENOENT')) continue;
        if (/timed?out/i.test(code)) continue;
      }
      const stderr = String(result && result.stderr || '');
      const stdout = String(result && result.stdout || '');
      if (Number(result && result.status) === 0) {
        available = true;
        detail = 'ok';
        runnerLabel = label;
        break;
      }
      if (/No module named edge_tts|import edge_tts/i.test(stderr)) {
        detail = 'module_missing';
        continue;
      }
      detail = String(stderr || stdout || `exit_${String(result && result.status)}`).trim().slice(0, 160) || 'probe_failed';
    } catch (error) {
      const code = String(error && (error.code || error.message) || '');
      detail = code || 'probe_exception';
      if (code.includes('ENOENT')) continue;
    }
  }

  edgePythonProbeCache = {
    checkedAt: Date.now(),
    available,
    runner: runnerLabel,
    detail
  };
  return available;
}

async function readFileIfExists(filePath) {
  try {
    return await fsp.readFile(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function spawnProcess(command, args, { timeoutMs = DEFAULT_TIMEOUT_MS, cwd = undefined, input = null } = {}) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let stdout = '';
    let stderr = '';
    let timer = null;
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch (error) {
      reject(error);
      return;
    }

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    const finish = (err, result) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (err) reject(err);
      else resolve(result);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try { child.kill(); } catch (_error) {}
        const error = new Error(`process_timeout_${timeoutMs}ms`);
        error.stdout = stdout;
        error.stderr = stderr;
        finish(error);
      }, timeoutMs);
    }

    child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    child.on('error', (error) => {
      error.stdout = stdout;
      error.stderr = stderr;
      finish(error);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(`process_exit_${code}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        finish(error);
        return;
      }
      finish(null, { code, stdout, stderr });
    });

    if (input != null) {
      try {
        child.stdin.write(input);
      } catch (_error) {}
    }
    try { child.stdin.end(); } catch (_error) {}
  });
}

async function synthesizeWithEdgePython({ text, voiceId, speed, pitch, route }) {
  const edgeVoice = String(route && route.edgeVoice || '').trim();
  if (!edgeVoice) {
    const error = new Error('edge_voice_missing');
    error.providerId = 'edge';
    throw error;
  }

  await ensureCacheDir();
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lobby-edge-'));
  const outPath = path.join(tmpDir, 'out.mp3');
  const pythonScript = [
    'import asyncio, sys',
    'try:',
    '    import edge_tts',
    'except Exception as e:',
    '    print(f"import_error:{e}", file=sys.stderr)',
    '    raise',
    'async def main():',
    '    text = sys.argv[1]',
    '    voice = sys.argv[2]',
    '    rate = sys.argv[3]',
    '    pitch = sys.argv[4]',
    '    out_path = sys.argv[5]',
    '    c = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)',
    '    await c.save(out_path)',
    'asyncio.run(main())'
  ].join('\n');

  const runners = [
    { command: String(process.env.LOBBY_TTS_EDGE_PYTHON_CMD || '').trim(), args: [] },
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
    { command: 'py', args: [] }
  ].filter((item, index, arr) => item.command && arr.findIndex((x) => `${x.command}|${x.args.join(' ')}` === `${item.command}|${item.args.join(' ')}`) === index);

  let lastError = null;
  for (let i = 0; i < runners.length; i += 1) {
    const runner = runners[i];
    try {
      await spawnProcess(runner.command, [
        ...runner.args,
        '-c',
        pythonScript,
        text,
        edgeVoice,
        edgeRateFromSpeed(speed),
        edgePitchFromPitch(pitch),
        outPath
      ], { timeoutMs: clamp(process.env.LOBBY_TTS_EDGE_TIMEOUT_MS, 5000, 90000, 35000) });

      const buffer = await fsp.readFile(outPath);
      if (!buffer || !buffer.length) {
        throw new Error('edge_empty_audio');
      }
      try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch (_error) {}
      edgePythonProbeCache = {
        checkedAt: Date.now(),
        available: true,
        runner: `${runner.command} ${runner.args.join(' ')}`.trim(),
        detail: 'synth_ok'
      };
      return {
        ok: true,
        providerId: 'edge',
        mimeType: 'audio/mpeg',
        ext: 'mp3',
        buffer,
        details: { edgeVoice }
      };
    } catch (error) {
      lastError = error;
      const code = String(error && (error.code || error.message) || '');
      if (code.includes('ENOENT')) continue;
      // Try next runner if edge_tts import failed on one Python executable.
      const stderr = String(error && error.stderr || '');
      if (/import_error|No module named edge_tts/i.test(stderr)) continue;
    }
  }

  try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch (_error) {}
  edgePythonProbeCache = {
    checkedAt: Date.now(),
    available: false,
    runner: edgePythonProbeCache.runner || '',
    detail: String(lastError && (lastError.stderr || lastError.message) || 'edge_unavailable').slice(0, 160)
  };
  const err = new Error(`edge_unavailable:${String(lastError && (lastError.stderr || lastError.message) || 'unknown')}`.slice(0, 400));
  err.providerId = 'edge';
  throw err;
}

async function synthesizeWithEdgeNode({ text, voiceId, speed, pitch, route }) {
  const edgeVoice = String(route && route.edgeVoice || '').trim();
  if (!edgeVoice) {
    const error = new Error('edge_voice_missing');
    error.providerId = 'edge';
    throw error;
  }

  const mod = await loadEdgeNodeModule();
  if (!mod || (typeof mod.tts !== 'function' && typeof mod.EdgeTTS !== 'function')) {
    const error = new Error('edge_node_tts_missing');
    error.providerId = 'edge';
    throw error;
  }

  const timeoutMs = clamp(process.env.LOBBY_TTS_EDGE_TIMEOUT_MS, 5000, 90000, 35000);
  let timer = null;
  try {
    let buffer;
    if (typeof mod.EdgeTTS === 'function') {
      const lang = String(edgeVoice.split('-').slice(0, 2).join('-') || 'en-US');
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lobby-edge-node-'));
      const outPath = path.join(tmpDir, 'out.mp3');
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => {
            const err = new Error(`edge_node_timeout_${timeoutMs}ms`);
            err.providerId = 'edge';
            reject(err);
          }, timeoutMs);
        });
        const ttsInstance = new mod.EdgeTTS({
          voice: edgeVoice,
          lang,
          rate: edgeRateFromSpeed(speed),
          pitch: edgePitchFromPitch(pitch),
          timeout: timeoutMs
        });
        await Promise.race([
          Promise.resolve(ttsInstance.ttsPromise(text, outPath)),
          timeoutPromise
        ]);
        buffer = await fsp.readFile(outPath);
      } finally {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch (_error) {}
      }
    } else {
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`edge_node_timeout_${timeoutMs}ms`);
          err.providerId = 'edge';
          reject(err);
        }, timeoutMs);
      });
      const result = await Promise.race([
        Promise.resolve(mod.tts(text, {
          voice: edgeVoice,
          rate: edgeRateFromSpeed(speed),
          pitch: edgePitchFromPitch(pitch)
        })),
        timeoutPromise
      ]);
      buffer = Buffer.isBuffer(result) ? result : Buffer.from(result || []);
    }
    if (!buffer || !buffer.length) {
      throw new Error('edge_empty_audio');
    }
    edgeNodeProbeCache = {
      checkedAt: Date.now(),
      available: true,
      path: edgeNodeModulePath || edgeNodeProbeCache.path || '',
      detail: 'synth_ok'
    };
    return {
      ok: true,
      providerId: 'edge',
      mimeType: 'audio/mpeg',
      ext: 'mp3',
      buffer,
      details: {
        edgeVoice,
        runtime: edgeNodeModuleKind || 'node',
        modulePath: edgeNodeModulePath || edgeNodeProbeCache.path || ''
      }
    };
  } catch (error) {
    edgeNodeProbeCache = {
      checkedAt: Date.now(),
      available: false,
      path: edgeNodeModulePath || edgeNodeProbeCache.path || '',
      detail: String(error && error.message || 'edge_node_failed').slice(0, 160)
    };
    const err = new Error(`edge_node_unavailable:${String(error && error.message || 'unknown')}`.slice(0, 400));
    err.providerId = 'edge';
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function synthesizeWithEdge({ text, voiceId, speed, pitch, route }) {
  let nodeError = null;
  let pyError = null;

  try {
    return await synthesizeWithEdgeNode({ text, voiceId, speed, pitch, route });
  } catch (error) {
    nodeError = error;
  }

  try {
    return await synthesizeWithEdgePython({ text, voiceId, speed, pitch, route });
  } catch (error) {
    pyError = error;
  }

  const err = new Error(`edge_unavailable:${String(pyError && pyError.message || nodeError && nodeError.message || 'unknown')}`.slice(0, 400));
  err.providerId = 'edge';
  err.nodeError = String(nodeError && nodeError.message || '').slice(0, 220);
  err.pythonError = String(pyError && pyError.message || '').slice(0, 220);
  throw err;
}

function getPiperModelPathForRoute(route = {}) {
  const explicit = String(process.env.LOBBY_TTS_PIPER_MODEL || '').trim();
  if (explicit) return explicit;

  const key = String(route && route.bridgePersona || route && route.id || '').toLowerCase();
  const baseDir = String(process.env.LOBBY_TTS_PIPER_MODEL_DIR || '').trim();
  if (!baseDir) return '';

  const byHint = [
    key.includes('robot') ? 'robotic.onnx' : '',
    key.includes('villain') ? 'villain.onnx' : '',
    key.includes('cartoon') ? 'cartoon.onnx' : '',
    key.includes('hero') ? 'heroic.onnx' : '',
    'default.onnx'
  ].filter(Boolean);
  for (const fileName of byHint) {
    const full = path.join(baseDir, fileName);
    if (fs.existsSync(full)) return full;
  }
  return '';
}

async function synthesizeWithPiper({ text, speed, route }) {
  const bin = String(process.env.LOBBY_TTS_PIPER_BIN || 'piper').trim();
  const modelPath = getPiperModelPathForRoute(route);
  if (!modelPath) {
    const error = new Error('piper_model_missing');
    error.providerId = 'piper';
    throw error;
  }

  await ensureCacheDir();
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lobby-piper-'));
  const outPath = path.join(tmpDir, 'out.wav');
  const lengthScale = clamp(1 / normalizeSpeed(speed), 0.65, 1.5, 1).toFixed(2);
  try {
    await spawnProcess(bin, [
      '--model', modelPath,
      '--output_file', outPath,
      '--length_scale', lengthScale
    ], {
      timeoutMs: clamp(process.env.LOBBY_TTS_PIPER_TIMEOUT_MS, 5000, 120000, 45000),
      input: text
    });
    const buffer = await fsp.readFile(outPath);
    if (!buffer || !buffer.length) throw new Error('piper_empty_audio');
    return {
      ok: true,
      providerId: 'piper',
      mimeType: 'audio/wav',
      ext: 'wav',
      buffer,
      details: { modelPath }
    };
  } catch (error) {
    const err = new Error(`piper_unavailable:${String(error && (error.stderr || error.message) || 'unknown')}`.slice(0, 400));
    err.providerId = 'piper';
    throw err;
  } finally {
    try { await fsp.rm(tmpDir, { recursive: true, force: true }); } catch (_error) {}
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeWithHttpBridge({ providerId, text, voiceId, speed, pitch, route }) {
  const url = getProviderEnv(providerId, 'URL');
  if (!url) {
    const error = new Error('bridge_url_missing');
    error.providerId = providerId;
    throw error;
  }
  const token = getProviderEnv(providerId, 'BEARER');
  const timeoutMs = clamp(getProviderEnv(providerId, 'TIMEOUT_MS'), 2000, 120000, 45000);
  const body = {
    text,
    speed: normalizeSpeed(speed),
    pitch: normalizePitch(pitch),
    voiceId: String(voiceId || ''),
    family: providerId.replace(/_bridge$/, ''),
    routeId: String(route && route.id || ''),
    persona: String(route && route.bridgePersona || ''),
    format: 'mp3'
  };
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  }, timeoutMs);
  if (!response || !response.ok) {
    throw new Error(`bridge_http_${response ? response.status : 'fail'}`);
  }
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.startsWith('audio/')) {
    const arr = await response.arrayBuffer();
    const ext = contentType.includes('wav') ? 'wav' : (contentType.includes('ogg') ? 'ogg' : 'mp3');
    return {
      ok: true,
      providerId,
      mimeType: contentType || 'audio/mpeg',
      ext,
      buffer: Buffer.from(arr),
      details: { mode: 'binary' }
    };
  }
  const json = await response.json().catch(() => null);
  const b64 = json && (json.audioBase64 || json.audio || json.data);
  if (typeof b64 !== 'string' || !b64.trim()) {
    throw new Error('bridge_invalid_payload');
  }
  const mimeType = String(json.mimeType || 'audio/mpeg');
  const ext = mimeType.includes('wav') ? 'wav' : (mimeType.includes('ogg') ? 'ogg' : 'mp3');
  return {
    ok: true,
    providerId,
    mimeType,
    ext,
    buffer: Buffer.from(b64, 'base64'),
    details: { mode: 'json' }
  };
}

async function tryProvider(providerId, req) {
  const meta = PROVIDER_GRADES[providerId];
  if (!meta) {
    const error = new Error(`unknown_provider:${providerId}`);
    error.providerId = providerId;
    throw error;
  }

  if (meta.type === 'edge_hybrid') {
    return synthesizeWithEdge(req);
  }
  if (meta.type === 'piper_cli') {
    return synthesizeWithPiper(req);
  }
  if (meta.type === 'http_bridge') {
    return synthesizeWithHttpBridge({ providerId, ...req });
  }
  const error = new Error(`unsupported_provider_type:${meta.type}`);
  error.providerId = providerId;
  throw error;
}

async function writeCacheArtifact(cacheKey, ext, buffer, meta = {}) {
  await ensureCacheDir();
  const filePath = buildCachePath(cacheKey, ext);
  await fsp.writeFile(filePath, buffer);
  const metaPath = `${filePath}.json`;
  await fsp.writeFile(metaPath, JSON.stringify({
    ...meta,
    ext,
    bytes: Number(buffer && buffer.length) || 0,
    savedAt: Date.now()
  }, null, 2));
  return { filePath, metaPath };
}

async function readCacheArtifact(cacheKey) {
  await ensureCacheDir();
  const exts = ['mp3', 'wav', 'ogg'];
  for (const ext of exts) {
    const filePath = buildCachePath(cacheKey, ext);
    const buffer = await readFileIfExists(filePath);
    if (!buffer) continue;
    const metaPath = `${filePath}.json`;
    const metaRaw = await readFileIfExists(metaPath);
    const meta = metaRaw ? safeJsonParse(String(metaRaw)) : null;
    const mimeType = String(meta && meta.mimeType || (ext === 'wav' ? 'audio/wav' : (ext === 'ogg' ? 'audio/ogg' : 'audio/mpeg')));
    return {
      cacheHit: true,
      buffer,
      ext,
      mimeType,
      meta: meta && typeof meta === 'object' ? meta : {}
    };
  }
  return null;
}

async function synthesizeAdaptiveTts({ text, voiceId, speed = 1, pitch = 1 } = {}) {
  const safeText = normalizeText(text);
  if (!safeText) {
    const error = new Error('empty_text');
    error.statusCode = 400;
    throw error;
  }
  const safeSpeed = normalizeSpeed(speed);
  const safePitch = normalizePitch(pitch);
  const route = resolveVoiceRoute(voiceId);
  const cacheKey = buildCacheKey({ voiceId: route.id || voiceId, speed: safeSpeed, pitch: safePitch, text: safeText });
  const cached = await readCacheArtifact(cacheKey);
  if (cached && cached.buffer && cached.buffer.length) {
    return {
      ok: true,
      cacheHit: true,
      buffer: cached.buffer,
      mimeType: cached.mimeType,
      ext: cached.ext,
      providerId: String(cached.meta && cached.meta.providerId || 'cache'),
      providerLabel: String((PROVIDER_GRADES[cached.meta && cached.meta.providerId] || {}).label || 'Cached'),
      voiceId: String(voiceId || ''),
      routeId: String(route && route.id || ''),
      providerAttempts: Array.isArray(cached.meta && cached.meta.providerAttempts) ? cached.meta.providerAttempts : []
    };
  }

  if (inFlightSynth.has(cacheKey)) {
    return inFlightSynth.get(cacheKey);
  }

  const job = (async () => {
    const providerAttempts = [];
    let lastError = null;
    for (const providerId of Array.isArray(route.providerOrder) ? route.providerOrder : []) {
      const startedAt = Date.now();
      try {
        const result = await tryProvider(providerId, {
          text: safeText,
          voiceId,
          speed: safeSpeed,
          pitch: safePitch,
          route
        });
        providerAttempts.push({
          providerId,
          ok: true,
          ms: Date.now() - startedAt
        });
        const mimeType = String(result && result.mimeType || 'audio/mpeg');
        const ext = String(result && result.ext || (mimeType.includes('wav') ? 'wav' : 'mp3'));
        const buffer = result && result.buffer;
        if (!Buffer.isBuffer(buffer) || !buffer.length) {
          throw new Error('empty_provider_buffer');
        }
        await writeCacheArtifact(cacheKey, ext, buffer, {
          providerId,
          mimeType,
          voiceId: String(voiceId || ''),
          routeId: String(route && route.id || ''),
          providerAttempts
        });
        return {
          ok: true,
          cacheHit: false,
          buffer,
          mimeType,
          ext,
          providerId,
          providerLabel: String((PROVIDER_GRADES[providerId] || {}).label || providerId),
          voiceId: String(voiceId || ''),
          routeId: String(route && route.id || ''),
          providerAttempts
        };
      } catch (error) {
        lastError = error;
        providerAttempts.push({
          providerId,
          ok: false,
          ms: Date.now() - startedAt,
          error: String(error && error.message || 'failed').slice(0, 220)
        });
      }
    }

    const configuredHttpProviders = Object.keys(PROVIDER_GRADES)
      .filter((providerId) => providerId.endsWith('_bridge') && isHttpBridgeConfigured(providerId));
    const configuredText = configuredHttpProviders.length
      ? ` configured bridges: ${configuredHttpProviders.join(',')}`
      : ' no bridge providers configured';
    const err = new Error(`no_tts_provider_available:${String(lastError && lastError.message || 'none')}${configuredText}`.slice(0, 500));
    err.statusCode = 503;
    err.providerAttempts = providerAttempts;
    throw err;
  })();

  inFlightSynth.set(cacheKey, job);
  try {
    return await job;
  } finally {
    inFlightSynth.delete(cacheKey);
  }
}

function getAdaptiveTtsCatalogPayload() {
  const providers = Object.entries(PROVIDER_GRADES)
    .map(([id, meta]) => ({
      id,
      label: String(meta.label || id),
      grade: String(meta.grade || ''),
      score: Number(meta.score) || 0,
      type: String(meta.type || ''),
      configured: meta.type === 'http_bridge'
        ? isHttpBridgeConfigured(id)
        : (meta.type === 'edge_hybrid'
          ? isEdgeConfiguredSync()
          : (meta.type === 'piper_cli' ? Boolean(String(process.env.LOBBY_TTS_PIPER_MODEL || process.env.LOBBY_TTS_PIPER_MODEL_DIR || '').trim()) : false))
    }))
    .sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));

  const voices = NARRATOR_VOICES.map((v) => ({
    id: v.id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    traits: v.traits,
    roleHint: v.roleHint,
    targetQuality: v.targetQuality,
    overallGrade: v.overallGrade,
    provider: v.provider,
    providerLabel: String((PROVIDER_GRADES[v.provider] || {}).label || v.provider),
    providerScore: Number((PROVIDER_GRADES[v.provider] || {}).score || 0),
    providerGrade: String((PROVIDER_GRADES[v.provider] || {}).grade || '')
  }));

  const archetypeProfiles = Object.values(SPECIAL_VOICE_ROUTES).map((route) => ({
    id: route.id,
    grade: String(route.grade || ''),
    providerOrder: Array.isArray(route.providerOrder) ? route.providerOrder.slice() : [],
    providerOrderLabeled: (Array.isArray(route.providerOrder) ? route.providerOrder : []).map((providerId) => ({
      id: providerId,
      label: String((PROVIDER_GRADES[providerId] || {}).label || providerId),
      grade: String((PROVIDER_GRADES[providerId] || {}).grade || ''),
      score: Number((PROVIDER_GRADES[providerId] || {}).score || 0),
      configured: providers.find((p) => p.id === providerId) ? providers.find((p) => p.id === providerId).configured : false
    }))
  }));

  return {
    ok: true,
    version: 1,
    engine: {
      id: 'adaptive-tts-router',
      mode: 'server-neural-with-browser-fallback',
      notes: [
        'Narration uses a universal 4-voice cast (2 female + 2 male), preferring Edge Neural with Piper fallback.',
        'Archetype and round4 sound are primarily shaped by code-driven cast mapping and prosody; bridge providers remain available for experimentation.'
      ]
    },
    voices,
    archetypeProfiles,
    providers
  };
}

function resolveServerNarratorVoiceForCue(cue = {}, narratorVoiceId = 'bm_george') {
  const fallbackNarrator = NARRATOR_VOICE_BY_ID.has(String(narratorVoiceId || ''))
    ? String(narratorVoiceId)
    : 'bm_george';
  const type = String(cue && cue.type || '').toLowerCase();
  if (type !== 'round4') return fallbackNarrator;
  const idText = String(cue && cue.id || '').toLowerCase();
  if (idText.includes('final') || idText.includes('game-ended') || idText.includes('winner')) {
    return 'bm_george';
  }
  return fallbackNarrator;
}

function resolveServerNarratorSpeedForCue(cue = {}) {
  const type = String(cue && cue.type || '').toLowerCase();
  let speed = 0.98;
  if (type === 'twist') {
    speed += 0.02;
  } else if (type === 'round4') {
    speed -= 0.06;
    const intensity = Math.max(0, Math.min(1, Number(cue && cue.intensity) || 0.6));
    speed += ((intensity - 0.55) * 0.08);
    const idText = String(cue && cue.id || '').toLowerCase();
    if (idText.includes('brief')) speed -= 0.03;
    if (idText.includes('game-ended')) speed -= 0.04;
  }
  return normalizeSpeed(Math.max(0.78, Math.min(1.35, speed)));
}

async function prewarmAdaptiveNarratorVoiceCues({
  cues = [],
  narratorVoiceId = 'bm_george',
  includeCast = false,
  timeoutMs = 1800
} = {}) {
  const rows = Array.isArray(cues) ? cues : [];
  const validCues = rows.filter((cue) => cue && typeof cue === 'object' && normalizeText(cue.text));
  if (!validCues.length) {
    return { ok: true, warmed: 0, skipped: 0, specs: 0 };
  }

  const dedupe = new Set();
  const specs = [];
  for (let i = 0; i < validCues.length; i += 1) {
    const cue = validCues[i];
    const baseVoiceId = resolveServerNarratorVoiceForCue(cue, narratorVoiceId);
    const speed = resolveServerNarratorSpeedForCue(cue);
    const targetVoiceIds = includeCast === true
      ? Array.from(new Set([baseVoiceId, ...NARRATOR_VOICES.map((v) => String(v.id || ''))].filter(Boolean)))
      : [baseVoiceId];
    for (let j = 0; j < targetVoiceIds.length; j += 1) {
      const voiceId = targetVoiceIds[j];
      const text = normalizeText(cue.text);
      const pitch = 1;
      const sig = `${voiceId}|${speed.toFixed(2)}|${pitch.toFixed(2)}|${text.toLowerCase()}`;
      if (dedupe.has(sig)) continue;
      dedupe.add(sig);
      specs.push({ voiceId, text, speed, pitch });
    }
  }

  if (!specs.length) {
    return { ok: true, warmed: 0, skipped: validCues.length, specs: 0 };
  }

  const startedAt = Date.now();
  const workPromise = Promise.allSettled(specs.map((spec) => synthesizeAdaptiveTts(spec)));
  let settled = [];
  let timedOut = false;
  if (timeoutMs > 0) {
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, Math.max(250, Number(timeoutMs) || 1800));
    });
    const result = await Promise.race([workPromise, timeoutPromise]);
    if (Array.isArray(result)) {
      settled = result;
    } else {
      return {
        ok: false,
        timedOut: true,
        warmed: 0,
        specs: specs.length,
        elapsedMs: Date.now() - startedAt
      };
    }
  } else {
    settled = await workPromise;
  }

  const warmed = settled.filter((row) => row && row.status === 'fulfilled').length;
  const failed = settled.filter((row) => row && row.status !== 'fulfilled').length;
  return {
    ok: failed === 0 && !timedOut,
    timedOut,
    warmed,
    failed,
    specs: specs.length,
    elapsedMs: Date.now() - startedAt
  };
}

module.exports = {
  NARRATOR_VOICES,
  getAdaptiveTtsCatalogPayload,
  synthesizeAdaptiveTts,
  prewarmAdaptiveNarratorVoiceCues
};
