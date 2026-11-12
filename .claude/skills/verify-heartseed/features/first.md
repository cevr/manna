# The first minute

A launch whose garden read completes and holds no recall of any verse
opens the first minute (`apps/heartseed/src/first/screen.tsx`, rendered in
place by the root route `apps/heartseed/app/index.tsx`), not Today. Two
screens say what the app is (`apps/heartseed/src/first/intro.tsx`):

- The welcome, the heading `Heartseed`: a seed that grows to full corn and
  begins again (still at full corn under Reduce Motion; its four drawings
  are hidden, so the tree names no stage and no image), `Plant a verse.
  Say it from memory. Watch it grow.`, `Your first verse` over
  `Isaiah 41:10`, `Begin` and `Skip`. `Skip` goes straight to `Hear it`.
- `Begin` shows `Every verse is a plant`: the texts `seed`, `blade`,
  `ear` and `full corn` under four still drawings, its line, `Mark 4:28`,
  and one button, `Plant your first verse`, which shows `Hear it`.

Then it is one promise in three phases, then the seed:

1. `Hear it`: the verse whole, one node per word (`word-<i>`). `Listen`
   (only while the voice's choice is not Off and it is not reading) has the voice
   (`apps/heartseed/src/voice.ts`) read the passage once (a second tap
   before the frame that hides `Listen` reads nothing more); the words already
   spoken are in ink and the voice's current word is `selected`. While it
   reads, the word nodes sit in the reading view (`id=reading`, as Today's,
   `light.md`): a long press on the words pauses the reading, a drag holds
   the word under the finger, and the release reads on from it; each word
   offers VoiceOver `Read from here`. A reading
   that ends finished goes on by itself; one that does not offers `Listen`
   again. `Next` goes on at any time, stopping a reading under way. Nothing
   speaks without a tap.
2. `Say it with help`: each word's first letter alone (its node's label is
   that one character). `Say it` recites with the first-letter cue; a
   finished recital, with any words missed, goes on. It keeps nothing.
3. `Say it alone`: no word shows, and none is in the accessibility tree,
   before it is said. Its finished recital is kept in the garden.
4. `Planted`, once the garden's read holds that recall: `Stage: seed`, the
   still hand-drawn seed at 112 × 112 pt in its 120 pt place, and
   `Continue`, which opens home (the field) in the
   done state with three tips (`id=tip-1` under the card, `id=tip-2` under
   `Lists`, `id=tip-3` under the first furrow) and `Got it`, which ends
   them. A relaunch shows none.

Until the read completes the launch shows only the reference: no heading,
no button. A garden holding any verse's recall opens home; an unread
garden opens Today, with no `Your field`.
A relaunch mid-flow starts again at the welcome: nothing of the flow is stored
but the one recall. There is no sign-up and no setting.

On the simulator the voice makes no sound: the module logs
`[voice] speak utterance=<n> skipped=simulator` and still sends its word
ranges and its finish at their sample times, so the words light and the
phase moves on as they would on a phone. Say it hears the dictation
module's replay (the passage less its 11th word), so both recitals miss
word 11 and the seed is graded Hard.

## Sub-features

- `first-welcome`: a fresh install opens the welcome: the one heading
  `Heartseed`, the texts `Plant a verse. Say it from memory. Watch it
  grow.`, `Your first verse` and `Isaiah 41:10`, the buttons exactly
  `Begin` and `Skip`, the same nodes in snapshots 3 s apart while the seed
  grows, no node named for a stage or an image, no `word-<i>`, `Listen`,
  `Next`, `Say it` or `Your field`.
- `first-grows`: `Begin` shows `Every verse is a plant` with `seed`,
  `blade`, `ear`, `full corn` and `Mark 4:28`, one button and no `Begin`
  or `Skip`; `Plant your first verse` shows `Hear it` with `Listen`,
  `Next` and 37 word nodes.
- `first-skip`: a relaunch at `Hear it` shows the welcome again; its
  `Skip` shows `Hear it` with `Listen` and `Next`, and nothing spoke
  before the first `Listen` tap.
- `first-launch`: from `first-skip`'s `Hear it`: `Isaiah 41:10`,
  `Listen` and `Next`, the word nodes, and no `Today`, no `Stage:` label
  and no `Say it`.
- `first-hear`: `Listen` reads: `id=reading` holding the word nodes, one
  or two words `selected`, all of one run, moving forward between two
  snapshots, and no `Listen` while it reads; its finish moves to
  `Say it with help` by itself.
- `first-hear-seek` (**phone only**, the owner's hand): while hear reads,
  hold a word: the voice pauses with one tick; drag back a line, the page
  still; let go: the reading plays on from that word. A quick swipe
  scrolls, with no seek. The simulator's driver has no long-press drag.
- `first-letters`: `Say it with help` and `Say it`, every word node's
  label one character; its recital goes on to `Say it alone`.
- `first-alone`: `Say it alone` and `Say it`, no word label at all, no
  `Stage:`; its recital plants the seed.
- `first-lines`: hear (whole, and read in `id=reading`), letters and
  alone draw Isaiah 41:10 in the lines Today draws it in (`fade.md`'s
  `lines-letters`): among the 37 `word-<i>`, `break-8`, `break-16`,
  `break-20` and `break-25`, and no other `break-`.
- `first-planted`: `Planted`, `Stage: seed`, `Continue`; no `[growth] play`
  line (planting never sounds).
- `first-tips`: `Continue` opens home with `id=tip-1`, `id=tip-2` and
  `id=tip-3`, each once, and `Got it`; after `Got it`, `id=today-card`
  with `Practice anyway` and none of the four; after a relaunch, none
  again.
- `first-still` (**phone only**, the owner's hand): with Reduce Motion on
  in iOS Settings, a fresh install's welcome shows full corn, still; with
  it off, a seed that grows to full corn and begins again, gently. The
  simulator's tree shows neither.
- `first-home`: after `Got it`, home in the done state (`home.md`'s
  `home-open`): the heading `Your field`, on the Today card
  `All tended for today` and `Practice anyway` with no `Start`, and no
  heading `Today`, no label
  starting `Stage:` or `Grew to`, no grade, and no `Say it` or `Next`. The
  seed was just planted, so the plan holds nothing to tend.
- `first-again`: a relaunch shows no first-minute heading in its launch
  frame, then home in the done state until the passage is due. Once it
  is due (7 minutes after a daytime planting; `run.md`'s `run-due`), a
  relaunch shows home with `Start`, and `Start` a clean `Today` at
  `Stage: seed`: no grade, no count, and the passage in letters
  (`today-passage`, `fade.md`'s `fade-letters`), not whole.
- `first-plantset`: steps 1–7 on the same fresh, verifier-owned install.
  At `first-launch`, `first-letters` and `first-alone`, no exposed image
  or plant name and no `Stage:` label. At `first-planted`, `Planted`,
  exactly one `Stage: seed`, `Continue`, no added exposed image, plant
  name or control, and no growth play. Continue still reaches `first-home`.
  The hidden drawing owes exactly the seed asset of the effective scheme,
  source and defaultSource alike, still, untinted and uncropped; pending,
  hear, letters, alone and a failed alone write owe no image. Mounted
  checks, not AX, establish those drawing clauses.

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
2. `first-welcome`: `sim install` answers `detail.expect`
   `label=Isaiah 41:10`; `sim open / --expect "label=Begin"`, `sim snapshot
   first-welcome` → as the row says; `sim open / --expect "label=Isaiah
   41:10" --no-relaunch` answers within 5 s; two more snapshots 3 s apart
   hold the same nodes.
   `first-grows`: `sim tap "label=Begin"`, `sim snapshot first-grows`,
   `sim tap "label=Plant your first verse"` → `Hear it`.
   `first-skip`: `sim relaunch`, `sim open / --expect "label=Begin"`
   (record `retried`), `sim tap "label=Skip"`.
   `first-launch`: `sim open / --expect "label=Hear it" --no-relaunch`,
   `sim snapshot first-launch` → the heading `Hear it`, `Isaiah 41:10`,
   the buttons `Listen` and `Next`; no `Today`, no label starting
   `Stage:`, no `Say it`; 37 word nodes (count them, never print them).
   `first-lines`, here and in each snapshot of steps 3-5: the `break-` ids
   in the tree are exactly `break-8`, `break-16`, `break-20`, `break-25`.
3. `first-hear`: `sim tap "label=Listen"`, then at once two raw snapshots
   about 1 s apart (`agent-device snapshot --json --raw --observe-only
   --force-full --session verify-heartseed`, in the drive's HOME) → in each,
   `id=reading` and one or two `word-<i>` nodes `selected`, all of one run; the second's
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
7. `first-tips`: `sim tap "label=Continue"`, `sim open / --expect
   "id=tip-1" --no-relaunch`, `sim snapshot first-tips` → `id=tip-1`,
   `id=tip-2`, `id=tip-3` and `Got it`. `first-home`: `sim tap "label=Got
   it"`, `sim open / --expect "id=today-card" --no-relaunch`, `sim
   snapshot first-home` → no tip and no `Got it`; the heading `Your field`;
   on the Today card `All tended for today`, `Nothing is due right now.`
   and `Practice anyway`, no `Start` and no `About`; the buttons
   `Settings` and `How Heartseed works` (at the scroll view's end) and no
   `When I need…`; no heading `Today`, no button `Today`, no label
   starting `Stage:` or `Grew to`, no label ending `words`, no grade
   label, no `Say it` and no `Next` (the done state).
8. `first-again`: `sim relaunch`, `sim open / --expect "label=Isaiah
   41:10"` (the pending frame) and at once `sim snapshot
   first-again-launch` → no `Heartseed`, `Hear it`, `Say it with help`,
   `Say it alone` or `Planted`, and no tip. Then `sim open / --expect "id=today-card" --no-relaunch`,
   `sim snapshot first-again` → the heading `Your field`, no first-minute
   heading, and the done state, as in step 7. Once the passage is due,
   `run.md`'s `run-due` shows `today-passage` (`today.md`).
9. From this home run `run.md`, Driving it, from step 2: `fade.md`,
   `grow.md` and `sayit.md` name the steps of it that are theirs. Then
   `sim doctor` (record `head` and `timingsHold`) and `sim down`. A drive
   of the field (`field.md`) or of home (`home.md`) branches at
   `first-home` instead.

The log: `xcrun simctl spawn <udid> log show --start "$START" --style
compact --predicate '(eventMessage CONTAINS "[voice]" OR eventMessage
CONTAINS "[growth]") AND process == "Heartseed"'`. It holds
`[voice] speak utterance=1 skipped=simulator`; every `[voice] speak` line
ends `skipped=simulator`; no `[growth] play` line before `fade-blade`.

Report only counts, booleans, indexes, the labels named above and the
reference; delete the `snapshots` folder and the raw snapshots.

## Plant-set receipt (`first-plantset`)

Use the launch/drive above under the assigned simulator lane; doctor
before and after (same head, `timingsHold`), and down at the end, after
any `today.md`/`grow.md` branch. Keep only counts, booleans and references.
Include the same-head `test:plantset` and external acceptance results.
From the checkout root, with `ACCEPT` set to the absolute external
acceptance filename supplied by the run's spec:

- `bun run --cwd apps/heartseed test:plantset`.
- `HS_W=<checkout> bun test --preload ./apps/heartseed/src/test/setup.ts "$ACCEPT"`.

External acceptance is red on the actual mounted base screens
(`7e52f7ede`: 1 pass, 2 fail, missing Today/Planted images). AX-only
clauses pass base deliberately: labels and controls are unchanged. Never
describe the live snapshot as red-on-base artwork proof. Unreached
first-minute variants, dark and full corn are test-only, not live passes.
AX cannot show hidden source identity, sharpness, transparent edges or
cropping, physical 28/112 pt fit, appearance colours, large Dynamic Type
layout, VoiceOver pronunciation or motion feel. Tests establish source,
declared geometry, hidden state and re-theme behavior; an owner Release
look from main, if requested, judges actual pixels. No screenshot or
phone prototype is part of this row. `today.md`'s `today-plantset` and
`grow.md` continue from the same `first-home`.

## Gotchas

- No screenshot, no recording and no sound; never grant the microphone or
  speech recognition, and never write the app's storage to reset it.
- A `Your field` heading on a fresh install means the app was not
  uninstalled first; a `Today` means the garden's read failed (an unread
  garden opens Today, claiming no stage).
- No relaunch mid-flow is driven live past `first-skip`'s: the unit tests own it
  (`src/first/screen.test.tsx`), and the voice-off hear phase, since no
  screen of the first minute sets the voice's choice.
- A `Hear it` as a fresh install's first heading means the build predates
  the welcome.
