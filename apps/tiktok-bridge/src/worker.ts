import { parentPort, workerData } from 'node:worker_threads';
import { exponentialBackoff, sleep } from './backoff.js';
import { classifyConnectionError, LiveNotFoundError, TikTokAdapter } from './tiktok-adapter.js';
import type { BridgeStatus, NormalizedTikTokEvent, StartCommand, WorkerMessage } from './types.js';

const command = workerData as StartCommand;
if (!parentPort || !command.roomId || !command.broadcasterUsername) throw new Error('Invalid worker command');

const abortController = new AbortController();
const maxDelay = Number(process.env.TIKTOK_MAX_RECONNECT_DELAY_MS || 60_000);

function status(
  state: BridgeStatus['state'],
  attempt: number,
  message?: string,
  failureClass?: string,
  platformRoomId?: string,
): void {
  const payload: WorkerMessage = {
    kind: 'status',
    roomId: command.roomId,
    data: { state, attempt, message, failureClass, platformRoomId, timestamp: new Date().toISOString() },
  };
  parentPort!.postMessage(payload);
}

function emit(data: NormalizedTikTokEvent): void {
  const payload: WorkerMessage = { kind: 'event', roomId: command.roomId, data };
  parentPort!.postMessage(payload);
}

parentPort.on('message', (message: { action?: string }) => {
  if (message.action === 'stop') abortController.abort('STOP_REQUESTED');
});

let attempt = 0;
while (!abortController.signal.aborted) {
  status(attempt === 0 ? 'CONNECTING' : 'RECONNECTING', attempt);
  try {
    const result = await new TikTokAdapter(command).run(abortController.signal, emit, (platformRoomId) => {
      attempt = 0;
      status('CONNECTED', 0, undefined, undefined, platformRoomId);
    });
    if (abortController.signal.aborted || result === 'stream-ended') {
      status('STOPPED', attempt, result === 'stream-ended' ? 'PLATFORM_STREAM_END' : 'STOP_REQUESTED');
      break;
    }
    attempt += 1;
  } catch (error) {
    const failureClass = classifyConnectionError(error);
    if (error instanceof LiveNotFoundError || failureClass === 'offline') {
      status('LIVE_NOT_FOUND', attempt, 'Streamer is not live', failureClass);
    } else {
      status('RECONNECTING', attempt, error instanceof Error ? error.message : String(error), failureClass);
    }
    attempt += 1;
  }
  try {
    await sleep(exponentialBackoff(attempt - 1, maxDelay), abortController.signal);
  } catch {
    break;
  }
}

if (abortController.signal.aborted) status('STOPPED', attempt, 'STOP_REQUESTED');
