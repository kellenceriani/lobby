const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = 4173;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
  const normalized = decoded === '/' ? '/temp-loading/index.html' : decoded;
  const absolute = path.join(root, normalized);
  if (!absolute.startsWith(root)) return null;
  return absolute;
}

const server = http.createServer((req, res) => {
  const targetPath = safeResolve(req.url || '/');
  if (!targetPath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(targetPath, (statErr, stat) => {
    if (statErr) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const finalPath = stat.isDirectory() ? path.join(targetPath, 'index.html') : targetPath;
    fs.readFile(finalPath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const ext = path.extname(finalPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

server.listen(port, () => {
  console.log(`Preview server running at http://localhost:${port}`);
  console.log('Open: http://localhost:4173/temp-loading/index.html');
});

server.on('error', (err) => {
  console.error('Preview server error:', err.message);
  process.exit(1);
});
