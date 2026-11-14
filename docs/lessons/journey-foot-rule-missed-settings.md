### journey-foot-rule-missed-settings

- **Date:** 2026-11-14
- **Kind:** review
- **Said:** "R7 over the home scroll state a journey hands on (any foot target such as `label=Settings`, a sheet's scrolls not resetting home's offset)."
- **Source:** hymnapp/batch-vb-45-findings.md o2 (its On base item 2)
- **Wrong:** Heartseed's journey rule R7 noticed only a journey whose last scroll went to `id=add-list` or `id=limit`; eighteen shipped journeys scrolled home to `Settings` or `Add a list`, then opened a sheet, scrolled in it or left home, and ended with home still at its foot, which the next journey's `open` keeps.
- **Cause:** The rule matched the last scroll's target string against two selectors, so a scroll to another node under the lists, another spelling of one, or a later scroll inside a sheet hid the foot scroll that left home down.
- **Guard:** code: `apps/heartseed/scripts/journeys.test.ts` `R7 names the last foot scroll that no scroll up to Your field or relaunch follows, over generated journeys reaching every foot target`; code: `apps/heartseed/scripts/journeys.test.ts` `each rule names its mutant of the first journey`
