# Exact Lab

The Effect probe of `@manna/exact-kit` (bundle id `app.manna.exactlab`): one button per probe row, each running one Effect program with Effect's defaults or through `@manna/exact-kit/effect`'s runner, and its outcome beside it. It is the check `ex-pin` runs after each move of the pin. The decision it proves: `docs/exact-data-layer.md` at the repo root.

The folder is named `heartseed-exact` because the wrapper (`packages/exact-kit/src/run.ts`) runs only the apps it knows by folder: the lab drives Heartseed's simulator, `verify-heartseed-exact`, and its spare web port 8774.

Run every Exact command as `bun run exact <verb>` from `packages/exact-kit` (or `bun exact.mjs <verb>` here): `bun run exact test web --port 8774`, and under the build lock `lockf -k /tmp/manna-ios-build.lock bun run exact test ios`. Never publish or send feedback.

`probe-table.json` is the expected outcome of each row; `app.test.contract` is written from it, and `packages/exact-kit/src/effect/probe.test.ts` holds both to the rows Bun runs.
