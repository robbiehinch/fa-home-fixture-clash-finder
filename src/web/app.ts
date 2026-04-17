import { getConfig } from "../lib/config.js";
import { detectClashes } from "../lib/clash.js";
import { allocate } from "../lib/allocate.js";
import type { AppConfig, Fixture, FixturesDocument } from "../lib/types.js";
import { renderPage } from "./render.js";

const DATA_URL = "./data/fixtures.json";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function resolveFrom(range: AppConfig["dateRange"]): string {
  if (range.from === "today") return todayIso();
  return range.from;
}

function resolveTo(range: AppConfig["dateRange"], fixtures: Fixture[]): string {
  if (range.to === "lastFixture") {
    const last = fixtures.map((f) => f.date).sort().at(-1);
    return last ?? "9999-12-31";
  }
  return range.to;
}

function filterByDateRange(
  fixtures: Fixture[],
  config: AppConfig,
): Fixture[] {
  const { dateRange } = config;
  if (dateRange.includePast) return fixtures;
  const from = resolveFrom(dateRange);
  const to = resolveTo(dateRange, fixtures);
  return fixtures.filter((f) => f.date >= from && f.date <= to);
}

async function loadDocument(): Promise<FixturesDocument | null> {
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as FixturesDocument;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) return;
  const config = getConfig();
  const doc = await loadDocument();
  if (!doc) {
    app.innerHTML =
      '<p class="empty">No fixture data yet. Run <code>npm run scrape</code> ' +
      "locally, or wait for the scheduled GitHub Action to populate it.</p>";
    return;
  }
  const visible = filterByDateRange(doc.fixtures, config);
  const clashes = detectClashes(visible, config);
  const allocations = allocate(visible, config);
  renderPage(app, {
    config,
    scrapedAt: doc.scrapedAt,
    fixtures: visible,
    clashes,
    allocations,
  });
}

main();
