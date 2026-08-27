import { eventBus } from "@/engine/EventBus";
import type { ChatEvent } from "@/engine/ChatEvent";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const MIN_POLL_MS = 5000;

interface YouTubeMessageItem {
  id: string;
  snippet: { displayMessage?: string; publishedAt: string };
  authorDetails: { displayName: string; channelId: string };
}

/**
 * Polls the official YouTube Data API v3 liveChatMessages endpoint (no
 * WebSocket available for chat — polling is the documented approach).
 * Each user supplies their own API key from Google Cloud Console.
 */
export function startYoutubeAdapter(
  roomId: string,
  videoId: string,
  apiKey: string,
  onStatus?: (state: string) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const seen = new Set<string>();

  async function resolveLiveChatId(): Promise<string | null> {
    const res = await fetch(`${API_BASE}/videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.liveStreamingDetails?.activeLiveChatId ?? null;
  }

  async function pollOnce(liveChatId: string, pageToken?: string): Promise<{ nextPageToken?: string; delayMs: number }> {
    const url = new URL(`${API_BASE}/liveChat/messages`);
    url.searchParams.set("liveChatId", liveChatId);
    url.searchParams.set("part", "snippet,authorDetails");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
    const data = await res.json();

    for (const item of (data.items as YouTubeMessageItem[]) || []) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const event: ChatEvent = {
        id: `youtube:${item.id}`,
        source: "youtube",
        roomId,
        userKey: `youtube:${item.authorDetails.channelId}`,
        displayName: item.authorDetails.displayName,
        text: item.snippet.displayMessage || "",
        timestamp: new Date(item.snippet.publishedAt).getTime(),
        kind: "comment",
      };
      eventBus.publish(event);
    }

    return { nextPageToken: data.nextPageToken, delayMs: Math.max(MIN_POLL_MS, data.pollingIntervalMillis || MIN_POLL_MS) };
  }

  async function run() {
    onStatus?.("connecting");
    const liveChatId = await resolveLiveChatId().catch(() => null);
    if (!liveChatId) {
      onStatus?.("live_not_found");
      return;
    }
    onStatus?.("connected");

    let pageToken: string | undefined;
    while (!stopped) {
      try {
        const result = await pollOnce(liveChatId, pageToken);
        pageToken = result.nextPageToken;
        await new Promise((resolve) => {
          timer = setTimeout(resolve, result.delayMs);
        });
      } catch {
        onStatus?.("reconnecting");
        await new Promise((resolve) => {
          timer = setTimeout(resolve, MIN_POLL_MS);
        });
      }
    }
  }

  void run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
