import { verifyDeterminism } from "./update-open-data.mjs";

verifyDeterminism().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
