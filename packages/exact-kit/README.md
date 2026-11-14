# @manna/exact-kit

What the Exact ports (`apps/heartseed-exact`, `apps/hymnal-exact`) share. The install, the pin and the rules: `docs/exact.md`.

| Export                       | What                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@manna/exact-kit/run`       | The wrapper every `bun run exact <verb>` goes through: `main(appDir, args)`, the pure `plan`, the pin `EXACT_PIN`, the apps' simulators and ports `APPS`, the lock `BUILD_LOCK` |
| `@manna/exact-kit/data-host` | `withDataHost(run)`: `run` with the clock, timers, random and `Symbol.dispose` refused as Exact's data module refuses them                                                      |
| `@manna/exact-kit/no-copy`   | `noCopies(appDir, sources)` and `assertNoCopies(appDir, sourceDir)`: a port imports a current app's code, never copies it                                                       |

`src/exact-cli.ts` is the child the wrapper starts once a command passes its rules: the pinned clone's own app CLI, as Exact's generated `exact.mjs` runs it.

`bun test ./src` runs the tests (the gate's `test` task). They need no Exact clone: the wrapper's tests run over a stand-in spawner that starts nothing.

An app's own Bun test imports only `bun:test` and this package's `no-copy`: Exact's type check stages the declarations of every package a file in the app's folder imports, and `effect`'s name a second copy of rolldown in this repo (`docs/exact.md`).
