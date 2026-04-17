const DEFAULT_AGE_REGEX = /\bU(\d{1,2})\b/i;

export function extractAgeGroup(
  teamName: string,
  pattern: RegExp = DEFAULT_AGE_REGEX,
): string | null {
  const match = pattern.exec(teamName);
  if (!match || match[1] === undefined) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1 || n > 99) return null;
  return `U${n}`;
}
