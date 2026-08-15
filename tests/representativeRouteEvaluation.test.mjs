import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildCsv, buildReport, CSV_FILE, REPORT_FILE, SNAPSHOT_FILE } from "../scripts/representative-route-evaluation.mjs";

const directory = new URL("../data/evaluation/", import.meta.url);
const snapshot = JSON.parse(await readFile(new URL(SNAPSHOT_FILE, directory), "utf8"));

describe("代表実経路の標高評価", () => {
  it("保存済みsnapshotからCSVとMarkdownを決定的に再生成する", async () => {
    expect(buildCsv(snapshot)).toBe(await readFile(new URL(CSV_FILE, directory), "utf8"));
    expect(buildReport(snapshot)).toBe(await readFile(new URL(REPORT_FILE, directory), "utf8"));
  });

  it("実動的3 profile、出典、推定値と欠損の意味を保持する", () => {
    expect(snapshot.routes.map((route) => route.profile)).toEqual(["standard", "step_avoiding", "wheelchair_profile"]);
    expect(snapshot.provenance.routing.attribution).toContain("OpenStreetMap");
    expect(snapshot.provenance.elevation.provider).toBe("国土地理院");
    expect(snapshot.provenance.elevation.derivedValuesAreMeasurements).toBe(false);
    expect(snapshot.routes.every((route) => route.isFallback === false && route.elevation.status !== "unavailable")).toBe(true);
  });
});
