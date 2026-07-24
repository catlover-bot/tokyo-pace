import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PRODUCTION_CHECKS = Object.freeze([
  { id: "data-determinism", command: "npm", args: ["run", "data:verify-determinism"] },
  { id: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { id: "lint", command: "npm", args: ["run", "lint"] },
  { id: "unit", command: "npm", args: ["test"] },
  { id: "api-contract-tests", command: "npm", args: ["run", "test:api-contract"] },
  { id: "build", command: "npm", args: ["run", "build"] },
  { id: "bundle-budget", command: "npm", args: ["run", "verify:bundle-budget"] },
  { id: "security-grep", command: "npm", args: ["run", "verify:security"] },
  { id: "secret-scan", command: "npm", args: ["run", "verify:secrets"] },
  { id: "release-config", command: "npm", args: ["run", "verify:release-config"] },
  { id: "accessibility-static", command: "npm", args: ["run", "verify:accessibility"] },
  { id: "e2e", command: "npm", args: ["run", "test:e2e"] },
  { id: "git-diff-check", command: "git", args: ["diff", "--check"] },
]);

const defaultRunner = ({ command, args }) => spawnSync(command, args, {
  cwd: rootDir,
  env: {
    ...process.env,
    TOKYO_PACE_PRODUCTION_VERIFY: "1",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

export function runProductionChecks({ checks = PRODUCTION_CHECKS, runner = defaultRunner } = {}) {
  for (const check of checks) {
    console.log(`\n[verify:production] ${check.id}`);
    const result = runner(check);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const error = new Error(`production gate failed: ${check.id}`);
      error.checkId = check.id;
      error.exitCode = result.status ?? 1;
      throw error;
    }
  }
  return checks.map(({ id }) => id);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(PRODUCTION_CHECKS, null, 2));
  } else {
    try {
      const completed = runProductionChecks();
      console.log(`\nproduction release gate成功: ${completed.length} checks`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
    }
  }
}
