import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../scripts/update-open-data.mjs";
import {
  FIELD_VERIFICATION_HEADERS,
  buildVerifiedRestCandidates,
  deriveFieldVerificationConfidence,
  normalizeFieldVerificationRows,
  parseVerificationBoolean,
  selectEffectiveFieldVerifications,
} from "../src/domain/fieldVerification.mjs";

const source = (id) => ({ sourceDatasetId: "official-fixture", sourceRecordId: id, provider: "fixture", datasetName: "fixture", license: "CC BY", datasetUpdatedAt: null, fieldVerifiedAt: null });
const candidates = ["a", "b", "c"].map((id, index) => ({ id: `candidate-${id}`, name: id, latitude: 35.69 + index / 1000, longitude: 139.69 + index / 1000, address: null, category: "public_facility", confidence: "possible", openingHours: null, indoor: null, seating: null, drinkingWaterAvailable: null, wheelchairAccessible: null, source: source(id) }));

async function fixtureRows() {
  const text = await readFile(new URL("./fixtures/field-verification.csv", import.meta.url), "utf8");
  const parsed = parseCsv(text);
  expect(parsed.headers).toEqual(FIELD_VERIFICATION_HEADERS);
  return parsed.records;
}

describe("現地確認CSV", () => {
  it("正常行を解析しtrue / false / nullを保持する", async () => {
    const result = normalizeFieldVerificationRows(await fixtureRows(), candidates);
    expect(result).toMatchObject({ inputCount: 3, normalizedCount: 3, excludedCount: 0 });
    expect(result.records[0]).toMatchObject({ publiclyAccessible: true, seatingAvailable: true, indoorOrCovered: false, drinkingWaterAvailable: null });
    expect(result.records.map((record) => record.confidence)).toEqual(["confirmed", "supported", "possible"]);
  });

  it("三値以外を拒否し空欄をfalseにしない", () => {
    expect(parseVerificationBoolean("true")).toEqual({ value: true });
    expect(parseVerificationBoolean("false")).toEqual({ value: false });
    expect(parseVerificationBoolean("null")).toEqual({ value: null });
    expect(parseVerificationBoolean("")).toEqual({ value: null });
    expect(parseVerificationBoolean("yes")).toEqual({ error: "invalid_tristate_boolean" });
  });

  it("不正日時を理由付きで除外する", async () => {
    const [row] = await fixtureRows();
    const result = normalizeFieldVerificationRows([{ ...row, verifiedAt: "2026/07/19" }], candidates);
    expect(result.records).toHaveLength(0);
    expect(result.exclusions[0].reasons).toContain("invalid_verified_at");
  });

  it("実在しない暦日を拒否する", async () => {
    const [row] = await fixtureRows();
    const result = normalizeFieldVerificationRows([{ ...row, verifiedAt: "2026-02-31T10:00:00+09:00" }], candidates);
    expect(result.exclusions[0].reasons).toContain("invalid_verified_at");
  });

  it("重複verificationIdの全行を拒否する", async () => {
    const [row] = await fixtureRows();
    const result = normalizeFieldVerificationRows([row, { ...row, candidateId: "candidate-b" }], candidates);
    expect(result.records).toHaveLength(0);
    expect(result.exclusions).toHaveLength(2);
    expect(result.exclusions.every((item) => item.reasons.includes("duplicate_verification_id"))).toBe(true);
  });

  it("confirmed昇格条件の一部が欠ければpossibleを維持する", () => {
    const base = { verifiedAt: "2026-07-19T01:00:00.000Z", verifier: "team", verificationMethod: "on_site_observation", publiclyAccessible: true, seatingAvailable: true, evidenceReference: null };
    expect(deriveFieldVerificationConfidence(base)).toBe("confirmed");
    expect(deriveFieldVerificationConfidence({ ...base, verifier: null })).toBe("possible");
    expect(deriveFieldVerificationConfidence({ ...base, seatingAvailable: null })).toBe("possible");
  });

  it("明示的な利用不可または座席なしをsupportedへ昇格しない", () => {
    const base = { verifiedAt: "2026-07-19T01:00:00.000Z", verifier: "team", verificationMethod: "combined_on_site_and_official", publiclyAccessible: true, seatingAvailable: null, evidenceReference: "https://example.com/evidence" };
    expect(deriveFieldVerificationConfidence(base)).toBe("supported");
    expect(deriveFieldVerificationConfidence({ ...base, publiclyAccessible: false, seatingAvailable: true })).toBe("possible");
    expect(deriveFieldVerificationConfidence({ ...base, seatingAvailable: false })).toBe("possible");
  });

  it("同一候補は最新確認1件だけを評価し履歴自体は保持できる", async () => {
    const [row] = await fixtureRows();
    const normalized = normalizeFieldVerificationRows([
      { ...row, verificationId: "older", verifiedAt: "2026-07-18T10:00:00+09:00" },
      { ...row, verificationId: "newer", verifiedAt: "2026-07-19T10:00:00+09:00", publiclyAccessible: "false" },
    ], candidates);
    expect(normalized.records).toHaveLength(2);
    expect(selectEffectiveFieldVerifications(normalized.records)).toHaveLength(1);
    const verified = buildVerifiedRestCandidates(normalized.records, candidates);
    expect(verified).toHaveLength(1);
    expect(verified[0]).toMatchObject({ id: "verified-candidate-a", confidence: "possible", publiclyAccessible: false, relatedCandidateIds: ["candidate-a"] });
  });

  it("同一施設グループの複数確認を1厳格地点にして全公式出典を保持する", async () => {
    const [row] = await fixtureRows();
    const records = normalizeFieldVerificationRows([
      { ...row, verificationId: "group-a", candidateId: "candidate-a" },
      { ...row, verificationId: "group-b", candidateId: "candidate-b", verifiedAt: "2026-07-20T10:00:00+09:00" },
    ], candidates).records;
    const verified = buildVerifiedRestCandidates(records, candidates, [{
      candidateId: "candidate-a",
      groupedCandidateIds: ["candidate-a", "candidate-b"],
      officialSourceIds: ["official-fixture:a", "official-fixture:b"],
    }]);
    expect(verified).toHaveLength(1);
    expect(verified[0]).toMatchObject({
      id: "verified-candidate-a",
      relatedCandidateIds: ["candidate-a", "candidate-b"],
      officialSourceIds: ["official-fixture:a", "official-fixture:b"],
      source: { sourceRecordId: "group-b" },
    });
  });
});
