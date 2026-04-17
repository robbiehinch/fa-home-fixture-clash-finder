import type {
  Allocation,
  AppConfig,
  Assignment,
  Fixture,
  PitchGroup,
  Session,
} from "./types.js";

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  return (h ?? 0) * 60 + (m ?? 0);
};

const fixtureInSession = (fixture: Fixture, session: Session): boolean => {
  const ko = toMinutes(fixture.kickoff);
  return ko >= toMinutes(session.start) && ko <= toMinutes(session.end);
};

const ageValue = (ageGroup: string | null): number => {
  if (!ageGroup) return 0;
  const match = /^U(\d+)$/i.exec(ageGroup);
  return match && match[1] ? Number(match[1]) : 0;
};

const compareFixtures = (a: Fixture, b: Fixture): number => {
  const ko = a.kickoff.localeCompare(b.kickoff);
  if (ko !== 0) return ko;
  const age = ageValue(b.ageGroup) - ageValue(a.ageGroup);
  if (age !== 0) return age;
  return a.id.localeCompare(b.id);
};

function fixturesForGroup(fixtures: Fixture[], group: PitchGroup): Fixture[] {
  const groupAges = new Set(group.ageGroups.map((a) => a.toUpperCase()));
  return fixtures.filter(
    (f) =>
      f.isHome &&
      f.status === "scheduled" &&
      f.ageGroup !== null &&
      groupAges.has(f.ageGroup.toUpperCase()),
  );
}

function allocateGroupDate(
  fixtures: Fixture[],
  group: PitchGroup,
  date: string,
): Allocation {
  const assignments: Assignment[] = [];
  const unassigned: Fixture[] = [];
  let partialClash = false;

  const outsideAnySession: Fixture[] = [];
  const bySession = new Map<string, Fixture[]>();
  for (const session of group.sessions) bySession.set(session.name, []);

  for (const fixture of fixtures) {
    const session = group.sessions.find((s) => fixtureInSession(fixture, s));
    if (!session) {
      outsideAnySession.push(fixture);
      continue;
    }
    bySession.get(session.name)!.push(fixture);
  }

  for (const session of group.sessions) {
    const bucket = (bySession.get(session.name) ?? []).sort(compareFixtures);
    const capacity = group.pitches.length;
    const fits = bucket.slice(0, capacity);
    const overflow = bucket.slice(capacity);
    fits.forEach((fixture, idx) => {
      assignments.push({
        session: session.name,
        pitch: group.pitches[idx]!,
        fixture,
      });
    });
    if (overflow.length > 0) {
      partialClash = true;
      unassigned.push(...overflow);
    }
  }

  unassigned.push(...outsideAnySession);

  return {
    date,
    pitchGroup: group.name,
    assignments,
    unassigned,
    partialClash,
  };
}

export function allocate(
  fixtures: Fixture[],
  config: AppConfig,
): Allocation[] {
  const out: Allocation[] = [];
  for (const group of config.pitchGroups) {
    const capacity = group.sessions.length * group.pitches.length;
    const byDate = new Map<string, Fixture[]>();
    for (const fixture of fixturesForGroup(fixtures, group)) {
      const bucket = byDate.get(fixture.date);
      if (bucket) bucket.push(fixture);
      else byDate.set(fixture.date, [fixture]);
    }
    for (const [date, dateFixtures] of byDate) {
      if (dateFixtures.length > capacity) continue; // hard clash — skip
      out.push(allocateGroupDate(dateFixtures, group, date));
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.pitchGroup.localeCompare(b.pitchGroup),
  );
}
