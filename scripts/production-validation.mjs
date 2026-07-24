import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const SOURCE_ROOTS = ["worker", "src", "scripts", "tests", ".github", "docs", "config"];
const BUILD_ROOTS = [
  "dist/client",
  "dist/tokyo_pace",
  "dist/tokyo_pace_local",
  "dist/tokyo_pace_preview",
];
const ROOT_FILES = [
  ".dev.vars.example",
  ".env.example",
  ".gitignore",
  "README.md",
  "index.html",
  "package.json",
  "playwright.config.ts",
  "vite.config.ts",
  "wrangler.jsonc",
];
const MAX_SCAN_FILE_BYTES = 2_000_000;

const forbiddenPath = (relative) => {
  const normalized = relative.replaceAll("\\", "/");
  const basename = path.posix.basename(normalized);
  return (
    normalized.includes("/node_modules/")
    || normalized.includes("/.git/")
    || normalized.includes("/data/generated/")
    || normalized.includes("/src/data/generated/")
    || basename === ".env"
    || basename.startsWith(".env.")
    || basename === ".dev.vars"
    || basename.startsWith(".dev.vars.")
    || basename.endsWith(".pem")
    || basename === "credentials.json"
    || basename.endsWith(".map")
  );
};

const safeStat = async (target) => {
  try {
    return await stat(target);
  } catch {
    return null;
  }
};

async function collectDirectory(rootDir, relativeDir, files) {
  const absoluteDir = path.join(rootDir, relativeDir);
  const info = await safeStat(absoluteDir);
  if (!info?.isDirectory()) return;
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(relativeDir.replaceAll("\\", "/"), entry.name);
    if (forbiddenPath(relative)) continue;
    if (entry.isDirectory()) {
      await collectDirectory(rootDir, relative, files);
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
    const fileInfo = await safeStat(path.join(rootDir, relative));
    if (!fileInfo || fileInfo.size > MAX_SCAN_FILE_BYTES) continue;
    files.push(relative);
  }
}

/**
 * Returns only repository source/configuration and optional build files.
 * Ignored Secret files are never opened, even when they exist locally.
 */
export async function collectScannableTextFiles(rootDir, { includeBuild = true } = {}) {
  const relatives = [];
  for (const relative of SOURCE_ROOTS) await collectDirectory(rootDir, relative, relatives);
  if (includeBuild) for (const relative of BUILD_ROOTS) await collectDirectory(rootDir, relative, relatives);
  for (const relative of ROOT_FILES) {
    if (forbiddenPath(relative)) continue;
    const info = await safeStat(path.join(rootDir, relative));
    if (info?.isFile() && info.size <= MAX_SCAN_FILE_BYTES) relatives.push(relative);
  }
  const unique = [...new Set(relatives)].sort();
  return Promise.all(unique.map(async (relative) => ({
    relative,
    content: await readFile(path.join(rootDir, relative), "utf8"),
  })));
}

const lineNumberAt = (content, index) => content.slice(0, index).split("\n").length;

const applicationFile = (relative) => (
  relative === "index.html"
  || relative.startsWith("worker/")
  || relative.startsWith("src/")
  || relative.startsWith("dist/client/")
  || relative.startsWith("dist/tokyo_pace")
);

const addRegexFindings = (findings, file, rule, regex, predicate = () => true) => {
  regex.lastIndex = 0;
  for (const match of file.content.matchAll(regex)) {
    if (!predicate(file.relative, match)) continue;
    findings.push({
      rule,
      file: file.relative,
      line: lineNumberAt(file.content, match.index ?? 0),
    });
  }
};

export function scanSecurityRisks(files) {
  const findings = [];
  for (const file of files.filter(({ relative }) => applicationFile(relative))) {
    const authoredApplicationFile = file.relative === "index.html"
      || file.relative.startsWith("worker/")
      || file.relative.startsWith("src/");
    if (authoredApplicationFile) {
      addRegexFindings(findings, file, "dynamic-eval", /\beval\s*\(/gu);
      addRegexFindings(findings, file, "dynamic-function-constructor", /\bnew\s+Function\s*\(/gu);
      addRegexFindings(findings, file, "unsafe-react-html", /dangerouslySetInnerHTML\s*=/gu);
      addRegexFindings(findings, file, "unsafe-dom-html", /\.innerHTML\s*=(?!=)/gu);
    }
    addRegexFindings(
      findings,
      file,
      "client-direct-openrouteservice",
      /https?:\/\/[^"'\s]*openrouteservice\.(?:org|com)/giu,
      (relative) => relative.startsWith("src/") || relative.startsWith("dist/client/"),
    );
    addRegexFindings(
      findings,
      file,
      "client-secret-binding-name",
      /OPENROUTESERVICE_API_KEY/gu,
      (relative) => relative.startsWith("src/") || relative.startsWith("dist/client/"),
    );
    if (authoredApplicationFile) addRegexFindings(
        findings,
        file,
        "sensitive-console-argument",
        /console\.(?:debug|error|info|log|warn)\s*\([^;\n]*(?:authorization|cookie|latitude|longitude|coordinates|request\.body|api[_-]?key)/giu,
      );
    addRegexFindings(
      findings,
      file,
      "unbound-browser-fetch",
      /(?:new\s+ApiRouteProvider\s*\(|=\s*)(?:globalThis|window)\.fetch(?:\s*[,;)])/gu,
      (relative) => relative.startsWith("src/"),
    );
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
}

const SECRET_PATTERNS = [
  ["private-key", /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/gu],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/gu],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/gu],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{30,}\b/gu],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gu],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~-]{24,}\b/giu],
];

const PLACEHOLDER_VALUE = /^(?:<.*>|change-me|dummy|example|fake(?:-.*)?|mock|placeholder|process\.env(?:\..*)?|replace.*|secret(?:-value)?|test(?:-.*)?|\$\{.*\})$/iu;
const NAMED_SECRET_ASSIGNMENT = /\b(OPENROUTESERVICE_API_KEY|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|GITHUB_TOKEN)\b\s*(?:=|:\s*)\s*["']?([^"',\s}\]]+)/giu;

export function scanSecretLeaks(files) {
  const findings = [];
  for (const file of files) {
    for (const [rule, regex] of SECRET_PATTERNS) addRegexFindings(findings, file, rule, regex);
    NAMED_SECRET_ASSIGNMENT.lastIndex = 0;
    for (const match of file.content.matchAll(NAMED_SECRET_ASSIGNMENT)) {
      const value = match[2]?.trim() ?? "";
      if (!value || PLACEHOLDER_VALUE.test(value) || value === "string") continue;
      findings.push({
        rule: "literal-secret-assignment",
        file: file.relative,
        line: lineNumberAt(file.content, match.index ?? 0),
      });
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
}

export function validateAccessibilitySources({ indexHtml, componentSource, styles }) {
  const checks = [
    ["document-language", /<html[^>]*\blang=["']ja["']/iu.test(indexHtml)],
    ["responsive-viewport", /name=["']viewport["'][^>]*width=device-width/iu.test(indexHtml)],
    ["skip-link", /href=["']#main-content["']/u.test(componentSource)],
    ["main-landmark-target", /<main[^>]*\bid=["']main-content["']/u.test(componentSource)],
    ["single-page-heading", /<h1(?:\s|>)/u.test(componentSource)],
    ["form-label", /<label(?:\s|>)/u.test(componentSource)],
    ["status-announcement", /(?:aria-live|role=["'](?:alert|status)["'])/u.test(componentSource)],
    ["no-positive-tabindex", !/tabIndex=\{?[1-9]\d*\}?/u.test(componentSource)],
    ["visible-keyboard-focus", /:focus-visible/u.test(styles)],
    ["minimum-button-target", /button\s*\{[^}]*min-height:\s*44px/su.test(styles)],
    ["reduced-motion", /@media\s*\(prefers-reduced-motion:\s*reduce\)/u.test(styles)],
    ["small-screen-reflow", /@media\s*\(max-width:\s*(?:720|480|390|360|320)px\)/u.test(styles)],
    ["no-focus-outline-removal", !/(?:outline:\s*(?:0|none))|(?:outline-width:\s*0)/u.test(styles)],
  ];
  return checks.filter(([, passed]) => !passed).map(([id]) => id);
}

export function evaluateBundleBudget(entries, budget) {
  const clientEntries = entries.filter(({ relative }) => relative.startsWith("dist/client/"));
  const jsEntries = clientEntries.filter(({ relative }) => relative.endsWith(".js"));
  const cssEntries = clientEntries.filter(({ relative }) => relative.endsWith(".css"));
  const workerEntries = entries.filter(({ relative }) =>
    /^dist\/tokyo_pace(?:_(?:local|preview))?\/.*\.js$/u.test(relative));
  const measurements = {
    clientJavaScriptBytes: jsEntries.reduce((sum, entry) => sum + entry.bytes, 0),
    clientCssBytes: cssEntries.reduce((sum, entry) => sum + entry.bytes, 0),
    largestJavaScriptChunkBytes: jsEntries.reduce((maximum, entry) => Math.max(maximum, entry.bytes), 0),
    workerBytes: workerEntries.reduce((sum, entry) => sum + entry.bytes, 0),
    totalClientAssetBytes: clientEntries.reduce((sum, entry) => sum + entry.bytes, 0),
  };
  const violations = Object.entries(measurements)
    .filter(([key, value]) => Number.isFinite(budget[key]) && value > budget[key])
    .map(([key, actual]) => ({ key, actual, budget: budget[key] }));
  return { measurements, violations };
}

export function validateApiContractSource(workerSource) {
  const requiredPaths = ["/api/health", "/api/status", "/api/version", "/api/routes"];
  const missingPaths = requiredPaths.filter((pathName) => !workerSource.includes(pathName));
  const requiredPublicFields = [
    "requestId",
    "appVersion",
    "environment",
    "dataManifestVersion",
  ];
  const missingFields = requiredPublicFields.filter((field) => !workerSource.includes(field));
  const forbiddenResponsePatterns = [
    ["stack-response", /\.stack\b/u],
    ["secret-response", /OPENROUTESERVICE_API_KEY\s*[,}]/u],
  ];
  const forbidden = forbiddenResponsePatterns
    .filter(([, regex]) => regex.test(workerSource))
    .map(([id]) => id);
  return { missingPaths, missingFields, forbidden };
}
