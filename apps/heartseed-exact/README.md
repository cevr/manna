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
bun tools/drive-look.ts web  # the brand in light and dark, the sheet's choices checked and kept (also: ios)
bun tools/drive-garden.ts web   # the garden: a recall's day, peek, Show all, a relaunch, twenty singles (also: ios)
bun run test                 # the Bun tests the gate runs (no Exact needed), with test:garden-a, -b, -c and -bytes
```

`bun run exact` first runs `tools/prepare.ts`: it links Exact's standard modules (`@exact/speech-synthesis`, `@exact/speech-recognition`, `@exact/media-capture`) into `node_modules` from the clone, so no machine path is committed, and writes Today's passage (`tools/passage.ts`), About's licences (`tools/licences.ts`) and the garden's chapters (`tools/chapters.ts`).

## Today

The one screen so far: Isaiah 41:10 under a cue, **Hear it** (the system voice reads it, each word lit as the voice reaches it), **Say it** (the recognizer listens on the device, hinted with the verse's words, and Heartseed's matcher marks each word), **Done** (the marks, the matcher's suggestion and the four grades), then **Next** (the try kept as the last one across launches) or **Say it again** (the try let go, its help kept).

- The cue is the route's: `/cue/none`, `/cue/initials` or `/cue/full`; any other route is `none`. Under no cue a word is a slot of rules, under first letters its first letter or number as written, under the full text the word.
- At rest a word the cue hides is a button: a tap shows it for `TODAY_PEEK_MS` (1.5 s; the contract's `after(1500, …)` is held to it by `src/today/peek.test.ts`) and caps the try at Hard. **Show all** shows every word, caps the try at Hard and moves the verse back a stage. Grades above the cap are disabled, and the help line says the cost. The cap is the current Heartseed's `cappedBy`.
- Nothing is kept before Next: a peek, a Show all or a graded try left unsaid is gone at the next launch.

- Every rule is `step(state, input)` in `src/today/step.ts`, and the screen is `view(state)` in `src/today/view.ts`. `src/today/sources.ts` holds the state for one launch and answers one data source per input; `features/today.contract` only makes the calls (`speak`, `startSpeechRecognition`, …), forwards each native change as an input naming its utterance or recognition, and draws the view. An input for any other id changes nothing.
- The matcher is the current Heartseed's, imported as `@manna/heartseed/matcher`, whose types are `apps/heartseed/exact/matcher.d.ts`: Exact's type check stages a package's declarations, never its source, and this file imports nothing, so it never reaches `effect`.
- The passage is the current Heartseed's own derivation (`@manna/heartseed/passage`, from `@manna/core`'s KJV), written by `tools/passage.ts` to `src/passage/today.ts`, ignored and declared by the tracked `src/passage/today.d.ts`: no verse text is committed but the KJV.
- The last recall is kept in `app:/data/today.json`, a stand-in until the garden comes.

## Settings, the look and About

The gear in the header (`gear`) opens the Settings sheet (`features/settings.contract`), a modal route of its own (`/settings`), closed by Done (`settings-done`) or the platform's Back: **A day's tending** (the radio group Minutes: 2, 5, 10, 20), **Reads new verses aloud** (Voice: Off, Her, Him), **Appearance** (System, Light, Dark), then **About**.

- Each choice is a root `state … persist` holding its text as tapped (`settingsMinutesKept`, `settingsVoiceKept`, `settingsAppearanceKept`, empty until chosen). `src/settings/choices.ts` reads it by the current Heartseed's rule (the text when it is exactly a choice, else 5 minutes, Her and System; `appearanceOf` itself) and offers the current app's lists in their order (`MINUTES`, `CHOICES`, `APPEARANCES`), through the one source `settingsOf`. The session reads `settingsMinutes` and `settingsVoice`; nothing acts on them yet.
- The appearance is the app's scheme: a task keyed on the read appearance calls `setScheme` with it, at a tap and at each launch, on both hosts.
- The look is `app.tamber`: every role of the current palette (`@manna/heartseed/theme`) as `hs.<role>` in light and dark, the platform's text roles and grounds drawn in them, the rounded face as `family.hs`. Screens name tokens and roles, never a colour; `src/look/brand.test.ts` holds the file to the palette, every text to AA on its grounds, and the Contract files to no colour literal.
- About (`features/about.contract`, `/settings/about`) is pushed inside the sheet: what Heartseed is, the KJV's note, and `Licences` (`/settings/about/licences`), the licences' texts `tools/licences.ts` writes from the current app's own `readLicence()` to `src/about/licences.ts` (ignored, declared by `licences.d.ts`).
- What a contract test cannot read (a node's computed colour, a radio's checked state, a native relaunch) is in `tools/drive-look.ts`.

## The garden and Your verses

What is planted (lists of three verses or more, and single verses), each verse's plant, stage, FSRS schedule and history, kept across launches in `app:/data/heartseed.json`. **Your verses** (`/verses`, the link on Today's header) lists them, plants three verses of John 3 (16-18, then the next three), a verse of Psalm 119 or Psalm 23:1-2 (two verses: refused as a list), and removes a list or a single verse.

- The current Heartseed's own services do the work, imported (`@manna/heartseed/garden`, `passages`, `lists`, `sayit`, `day`, `fsrs`, `chooser`; their declarations are `apps/heartseed/exact/*.d.ts`, held to the sources by `apps/heartseed/scripts/exact-declared.test.ts`). Each source is one call through the runner (`src/garden/program.ts` → `runCall`): it builds `Garden`, `Passages` and the single verses over `@manna/exact-kit/storage`'s `KeyValueStore` on the file, makes its one change and answers what they hold after it. The stored keys and bytes are the current app's, so `ex-hs-import` copies keys.
- Calls run one at a time (`src/garden/writes.ts`), reads too: each call builds its own store, so the current app's `Semaphore` orders nothing across calls. The protocol is `src/garden/writes.qnt`, walked whole in `writes.test.ts`. Check the model itself by hand (not in the gate; it fetches Apalache and runs Java): `bunx @informalsystems/quint verify --max-steps=10 --invariant=safe src/garden/writes.qnt` answers `[ok] No violation found`; with `owner == -1` taken out of its `read` (no queue) it answers `[violation]`, a read between the other call's two writes.
- Single verses are the current app's `Passages` too (`join` and `part`, `heartseed/singles`, at most `MOST_SINGLES`): one verse joins them, any other range is added as a list, and `add` answers `Short` under `LEAST_VERSES`, with the chooser's `SHORT_LINE` and `SINGLES_LIMIT_LINE` shown. A stored one-verse list moves to the single verses when `Passages` is read (its `migrated`).
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
| `app.tamber`               | The brand: the current palette's roles as tokens, the platform's roles drawn in them, the rounded face  |
| `exact.mjs`                | The kit's launcher, for Exact's own `bun exact.mjs` calls; `bun run exact` is `manna-exact`             |

A feature's names start with its own (`today…`), since its members share the root's one namespace. Logic of the current Heartseed is imported through its package's exports, never copied: `src/no-copy.test.ts` fails on a copy. A Bun test of a module `app.ts` imports runs it under `withDataHost` (`@manna/exact-kit/data-host/testing`) to fail where Hermes would, as `src/app.test.ts` does.

`app.contract.d.ts` (the types `app.ts` imports), `src/passage/today.ts`, `src/about/licences.ts`, `.exact/` (builds, screenshots, scratch) and `dist/` are generated and ignored. `app.ts` stays out of the typecheck, which covers `src/` alone: a test reaches `answer` through `src/test/app.js`, whose types are `app.d.ts` beside it, so a fresh checkout type-checks with no generated file. `src/passage/today.d.ts` and `src/about/licences.d.ts` name their writers (`@writer`), which the gate's env-pass requires before it counts the declaration for the absent module.
