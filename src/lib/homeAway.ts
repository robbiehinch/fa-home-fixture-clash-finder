import type { AppConfig } from "./types.js";

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bu\d{1,2}\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHomeFixture(homeTeam: string, config: AppConfig): boolean {
  if (config.homeTeamPattern) {
    return new RegExp(config.homeTeamPattern, "i").test(homeTeam);
  }
  const club = normalise(config.club.name);
  if (!club) return false;
  const home = normalise(homeTeam);
  if (home === club) return true;
  const clubWords = club.split(" ").filter(Boolean);
  const homeWords = home.split(" ").filter(Boolean);
  if (clubWords.length === 0) return false;
  for (let i = 0; i <= homeWords.length - clubWords.length; i++) {
    let match = true;
    for (let j = 0; j < clubWords.length; j++) {
      if (homeWords[i + j] !== clubWords[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}
