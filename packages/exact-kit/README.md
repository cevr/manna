# @manna/exact-kit

What the Exact ports (`apps/heartseed-exact`, `apps/hymnal-exact`) share. The install, the pin and the rules: `docs/exact.md`.

| Export                               | What                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@manna/exact-kit/main`              | `main(appDir, args)`: the wrapper every `bun run exact <verb>` goes through (each app's `exact.mjs` calls it), its refusal printed, its exit code the child's |
| `@manna/exact-kit/data-host/testing` | `withDataHost(run)`: `run` with the clock, timers, random and `Symbol.dispose` refused as Exact's data module refuses them                                    |
| `@manna/exact-kit/no-copy/testing`   | `noCopies(appDir, sources)` and `assertNoCopies(appDir, sourceDir)`: a port imports a current app's code, never copies it                                     |
| `manna-exact` (bin)                  | `main` for the app in the current folder                                                                                                                      |

`src/run.ts` holds the rules: the pin, the apps' simulators and ports, the build lock, and `runExact`, which refuses or runs one command. `src/exact-cli.ts` is the child it starts once a command passes: the pinned clone's own app CLI, as Exact's generated `exact.mjs` runs it.

The two helpers are test seams (`testing.ts`): only tests import them.

`bun test ./src` runs the tests (the gate's `test` task). They need no Exact clone: the wrapper's tests run `runExact` over a stand-in spawner that starts nothing, against the apps, ports and lock written out as the spec names them and the pin `docs/exact.md` names.

An app's own Bun test imports only `bun:test` and this package's `no-copy/testing`: Exact's type check stages the declarations of every package a file in the app's folder imports, and `effect`'s name a second copy of rolldown in this repo (`docs/exact.md`).
