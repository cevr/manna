### journey-foot-read-from-source

- **Date:** 2026-11-15
- **Kind:** review
- **Said:** "A spread attribute, props forwarded by spread or rest, and a node after `<Furrows>` inside its wrapper are neither read nor listed."
- **Source:** hymnapp/hsr7/round-3-findings.md M1
- **Wrong:** R7's foot was derived by parsing `src/field/screen.tsx`, and each round a JSX form the parser did not know (text children, `.map`, local consts, then spreads, rest props, a sibling inside the furrows' wrapper) left a node under the lists out of the foot with every test green.
- **Cause:** The foot was read from the source, whose spellings are open-ended, instead of from what the screen draws, which holds every node whatever spelled it.
- **Guard:** code: `apps/heartseed/src/field/foot.test.tsx` `reads each form a node under the furrows takes: a sibling in their wrapper, a spread, props passed on or by rest, a fallback, a branch, a match, children, a later return, a renamed prop, a filtered map, a const, a number, nesting, a package component; nothing above them, under the first row or outside the scroll view`; code: `apps/heartseed/src/field/foot.test.tsx` `is every id and label drawn after the furrows, in each state, as written out by hand`
