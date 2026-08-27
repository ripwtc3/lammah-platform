import { randomUUID } from 'node:crypto';
import { ControlEvent, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import { connectorSigningOptions } from './signing.js';
import type { NormalizedTikTokEvent, StartCommand, TikTokEventType } from './types.js';

type TikTokPayload = Record<string, any>;

export class LiveNotFoundError extends Error {
  constructor(message = 'Streamer is not live') {
    super(message);
    this.name = 'LiveNotFoundError';
  }
}

export function classifyConnectionError(error: unknown): 'offline' | 'signature' | 'rate-limit' | 'network' | 'unknown' {
  const source = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/offline|not.?live|UserOffline|LIVE_NOT_FOUND/i.test(source)) return 'offline';
  if (/sign|signature|Euler|api.?key|401|403/i.test(source)) return 'signature';
  if (/429|rate.?limit|too many/i.test(source)) return 'rate-limit';
  if (/ECONN|ETIMEDOUT|network|socket|disconnect/i.test(source)) return 'network';
  return 'unknown';
}

function firstAvatar(user: TikTokPayload | undefined): string | undefined {
  const candidate = user?.avatarThumb || user?.avatarMedium || user?.avatarLarge || user?.avatar;
  if (typeof candidate === 'string') return candidate;
  const urls = candidate?.urlList || candidate?.url_list || candidate?.urls;
  return Array.isArray(urls) && urls[0] ? String(urls[0]) : undefined;
}

export class TikTokAdapter {
  constructor(private readonly command: StartCommand) {}

  private event(eventType: TikTokEventType, payload: Record<string, unknown>, sourceEventId?: string): NormalizedTikTokEvent {
    return {
      id: sourceEventId ? `tiktok:${sourceEventId}` : `tiktok:${randomUUID()}`,
      platform: 'tiktok',
      roomId: this.command.roomId,
      eventType,
      payload,
      sourceEventId,
      timestamp: new Date().toISOString(),
      schemaVersion: 1,
    };
  }

  async run(
    signal: AbortSignal,
    emit: (event: NormalizedTikTokEvent) => void,
    onConnected: (platformRoomId?: string) => void,
  ): Promise<'stream-ended' | 'disconnected'> {
    const connection = new TikTokLiveConnection(this.command.broadcasterUsername, {
      ...connectorSigningOptions(),
      fetchRoomInfoOnConnect: true,
      processInitialData: false,
      enableExtendedGiftInfo: true,
    });
    const events = connection as TikTokLiveConnection & {
      on(event: string, listener: (...args: any[]) => void): void;
      removeAllListeners(): void;
    };
    let ended = false;

    const sender = (data: TikTokPayload) => {
      const user = data.user || {};
      const followStatus = Number(user.followInfo?.followStatus ?? user.followInfo?.follow_status ?? 0);
      return {
        senderId: String(user.userId || user.id || user.uniqueId || ''),
        senderUsername: String(user.uniqueId || user.displayId || ''),
        senderDisplayName: String(user.nickname || user.uniqueId || ''),
        senderAvatarUrl: firstAvatar(user),
        followsBroadcaster: Boolean(user.isFollower || user.isFriend || followStatus >= 1),
      };
    };
    const sourceId = (data: TikTokPayload) => data.msgId ? String(data.msgId) : undefined;

    events.on(WebcastEvent.CHAT, (data: TikTokPayload) => {
      emit(this.event('chat', { ...sender(data), comment: String(data.comment || '') }, sourceId(data)));
    });
    events.on(WebcastEvent.GIFT, (data: TikTokPayload) => {
      const giftType = Number(data.giftDetails?.giftType ?? data.giftType ?? 0);
      if (giftType === 1 && !data.repeatEnd) return;
      const repeatCount = Math.max(1, Number(data.repeatCount || 1));
      const diamondValue = Math.max(0, Number(data.giftDetails?.diamondCount || data.diamondCount || 0));
      emit(this.event('gift', {
        ...sender(data),
        giftId: String(data.giftId || ''),
        giftName: String(data.giftDetails?.giftName || data.giftName || 'gift'),
        giftType,
        repeatCount,
        diamondValue,
        diamondTotal: diamondValue * repeatCount,
        streakFinal: giftType !== 1 || Boolean(data.repeatEnd),
      }, sourceId(data)));
    });
    events.on(WebcastEvent.LIKE, (data: TikTokPayload) => {
      emit(this.event('like', {
        ...sender(data),
        likeCount: Number(data.likeCount || 1),
        totalLikeCount: Number(data.totalLikeCount || 0),
      }, sourceId(data)));
    });
    events.on(WebcastEvent.MEMBER, (data: TikTokPayload) => {
      emit(this.event('member', { ...sender(data), memberCount: Number(data.memberCount || 0) }, sourceId(data)));
    });
    events.on(WebcastEvent.FOLLOW, (data: TikTokPayload) => emit(this.event('follow', sender(data), sourceId(data))));
    events.on(WebcastEvent.SHARE, (data: TikTokPayload) => emit(this.event('share', sender(data), sourceId(data))));
    events.on(WebcastEvent.ROOM_USER, (data: TikTokPayload) => {
      emit(this.event('roomUser', {
        viewerCount: Number(data.viewerCount || 0),
        topViewers: data.topViewers || [],
      }, sourceId(data)));
    });
    events.on(WebcastEvent.STREAM_END, (data: TikTokPayload) => {
      ended = true;
      emit(this.event('streamEnd', { reason: 'PLATFORM_STREAM_END' }, sourceId(data)));
    });

    try {
      const state = await connection.connect();
      onConnected(String(state.roomId || connection.roomId || ''));
    } catch (error) {
      if (classifyConnectionError(error) === 'offline') throw new LiveNotFoundError();
      throw error;
    }

    return await new Promise<'stream-ended' | 'disconnected'>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(ended ? 'stream-ended' : 'disconnected');
      };
      events.on(ControlEvent.DISCONNECTED, finish);
      signal.addEventListener('abort', () => {
        events.removeAllListeners();
        void connection.disconnect();
        finish();
      }, { once: true });
      events.on(WebcastEvent.STREAM_END, () => {
        void connection.disconnect();
        finish();
      });
    });
  }
}
