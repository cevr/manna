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

| Path                       | What                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `app.contract`             | The root view: one `use` line and one route per feature                                        |
| `app.ts`                   | The data module: one registry entry per feature                                                |
| `features/<name>.contract` | A feature's view                                                                               |
| `src/<name>/**`            | A feature's logic: pure TypeScript, imported by `app.ts`, tested in Bun                        |
| `<name>.test.contract`     | A feature's contract tests, beside `app.contract`: Exact's `test` and `verify` read only those |
| `app.test.contract`        | The app's own test: its name heads the first screen                                            |
| `src/sources.ts`           | The registry: every source the view asks for, one spread per feature                           |
| `src/hymns/**`             | The data seam: the book, made at build, and the declarations Exact's type check reads          |
| `exact.mjs`                | The kit's launcher, for Exact's own `bun exact.mjs` calls; `bun run exact` is `manna-exact`    |

## Adding a feature

1. Write `features/<name>.contract`: its `shape`s, a `members HymnalExact` block with its state, resources and actions (each name prefixed by the feature, as `listQuery`, `hymnShown`), and its screen component.
2. In `app.contract`: one `use <Screen> from "./features/<name>.contract"` line, one `members "./features/<name>.contract"` line, its route under `routes nav`, and one `if e.name == "<route>"` branch in the stack's loop.
3. In `src/<name>/sources.ts`, export `<name>Sources(book)`, the sources its resources name; add one spread line to `src/sources.ts`. `app.ts` stays as it is.
4. Put its rules in pure modules under `src/<name>/`, with Bun tests beside them, and its contract tests in `<name>.test.contract`.

## The book

`bun run exact` first runs `src/hymns/make.ts`, which writes `src/hymns/words.gen.json` and `indexes.gen.json` (ignored) by the current app's own derivations (`@manna/hymnal-app/vite/words`, `vite/indexes`). `tsconfig.json` maps the current app's `virtual:hymnal` and `virtual:hymnal-indexes` to those files, so Exact's bundler takes `apps/hymnal/src/hymns/search.ts` and `hymns.ts` unchanged, and maps `@manna/hymnal-app/hymns/*` to `src/hymns/decl/*.d.ts` for Exact's type check, which stages declarations and cannot stage `effect`'s. The Bun tests get the same modules through `src/test/setup.ts`. The list's answer holds numbers, titles and sections; a hymn's words are answered only for the hymn open.

Logic of the current hymnal and `@manna/hymnal` is imported through package exports, never copied: `src/no-copy.test.ts` fails on a copy of the current app's sources. A Bun test of a module `app.ts` imports can run it under `withDataHost` (`@manna/exact-kit/data-host/testing`) to fail where Hermes would.

`app.contract.d.ts` (the types `app.ts` imports), `.exact/` (builds, screenshots, scratch) and `dist/` are generated and ignored. `app.ts` stays out of the typecheck, which covers `src/` alone.
