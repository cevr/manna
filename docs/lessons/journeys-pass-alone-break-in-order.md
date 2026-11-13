### journeys-pass-alone-break-in-order

- **Date:** 2026-11-13
- **Kind:** review
- **Said:** "journeys pass alone but break the next one in their feature file's documented order."
- **Source:** hymnapp/hsjourneys/round-2-findings.md M1; hymnapp/batch-vb-43-findings.md; hymnapp/hsaddlist/round-2-findings.md
- **Wrong:** `today-short` was red after `sayit-lines`, `handbook-remove` after `handbook-limit`, `passage-keep` after `passage-limit` and `home-relaunch` after `home-dot`, and the hymnal's `hymn-list` after a `chords-and-capo` that left Topics and chords stored; each journey passed when run alone, and only a verifier driving by hand saw it.
- **Cause:** A journey was checked alone from the state its author had in mind, and nothing played a feature file's journeys in the order it gives, so a journey that leaves the app elsewhere, or one that assumes a start an earlier journey changes, went unseen. `sim journeys <file>.md` now plays each `**Journeys in order:**` list of a feature file in one app session from its start (a fresh install, or a relaunch with the stored settings it names written first), with no shot or video, and names each failed journey's first failed step and the journey before it.
- **Guard:** code: `packages/sim/src/journeys.test.ts` `refuses a list it cannot read, naming its line, before any step`; code: `packages/sim/src/journeys.test.ts` `plays each list from its start in order, every journey, naming the failed step and the journey before it, with no shot or video`; code: `packages/sim/src/journeys.test.ts` `sim journey --no-shots keeps each snapshot alone and takes no video`
