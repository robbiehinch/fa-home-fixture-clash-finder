import { describe, it, expect } from "vitest";
import { extractAgeGroup } from "../src/lib/ageGroup.js";

describe("extractAgeGroup", () => {
  it.each([
    ["Baldock Town Youth U9 Red", "U9"],
    ["BALDOCK TOWN YOUTH U10", "U10"],
    ["Baldock u7 Tigers", "U7"],
    ["Hitchin Town U18 Dev", "U18"],
  ])("extracts %s -> %s", (input, expected) => {
    expect(extractAgeGroup(input)).toBe(expected);
  });

  it.each([
    ["Under 8 Hitchin", "U8"],
    ["Under 10 Damson", "U10"],
    ["U11 Cherry", "U11"],
  ])("also matches 'Under N' competition-style %s -> %s", (input, expected) => {
    expect(extractAgeGroup(input)).toBe(expected);
  });

  it.each([
    "Baldock Town Youth",
    "Cambridge Blues",
    "",
  ])("returns null for %s", (input) => {
    expect(extractAgeGroup(input)).toBeNull();
  });

  it("supports custom regex override", () => {
    expect(extractAgeGroup("Hitchin Under-8", /under[- ](\d{1,2})/i)).toBe("U8");
  });
});
