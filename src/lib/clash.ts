import type { AppConfig, Clash, Fixture, PitchGroup } from "./types.js";

function capacityOf(group: PitchGroup): number {
  return group.sessions.length * group.pitches.length;
}

function fixturesForGroup(
  fixtures: Fixture[],
  group: PitchGroup,
): Fixture[] {
  const groupAges = new Set(group.ageGroups.map((a) => a.toUpperCase()));
  return fixtures.filter(
    (f) =>
      f.isHome &&
      f.status === "scheduled" &&
      f.ageGroup !== null &&
      groupAges.has(f.ageGroup.toUpperCase()),
  );
}

export function detectClashes(
  fixtures: Fixture[],
  config: AppConfig,
): Clash[] {
  const clashes: Clash[] = [];
  for (const group of config.pitchGroups) {
    const capacity = capacityOf(group);
    const byDate = new Map<string, Fixture[]>();
    for (const fixture of fixturesForGroup(fixtures, group)) {
      const bucket = byDate.get(fixture.date);
      if (bucket) bucket.push(fixture);
      else byDate.set(fixture.date, [fixture]);
    }
    for (const [date, dateFixtures] of byDate) {
      if (dateFixtures.length > capacity) {
        clashes.push({
          date,
          pitchGroup: group.name,
          capacity,
          count: dateFixtures.length,
          fixtures: [...dateFixtures].sort((a, b) =>
            a.kickoff.localeCompare(b.kickoff),
          ),
        });
      }
    }
  }
  return clashes.sort(
    (a, b) => a.date.localeCompare(b.date) || a.pitchGroup.localeCompare(b.pitchGroup),
  );
}
