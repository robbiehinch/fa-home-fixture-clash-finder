import { describe, it, expect } from "vitest";
import {
  assertAppConfig,
  getConfig,
  loadDefaultConfig,
  resetConfigOverrides,
  saveConfigOverrides,
} from "../src/lib/config.js";

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

describe("default config", () => {
  it("matches the Baldock Town Youth example", () => {
    const cfg = loadDefaultConfig();
    expect(cfg.club).toEqual({ id: "175732888", name: "Baldock Town Youth" });
    expect(cfg.season).toBe("17031412");
    expect(cfg.pitchGroups).toHaveLength(1);
    const group = cfg.pitchGroups[0]!;
    expect(group.ageGroups).toEqual(["U7", "U8", "U9", "U10"]);
    expect(group.pitches).toHaveLength(3);
    expect(group.sessions).toHaveLength(2);
  });
});

describe("assertAppConfig", () => {
  it("rejects missing club", () => {
    expect(() => assertAppConfig({})).toThrow();
  });
  it("rejects bad pitchGroups", () => {
    expect(() =>
      assertAppConfig({
        club: { id: "1", name: "x" },
        season: "s",
        pitchGroups: [{ name: 1 }],
        dateRange: { from: "today", to: "lastFixture", includePast: false },
      }),
    ).toThrow();
  });
});

describe("getConfig overrides", () => {
  it("returns default when no overrides", () => {
    const storage = new MemoryStorage();
    const cfg = getConfig(storage);
    expect(cfg.club.name).toBe("Baldock Town Youth");
  });

  it("merges shallow overrides", () => {
    const storage = new MemoryStorage();
    saveConfigOverrides({ club: { id: "999", name: "Other FC" } }, storage);
    const cfg = getConfig(storage);
    expect(cfg.club.name).toBe("Other FC");
    expect(cfg.season).toBe("17031412");
  });

  it("ignores corrupt overrides", () => {
    const storage = new MemoryStorage();
    storage.setItem("appConfigOverrides", "{not json");
    expect(() => getConfig(storage)).not.toThrow();
    expect(getConfig(storage).club.name).toBe("Baldock Town Youth");
  });

  it("resetConfigOverrides restores default", () => {
    const storage = new MemoryStorage();
    saveConfigOverrides({ season: "different" }, storage);
    expect(getConfig(storage).season).toBe("different");
    resetConfigOverrides(storage);
    expect(getConfig(storage).season).toBe("17031412");
  });
});
