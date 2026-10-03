import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const root = process.env.NODE_ENV === 'production' ? path.join(appRoot, 'dist') : appRoot;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const appRoutes = new Set(['/', '/equipment', '/customers', '/rates', '/rentals', '/returns', '/transactions', '/maintenance', '/verification', '/reports', '/settings', '/profile']);
const browserHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const headers = { ...req.headers };
    delete headers.host;
    const upstream = http.request({ hostname: '127.0.0.1', port: Number(process.env.API_PORT || 3000), path: req.url, method: req.method, headers }, apiRes => {
      res.writeHead(apiRes.statusCode, apiRes.headers); apiRes.pipe(res);
    });
    upstream.setTimeout(10000, () => upstream.destroy());
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Backend is not running. Start apps/backend with npm run dev.' }));
    });
    req.pipe(upstream); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (appRoutes.has(pathname) ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const browserModule = /^\/src\/[A-Za-z0-9_-]+\.js$/.test(pathname);
    if (!(appRoutes.has(pathname) || pathname === '/index.html' || browserModule || pathname === '/src/styles.css' || pathname.startsWith('/public/')) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(404).end(); return; }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`Rent & Play: port ${port} is already in use. Stop the previous web server before starting again. Current web address: http://${browserHost}:${port}`);
  else console.error(`Rent & Play web server failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Rent & Play: http://${browserHost}:${server.address().port}`));
