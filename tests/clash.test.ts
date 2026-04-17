import { describe, it, expect } from "vitest";
import { detectClashes } from "../src/lib/clash.js";
import type { AppConfig, Fixture } from "../src/lib/types.js";

const miniSoccer = {
  name: "Mini-soccer (U7–U10)",
  ageGroups: ["U7", "U8", "U9", "U10"],
  dayOfWeek: "Saturday",
  sessions: [
    { name: "Early", start: "09:00", end: "10:30" },
    { name: "Late", start: "10:45", end: "12:15" },
  ],
  pitches: ["Pitch 1", "Pitch 2", "Pitch 3"],
};

const config: AppConfig = {
  club: { id: "1", name: "Baldock Town Youth" },
  season: "s",
  pitchGroups: [miniSoccer],
  dateRange: { from: "today", to: "lastFixture", includePast: false },
};

const mkFixture = (p: Partial<Fixture>): Fixture => ({
  id: p.id ?? "id",
  date: p.date ?? "2026-09-05",
  kickoff: p.kickoff ?? "09:00",
  homeTeam: p.homeTeam ?? "Baldock Town Youth U9",
  awayTeam: p.awayTeam ?? "Hitchin U9",
  ageGroup: p.ageGroup ?? "U9",
  competition: p.competition ?? "League",
  venue: p.venue ?? null,
  status: p.status ?? "scheduled",
  isHome: p.isHome ?? true,
  scrapedAt: "2026-04-17T00:00:00Z",
});

describe("detectClashes", () => {
  it("returns no clash when count equals capacity", () => {
    const fixtures = Array.from({ length: 6 }, (_, i) =>
      mkFixture({ id: `f${i}`, kickoff: i < 3 ? "09:00" : "10:45" }),
    );
    expect(detectClashes(fixtures, config)).toEqual([]);
  });

  it("detects a clash when over capacity", () => {
    const fixtures = Array.from({ length: 7 }, (_, i) =>
      mkFixture({ id: `f${i}` }),
    );
    const clashes = detectClashes(fixtures, config);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({
      date: "2026-09-05",
      pitchGroup: "Mini-soccer (U7–U10)",
      capacity: 6,
      count: 7,
    });
  });

  it("ignores fixtures outside the pitch-group age range", () => {
    const fixtures = [
      ...Array.from({ length: 6 }, (_, i) => mkFixture({ id: `u9-${i}` })),
      mkFixture({ id: "u11", homeTeam: "Baldock Town Youth U11", ageGroup: "U11" }),
    ];
    expect(detectClashes(fixtures, config)).toEqual([]);
  });

  it("ignores away fixtures", () => {
    const fixtures = Array.from({ length: 7 }, (_, i) =>
      mkFixture({ id: `f${i}`, isHome: i !== 0 }),
    );
    expect(detectClashes(fixtures, config)).toEqual([]);
  });

  it("ignores postponed/cancelled fixtures for capacity", () => {
    const fixtures = [
      ...Array.from({ length: 6 }, (_, i) => mkFixture({ id: `f${i}` })),
      mkFixture({ id: "pp", status: "postponed" }),
      mkFixture({ id: "cc", status: "cancelled" }),
    ];
    expect(detectClashes(fixtures, config)).toEqual([]);
  });

  it("handles multiple pitch groups independently", () => {
    const u11Group = {
      ...miniSoccer,
      name: "9v9 (U11–U12)",
      ageGroups: ["U11", "U12"],
      pitches: ["Pitch A"],
      sessions: [{ name: "Morning", start: "10:00", end: "11:30" }],
    };
    const cfg: AppConfig = { ...config, pitchGroups: [miniSoccer, u11Group] };
    const fixtures = [
      ...Array.from({ length: 6 }, (_, i) => mkFixture({ id: `u9-${i}` })),
      mkFixture({ id: "u11-1", homeTeam: "BTY U11", ageGroup: "U11" }),
      mkFixture({ id: "u11-2", homeTeam: "BTY U11", ageGroup: "U11" }),
    ];
    const clashes = detectClashes(fixtures, cfg);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]?.pitchGroup).toBe("9v9 (U11–U12)");
    expect(clashes[0]?.count).toBe(2);
  });

  it("sorts clashes by date", () => {
    const fixtures = [
      ...Array.from({ length: 7 }, (_, i) => mkFixture({ id: `a${i}`, date: "2026-09-12" })),
      ...Array.from({ length: 7 }, (_, i) => mkFixture({ id: `b${i}`, date: "2026-09-05" })),
    ];
    const clashes = detectClashes(fixtures, config);
    expect(clashes.map((c) => c.date)).toEqual(["2026-09-05", "2026-09-12"]);
  });
});
