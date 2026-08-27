import { eventBus } from "@/engine/EventBus";
import type { ChatEvent } from "@/engine/ChatEvent";

const BRIDGE_URL = import.meta.env.VITE_TIKTOK_BRIDGE_URL || "ws://localhost:4100";

type BridgeMessage =
  | { type: "status"; state: string; message?: string; code?: string }
  | { type: "event"; events: BridgeEvent[] };

interface BridgeEvent {
  kind: "comment" | "gift" | "like" | "follow";
  user: string;
  text?: string;
  giftName?: string;
  diamondCount?: number;
  count?: number;
}

function describeBridgeEvent(event: BridgeEvent): string {
  switch (event.kind) {
    case "comment":
      return event.text || "";
    case "gift":
      return `أرسل هدية ${event.giftName ?? ""} (${event.diamondCount ?? 0} 💎)`;
    case "like":
      return `أعجب (${event.count ?? 1})`;
    case "follow":
      return "تابع البث";
  }
}

/**
 * Connects directly to the standalone tiktok-bridge service (apps/tiktok-bridge)
 * over its public WebSocket contract — no API key, just the streamer's
 * username. The bridge does all the actual TikTok protocol work server-side.
 */
export function startTiktokAdapter(roomId: string, username: string, onStatus?: (state: string) => void): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (stopped) return;
    ws = new WebSocket(`${BRIDGE_URL}/ws?u=${encodeURIComponent(username)}`);

    ws.onmessage = (ev) => {
      let message: BridgeMessage;
      try {
        message = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (message.type === "status") {
        onStatus?.(message.state);
        return;
      }

      for (const bridgeEvent of message.events) {
        const chatEvent: ChatEvent = {
          id: `tiktok:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          source: "tiktok",
          roomId,
          userKey: `tiktok:${bridgeEvent.user}`,
          displayName: bridgeEvent.user,
          text: bridgeEvent.kind === "comment" ? bridgeEvent.text || "" : describeBridgeEvent(bridgeEvent),
          timestamp: Date.now(),
          kind: bridgeEvent.kind,
          raw: bridgeEvent,
        };
        eventBus.publish(chatEvent);
      }
    };

    ws.onclose = () => {
      onStatus?.("disconnected");
      if (!stopped) retryTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws?.close();
  }

  connect();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}
