// Simple static server for the `publish/` folder (no dependencies)
// Usage (PowerShell):
//   & "C:\Program Files\nodejs\node.exe" .\serve-publish.js
// Optional env:
//   $env:PORT=8080
//   $env:HOST="0.0.0.0"

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, 'publish');
const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? '5173');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function safeJoin(root, reqPath) {
  const cleaned = reqPath.split('?')[0].split('#')[0];
  const decoded = decodeURIComponent(cleaned);
  const rel = decoded.replace(/^\/+/, '');
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (!req.url) return send(res, 400, 'Bad Request');

  // SPA-ish fallback: serve index.html for unknown routes
  const urlPath = req.url.split('?')[0];
  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) return send(res, 403, 'Forbidden');

  const tryFiles = [];
  if (urlPath === '/' || urlPath === '') {
    tryFiles.push(path.join(ROOT, 'index.html'));
  } else {
    tryFiles.push(filePath);
  }

  // If not found, fallback to index.html (client-side routing)
  tryFiles.push(path.join(ROOT, 'index.html'));

  for (const p of tryFiles) {
    try {
      const stat = fs.statSync(p);
      if (!stat.isFile()) continue;
      const ext = path.extname(p).toLowerCase();
      const type = MIME[ext] ?? 'application/octet-stream';
      const content = fs.readFileSync(p);
      return send(res, 200, content, { 'Content-Type': type });
    } catch {
      // keep trying
    }
  }

  return send(res, 404, 'Not Found');
});

server.listen(PORT, HOST, () => {
  // Note: link to share externally = http://<IP-PC>:{PORT}/
  console.log(`Serving ${ROOT}`);
  console.log(`Local:   http://127.0.0.1:${PORT}/`);
  console.log(`LAN:     http://<IP-PC>:${PORT}/ (use your PC IPv4 address)`);
  console.log('Stop:    CTRL+C');
});
