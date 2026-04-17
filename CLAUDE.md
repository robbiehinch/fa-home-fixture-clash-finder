# fa-home-fixture-clash-finder

Helper notes for future Claude Code sessions working on this repo. Keep this file focused on things that aren't obvious from reading the code.

## What this project does

Scrapes youth football fixtures from the FA Full-Time site (`fulltime.thefa.com`) for a configured club, filters to **home** games, and for each matchday:

- Flags a **clash** when home fixtures for a pitch-group exceed `sessions × pitches` capacity.
- When fixtures fit, produces a **draft pitch allocation** (which match plays on which pitch in which session).

Default example: Baldock Town Youth (club ID `175732888`), U7–U10 mini-soccer, 3 pitches × 2 Saturday morning sessions = 6 slots.

## Architecture

- **Scraper** (`src/scraper/`) — Node.js + TypeScript + `cheerio`. Writes `public/data/fixtures.json`.
- **Shared library** (`src/lib/`) — config, age-group extraction, clash detection, pitch allocation. Imported by both the scraper and the browser bundle.
- **Static site** (`public/` + `src/web/`) — plain HTML/CSS + a single `app.js` built by esbuild. Reads `public/data/fixtures.json`. Has a "Refresh now" button that re-scrapes live via a public CORS proxy.
- **GitHub Actions**:
  - `scrape.yml` — hourly cron, runs the scraper, commits the JSON if changed.
  - `pages.yml` — builds the esbuild bundle and deploys `public/` to GitHub Pages.
  - `ci.yml` — typecheck + tests on PRs.

No backend server. No hosting cost. GitHub Pages serves static files; GitHub Actions keeps the data fresh.

## Key files

- `config/default.json` — default club, season, pitch groups, sessions, pitches. This is the single source of truth for defaults. The UI lets users override in `localStorage`.
- `src/scraper/parse.ts` — **must be isomorphic** (runs under Node and in the browser). Do not import Node built-ins here. `cheerio` works in both environments.
- `src/lib/types.ts` — `Fixture`, `PitchGroup`, `Session`, `Clash`, `Allocation`.
- `tests/fixtures/sample.html` — recorded FA page used for deterministic parser tests. Re-record it if the FA site's markup changes.

## Running locally

```
npm install
npm run scrape        # writes public/data/fixtures.json
npm run build         # esbuild bundles src/web -> public/app.js
npm test              # vitest, runs parser tests against tests/fixtures/sample.html
npx serve public      # open http://localhost:3000
```

## Gotchas

- The FA site sometimes returns 503 for bots. The scraper sets a browser-like `User-Agent` and retries with backoff. Don't remove the retry or the UA.
- Team names vary — age group is extracted with `/\bU(\d{1,2})\b/i` against the home team name. If a club uses a different naming scheme, `config.homeTeamPattern` can override.
- Home/away is inferred by matching the configured club name against `homeTeam` (case-insensitive, tolerant of suffixes like "U9 Red"). Don't rely on the FA HTML exposing a boolean — it doesn't.
- `public/app.js` is a build artifact — it's in `.gitignore` and must be rebuilt via `npm run build`. The Pages workflow does this automatically on deploy.
- The scheduled scrape workflow uses the default `GITHUB_TOKEN` with `contents: write` permission to commit the updated JSON. It only commits if the file actually changed.
- CORS proxies (for the in-browser "Refresh now" button) are third-party and flaky. Try multiple in sequence; fall back to the committed JSON on total failure.

## Scope discipline

- Don't hard-code the club, age groups, or pitch setup anywhere outside `config/default.json`.
- Default config must match the Baldock Town Youth U7–U10 example. Any other setup is expected to work purely via config.
- Keep the site free of frameworks and build tooling beyond `esbuild` — part of the value is that the whole thing is trivial to host, fork, and understand.
