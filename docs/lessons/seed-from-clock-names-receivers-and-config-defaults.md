### seed-from-clock-names-receivers-and-config-defaults

- **Date:** 2026-11-13
- **Kind:** review
- **Said:** "a name whose word seed sits beside an acronym or a digit is not read as a seed."
- **Source:** hymnapp/seedfix/round-4-findings.md M1; hymnapp/seedfix/round-4-findings.md M2; hymnapp/seedfix/round-4-findings.md M3
- **Wrong:** `manna/seed-from-clock` passed `const RNGSeed = Date.now()`, `const seed1 = Date.now()`, `const SEED2 = Date.now()` and `Config.Int('TEST_BUDGET_SEED').pipe(Config.withDefault(Date.now()))`, and reported `seedTimings.get(k) ?? performance.now()`, `seeds.length || Date.now()` and `seedRows.at ?? Date.now()`.
- **Cause:** The name split broke words only at a lower-to-upper change, never after an acronym or at a digit; a member of an object named for a seed, and any method called on one, counted as reading the seed; and a config's default was no result position. The property drew six fixed names, used only `seed` itself beside a clock, and never gave a config a default.
- **Guard:** code: `packages/scripts/lint/seed-from-clock.test.ts` `property: every name holding the word seed or seeds, in any casing and beside any prefix or suffix, names a seed binding, and the same affixes on heartseed, seeded or seedless do not`; code: `packages/scripts/lint/seed-from-clock.test.ts` `property: a clock or random default given to a seed's config is reported however the default is given and held, and the same default of a config not a seed's is not`; code: `packages/scripts/lint/seed-from-clock.test.ts` `each of vb-48's probes is reported as the contract says`
