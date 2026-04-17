import { promises as fs } from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { loadDefaultConfig } from "../lib/config.js";
import { buildFixturesUrl } from "./fetch.js";
import { parseFixtures } from "./parse.js";
import type { AppConfig, Fixture } from "../lib/types.js";

const OUT_DIR = path.resolve("tmp/diagnose");
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const POLITE_PAUSE_MS = 1000;
const MAX_ATTEMPTS = 3;

type Variation = {
  id: string;
  description: string;
  buildUrl: (config: AppConfig) => string;
};

type Result = {
  id: string;
  description: string;
  url: string;
  status: number | null;
  contentLength: number | null;
  rowCount: number;
  parsedCount: number;
  parserLoss: number;
  byAgeGroup: Record<string, number>;
  byStatus: Record<string, number>;
  homeCount: number;
  uniqueDates: number;
  minDate: string | null;
  maxDate: string | null;
  pagination: {
    hasPaginationEl: boolean;
    hasNextLink: boolean;
    showingText: string | null;
  };
  error: string | null;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function mutateQuery(
  url: string,
  mutator: (params: URLSearchParams) => void,
): string {
  const u = new URL(url);
  mutator(u.searchParams);
  return u.toString();
}

function buildVariations(config: AppConfig): Variation[] {
  const base = (override: (p: URLSearchParams) => void) =>
    mutateQuery(buildFixturesUrl(config), override);

  const variations: Variation[] = [
    {
      id: "baseline",
      description: "Current scraper URL (no changes).",
      buildUrl: () => buildFixturesUrl(config),
    },
    {
      id: "items-500",
      description: "itemsPerPage=500 — does FA honour larger page sizes?",
      buildUrl: () => base((p) => p.set("itemsPerPage", "500")),
    },
    {
      id: "items-1000",
      description: "itemsPerPage=1000 — upper bound probe.",
      buildUrl: () => base((p) => p.set("itemsPerPage", "1000")),
    },
    {
      id: "relOpt-blank",
      description: "Drop selectedRelatedFixtureOption entirely.",
      buildUrl: () => base((p) => p.delete("selectedRelatedFixtureOption")),
    },
    {
      id: "relOpt-1",
      description: "selectedRelatedFixtureOption=1",
      buildUrl: () => base((p) => p.set("selectedRelatedFixtureOption", "1")),
    },
    {
      id: "relOpt-2",
      description: "selectedRelatedFixtureOption=2",
      buildUrl: () => base((p) => p.set("selectedRelatedFixtureOption", "2")),
    },
    {
      id: "relOpt-4",
      description: "selectedRelatedFixtureOption=4",
      buildUrl: () => base((p) => p.set("selectedRelatedFixtureOption", "4")),
    },
    {
      id: "strip-previous",
      description: "Remove all previousSelected* params.",
      buildUrl: () =>
        base((p) => {
          for (const key of [...p.keys()]) {
            if (key.startsWith("previousSelected")) p.delete(key);
          }
        }),
    },
    {
      id: "no-season",
      description: "Drop selectedSeason to probe current-season fallback.",
      buildUrl: () => base((p) => p.delete("selectedSeason")),
    },
    {
      id: "dateCode-current",
      description: "selectedDateCode=current (vs. default 'all').",
      buildUrl: () => base((p) => p.set("selectedDateCode", "current")),
    },
    {
      id: "page-2",
      description: "Append pageNumber=2 (expose pagination).",
      buildUrl: () => base((p) => p.set("pageNumber", "2")),
    },
    {
      id: "page-3",
      description: "Append pageNumber=3.",
      buildUrl: () => base((p) => p.set("pageNumber", "3")),
    },
  ];

  const ageGroups = new Set<string>();
  for (const group of config.pitchGroups) {
    for (const age of group.ageGroups) ageGroups.add(age);
  }
  for (const age of ageGroups) {
    variations.push({
      id: `age-${age}`,
      description: `selectedFixtureGroupAgeGroup=${age} (per-age-group query).`,
      buildUrl: () =>
        base((p) => {
          p.set("selectedFixtureGroupAgeGroup", age);
          p.set("previousSelectedFixtureGroupAgeGroup", age);
        }),
    });
  }

  return variations;
}

async function fetchWithRetry(
  url: string,
): Promise<{ status: number; html: string; contentLength: number | null }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });
      if (res.status >= 500) throw new Error(`FA returned ${res.status}`);
      const html = await res.text();
      const cl = res.headers.get("content-length");
      return {
        status: res.status,
        html,
        contentLength: cl ? Number(cl) : Buffer.byteLength(html, "utf8"),
      };
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `fetch failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

function analyseHtml(html: string, config: AppConfig): Omit<Result, "id" | "description" | "url" | "status" | "contentLength" | "error"> {
  const $ = cheerio.load(html);
  const rowCount = $(".fixtures-table table tbody tr").length;
  const parsed = parseFixtures(html, config, "1970-01-01T00:00:00Z");

  const byAgeGroup: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let homeCount = 0;
  const dates = new Set<string>();

  for (const f of parsed) {
    const age = f.ageGroup ?? "null";
    byAgeGroup[age] = (byAgeGroup[age] ?? 0) + 1;
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    if (f.isHome) homeCount++;
    dates.add(f.date);
  }
  const sortedDates = [...dates].sort();

  const hasPaginationEl =
    $(".pagination, nav[aria-label*='agin'], ul[class*='agin']").length > 0;
  const hasNextLink =
    $("a, button")
      .toArray()
      .some((el) => /\bnext\b/i.test($(el).text() || ""));
  const showingMatch = /Showing\s+\d+[\s\S]{0,30}?of\s+\d+/i.exec(html);

  return {
    rowCount,
    parsedCount: parsed.length,
    parserLoss: Math.max(0, rowCount - parsed.length),
    byAgeGroup,
    byStatus,
    homeCount,
    uniqueDates: dates.size,
    minDate: sortedDates[0] ?? null,
    maxDate: sortedDates.at(-1) ?? null,
    pagination: {
      hasPaginationEl,
      hasNextLink,
      showingText: showingMatch ? showingMatch[0] : null,
    },
  };
}

async function runVariation(
  variation: Variation,
  config: AppConfig,
): Promise<Result> {
  const url = variation.buildUrl(config);
  try {
    const { status, html, contentLength } = await fetchWithRetry(url);
    await fs.writeFile(path.join(OUT_DIR, `${variation.id}.html`), html, "utf8");
    const analysis = analyseHtml(html, config);
    return {
      id: variation.id,
      description: variation.description,
      url,
      status,
      contentLength,
      error: null,
      ...analysis,
    };
  } catch (err) {
    return {
      id: variation.id,
      description: variation.description,
      url,
      status: null,
      contentLength: null,
      rowCount: 0,
      parsedCount: 0,
      parserLoss: 0,
      byAgeGroup: {},
      byStatus: {},
      homeCount: 0,
      uniqueDates: 0,
      minDate: null,
      maxDate: null,
      pagination: { hasPaginationEl: false, hasNextLink: false, showingText: null },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function renderMarkdown(results: Result[]): string {
  const lines: string[] = [];
  lines.push(`# FA scraper diagnostic report`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`## Summary table`);
  lines.push("");
  lines.push(
    "| Variation | Status | Rows | Parsed | Loss | Home | Dates | Ages | Date span | Paging |",
  );
  lines.push(
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
  );
  for (const r of results) {
    const ages = Object.entries(r.byAgeGroup)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    const span = r.minDate && r.maxDate ? `${r.minDate}\u2026${r.maxDate}` : "\u2014";
    const paging = [
      r.pagination.hasPaginationEl ? "el" : "",
      r.pagination.hasNextLink ? "next" : "",
      r.pagination.showingText ? "showing" : "",
    ]
      .filter(Boolean)
      .join(",") || "\u2014";
    const status = r.error ? `ERR` : String(r.status ?? "?");
    lines.push(
      `| \`${r.id}\` | ${status} | ${r.rowCount} | ${r.parsedCount} | ${r.parserLoss} | ${r.homeCount} | ${r.uniqueDates} | ${ages || "\u2014"} | ${span} | ${paging} |`,
    );
  }

  lines.push("");
  lines.push(`## Findings`);
  lines.push("");
  const baseline = results.find((r) => r.id === "baseline");
  const byRows = [...results].sort((a, b) => b.rowCount - a.rowCount);
  const byParsed = [...results].sort((a, b) => b.parsedCount - a.parsedCount);
  if (baseline) {
    lines.push(
      `- Baseline: **${baseline.rowCount} rows / ${baseline.parsedCount} parsed fixtures** across ${baseline.uniqueDates} dates.`,
    );
  }
  const topRows = byRows[0];
  if (topRows && topRows.id !== "baseline") {
    lines.push(
      `- Highest row count: \`${topRows.id}\` with ${topRows.rowCount} rows (vs baseline ${baseline?.rowCount ?? "?"}).`,
    );
  }
  const topParsed = byParsed[0];
  if (topParsed && topParsed.id !== "baseline") {
    lines.push(
      `- Highest parsed count: \`${topParsed.id}\` with ${topParsed.parsedCount} parsed fixtures.`,
    );
  }
  const lossy = results.filter((r) => r.parserLoss > 0);
  for (const r of lossy) {
    lines.push(
      `- **Parser loss** on \`${r.id}\`: ${r.rowCount} rows but only ${r.parsedCount} parsed — inspect \`tmp/diagnose/${r.id}.html\`.`,
    );
  }
  const paginated = results.filter(
    (r) =>
      r.pagination.hasPaginationEl ||
      r.pagination.hasNextLink ||
      r.pagination.showingText,
  );
  for (const r of paginated) {
    const bits = [
      r.pagination.hasPaginationEl ? "pagination element" : null,
      r.pagination.hasNextLink ? "next link" : null,
      r.pagination.showingText ? `text: "${r.pagination.showingText}"` : null,
    ]
      .filter(Boolean)
      .join("; ");
    lines.push(`- Pagination signal on \`${r.id}\`: ${bits}.`);
  }
  if (baseline) {
    const baselineAges = new Set(Object.keys(baseline.byAgeGroup));
    for (const r of results) {
      if (r.id === "baseline") continue;
      const newAges = Object.keys(r.byAgeGroup).filter(
        (a) => !baselineAges.has(a),
      );
      if (newAges.length > 0) {
        lines.push(
          `- \`${r.id}\` surfaces age groups not in baseline: ${newAges.join(", ")}.`,
        );
      }
    }
  }
  const errors = results.filter((r) => r.error);
  for (const r of errors) {
    lines.push(`- \`${r.id}\` errored: ${r.error}`);
  }
  if (lossy.length === 0 && errors.length === 0 && paginated.length === 0) {
    lines.push("- No parser loss, pagination signals, or fetch errors detected.");
  }
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const config = loadDefaultConfig();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const variations = buildVariations(config);
  const results: Result[] = [];
  for (let i = 0; i < variations.length; i++) {
    const v = variations[i]!;
    console.log(`[${i + 1}/${variations.length}] ${v.id} — ${v.description}`);
    const result = await runVariation(v, config);
    results.push(result);
    if (i < variations.length - 1) await sleep(POLITE_PAUSE_MS);
  }
  const markdown = renderMarkdown(results);
  await fs.writeFile(path.join(OUT_DIR, "report.md"), markdown, "utf8");
  await fs.writeFile(
    path.join(OUT_DIR, "report.json"),
    JSON.stringify(results, null, 2) + "\n",
    "utf8",
  );
  console.log("");
  console.log(markdown);
  console.log(`Wrote ${results.length} results to ${OUT_DIR}`);
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("diagnose.ts") ||
    process.argv[1].endsWith("diagnose.js"));

if (isMain) {
  main().catch((err) => {
    console.error("Diagnose failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { buildVariations, analyseHtml, renderMarkdown };
export type { Variation, Result };
