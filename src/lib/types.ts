export type FixtureStatus =
  | "scheduled"
  | "postponed"
  | "cancelled"
  | "played"
  | "unknown";

export type Fixture = {
  id: string;
  date: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  ageGroup: string | null;
  competition: string;
  venue: string | null;
  status: FixtureStatus;
  isHome: boolean;
  scrapedAt: string;
};

export type Session = {
  name: string;
  start: string;
  end: string;
};

export type PitchGroup = {
  name: string;
  ageGroups: string[];
  dayOfWeek: string;
  sessions: Session[];
  pitches: string[];
};

export type DateRange = {
  from: "today" | string;
  to: "lastFixture" | string;
  includePast: boolean;
};

export type AppConfig = {
  club: { id: string; name: string };
  season: string;
  pitchGroups: PitchGroup[];
  dateRange: DateRange;
  homeTeamPattern?: string;
};

export type Clash = {
  date: string;
  pitchGroup: string;
  capacity: number;
  count: number;
  fixtures: Fixture[];
};

export type Assignment = {
  session: string;
  pitch: string;
  fixture: Fixture;
};

export type Allocation = {
  date: string;
  pitchGroup: string;
  assignments: Assignment[];
  unassigned: Fixture[];
  partialClash: boolean;
};

export type FixturesDocument = {
  scrapedAt: string;
  config: { club: AppConfig["club"]; season: string };
  fixtures: Fixture[];
};

export type AllocationOverride =
  | { slot: "unassigned" }
  | { slot: { session: string; pitch: string } };

export type AllocationOverrides = Record<string, AllocationOverride>;
