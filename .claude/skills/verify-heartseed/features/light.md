# Light: each word lit as the voice reads it, and a seek across the words

While the voice reads a verse, the verse shows as the reading view
(`apps/heartseed/src/reading/view.tsx`, testID `reading`): one `word-<i>`
node per word (a whitespace run holding a letter or number, a mark-only
run kept with the word before it), each its own accessibility element. The
words read so far are in ink and the rest quiet; the word the voice says
now is `selected`, on the hearing ground. At rest the verse is whole again
(`id=passage`). Nothing animates.

A finger held still on the words for 350 ms (the pan `reading-hold`) holds
the word under it: the voice pauses with one soft tick, a drag holds the
word under the finger (`selected`), and the scroll view stays still while
held. Letting go reads on from the held word as a new utterance
(`Voice.seek`), the words before it lit; a canceled hold resumes. A quick
swipe scrolls and never holds. Under VoiceOver each word offers the action
`Read from here`, which reads on from it.

Today and the first minute's `Hear it` (`first.md`) both show it: Today
for the shown piece while its `Listen` reads, `Hear it` for the passage
while its `Listen` reads. A hold does nothing at rest, where no reading
view shows.

The simulator's driver has no long-press drag, so the light probe
(`apps/heartseed/app/probe/light.tsx`, `heartseed://probe/light`) seeks by
buttons: John 3:16 in a scroll view taller than the screen, drawn by the
reading view while the voice reads it, `Listen`, `Back 3` (to
`max(0, lit − 3)`), `Forward 3` (to `min(words − 1, lit + 3)`) and the
status line `id=light-status`, `lit <lit>/<words> <status>`. A release
build renders nothing.

The voice is silent on the simulator (`[voice] speak utterance=<n>
skipped=simulator`), but its pacer sends each word's range at its sample
time, so the lighting moves: the rows read `selected` in raw snapshots and
`[voice] speak` lines in the log.

## Sub-features

- `light-probe-read`: `Listen` on the probe: `id=reading` with one
  `word-<i>` per word, one or two `selected` (all of one run) moving
  forward between two snapshots, `id=light-status` reading
  `lit <k>/<n> reading` with `k` growing, and one `speak` line.
- `light-probe-seek-back`: with `lit` at 6 or more, `Back 3`: the status's
  `lit` falls to the target, a new `speak` line has a higher utterance, and
  the selection moves forward from the target.
- `light-probe-seek-forward`: `Forward 3`: `lit` jumps to the target, with
  a new `speak` line.
- `light-probe-scroll`: while reading, `sim scroll` over the words: the
  probe scrolls, the status stays `reading` (never `paused`), and no new
  `speak` line appears. A swipe never holds.
- `light-today`: Today's `Listen` on a new piece (`passage.md`'s
  `passage-new`, or `phrase.md`'s `whole-new` for John 3:16):
  `id=reading` with one `word-<i>` per word, one or two `selected` moving
  forward between two snapshots, and no `id=passage`; for a verse of more
  than 20 words, a `break-<k>` before each line's first word by `linesOf`,
  hidden from the tree, so read from the frames (John 3:16: `word-6` and
  `word-13` each start a row at the view's left edge, a line's step below
  the row before). After the finish,
  `id=passage` is whole again (its `line-<i>` texts for a lined verse) and
  `Listen` is back.
- `lines-read`: `Isaiah 43:2` (`today.md`'s `lines-plain`): `Listen`; two
  raw snapshots about 1 s apart → `id=reading` with 38 `word-<i>`, one or
  two `selected` moving forward; `word-6`, `word-11`, `word-20`,
  `word-26`, `word-31` each at the view's left edge and lower than the word
  before it; after the finish `id=passage` with its six `line-<i>` again.
  The light probe's verse is drawn on one line, as before.
- `light-natural`: the probe's `Listen` read by the natural voice (Her):
  the selection moves forward, and `lit` holds through a rest between
  phrases, then moves on; one render and one play a phrase.
- `light-natural-him`: the same `Listen` with `Voice: Him` reads through
  the app's own route in `bm_george` by the British list.
- `light-natural-seek`: in that reading, `Back 3` and `Forward 3` each
  start a new utterance planned from the target's phrase, lit at the
  target or a little past it, and the reading goes on in order to the last
  word (`word-24`); after the finish the probe reads `lit 0/25 idle`, with
  `id=passage` whole again.
- `light-today-seek` (**phone only**, the owner's hand): while Listen
  reads, hold a word: the voice pauses with one tick. Drag back across two
  lines: the word under the finger lights, and the page does not scroll.
  Let go: the reading plays on from that word, in time with the light.
  Then the same forward. Then a quick swipe on the words: the page
  scrolls, with no seek. With Her (the system voice); once the natural
  voice routes Her and Him, with it too (its seek renders the tail's first
  chunk, so it may start later).
- `light-voiceover` (**phone only**): under VoiceOver, a word's actions
  rotor offers `Read from here`, and choosing it reads from that word.

## How to get to it (user POV)

- On Today, a new piece offers `Listen` while `Voice` is not `Off`; tap
  it, and the words light as they are read.
- The probe: `heartseed://probe/light` in a development build.

## Driving it

`RUN=hslight` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`, a
free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time, local and UTC. Nothing native changes, so
an installed build serves (`SKILL.md`, Launch); the JavaScript comes from
the dev server. The voice must not be `Off` (`session.md`).

A raw snapshot is `agent-device snapshot --json --raw --observe-only
--force-full --session verify-heartseed`, in the drive's HOME
(`first.md` step 3); keep only indexes, booleans and the status line, then
delete it. The log is `first.md`'s `xcrun simctl spawn <udid> log show`
over `[voice]`, from `START`.

1. `first.md` steps 1-7 to `first-home` (or any later home).
2. `light-probe-read`: `sim open probe/light --expect "label=Light probe"`,
   `sim tap "label=Listen"`, then two raw snapshots about 1 s apart → in
   each, `id=reading`, no `id=passage`, one or two `word-<i>` nodes
   `selected`, all of one run, the second's first index greater than the
   first's; `id=light-status` reads `lit <k>/<n> reading`, `k` growing;
   the log holds one new `[voice] speak utterance=<u>` line.
3. `light-probe-seek-back`: raw snapshots until the status's `lit` is 6
   or more (`k`), then `sim tap "label=Back 3"` and a raw snapshot → the
   status's `lit` is `k − 3` or a little more (the pacer goes on), the
   selection at or after `k − 3`; a second raw snapshot shows it moving
   forward; the log holds a new `speak` line with an utterance above `u`.
4. `light-probe-seek-forward`: `sim tap "label=Forward 3"` and a raw
   snapshot → `lit` at the target (the last `lit` plus 3, at most `n − 1`)
   or a little more, with a new `speak` line.
5. `light-probe-scroll`: `sim tap "label=Listen"` if the reading ended,
   then `sim scroll screen down` over the words and a raw snapshot → the
   heading `Light probe` has moved up or gone (the probe scrolled), the
   status still ends `reading`, and the log holds no new `speak` line.
6. `light-today`: on Today with a new piece (`passage.md`'s `passage-new`,
   or `phrase.md`'s `whole-new`), `sim tap "label=Listen"` and two raw
   snapshots about 1 s apart → `id=reading` with one `word-<i>` per word of
   the piece (count them), one or two `selected` moving forward, no
   `id=passage`, and the row starts `light-today` names (John 3:16's
   `word-6` and `word-13`, each at the view's left edge and below the word
   before, from the frames). Then `sim open / --expect "label=Listen" --no-relaunch` (a wait for the
   finish) and `sim snapshot light-today-done` → `id=passage`, no
   `id=reading`.
   `lines-read`: the same on `Isaiah 43:2` (reached as `today.md`'s Lines
   drive), reading the frames of `word-6`, `word-11`, `word-20`, `word-26`
   and `word-31`, the five words that start a line (x at the view's left
   edge, y below the word before).
7. `light-natural`: with the natural voice ready (the second container of
   `natural.md`'s Today rows, voice Her, its model server running),
   `sim open probe/light --expect "label=Light probe"`,
   `sim tap "label=Listen"`, then raw snapshots about 1 s apart until the
   finish → `id=reading`, the selection moving forward, `lit <k>/25 reading`
   growing, and at least one snapshot whose `lit` equals the one before
   between two that move (a rest); the log over `[natural]` and `[voice]`
   holds `[natural] render` for 4 chunks and their play lines with
   `rest=7200,7200,7200,0`, four prosody lines `ids=32,38,52,30` at
   `speed=0.85` (the American list's plan, on base and on head), and no
   `[voice] speak`.
8. `light-natural-him`: the probe's route is the app's own, which the
   natural probe does not take. With the natural voice ready, set
   `Voice: Him` (the Settings sheet's pill, as `natural.md`'s `today-him`),
   then `sim open probe/light --expect "label=Light probe"` and
   `sim tap "label=Listen"`, raw snapshots until the finish → the log holds
   `[natural] load … voice=bm_george.bin`, four prosody lines
   `ids=32,40,53,30` at `speed=0.9` (the British list's plan; base:
   `ids=32,38,52,30`, red at chunks 1 and 2), play lines
   `rest=7200,7200,7200,0`, no `[voice] speak`, the 25 words read in order
   by their native ids (`word-0` to `word-24`, the `selected` index never
   falling), and after the finish `lit 0/25 idle` with `id=passage` whole
   again and no `id=reading` (the probe clears its lighting once the
   reading ends). The seek row below reads in whichever natural voice is set.
9. `light-natural-seek`: `sim tap "label=Listen"` again, raw snapshots until
   `lit` is 6 or more, `sim tap "label=Back 3"`, a raw snapshot, then
   `sim tap "label=Forward 3"` and a raw snapshot → after each tap a new
   utterance's `[natural] render utterance=<u> chunk=0` (the tail planned
   from the target word's phrase), `lit` at the target or a little past it,
   the selection moving on in order by its native ids to `word-24`, and
   after the finish `lit 0/25 idle` with `id=passage` whole again and no
   `id=reading`.
10. `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Report only counts, booleans, indexes, the status lines, utterance numbers
and the labels named above; delete the `snapshots` folder and the raw
snapshots. The phone rows go to the owner as a check list.

## Gotchas

- The simulator's pacing runs at the render's sample time: John 3:16 reads
  for several seconds, so step 3 has time for `Back 3`, but a slow drive
  can miss the reading; tap `Listen` again then.
- `Back 3` and `Forward 3` do nothing at rest (a seek acts only while a
  reading is under way): a tap after the finish changes no status.
- Tests own the hold itself (the pan played through the gesture
  stand-in), the word under a finger over generated layouts, the seek's
  offset over odd texts, and VoiceOver's action
  (`apps/heartseed/src/reading/*.test.*`,
  `src/voice/seek.property.test.ts`, the acceptance check's V1 and T1).
