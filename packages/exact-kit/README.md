# @manna/exact-kit

What the Exact ports (`apps/heartseed-exact`, `apps/hymnal-exact`) share. The install, the pin and the rules: `docs/exact.md`.

| Export                               | What                                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@manna/exact-kit/effect`            | `runCall(effect, { now, seed })` and `runCallSync`: an effect run for one Exact call, on the call's clock, seed and scheduler (`docs/exact-data-layer.md`)                                         |
| `@manna/exact-kit/main`              | `main(appDir, args)`: the wrapper every `bun run exact <verb>` goes through (each app's `exact.mjs` calls it), its refusal printed, its exit code the child's                                      |
| `@manna/exact-kit/prepare`           | `linkExactModules(appDir, names, clone)` and `writeGenerated(path, source)`: what an app's `tools/prepare.ts` does before every `bun run exact` (`docs/exact.md`)                                  |
| `@manna/exact-kit/drive`             | `makeDrive({ name, host, appDir })`: a drive's steps through `bun run exact agent`, its `PASS`/`FAIL` lines and exit code, every web run on one claimed port; it never signals a kept touch runner |
| `@manna/exact-kit/port`              | `claimAppPort(appDir)`, `claimPorts(range, count)` and `takePort(port)`: ports held for the run, shared by every checkout through Exact's own turns, freed when the process ends                   |
| `@manna/exact-kit/data-host/testing` | `withDataHost(run)`: `run` with the clock, timers, random and `Symbol.dispose` refused as Exact's data module refuses them                                                                         |
| `@manna/exact-kit/no-copy/testing`   | `noCopies(appDir, sources)` and `assertNoCopies(appDir, sourceDir)`: a port imports a current app's code, never copies it                                                                          |
| `manna-exact` (bin)                  | `main` for the app in the current folder                                                                                                                                                           |

`src/apps.ts` names the apps' simulators and ports. `src/run.ts` holds the rules: the pin, the build lock, the launcher every app's `exact.mjs` must be, and `runExact`, which refuses or runs one command. Each app's `bun run exact` is `manna-exact` (`src/bin.ts`), so a rewritten `exact.mjs` is refused rather than run; `run.test.ts` holds each app's script to it. `src/exact-cli.ts` is the child it starts once a command passes: the pinned clone's own app CLI, as Exact's generated `exact.mjs` runs it. On a run on the simulator it first clears, under the build lock, the stale `launch_console` FIFOs of the app's own simulator (`src/sim-tmp.ts`, `docs/exact.md`).

The two helpers are test seams (`testing.ts`): only tests import them.

`bun test ./src` runs the tests (the gate's `test` task). They need no Exact clone: the wrapper's tests run `runExact` over a stand-in spawner that starts nothing, against the apps, ports and lock written out as the spec names them and the pin `docs/exact.md` names.

## Effect in the data module

`src/effect/runner.ts` runs an effect for one call of Exact's data module: its `Clock` reads the call's time and moves only to each sleep's deadline, its `Random` is seeded with the call's seed, and its fibers run on a scheduler the runner drives, waiting out a sleep with the answer's own `setTimeout` (`runCall`) or at once (`runCallSync`). When the call's fiber ends, every fiber still asleep is interrupted. `src/effect/runner.d.ts` is the declaration Exact's type check reads in place of the source; `src/effect/runner.test.ts` holds the two together through the typecheck and holds the runner to `TestClock` and to its invariants across calls.

The lab, `lab` (`app.manna.exactlab`), is an app of the wrapper's own: it drives Heartseed's simulator under the build lock, serves on port 8774 alone, and is quiet. It shows each probe row's outcome on the device: `bun run exact test web` and `bun run exact test ios`, from `lab` or this folder. `lab/probe-table.json` is the one table Bun (`src/effect/probe.test.ts`) and the lab's contract test both assert. The rule and the evidence: `docs/exact-data-layer.md`.

An app's own Bun test imports only `bun:test` and this package's `no-copy/testing`: Exact's type check stages the declarations of every package a file in the app's folder imports, and `effect`'s name a second copy of rolldown in this repo (`docs/exact.md`).
