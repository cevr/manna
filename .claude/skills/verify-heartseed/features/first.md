# The first minute

A launch whose garden read completes and holds no recall of any verse
opens the first minute (`apps/heartseed/src/first/screen.tsx`, rendered in
place by the root route `apps/heartseed/app/index.tsx`), not Today. It is
one promise in three phases, then the seed:

1. `Hear it`: the verse whole, one node per word (`word-<i>`). `Listen`
   (only while the voice is on and not reading) has the voice
   (`apps/heartseed/src/voice.ts`) read the passage once (a second tap
   before the frame that hides `Listen` reads nothing more); the words already
   spoken are in ink and the voice's current word is `selected`. A reading
   that ends finished goes on by itself; one that does not offers `Listen`
   again. `Next` goes on at any time, stopping a reading under way. Nothing
   speaks without a tap.
2. `Say it with help`: each word's first letter alone (its node's label is
   that one character). `Say it` recites with the first-letter cue; a
   finished recital, with any words missed, goes on. It keeps nothing.
3. `Say it alone`: no word shows, and none is in the accessibility tree,
   before it is said. Its finished recital is kept in the garden.
4. `Planted`, once the garden's read holds that recall: `Stage: seed`, the
   seed drawn large, and `Continue`, which opens Today at a seed.

Until the read completes the launch shows only the reference: no heading,
no button. An unread garden, or one holding any verse's recall, opens Today.
A relaunch mid-flow starts again at `Hear it`: nothing of the flow is stored
but the one recall. There is no sign-up and no setting.

On the simulator the voice makes no sound: the module logs
`[voice] speak utterance=<n> skipped=simulator` and still sends its word
ranges and its finish at their sample times, so the words light and the
phase moves on as they would on a phone. Say it hears the dictation
module's replay (the passage less its 11th word), so both recitals miss
word 11 and the seed is graded Hard.

## Sub-features

- `first-launch`: a fresh install opens `Hear it`, with `Isaiah 41:10`,
  `Listen` and `Next`, the word nodes, and no `Today`, no `Stage:` label
  and no `Say it`.
- `first-hear`: `Listen` reads: one or two words `selected`, all of one
  run, moving forward between two snapshots, and no `Listen` while it
  reads; its finish moves to `Say it with help` by itself.
- `first-letters`: `Say it with help` and `Say it`, every word node's
  label one character; its recital goes on to `Say it alone`.
- `first-alone`: `Say it alone` and `Say it`, no word label at all, no
  `Stage:`; its recital plants the seed.
- `first-planted`: `Planted`, `Stage: seed`, `Continue`; no `[growth] play`
  line (planting never sounds).
- `first-today`: `Continue` opens `Today` at `Stage: seed`, with no label
  starting `Grew to`, and `Say it`. Today keeps the alone recital on the
  screen, as Say it keeps any finished recital: its count
  `36 of 37 words`, the mark `Missed word 11`, `Suggested: Hard` and the
  four grades with `Hard` checked (a grade changed here is kept, as on
  Today).
- `first-again`: a relaunch shows no first-minute heading in its launch
  frame, then a clean `Today` at `Stage: seed`: no grade, no count, and the
  passage whole (`today-passage`).

## How to get to it (user POV)

- Install the app fresh (delete it first) and open it.

## Driving it

This feature changes nothing native, so the drive needs no prebuild: an
incremental `sim install` of the head (a build of `d19c8ed2e` or later
already holds the voice, dictation and growth modules), under
`lockf -k /tmp/manna-ios-build.lock` with the bars of `SKILL.md`, Launch,
or `--app` with that build. The garden must start empty: uninstall the app
by its udid (`xcrun simctl uninstall <udid> app.heartseed`), never with
`booted` or `all`, and never erase.

With `RUN=hsfirst-l8`, `EVIDENCE=$PWD/tmp/verify/$RUN`, a free `PORT` of
8280-8289, and `START` the time the drive starts:

1. `sim boot --port $PORT --out "$EVIDENCE"` → ok. Uninstall as above, then
   the install, then `xcrun simctl privacy <udid> revoke microphone
   app.heartseed`.
2. `first-launch`: `sim open / --expect "label=Hear it"`, `sim snapshot
   first-launch` → the heading `Hear it`, `Isaiah 41:10`, the buttons
   `Listen` and `Next`; no `Today`, no label starting `Stage:`, no
   `Say it`; 37 word nodes (count them, never print them).
3. `first-hear`: `sim tap "label=Listen"`, then at once two raw snapshots
   about 1 s apart (`agent-device snapshot --json --raw --observe-only
   --force-full --session verify-heartseed`, in the drive's HOME) → in each,
   one or two `word-<i>` nodes `selected`, all of one run; the second's
   first index greater than the first's; no `Listen`. Then `sim tap
   "label=Say it with help" --timeout 30` (a tap on a heading does
   nothing; it waits for the reading's end). Keep only indexes and
   booleans from the raw snapshots, then delete them.
4. `first-letters`: `sim snapshot first-letters` → `Say it with help`,
   `Say it`; the count of word nodes whose label is longer than one
   character is 0. `sim tap "label=Say it"`, `sim tap "label=Say it alone"
   --timeout 30`.
5. `first-alone`: `sim snapshot first-alone` → `Say it alone`, `Say it`, no
   word label, no `Stage:`. `sim tap "label=Say it"`, `sim tap
   "label=Planted" --timeout 30`.
6. `first-planted`: `sim snapshot first-planted` → `Planted`,
   `Stage: seed`, `Continue`; the log holds no `[growth] play` line.
7. `first-today`: `sim tap "label=Continue"`, `sim open / --expect
   "id=stage"`, `sim snapshot first-today` → `Today`, `Stage: seed`, no
   label starting `Grew to`, `Say it`; the recap `36 of 37 words`,
   `Missed word 11`, `Suggested: Hard`, and every `Hard` line `[checked]`.
8. `first-again`: `sim relaunch`, `sim open / --expect "label=Isaiah
   41:10"` and at once `sim snapshot first-again-launch` → no `Hear it`,
   `Say it with help`, `Say it alone` or `Planted`. Then `sim open /
   --expect "id=stage"`, `sim snapshot first-again` → `Today`,
   `Stage: seed`, no first-minute heading, and `today-passage`
   (`today.md`): the passage whole, `Say it`, no `Listening`, no grade
   label and no label ending `words`.
9. From this Today run `grow.md` from `grow-ear` to `grow-again`, then
   `sayit.md` (its step 1 relaunches for a clean Today), then `sim doctor`
   (record `head` and `timingsHold`) and `sim down`.

The log: `xcrun simctl spawn <udid> log show --start "$START" --style
compact --predicate '(eventMessage CONTAINS "[voice]" OR eventMessage
CONTAINS "[growth]") AND process == "Heartseed"'`. It holds
`[voice] speak utterance=1 skipped=simulator`; every `[voice] speak` line
ends `skipped=simulator`; no `[growth] play` line before `grow-ear`.

Report only counts, booleans, indexes, the labels named above and the
reference; delete the `snapshots` folder and the raw snapshots.

## Gotchas

- No screenshot, no recording and no sound; never grant the microphone or
  speech recognition, and never write the app's storage to reset it.
- A `Today` on a fresh install means the app was not uninstalled first, or
  the garden's read failed (an unread garden opens Today, claiming no
  stage).
- No relaunch mid-flow is driven live: the unit tests own it
  (`src/first/screen.test.tsx`), and the voice-off hear phase, since no
  screen sets the switch.
