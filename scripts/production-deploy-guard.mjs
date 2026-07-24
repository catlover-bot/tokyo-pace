import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIRECT_DEPLOY_BLOCKED_MESSAGE =
  "直接deployは無効です。release:previewでVersionを作成・smoke確認し、人間の承認後にVersion IDを指定してtrafficを変更してください。";

export function refuseDirectProductionDeploy() {
  const error = new Error(DIRECT_DEPLOY_BLOCKED_MESSAGE);
  error.code = "DIRECT_DEPLOY_DISABLED";
  throw error;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    refuseDirectProductionDeploy();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
