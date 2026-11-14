# @manna/hymnal-exact

The hymnal on [Exact](https://github.com/expo/exact), bundle id `im.cvr.hymnal.exact`, ported beside `apps/hymnal` until it replaces it (iOS and the web first; Android stays the current app's until a trial). How to install Exact, the pin, the wrapper and the simulators: `docs/exact.md`.

```sh
bun run exact contract build app.contract --json --errors-only   # [] means no errors
bun run exact web            # the dev loop, at http://127.0.0.1:8766/
bun run exact test web       # the contract tests in headless Chrome
bun run exact test ios       # the same on verify-hymnal-exact
bun run exact verify         # tests, checks, a relaunch: done when clean
bun run exact verify ios
bun test ./src               # the Bun tests the gate runs (no Exact needed)
```

## Where a feature's files go

| Path                         | What                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| `app.contract`               | The root view: one `use` line and one route per feature                 |
| `app.ts`                     | The data module: one registry entry per feature                         |
| `features/<name>.contract`   | A feature's view                                                        |
| `src/<name>/**`              | A feature's logic: pure TypeScript, imported by `app.ts`, tested in Bun |
| `tests/<name>.test.contract` | A feature's contract tests                                              |
| `app.test.contract`          | The app's own test: its name heads the first screen                     |
| `exact.mjs`                  | The launcher `bun run exact` runs: the wrapper in `@manna/exact-kit`    |

Logic of the current hymnal and `@manna/hymnal` is imported through package exports, never copied: `src/no-copy.test.ts` fails on a copy of the current app's sources. A Bun test of a module `app.ts` imports can run it under `withDataHost` (`@manna/exact-kit/data-host`) to fail where Hermes would.

`app.contract.d.ts` (the types `app.ts` imports), `.exact/` (builds, screenshots, scratch) and `dist/` are generated and ignored. `app.ts` stays out of the typecheck, which covers `src/` alone.
