import { describe, it, expect } from "vitest";
import {
  applyOverrides,
  clearOverrides,
  loadOverrides,
  saveOverrides,
} from "../src/lib/overrides.js";
import type {
  Allocation,
  AllocationOverrides,
  Fixture,
  PitchGroup,
} from "../src/lib/types.js";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
}

const group: PitchGroup = {
  name: "Mini",
  ageGroups: ["U7", "U8", "U9", "U10"],
  dayOfWeek: "Saturday",
  sessions: [
    { name: "Early", start: "09:00", end: "10:30" },
    { name: "Late", start: "10:45", end: "12:15" },
  ],
  pitches: ["Pitch 1", "Pitch 2", "Pitch 3"],
};

const mkFixture = (id: string): Fixture => ({
  id,
  date: "2026-09-05",
  kickoff: "09:00",
  homeTeam: `Baldock Town Youth U9 ${id}`,
  awayTeam: "Opponent",
  ageGroup: "U9",
  competition: "League",
  venue: null,
  status: "scheduled",
  isHome: true,
  scrapedAt: "2026-04-17T00:00:00Z",
});

const baseAllocation = (): Allocation => ({
  date: "2026-09-05",
  pitchGroup: "Mini",
  assignments: [
    { session: "Early", pitch: "Pitch 1", fixture: mkFixture("a") },
    { session: "Early", pitch: "Pitch 2", fixture: mkFixture("b") },
    { session: "Early", pitch: "Pitch 3", fixture: mkFixture("c") },
    { session: "Late", pitch: "Pitch 1", fixture: mkFixture("d") },
  ],
  unassigned: [mkFixture("e")],
  partialClash: false,
});

describe("applyOverrides", () => {
  it("returns the same allocation when there are no overrides", () => {
    const alloc = baseAllocation();
    const out = applyOverrides(alloc, group, {});
    expect(out.assignments.map((a) => a.fixture.id)).toEqual(["a", "b", "c", "d"]);
    expect(out.unassigned.map((f) => f.id)).toEqual(["e"]);
    expect(out.partialClash).toBe(false);
  });

  it("moves a fixture to a different pitch", () => {
    const overrides: AllocationOverrides = {
      a: { slot: { session: "Late", pitch: "Pitch 2" } },
    };
    const out = applyOverrides(baseAllocation(), group, overrides);
    const aSlot = out.assignments.find((x) => x.fixture.id === "a");
    expect(aSlot).toEqual({
      session: "Late",
      pitch: "Pitch 2",
      fixture: expect.objectContaining({ id: "a" }),
    });
    // Original slot (Early / Pitch 1) is now empty
    expect(
      out.assignments.some(
        (x) => x.session === "Early" && x.pitch === "Pitch 1",
      ),
    ).toBe(false);
  });

  it("moves an unassigned fixture onto a free pitch", () => {
    const overrides: AllocationOverrides = {
      e: { slot: { session: "Late", pitch: "Pitch 2" } },
    };
    const out = applyOverrides(baseAllocation(), group, overrides);
    expect(out.assignments.find((a) => a.fixture.id === "e")).toBeTruthy();
    expect(out.unassigned.map((f) => f.id)).toEqual([]);
  });

  it("moves a fixture to the bench", () => {
    const overrides: AllocationOverrides = { a: { slot: "unassigned" } };
    const out = applyOverrides(baseAllocation(), group, overrides);
    expect(out.assignments.some((x) => x.fixture.id === "a")).toBe(false);
    expect(out.unassigned.map((f) => f.id).sort()).toEqual(["a", "e"]);
  });

  it("displaces the original occupant to the bench on conflict", () => {
    const overrides: AllocationOverrides = {
      a: { slot: { session: "Early", pitch: "Pitch 2" } },
    };
    const out = applyOverrides(baseAllocation(), group, overrides);
    const occupant = out.assignments.find(
      (x) => x.session === "Early" && x.pitch === "Pitch 2",
    );
    expect(occupant?.fixture.id).toBe("a");
    expect(out.unassigned.map((f) => f.id).sort()).toEqual(["b", "e"]);
    expect(out.partialClash).toBe(true);
  });

  it("ignores overrides targeting unknown slots", () => {
    const overrides: AllocationOverrides = {
      a: { slot: { session: "Lunch", pitch: "Pitch 9" } },
    };
    const out = applyOverrides(baseAllocation(), group, overrides);
    expect(out.assignments.find((x) => x.fixture.id === "a")?.pitch).toBe("Pitch 1");
  });
});

describe("localStorage round-trip", () => {
  it("saves and loads overrides", () => {
    const storage = new MemoryStorage();
    saveOverrides({ x: { slot: "unassigned" } }, storage);
    expect(loadOverrides(storage)).toEqual({ x: { slot: "unassigned" } });
  });

  it("returns empty object on corrupt payload", () => {
    const storage = new MemoryStorage();
    storage.setItem("pitchAllocationOverrides", "{not json");
    expect(loadOverrides(storage)).toEqual({});
  });

  it("drops entries that fail schema check", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "pitchAllocationOverrides",
      JSON.stringify({
        good: { slot: "unassigned" },
        bad: { slot: { session: 1 } },
        alsoGood: { slot: { session: "Early", pitch: "Pitch 1" } },
      }),
    );
    expect(Object.keys(loadOverrides(storage)).sort()).toEqual(["alsoGood", "good"]);
  });

  it("clearOverrides removes the entry", () => {
    const storage = new MemoryStorage();
    saveOverrides({ x: { slot: "unassigned" } }, storage);
    clearOverrides(storage);
    expect(loadOverrides(storage)).toEqual({});
  });
});
