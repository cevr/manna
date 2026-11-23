### contract-test-reads-live-host

- **Date:** 2026-11-18
- **Kind:** review
- **Said:** "goto.test.contract \"Words typed in Go to before the word pack is down…\" is red on the web and on iOS at `0bd755a80`, at `25a89e6c2` and at `67d9f036f`. … On the web, the test reads egw.cvr.im live."
- **Source:** hymnapp/batch-vb-85-findings.md o1 (On base, its first item)
- **Wrong:** heartseed-exact's contract tests launched with egw.cvr.im's network open, so a test of the app before its word pack had landed read the live server: it held while the server had no pack to give and went red, with no commit to the app, once the packs were published (iOS) and once the web build could read them across origins (the web).
- **Cause:** Only the study tests refused egw.cvr.im (`fail fetch`, each test its own line); every other test file, Go to's among them, left it open, and nothing held a new file to refuse it.
- **Guard:** code: `apps/heartseed-exact/src/packs/live.test.ts` `%s never reaches egw.cvr.im`; code: `apps/heartseed-exact/src/packs/live.test.ts` `refuses a test with no leading refusal of egw.cvr.im, one that passes a fetch there again, or counts its refusal, however the text spaces or escapes it`
