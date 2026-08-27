import type { WorkerMessage } from './types.js';

/**
 * Maps the internal WorkerMessage shape (unchanged from the original bridge)
 * to the simple public JSON contract browsers connect to directly:
 *   { type: "status", state, message?, code? }
 *   { type: "event", events: [{ kind, user, text?/giftName?/diamondCount?, ... }] }
 *
 * roomUser/member/share/streamEnd events are intentionally not forwarded —
 * the public contract only defines comment/gift/like/follow. Add more kinds
 * here if a future game needs them.
 */
export type PublicMessage =
  | { type: 'status'; state: string; message?: string; code?: string }
  | { type: 'event'; events: PublicEvent[] };

export interface PublicEvent {
  kind: 'comment' | 'gift' | 'like' | 'follow';
  user: string;
  text?: string;
  giftName?: string;
  diamondCount?: number;
  count?: number;
}

const STATE_MAP: Record<string, string> = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  LIVE_NOT_FOUND: 'live_not_found',
  STOPPED: 'disconnected',
};

export function toPublicMessage(message: WorkerMessage): PublicMessage | null {
  if (message.kind === 'status') {
    return {
      type: 'status',
      state: STATE_MAP[message.data.state] ?? 'error',
      message: message.data.message,
      code: message.data.failureClass,
    };
  }

  const { eventType, payload } = message.data;
  const user = String(payload.senderDisplayName || payload.senderUsername || 'مستخدم');

  switch (eventType) {
    case 'chat':
      return { type: 'event', events: [{ kind: 'comment', user, text: String(payload.comment || '') }] };
    case 'gift':
      return {
        type: 'event',
        events: [
          {
            kind: 'gift',
            user,
            giftName: String(payload.giftName || 'gift'),
            diamondCount: Number(payload.diamondTotal || 0),
          },
        ],
      };
    case 'like':
      return { type: 'event', events: [{ kind: 'like', user, count: Number(payload.likeCount || 1) }] };
    case 'follow':
      return { type: 'event', events: [{ kind: 'follow', user }] };
    default:
      return null;
  }
}
