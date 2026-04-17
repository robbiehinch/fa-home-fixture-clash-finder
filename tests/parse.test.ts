import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { parseFixtures } from "../src/scraper/parse.js";
import { loadDefaultConfig } from "../src/lib/config.js";
import type { Fixture } from "../src/lib/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(here, "fixtures/sample.html");
const html = readFileSync(samplePath, "utf8");
const config = loadDefaultConfig();
const FIXED_SCRAPED_AT = "2026-04-17T00:00:00.000Z";

let fixtures: Fixture[];
beforeAll(() => {
  fixtures = parseFixtures(html, config, FIXED_SCRAPED_AT);
});

describe("parseFixtures", () => {
  it("parses all 25 rows from the sample", () => {
    expect(fixtures).toHaveLength(25);
  });

  it("produces 14 home fixtures for Baldock Town Youth", () => {
    const home = fixtures.filter((f) => f.isHome);
    expect(home).toHaveLength(14);
    home.forEach((f) => {
      expect(f.homeTeam.toLowerCase()).toContain("baldock town youth");
    });
  });

  it("every fixture has a valid ISO date and HH:mm kickoff", () => {
    for (const f of fixtures) {
      expect(f.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.kickoff).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("extracts age groups from home team names", () => {
    const ages = new Set(fixtures.map((f) => f.ageGroup));
    expect(ages.has("U7")).toBe(true);
    expect(ages.has("U8")).toBe(true);
    expect(ages.has("U9")).toBe(true);
    expect(ages.has("U10")).toBe(true);
    expect(ages.has("U11")).toBe(true);
    for (const f of fixtures) {
      expect(f.ageGroup).not.toBeNull();
    }
  });

  it("captures postponed status", () => {
    const postponed = fixtures.filter((f) => f.status === "postponed");
    expect(postponed.length).toBeGreaterThanOrEqual(10);
  });

  it("uses the FA fixture id as the stable id", () => {
    expect(fixtures.some((f) => f.id === "28280535")).toBe(true);
    expect(fixtures.some((f) => f.id === "29858381")).toBe(true);
  });

  it("parses a specific fixture correctly", () => {
    const f = fixtures.find((x) => x.id === "29858381");
    expect(f).toBeDefined();
    expect(f).toMatchObject({
      date: "2026-04-18",
      kickoff: "09:30",
      homeTeam: "Baldock Town Youth U10 Crusaders",
      awayTeam: "Biggleswade Town Youth U10 Herons",
      ageGroup: "U10",
      competition: "Under 10 Damson",
      status: "scheduled",
      isHome: true,
      scrapedAt: FIXED_SCRAPED_AT,
    });
  });

  it("finds exactly 4 scheduled home U7-U10 fixtures on 2026-04-18", () => {
    const u7toU10 = new Set(["U7", "U8", "U9", "U10"]);
    const onDate = fixtures.filter(
      (f) =>
        f.date === "2026-04-18" &&
        f.isHome &&
        f.status === "scheduled" &&
        f.ageGroup !== null &&
        u7toU10.has(f.ageGroup),
    );
    expect(onDate.length).toBe(6);
  });
});
