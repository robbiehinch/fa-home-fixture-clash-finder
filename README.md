# FA Home Fixture Clash Finder

Find booking clashes and draft pitch allocations for a youth football club's home games, scraped from [The FA Full-Time](https://fulltime.thefa.com/).

Runs as a free [GitHub Pages](https://pages.github.com/) static site. A scheduled GitHub Actions workflow keeps the fixture data fresh — no server, no hosting cost.

## The problem it solves

Youth clubs often share a limited number of pitches across time-slots. Baldock Town Youth's U7–U10 teams, for example, share **3 pitches across 2 Saturday morning sessions** — 6 home-game slots total. If the league's fixture scheduler allocates more than 6 home games on the same Saturday, something has to move. Spotting these clashes by hand on the FA fixtures page is tedious.

This tool does it automatically, and produces a draft pitch allocation for the dates that do fit.

## Defaults

Out of the box the app is configured for **Baldock Town Youth** (FA club ID `175732888`), with a single pitch-group covering **U7–U10** across **3 pitches** and **2 Saturday sessions** (09:00–10:30 and 10:45–12:15).

Club, age groups, pitches, and session times are **not hard-coded** — they live in `config/default.json` and can be overridden in the UI (persisted to `localStorage`).

## Status

Initial scaffolding only. Implementation is tracked in [the issue list](../../issues). See `CLAUDE.md` for architecture notes.

## Licence

MIT.
