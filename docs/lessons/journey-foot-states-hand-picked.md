### journey-foot-states-hand-picked

- **Date:** 2026-11-15
- **Kind:** review
- **Said:** "All four rendered states use two furrows; home after the first minute has one furrow with the tips, so tip 2 sits below the last list row, missing from HOME_FOOT, and R7 gives [] for a journey ending on a scroll to it."
- **Source:** hymnapp/hsr7/round-4-findings.md M1
- **Wrong:** Home's foot was rendered in four hand-picked states, each with two furrows, so tip 2, which home draws under its first furrow and so below the lists when it holds one, was in no rendered foot nor in `HOME_FOOT`, and a journey that ended on a scroll to it left home at its foot with no fault.
- **Cause:** The states were chosen by hand around what the foot was thought to change with, and the furrow count, which moves the boundary itself, was held fixed.
- **Guard:** code: `apps/heartseed/src/field/foot.test.tsx` `is every id and label drawn after the furrows, in each home state within the foot written out by hand, and all of it over every state; none with no furrow`
