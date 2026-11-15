### journey-foot-tested-against-itself

- **Date:** 2026-11-15
- **Kind:** review
- **Said:** "The per-target test and the generated property draw their targets from `footOf` itself, so a node the derivation drops drops out of the oracle too."
- **Source:** hymnapp/hsr7/round-2-findings.md M1
- **Wrong:** With text children not read, `.map` not walked, re-exports not followed or `aria-label` not a label, `footOf` dropped `Mark 4:28` or the stage names and every test stayed green; a node under the lists held in a local const of `FieldScreen` was left out of the foot without a word.
- **Cause:** The derived foot was the only oracle of itself, beside a short known list, and the derivation skipped what it could not evaluate instead of naming it.
- **Guard:** code: `apps/heartseed/scripts/journeys.test.ts` `footOf reads today's foot as it is written out by hand, with nothing unread`; code: `apps/heartseed/scripts/journeys.test.ts` `footOf reads a screen of its own: a text child, a .map over a constant, a node held in a const, a component from another file through re-exports with its props, a template label, a condition`; code: `apps/heartseed/scripts/journeys.test.ts` `footOf names what it cannot read under the lists: a call, an unknown component, a name it cannot spell, an id it cannot evaluate; and a screen with no furrows`
