### import-guard-matched-one-specifier

- **Date:** 2026-11-22
- **Kind:** review
- **Said:** "`src/abouthymn/no-meaning.test.ts:17` matches only the exact specifier. Adding `import '../../../hymnal/src/hymns/meaning.ts'` to `about.ts` leaves all 10 `src/abouthymn` tests green."
- **Source:** hymnapp/par-hy-w1fix/round-1-findings.md T1
- **Wrong:** The guards that keep the 13 MB meaning table out of the hymnal port's data module compared each import's text with one spelling of the table's module, so a relative path, a re-export or a dynamic import of the same file passed them; the search's guard had the same hole for its prepare step.
- **Cause:** Not recorded.
- **Guard:** code: `apps/hymnal-exact/src/abouthymn/no-meaning.test.ts` `no module app.ts reaches is the table, About among them`; code: `apps/hymnal-exact/src/results/table.test.ts` `only the build’s prepare step names the table’s files, and app.ts reaches neither that step nor the table’s module`
