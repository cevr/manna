# Say it

Say it is Today's one button (`apps/heartseed/app/index.tsx`, over
`apps/heartseed/src/sayit.ts`). A press starts a recital of the passage
through the app's one Dictation (`apps/heartseed/src/app.ts`) under the cue
its stage gives (`fade.md`): each word not yet said shows that cue, each
word lights as it is said with a soft haptic tick, and a missed
word shows only a mark, `Missed word <n>`, that a tap reveals (a peek).
When the recital ends, Today shows `<lit> of <total> words` (and
`, <n> peeked` once a word was peeked), `Suggested: <grade>`, and the four
grades `Again`, `Hard`, `Good` and `Easy` as a radio group with the
suggestion checked; the reader can change it. Each change of a finished
recital's recall is kept in the garden, and Today's stage line under the
verse follows it (`grow.md`). A recital that could not be heard shows one
alert and the verse as its cue, with no grade. Say it reads no word aloud. The
first minute's letters and alone phases press the same Say it (`first.md`);
the rows here are Today's, run from the Today the first minute opens.

In a development build on the simulator Say it hears the dictation
module's replay of a scripted recital (the probe's plan: the passage less
its 11th word, 150 ms a word, about 5.6 s), never the microphone; every
other build hears the microphone. The haptic tick cannot be felt on the
simulator; the unit tests hold it (`src/sayit.property.test.ts`,
`src/sayit/today.test.tsx`, `src/sayit/guard.test.ts`).

## Sub-features

- `sayit-ended`: a press recites the passage; it ends with
  `36 of 37 words`, the mark `Missed word 11`, `Suggested: Hard` and
  `Hard` checked.
- `sayit-grade`: a tap on `Good` checks `Good` alone, and
  `Suggested: Hard` stays.
- `sayit-peek`: a tap on the mark reveals the word (`<word>, peeked`), the
  count reads `36 of 37 words, 1 peeked`, and `Good` stays checked.
- `sayit-again`: a second press recites again, and the new recital's own
  suggestion, `Hard`, is checked, with the mark back and no peek.

## How to get to it (user POV)

- Go through the first minute (`first.md`), tap `Continue`, then on Today
  tap `Say it`. Any later launch opens Today.

## Driving it

This feature changes nothing native, so the drive needs no iOS build when
the installed app has the dictation and growth modules (built at the
commit that added `apps/heartseed/native/growth` or later) and
`git diff --stat <that build's commit> HEAD -- apps/heartseed/native
apps/heartseed/vite apps/heartseed/vite.config.ts
apps/heartseed/react-native.config.cjs` is empty. Otherwise build first
(`SKILL.md`, Launch).

With `RUN`, `EVIDENCE` and `PORT` as `first.md` sets them, after its
steps 1 to 8 (and `grow.md`'s rows, when they run in the same drive):

1. The app is booted with the garden holding the passage's seed and the
   microphone revoked (`first.md` steps 1 to 8). A Today that a recital
   has ended on (`first-today`, or after `grow.md`'s rows) still shows
   that recital's count and grades, so relaunch for a clean one:
   `sim relaunch`.
2. `sim open / --expect "id=stage"`, then `sim snapshot today`
   → `today-passage` holds in the form its stage gives (`today.md`; after
   `grow.md`'s rows the passage is at a seed, its words in letters), a node
   `Say it` exists, no `Listening`, no
   radio label. Record the role the snapshot gives the `Today` node.
3. `sayit-ended`: `sim tap "label=Say it"` → ok. `sim snapshot
   sayit-listening` (record whether `Listening` is present). Wait for the
   end with `sim tap "label=36 of 37 words" --timeout 30` (a tap on the
   count does nothing), then `sim snapshot sayit-ended` → the label
   `36 of 37 words`; exactly one distinct label matching
   `^Missed word [0-9]+$`, and it is `Missed word 11`; `Suggested: Hard`;
   the labels `Again`, `Hard`, `Good` and `Easy`, every `Hard` line
   `[checked]` and no `Again`, `Good` or `Easy` line `[checked]`; `Say it`
   and no `Listening`; no line with the role `alert`. Then
   `xcrun simctl spawn <udid> log show --last 10m --style compact
   --predicate 'eventMessage CONTAINS "[dictation]" AND process ==
   "Heartseed"'` holds `[dictation] replay session=` and no
   `[dictation] listen`.
4. `sayit-grade`: `sim tap "label=Good"`, then `sim snapshot sayit-good`
   → every `Good` line `[checked]`, no `Hard` line `[checked]`, and
   `Suggested: Hard` still present.
5. `sayit-peek`: `sim tap "label=Missed word 11"`, then
   `sim snapshot sayit-peek` → no label matching `^Missed word`; the label
   `36 of 37 words, 1 peeked`; exactly one distinct label ending
   `, peeked`; every `Good` line still `[checked]`.
6. `sayit-again`: `sim tap "label=Say it"`, then
   `sim tap "label=36 of 37 words" --timeout 30`, then
   `sim snapshot sayit-again` → `Hard` `[checked]` again, `Missed word 11`
   present, and no label ending `, peeked`.
7. `sim doctor` (record `head` and `timingsHold`), then `sim down`.

Every snapshot holds the passage's words: read each for the strings above,
report only counts, booleans, the reference and the grade names, then
delete the `snapshots` folder.

## Gotchas

- A short label can appear on two nodes (an iOS radio is read as `other`
  with `[checked]` or `[unchecked]`), so check distinct labels and exact
  strings, never node counts.
- No screenshot, no recording and no sound; never grant the microphone or
  speech recognition. A simulator that hears the microphone (a device-info
  read that failed) ends `unavailable` and shows the alert: that is a
  failed `sayit-ended`.
- The recital auto-finishes when its last word lights; a source that ends
  first ends it as well, so the count appears without a second press.
