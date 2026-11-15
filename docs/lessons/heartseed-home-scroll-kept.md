### heartseed-home-scroll-kept

- **Date:** 2026-11-14
- **Kind:** owner
- **Said:** "And it shouldn't reset the scroll position when you go back."
- **Source:** hymnapp/hsrows/spec.md (owner scrawl 1794699589304 #3)
- **Wrong:** Back on home from a list's page, Today or About, the field opened at the top, so a reader who scrolled down to a lower list lost it.
- **Cause:** The root swaps screens in place, so each way back mounts a new home scroll view at offset 0; nothing held the offset the reader left, and no test scrolled home before leaving it.
- **Guard:** code: `apps/heartseed/src/home/root.test.tsx` `brings home back at its scroll offset from Today, a list’s page and About, and opens a relaunch at the top`
