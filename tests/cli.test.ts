import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { buildDocument } from "../src/scraper/cli.js";
import { parseFixtures } from "../src/scraper/parse.js";
import { loadDefaultConfig } from "../src/lib/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "fixtures/sample.html"), "utf8");
const config = loadDefaultConfig();

describe("buildDocument", () => {
  it("returns sorted, timestamped fixtures on first run (no existing)", () => {
    const parsed = parseFixtures(html, config, "2026-04-17T10:00:00.000Z");
    const doc = buildDocument(parsed, config, "2026-04-17T10:00:00.000Z", null);
    expect(doc.scrapedAt).toBe("2026-04-17T10:00:00.000Z");
    expect(doc.fixtures).toHaveLength(25);
    expect(doc.config).toEqual({ club: config.club, season: config.season });
    for (let i = 1; i < doc.fixtures.length; i++) {
      const prev = doc.fixtures[i - 1]!;
      const cur = doc.fixtures[i]!;
      const prevKey = `${prev.date}${prev.kickoff}${prev.id}`;
      const curKey = `${cur.date}${cur.kickoff}${cur.id}`;
      expect(prevKey.localeCompare(curKey)).toBeLessThanOrEqual(0);
    }
  });

  it("preserves existing scrapedAt when fixture content is unchanged", () => {
    const parsed1 = parseFixtures(html, config, "2026-04-17T10:00:00.000Z");
    const doc1 = buildDocument(parsed1, config, "2026-04-17T10:00:00.000Z", null);

    const parsed2 = parseFixtures(html, config, "2026-04-17T11:00:00.000Z");
    const doc2 = buildDocument(
      parsed2,
      config,
      "2026-04-17T11:00:00.000Z",
      doc1,
    );

    expect(doc2.scrapedAt).toBe("2026-04-17T10:00:00.000Z");
    expect(JSON.stringify(doc2)).toBe(JSON.stringify(doc1));
  });

  it("uses fresh scrapedAt when fixture content changes", () => {
    const parsed1 = parseFixtures(html, config, "2026-04-17T10:00:00.000Z");
    const doc1 = buildDocument(parsed1, config, "2026-04-17T10:00:00.000Z", null);

    const parsed2 = parseFixtures(html, config, "2026-04-17T11:00:00.000Z");
    const mutated = [...parsed2];
    mutated[0] = { ...mutated[0]!, kickoff: "12:34" };
    const doc2 = buildDocument(
      mutated,
      config,
      "2026-04-17T11:00:00.000Z",
      doc1,
    );

    expect(doc2.scrapedAt).toBe("2026-04-17T11:00:00.000Z");
  });
});
