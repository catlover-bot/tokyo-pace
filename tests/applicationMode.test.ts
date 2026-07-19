import { describe, expect, it } from "vitest";
import { parseApplicationMode } from "../src/domain/applicationMode";

describe("公開画面のmode判定", () => {
  it("field-checkだけを現地確認画面として扱う", () => {
    expect(parseApplicationMode("?mode=field-check")).toBe("field-check");
    expect(parseApplicationMode("mode=field-check")).toBe("field-check");
    expect(parseApplicationMode("?source=demo&mode=field-check")).toBe("field-check");
  });

  it("未指定・未知値・部分一致は通常画面へ戻す", () => {
    expect(parseApplicationMode("")).toBe("route-planning");
    expect(parseApplicationMode("?mode=unknown")).toBe("route-planning");
    expect(parseApplicationMode("?mode=field-check-extra")).toBe("route-planning");
  });
});

