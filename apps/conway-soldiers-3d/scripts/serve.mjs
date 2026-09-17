import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(process.argv[2] || '.');
const port = Number(process.env.PORT || 5318);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!file.startsWith(root + sep) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(403); res.end(); return; }
    if (!(await stat(file)).isFile()) throw new Error('not found');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
let retried = false;
server.on('error', error => {
  if (!process.env.PORT && !retried && ['EACCES', 'EADDRINUSE'].includes(error.code)) {
    retried = true; console.log(`Port ${port} is unavailable; choosing a free local port.`);
    server.listen(0, host); return;
  }
  console.error(`Unable to start local server: ${error.message}`); process.exitCode = 1;
});
server.on('listening', () => console.log(`Conway’s Soldiers 3D: http://${host}:${server.address().port}`));
server.listen(port, host);
