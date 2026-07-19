import { describe, expect, it } from "vitest";
import { classifyRestContinuity } from "../src/domain/restContinuityPresentation";
import type { WalkingSegment } from "../src/types";

type RestContinuityInput = Parameters<typeof classifyRestContinuity>[0];

const fullSegment = (distanceMeters: number, walkingMinutes: number): WalkingSegment => ({
  id: "full",
  name: "経路全体",
  distanceMeters,
  walkingMinutes,
  endsAtRestSpot: false,
  restSpotId: null,
});

const splitSegments = (
  firstMinutes: number,
  secondMinutes: number,
  restSpotId = "strict-rest",
): WalkingSegment[] => [
  {
    id: "first",
    name: "前半",
    distanceMeters: 500,
    walkingMinutes: firstMinutes,
    endsAtRestSpot: true,
    restSpotId,
  },
  {
    id: "second",
    name: "後半",
    distanceMeters: 500,
    walkingMinutes: secondMinutes,
    endsAtRestSpot: false,
    restSpotId: null,
  },
];

const makeInput = (overrides: Partial<RestContinuityInput> = {}): RestContinuityInput => ({
  walkingSegments: [fullSegment(1_000, 12)],
  confirmedRestSpotCount: 0,
  supportedRestSpotCount: 0,
  durationMinutes: 12,
  durationSeconds: 720,
  continuousWalkingLimitMinutes: 10,
  maxContinuousWalkingMinutes: 12,
  distanceMeters: 1_000,
  longestRestGapMeters: 1_000,
  ...overrides,
});

describe("休憩状況の4分類", () => {
  it("厳格な途中休憩地点がなく経路全体が上限内の場合を分類する", () => {
    const result = classifyRestContinuity(makeInput({
      walkingSegments: [fullSegment(900, 9)],
      durationMinutes: 9,
      durationSeconds: 540,
      maxContinuousWalkingMinutes: 9,
      distanceMeters: 900,
      longestRestGapMeters: 900,
    }));

    expect(result).toMatchObject({
      classification: "WHOLE_ROUTE_WITHIN_LIMIT_WITHOUT_STRICT_REST",
      strictIntermediateRestPointCount: 0,
      continuityWithinLimit: true,
      statusLabel: "経路全体が設定内",
      metricLabel: "連続して歩く時間",
    });
    expect(result.description).toContain("途中の休憩を前提とせず");
  });

  it("厳格な途中休憩地点による分割で各区間が上限内の場合を分類する", () => {
    const result = classifyRestContinuity(makeInput({
      walkingSegments: splitSegments(8, 9),
      confirmedRestSpotCount: 1,
      durationMinutes: 17,
      durationSeconds: 1_020,
      maxContinuousWalkingMinutes: 9,
      longestRestGapMeters: 500,
    }));

    expect(result).toMatchObject({
      classification: "STRICT_REST_POINTS_MAKE_ROUTE_FEASIBLE",
      strictIntermediateRestPointCount: 1,
      continuityWithinLimit: true,
      statusLabel: "すべて設定内",
      metricLabel: "確認できた休憩地点を含む歩行区間",
      displayLongestRestGapMeters: 500,
      longestRestGapExplanation: null,
    });
    expect(result.description).toContain("厳格に確認できた休憩地点1地点で区切ると");
  });

  it("厳格な途中休憩地点がなく経路全体が上限を超える場合を分類する", () => {
    const result = classifyRestContinuity(makeInput({
      walkingSegments: [fullSegment(1_000, 13.2)],
      durationMinutes: 13.2,
      durationSeconds: 792,
      maxContinuousWalkingMinutes: 13.2,
    }));

    expect(result).toMatchObject({
      classification: "NO_STRICT_REST_AND_OVER_LIMIT",
      strictIntermediateRestPointCount: 0,
      continuityWithinLimit: false,
      statusLabel: "設定超過区間あり",
      metricLabel: "連続して歩く時間",
    });
    expect(result.description).toContain("設定10分を3.2分超えます");
  });

  it("厳格な途中休憩地点を含めても最長区間が上限を超える場合を分類する", () => {
    const result = classifyRestContinuity(makeInput({
      walkingSegments: splitSegments(13.2, 5),
      supportedRestSpotCount: 1,
      durationMinutes: 18.2,
      durationSeconds: 1_092,
      maxContinuousWalkingMinutes: 13.2,
      longestRestGapMeters: 700,
    }));

    expect(result).toMatchObject({
      classification: "STRICT_REST_POINTS_PRESENT_BUT_STILL_OVER_LIMIT",
      strictIntermediateRestPointCount: 1,
      continuityWithinLimit: false,
      statusLabel: "設定超過区間あり",
      metricLabel: "連続して歩く時間",
      displayLongestRestGapMeters: 700,
    });
    expect(result.description).toContain("厳格に確認できた休憩地点を含めても");
    expect(result.description).toContain("設定10分を3.2分超えます");
  });
});

describe("厳格な休憩根拠の扱い", () => {
  it.each([
    ["possible", "possible-rest"],
    ["estimated", "estimated-rest"],
  ])("%s候補だけでは厳格な休憩地点による成立と説明しない", (_confidence, restSpotId) => {
    const result = classifyRestContinuity(makeInput({
      walkingSegments: splitSegments(6, 6, restSpotId),
      confirmedRestSpotCount: 0,
      supportedRestSpotCount: 0,
      durationMinutes: 13.2,
      durationSeconds: 792,
      maxContinuousWalkingMinutes: 6,
      longestRestGapMeters: 500,
    }));

    expect(result.classification).toBe("NO_STRICT_REST_AND_OVER_LIMIT");
    expect(result.strictIntermediateRestPointCount).toBe(0);
    expect(result.continuousWalkingMinutes).toBe(13.2);
    expect(result.description).not.toContain("休憩地点を含めても");
    expect(result.description).not.toContain("休憩地点1地点で区切ると");
    expect(result.displayLongestRestGapMeters).toBe(1_000);
  });

  it("末尾にある休憩地点を途中の分割地点として数えない", () => {
    const result = classifyRestContinuity(makeInput({
      walkingSegments: [{
        ...fullSegment(1_000, 12),
        endsAtRestSpot: true,
        restSpotId: "destination-rest",
      }],
      confirmedRestSpotCount: 1,
    }));

    expect(result.classification).toBe("NO_STRICT_REST_AND_OVER_LIMIT");
    expect(result.strictIntermediateRestPointCount).toBe(0);
  });

  it("終了地点へ射影された候補の後ろが0mなら途中地点として数えない", () => {
    const result = classifyRestContinuity(makeInput({
      walkingSegments: [
        { ...fullSegment(1_000, 12), endsAtRestSpot: true, restSpotId: "destination-rest" },
        { ...fullSegment(0, 0), id: "after-destination" },
      ],
      confirmedRestSpotCount: 1,
    }));

    expect(result.classification).toBe("NO_STRICT_REST_AND_OVER_LIMIT");
    expect(result.strictIntermediateRestPointCount).toBe(0);
  });
});

describe("標準819m・9.8分の表示", () => {
  it("途中休憩を前提とせず設定内と説明し、経路全体を休憩空白にする", () => {
    const result = classifyRestContinuity(makeInput({
      walkingSegments: [fullSegment(819, 9.8)],
      durationMinutes: 10,
      durationSeconds: 588,
      maxContinuousWalkingMinutes: 9.8,
      distanceMeters: 819,
      longestRestGapMeters: 410,
    }));

    expect(result.classification).toBe("WHOLE_ROUTE_WITHIN_LIMIT_WITHOUT_STRICT_REST");
    expect(result.continuousWalkingMinutes).toBe(9.8);
    expect(result.description).toContain("途中の休憩を前提とせず");
    expect(result.description).toContain("経路全体の推定9.8分が設定10分以内");
    expect(result.displayLongestRestGapMeters).toBe(819);
    expect(result.longestRestGapExplanation).toBe(
      "途中で厳格に確認できた休憩地点がないため、経路全体を空白区間として計算しています。",
    );
  });
});

describe("休憩表示計算の決定性", () => {
  it("同じ入力から同じ結果を返し、歩行区間を変更しない", () => {
    const input = makeInput({
      walkingSegments: splitSegments(8, 9),
      confirmedRestSpotCount: 1,
      durationMinutes: 17,
      durationSeconds: 1_020,
      maxContinuousWalkingMinutes: 9,
      longestRestGapMeters: 500,
    });
    const before = structuredClone(input);
    const first = classifyRestContinuity(input);

    expect(classifyRestContinuity(input)).toEqual(first);
    expect(input).toEqual(before);
  });
});
