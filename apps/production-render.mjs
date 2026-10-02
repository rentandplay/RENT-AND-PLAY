import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';

const apiPort = Number(process.env.API_PORT || 3001);
const webPort = Number(process.env.PORT || 10000);
const baseEnv = { ...process.env, NODE_ENV: 'production' };
const apiServer = spawn(process.execPath, ['apps/backend/src/server.mjs'], {
    env: { ...baseEnv, PORT: String(apiPort) },
    stdio: 'inherit'
});
let webServer;

let stopping = false;
function stop(signal, exitCode = 0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = exitCode;
    for (const child of [webServer, apiServer].filter(Boolean)) if (child.exitCode === null) child.kill(signal);
}

function monitor(child) {
    child.on('error', error => {
        console.error('A Rent & Play service could not start:', error.message);
        stop('SIGTERM', 1);
    });
    child.on('exit', (code, signal) => {
        if (!stopping) {
            console.error(`A Rent & Play service stopped (${signal || code}).`);
            stop('SIGTERM', code || 1);
        }
    });
}

async function waitForApi() {
    let lastError;
    for (let attempt = 0; attempt < 50; attempt++) {
        if (stopping) throw new Error('The API service stopped before becoming ready.');
        try {
            await new Promise((resolve, reject) => {
                const socket = createConnection({ host: '127.0.0.1', port: apiPort });
                socket.once('connect', () => { socket.destroy(); resolve(); });
                socket.once('error', error => { socket.destroy(); reject(error); });
            });
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    throw new Error(`The API service did not start: ${lastError?.message || 'startup timed out'}`);
}

monitor(apiServer);
try {
    await waitForApi();
    webServer = spawn(process.execPath, ['apps/web/server.mjs'], {
        env: { ...baseEnv, PORT: String(webPort), API_PORT: String(apiPort), HOST: '0.0.0.0' },
        stdio: 'inherit'
    });
    monitor(webServer);
} catch (error) {
    console.error(error.message);
    stop('SIGTERM', 1);
}

process.on('SIGINT', () => stop('SIGTERM'));
process.on('SIGTERM', () => stop('SIGTERM'));