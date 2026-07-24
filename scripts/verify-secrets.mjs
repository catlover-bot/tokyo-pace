import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectScannableTextFiles, scanSecretLeaks } from "./production-validation.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = await collectScannableTextFiles(rootDir);
const findings = scanSecretLeaks(files);

if (findings.length) {
  console.error("Secret検査に失敗しました。値は安全のため表示しません。");
  for (const finding of findings) console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
  process.exitCode = 1;
} else {
  console.log(`Secret検査成功: ${files.length}ファイル（.env / .dev.vars / 認証ファイルは読み取り対象外）`);
}
