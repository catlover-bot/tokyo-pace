import { describe, expect, it } from "vitest";
import {
  buildFieldVerificationTemplate,
  createVerificationId,
  FIELD_VERIFICATION_COLUMNS,
  FIELD_VERIFICATION_TEMPLATE_FILENAME,
  type FieldVerificationTemplateCandidate,
} from "../src/domain/fieldVerificationTemplate";

const candidates: FieldVerificationTemplateCandidate[] = [
  { candidateId: "candidate-b", fieldCheckPriority: 1, name: "候補B", latitude: 35.69, longitude: 139.69, address: "東京都新宿区B" },
  { candidateId: "candidate-a", fieldCheckPriority: 2, verificationId: "verification-a", name: "候補A, 西口", latitude: 35.691, longitude: 139.691, address: "東京都\n新宿区A" },
];

describe("現地確認CSVテンプレート", () => {
  it("指定された全列を固定順で出力する", () => {
    const [header] = buildFieldVerificationTemplate(candidates).split("\r\n");
    expect(header).toBe(FIELD_VERIFICATION_COLUMNS.join(","));
    expect(FIELD_VERIFICATION_TEMPLATE_FILENAME).toBe("tokyo-pace-field-verification-template.csv");
  });

  it("現地確認優先度順に並べ、同一入力をバイト単位で固定する", () => {
    const first = buildFieldVerificationTemplate(candidates);
    const second = buildFieldVerificationTemplate([...candidates].reverse());
    expect(first).toBe(second);
    expect(first.indexOf("fv-candidate-b,candidate-b")).toBeLessThan(first.indexOf("verification-a,candidate-a"));
    expect(new TextEncoder().encode(first)).toEqual(new TextEncoder().encode(second));
  });

  it("優先度がない候補はcandidateIdで決定的に並べる", () => {
    const withoutPriority = candidates.map((candidate) => ({ ...candidate, fieldCheckPriority: undefined }));
    const csv = buildFieldVerificationTemplate(withoutPriority);
    expect(csv.indexOf("verification-a,candidate-a")).toBeLessThan(csv.indexOf("fv-candidate-b,candidate-b"));
  });

  it("三値属性と未確認情報を空欄にしfalseを補わない", () => {
    const row = buildFieldVerificationTemplate([candidates[0]]).trimEnd().split("\r\n")[1].split(",");
    const publicAccessIndex = FIELD_VERIFICATION_COLUMNS.indexOf("publiclyAccessible");
    const seatingIndex = FIELD_VERIFICATION_COLUMNS.indexOf("seatingAvailable");
    expect(row[publicAccessIndex]).toBe("");
    expect(row[seatingIndex]).toBe("");
    expect(row).not.toContain("false");
  });

  it("改行・カンマをCSV quotingし、表計算式として解釈される値を保護する", () => {
    const csv = buildFieldVerificationTemplate([{ candidateId: "=formula", name: "=cmd", latitude: 1, longitude: 2, address: "A,\nB" }]);
    expect(csv).toContain("'=formula");
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('"A,\nB"');
  });

  it("候補IDから決定的なverificationIdを作る", () => {
    expect(createVerificationId("place-001")).toBe("fv-place-001");
  });
});
