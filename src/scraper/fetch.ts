import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../lib/types.js";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const BASE_URL = "https://fulltime.thefa.com/fixtures.html";

export type FetchOptions = {
  itemsPerPage?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  debug?: boolean;
  debugDir?: string;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function buildFixturesUrl(config: AppConfig, itemsPerPage = 100): string {
  const params = new URLSearchParams({
    selectedSeason: config.season,
    selectedFixtureGroupAgeGroup: "0",
    selectedFixtureGroupKey: "",
    selectedDateCode: "all",
    selectedClub: config.club.id,
    selectedTeam: "",
    selectedRelatedFixtureOption: "3",
    selectedFixtureDateStatus: "",
    selectedFixtureStatus: "",
    previousSelectedFixtureGroupAgeGroup: "0",
    previousSelectedFixtureGroupKey: "",
    previousSelectedClub: config.club.id,
    itemsPerPage: String(itemsPerPage),
  });
  return `${BASE_URL}?${params.toString()}`;
}

export async function fetchFixturesPage(
  config: AppConfig,
  opts: FetchOptions = {},
): Promise<string> {
  const {
    itemsPerPage = 100,
    userAgent = DEFAULT_UA,
    fetchImpl = fetch,
    sleep = defaultSleep,
    maxAttempts = 4,
    debug = false,
    debugDir = "tmp",
  } = opts;

  const url = buildFixturesUrl(config, itemsPerPage);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });
      if (res.status >= 500) {
        throw new Error(`FA returned ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`FA returned ${res.status} ${res.statusText}`);
      }
      const html = await res.text();
      if (debug) {
        await fs.mkdir(debugDir, { recursive: true });
        await fs.writeFile(path.join(debugDir, "fixtures.raw.html"), html, "utf8");
      }
      return html;
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      const backoff = 2000 * 2 ** (attempt - 1);
      await sleep(backoff);
    }
  }
  throw new Error(
    `fetchFixturesPage failed after ${maxAttempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
