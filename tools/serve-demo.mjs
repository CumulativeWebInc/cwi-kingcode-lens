#!/usr/bin/env node
/**
 * tools/serve-demo.mjs — $0 static server for the lens simulator.
 * Run: npm run demo  (then open http://localhost:8080)
 * Zero dependencies — plain node:http.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docsDir = path.join(root, 'docs');
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(docsDir, urlPath === '/' ? 'index.html' : urlPath.slice(1));
    if (!file.startsWith(docsDir)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`KingCode Lens simulator: http://localhost:${PORT}  (SIMULATOR — no hardware)`);
});
