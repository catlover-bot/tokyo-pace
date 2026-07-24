import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateReleaseCandidate,
  formatReleaseCandidateResult,
  readReleaseCandidateSources,
} from "./release-candidate-validation.mjs";

export async function verifyOfflineReleaseConfiguration() {
  const sources = await readReleaseCandidateSources();
  const result = evaluateReleaseCandidate({ ...sources, strict: false });
  for (const line of formatReleaseCandidateResult(result)) console.log(line);
  if (result.blocking.length > 0) {
    const error = new Error(`release configuration failed: ${result.blocking.map(({ id }) => id).join(", ")}`);
    error.blockers = result.blocking;
    throw error;
  }
  console.log("機械設定のrelease blocker検査成功。human/external項目はrelease:previewで厳格検査します。");
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await verifyOfflineReleaseConfiguration();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
