import { describe, expect, it } from "vitest";
import { resolveRuntimeConfig } from "../worker/runtimeConfig";

describe("Worker runtime environment configuration", () => {
  it.each(["local", "preview", "production"] as const)("APP_ENV=%sを明確に分離する", (environment) => {
    expect(resolveRuntimeConfig({ APP_ENV: environment }).appEnvironment).toBe(environment);
  });

  it("不正値を安全な既定値と上限へ戻す", () => {
    const config = resolveRuntimeConfig({
      APP_ENV: "other",
      ROUTE_MAX_CONCURRENCY: "0",
      ORS_MAX_RETRIES: "999",
      ORS_TIMEOUT_MILLISECONDS: "not-a-number",
    });
    expect(config.appEnvironment).toBe("local");
    expect(config.maxConcurrency).toBe(4);
    expect(config.orsMaxRetries).toBe(1);
    expect(config.orsTimeoutMilliseconds).toBe(8_000);
  });

  it("Secretは公開runtime configへ含めない", () => {
    const config = resolveRuntimeConfig({ OPENROUTESERVICE_API_KEY: "test-placeholder-key" });
    expect(JSON.stringify(config)).not.toContain("test-placeholder-key");
    expect(config).not.toHaveProperty("OPENROUTESERVICE_API_KEY");
  });

  it("productionではdebug log指定を安全にinfoへ制限する", () => {
    expect(resolveRuntimeConfig({ APP_ENV: "local", LOG_LEVEL: "debug" }).logLevel).toBe("debug");
    expect(resolveRuntimeConfig({ APP_ENV: "preview", LOG_LEVEL: "warn" }).logLevel).toBe("warn");
    expect(resolveRuntimeConfig({ APP_ENV: "production", LOG_LEVEL: "debug" }).logLevel).toBe("info");
    expect(resolveRuntimeConfig({ APP_ENV: "production", LOG_LEVEL: "error" }).logLevel).toBe("error");
  });
});
