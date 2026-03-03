const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');
const { initWordCache } = require('./server/core/gameEngine');
const registerSocketHandlers = require('./server/socket/socketHandlers');
const { getPackCatalog, getPackMetricsSnapshot } = require('./server/content/packRegistry');
const { getCategoryRegistrySnapshot } = require('./server/services/categoryRegistryService');
const { resolveAudioCalloutBatch } = require('./server/services/audioCalloutResolverService');
const {
  NARRATOR_VOICES,
  getAdaptiveTtsCatalogPayload,
  synthesizeAdaptiveTts
} = require('./server/services/adaptiveTtsService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const ttsNoProviderLogState = {
  lastAt: 0,
  suppressed: 0
};

async function runAdaptiveTtsStartupPreflight() {
  const startedAt = Date.now();
  try {
    const catalog = getAdaptiveTtsCatalogPayload();
    const providers = Array.isArray(catalog && catalog.providers) ? catalog.providers : [];
    const configuredProviders = providers.filter((provider) => provider && provider.configured === true);
    const configuredList = configuredProviders.map((provider) => `${provider.id}(${provider.label})`).join(', ');
    console.log(
      `[TTS startup] Adaptive router mode=${String(catalog && catalog.engine && catalog.engine.mode || 'unknown')}` +
      ` configuredProviders=${configuredProviders.length}` +
      `${configuredList ? ` [${configuredList}]` : ''}`
    );
    const narratorSummary = (Array.isArray(NARRATOR_VOICES) ? NARRATOR_VOICES : [])
      .map((voice) => `${String(voice && voice.id || '')}->${String(voice && (voice.edgeVoice || voice.provider) || '')}`)
      .join(' | ');
    if (narratorSummary) {
      console.log(`[TTS startup] Narrator cast ${narratorSummary}`);
    }

    if (!configuredProviders.length) {
      console.log('[TTS startup] No server TTS provider configured. Client startup will preload browser fallback voices for instant lobby previews.');
      return;
    }

    const prewarmEnabled = String(process.env.LOBBY_TTS_STARTUP_PREWARM || '1').trim().toLowerCase() !== '0';
    if (!prewarmEnabled) {
      console.log('[TTS startup] Startup prewarm disabled by LOBBY_TTS_STARTUP_PREWARM=0');
      return;
    }

    const warmSpecs = [
      { voiceId: 'bm_george', text: 'Final brief. Scenario locked.', speed: 0.9 },
      { voiceId: 'af_heart', text: 'Round begins.', speed: 1.0 },
      { voiceId: 'af_bella', text: "I'm ready!", speed: 1.08 },
      { voiceId: 'am_michael', text: 'Stay focused.', speed: 0.98 },
      { voiceId: 'bm_george', text: 'Final evaluation begins.', speed: 0.92 }
    ];
    let warmed = 0;
    for (let i = 0; i < warmSpecs.length; i += 1) {
      const spec = warmSpecs[i];
      const itemStartedAt = Date.now();
      try {
        const result = await synthesizeAdaptiveTts(spec);
        warmed += 1;
        console.log(
          `[TTS startup] Warmed ${spec.voiceId} provider=${String(result && result.providerId || 'unknown')}` +
          ` cache=${result && result.cacheHit ? 'hit' : 'miss'} ms=${Math.max(0, Date.now() - itemStartedAt)}`
        );
      } catch (error) {
        console.warn(
          `[TTS startup] Warm failed ${spec.voiceId} err=${String(error && error.message || 'unknown')}`
        );
      }
    }
    console.log(`[TTS startup] Prewarm complete warmed=${warmed}/${warmSpecs.length} elapsedMs=${Math.max(0, Date.now() - startedAt)}`);
  } catch (error) {
    console.warn(`[TTS startup] Preflight failed err=${String(error && error.message || 'unknown')}`);
  }
}

app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '256kb' }));

app.get('/api/packs', (_req, res) => {
  res.json(getPackCatalog());
});

app.get('/api/packs/metrics', (_req, res) => {
  res.json(getPackMetricsSnapshot());
});

app.get('/api/categories', (_req, res) => {
  res.json(getCategoryRegistrySnapshot());
});

async function handleAudioCalloutResolveBatch(req, res) {
  const body = req && req.body && typeof req.body === 'object' ? req.body : {};
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const purpose = String(body.purpose || body.mode || 'entry-callout').trim().toLowerCase() || 'entry-callout';
  try {
    const payload = await resolveAudioCalloutBatch(null, entries, { purpose });
    const stats = payload && payload.stats && typeof payload.stats === 'object' ? payload.stats : {};
    const speechSourceCounts = {};
    const rows = Array.isArray(payload && payload.results) ? payload.results : [];
    rows.forEach((row) => {
      const source = String(row && row.speech && row.speech.source || '').trim();
      if (!source) return;
      speechSourceCounts[source] = (speechSourceCounts[source] || 0) + 1;
    });
    const speechSourceText = Object.entries(speechSourceCounts)
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, 6)
      .map(([source, count]) => `${source}:${count}`)
      .join('|');
    const classCounts = stats && stats.associationClassCounts && typeof stats.associationClassCounts === 'object'
      ? stats.associationClassCounts
      : {};
    const classText = Object.entries(classCounts)
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, 6)
      .map(([classId, count]) => `${classId}:${count}`)
      .join('|');
    console.log(
      `[Audio callouts] resolve-batch req=${entries.length}` +
      ` purpose=${purpose}` +
      ` assoc=${Number(stats.speechAssociation || stats.speechFact) || 0}` +
      ` speechQ=${Number(stats.speechQuote) || 0}` +
      ` miss=${Number(stats.misses) || 0}` +
      ` elapsedMs=${Number(stats.elapsedMs) || 0}` +
      ` cache=${payload && payload.cacheHit ? 'hit' : 'miss'}` +
      `${classText ? ` classes=[${classText}]` : ''}` +
      `${speechSourceText ? ` sources=[${speechSourceText}]` : ''}`
    );
    res.json(payload);
  } catch (error) {
    console.warn(
      `[Audio callouts] resolve-batch failed req=${entries.length} purpose=${purpose} error=${String(error && error.message || 'unknown')}`
    );
    res.status(500).json({
      error: 'audio_callout_resolve_failed',
      message: String(error && error.message || 'unknown error')
    });
  }
}

app.post('/api/audio-callouts/resolve-batch', handleAudioCalloutResolveBatch);
app.post('/api/audio-blurbs/resolve-batch', handleAudioCalloutResolveBatch); // legacy alias

app.get('/api/tts/catalog', (_req, res) => {
  res.json(getAdaptiveTtsCatalogPayload());
});

app.post('/api/tts/synthesize', async (req, res) => {
  const body = req && req.body && typeof req.body === 'object' ? req.body : {};
  try {
    const result = await synthesizeAdaptiveTts({
      text: body.text,
      voiceId: body.voiceId,
      speed: body.speed,
      pitch: body.pitch
    });
    const providerId = String(result && result.providerId || '');
    const attempts = Array.isArray(result && result.providerAttempts) ? result.providerAttempts : [];
    res.setHeader('Content-Type', String(result && result.mimeType || 'audio/mpeg'));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Lobby-TTS-Provider', providerId || 'unknown');
    res.setHeader('X-Lobby-TTS-Cache', result && result.cacheHit ? 'hit' : 'miss');
    res.setHeader('X-Lobby-TTS-Attempts', attempts.map((a) => `${a.providerId}:${a.ok ? 'ok' : 'fail'}`).join(',').slice(0, 512));
    res.send(result.buffer);
  } catch (error) {
    const statusCode = Math.max(400, Math.min(599, Number(error && error.statusCode) || 500));
    const attempts = Array.isArray(error && error.providerAttempts) ? error.providerAttempts : [];
    const errMessage = String(error && error.message || 'unknown');
    if (/no_tts_provider_available/i.test(errMessage)) {
      const now = Date.now();
      const throttleMs = 15000;
      if ((now - Number(ttsNoProviderLogState.lastAt || 0)) >= throttleMs) {
        const suffix = ttsNoProviderLogState.suppressed > 0
          ? ` (+${ttsNoProviderLogState.suppressed} similar suppressed)`
          : '';
        console.warn(`[TTS] synth unavailable voice=${String(body && body.voiceId || '')} err=${errMessage}${suffix}`);
        ttsNoProviderLogState.lastAt = now;
        ttsNoProviderLogState.suppressed = 0;
      } else {
        ttsNoProviderLogState.suppressed += 1;
      }
    } else {
      console.warn(`[TTS] synth failed voice=${String(body && body.voiceId || '')} err=${errMessage}`);
    }
    res.status(statusCode).json({
      error: 'tts_synthesize_failed',
      message: errMessage,
      providerAttempts: attempts
    });
  }
});

app.use('/audio', express.static(path.join(__dirname, 'audio'), {
  etag: true,
  lastModified: true,
  maxAge: '1d'
}));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    const isDev = String(process.env.NODE_ENV || 'development').toLowerCase() !== 'production';
    const lowerPath = String(filePath || '').toLowerCase();
    const isHtml = lowerPath.endsWith('.html');
    const isFrontendCode = lowerPath.endsWith('.js') || lowerPath.endsWith('.css') || lowerPath.endsWith('.webmanifest');
    if (isHtml) {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    if (isDev && isFrontendCode) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    if (isFrontendCode) {
      // Revalidate frontend code on every navigation so deploys go live immediately.
      // ETag/Last-Modified still allow cheap 304 responses when unchanged.
      res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

const PORT = process.env.PORT || 3000;

async function bootServer() {
  // Start TTS preflight first so startup logs clearly show provider readiness before/around word loading.
  const ttsPreflightPromise = runAdaptiveTtsStartupPreflight();
  // Start independent warmups immediately so word loading can overlap with TTS startup preflight.
  initWordCache();
  registerSocketHandlers(io);

  try {
    await ttsPreflightPromise;
  } catch (_error) {
    // TTS preflight is best-effort; boot should continue even if provider warmup fails.
  }

  server.listen(PORT, () => {
    console.log(`LobbyWARS Server running on port ${PORT}`);
  });
}

void bootServer();
