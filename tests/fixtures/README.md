# Recorded fixture samples

`sample.html` is a captured response from
`https://fulltime.thefa.com/fixtures.html?selectedSeason=17031412&selectedClub=175732888&...&itemsPerPage=25`
(the Baldock Town Youth fixtures list for season 2025-26).

It exists so the parser tests are deterministic. Re-record whenever the
FA site's markup changes.

## Re-recording

```bash
curl -L \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" \
  "https://fulltime.thefa.com/fixtures.html?selectedSeason=17031412&selectedFixtureGroupAgeGroup=0&selectedFixtureGroupKey=&selectedDateCode=all&selectedClub=175732888&selectedTeam=&selectedRelatedFixtureOption=3&selectedFixtureDateStatus=&selectedFixtureStatus=&previousSelectedFixtureGroupAgeGroup=0&previousSelectedFixtureGroupKey=&previousSelectedClub=175732888&itemsPerPage=100" \
  -o tests/fixtures/sample.html
```

Then update fixture counts in `tests/parse.test.ts` if they changed.
