import { getConfig } from "../lib/config.js";
import { detectClashes } from "../lib/clash.js";
import { allocate } from "../lib/allocate.js";
import {
  applyOverrides,
  clearOverrides,
  loadOverrides,
  saveOverrides,
} from "../lib/overrides.js";
import type {
  Allocation,
  AllocationOverrides,
  AppConfig,
  Fixture,
  FixturesDocument,
} from "../lib/types.js";
import { renderPage } from "./render.js";

const DATA_URL = "./data/fixtures.json";
const WINDOW_OFFSET_KEY = "viewWindowOffsetDays";
const DAY_MS = 24 * 60 * 60 * 1000;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function resolveFrom(range: AppConfig["dateRange"]): string {
  if (range.from === "today") return todayIso();
  return range.from;
}

function resolveTo(range: AppConfig["dateRange"], fixtures: Fixture[]): string {
  const { to } = range;
  if (to === "lastFixture") {
    const last = fixtures.map((f) => f.date).sort().at(-1);
    return last ?? "9999-12-31";
  }
  const relative = /^\+(\d+)d$/.exec(to);
  if (relative && relative[1]) {
    return addDaysIso(resolveFrom(range), Number(relative[1]));
  }
  return to;
}

function shiftWindow(
  range: AppConfig["dateRange"],
  fixtures: Fixture[],
  offsetDays: number,
): { from: string; to: string } {
  return {
    from: addDaysIso(resolveFrom(range), offsetDays),
    to: addDaysIso(resolveTo(range, fixtures), offsetDays),
  };
}

function filterByWindow(
  fixtures: Fixture[],
  window: { from: string; to: string },
): Fixture[] {
  return fixtures.filter((f) => f.date >= window.from && f.date <= window.to);
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

function readWindowOffset(): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = localStorage.getItem(WINDOW_OFFSET_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function writeWindowOffset(days: number): void {
  if (typeof localStorage === "undefined") return;
  if (days === 0) localStorage.removeItem(WINDOW_OFFSET_KEY);
  else localStorage.setItem(WINDOW_OFFSET_KEY, String(days));
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

  let overrides: AllocationOverrides = loadOverrides();
  let offsetDays = readWindowOffset();

  const rerender = (): void => {
    const window = shiftWindow(config.dateRange, doc.fixtures, offsetDays);
    const visible = filterByWindow(doc.fixtures, window);
    const clashes = detectClashes(visible, config);
    const baseAllocations = allocate(visible, config);
    const allocations: Allocation[] = baseAllocations.map((a) => {
      const group = config.pitchGroups.find((g) => g.name === a.pitchGroup);
      if (!group) return a;
      return applyOverrides(a, group, overrides);
    });
    renderPage(app, {
      config,
      scrapedAt: doc.scrapedAt,
      fixtures: visible,
      clashes,
      allocations,
      window,
      offsetDays,
      hasOverrides: Object.keys(overrides).length > 0,
      onShiftWindow: (deltaDays) => {
        offsetDays += deltaDays;
        writeWindowOffset(offsetDays);
        rerender();
      },
      onResetWindow: () => {
        offsetDays = 0;
        writeWindowOffset(0);
        rerender();
      },
      onMoveFixture: (fixtureId, slot) => {
        overrides = { ...overrides, [fixtureId]: { slot } };
        saveOverrides(overrides);
        rerender();
      },
      onResetAllocations: () => {
        overrides = {};
        clearOverrides();
        rerender();
      },
    });
  };

  rerender();
}

main();
