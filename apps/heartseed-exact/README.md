# @manna/heartseed-exact

Heartseed on [Exact](https://github.com/expo/exact), bundle id `app.heartseed.exact`, ported beside `apps/heartseed` until it replaces it. How to install Exact, the pin, the wrapper and the simulators: `docs/exact.md`.

```sh
bun run exact contract build app.contract --json --errors-only   # [] means no errors
bun run exact web            # the dev loop, at http://127.0.0.1:8765/
bun run exact test web       # the contract tests in headless Chrome
bun run exact test ios       # the same on verify-heartseed-exact
bun run exact verify         # tests, checks, a relaunch: done when clean
bun run exact verify ios
bun tools/drive-say.ts web   # Say it, the kept recall and a refusal, driven through the agent (also: ios)
bun test ./src               # the Bun tests the gate runs (no Exact needed)
```

`bun run exact` first runs `tools/prepare.ts`: it links Exact's standard modules (`@exact/speech-synthesis`, `@exact/speech-recognition`, `@exact/media-capture`) into `node_modules` from the clone, so no machine path is committed, and writes Today's passage (`tools/passage.ts`).

## Today

The one screen so far: Isaiah 41:10, **Hear it** (the system voice reads it, each word lit as the voice reaches it), **Say it** (the recognizer listens on the device, hinted with the verse's words, and Heartseed's matcher marks each word), **Done** (the recall, right of total, kept as the last one across launches).

- Every rule is `step(state, input)` in `src/today/step.ts`, and the screen is `view(state)` in `src/today/view.ts`. `src/today/sources.ts` holds the state for one launch and answers one data source per input; `features/today.contract` only makes the calls (`speak`, `startSpeechRecognition`, …), forwards each native change as an input naming its utterance or recognition, and draws the view. An input for any other id changes nothing.
- The matcher is the current Heartseed's, imported as `@manna/heartseed/matcher`, whose types are `apps/heartseed/exact/matcher.d.ts`: Exact's type check stages a package's declarations, never its source, and this file imports nothing, so it never reaches `effect`.
- The passage is the current Heartseed's own derivation (`@manna/heartseed/passage`, from `@manna/core`'s KJV), written by `tools/passage.ts` to `src/passage/today.ts`, ignored and declared by the tracked `src/passage/today.d.ts`: no verse text is committed but the KJV.
- The last recall is kept in `app:/data/today.json`, a stand-in until the garden comes.

## Where a feature's files go

| Path                       | What                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `app.contract`             | The root view: per feature one `use` line, one `members` line, one route and one branch of the stack    |
| `app.ts`                   | The data module: per feature one spread of its sources into `sources`, and its grants                   |
| `features/<name>.contract` | A feature's members of the root (`members HeartseedExact`: its states, resources, calls) and its screen |
| `src/<name>/**`            | A feature's logic: pure TypeScript, imported by `app.ts`, tested in Bun                                 |
| `<name>.test.contract`     | A feature's contract tests, beside `app.contract`: `exact test` and `verify` read only those            |
| `app.test.contract`        | The app's own test: its name heads the first screen                                                     |
| `tools/`                   | Host scripts: `prepare.ts`, `passage.ts`, and drives a `.test.contract` cannot hold                     |
| `strings/en.json`          | The purpose strings of the app's grants                                                                 |
| `exact.mjs`                | The kit's launcher, for Exact's own `bun exact.mjs` calls; `bun run exact` is `manna-exact`             |

A feature's names start with its own (`today…`), since its members share the root's one namespace. Logic of the current Heartseed is imported through its package's exports, never copied: `src/no-copy.test.ts` fails on a copy. A Bun test of a module `app.ts` imports runs it under `withDataHost` (`@manna/exact-kit/data-host/testing`) to fail where Hermes would, as `src/app.test.ts` does.

`app.contract.d.ts` (the types `app.ts` imports), `src/passage/today.ts`, `.exact/` (builds, screenshots, scratch) and `dist/` are generated and ignored. `app.ts` stays out of the typecheck, which covers `src/` alone: a test reaches `answer` through `src/test/app.js`, whose types are `app.d.ts` beside it, so a fresh checkout type-checks with no generated file. `src/passage/today.d.ts` names its writer (`@writer`), which the gate's env-pass requires before it counts the declaration for the absent module.
