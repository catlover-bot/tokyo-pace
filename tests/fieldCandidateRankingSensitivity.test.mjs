import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS,
  FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_METERS,
  analyzeFieldCandidateRankingSensitivity,
  deriveFieldCandidateDetourScenarios,
  deriveFieldVisitShortlist,
  fieldCandidateRankingSensitivityCsv,
  fieldVisitShortlistCsv,
  findParetoNonDominatedCandidateIds,
  generateFieldCandidateWeightScenarios,
} from "../src/domain/fieldCandidateRankingSensitivity.mjs";

const generated = JSON.parse(await readFile(
  new URL("../data/generated/field-verification-candidates.json", import.meta.url),
  "utf8",
));
const candidates = generated.candidates;
const byName = (name) => candidates.find((candidate) => candidate.name === name);

describe("field candidate ranking sensitivity", () => {
  it("derives optimistic, one-way lower-bound and round-trip proxy values", () => {
    expect(deriveFieldCandidateDetourScenarios({
      grossImprovementMeters: 300,
      distanceToRouteMeters: 80,
      currentLongestGapMeters: 1_000,
    })).toMatchObject({
      optimisticImprovementMeters: 300,
      lowerBoundAdjustedImprovementMeters: 220,
      conservativeProxyImprovementMeters: 140,
      optimisticImprovementRatio: 0.3,
      conservativeProxyImprovementRatio: 0.14,
      detourSensitivityClass: "robust",
    });
  });

  it("clamps every adjusted improvement at zero", () => {
    expect(deriveFieldCandidateDetourScenarios({
      grossImprovementMeters: 40,
      distanceToRouteMeters: 100,
      currentLongestGapMeters: 500,
    })).toMatchObject({
      optimisticImprovementMeters: 40,
      lowerBoundAdjustedImprovementMeters: 0,
      conservativeProxyImprovementMeters: 0,
      detourSensitivityClass: "ineffective",
    });
  });

  it("classifies robust, sensitive, marginal and ineffective cases", () => {
    const classify = (gross, distance, gap = 1_000) => deriveFieldCandidateDetourScenarios({
      grossImprovementMeters: gross,
      distanceToRouteMeters: distance,
      currentLongestGapMeters: gap,
    }).detourSensitivityClass;
    expect(classify(300, 50)).toBe("robust");
    expect(classify(300, 180)).toBe("sensitive");
    expect(classify(129, 96, 1_186)).toBe("marginal");
    expect(classify(20, 5)).toBe("ineffective");
  });

  it("treats the current 33–34m improvements as marginal", () => {
    for (const name of ["ヨドバシカメラ新宿西口本店", "ニュウマン新宿"]) {
      const result = deriveFieldCandidateDetourScenarios(byName(name));
      expect(result.lowerBoundAdjustedImprovementMeters).toBeGreaterThanOrEqual(
        FIELD_CANDIDATE_MEANINGFUL_IMPROVEMENT_METERS,
      );
      expect(result.lowerBoundAdjustedImprovementMeters).toBeLessThan(50);
      expect(result.detourSensitivityClass).toBe("marginal");
    }
  });

  it("generates baseline plus seven deterministic ±20% scenarios", () => {
    const scenarios = generateFieldCandidateWeightScenarios();
    expect(scenarios).toHaveLength(15);
    expect(scenarios[0]).toMatchObject({
      id: "baseline",
      weights: BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS,
    });
    expect(scenarios.filter((scenario) => scenario.multiplier === 0.8)).toHaveLength(7);
    expect(scenarios.filter((scenario) => scenario.multiplier === 1.2)).toHaveLength(7);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(15);
  });

  it("keeps baseline ranks identical to the existing deterministic priority", () => {
    const analysis = analyzeFieldCandidateRankingSensitivity(candidates);
    expect(analysis.candidates.map(({ candidateId, baselineRank }) => [candidateId, baselineRank]))
      .toEqual(candidates.map(({ candidateId, fieldCheckPriority }) => [candidateId, fieldCheckPriority]));
  });

  it("computes best, worst, mean and top-5 appearance rate over 15 settings", () => {
    const analysis = analyzeFieldCandidateRankingSensitivity(candidates);
    expect(analysis.candidates.find((candidate) => candidate.name === "新宿観光振興協会"))
      .toMatchObject({ baselineRank: 1, bestRank: 1, worstRank: 1, meanRank: 1, top5AppearanceRate: 1, rankStabilityClass: "stable_top5" });
    expect(analysis.candidates.find((candidate) => candidate.name === "京王プラザホテル"))
      .toMatchObject({ baselineRank: 6, bestRank: 5, worstRank: 6, meanRank: 5.73, top5AppearanceRate: 0.2667, rankStabilityClass: "variable" });
  });

  it("is independent of candidate input order", () => {
    const normal = analyzeFieldCandidateRankingSensitivity(candidates);
    const reversed = analyzeFieldCandidateRankingSensitivity([...candidates].reverse());
    expect(reversed).toEqual(normal);
    expect(fieldCandidateRankingSensitivityCsv(reversed))
      .toBe(fieldCandidateRankingSensitivityCsv(normal));
  });

  it("uses candidateId as the final deterministic tie-break", () => {
    const source = candidates[0];
    const tied = [
      { ...source, candidateId: "candidate-z", name: "Z" },
      { ...source, candidateId: "candidate-a", name: "A" },
    ];
    const analysis = analyzeFieldCandidateRankingSensitivity(tied);
    expect(analysis.candidates.map((candidate) => candidate.candidateId))
      .toEqual(["candidate-a", "candidate-z"]);
  });

  it("finds Pareto non-dominated candidates without a second hand-tuned total", () => {
    const analysis = analyzeFieldCandidateRankingSensitivity(candidates);
    expect(analysis.paretoCandidateIds).toEqual(findParetoNonDominatedCandidateIds(analysis.candidates));
    expect(analysis.candidates.filter((candidate) => candidate.isParetoNonDominated).map((candidate) => candidate.name).sort())
      .toEqual([
        "ハイアットリージェンシー東京",
        "ヒルトン東京",
        "京王プラザホテル",
        "新宿観光振興協会",
        "西鉄イン新宿",
        "ヨドバシカメラ新宿西口本店",
      ].sort());
  });

  it("audits the current five baseline leaders across detour and weight assumptions", () => {
    const analysis = analyzeFieldCandidateRankingSensitivity(candidates);
    const currentFive = analysis.candidates.slice(0, 5);
    expect(currentFive.map((candidate) => candidate.name)).toEqual([
      "新宿観光振興協会",
      "ヨドバシカメラ新宿西口本店",
      "西鉄イン新宿",
      "ニュウマン新宿",
      "ヒルトン東京",
    ]);
    expect(currentFive.map((candidate) => candidate.detourSensitivityClass))
      .toEqual(["sensitive", "marginal", "robust", "marginal", "robust"]);
    expect(currentFive.map((candidate) => candidate.top5AppearanceRate))
      .toEqual([1, 1, 1, 0.9333, 0.8]);
  });

  it("keeps hotel category-penalty sensitivity visible without changing baseline weights", () => {
    const analysis = analyzeFieldCandidateRankingSensitivity(candidates);
    const hotel = analysis.candidates.find((candidate) => candidate.name === "西鉄イン新宿");
    const lowerPenaltyRank = hotel.scenarioRanks.find(
      (rank) => rank.weightScenarioId === "categoryPenalty_minus_20_percent",
    ).rank;
    const higherPenaltyRank = hotel.scenarioRanks.find(
      (rank) => rank.weightScenarioId === "categoryPenalty_plus_20_percent",
    ).rank;
    expect([lowerPenaltyRank, higherPenaltyRank]).toEqual([2, 4]);
    expect(BASELINE_FIELD_CANDIDATE_RANKING_WEIGHTS.categoryPenalty).toBe(1);
  });

  it("derives a five-place shortlist with public, robust and boundary roles", () => {
    const shortlist = deriveFieldVisitShortlist(analyzeFieldCandidateRankingSensitivity(candidates));
    expect(shortlist.candidates.map((candidate) => candidate.name)).toEqual([
      "新宿観光振興協会",
      "西鉄イン新宿",
      "ヒルトン東京",
      "京王プラザホテル",
      "ヨドバシカメラ新宿西口本店",
    ]);
    expect(shortlist.candidates.filter((candidate) => candidate.shortlistRole === "robust_improvement")).toHaveLength(3);
    expect(shortlist.candidates.filter((candidate) => candidate.shortlistRole === "clear_public_verification")).toHaveLength(1);
    expect(shortlist.configuration.privateHospitalityMaximum).toBe(3);
  });

  it("never includes schools or ineffective candidates in a shortlist", () => {
    const source = candidates[0];
    const analysis = analyzeFieldCandidateRankingSensitivity([
      ...candidates,
      { ...source, candidateId: "school", name: "テスト学校", facilityAccessCategory: "restricted_or_sensitive" },
      { ...source, candidateId: "no-effect", name: "改善なし", grossImprovementMeters: 1, distanceToRouteMeters: 10 },
    ]);
    const shortlist = deriveFieldVisitShortlist(analysis, 10);
    expect(shortlist.candidates.map((candidate) => candidate.name).join(" ")).not.toMatch(/学校|改善なし/);
  });

  it("does not describe private candidates as unconditionally usable rest places", () => {
    const shortlist = deriveFieldVisitShortlist(analyzeFieldCandidateRankingSensitivity(candidates));
    for (const candidate of shortlist.candidates.filter((item) =>
      item.facilityAccessCategory === "private_hospitality"
      || item.facilityAccessCategory === "commercial_facility")) {
      expect(candidate.caution).toContain("休憩可能を意味しない");
      expect(candidate.inclusionReason).not.toContain("休憩できる");
    }
  });

  it("serializes sensitivity and shortlist CSV byte-for-byte deterministically", () => {
    const first = analyzeFieldCandidateRankingSensitivity(candidates);
    const second = analyzeFieldCandidateRankingSensitivity([...candidates].reverse());
    expect(fieldCandidateRankingSensitivityCsv(first))
      .toBe(fieldCandidateRankingSensitivityCsv(second));
    expect(fieldVisitShortlistCsv(deriveFieldVisitShortlist(first)))
      .toBe(fieldVisitShortlistCsv(deriveFieldVisitShortlist(second)));
  });
});
