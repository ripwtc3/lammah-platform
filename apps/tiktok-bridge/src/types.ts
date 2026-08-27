export type TikTokEventType = 'chat' | 'gift' | 'like' | 'member' | 'follow' | 'share' | 'roomUser' | 'streamEnd';

export interface NormalizedTikTokEvent {
  id: string;
  platform: 'tiktok';
  roomId: string;
  eventType: TikTokEventType;
  payload: Record<string, unknown>;
  sourceEventId?: string;
  timestamp: string;
  schemaVersion: 1;
}

export interface StartCommand {
  roomId: string;
  broadcasterUsername: string;
}

export interface BridgeStatus {
  state: 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'LIVE_NOT_FOUND' | 'STOPPED';
  attempt: number;
  message?: string;
  failureClass?: string;
  platformRoomId?: string;
  timestamp: string;
}

export type WorkerMessage =
  | { kind: 'status'; roomId: string; data: BridgeStatus }
  | { kind: 'event'; roomId: string; data: NormalizedTikTokEvent };
