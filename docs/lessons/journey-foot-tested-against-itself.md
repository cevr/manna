### journey-foot-tested-against-itself

- **Date:** 2026-11-15
- **Kind:** review
- **Said:** "The per-target test and the generated property draw their targets from `footOf` itself, so a node the derivation drops drops out of the oracle too."
- **Source:** hymnapp/hsr7/round-2-findings.md M1
- **Wrong:** With text children not read, `.map` not walked, re-exports not followed or `aria-label` not a label, `footOf` dropped `Mark 4:28` or the stage names and every test stayed green; a node under the lists held in a local const of `FieldScreen` was left out of the foot without a word.
- **Cause:** The derived foot was the only oracle of itself, beside a short known list, and the derivation skipped what it could not evaluate instead of naming it.
- **Guard:** code: `apps/heartseed/src/field/foot.test.tsx` `is every id and label drawn after the furrows, in each home state within the foot written out by hand, and all of it over every state; none with no furrow`; code: `apps/heartseed/src/field/foot.test.tsx` `reads each form a node under the furrows takes: a sibling in their wrapper, a spread, props passed on or by rest, a fallback, a branch, a match, children, a later return, a renamed prop, a filtered map, a const, a number, nesting, a package component; nothing above them, under the first row or outside the scroll view`
