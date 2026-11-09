# Phrases: a long verse learned as phrases first, then joined

A verse of more than 12 words is cut at its punctuation into phrases of
4-12 words (`apps/heartseed/src/phrase.ts`), each a piece of its own under
the reference `<verse> [<first>-<last>]` (`John 3:16 [1-6]`). The session
offers a verse's phrases one a day, then the verse itself (the join) once
every phrase is at an ear, under first letters; after the join the phrases
leave the session (`apps/heartseed/README.md`, Phrases).

- **Which verses**: every long verse of a passage the reader holds and of
  the taught `Protection & Fear` collection. Never the first minute's
  Isaiah 41:10, which is learned whole. A verse of 12 words or fewer is
  learned whole (`John 15:1`, 11 words).
- **Today on a phrase**: the reference `John 3:16 [1-6]`, its own words
  under the cue, `Listen` on a new phrase (reading the phrase's words
  alone), and `Say it`, whose summary counts the phrase's words. The recall
  is kept under the phrase's reference: no new store key.
- **The field** never shows a phrase: a verse with only phrases planted is
  `<verse>, seed`, and its row and plant are the verse's. Days sown count
  phrase recalls; the harvest counts verses alone.
- **When I need…**: a planted phrase makes nothing known; a verse is known
  only once its own plant (the join) exists.

## Sub-features

- `phrase-day-one`: after the first minute, `Your field` → `Add verses`
  → `John` → `John 3` → `John 3:16` → `Plant`. The field shows the row
  `John 3:16` with the plant button `John 3:16, not planted` and no node
  naming `[`. Back
  on Today: no `1 new`, no `Listen`. (Holds on base too: a guard row.)
- `phrase-new` (the second session, after the next 04:00 local, with no
  uninstall): Today shows `1 new`; after the promise's review if it is
  due, the reference is `John 3:16 [1-6]`, its six words whole
  (`id=passage`), with `Listen` before `Say it`.
- `phrase-say`: `Listen` → the simulator logs `[voice] speak utterance=`
  with `skipped=simulator`, and six words light. Then `Say it` (the replay
  recites Isaiah 41:10's words, so the count is low; that is still a
  recall) → the summary reads `<k> of 6 words`; a grade; `Next`.
- `phrase-field`: the field's row `John 3:16` holds `John 3:16, seed`;
  there is no row or plant titled `John 3:16 [1-6]`; the
  `Protection & Fear` row holds 14 `<reference>, not planted` plants; the
  field shows `1 day sown` or more.
- `phrase-need`: When I need… in that session still lists `Isaiah 41:10`
  under `Strength` and `12 still to learn` under `Protection & Fear`: the
  planted phrase makes nothing known.
- `phrase-join` (tests only: the join after every phrase is at an ear,
  under first letters, needs at least three days of recalls per phrase,
  and the simulator's clock cannot be set):
  `apps/heartseed/src/session/phrases.property.test.ts`,
  `src/phrase/walk-*.test.tsx`, and the acceptance check's P5-P7, R1 and
  F2.
- `phrase-left` (tests only: the phrases gone from the plan after the
  join, the field folding them, the harvest counting verses only):
  `src/session/phrases.property.test.ts`, `src/field/phrases.test.ts`,
  `src/phrase/walk-*.test.tsx`, and the acceptance check's P5-P7 and R1.

## How to get to it (user POV)

- From Today, `Your field` → `Add verses` → a long verse (`John 3:16`)
  → `Plant`; its first phrase is new on Today after the next 04:00 local.

## Driving it

`RUN=hsphrase-l1` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`,
a free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time, local and UTC. Nothing native changes for
phrases, so an install of a build of `1064d4138` or later serves
(`SKILL.md`, Launch); the JavaScript comes from the dev server. The garden
must start empty: uninstall by udid as `first.md` says.

1. `first.md` steps 1-7: boot, uninstall, install, revoke the microphone,
   and the first minute to `first-today`.
2. `phrase-day-one`: `sim tap "label=Your field"`,
   `sim tap "id=add-verses"`, `sim tap "label=John"`,
   `sim tap "label=John 3"`, then `sim scroll screen down` until
   `John 3:16` shows clear of the footer (a snapshot after each scroll),
   `sim tap "label=John 3:16"`, `sim tap "label=Plant"`, `sim snapshot phrase-day-one-field` → the row
   titles `Isaiah 41:10`, `John 3:16`, `Protection & Fear`; the button
   `John 3:16, not planted`; no node whose label holds `[`. Then
   `sim tap "label=Today"`, `sim open / --expect "id=session"`,
   `sim snapshot phrase-day-one` → the counts line holds no `1 new`, no
   `Listen`.
3. `sim doctor` (record `head` and `timingsHold`) and `sim down`, keeping
   the install.
4. `phrase-new`, the second session, after the next 04:00 local, with no
   uninstall: `sim boot`, then `sim open / --expect "id=session"`,
   `sim snapshot phrase-new` → the counts line holds `1 new`; when the
   reference is `Isaiah 41:10` (its review due), run it through `Say it`
   and `Next` first, then snapshot again → the reference
   `John 3:16 [1-6]`, six `word-<i>` nodes in `id=passage`, `Listen`
   before `Say it`.
5. `phrase-say`: `sim tap "label=Listen"`, `sim snapshot phrase-listen`
   → six words lit; the log (`first.md`'s `xcrun simctl spawn <udid> log
   show` over `[voice]`, from this session's start) holds a
   `[voice] speak utterance=` line ending `skipped=simulator`. Then
   `sim tap "label=Say it"`, wait for the summary
   (`sim snapshot phrase-said` until it shows) → the summary
   `<k> of 6 words`, the `Grade` group with one radio checked, `Next`;
   then `sim tap "label=Next"`.
6. `phrase-field`: `sim tap "label=Your field"`, `sim snapshot
   phrase-field` → `John 3:16, seed` in the row `John 3:16`; no row title
   or plant label holding `[`; 14 `<reference>, not planted` buttons in the
   row `Protection & Fear` (count them); `1 day sown` or more. Then
   `sim tap "label=Today"`.
7. `phrase-need`: `sim tap "label=When I need…"`, `sim snapshot
   phrase-need` → the button `Isaiah 41:10` under `Strength`, the text
   `12 still to learn`. Then `sim tap "label=Today"`, `sim doctor` and
   `sim down`.

Report only counts, booleans, the labels named above, the counts line, the
summary and the references; delete the `snapshots` folder and the raw
snapshots.

## Gotchas

- The simulator's clock cannot be set: `phrase-new` and after need the
  second session, after the next 04:00 local. A third session
  (`John 3:16 [7-13]` new) is possible after another 04:00, but it proves
  nothing the tests do not.
- The second session is `passage.md`'s `passage-new` with John 3:16 in
  place of John 15:1-5. With another passage planted before John 3:16,
  that passage's first piece comes first: the new piece is the first piece
  no plant names, one a day.
- The replay always recites Isaiah 41:10's words, so a phrase's recital
  grades low (still a recall, kept under the phrase's reference).
- Tests alone own the cut over the whole KJV and odd texts, the join and
  its cue, phrases leaving, a phrase's review days, every zone, removed
  passages folding, the natural voice's marks over a phrase (it is not
  routed to Today yet), Fear's phrases past the first, its joins, and a
  visit of a known long verse said whole (`apps/heartseed/src/phrase*`,
  `src/session/phrases.property.test.ts`, `src/field/phrases.test.ts`,
  `src/phrase/walk-*.test.tsx`, `src/session/visit.property.test.ts`).
