import { spawnSync } from "node:child_process";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateReleaseCandidate,
  formatReleaseCandidateResult,
  PREVIEW_ALIAS,
  readReleaseCandidateSources,
  REQUIRED_SECRET_NAME,
} from "./release-candidate-validation.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const RELEASE_PREVIEW_COMMANDS = Object.freeze({
  verify: Object.freeze({
    command: "npm",
    args: Object.freeze(["run", "verify:production"]),
  }),
  build: Object.freeze({
    command: "npm",
    args: Object.freeze(["run", "build"]),
  }),
  secretList: Object.freeze({
    command: "npx",
    args: Object.freeze([
      "wrangler",
      "secret",
      "list",
      "--config",
      "wrangler.jsonc",
      "--env",
      "production",
      "--format",
      "json",
    ]),
  }),
});

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "gu");
const stripAnsi = (value) => value.replace(ansiPattern, "");

export function createVersionUploadCommand(configPath) {
  return Object.freeze({
    command: "npx",
    args: Object.freeze([
      "wrangler",
      "versions",
      "upload",
      "--config",
      configPath,
      "--tag",
      PREVIEW_ALIAS,
      "--preview-alias",
      PREVIEW_ALIAS,
      "--message",
      "TOKYO PACE Production Foundation v1 release candidate",
    ]),
  });
}

const defaultRunner = ({ command, args, capture = false, env = process.env }) => spawnSync(command, args, {
  cwd: rootDir,
  env,
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
});

function ensureSuccessful(result, step) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`release preview failed: ${step}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
  return result;
}

export function parseSecretNames(output) {
  for (const candidate of stripAnsi(output).matchAll(/\[[^\]]*\]/gu)) {
    try {
      const values = JSON.parse(candidate[0]);
      if (!Array.isArray(values)) continue;
      return values
        .map((value) => value?.name)
        .filter((name) => typeof name === "string")
        .sort();
    } catch {
      // Wrangler may print non-JSON progress lines before its JSON result.
    }
  }
  throw new Error("Cloudflare Secret一覧の形式を確認できませんでした。");
}

export function parseVersionUploadOutput(output) {
  const plainOutput = stripAnsi(output);
  const versionId =
    plainOutput.match(/(?:Worker\s+)?Version\s+ID\s*[:：]\s*([0-9a-f-]{16,})/iu)?.[1]
    ?? plainOutput.match(/\b([0-9a-f]{8}-[0-9a-f-]{27,})\b/iu)?.[1]
    ?? null;
  const previewUrl =
    plainOutput.match(/Version\s+Preview\s+Alias\s+URL\s*[:：]\s*(https:\/\/[^\s]+)/iu)?.[1]
    ?? plainOutput.match(/https:\/\/[^\s]*production-v1-rc[^\s]*\.workers\.dev[^\s]*/iu)?.[0]
    ?? null;
  if (!versionId || !previewUrl) {
    throw new Error("Wrangler出力からVersion IDまたはpreview URLを確認できませんでした。");
  }
  return {
    versionId,
    previewUrl: previewUrl.replace(/[),.;]+$/u, ""),
  };
}

const exists = async (target, expectedType) => {
  try {
    const information = await stat(target);
    return expectedType === "file" ? information.isFile() : information.isDirectory();
  } catch {
    return false;
  }
};

export function isProductionBuildConfig(config) {
  return config?.targetEnvironment === "production"
    && config?.name === "tokyo-pace"
    && config?.vars?.APP_ENV === "production"
    && typeof config?.main === "string"
    && typeof config?.assets?.directory === "string"
    && config?.version_metadata?.binding === "CF_VERSION_METADATA"
    && config?.ratelimits?.some(({ name, simple }) =>
      name === "ROUTE_RATE_LIMITER" && simple?.limit === 10 && simple?.period === 60);
}

export async function resolveProductionBuildConfig(baseDir = rootDir) {
  const distDir = path.join(baseDir, "dist");
  const entries = await readdir(distDir, { withFileTypes: true });
  const matches = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const absoluteConfig = path.join(distDir, entry.name, "wrangler.json");
    try {
      const config = JSON.parse(await readFile(absoluteConfig, "utf8"));
      if (!isProductionBuildConfig(config)) continue;
      const workerDirectory = path.dirname(absoluteConfig);
      const main = path.resolve(workerDirectory, config.main);
      const assets = path.resolve(workerDirectory, config.assets?.directory ?? "");
      if (!await exists(main, "file") || !await exists(assets, "directory")) continue;
      matches.push(path.relative(baseDir, absoluteConfig).replaceAll("\\", "/"));
    } catch {
      // Build output directories without a complete redirect config are ignored.
    }
  }
  if (matches.length !== 1) {
    throw new Error(`production build configを一意に選択できませんでした（${matches.length}件）。`);
  }
  await access(path.join(baseDir, matches[0]));
  return matches[0];
}

export async function runReleasePreview({
  runner = defaultRunner,
  readSources = readReleaseCandidateSources,
  resolveBuiltConfig = resolveProductionBuildConfig,
  output = console.log,
} = {}) {
  output("[release:preview] production gate");
  ensureSuccessful(runner(RELEASE_PREVIEW_COMMANDS.verify), "verify:production");

  output("[release:preview] production build");
  ensureSuccessful(runner({
    ...RELEASE_PREVIEW_COMMANDS.build,
    env: { ...process.env, CLOUDFLARE_ENV: "production" },
  }), "production build");
  const productionBuildConfig = await resolveBuiltConfig();
  output(`[release:preview] production build config: ${productionBuildConfig}`);

  const sources = await readSources();
  const localCandidate = evaluateReleaseCandidate({
    ...sources,
    remoteSecretNames: [REQUIRED_SECRET_NAME],
    strict: true,
  });
  for (const line of formatReleaseCandidateResult(localCandidate)) output(line);
  if (localCandidate.blocking.length > 0) {
    const error = new Error(`release preview blocked: ${localCandidate.blocking.map(({ id }) => id).join(", ")}`);
    error.blockers = localCandidate.blocking;
    throw error;
  }

  output("[release:preview] required Secret名の確認");
  const secretResult = ensureSuccessful(runner({
    ...RELEASE_PREVIEW_COMMANDS.secretList,
    capture: true,
  }), "production Secret check");
  const remoteSecretNames = parseSecretNames(secretResult.stdout ?? "");

  const candidate = evaluateReleaseCandidate({
    ...sources,
    remoteSecretNames,
    strict: true,
  });
  for (const line of formatReleaseCandidateResult(candidate)) output(line);
  if (candidate.blocking.length > 0) {
    const error = new Error(`release preview blocked: ${candidate.blocking.map(({ id }) => id).join(", ")}`);
    error.blockers = candidate.blocking;
    throw error;
  }
  output(`[release:preview] ${REQUIRED_SECRET_NAME}: 設定名を確認（値は取得・表示していません）`);

  output(`[release:preview] ${PREVIEW_ALIAS} version upload（production trafficは変更しません）`);
  const uploadCommand = createVersionUploadCommand(productionBuildConfig);
  const uploadResult = ensureSuccessful(runner({
    ...uploadCommand,
    capture: true,
  }), "wrangler versions upload");
  const uploadOutput = `${uploadResult.stdout ?? ""}\n${uploadResult.stderr ?? ""}`;
  const uploaded = parseVersionUploadOutput(uploadOutput);
  output(`Version ID: ${uploaded.versionId}`);
  output(`Preview URL: ${uploaded.previewUrl}`);
  output("Production traffic: 変更なし");
  return uploaded;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await runReleasePreview();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}
