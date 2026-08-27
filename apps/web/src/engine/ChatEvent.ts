export type ChatSource = "twitch" | "kick" | "youtube" | "tiktok" | "local";

/**
 * The one shape every game engine consumes, regardless of where the message
 * actually came from. Adapters (src/adapters/*) are the only code allowed to
 * know about platform-specific transports/payloads — everything downstream
 * (games/*) reads only ChatEvent.
 */
export interface ChatEvent {
  id: string;
  source: ChatSource;
  roomId: string;
  userKey: string;
  displayName: string;
  text: string;
  timestamp: number;
  /** Non-chat signals (gift/like/follow) piggyback on the same stream via kind. */
  kind: "comment" | "gift" | "like" | "follow";
  /** Raw platform payload, kept for features that need platform-specific data (e.g. gift value). */
  raw?: unknown;
}
