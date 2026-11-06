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
  the done state, or the passage at `Stage: blade` with `Say it` when the
  new plan holds it.
- `grow-again`: a third recital (live at `run-second`, the second wait,
  only when the drive started before 16:00 local; else tests only:
  `src/garden/today.test.tsx`): `Stage: ear`, `Grew to an ear.`, two
  `[growth] play` lines; then `Again`: `Stage: seed`, no `Grew to` line,
  still two.

## How to get to it (user POV)

- Go through the first minute, tap `Continue`, come back once the verse is
  due, then on Today tap `Say it` and read the stage line under the verse.

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
   `Grew to a blade.`. Then the log (below) holds exactly one
   `[growth] play` line, and it ends `skipped=simulator`.
5. `grow-peek`, before `run.md` step 5: `sim tap "label=Missed word 11"`,
   `sim snapshot grow-peek` → `Stage: blade`, `Grew to a blade.`, `Next`;
   the log still holds one play line.
6. `grow-restart`, after `run.md` step 7 (or step 6 when the second wait
   does not run), or in a drive of its own with `Next` pending:
   `sim relaunch`, then `sim open / --expect "label=Isaiah 41:10"` (the
   pending frame shows the reference) and at once
   `sim snapshot grow-restart-launch` → no `Stage: not planted` and no
   `Stage:` other than the store's in that frame (the launch-frame probe),
   no `Grew to`. Then `sim open / --expect "id=session"`,
   `sim snapshot grow-restart` → no `Grew to`, no grade, and the done state,
   or the passage's stage line and `Say it` when the counts line reads
   `1 to tend`. A store that failed to open shows no counts line at all
   here, and that fails this row.
7. `grow-again`: `run.md` step 7 (`run-second`) → `Stage: ear`,
   `Grew to an ear.`; two play lines. Then, before its `Next`, `sim tap
   "label=Again"`, `sim snapshot grow-again-graded` → `Stage: seed`, no
   `Grew to`, `Next`; still two play lines.
8. When `sayit.md` follows in the same drive (`first.md` step 9), run it
   now; then `sim doctor` (record `head` and `timingsHold`), then
   `sim down`.

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
