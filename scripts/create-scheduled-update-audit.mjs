import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPDATE_PATHS = ["data/raw", "data/generated", "src/data/generated"];

export function buildScheduledUpdateAudit({
  runId = "local",
  mode,
  status,
  createdAt,
  manifestSha256,
  changedFiles,
}) {
  return {
    schemaVersion: 1,
    event: "open_data_update_review",
    runId: String(runId),
    mode,
    status,
    createdAt,
    manifestSha256,
    changedFiles: [...new Set(changedFiles)].sort(),
    publication: "artifact_for_human_review",
    automaticMainCommit: false,
  };
}

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

async function sha256(relative) {
  try {
    return createHash("sha256").update(await readFile(path.join(rootDir, relative))).digest("hex");
  } catch {
    return null;
  }
}

async function main() {
  const output = path.resolve(rootDir, argumentValue("--output", ".scheduled-update-audit/audit.json"));
  const mode = argumentValue("--mode", process.env.UPDATE_MODE || "dry-run");
  const status = argumentValue("--status", process.env.UPDATE_STATUS || "unknown");
  const diff = spawnSync("git", ["diff", "--name-only", "--", ...UPDATE_PATHS], {
    cwd: rootDir,
    encoding: "utf8",
  });
  const changedFiles = diff.status === 0
    ? diff.stdout.split(/\r?\n/u).filter(Boolean)
    : [];
  const audit = buildScheduledUpdateAudit({
    runId: process.env.GITHUB_RUN_ID || "local",
    mode,
    status,
    createdAt: new Date().toISOString(),
    manifestSha256: await sha256("data/generated/open-data-manifest.json"),
    changedFiles,
  });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(`定期更新監査ログ: ${path.relative(rootDir, output)} (${audit.changedFiles.length} changed files)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
