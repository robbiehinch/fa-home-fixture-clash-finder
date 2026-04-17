import { describe, it, expect, vi } from "vitest";
import { fetchFixturesPage, buildFixturesUrl } from "../src/scraper/fetch.js";
import type { AppConfig } from "../src/lib/types.js";

const config: AppConfig = {
  club: { id: "175732888", name: "Baldock Town Youth" },
  season: "17031412",
  pitchGroups: [],
  dateRange: { from: "today", to: "lastFixture", includePast: false },
};

const mkResponse = (status: number, body = "<html></html>"): Response =>
  new Response(body, { status });

describe("buildFixturesUrl", () => {
  it("includes club id and season", () => {
    const url = buildFixturesUrl(config);
    expect(url).toContain("selectedSeason=17031412");
    expect(url).toContain("selectedClub=175732888");
    expect(url).toContain("selectedRelatedFixtureOption=3");
    expect(url).toContain("itemsPerPage=250");
  });
});

describe("fetchFixturesPage", () => {
  it("returns HTML on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mkResponse(200, "<html>ok</html>"));
    const html = await fetchFixturesPage(config, { fetchImpl, sleep: vi.fn() });
    expect(html).toBe("<html>ok</html>");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mkResponse(503))
      .mockResolvedValueOnce(mkResponse(503))
      .mockResolvedValueOnce(mkResponse(200, "<html>recovered</html>"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const html = await fetchFixturesPage(config, { fetchImpl, sleep });
    expect(html).toBe("<html>recovered</html>");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 4000);
  });

  it("throws after max attempts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mkResponse(503));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchFixturesPage(config, { fetchImpl, sleep })).rejects.toThrow(
      /failed after 4 attempts/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("uses a browser User-Agent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mkResponse(200));
    await fetchFixturesPage(config, { fetchImpl, sleep: vi.fn() });
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/Chrome/);
  });
});
