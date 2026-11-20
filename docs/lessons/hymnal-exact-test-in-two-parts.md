### hymnal-exact-test-in-two-parts

- **Date:** 2026-11-20
- **Kind:** review
- **Said:** "apps/hymnal-exact/package.json's test:app and test:web both run cache.test.ts and stall.test.ts (run twice; test:budget refuses the app)."
- **Source:** hymnapp/guards-2/round-1-findings.md B1
- **Wrong:** `test:app` ran `./src` less four of `src/web`'s test files by name, so the two `src/web` tests added after it ran in `test:app` and in `test:web`: the gate ran them twice and `bun run test:budget @manna/hymnal-exact` refused to measure the app.
- **Cause:** A part that takes a folder less the files of another part's folder named one by one misses each file added there later; the check that no file is in two parts (`test:budget`, `reach.slow.test.ts`) runs outside the gate. `test:app` now gives back `src/web` whole, and a unit test the gate runs holds each test file of the app to exactly one part.
- **Guard:** code: `apps/hymnal-exact/src/parts.test.ts` `take each test file of the app exactly once`
