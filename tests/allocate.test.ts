import { describe, it, expect } from "vitest";
import { allocate } from "../src/lib/allocate.js";
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

describe("allocate", () => {
  it("produces a clean 3x2 allocation for 3 early + 3 late", () => {
    const fixtures = [
      mkFixture({ id: "e1", kickoff: "09:00", ageGroup: "U9" }),
      mkFixture({ id: "e2", kickoff: "09:15", ageGroup: "U8" }),
      mkFixture({ id: "e3", kickoff: "09:30", ageGroup: "U7" }),
      mkFixture({ id: "l1", kickoff: "10:45", ageGroup: "U10" }),
      mkFixture({ id: "l2", kickoff: "11:00", ageGroup: "U9" }),
      mkFixture({ id: "l3", kickoff: "11:15", ageGroup: "U8" }),
    ];
    const [alloc] = allocate(fixtures, config);
    expect(alloc?.partialClash).toBe(false);
    expect(alloc?.unassigned).toEqual([]);
    expect(alloc?.assignments).toHaveLength(6);
    const sessions = alloc!.assignments.map((a) => a.session);
    expect(sessions.filter((s) => s === "Early")).toHaveLength(3);
    expect(sessions.filter((s) => s === "Late")).toHaveLength(3);
  });

  it("flags partial clash when one session overflows", () => {
    const fixtures = [
      mkFixture({ id: "e1", kickoff: "09:00" }),
      mkFixture({ id: "e2", kickoff: "09:15" }),
      mkFixture({ id: "e3", kickoff: "09:30" }),
      mkFixture({ id: "e4", kickoff: "09:45" }),
      mkFixture({ id: "l1", kickoff: "10:45" }),
      mkFixture({ id: "l2", kickoff: "11:00" }),
    ];
    const [alloc] = allocate(fixtures, config);
    expect(alloc?.partialClash).toBe(true);
    expect(alloc?.assignments).toHaveLength(5);
    expect(alloc?.unassigned.map((f) => f.id)).toEqual(["e4"]);
  });

  it("puts fixtures outside any session into unassigned", () => {
    const fixtures = [
      mkFixture({ id: "early-early", kickoff: "08:30" }),
      mkFixture({ id: "e1", kickoff: "09:00" }),
      mkFixture({ id: "e2", kickoff: "09:30" }),
      mkFixture({ id: "e3", kickoff: "10:00" }),
    ];
    const [alloc] = allocate(fixtures, config);
    expect(alloc?.unassigned.map((f) => f.id)).toContain("early-early");
    expect(alloc?.assignments).toHaveLength(3);
  });

  it("tie-breaks by older age group when kickoffs match", () => {
    const fixtures = [
      mkFixture({ id: "a", kickoff: "09:00", ageGroup: "U7" }),
      mkFixture({ id: "b", kickoff: "09:00", ageGroup: "U10" }),
      mkFixture({ id: "c", kickoff: "09:00", ageGroup: "U8" }),
    ];
    const [alloc] = allocate(fixtures, config);
    expect(alloc?.assignments.map((a) => a.fixture.id)).toEqual(["b", "c", "a"]);
  });

  it("skips dates with a hard clash (returns no Allocation)", () => {
    const fixtures = Array.from({ length: 7 }, (_, i) =>
      mkFixture({ id: `f${i}`, kickoff: "09:00" }),
    );
    expect(allocate(fixtures, config)).toEqual([]);
  });

  it("sorts allocations by date", () => {
    const fixtures = [
      mkFixture({ id: "b", date: "2026-09-12", kickoff: "09:00" }),
      mkFixture({ id: "a", date: "2026-09-05", kickoff: "09:00" }),
    ];
    const allocations = allocate(fixtures, config);
    expect(allocations.map((a) => a.date)).toEqual(["2026-09-05", "2026-09-12"]);
  });

  it("ignores away and non-scheduled fixtures", () => {
    const fixtures = [
      mkFixture({ id: "home", kickoff: "09:00" }),
      mkFixture({ id: "away", kickoff: "09:00", isHome: false }),
      mkFixture({ id: "postponed", kickoff: "09:00", status: "postponed" }),
    ];
    const [alloc] = allocate(fixtures, config);
    expect(alloc?.assignments).toHaveLength(1);
    expect(alloc?.assignments[0]?.fixture.id).toBe("home");
  });
});
