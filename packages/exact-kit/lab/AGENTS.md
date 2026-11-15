# Exact Lab

The Effect probe of `@manna/exact-kit` (bundle id `app.manna.exactlab`): one button per probe row, each running one Effect program with Effect's defaults or through `@manna/exact-kit/effect`'s runner, and its outcome beside it. It is the check `ex-pin` runs after each move of the pin. The decision it proves: `docs/exact-data-layer.md` at the repo root.

The wrapper (`packages/exact-kit/src/run.ts`) runs it as the app `lab`: it drives Heartseed's simulator, `verify-heartseed-exact`, under the build lock, serves on port 8774 and no other, and is quiet, so `ios --run` and `mac --run` are refused (use `agent ios`).

Run every Exact command as `bun run exact <verb>` from this folder (or from `packages/exact-kit`): `bun run exact test web` and `bun run exact test ios`. Never publish or send feedback.

`probe-table.json` is the expected outcome of each row; `app.test.contract` is written from it, and `packages/exact-kit/src/effect/probe.test.ts` holds both to the rows Bun runs.
