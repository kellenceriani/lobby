const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');
const { initWordCache } = require('./server/core/gameEngine');
const registerSocketHandlers = require('./server/socket/socketHandlers');
const { getPackCatalog, getPackMetricsSnapshot } = require('./server/content/packRegistry');
const {
  getCachedAudioClipIndexPayload,
  getAudioClipStatsPayload,
  resolveAudioClipBatch
} = require('./server/services/audioClipResolverService');
const { resolveAudioBlurbBatch } = require('./server/services/audioBlurbResolverService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '256kb' }));

app.get('/api/packs', (_req, res) => {
  res.json(getPackCatalog());
});

app.get('/api/packs/metrics', (_req, res) => {
  res.json(getPackMetricsSnapshot());
});

app.get('/api/audio-clips/index', (_req, res) => {
  const clipsDir = path.join(__dirname, 'audio', 'clips');
  res.json(getCachedAudioClipIndexPayload(clipsDir));
});

app.get('/api/audio-clips/stats', (_req, res) => {
  const clipsDir = path.join(__dirname, 'audio', 'clips');
  res.json(getAudioClipStatsPayload(clipsDir));
});

app.post('/api/audio-clips/resolve-batch', (req, res) => {
  const clipsDir = path.join(__dirname, 'audio', 'clips');
  const body = req && req.body && typeof req.body === 'object' ? req.body : {};
  const entries = Array.isArray(body.entries) ? body.entries : [];
  res.json(resolveAudioClipBatch(clipsDir, entries));
});

app.post('/api/audio-blurbs/resolve-batch', async (req, res) => {
  const clipsDir = path.join(__dirname, 'audio', 'clips');
  const body = req && req.body && typeof req.body === 'object' ? req.body : {};
  const entries = Array.isArray(body.entries) ? body.entries : [];
  try {
    const payload = await resolveAudioBlurbBatch(clipsDir, entries);
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
    console.log(
      `[Audio blurbs] resolve-batch req=${entries.length}` +
      ` clip=${Number(stats.audioClip) || 0}` +
      ` speechQ=${Number(stats.speechQuote) || 0}` +
      ` speechF=${Number(stats.speechFact) || 0}` +
      ` miss=${Number(stats.misses) || 0}` +
      ` libraryEmpty=${Number(stats.libraryEmpty) || 0}` +
      ` quoteFetchAvgMs=${Number(stats.quoteFetchMsAvg) || 0}` +
      ` elapsedMs=${Number(stats.elapsedMs) || 0}` +
      ` cache=${payload && payload.cacheHit ? 'hit' : 'miss'}` +
      `${speechSourceText ? ` speechSources=[${speechSourceText}]` : ''}`
    );
    res.json(payload);
  } catch (error) {
    console.warn(
      `[Audio blurbs] resolve-batch failed req=${entries.length} error=${String(error && error.message || 'unknown')}`
    );
    res.status(500).json({
      error: 'audio_blurb_resolve_failed',
      message: String(error && error.message || 'unknown error')
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

initWordCache();
registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`LobbyWARS Server running on port ${PORT}`);
});
