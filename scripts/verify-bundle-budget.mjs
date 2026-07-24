import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBundleBudget } from "./production-validation.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(rootDir, "config/production-limits.json"), "utf8"));
const entries = [];

async function collect(relativeDir) {
  const absolute = path.join(rootDir, relativeDir);
  for (const entry of (await readdir(absolute, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) await collect(relative);
    else if (entry.isFile()) entries.push({ relative, bytes: (await stat(path.join(rootDir, relative))).size });
  }
}

try {
  await collect("dist/client");
  await collect("dist/tokyo_pace_local");
} catch {
  console.error("bundle budget検査には先に npm run build が必要です。");
  process.exit(1);
}

const result = evaluateBundleBudget(entries, config.bundleBudget);
for (const [key, bytes] of Object.entries(result.measurements)) {
  console.log(`${key}: ${bytes} / ${config.bundleBudget[key]} bytes`);
}
if (result.violations.length) {
  console.error(`bundle budget超過: ${result.violations.map(({ key }) => key).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("bundle budget検査成功");
}
