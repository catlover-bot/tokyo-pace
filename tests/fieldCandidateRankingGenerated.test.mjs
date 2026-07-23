import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  fieldCandidateRankingSensitivityCsv,
  fieldVisitShortlistCsv,
} from "../src/domain/fieldCandidateRankingSensitivity.mjs";

const fullGeneratedUrl = (name) =>
  new URL(`../data/generated/${name}`, import.meta.url);
const browserGeneratedUrl = (name) =>
  new URL(`../src/data/generated/${name}`, import.meta.url);

describe("field candidate ranking generated artifacts", () => {
  it("keeps full JSON and CSV sensitivity outputs aligned", async () => {
    const sensitivity = JSON.parse(
      await readFile(
        fullGeneratedUrl("field-candidate-ranking-sensitivity.json"),
        "utf8",
      ),
    );
    const csv = await readFile(
      fullGeneratedUrl("field-candidate-ranking-sensitivity.csv"),
      "utf8",
    );

    expect(sensitivity.metadata).toMatchObject({
      schemaVersion: 1,
      datasetId: "tokyo-pace-field-candidate-ranking-sensitivity",
      sourceType: "tokyo_pace_derived_analysis",
      candidateCount: sensitivity.candidates.length,
      weightScenarioCount: sensitivity.weightScenarios.length,
      rankingScenarioCount: sensitivity.weightScenarios.length,
      rankingRowCount: sensitivity.rankings.length,
      paretoCandidateCount: sensitivity.paretoCandidateIds.length,
    });
    expect(sensitivity.metadata.weightScenarioCount).toBe(15);
    expect(sensitivity.configuration.detourScenarioCount).toBe(3);
    expect(csv).toBe(fieldCandidateRankingSensitivityCsv(sensitivity));
  });

  it("keeps the deterministic visit shortlist JSON and CSV aligned", async () => {
    const shortlist = JSON.parse(
      await readFile(fullGeneratedUrl("field-visit-shortlist.json"), "utf8"),
    );
    const csv = await readFile(
      fullGeneratedUrl("field-visit-shortlist.csv"),
      "utf8",
    );

    expect(shortlist.metadata).toMatchObject({
      schemaVersion: 1,
      datasetId: "tokyo-pace-field-visit-shortlist",
      sourceType: "tokyo_pace_derived_analysis",
      entryCount: shortlist.candidates.length,
      requestedLimit: 5,
    });
    expect(shortlist.candidates).toHaveLength(5);
    expect(shortlist.candidates.map((candidate) => candidate.visitPriority))
      .toEqual([1, 2, 3, 4, 5]);
    expect(csv).toBe(fieldVisitShortlistCsv(shortlist));
  });

  it("ships compact browser data without long scenario ranking rows", async () => {
    const fullSensitivity = JSON.parse(
      await readFile(
        fullGeneratedUrl("field-candidate-ranking-sensitivity.json"),
        "utf8",
      ),
    );
    const browserSensitivity = JSON.parse(
      await readFile(
        browserGeneratedUrl("field-candidate-ranking-sensitivity.json"),
        "utf8",
      ),
    );
    const fullShortlist = JSON.parse(
      await readFile(fullGeneratedUrl("field-visit-shortlist.json"), "utf8"),
    );
    const browserShortlist = JSON.parse(
      await readFile(browserGeneratedUrl("field-visit-shortlist.json"), "utf8"),
    );

    expect(Object.keys(browserSensitivity).sort()).toEqual([
      "candidates",
      "metadata",
    ]);
    expect(browserSensitivity.candidates).toHaveLength(
      fullSensitivity.candidates.length,
    );
    expect(browserSensitivity).not.toHaveProperty("rankings");
    expect(browserSensitivity).not.toHaveProperty("weightScenarios");
    expect(
      browserSensitivity.candidates.every(
        (candidate) => !Object.hasOwn(candidate, "scenarioRanks"),
      ),
    ).toBe(true);

    expect(Object.keys(browserShortlist).sort()).toEqual([
      "entries",
      "metadata",
    ]);
    expect(browserShortlist.entries).toHaveLength(
      fullShortlist.candidates.length,
    );
    expect(
      browserShortlist.entries.every(
        (entry) => !Object.hasOwn(entry, "scenarioRanks"),
      ),
    ).toBe(true);
  });

  it("uses deterministic order and distinct full/browser artifacts", async () => {
    const sensitivity = JSON.parse(
      await readFile(
        fullGeneratedUrl("field-candidate-ranking-sensitivity.json"),
        "utf8",
      ),
    );
    const shortlist = JSON.parse(
      await readFile(fullGeneratedUrl("field-visit-shortlist.json"), "utf8"),
    );

    expect(sensitivity.candidates.map((candidate) => candidate.candidateId))
      .toEqual(
        [...sensitivity.candidates]
          .sort(
            (a, b) =>
              a.baselineRank - b.baselineRank ||
              a.candidateId.localeCompare(b.candidateId),
          )
          .map((candidate) => candidate.candidateId),
      );
    expect(new Set(shortlist.candidates.map((candidate) => candidate.candidateId)).size)
      .toBe(shortlist.candidates.length);
    expect(
      shortlist.candidates.every(
        (candidate) =>
          sensitivity.candidates.some(
            (analysis) => analysis.candidateId === candidate.candidateId,
          ),
      ),
    ).toBe(true);
  });
});
