### seed-from-clock-followed-flow-not-positions

- **Date:** 2026-11-13
- **Kind:** review
- **Said:** "a seed bound with a default value from the clock is not reported."
- **Source:** hymnapp/seedfix/round-3-findings.md M1; hymnapp/seedfix/round-3-findings.md M2
- **Wrong:** `manna/seed-from-clock` passed `function draw(seed = Date.now())`, `(seed = Math.random()) =>`, `const { seed = performance.now() } = options`, `const { seed: s = Date.now() } = options` and `constructor(readonly seed = Date.now())`, and reported `startTimes.get(seed) ?? performance.now()` and `table[seed] ?? Date.now()` beside a constant seed.
- **Cause:** Three rounds followed a clock read's value through a growing set of nodes, each round adding forms the last missed and losing others, and none stated which bindings hold a seed or which positions make its value; a call's argument made a seed read of `map.get(seed)`, and a parameter's default was no holder. The rule now checks a fixed set: the seed bindings (a variable, a parameter, a parameter property, a destructured property or element, an object key, a class field, an assignment's target, each named seed) and the result positions of their values, and a fallback only of a read of a seed itself, never a value keyed by one.
- **Guard:** code: `packages/scripts/lint/seed-from-clock.test.ts` `property: a clock or random source in a result position of a seed binding is reported, for every binding kind, result position and source`; code: `packages/scripts/lint/seed-from-clock.test.ts` `property: the same values held by a name not a seed, or a source out of a result position under a seed name, are never reported`; code: `packages/scripts/lint/seed-from-clock.test.ts` `each of vb-46's probes is reported as the contract says`
