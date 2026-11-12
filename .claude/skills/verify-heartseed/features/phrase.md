# Whole verses: a long verse learned whole, old pieces kept

A verse is the one thing a reader plants, learns, practises and sees,
whole, under its plain reference (owner, 2026-11-12). An earlier build cut
each verse of more than 12 words into pieces of 4-12 words under the
reference `<verse> [<first>-<last>]` and planted them one a day before the
verse itself; nothing cuts or plants a piece now. Pieces an earlier build
stored stay stored as they were (`apps/heartseed/README.md`, Old pieces).

- **Which verses**: every verse of a passage the reader holds and of the
  taught `Protection & Fear` collection, long or short, is one piece,
  whole: `Psalms 91:1` (19 words) is Fear's first new piece.
- **Today on a long verse**: the reference is the verse's own, its words
  whole under the cue, `Listen` on a new verse (reading all its words),
  and `Say it`, whose summary counts all its words. The recall is kept
  under the verse's reference.
- **Old pieces**: never offered, reviewed or shown. A verse whose only
  plants are old pieces is `<verse>, not planted` on the field (bare soil)
  and a verse to learn, under the full text with `Listen`; its old pieces'
  recitals still count in days sown. No text or accessible name on any
  screen holds a word range (`[<n>-<n>]`).

## Sub-features

- `phrase-day-one`: after the first minute, home's `Add a list`
  → `Any passage` → `John` → `John 3` → `John 3:16` → `Plant`. The field shows the row
  `John 3:16` with the plant button `John 3:16, not planted` and no node
  naming `[`, and the Today card's parts line no `1 new` (so Today, if `Start` opens
  it, no `Listen`). (Holds on base too: a guard row.)
- `whole-new` (the second session, after the next 04:00 local, with no
  uninstall): the Today card's `Start` shows Today with `1 new`; after the
  promise's review if it is due, the reference is `John 3:16`, its 25
  words whole (`id=passage`, in its lines: `line-0` … `line-2` and
  `break-6`, `break-13`), with `Listen` before `Say it`; while
  `Listen` reads, `id=reading` holds 25 `word-<i>` nodes and the same two
  breaks; after `Say it`
  the summary reads `<k> of 25 words`.
- `whole-field`: then `Your field`: the field's row `John 3:16` holds
  `John 3:16, seed`; no node on any snapshot of the run matches
  `\[\d+-\d+\]`; the `Protection & Fear` row holds 14
  `<reference>, not planted` plants; the field shows `1 day sown` or more.
- `whole-migrate` (the owner's phone state): a garden whose Fear verse
  `Psalms 91:1` holds an old piece, kept by main's build at `e27f247c9`
  (or any build before this one), read on this build with no uninstall:
  home holds `Psalms 91:1, not planted` and the caption `14 verses to
  learn`, days sown as before the switch; one tap on that plant opens
  Today on `id=reference` `Psalms 91:1` with `Listen`; after `Say it` the
  summary reads `<k> of 19 words`; after a grade and `Your field`,
  `Psalms 91:1, seed` and `14 verses · 1 planted`.
- `whole-left` (tests only: old pieces never planned, their verse
  `not planted` until said whole, every stored record kept, days sown
  never falling, a piece planted today spending the day's new piece):
  `apps/heartseed/src/session/phrases.property.test.ts`,
  `src/field/phrases.test.ts`, `src/phrase/walk-*.test.tsx`, and the
  acceptance check's `whole.accept.test.ts`.

## How to get to it (user POV)

- From home, `Add a list` → `Any passage` → a long verse (`John 3:16`)
  → `Plant`; it is new on Today, whole, after the next 04:00 local.
- An old piece: only a garden kept by an earlier build holds one.

## Driving it

`RUN=hspiece-l1` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`,
a free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time, local and UTC. Nothing native changes for
whole verses, so an install of a build of `1064d4138` or later serves
(`SKILL.md`, Launch); the JavaScript comes from the dev server. The garden
must start empty: uninstall by udid as `first.md` says.

1. `first.md` steps 1-7: boot, uninstall, install, revoke the microphone,
   and the first minute to `first-home`.
2. `phrase-day-one`: on home,
   `sim tap "id=add-list"`, `sim tap "label=Any passage"`,
   `sim tap "label=John"`,
   `sim tap "label=John 3"`, then `sim scroll screen down` until
   `John 3:16` shows clear of the footer (a snapshot after each scroll),
   `sim tap "label=John 3:16"`, `sim tap "label=Plant"`, `sim snapshot phrase-day-one-field` → the row
   titles `Isaiah 41:10`, `John 3:16`, `Protection & Fear`; the button
   `John 3:16, not planted`; no node whose label holds `[`; the Today
   card's parts line holds no `1 new`. When the card offers `Start` (the
   promise's review due), `sim tap "label=Start"`,
   `sim open / --expect "id=session" --no-relaunch`, `sim snapshot phrase-day-one` → no
   `Listen`; then `sim tap "label=Your field"`.
3. `sim doctor` (record `head` and `timingsHold`) and `sim down`, keeping
   the install.
4. `whole-new`, the second session, after the next 04:00 local, with no
   uninstall: `sim boot`, then `sim open / --expect "id=today-card"` → the Today
   card's parts line holds `1 new`, with `Start`; `sim tap "label=Start"`,
   `sim open / --expect "id=session" --no-relaunch`,
   `sim snapshot whole-new` → the counts line holds `1 new`; when the
   reference is `Isaiah 41:10` (its review due), run it through `Say it`
   and `Next` first, then snapshot again → the reference `John 3:16`, its
   words whole in `id=passage` as its three `line-<i>` texts with
   `break-6` and `break-13` between (more than 20 words, so in its lines,
   `today.md`'s `lines-plain`), `Listen` before `Say it`. Then
   `sim tap "label=Listen"`, then two raw snapshots about 1 s apart while
   it reads (`light.md`, Driving it, and its step 6) → in each,
   `id=reading` in place of `id=passage`, holding 25 `word-<i>` nodes and
   `break-6`, `break-13`,
   one or two `selected`, the second's first index greater than the
   first's. Then `sim open / --expect "label=Listen" --no-relaunch` (a
   wait for the finish), `sim tap "label=Say it"`, wait for the summary
   (`sim snapshot whole-said` until it shows) → the summary
   `<k> of 25 words`, the `Grade` group with one radio checked, `Next`;
   then `sim tap "label=Next"`.
5. `whole-field`: `sim tap "label=Your field"`, `sim snapshot
   whole-field` → `John 3:16, seed` in the row `John 3:16`; no row title,
   text or label in this or any earlier snapshot of the run matching
   `\[\d+-\d+\]`; 14 `<reference>, not planted` buttons in the row
   `Protection & Fear` (count them); `1 day sown` or more. Then
   `sim doctor` and `sim down`.

### The migration (`whole-migrate`)

On an install of its own, by the batch verifier, who holds two rifts:
main's (`hymnapp-main` at `e27f247c9`, any build before this one) and the
head's.

1. Serve main's rift on `PORT`: `first.md` steps 1-7 to `first-home`, then
   `home.md`'s `home-learn` as main drives it (a tap on
   `Psalms 91:1, not planted`, then main's `Learn Psalms 91:1`) →
   `id=reference` `Psalms 91:1 [1-9]` (base red); `Say it`, a grade,
   `Your field`; `sim snapshot whole-migrate-main` → record the days sown.
2. `sim down`, keeping the install. Stop main's dev server; serve the
   head's rift on the same `PORT`; `sim boot`, `sim open / --expect
   "id=today-card"` (a relaunch, no uninstall); `sim scroll
   "label=Psalms 91:1, not planted" down`, `sim snapshot
   whole-migrate-home` → the button `Psalms 91:1, not planted`, the
   caption `14 verses to learn`, the days sown as recorded in step 1, and
   no node matching `\[\d+-\d+\]`.
3. `sim tap "label=Psalms 91:1, not planted"` (one tap),
   `sim open / --expect "id=session" --no-relaunch`, `sim snapshot
   whole-migrate-today` → `id=reference` `Psalms 91:1` and `Listen`.
   `sim tap "label=Say it"` and the recital as `run.md`'s → the summary
   `<k> of 19 words`; a grade; `sim tap "label=Your field"`, `sim scroll
   "label=Psalms 91:1, seed" down`, `sim snapshot whole-migrate-after` →
   `Psalms 91:1, seed` and `14 verses · 1 planted`. Then `sim doctor` and
   `sim down`.

Report only counts, booleans, the labels named above, the counts line, the
summary and the references; delete the `snapshots` folder and the raw
snapshots.

## Gotchas

- The simulator's clock cannot be set: `whole-new` and after need the
  second session, after the next 04:00 local.
- The second session is `passage.md`'s `passage-new` with John 3:16 in
  place of John 15:1-5. With another passage planted before John 3:16,
  that passage's first verse comes first: the new piece is the first piece
  no plant names, one a day.
- The replay always recites Isaiah 41:10's words, so a long verse's
  recital grades low (still a recall, kept under the verse's reference).
- On the day an old piece was planted (step 1 of the migration) no new
  piece is offered, as on any day a plant was first recalled: the tap
  still starts the verse.
- Tests alone own old pieces at every stage, a verse planted beside its
  old pieces, a piece whose verse no list holds, every zone, a rollback's
  reading, and a visit of a known long verse said whole
  (`apps/heartseed/src/phrase*`, `src/session/phrases.property.test.ts`,
  `src/field/phrases.test.ts`, `src/phrase/walk-*.test.tsx`,
  `src/session/visit.property.test.ts`).
