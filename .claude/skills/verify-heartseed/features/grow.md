# Grow

Every verse the reader has said is a plant: seed, then blade, then ear, then
full corn (Mark 4:28). The first minute plants the passage's seed
(`first.md`). Today (`apps/heartseed/app/index.tsx`) shows the
passage's stage under its words, read from the garden
(`apps/heartseed/src/garden.ts`), which keeps each recall Say it hands it in
the app's store on the device (`apps/heartseed/src/store.ts`: One's
key-value store, a SQLite file on the phone), so a restart shows the same
stage. When a recital grows the verse, Today says `Grew to a blade.`,
`Grew to an ear.` or `Grew to full corn.`, and the growth sound plays once:
a system sound, which the ring/silent switch mutes. On the simulator the
sound's module plays nothing and logs
`[growth] play sound=grow skipped=simulator`.

The stage line shows only once the garden's read of the store completed.
Before that, and for the whole session when the read failed, Today shows no
stage, no plant and no growth line, and plays nothing; Say it still runs and
its recalls are still written.

Its still hidden image is the same hand-drawn set as home's: seed, blade,
ear and corn for full corn, 28 pt on Today (`src/home/plant.tsx`), following
the effective scheme while mounted. The first minute's Planted alone
shows the 112 pt seed. `first.md`'s `first-plantset` and `today.md`'s
`today-plantset` pair mounted source/geometry receipts with live AX
semantic parity; AX cannot identify the hidden artwork. Their receipt
rules and visual limits apply to these growth rows too.

The stage: seed when planted (the first recital), blade when the latest
recital was recalled with help, ear when recalled alone, seed again after
Again, and full corn once FSRS stability reaches 21 days. The help is
derived, never stored: a peek, or the cue the stage before the recital gave
(first letters at a seed, `fade.md`), so the recital after planting is said
under letters and grows a blade.

## Sub-features

A fresh install plants its seed in the first minute (`first.md`:
`first-planted`, which was this feature's `grow-seed`), and `Stage: not
planted` shows only when another verse is planted and the passage is not,
which no screen does yet, so it is retired here (`grow-unplanted`) and the
unit tests own it (`src/garden/today.test.tsx`). Today runs the plan
(`run.md`), so a live recital after the first minute waits for the
passage's due: every row below starts from `run.md`'s `run-due`, at
`Stage: seed`.

- `grow-blade` (live at `run-recite`): a second recital, under letters:
  `Stage: blade`, `Grew to a blade.`, exactly one `[growth] play` line,
  ending `skipped=simulator`.
- `grow-peek` (live at `run-recite`, a peek on the mark before `Next`):
  `Stage: blade`, `Grew to a blade.`, still one `[growth] play` line.
- `grow-restart`: the app restarted while `Next` is pending: no other stage
  than the store's (`blade`) in the launch frame, no `Grew to` line, then
  home's done state, or the passage at `Stage: blade` with `Say it` when the
  new plan holds it.
- `grow-again`: a third recital (live at `run-second`, the second wait,
  only when the drive started before 16:00 local; else tests only:
  `src/garden/today.test.tsx`): `Stage: ear`, `Grew to an ear.`, two
  `[growth] play` lines; then `Again`: `Stage: seed`, no `Grew to` line,
  still two.

## How to get to it (user POV)

- Go through the first minute, tap `Continue`, come back once the verse is
  due, tap the Today card's `Start`, then on Today tap `Say it` and read the stage
  line under the verse.

## Driving it

The growth sound's module (`apps/heartseed/native/growth`) must be in the
installed build (`SKILL.md`, Launch; `first.md` says which build serves).
The garden must start empty: uninstall the app by its udid before the
install (`xcrun simctl uninstall <udid> app.heartseed`; a reader can delete
the app, never write its storage), never with `booted` or `all`, and never
erase.

With `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them:

1. `run.md`, Driving it, steps 1-3: the first minute plants the seed
   (`first-planted`), and `run-due` shows Today at `Stage: seed`, with no
   `[growth] play` line in the log.
2. (retired: `grow-unplanted`)
3. (now `first-planted`: `grow-seed`)
4. `grow-blade`: `run.md` step 4 (`run-recite`) → `Stage: blade`,
   and in the raw snapshot `id=growth`'s `Grew to a blade.` (a receipt
   leaves that node out). Then the log (below) holds exactly one
   `[growth] play` line, and it ends `skipped=simulator`.
5. `grow-peek`: `run.md` step 5's `run-next/sayit-peek` is this row's
   tap → `Next` in the receipt. The peeked word widens its line, which
   pushes the stage lines below the fold, and a receipt holds visible
   nodes only: `Stage: blade` is read in `run-next/sayit-grade`, the step
   before, and `Grew to a blade.` after a peek is unproven live (the
   tests own it). The log still holds one play line.
6. `grow-restart`, after `run.md` step 6, before the verse is due again:
   `sim journey grow-restart` → `"ok":true`: a relaunch whose pending frame
   shows the reference, then home in the done state (no `Start`).
   `grow-restart/grow-restart-launch`, the launch-frame probe: no
   `Stage: not planted` and no `Stage:` other than the store's, no
   `Grew to`. `grow-restart/grow-restart`: home, no `Grew to`, no grade. A
   store that failed to open opens Today with no Today card, so the
   journey fails at `grow-restart`, and that fails this row.
7. `grow-again`, in a drive of its own (in place of `run.md` step 8):
   `run.md` step 7 (`run-second`) → `Stage: ear`, and `id=growth`'s `Grew to an ear.` in
   its raw snapshot; two
   play lines. Then, before its `Next`, `sim journey grow-again` →
   `"ok":true`: `Again`. `grow-again/grow-again`: `Stage: seed`, `Next`;
   then a raw snapshot: no `id=growth`; still two play lines.
8. When `sayit.md` follows in the same drive (`first.md` step 9), its rows
   ride `run.md`'s journeys; then `sim doctor` (record `head` and
   `timingsHold`), then `sim down`.

The log: `xcrun simctl spawn <udid> log show --start "$START" --style compact
--predicate 'eventMessage CONTAINS "[growth]" AND process == "Heartseed"'`.
Every `[growth] play` line ends `skipped=simulator`; `[growth] load
sound=grow` appears once per launch.

Every snapshot holds the passage's words: read each for the strings above,
report only counts, booleans, the reference and the stage names, then
delete the `snapshots` folder.

## Gotchas

- No screenshot, no recording and no sound. The simulator's module never
  plays the sound; a play line without `skipped=simulator` is a failure.
- A stage left from an earlier drive means the app was not uninstalled
  first; never write the app's storage to reset it.
- No drive makes the store fail to open: that needs a write to the app's
  storage or a debug hook. The unit tests own it (`src/store.test.ts`,
  `src/garden.property.test.ts`, `src/garden/today.test.tsx`).
