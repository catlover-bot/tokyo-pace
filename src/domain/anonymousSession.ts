export const ANONYMOUS_SESSION_HEADER = "x-tokyo-pace-session-id";
export const ANONYMOUS_SESSION_STORAGE_KEY = "tokyo-pace.anonymous-route-session.v1";

export type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

export type AnonymousSessionOptions = {
  storage?: SessionStorageLike | null;
  randomUuid?: () => string;
};

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isValidAnonymousSessionId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length === 36 && UUID_V4_PATTERN.test(value);
}

function browserSessionStorage(): SessionStorageLike | null {
  try {
    return typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function browserRandomUuid(): string | null {
  try {
    return typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : null;
  } catch {
    return null;
  }
}

/**
 * Returns one random identifier for the lifetime of the current browser tab.
 * Failure to access browser session state safely degrades to no identifier, so
 * the Worker can apply its transient salted-IP fallback.
 */
export function getOrCreateAnonymousSessionId(
  options: AnonymousSessionOptions = {},
): string | null {
  const storage = options.storage === undefined ? browserSessionStorage() : options.storage;
  if (!storage) return null;

  try {
    const existing = storage.getItem(ANONYMOUS_SESSION_STORAGE_KEY);
    if (isValidAnonymousSessionId(existing)) return existing;

    const generated = options.randomUuid?.() ?? browserRandomUuid();
    if (!isValidAnonymousSessionId(generated)) return null;
    storage.setItem(ANONYMOUS_SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return null;
  }
}

export function anonymousSessionRequestHeaders(
  options: AnonymousSessionOptions = {},
): Record<string, string> {
  const identifier = getOrCreateAnonymousSessionId(options);
  return identifier ? { [ANONYMOUS_SESSION_HEADER]: identifier } : {};
}
