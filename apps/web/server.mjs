import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import esbuild from 'esbuild';

const appRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const root = process.env.NODE_ENV === 'production' ? path.join(appRoot, 'dist') : appRoot;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const appRoutes = new Set(['/', '/equipment', '/customers', '/messages', '/rates', '/rentals', '/returns', '/transactions', '/maintenance', '/verification', '/reports', '/reports/equipment', '/reports/operations', '/reports/forecast', '/reports/recommendations', '/reports/audit', '/settings', '/payments', '/profile']);
const browserHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;

let reactBuild = null, reactInputStamp = '';
async function buildReactUiDev() {
  if (reactBuild) return reactBuild;
  reactBuild = (async () => {
    const directory = path.join(appRoot, 'src/react');
    const files = (await readdir(directory)).sort();
    const states = await Promise.all(files.map(name => stat(path.join(directory, name))));
    const stamp = states.map((state, index) => `${files[index]}:${state.mtimeMs}:${state.size}`).join('|');
    if (stamp === reactInputStamp) return;
    const output = await stat(path.join(appRoot, 'src/react-ui.js')).catch(() => null);
    if (!reactInputStamp && output && output.mtimeMs >= Math.max(...states.map(state => state.mtimeMs))) { reactInputStamp = stamp; return; }
    await esbuild.build({
    entryPoints: [path.join(appRoot, 'src/react/index.jsx')],
    outfile: path.join(appRoot, 'src/react-ui.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    plugins: [
      {
        name: 'externalize-src-modules',
        setup(build) {
          build.onResolve({ filter: /^\.\.\/[A-Za-z0-9_-]+\.js$/ }, args => ({
            path: './' + path.basename(args.path),
            external: true
          }));
        }
      }
    ],
    logLevel: 'silent'
    });
    reactInputStamp = stamp;
  })();
  try { await reactBuild; } finally { reactBuild = null; }
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const headers = { ...req.headers };
    delete headers.host;
    const upstream = http.request({ hostname: '127.0.0.1', port: Number(process.env.API_PORT || 3000), path: req.url, method: req.method, headers }, apiRes => {
      res.writeHead(apiRes.statusCode, apiRes.headers); apiRes.pipe(res);
    });
    upstream.setTimeout(req.url.startsWith('/api/users') || req.url.includes('/registration/email-code') ? 30000 : 10000, () => upstream.destroy());
    upstream.on('error', () => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[Proxy] Cannot reach backend on 127.0.0.1:${process.env.API_PORT || 3000}. Make sure apps/backend is running.`);
      }
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Unable to connect to the server. Please try again later.' }));
    });
    req.pipe(upstream); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (process.env.NODE_ENV !== 'production' && pathname === '/src/react-ui.js') {
      await buildReactUiDev().catch(() => {});
    }
    const target = path.resolve(root, '.' + (appRoutes.has(pathname) ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const browserModule = /^\/src\/[A-Za-z0-9_-]+\.js$/.test(pathname);
    if (!(appRoutes.has(pathname) || pathname === '/index.html' || browserModule || pathname === '/src/styles.css' || pathname.startsWith('/public/')) || pathname.split('/').some(part => part.startsWith('.'))) { res.writeHead(404).end(); return; }
    const body = await readFile(target);
    const etag = '"' + createHash('sha256').update(body).digest('base64url') + '"';
    const headers = { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': path.extname(target) === '.html' ? 'no-store' : 'private, no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag && ['GET', 'HEAD'].includes(req.method)) { res.writeHead(304, headers).end(); return; }
    res.writeHead(200, headers); if (req.method === 'HEAD') res.end(); else res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`Rent & Play: port ${port} is already in use. Stop the previous web server before starting again. Current web address: http://${browserHost}:${port}`);
  else console.error(`Rent & Play web server failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Rent & Play: http://${browserHost}:${server.address().port}`));
