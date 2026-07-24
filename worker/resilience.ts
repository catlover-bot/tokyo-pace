export type CircuitState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAtMilliseconds = 0;
  private halfOpenProbeInFlight = false;

  constructor(
    readonly failureThreshold = 3,
    readonly resetAfterMilliseconds = 30_000,
  ) {}

  allowRequest(nowMilliseconds: number): boolean {
    if (this.state === "open" && nowMilliseconds - this.openedAtMilliseconds >= this.resetAfterMilliseconds) {
      this.state = "half_open";
      this.halfOpenProbeInFlight = false;
    }
    if (this.state === "open") return false;
    if (this.state === "half_open") {
      if (this.halfOpenProbeInFlight) return false;
      this.halfOpenProbeInFlight = true;
    }
    return true;
  }

  recordSuccess(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.halfOpenProbeInFlight = false;
  }

  recordFailure(nowMilliseconds: number): void {
    this.halfOpenProbeInFlight = false;
    this.consecutiveFailures += 1;
    if (this.state === "half_open" || this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAtMilliseconds = nowMilliseconds;
    }
  }

  snapshot(nowMilliseconds: number): { state: CircuitState; consecutiveFailures: number } {
    const state =
      this.state === "open" && nowMilliseconds - this.openedAtMilliseconds >= this.resetAfterMilliseconds
        ? "half_open"
        : this.state;
    return { state, consecutiveFailures: this.consecutiveFailures };
  }
}

export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number };
export type RouteRateLimiter = {
  check(key: string, nowMilliseconds: number): Promise<RateLimitDecision> | RateLimitDecision;
};

export class InMemoryFixedWindowRateLimiter implements RouteRateLimiter {
  private readonly windows = new Map<string, { startsAt: number; count: number }>();

  constructor(
    private readonly maximumRequests: number,
    private readonly windowSeconds: number,
  ) {}

  check(key: string, nowMilliseconds: number): RateLimitDecision {
    const windowMilliseconds = this.windowSeconds * 1_000;
    const previous = this.windows.get(key);
    if (!previous || nowMilliseconds - previous.startsAt >= windowMilliseconds) {
      this.windows.set(key, { startsAt: nowMilliseconds, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    previous.count += 1;
    if (previous.count <= this.maximumRequests) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMilliseconds - (nowMilliseconds - previous.startsAt)) / 1_000)),
    };
  }
}

export class ConcurrencyGate {
  private activeRequests = 0;

  constructor(private readonly maximumConcurrentRequests: number) {}

  tryAcquire(): (() => void) | null {
    if (this.activeRequests >= this.maximumConcurrentRequests) return null;
    this.activeRequests += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    };
  }

  get active(): number {
    return this.activeRequests;
  }
}

export function parseRetryAfterMilliseconds(value: string | null, nowMilliseconds: number): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - nowMilliseconds);
}

export function deterministicRetryDelayMilliseconds(
  retryIndex: number,
  baseDelayMilliseconds: number,
  maximumDelayMilliseconds: number,
  retryAfterMilliseconds: number | null,
): number {
  const exponentialDelay = baseDelayMilliseconds * 2 ** retryIndex;
  return Math.min(maximumDelayMilliseconds, Math.max(exponentialDelay, retryAfterMilliseconds ?? 0));
}

