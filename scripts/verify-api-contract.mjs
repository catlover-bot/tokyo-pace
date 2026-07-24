import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateApiContractSource } from "./production-validation.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerSource = await readFile(path.join(rootDir, "worker/index.ts"), "utf8");
const result = validateApiContractSource(workerSource);
const failures = [
  ...result.missingPaths.map((value) => `missing-path:${value}`),
  ...result.missingFields.map((value) => `missing-field:${value}`),
  ...result.forbidden,
];

if (failures.length) {
  console.error(`API契約静的検査に失敗: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("API契約静的検査成功: routes / health / status / version と公開メタデータを確認");
}
