import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));

test('development and production serve the complete browser module graph', async () => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: appRoot });
  for (const mode of ['development', 'production']) {
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const server = spawn(process.execPath, ['server.mjs'], {
      cwd: appRoot,
      env: { ...process.env, NODE_ENV: mode, HOST: '127.0.0.1', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    try {
      await Promise.race([
        once(server.stdout, 'data'),
        once(server, 'error').then(([error]) => { throw error; }),
        once(server, 'exit').then(([code]) => { throw new Error(`Server exited: ${code}`); })
      ]);
      const origin = `http://127.0.0.1:${port}`;
      const html = await fetch(origin).then(response => response.text());
      const entry = html.match(/<script type="module" src="([^"]+)"/)[1];
      const pending = [new URL(entry, origin)];
      const visited = new Set();
      while (pending.length) {
        const url = pending.pop();
        if (visited.has(url.href)) continue;
        visited.add(url.href);
        const response = await fetch(url);
        assert.equal(response.status, 200, `${mode}: ${url.pathname}`);
        assert.match(response.headers.get('content-type'), /javascript/, `${mode}: ${url.pathname}`);
        const source = await response.text();
        for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"](\.[^'"]+)['"]/g)) {
          pending.push(new URL(match[1], url));
        }
      }
      assert.ok(visited.size > 1, 'Follow imported modules from the actual app entry');
      assert.equal((await fetch(`${origin}/server.mjs`)).status, 404);
    } finally {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
    }
  }
});
