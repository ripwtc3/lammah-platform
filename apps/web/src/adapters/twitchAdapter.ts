import { eventBus } from "@/engine/EventBus";
import type { ChatEvent } from "@/engine/ChatEvent";

const TWITCH_IRC_WS = "wss://irc-ws.chat.twitch.tv:443";

/**
 * Anonymous read-only connection to Twitch's public IRC-over-WebSocket chat.
 * No API key needed to read a public channel's chat. Reconnects with a fixed
 * backoff on drop; caller owns the returned stop() function's lifecycle.
 */
export function startTwitchAdapter(roomId: string, channel: string, onStatus?: (state: string) => void): () => void {
  const normalizedChannel = channel.trim().toLowerCase().replace(/^#/, "");
  let stopped = false;
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (stopped) return;
    onStatus?.("connecting");
    ws = new WebSocket(TWITCH_IRC_WS);

    ws.onopen = () => {
      const anonNick = `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
      ws?.send(`NICK ${anonNick}`);
      ws?.send(`JOIN #${normalizedChannel}`);
      onStatus?.("connected");
    };

    ws.onmessage = (ev) => {
      const lines = String(ev.data).split("\r\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING")) {
          ws?.send("PONG :tmi.twitch.tv");
          continue;
        }
        const match = line.match(/^:(\w+)!\w+@\S+\.tmi\.twitch\.tv PRIVMSG #\S+ :(.*)$/);
        if (!match) continue;
        const [, username, text] = match;
        const event: ChatEvent = {
          id: `twitch:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          source: "twitch",
          roomId,
          userKey: `twitch:${username}`,
          displayName: username,
          text,
          timestamp: Date.now(),
          kind: "comment",
        };
        eventBus.publish(event);
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
