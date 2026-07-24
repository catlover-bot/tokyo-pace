import { describe, expect, it, vi } from "vitest";
import {
  abbreviateFieldSurveyIdentifier,
  copyFieldSurveyValue,
} from "../src/domain/fieldSurveyClipboard";

describe("現地調査カードのコピー操作", () => {
  it("verificationId・candidateId・住所の完全な値をClipboard APIへ渡す", async () => {
    const writeText = vi.fn(async () => undefined);
    const fullValue = "daredemo-accommodation-very-long-candidate-id-1234567890";

    await expect(copyFieldSurveyValue(fullValue, { writeText })).resolves.toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(fullValue);
  });

  it("Clipboard APIが使えない場合を例外にせず代替表示へ渡せる", async () => {
    await expect(copyFieldSurveyValue("fv-candidate", undefined)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("Clipboard APIの失敗を内部エラー文なしの結果へ変換する", async () => {
    const clipboard = {
      writeText: vi.fn(async () => {
        throw new DOMException("NotAllowedError");
      }),
    };

    await expect(copyFieldSurveyValue("東京都新宿区", clipboard)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("画面表示だけを省略しコピー元の完全な値は変更しない", () => {
    const fullValue = "daredemo-accommodation-very-long-candidate-id-1234567890";
    const abbreviated = abbreviateFieldSurveyIdentifier(fullValue, 28);
    expect(abbreviated).toContain("…");
    expect(abbreviated.length).toBeLessThan(fullValue.length);
    expect(fullValue).toBe("daredemo-accommodation-very-long-candidate-id-1234567890");
    expect(abbreviateFieldSurveyIdentifier("short-id")).toBe("short-id");
  });
});
