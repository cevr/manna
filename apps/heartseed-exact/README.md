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
bun tools/drive-garden.ts web   # the garden: a recall's day, peek, Show all, a relaunch, twenty singles (also: ios)
bun run test                 # the Bun tests the gate runs (no Exact needed), with test:garden-a, -b, -c and -bytes
```

`bun run exact` first runs `tools/prepare.ts`: it links Exact's standard modules (`@exact/speech-synthesis`, `@exact/speech-recognition`, `@exact/media-capture`) into `node_modules` from the clone, so no machine path is committed, and writes Today's passage (`tools/passage.ts`).

## Today

The one screen so far: Isaiah 41:10, **Hear it** (the system voice reads it, each word lit as the voice reaches it), **Say it** (the recognizer listens on the device, hinted with the verse's words, and Heartseed's matcher marks each word), **Done** (the recall, right of total, kept as the last one across launches).

- Every rule is `step(state, input)` in `src/today/step.ts`, and the screen is `view(state)` in `src/today/view.ts`. `src/today/sources.ts` holds the state for one launch and answers one data source per input; `features/today.contract` only makes the calls (`speak`, `startSpeechRecognition`, …), forwards each native change as an input naming its utterance or recognition, and draws the view. An input for any other id changes nothing.
- The matcher is the current Heartseed's, imported as `@manna/heartseed/matcher`, whose types are `apps/heartseed/exact/matcher.d.ts`: Exact's type check stages a package's declarations, never its source, and this file imports nothing, so it never reaches `effect`.
- The passage is the current Heartseed's own derivation (`@manna/heartseed/passage`, from `@manna/core`'s KJV), written by `tools/passage.ts` to `src/passage/today.ts`, ignored and declared by the tracked `src/passage/today.d.ts`: no verse text is committed but the KJV.
- The last recall is kept in `app:/data/today.json`, a stand-in until the garden comes.

## The garden and Your verses

What is planted (lists of three verses or more, and single verses), each verse's plant, stage, FSRS schedule and history, kept across launches in `app:/data/heartseed.json`. **Your verses** (`/verses`, the link on Today's header) lists them, plants John 3:16-18, a verse of Psalm 119 or Psalm 23:1-2 (two verses: refused as a list), and removes a list or a single verse.

- The current Heartseed's own services do the work, imported (`@manna/heartseed/garden`, `passages`, `lists`, `sayit`, `day`, `fsrs`, `chooser`; their declarations are `apps/heartseed/exact/*.d.ts`, held to the sources by `apps/heartseed/scripts/exact-declared.test.ts`). Each source is one call through the runner (`src/garden/program.ts` → `runCall`): it builds `Garden`, `Passages` and the single verses over `@manna/exact-kit/storage`'s `KeyValueStore` on the file, makes its one change and answers what they hold after it. The stored keys and bytes are the current app's, so `ex-hs-import` copies keys.
- Calls run one at a time (`src/garden/writes.ts`), reads too: each call builds its own store, so the current app's `Semaphore` orders nothing across calls. The protocol is `src/garden/writes.qnt`, walked whole in `writes.test.ts`.
- Single verses are a stand-in (`src/garden/singles.ts`, hsminlist's rules and key `heartseed/singles`) until the current app's `Passages` holds them; the merge round after hsminlist lands replaces it with the import.
- `virtual:heartseed-kjv`, which the current app's lists read, is `src/garden/chapters.gen.json` (`tsconfig.json`'s `paths`): each chapter's verse count, no text, written by `tools/chapters.ts` from `tools/prepare.ts`; the Bun tests get the same through `tools/setup.ts`.
- A driver's launch (`HEARTSEED_GARDEN_DRIVE` set, `app.json`'s `env`) adds test controls under each verse (Good, Good after a peek, Good after Show all, Move back); a plain launch has none. `tools/drive-garden.ts web|ios` drives them.

The seam other units call, every source taking the call's time, zone and seed from `exactTime()` (`time.epochAtZero + performanceNow()`, `time.utcOffset`, `time.seed`):

| Source         | Arguments                                                              | Answers                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gardenRead`   | `offset` `with` `now`, `seed`                                          | `GardenShown`: `read` (false while the store is unread, which claims nothing), `lists` (`id`, `slug`, `title`, `verses`), `singles`, `listsFull`, `singlesFull`, `limitLine` |
| `gardenPlant`  | `book`, `chapter`, `first`, `last`, `now`, `offset`, `seed`            | `GardenChange`: `answer` `Planted`, `Already`, `Short` (two verses), `Full`, `Invalid`, `Unread` or `Failed`; `line` (the Short line, else empty)                            |
| `gardenRemove` | `id` (a list's, or `single:<reference>`), `now`, `offset`, `seed`      | `GardenChange`: `Removed`, `Absent`, `Unread` or `Failed`                                                                                                                    |
| `gardenRecall` | `reference`, `GardenRecallIn`, `GardenHelpIn`, `now`, `offset`, `seed` | `GardenVerseChange`: `answer` `Kept`, `Unread`, `Failed` or `Invalid` (arguments that do not decode), and the verse after it                                                 |
| `gardenBack`   | `reference`, `now`, `offset`, `seed`                                   | `GardenVerseChange`: `Moved`, `Failed` and the verse after it                                                                                                                |

A `GardenVerse` is `reference`, `slug` (its nodes' names: `plant-`, `stage-`, `due-`, `single-<slug>`), `planted`, `stage`, `recalls`, `lastGrade`, `due`, `dueNow` and `dueIn` (reader's days from today, the day turning at 04:00 in the call's zone). `GardenRecallIn` is SayIt's recall (`startedAt`, `offset`, `grade`, `suggested`, `words`, `missed`, `peeked`, `extra`); `GardenHelpIn` is SayIt's help (`peeked` word indexes, `shownAt` (none for no Show all), `cap`). A recall's grade is held to the help's cap, the cap no better than Hard after a peek and than `shownAllCap` after Show all, whose step back is kept first, at its instant. Every change `refreshes` `garden`.

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
