# Heartseed on Exact

Heartseed ported to Exact, beside the current app (`apps/heartseed`) until it replaces it. Read `docs/exact.md` at the repo root first, then Exact's own guide, `docs/start-here.md` in the Exact clone (`~/Developer/vendor/exact`, or the clone `EXACT` names).

`app.contract` is the view, `app.ts` the data module, `app.test.contract` the tests, `app.json` the manifest. A feature keeps its view in `features/<name>.contract`, its logic in `src/<name>/**` and its tests in `<name>.test.contract` beside `app.contract` (Exact reads tests only there); the README says more.

Run every Exact command from this folder as `bun run exact <verb>` (`bun run exact help` lists them). It runs Exact at the pinned commit on this app's own simulator, `verify-heartseed-exact`, and refuses `share`, `deploy`, `release`, `update`, `snapback`, feedback sends, `--sim`, `--device`, a port not the app's, and an `exact.mjs` or `AGENTS.md` Exact rewrote. Never run Exact another way, and never publish or send feedback: those are the owner's. When Exact's docs say `bun exact.mjs <verb>`, write `bun run exact <verb>`.

Record friction in the unit's own findings file, not through Exact's feedback.
