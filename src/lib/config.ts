import type { AppConfig, PitchGroup, Session } from "./types.js";
import defaultConfigJson from "../../config/default.json" with { type: "json" };

const STORAGE_KEY = "appConfigOverrides";

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function assertSession(value: unknown, path: string): Session {
  if (!value || typeof value !== "object") {
    throw new Error(`${path}: expected object`);
  }
  const s = value as Record<string, unknown>;
  if (!isString(s.name) || !isString(s.start) || !isString(s.end)) {
    throw new Error(`${path}: name/start/end must be strings`);
  }
  return { name: s.name, start: s.start, end: s.end };
}

function assertPitchGroup(value: unknown, path: string): PitchGroup {
  if (!value || typeof value !== "object") {
    throw new Error(`${path}: expected object`);
  }
  const g = value as Record<string, unknown>;
  if (!isString(g.name) || !isString(g.dayOfWeek)) {
    throw new Error(`${path}: name/dayOfWeek must be strings`);
  }
  if (!Array.isArray(g.ageGroups) || !g.ageGroups.every(isString)) {
    throw new Error(`${path}.ageGroups must be string[]`);
  }
  if (!Array.isArray(g.pitches) || !g.pitches.every(isString)) {
    throw new Error(`${path}.pitches must be string[]`);
  }
  if (!Array.isArray(g.sessions)) {
    throw new Error(`${path}.sessions must be an array`);
  }
  return {
    name: g.name,
    dayOfWeek: g.dayOfWeek,
    ageGroups: g.ageGroups,
    pitches: g.pitches,
    sessions: g.sessions.map((s, i) => assertSession(s, `${path}.sessions[${i}]`)),
  };
}

export function assertAppConfig(value: unknown): AppConfig {
  if (!value || typeof value !== "object") {
    throw new Error("config must be an object");
  }
  const c = value as Record<string, unknown>;
  if (!c.club || typeof c.club !== "object") {
    throw new Error("config.club must be an object");
  }
  const club = c.club as Record<string, unknown>;
  if (!isString(club.id) || !isString(club.name)) {
    throw new Error("config.club.id and .name must be strings");
  }
  if (!isString(c.season)) throw new Error("config.season must be a string");
  if (!Array.isArray(c.pitchGroups)) {
    throw new Error("config.pitchGroups must be an array");
  }
  if (!c.dateRange || typeof c.dateRange !== "object") {
    throw new Error("config.dateRange must be an object");
  }
  const dr = c.dateRange as Record<string, unknown>;
  if (!isString(dr.from) || !isString(dr.to) || typeof dr.includePast !== "boolean") {
    throw new Error("config.dateRange.{from,to,includePast} required");
  }
  const homeTeamPattern = c.homeTeamPattern;
  if (homeTeamPattern !== undefined && !isString(homeTeamPattern)) {
    throw new Error("config.homeTeamPattern must be a string if set");
  }
  return {
    club: { id: club.id, name: club.name },
    season: c.season,
    pitchGroups: c.pitchGroups.map((g, i) =>
      assertPitchGroup(g, `config.pitchGroups[${i}]`),
    ),
    dateRange: { from: dr.from, to: dr.to, includePast: dr.includePast },
    ...(homeTeamPattern !== undefined ? { homeTeamPattern } : {}),
  };
}

export function loadDefaultConfig(): AppConfig {
  return assertAppConfig(defaultConfigJson);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (
    typeof base !== "object" ||
    base === null ||
    typeof override !== "object" ||
    Array.isArray(base) ||
    Array.isArray(override)
  ) {
    return override as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  }
  return out as T;
}

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getConfig(storage?: BrowserStorage): AppConfig {
  const base = loadDefaultConfig();
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : undefined);
  if (!store) return base;
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    return assertAppConfig(deepMerge(base, parsed));
  } catch {
    return base;
  }
}

export function saveConfigOverrides(
  overrides: Partial<AppConfig>,
  storage?: BrowserStorage,
): void {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : undefined);
  if (!store) return;
  store.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetConfigOverrides(storage?: BrowserStorage): void {
  const store =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : undefined);
  if (!store) return;
  store.removeItem(STORAGE_KEY);
}
