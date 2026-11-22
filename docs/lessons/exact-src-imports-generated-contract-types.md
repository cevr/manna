### exact-src-imports-generated-contract-types

- **Date:** 2026-11-22
- **Kind:** review
- **Said:** "`src/results/sources.ts:10` imports the git-ignored, generated `../../app.contract.d.ts`. Without it, `tsc -p tsconfig.src.json` fails with TS2307 on that line only, so typecheck breaks in a tree where Exact has not run."
- **Source:** hymnapp/par-hy-results/round-1-findings.md R1
- **Wrong:** The search's source typed its `store` and `storage` arguments by the declarations Exact writes at each build, which no commit holds, so the hymnal port's typecheck failed in a fresh checkout.
- **Cause:** Not recorded.
- **Guard:** code: `apps/hymnal-exact/src/no-generated-types.test.ts` `no file under src/ imports the generated contract declarations`
