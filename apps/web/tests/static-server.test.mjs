import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { pageRoutes } from '../src/workspace-navigation.js';

const appRoot = fileURLToPath(new URL('../', import.meta.url));

test('VS Code can open the ready web server and every browser module loads', async () => {
  const launch = JSON.parse(await readFile(new URL('../../../.vscode/launch.json', import.meta.url), 'utf8'));
  const webLaunch = launch.configurations.find(config => config.name === 'Rent & Play: Web');
  const readyPattern = new RegExp(webLaunch.serverReadyAction.pattern);
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
      const [output] = await Promise.race([
        once(server.stdout, 'data'),
        once(server, 'error').then(([error]) => { throw error; }),
        once(server, 'exit').then(([code]) => { throw new Error(`Server exited: ${code}`); })
      ]);
      const origin = `http://127.0.0.1:${port}`;
      assert.equal(readyPattern.exec(output.toString())?.[1], origin, `${mode}: VS Code must recognize the startup URL`);
      const html = await fetch(origin).then(response => response.text());
      for (const route of Object.values(pageRoutes)) {
        const response = await fetch(origin + route);
        assert.equal(response.status, 200, `${mode}: direct page ${route} must load`);
        assert.match(await response.text(), /id="app"/, `${mode}: ${route} must serve the app shell`);
      }
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
      if (mode === 'development') {
        const probePath = `/src/startup-probe-${process.pid}.js`;
        const probeFile = new URL(`../${probePath.slice(1)}`, import.meta.url);
        const probeSource = 'export const ready = true;';
        try {
          await writeFile(probeFile, probeSource, { flag: 'wx' });
          const response = await fetch(`${origin}${probePath}`);
          assert.equal(response.status, 200, 'New browser modules must load without restarting the server');
          assert.equal(await response.text(), probeSource);
        } finally { await unlink(probeFile).catch(() => {}); }
      }
      assert.equal((await fetch(`${origin}/server.mjs`)).status, 404);
      assert.equal((await fetch(`${origin}/.env`)).status, 404);
      assert.equal((await fetch(`${origin}/src/services/api/client.ts`)).status, 404);
    } finally {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
    }
  }
});
