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
- `first-today`: `Continue` opens `Today` in the done state (`run.md`'s
  `run-done-first`): the counts line `Nothing to tend now` alone under the
  header, with no `Isaiah 41:10`, no label starting `Stage:` or `Grew to`,
  no recap, no grade, and no `Say it` or `Next`. The seed was just planted,
  so the plan holds nothing to tend.
- `first-again`: a relaunch shows no first-minute heading in its launch
  frame, then `Today` in the done state until the passage is due. Once it
  is due (7 minutes after a daytime planting; `run.md`'s `run-due`), a
  relaunch or a Minutes tap shows a clean `Today` at `Stage: seed`: no
  grade, no count, and the passage in letters (`today-passage`,
  `fade.md`'s `fade-letters`), not whole.

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
   "id=session"`, `sim snapshot first-today` → `Today`,
   `Nothing to tend now`, `Your field`; no `Isaiah 41:10`, no label
   starting `Stage:` or `Grew to`, no label ending `words`, no grade label,
   no `Say it` and no `Next` (the done state, `run.md`'s
   `run-done-first`).
8. `first-again`: `sim relaunch`, `sim open / --expect "label=Isaiah
   41:10"` (the pending frame) and at once `sim snapshot
   first-again-launch` → no `Hear it`, `Say it with help`, `Say it alone`
   or `Planted`. Then `sim open / --expect "id=session"`,
   `sim snapshot first-again` → `Today`, no first-minute heading, and the
   done state, as in step 7. Once the passage is due, `run.md`'s `run-due`
   shows `today-passage` (`today.md`).
9. From this Today run `run.md`, Driving it, from step 2: `fade.md`,
   `grow.md` and `sayit.md` name the steps of it that are theirs. Then
   `sim doctor` (record `head` and `timingsHold`) and `sim down`. A drive
   of the field (`field.md`) branches at `first-today` instead.

The log: `xcrun simctl spawn <udid> log show --start "$START" --style
compact --predicate '(eventMessage CONTAINS "[voice]" OR eventMessage
CONTAINS "[growth]") AND process == "Heartseed"'`. It holds
`[voice] speak utterance=1 skipped=simulator`; every `[voice] speak` line
ends `skipped=simulator`; no `[growth] play` line before `fade-blade`.

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
