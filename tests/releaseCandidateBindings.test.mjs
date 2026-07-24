import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), "utf8");
const parseJsonc = (source) => JSON.parse(source.replace(/^\s*\/\/.*$/gmu, ""));
const wrangler = parseJsonc(read("wrangler.jsonc"));

describe("release candidate Cloudflare bindings", () => {
  it("declares isolated positive rate-limit namespaces and production 10/60", () => {
    const local = wrangler.ratelimits[0];
    const preview = wrangler.env.preview.ratelimits[0];
    const production = wrangler.env.production.ratelimits[0];
    expect([local, preview, production].map(({ name }) => name)).toEqual([
      "ROUTE_RATE_LIMITER",
      "ROUTE_RATE_LIMITER",
      "ROUTE_RATE_LIMITER",
    ]);
    expect([local, preview, production].map(({ namespace_id }) => namespace_id)).toEqual([
      "2026072400",
      "2026072401",
      "2026072402",
    ]);
    expect([local, preview, production].every(({ namespace_id }) => /^[1-9]\d*$/u.test(namespace_id))).toBe(true);
    expect(preview.namespace_id).not.toBe(production.namespace_id);
    expect(production.simple).toEqual({ limit: 10, period: 60 });
    expect(wrangler.env.production.vars.ROUTE_RATE_LIMIT_REQUESTS).toBe("10");
  });

  it("declares Version Metadata and the required ORS Secret in every environment", () => {
    for (const config of [wrangler, wrangler.env.preview, wrangler.env.production]) {
      expect(config.version_metadata).toEqual({ binding: "CF_VERSION_METADATA" });
      expect(config.secrets).toEqual({ required: ["OPENROUTESERVICE_API_KEY"] });
    }
    expect(read("wrangler.jsonc")).not.toContain("WORKER_VERSION_ID");
  });

  it("keeps anonymous browser identity implementation scoped to session state", () => {
    const source = read("src/domain/anonymousSession.ts");
    expect(source).toContain("sessionStorage");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("document.cookie");
  });

  it("does not enable debug logging in preview or production", () => {
    expect(wrangler.vars.LOG_LEVEL).toBe("debug");
    expect(wrangler.env.preview.vars.LOG_LEVEL).toBe("info");
    expect(wrangler.env.production.vars.LOG_LEVEL).toBe("info");
  });
});
