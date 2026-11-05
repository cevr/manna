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
recital was recalled with help (a peek), ear when recalled alone, seed again
after Again, and full corn once FSRS stability reaches 21 days.

## Sub-features

A fresh install plants its seed in the first minute (`first.md`:
`first-planted`, which was this feature's `grow-seed`), and `Stage: not
planted` shows only when another verse is planted and the passage is not,
which no screen does yet, so it is retired here (`grow-unplanted`) and the
unit tests own it (`src/garden/today.test.tsx`). Every row below starts
from the Today `first-today` opens, at `Stage: seed`.

- `grow-ear`: a second recital, alone: `Stage: ear`, `Grew to an ear.`,
  exactly one `[growth] play` line, ending `skipped=simulator`.
- `grow-peek`: a peek at the mark: `Stage: blade`, `Grew to a blade.`, still
  one `[growth] play` line.
- `grow-restart`: the app restarted: no other stage in the launch frame, then
  `Stage: blade`, no `Grew to` line.
- `grow-again`: a third recital: `Stage: ear`, `Grew to an ear.`, two
  `[growth] play` lines; then `Again`: `Stage: seed`, no `Grew to` line,
  still two.

## How to get to it (user POV)

- Go through the first minute, tap `Continue`, then on Today tap `Say it`
  and read the stage line under the verse.

## Driving it

The growth sound's module (`apps/heartseed/native/growth`) must be in the
installed build (`SKILL.md`, Launch; `first.md` says which build serves).
The garden must start empty: uninstall the app by its udid before the
install (`xcrun simctl uninstall <udid> app.heartseed`; a reader can delete
the app, never write its storage), never with `booted` or `all`, and never
erase.

With `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them:

1. `first.md` steps 1 to 8: the first minute plants the seed
   (`first-planted`) and `first-again` leaves Today at `Stage: seed`, with
   no `[growth] play` line in the log.
2. (retired: `grow-unplanted`)
3. (now `first-planted`: `grow-seed`)
4. `grow-ear`: `sim tap "label=Say it"`, `sim tap "label=36 of 37 words"
   --timeout 30`, `sim snapshot grow-ear` → `Stage: ear`,
   `Grew to an ear.`. Then the log (below) holds exactly one
   `[growth] play` line, and it ends `skipped=simulator`.
5. `grow-peek`: `sim tap "label=Missed word 11"`, `sim snapshot grow-peek` →
   `Stage: blade`, `Grew to a blade.`; the log still holds one play line.
6. `grow-restart`: `sim relaunch`, then `sim open / --expect
   "label=Isaiah 41:10"` and at once `sim snapshot grow-restart-launch` →
   no `Stage: not planted` and no `Stage:` other than `blade` in that frame
   (the launch-frame probe). Then `sim open / --expect "id=stage"`,
   `sim snapshot grow-restart` → `Stage: blade`, no `Grew to`. A store that
   failed to open shows no stage line at all here, and that fails this row.
7. `grow-again`: the two taps of step 4, `sim snapshot grow-again` →
   `Stage: ear`, `Grew to an ear.`; two play lines. Then `sim tap
   "label=Again"`, `sim snapshot grow-again-graded` → `Stage: seed`, no
   `Grew to`; still two play lines.
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
