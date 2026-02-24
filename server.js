const express = require('express');
const http = require('http');
const path = require('path');
const compression = require('compression');
const { Server } = require('socket.io');
const { initWordCache } = require('./server/core/gameEngine');
const registerSocketHandlers = require('./server/socket/socketHandlers');
const { getPackCatalog, getPackMetricsSnapshot } = require('./server/content/packRegistry');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.disable('x-powered-by');
app.use(compression());

app.get('/api/packs', (_req, res) => {
  res.json(getPackCatalog());
});

app.get('/api/packs/metrics', (_req, res) => {
  res.json(getPackMetricsSnapshot());
});

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
  console.log(`🎮 LobbyWARS Server running on port ${PORT}`);
});
