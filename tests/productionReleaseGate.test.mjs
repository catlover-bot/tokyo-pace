import { describe, expect, it } from "vitest";
import {
  evaluateBundleBudget,
  scanSecretLeaks,
  scanSecurityRisks,
  validateAccessibilitySources,
  validateApiContractSource,
} from "../scripts/production-validation.mjs";
import { PRODUCTION_CHECKS, runProductionChecks } from "../scripts/verify-production.mjs";
import { buildScheduledUpdateAudit } from "../scripts/create-scheduled-update-audit.mjs";

describe("production release gate", () => {
  it("covers every offline production check without deploy or live data update", () => {
    expect(PRODUCTION_CHECKS.map(({ id }) => id)).toEqual([
      "data-determinism",
      "typecheck",
      "lint",
      "unit",
      "api-contract-tests",
      "build",
      "bundle-budget",
      "security-grep",
      "secret-scan",
      "release-config",
      "accessibility-static",
      "e2e",
      "git-diff-check",
    ]);
    const serialized = JSON.stringify(PRODUCTION_CHECKS);
    expect(serialized).not.toContain("data:update");
    expect(serialized).not.toContain("deploy");
    expect(serialized).not.toContain("openrouteservice.org");
  });

  it("runs checks in order and fails fast without invoking later checks", () => {
    const calls = [];
    expect(() => runProductionChecks({
      checks: PRODUCTION_CHECKS.slice(0, 3),
      runner: (check) => {
        calls.push(check.id);
        return { status: check.id === "typecheck" ? 7 : 0 };
      },
    })).toThrow(/typecheck/u);
    expect(calls).toEqual(["data-determinism", "typecheck"]);
  });

  it("reports success only after every check succeeds", () => {
    const checks = PRODUCTION_CHECKS.slice(0, 3);
    expect(runProductionChecks({
      checks,
      runner: () => ({ status: 0 }),
    })).toEqual(checks.map(({ id }) => id));
  });
});

describe("production static validation", () => {
  it("finds unsafe browser and sensitive logging patterns without returning values", () => {
    const findings = scanSecurityRisks([{
      relative: "src/example.ts",
      content: "eval(code);\nconsole.log(latitude);\nnew ApiRouteProvider(window.fetch);",
    }]);
    expect(findings.map(({ rule }) => rule).sort()).toEqual([
      "dynamic-eval",
      "sensitive-console-argument",
      "unbound-browser-fetch",
    ]);
    expect(findings.every((finding) => !("value" in finding))).toBe(true);
  });

  it("finds credential-shaped content but never includes the credential in findings", () => {
    const credential = `ghp_${"a".repeat(35)}`;
    const findings = scanSecretLeaks([{
      relative: "worker/example.ts",
      content: `const accidental = "${credential}";`,
    }]);
    expect(findings).toEqual([{ file: "worker/example.ts", line: 1, rule: "github-token" }]);
    expect(JSON.stringify(findings)).not.toContain(credential);
  });

  it("allows documented placeholder Secret names", () => {
    const findings = scanSecretLeaks([{
      relative: ".dev.vars.example",
      content: "OPENROUTESERVICE_API_KEY=replace-with-local-development-key\n",
    }]);
    expect(findings).toEqual([]);
  });

  it("checks accessibility foundations without asserting standards conformance", () => {
    const valid = validateAccessibilitySources({
      indexHtml: '<html lang="ja"><meta name="viewport" content="width=device-width">',
      componentSource: '<a href="#main-content">skip</a><main id="main-content"><h1>x</h1><label>x</label><p role="status">x</p></main>',
      styles: "button { min-height: 44px; } a:focus-visible { outline: 2px solid; } @media (max-width: 390px) {} @media (prefers-reduced-motion: reduce) {}",
    });
    expect(valid).toEqual([]);
  });

  it("reports missing accessibility foundations deterministically", () => {
    const failures = validateAccessibilitySources({
      indexHtml: "<html>",
      componentSource: "<div />",
      styles: "",
    });
    expect(failures).toEqual([
      "document-language",
      "responsive-viewport",
      "skip-link",
      "main-landmark-target",
      "single-page-heading",
      "form-label",
      "status-announcement",
      "visible-keyboard-focus",
      "minimum-button-target",
      "reduced-motion",
      "small-screen-reflow",
    ]);
  });

  it("enforces all configured bundle limits", () => {
    const result = evaluateBundleBudget([
      { relative: "dist/client/assets/a.js", bytes: 60 },
      { relative: "dist/client/assets/b.js", bytes: 50 },
      { relative: "dist/client/assets/a.css", bytes: 20 },
      { relative: "dist/client/index.html", bytes: 5 },
      { relative: "dist/tokyo_pace/index.js", bytes: 40 },
    ], {
      clientJavaScriptBytes: 100,
      clientCssBytes: 20,
      largestJavaScriptChunkBytes: 70,
      workerBytes: 40,
      totalClientAssetBytes: 140,
    });
    expect(result.measurements).toEqual({
      clientJavaScriptBytes: 110,
      clientCssBytes: 20,
      largestJavaScriptChunkBytes: 60,
      workerBytes: 40,
      totalClientAssetBytes: 135,
    });
    expect(result.violations).toEqual([{ actual: 110, budget: 100, key: "clientJavaScriptBytes" }]);
  });

  it("validates the public API surface without exposing internal details", () => {
    expect(validateApiContractSource(`
      const paths = ["/api/health", "/api/status", "/api/version", "/api/routes"];
      const payload = { requestId, appVersion, environment, dataManifestVersion };
    `)).toEqual({ missingPaths: [], missingFields: [], forbidden: [] });
    expect(validateApiContractSource('const path = "/api/routes";')).toEqual({
      missingPaths: ["/api/health", "/api/status", "/api/version"],
      missingFields: ["requestId", "appVersion", "environment", "dataManifestVersion"],
      forbidden: [],
    });
  });

  it("creates a deterministic review-only update audit without automatic main commits", () => {
    expect(buildScheduledUpdateAudit({
      runId: 42,
      mode: "live-review",
      status: "success",
      createdAt: "2026-07-24T00:00:00.000Z",
      manifestSha256: "abc",
      changedFiles: ["src/data/generated/z.json", "data/generated/a.json", "data/generated/a.json"],
    })).toEqual({
      schemaVersion: 1,
      event: "open_data_update_review",
      runId: "42",
      mode: "live-review",
      status: "success",
      createdAt: "2026-07-24T00:00:00.000Z",
      manifestSha256: "abc",
      changedFiles: ["data/generated/a.json", "src/data/generated/z.json"],
      publication: "artifact_for_human_review",
      automaticMainCommit: false,
    });
  });
});
