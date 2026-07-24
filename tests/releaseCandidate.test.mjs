import { describe, expect, it, vi } from "vitest";
import {
  evaluateReleaseCandidate,
  hasContactPlaceholder,
  parseJsonc,
  REQUIRED_SECRET_NAME,
} from "../scripts/release-candidate-validation.mjs";
import {
  createVersionUploadCommand,
  isProductionBuildConfig,
  parseSecretNames,
  parseVersionUploadOutput,
  RELEASE_PREVIEW_COMMANDS,
  runReleasePreview,
} from "../scripts/release-preview.mjs";
import {
  deterministicMockRouteFetch,
  normalizePreviewUrl,
  runPreviewSmoke,
  verifyMockRouteContracts,
} from "../scripts/smoke-preview.mjs";
import {
  DIRECT_DEPLOY_BLOCKED_MESSAGE,
  refuseDirectProductionDeploy,
} from "../scripts/production-deploy-guard.mjs";

const requiredSecrets = { required: [REQUIRED_SECRET_NAME] };
const validWranglerConfig = {
  secrets: requiredSecrets,
  env: {
    preview: { secrets: requiredSecrets },
    production: {
      secrets: requiredSecrets,
      ratelimits: [{
        name: "ROUTE_RATE_LIMITER",
        namespace_id: "710002",
        simple: { limit: 10, period: 60 },
      }],
      version_metadata: { binding: "CF_VERSION_METADATA" },
      vars: { LOG_LEVEL: "info" },
    },
  },
};
const validPolicySource = 'const revisionDate = "2026年7月24日";\n<p>問い合わせ先：support@example.test</p>';
const placeholderPolicySource = 'const revisionDate = "2026年7月24日";\n<p>問い合わせ先：［公開問い合わせ窓口を設定予定］</p>';
const validWorkerSource = `
  const status = {
    statusScope: "observed_worker_and_bound_resources",
    authoritative: false,
    circuit: { state: "closed", scope: "local_edge_instance", authoritative: false },
    cache: { enabled: true, scope: "local_edge_instance", authoritative: false },
    rateLimiter: { mode: "binding", scope: "bound_resource", authoritative: false },
  };
`;

const validSources = {
  wranglerConfig: validWranglerConfig,
  policySource: validPolicySource,
  workerSource: validWorkerSource,
};

describe("release candidate blocker", () => {
  it("parses JSONC comments and trailing commas without changing string content", () => {
    expect(parseJsonc(`{
      // comment
      "url": "https://example.test/a//b",
      "values": [1, 2,],
    }`)).toEqual({ url: "https://example.test/a//b", values: [1, 2] });
  });

  it("accepts production rate limit, Version Metadata, required Secret, log level, and scoped status", () => {
    expect(evaluateReleaseCandidate({
      ...validSources,
      remoteSecretNames: [REQUIRED_SECRET_NAME],
      strict: true,
    })).toEqual({ blockers: [], blocking: [], strict: true });
  });

  it("keeps the public contact placeholder as a strict human release blocker", () => {
    expect(hasContactPlaceholder(placeholderPolicySource)).toBe(true);
    const result = evaluateReleaseCandidate({
      ...validSources,
      policySource: placeholderPolicySource,
      remoteSecretNames: [REQUIRED_SECRET_NAME],
      strict: true,
    });
    expect(result.blocking.map(({ id }) => id)).toEqual(["public_contact_placeholder"]);
  });

  it("blocks missing remote Secret by name without accepting or exposing a value", () => {
    const result = evaluateReleaseCandidate({
      ...validSources,
      remoteSecretNames: [],
      strict: true,
    });
    expect(result.blocking).toMatchObject([{
      id: "production_secret_missing",
      category: "external",
    }]);
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it.each([
    ["rate limit", { ...validWranglerConfig, env: { ...validWranglerConfig.env, production: { ...validWranglerConfig.env.production, ratelimits: [] } } }, "production_rate_limit_binding"],
    ["Version Metadata", { ...validWranglerConfig, env: { ...validWranglerConfig.env, production: { ...validWranglerConfig.env.production, version_metadata: undefined } } }, "production_version_metadata_binding"],
    ["required Secret", { ...validWranglerConfig, secrets: undefined }, "required_secret_declaration"],
    ["production log level", { ...validWranglerConfig, env: { ...validWranglerConfig.env, production: { ...validWranglerConfig.env.production, vars: {} } } }, "production_log_level_missing"],
    ["debug log", { ...validWranglerConfig, env: { ...validWranglerConfig.env, production: { ...validWranglerConfig.env.production, vars: { LOG_LEVEL: "debug" } } } }, "production_debug_log"],
  ])("blocks invalid %s configuration", (_label, wranglerConfig, expectedId) => {
    expect(evaluateReleaseCandidate({
      ...validSources,
      wranglerConfig,
      remoteSecretNames: [REQUIRED_SECRET_NAME],
      strict: true,
    }).blocking.map(({ id }) => id)).toContain(expectedId);
  });

  it("blocks a status response that presents local state without scope", () => {
    const result = evaluateReleaseCandidate({
      ...validSources,
      workerSource: 'const status = { circuit: "closed", cache: true, rateLimiter: true };',
      remoteSecretNames: [REQUIRED_SECRET_NAME],
      strict: true,
    });
    expect(result.blocking.map(({ id }) => id)).toContain("status_scope_contract");
  });
});

describe("release preview workflow", () => {
  it("uses production config, preview alias, and versions upload without deploy or traffic command", () => {
    const upload = createVersionUploadCommand("dist/tokyo_pace_local/wrangler.json");
    expect(upload.args).toEqual([
      "wrangler",
      "versions",
      "upload",
      "--config",
      "dist/tokyo_pace_local/wrangler.json",
      "--tag",
      "production-v1-rc",
      "--preview-alias",
      "production-v1-rc",
      "--message",
      "TOKYO PACE Production Foundation v1 release candidate",
    ]);
    const serialized = JSON.stringify({ ...RELEASE_PREVIEW_COMMANDS, upload });
    expect(serialized).not.toContain("versions deploy");
    expect(serialized).not.toContain("--keep-vars");
  });

  it("blocks the legacy direct deploy path in favor of an approved Version promotion", () => {
    expect(() => refuseDirectProductionDeploy()).toThrow(DIRECT_DEPLOY_BLOCKED_MESSAGE);
  });

  it("selects only a resolved production Vite/Wrangler redirect config", () => {
    const buildConfig = {
      targetEnvironment: "production",
      name: "tokyo-pace",
      main: "index.js",
      assets: { directory: "../client" },
      vars: { APP_ENV: "production" },
      version_metadata: { binding: "CF_VERSION_METADATA" },
      ratelimits: [{ name: "ROUTE_RATE_LIMITER", simple: { limit: 10, period: 60 } }],
    };
    expect(isProductionBuildConfig(buildConfig)).toBe(true);
    expect(isProductionBuildConfig({
      ...buildConfig,
      targetEnvironment: undefined,
      name: "tokyo-pace-local",
      vars: { APP_ENV: "local" },
    })).toBe(false);
  });

  it("runs gate then production build, verifies Secret name, and reports upload metadata", async () => {
    const calls = [];
    const outputs = [];
    const runner = vi.fn((command) => {
      calls.push(command);
      if (command === RELEASE_PREVIEW_COMMANDS.secretList || command.args === RELEASE_PREVIEW_COMMANDS.secretList.args) {
        return { status: 0, stdout: `[{"name":"${REQUIRED_SECRET_NAME}","type":"secret_text"}]` };
      }
      if (command.args.includes("versions") && command.args.includes("upload")) {
        return {
          status: 0,
          stdout: [
            "Worker Version ID: 12345678-1234-1234-1234-123456789abc",
            "Version Preview URL: https://12345678-1234-1234-1234-123456789abc-tokyo-pace.example.workers.dev",
            "Version Preview Alias URL: https://production-v1-rc-tokyo-pace.example.workers.dev",
          ].join("\n"),
        };
      }
      return { status: 0 };
    });
    const result = await runReleasePreview({
      runner,
      readSources: async () => validSources,
      resolveBuiltConfig: async () => "dist/tokyo_pace_local/wrangler.json",
      output: (message) => outputs.push(message),
    });
    expect(calls.map(({ args }) => args)).toEqual([
      RELEASE_PREVIEW_COMMANDS.verify.args,
      RELEASE_PREVIEW_COMMANDS.build.args,
      RELEASE_PREVIEW_COMMANDS.secretList.args,
      createVersionUploadCommand("dist/tokyo_pace_local/wrangler.json").args,
    ]);
    expect(calls[1].env.CLOUDFLARE_ENV).toBe("production");
    expect(result).toEqual({
      versionId: "12345678-1234-1234-1234-123456789abc",
      previewUrl: "https://production-v1-rc-tokyo-pace.example.workers.dev",
    });
    expect(outputs).toContain("Production traffic: 変更なし");
  });

  it("stops on local human blockers before listing remote Secrets or uploading", async () => {
    const calls = [];
    await expect(runReleasePreview({
      runner: (command) => {
        calls.push(command.args);
        return { status: 0 };
      },
      readSources: async () => ({ ...validSources, policySource: placeholderPolicySource }),
      resolveBuiltConfig: async () => "dist/tokyo_pace_local/wrangler.json",
      output: () => undefined,
    })).rejects.toThrow(/public_contact_placeholder/u);
    expect(calls).toEqual([
      RELEASE_PREVIEW_COMMANDS.verify.args,
      RELEASE_PREVIEW_COMMANDS.build.args,
    ]);
  });

  it("parses Secret names and Wrangler version output deterministically", () => {
    expect(parseSecretNames(`noise\n[{"name":"Z"},{"name":"A"}]\n`)).toEqual(["A", "Z"]);
    expect(parseVersionUploadOutput(`
      Worker Version ID: abcdef12-1234-5678-9abc-def012345678
      Version Preview URL: https://abcdef12-1234-5678-9abc-def012345678-example.workers.dev
      Version Preview Alias URL: https://production-v1-rc-example.workers.dev
    `)).toEqual({
      versionId: "abcdef12-1234-5678-9abc-def012345678",
      previewUrl: "https://production-v1-rc-example.workers.dev",
    });
  });
});

const apiResponse = (payload, status = 200, requestId = "request-smoke-1") => Response.json(
  { ...payload, requestId },
  {
    status,
    headers: {
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  },
);
const routeApiResponse = (payload, requestId = "request-smoke-route") => Response.json(
  { ...payload, requestId },
  {
    headers: {
      "cache-control": "private, no-store",
      "x-request-id": requestId,
    },
  },
);

const createSmokeFetch = () => {
  const calls = [];
  const fetchImpl = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    calls.push({ method, pathname: url.pathname, headers: init.headers });
    if (url.pathname === "/api/health") return apiResponse({ status: "ok" });
    if (url.pathname === "/api/status") return apiResponse({ statusScope: "observed_worker_and_bound_resources" });
    if (url.pathname === "/api/version") return apiResponse({ appVersion: "1.0.0" });
    if (url.pathname === "/api/__preview_smoke_not_found__") return apiResponse({ code: "INVALID_REQUEST" }, 404);
    if (url.pathname === "/api/routes" && method === "GET") return apiResponse({ code: "INVALID_REQUEST" }, 405);
    if (url.pathname === "/api/routes" && init.headers?.["content-type"] === "text/plain") {
      return apiResponse({ code: "INVALID_REQUEST" }, 400);
    }
    if (url.pathname === "/api/routes" && method === "POST") {
      return routeApiResponse({
        routes: ["standard", "step_avoiding", "wheelchair_profile"].map((profile) => ({
          id: `route-${profile}`,
          name: profile,
          profile,
          coordinates: [[35.69, 139.69], [35.68, 139.68]],
          durationMinutes: 12,
          distanceMeters: 1_000,
          walkingSegments: [{ id: "segment", walkingMinutes: 12 }],
        })),
        missingProfiles: [],
        warnings: [],
      });
    }
    return new Response("<!doctype html><html><body>OpenStreetMap プライバシー 利用条件 データ方針 アクセシビリティ</body></html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
  return { calls, fetchImpl };
};

describe("preview smoke test", () => {
  it("accepts HTTPS and local HTTP preview URLs but rejects credential-bearing URLs", () => {
    expect(normalizePreviewUrl("https://candidate.example.test/")).toBe("https://candidate.example.test");
    expect(normalizePreviewUrl("http://localhost:4173")).toBe("http://localhost:4173");
    expect(() => normalizePreviewUrl("http://candidate.example.test")).toThrow(/HTTPS/u);
    expect(() => normalizePreviewUrl("https://user:pass@candidate.example.test")).toThrow(/認証情報/u);
  });

  it("validates deterministic full and partial profile mock POST contracts", async () => {
    await expect(verifyMockRouteContracts()).resolves.toBeUndefined();
  });

  it("checks preview endpoints and contracts without a live ORS route POST by default", async () => {
    const { calls, fetchImpl } = createSmokeFetch();
    const mockRouteFetch = vi.fn(deterministicMockRouteFetch);
    const checks = await runPreviewSmoke({
      previewUrl: "https://candidate.example.test",
      fetchImpl,
      mockRouteFetch,
      output: () => undefined,
    });
    expect(checks).toContain("mock-partial-profile-contract");
    expect(checks).toContain("osm-attribution");
    expect(calls.some(({ pathname, method, headers }) =>
      pathname === "/api/routes"
      && method === "POST"
      && headers?.["content-type"] === "application/json")).toBe(false);
    expect(mockRouteFetch).toHaveBeenCalledTimes(2);
    expect(mockRouteFetch.mock.calls.every(([request]) =>
      request instanceof Request && request.method === "POST")).toBe(true);
  });

  it("performs exactly one live route request only with the explicit flag", async () => {
    const { calls, fetchImpl } = createSmokeFetch();
    const checks = await runPreviewSmoke({
      previewUrl: "https://candidate.example.test",
      fetchImpl,
      liveOrs: true,
      output: () => undefined,
    });
    expect(checks).toContain("live-ors-one-request");
    expect(calls.filter(({ pathname, method, headers }) =>
      pathname === "/api/routes"
      && method === "POST"
      && headers?.["content-type"] === "application/json")).toHaveLength(1);
  });

  it("rejects stack or reflected coordinate fields in public metadata/errors", async () => {
    const { fetchImpl } = createSmokeFetch();
    fetchImpl.mockImplementationOnce(async () => apiResponse({ stack: "internal", status: "ok" }));
    await expect(runPreviewSmoke({
      previewUrl: "https://candidate.example.test",
      fetchImpl,
      output: () => undefined,
    })).rejects.toThrow(/内部情報/u);
  });
});
