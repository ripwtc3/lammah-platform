import type { ChatEvent } from "./ChatEvent";

type Listener = (event: ChatEvent) => void;

/**
 * One process-wide pub/sub that every adapter pushes into and every game
 * engine subscribes to. Scoped per room by the subscriber, not the bus —
 * keeps the bus itself trivial and framework-free.
 */
class EventBus {
  private listeners = new Set<Listener>();

  publish(event: ChatEvent) {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeRoom(roomId: string, listener: Listener): () => void {
    return this.subscribe((event) => {
      if (event.roomId === roomId) listener(event);
    });
  }
}

export const eventBus = new EventBus();
