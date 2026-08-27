/**
 * A round's countdown, kept deliberately separate from any pattern's
 * matching logic — patterns decide *what* happens when time runs out
 * (onTimeout), this only decides *when*.
 */
export class RoundTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;

  start(durationMs: number, onEnd: () => void): void {
    this.stop();
    this.handle = setTimeout(onEnd, durationMs);
  }

  stop(): void {
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
  }
}
