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
bun tools/licences.ts        # writes About's licences (src/about/licences.ts); run before Exact until prepare.ts calls it
bun tools/drive-look.ts web  # the brand in light and dark, the sheet's choices checked and kept (also: ios)
bun test ./src               # the Bun tests the gate runs (no Exact needed)
```

`bun run exact` first runs `tools/prepare.ts`: it links Exact's standard modules (`@exact/speech-synthesis`, `@exact/speech-recognition`, `@exact/media-capture`) into `node_modules` from the clone, so no machine path is committed, and writes Today's passage (`tools/passage.ts`).

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
