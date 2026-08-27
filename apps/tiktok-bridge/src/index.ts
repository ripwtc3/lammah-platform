import { Worker } from 'node:worker_threads';
import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { WorkerMessage } from './types.js';
import { toPublicMessage } from './publicShim.js';

const config = {
  // Render (and most PaaS hosts) inject PORT; TIKTOK_BRIDGE_PORT stays as an
  // explicit override for local/other environments.
  port: Number(process.env.PORT || process.env.TIKTOK_BRIDGE_PORT || 4100),
  host: process.env.TIKTOK_BRIDGE_HOST || '0.0.0.0',
};

interface Session {
  worker: Worker;
  sockets: Set<WebSocket>;
  lastMessage: WorkerMessage | null;
}

const app = Fastify({ logger: true });
await app.register(websocketPlugin);

// One worker per unique TikTok username, shared by every browser watching
// the same stream — keyed lowercase to dedupe case variants of one username.
const sessions = new Map<string, Session>();

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '');
}

function send(socket: WebSocket, message: WorkerMessage): void {
  const publicMessage = toPublicMessage(message);
  if (!publicMessage) return;
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(publicMessage));
}

function getOrCreateSession(username: string): Session {
  const key = username.toLowerCase();
  const existing = sessions.get(key);
  if (existing) return existing;

  const worker = new Worker(new URL('./worker.js', import.meta.url), {
    workerData: { roomId: username, broadcasterUsername: username },
  });

  const session: Session = { worker, sockets: new Set(), lastMessage: null };
  sessions.set(key, session);

  worker.on('message', (message: WorkerMessage) => {
    session.lastMessage = message;
    for (const socket of session.sockets) send(socket, message);
  });

  worker.on('error', (error) => {
    app.log.error({ err: error, username }, 'TikTok worker failed');
  });

  worker.on('exit', (code) => {
    if (sessions.get(key) === session) sessions.delete(key);
    if (code !== 0) app.log.warn({ code, username }, 'TikTok worker exited');
  });

  return session;
}

function releaseSocket(username: string, socket: WebSocket): void {
  const key = username.toLowerCase();
  const session = sessions.get(key);
  if (!session) return;
  session.sockets.delete(socket);
  if (session.sockets.size === 0) {
    session.worker.postMessage({ action: 'stop' });
    const timer = setTimeout(() => void session.worker.terminate(), 5_000);
    timer.unref();
    sessions.delete(key);
  }
}

app.get('/health', async () => ({ status: 'ok', activeSessions: sessions.size }));

app.get('/ws', { websocket: true }, (socket, request) => {
  const rawUsername = (request.query as { u?: string }).u;
  if (!rawUsername || rawUsername.trim().length < 2) {
    socket.send(JSON.stringify({ type: 'status', state: 'error', message: 'missing ?u=username' }));
    socket.close();
    return;
  }

  const username = normalizeUsername(rawUsername);
  const session = getOrCreateSession(username);
  session.sockets.add(socket);

  // Late joiners immediately see the current connection state instead of
  // waiting for the next TikTok event.
  if (session.lastMessage) send(socket, session.lastMessage);

  socket.on('close', () => releaseSocket(username, socket));
  socket.on('error', () => releaseSocket(username, socket));
});

app.addHook('onClose', async () => {
  const activeSessions = [...sessions.values()];
  sessions.clear();
  for (const session of activeSessions) session.worker.postMessage({ action: 'stop' });
  await Promise.all(activeSessions.map((session) => session.worker.terminate()));
});

await app.listen({ port: config.port, host: config.host });
