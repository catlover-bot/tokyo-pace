import { describe, expect, it } from "vitest";
import { findRepeatedQuestionMarkCorruption, scanRepositoryForTextCorruption } from "../scripts/verify-text-encoding.mjs";

describe("Japanese text encoding regression", () => {
  it("does not treat normal TypeScript question-mark operators as corruption", () => {
    expect(findRepeatedQuestionMarkCorruption("value ?? fallback; item?.name; condition ? a : b")).toEqual([]);
  });

  it("detects repeated literal question marks", () => {
    expect(findRepeatedQuestionMarkCorruption("label: " + "?".repeat(4))).toEqual([
      { line: 1, column: 8, value: "?".repeat(4) },
    ]);
  });

  it("finds no repeated-question-mark corruption in repository text", async () => {
    expect(await scanRepositoryForTextCorruption()).toEqual([]);
  });
});
