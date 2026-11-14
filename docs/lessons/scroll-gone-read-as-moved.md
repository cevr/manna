### scroll-gone-read-as-moved

- **Date:** 2026-11-13
- **Kind:** review
- **Said:** "`moved: true` in `packages/sim/src/screen.ts:334-341` means both \"content moved\" and \"the view is gone\", e.g. a sheet the pan closed."
- **Source:** hymnapp/batch-vb-40-findings.md o1 (On base, its first item, which carries no id of its own)
- **Wrong:** A `sim scroll` whose pan closed the sheet it panned answered `detail.moved: true`, as a scroll that moved the sheet's content does, so a journey that expected the sheet to stay could not tell, and failed later as a missing target.
- **Cause:** The scroll's judge was one boolean: true for content found elsewhere and true for a view no longer found. It is now a tagged `Motion` (`Moved`, `Unmoved`, `Gone`) that each caller matches; `detail.motion` prints it, and a journey's scroll whose view is gone fails a `shows` expect that does not show as `ScrollGone`.
- **Guard:** code: `packages/sim/src/screen.test.ts` `a sheet the pan closed is gone, never moved, though the page it covered still shows`; code: `packages/sim/src/journey.test.ts` `a scroll that lost its sheet fails a shows expect as ScrollGone; a moved one as TargetMissing; a hides still passes`
