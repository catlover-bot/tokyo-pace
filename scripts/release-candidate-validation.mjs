import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_SECRET_NAME = "OPENROUTESERVICE_API_KEY";
export const PREVIEW_ALIAS = "production-v1-rc";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseJsonc(source) {
  let result = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        result += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      } else if (character === "\n") {
        result += character;
      }
      continue;
    }
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
    } else if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
    } else if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else {
      result += character;
    }
  }

  return JSON.parse(result.replace(/,\s*([}\]])/gu, "$1"));
}

const blocker = (id, category, message) => ({ id, category, message });

function hasRequiredSecret(environment) {
  return environment?.secrets?.required?.includes(REQUIRED_SECRET_NAME) === true;
}

function hasRateLimitBinding(environment) {
  return environment?.ratelimits?.some((binding) =>
    binding?.name === "ROUTE_RATE_LIMITER"
    && /^\d+$/u.test(String(binding.namespace_id ?? ""))
    && Number(binding.namespace_id) > 0
    && binding.simple?.limit === 10
    && binding.simple?.period === 60) === true;
}

function hasVersionMetadataBinding(environment) {
  return environment?.version_metadata?.binding === "CF_VERSION_METADATA";
}

function hasStatusScopeContract(workerSource) {
  const requiredObjects = ["circuit", "cache", "rateLimiter"];
  const scopedObjects = requiredObjects.every((name) => new RegExp(
    String.raw`${name}\s*:\s*\{[\s\S]{0,700}?scope\s*:[\s\S]{0,300}?authoritative\s*:\s*false`,
    "u",
  ).test(workerSource));
  return scopedObjects
    && /statusScope\s*:\s*["']observed_worker_and_bound_resources["']/u.test(workerSource)
    && /authoritative\s*:\s*false/u.test(workerSource);
}

function hasRevisionDate(policySource) {
  const match = policySource.match(/revisionDate\s*=\s*["']([^"']+)["']/u);
  if (!match) return false;
  return /^20\d{2}年(?:1[0-2]|[1-9])月(?:3[01]|[12]\d|[1-9])日$/u.test(match[1]);
}

export function hasContactPlaceholder(policySource) {
  return /問い合わせ先[^\n<]*(?:設定予定|未確定|placeholder|PLACEHOLDER|［)/u.test(policySource);
}

export function evaluateReleaseCandidate({
  wranglerConfig,
  policySource,
  workerSource,
  remoteSecretNames,
  strict = false,
}) {
  const production = wranglerConfig?.env?.production;
  const blockers = [];

  if (!hasRateLimitBinding(production)) {
    blockers.push(blocker(
      "production_rate_limit_binding",
      "machine",
      "productionのROUTE_RATE_LIMITERを10検索／60秒で宣言してください。",
    ));
  }
  if (!hasVersionMetadataBinding(production)) {
    blockers.push(blocker(
      "production_version_metadata_binding",
      "machine",
      "productionのCF_VERSION_METADATA bindingが未定義です。",
    ));
  }
  if (
    !hasRequiredSecret(wranglerConfig)
    || !hasRequiredSecret(wranglerConfig?.env?.preview)
    || !hasRequiredSecret(production)
  ) {
    blockers.push(blocker(
      "required_secret_declaration",
      "machine",
      `${REQUIRED_SECRET_NAME}をlocal／preview／productionのrequired Secretとして宣言してください。`,
    ));
  }
  const productionLogLevel = production?.vars?.LOG_LEVEL;
  if (productionLogLevel === undefined || productionLogLevel === "") {
    blockers.push(blocker(
      "production_log_level_missing",
      "machine",
      "production LOG_LEVELを明示してください。",
    ));
  } else if (String(productionLogLevel).toLowerCase() === "debug") {
    blockers.push(blocker(
      "production_debug_log",
      "machine",
      "productionでdebug logを有効にできません。",
    ));
  }
  if (!hasRevisionDate(policySource)) {
    blockers.push(blocker(
      "policy_revision_date",
      "machine",
      "privacy等の公開方針に確定した改定日がありません。",
    ));
  }
  if (!hasStatusScopeContract(workerSource)) {
    blockers.push(blocker(
      "status_scope_contract",
      "machine",
      "statusがcache、circuit、rate limiterのscopeと非権威性を明示していません。",
    ));
  }

  if (hasContactPlaceholder(policySource)) {
    blockers.push(blocker(
      "public_contact_placeholder",
      "human",
      "公開問い合わせ先placeholderが残っています。",
    ));
  }
  if (strict && !remoteSecretNames?.includes(REQUIRED_SECRET_NAME)) {
    blockers.push(blocker(
      "production_secret_missing",
      "external",
      `Cloudflare productionに${REQUIRED_SECRET_NAME}が設定されていません。`,
    ));
  }

  const blockingCategories = strict ? new Set(["machine", "human", "external"]) : new Set(["machine"]);
  return {
    blockers,
    blocking: blockers.filter(({ category }) => blockingCategories.has(category)),
    strict,
  };
}

export async function readReleaseCandidateSources(baseDir = rootDir) {
  const [wranglerSource, policySource, workerSource] = await Promise.all([
    readFile(path.join(baseDir, "wrangler.jsonc"), "utf8"),
    readFile(path.join(baseDir, "src/components/PublicPolicyPage.tsx"), "utf8"),
    readFile(path.join(baseDir, "worker/index.ts"), "utf8"),
  ]);
  return {
    wranglerConfig: parseJsonc(wranglerSource),
    policySource,
    workerSource,
  };
}

export function formatReleaseCandidateResult(result) {
  if (result.blockers.length === 0) return ["release blocker: なし"];
  return result.blockers.map(({ id, category, message }) =>
    `[${category}] ${id}: ${message}`);
}
