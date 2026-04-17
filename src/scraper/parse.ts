import * as cheerio from "cheerio";
import type { AppConfig, Fixture, FixtureStatus } from "../lib/types.js";
import { extractAgeGroup } from "../lib/ageGroup.js";
import { isHomeFixture } from "../lib/homeAway.js";

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const FIXTURE_ID_RE = /[?&]id=(\d+)/;

function parseDate(raw: string): string | null {
  const match = DATE_RE.exec(raw.trim());
  if (!match) return null;
  const [, dd, mm, yy] = match;
  return `20${yy}-${mm}-${dd}`;
}

function parseTime(raw: string): string {
  const match = TIME_RE.exec(raw.trim());
  if (!match) return "00:00";
  const hh = String(Number(match[1])).padStart(2, "0");
  return `${hh}:${match[2]}`;
}

function parseStatus(raw: string): FixtureStatus {
  const t = raw.trim().toLowerCase();
  if (!t) return "scheduled";
  if (t.includes("postpon")) return "postponed";
  if (t.includes("cancel") || t.includes("abandon")) return "cancelled";
  if (t.includes("played") || t.includes("result")) return "played";
  return "scheduled";
}

function extractFixtureId(href: string | undefined): string | null {
  if (!href) return null;
  const match = FIXTURE_ID_RE.exec(href);
  return match ? (match[1] ?? null) : null;
}

export function parseFixtures(
  html: string,
  config: AppConfig,
  scrapedAt: string = new Date().toISOString(),
): Fixture[] {
  const $ = cheerio.load(html);
  const fixtures: Fixture[] = [];

  $(".fixtures-table table tbody tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.children("td");
    if (cells.length < 10) return;

    const dateCell = cells.eq(1);
    const spans = dateCell.find("span");
    const rawDate = spans.eq(0).text();
    const date = parseDate(rawDate);
    if (!date) return;
    const kickoff = parseTime(spans.eq(1).text());

    const homeTeam = cells.eq(2).text().trim();
    const awayTeam = cells.eq(6).text().trim();
    if (!homeTeam || !awayTeam) return;

    const venue = cells.eq(7).text().trim() || null;
    const competition = cells.eq(8).text().trim();

    const statusAnchor = cells.eq(9).find("a").first().text();
    const status = parseStatus(statusAnchor);

    const href = $row.find("a").first().attr("href");
    const id =
      extractFixtureId(href) ??
      `${date}-${kickoff}-${homeTeam}-${awayTeam}`.replace(/\s+/g, "_");

    const ageGroup = extractAgeGroup(homeTeam) ?? extractAgeGroup(competition);

    fixtures.push({
      id,
      date,
      kickoff,
      homeTeam,
      awayTeam,
      ageGroup,
      competition,
      venue,
      status,
      isHome: isHomeFixture(homeTeam, config),
      scrapedAt,
    });
  });

  return fixtures;
}
