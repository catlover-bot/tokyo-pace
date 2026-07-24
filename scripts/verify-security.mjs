import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectScannableTextFiles, scanSecurityRisks } from "./production-validation.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = await collectScannableTextFiles(rootDir);
const findings = scanSecurityRisks(files);

if (findings.length) {
  console.error("セキュリティ静的検査に失敗しました。");
  for (const finding of findings) console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
  process.exitCode = 1;
} else {
  console.log(`セキュリティ静的検査成功: ${files.length}ファイル（Secret値は出力しません）`);
}
