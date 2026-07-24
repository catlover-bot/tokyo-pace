import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectScannableTextFiles, validateAccessibilitySources } from "./production-validation.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = await collectScannableTextFiles(rootDir, { includeBuild: false });
const componentSource = files
  .filter(({ relative }) => relative.startsWith("src/") && relative.endsWith(".tsx"))
  .map(({ content }) => content)
  .join("\n");
const [indexHtml, styles] = await Promise.all([
  readFile(path.join(rootDir, "index.html"), "utf8"),
  readFile(path.join(rootDir, "src/styles.css"), "utf8"),
]);
const failures = validateAccessibilitySources({ indexHtml, componentSource, styles });

if (failures.length) {
  console.error(`アクセシビリティ静的検査に失敗: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("アクセシビリティ静的検査成功: lang / skip link / landmarks / labels / announcements / focus / target size / reflow / reduced motion");
}
