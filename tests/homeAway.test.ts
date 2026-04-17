import { describe, it, expect } from "vitest";
import { isHomeFixture } from "../src/lib/homeAway.js";
import type { AppConfig } from "../src/lib/types.js";

const baldock: AppConfig = {
  club: { id: "175732888", name: "Baldock Town Youth" },
  season: "17031412",
  pitchGroups: [],
  dateRange: { from: "today", to: "lastFixture", includePast: false },
};

describe("isHomeFixture", () => {
  it("matches club name exactly", () => {
    expect(isHomeFixture("Baldock Town Youth", baldock)).toBe(true);
  });

  it("matches with age-group suffix", () => {
    expect(isHomeFixture("Baldock Town Youth U9 Red", baldock)).toBe(true);
    expect(isHomeFixture("BALDOCK TOWN YOUTH U10 Lions", baldock)).toBe(true);
  });

  it("does not match a different club that shares a word", () => {
    expect(isHomeFixture("Baldock Strollers U9", baldock)).toBe(false);
    expect(isHomeFixture("Hitchin Town Youth U9", baldock)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isHomeFixture("baldock town youth u7 blue", baldock)).toBe(true);
  });

  it("honours homeTeamPattern override", () => {
    const config: AppConfig = { ...baldock, homeTeamPattern: "^BTY\\b" };
    expect(isHomeFixture("BTY U9 Red", config)).toBe(true);
    expect(isHomeFixture("Baldock Town Youth U9", config)).toBe(false);
  });
});
