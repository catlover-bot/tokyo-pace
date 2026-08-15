import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanRoots = ["README.md", "docs", "src", "worker", "tests"];
const textExtensions = new Set([".md", ".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".html"]);

export function findRepeatedQuestionMarkCorruption(text) {
  return text.split(/\r?\n/u).flatMap((line, index) => {
    const match = /\?{4,}/u.exec(line);
    return match ? [{ line: index + 1, column: match.index + 1, value: match[0] }] : [];
  });
}

async function collectTextFiles(target) {
  const absolute = path.join(repositoryRoot, target);
  if (path.extname(target)) return [absolute];
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) return collectTextFiles(child);
    return textExtensions.has(path.extname(entry.name)) ? [path.join(repositoryRoot, child)] : [];
  }));
  return nested.flat();
}

export async function scanRepositoryForTextCorruption() {
  const files = (await Promise.all(scanRoots.map(collectTextFiles))).flat().sort();
  const findings = [];
  for (const file of files) {
    const matches = findRepeatedQuestionMarkCorruption(await readFile(file, "utf8"));
    for (const match of matches) findings.push({ file: path.relative(repositoryRoot, file), ...match });
  }
  return findings;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const findings = await scanRepositoryForTextCorruption();
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.file}:${finding.line}:${finding.column}: repeated question-mark corruption (${finding.value.length})`);
    process.exitCode = 1;
  } else {
    console.log("文字エンコーディング検査成功: 4文字以上連続する疑問符の破損なし");
  }
}
