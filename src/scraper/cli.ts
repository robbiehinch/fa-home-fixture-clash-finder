import { promises as fs } from "node:fs";
import path from "node:path";
import { loadDefaultConfig } from "../lib/config.js";
import { fetchFixturesPage } from "./fetch.js";
import { parseFixtures } from "./parse.js";
import type { AppConfig, Fixture, FixturesDocument } from "../lib/types.js";

const OUT_PATH = path.resolve("public/data/fixtures.json");

function sortFixtures(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.kickoff.localeCompare(b.kickoff) ||
      a.id.localeCompare(b.id),
  );
}

function stripScrapedAt(f: Fixture): Omit<Fixture, "scrapedAt"> {
  const { scrapedAt: _ignored, ...rest } = f;
  return rest;
}

function fixtureContentEqual(a: Fixture[], b: Fixture[]): boolean {
  if (a.length !== b.length) return false;
  return (
    JSON.stringify(a.map(stripScrapedAt)) ===
    JSON.stringify(b.map(stripScrapedAt))
  );
}

export function buildDocument(
  parsed: Fixture[],
  config: AppConfig,
  scrapedAt: string,
  existing: FixturesDocument | null,
): FixturesDocument {
  const sorted = sortFixtures(parsed);
  const stableTimestamp =
    existing && fixtureContentEqual(existing.fixtures, sorted)
      ? existing.scrapedAt
      : scrapedAt;
  const fixtures = sorted.map((f) => ({ ...f, scrapedAt: stableTimestamp }));
  return {
    scrapedAt: stableTimestamp,
    config: { club: config.club, season: config.season },
    fixtures,
  };
}

async function readExisting(): Promise<FixturesDocument | null> {
  try {
    const raw = await fs.readFile(OUT_PATH, "utf8");
    return JSON.parse(raw) as FixturesDocument;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const config = loadDefaultConfig();
  const html = await fetchFixturesPage(config, {
    debug: process.env.DEBUG_SCRAPE === "1",
  });
  const scrapedAt = new Date().toISOString();
  const parsed = parseFixtures(html, config, scrapedAt);
  if (parsed.length === 0) {
    console.warn("Warning: parser returned 0 fixtures — check the sample HTML.");
  }

  const existing = await readExisting();
  const doc = buildDocument(parsed, config, scrapedAt, existing);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(doc, null, 2) + "\n", "utf8");

  const homeCount = doc.fixtures.filter((f) => f.isHome).length;
  console.log(
    `Scraped ${doc.fixtures.length} fixtures (${homeCount} home) for ${config.club.name} season ${config.season}`,
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("cli.ts") || process.argv[1].endsWith("cli.js"));

if (isMain) {
  main().catch((err) => {
    console.error("Scrape failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
