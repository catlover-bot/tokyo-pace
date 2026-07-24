import { describe, expect, it } from "vitest";
import {
  CircuitBreaker,
  deterministicRetryDelayMilliseconds,
  InMemoryFixedWindowRateLimiter,
  parseRetryAfterMilliseconds,
} from "../worker/resilience";

describe("Worker circuit breaker", () => {
  it("failure thresholdでopenになり、待機後は単一half-open probeだけを許可し、成功でcloseする", () => {
    const circuit = new CircuitBreaker(2, 1_000);
    expect(circuit.allowRequest(0)).toBe(true);
    circuit.recordFailure(0);
    expect(circuit.snapshot(0)).toEqual({ state: "closed", consecutiveFailures: 1 });
    expect(circuit.allowRequest(10)).toBe(true);
    circuit.recordFailure(10);
    expect(circuit.snapshot(11).state).toBe("open");
    expect(circuit.allowRequest(500)).toBe(false);
    expect(circuit.snapshot(1_010).state).toBe("half_open");
    expect(circuit.allowRequest(1_010)).toBe(true);
    expect(circuit.allowRequest(1_010)).toBe(false);
    circuit.recordSuccess();
    expect(circuit.snapshot(1_011)).toEqual({ state: "closed", consecutiveFailures: 0 });
    expect(circuit.allowRequest(1_011)).toBe(true);
  });

  it("half-open probe失敗時は再びopenへ戻る", () => {
    const circuit = new CircuitBreaker(1, 100);
    circuit.recordFailure(0);
    expect(circuit.allowRequest(100)).toBe(true);
    circuit.recordFailure(100);
    expect(circuit.snapshot(101).state).toBe("open");
  });
});

describe("Worker retry and rate limiting primitives", () => {
  it("Retry-After秒・HTTP-dateを決定的に解釈する", () => {
    const now = Date.parse("2026-07-24T00:00:00.000Z");
    expect(parseRetryAfterMilliseconds("3", now)).toBe(3_000);
    expect(parseRetryAfterMilliseconds("Fri, 24 Jul 2026 00:00:05 GMT", now)).toBe(5_000);
    expect(parseRetryAfterMilliseconds("invalid", now)).toBeNull();
  });

  it("指数backoffとRetry-Afterを最大値で上限化する", () => {
    expect(deterministicRetryDelayMilliseconds(0, 250, 2_000, null)).toBe(250);
    expect(deterministicRetryDelayMilliseconds(2, 250, 2_000, null)).toBe(1_000);
    expect(deterministicRetryDelayMilliseconds(0, 250, 2_000, 5_000)).toBe(2_000);
  });

  it("固定windowのrate limitはwindow終了後に決定的に回復する", () => {
    const limiter = new InMemoryFixedWindowRateLimiter(2, 60);
    expect(limiter.check("anonymous-hash", 0).allowed).toBe(true);
    expect(limiter.check("anonymous-hash", 1).allowed).toBe(true);
    expect(limiter.check("anonymous-hash", 2)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.check("anonymous-hash", 60_000).allowed).toBe(true);
  });
});

