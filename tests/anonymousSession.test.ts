import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS_SESSION_HEADER,
  ANONYMOUS_SESSION_STORAGE_KEY,
  anonymousSessionRequestHeaders,
  getOrCreateAnonymousSessionId,
  isValidAnonymousSessionId,
  type SessionStorageLike,
} from "../src/domain/anonymousSession";
import { demoRoutes } from "../src/data/routes";
import { ApiRouteProvider } from "../src/providers/ApiRouteProvider";
import type { RouteSearchRequest } from "../src/types";

const VALID_IDENTIFIER = "c36f4dc8-f716-4c8f-8ba1-0a4db893fc83";

function memorySessionStorage(initial: Record<string, string> = {}): SessionStorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session-limited anonymous route identifier", () => {
  it("accepts only a lowercase UUID v4 with the expected length and variant", () => {
    expect(isValidAnonymousSessionId(VALID_IDENTIFIER)).toBe(true);
    expect(isValidAnonymousSessionId(VALID_IDENTIFIER.toUpperCase())).toBe(false);
    expect(isValidAnonymousSessionId("c36f4dc8-f716-3c8f-8ba1-0a4db893fc83")).toBe(false);
    expect(isValidAnonymousSessionId("arbitrary-client-key")).toBe(false);
  });

  it("creates one random identifier and reuses it only through supplied session state", () => {
    const storage = memorySessionStorage();
    const randomUuid = vi.fn(() => VALID_IDENTIFIER);
    expect(getOrCreateAnonymousSessionId({ storage, randomUuid })).toBe(VALID_IDENTIFIER);
    expect(getOrCreateAnonymousSessionId({ storage, randomUuid })).toBe(VALID_IDENTIFIER);
    expect(randomUuid).toHaveBeenCalledOnce();
    expect(storage.getItem(ANONYMOUS_SESSION_STORAGE_KEY)).toBe(VALID_IDENTIFIER);
  });

  it("does not persist or send a value when random generation is invalid or session state is unavailable", () => {
    expect(
      getOrCreateAnonymousSessionId({
        storage: memorySessionStorage(),
        randomUuid: () => "caller-controlled",
      }),
    ).toBeNull();
    expect(anonymousSessionRequestHeaders({ storage: null })).toEqual({});
  });

  it("ApiRouteProvider sends the validated tab-session identifier without changing route semantics", async () => {
    vi.stubGlobal(
      "sessionStorage",
      memorySessionStorage({ [ANONYMOUS_SESSION_STORAGE_KEY]: VALID_IDENTIFIER }),
    );
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get(ANONYMOUS_SESSION_HEADER)).toBe(VALID_IDENTIFIER);
      return Response.json({ routes: [demoRoutes[0]] });
    });
    const request: RouteSearchRequest = {
      origin: { latitude: 35.6909, longitude: 139.6992 },
      destination: { latitude: 35.6895, longitude: 139.6922 },
      preferences: {
        maxContinuousWalkingMinutes: 10,
        requireToilet: false,
        avoidSteepSlopes: false,
        preferIndoorRest: false,
        avoidSteps: true,
      },
    };

    await expect(
      new ApiRouteProvider("/api/routes", fetchImpl as typeof fetch).getRoutes(request),
    ).resolves.toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
