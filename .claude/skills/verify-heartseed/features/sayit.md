# Say it

Say it is Today's one button (`apps/heartseed/app/index.tsx`, over
`apps/heartseed/src/sayit.ts`). A press starts a recital of the passage
through the app's one Dictation (`apps/heartseed/src/app.ts`): the words
hide, each word lights as it is said with a soft haptic tick, and a missed
word shows only a mark, `Missed word <n>`, that a tap reveals (a peek).
When the recital ends, Today shows `<lit> of <total> words` (and
`, <n> peeked` once a word was peeked), `Suggested: <grade>`, and the four
grades `Again`, `Hard`, `Good` and `Easy` as a radio group with the
suggestion checked; the reader can change it. A recital that could not be
heard shows one alert and the verse whole, with no grade. Say it reads no
word aloud.

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

- Open the app on Today and tap `Say it`.

## Driving it

This feature changes nothing native, so the drive needs no iOS build when
the installed app has the dictation module (built at d7a904c4b or later)
and `git diff --stat d7a904c4b HEAD -- apps/heartseed/native
apps/heartseed/vite apps/heartseed/vite.config.ts
apps/heartseed/react-native.config.cjs` is empty. Otherwise build first
(`SKILL.md`, Launch).

With `RUN=hssayit-l5`, `EVIDENCE=$PWD/tmp/verify/$RUN` and a free `PORT`
of 8280-8289:

1. `sim boot --port $PORT --out "$EVIDENCE"` → ok. Then
   `xcrun simctl privacy <udid> revoke microphone app.heartseed`.
2. `sim open / --expect "label=Isaiah 41:10"`, then `sim snapshot today`
   → `today-passage` holds, a node `Say it` exists, no `Listening`, no
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
