# The run: Today one piece at a time

Today (`apps/heartseed/app/index.tsx`) runs the session's plan
(`session.md`) one piece at a time: a verse, whole, long or short
(`phrase.md`). It shows the held item if any, else
the first verse not done of a visit (a verse started from home by
`Practice anyway` or a tap on its plant,
`home.md`), else the plan's first item that is not done: its reference, its words under its cue (the full text for a new
piece, first letters at a seed, nothing from a blade on), its stage line,
and `Say it`. Once the recital finishes with a recall, the result and the
grades stay, and the button reads `Next`. That recall waits: Today draws
the verse as if it were kept (its stage, its growth line, its counts), a
grade or a peek changes it, and only `Next` keeps it in the garden and
moves on to the next item. Leaving Today before `Next` (by `Your field`,
the app going to the background, or the app closing) records nothing:
the verse stays as it was, and coming back offers `Say it` on it again
(`apps/heartseed/src/run/footer.test.tsx`). After
the last item's `Next`, Today shows the end of the run: the heading
`The field is tended`, the header's `Your field` the only button, and in
the scroll view a sun, the line `Nothing grew this time.`,
`1 grew a stage.` or `<n> grew a stage.`, and one image per grown verse
labelled `<reference>, <stage>` (the visit's verses first, then the
plan's). There is no counts line, verse, grade or other button. When the
run holds nothing to tend (no visit and an empty plan), Today shows the
done state: the heading `Today` and under it only the counts line,
`Nothing to tend now`. There is no reference, no verse, no grade and no
button.

The action button (`Say it`, `Listening`, `Next`) and the `Grade` group sit
in a fixed footer under the scroll view, so a reader never scrolls to reach
them. A recital that is not heard, or whose write `Next` makes is
refused, leaves `Say it` on the same verse.

A plan is made when home or Today first shows in a launch, and again at
each `Minutes` tap (in home's Settings sheet). Today is reached from home by the Today card's `Start` (shown exactly
when the plan or a visit holds an item) or `Practice anyway`, or by a
tap on a verse's plant, and left by `Your field`. A tap made with no recital under way starts the run again at
the new plan's first item, and an earlier result is gone. A reader cannot
make a `Minutes` tap while a recital listens, since the sheet is on home
alone and Today shows no `Your field` then; the session keeps the verse
for such a making (`apps/heartseed/src/session/cells.property.test.ts`;
the phrase walks make that making at the session seam too, a long
verse's recital listening, `apps/heartseed/src/test/phrase-rig.tsx`),
and a return to the foreground while it listens keeps the verse
(`wake.md`). Nothing of the run is stored. A relaunch makes a new plan.

The app holds Isaiah 41:10, then the reader's passages (`passage.md`),
then the Fear collection's verses (`promise.md`), each verse whole, long
or short (`phrase.md`). On the first minute's
day no new piece is offered, so this drive's plan holds at most one
item: Isaiah 41:10. After the first minute's alone recital (the replay suggests Hard),
the passage is due again 6 minutes later. That is FSRS's step. A planting
after 18:00 local is due at 04:00 the next morning.

## Sub-features

Every row runs from `first.md`'s `first-home`. `PLANTED` is the local time
of `first-planted`.

- `run-done-first`: home after the first minute is the done state: the
  heading `Your field`, the Today card's `All tended for today` with
  `Practice anyway` and no `Start`, no `When I need…`, and no heading `Today`, no
  `Say it`, `Next` or `Grade`.
- `run-due` (daytime only, when `PLANTED` was between 04:00 and 17:52
  local): 7 minutes after `PLANTED`, a relaunch makes a new plan. Home
  then offers `Start` with `1 verse · about 1 min` and `1 to review`, and `Start` shows
  Today with `1 to tend · about 1 min`, the reference
  `Isaiah 41:10`, 37 `word-<i>` nodes in first letters (a seed) in its
  lines (`word-8`, `word-16`, `word-20` and `word-25` each starting a row,
  `fade.md`'s `lines-letters`), and `Say it`. In a raw snapshot, `Say it` lies wholly inside the window,
  below the last word node and clear of the bottom safe area.
- `run-recite`: `Say it`, then the recital ends (`36 of 37 words`):
  `Stage: blade`, `Grew to a blade.`, the `Grade` group with one radio
  checked, and a button `Next` where `Say it` was, with no `Say it`. In a
  raw snapshot, `Next` and the four grade radios lie wholly inside the
  window, with no scroll.
- `run-held-field`: `Your field` before `Next`, then `Start`: Today shows
  `Isaiah 41:10` at `Stage: seed` with `Say it`, and no `Next` and no
  grade: leaving let the recital go, and nothing was recorded. Red on
  base, which kept the recital and showed the result and `Next`.
- `run-next`: a second recital (`36 of 37 words`, `Stage: blade`, `Next`),
  then `Next` gives the end (`home.md`'s `home-end`): the heading
  `The field is tended` and no heading `Today`, the text
  `1 grew a stage.`, an image labelled `Isaiah 41:10, blade`, a button
  `Your field`, and no `Nothing to tend now`, `Say it`, `Next`, `Grade`,
  `Settings`, `Minutes` or `Voice`. Record how the tree shows the image's
  `role="img"`.
- `run-listening`: during `run-recite`'s recital, a raw snapshot taken at
  once after `Say it` shows `Listening`, and no `Minutes` radio, no
  `Voice`, no `Your field`, no `Settings`, no `Plant`, no `Remove` and no
  heading `Settings`: no making of the plan can be reached while a recital
  listens.
- `run-second` (only when the drive started before 16:00 local): once the
  passage is due again after `run-recite` (wait 15 minutes, then
  `Your field`, `Settings`, the checked `5 min`, `Done`, `Start`), Today shows `1 to tend`, no word node labelled (nothing
  is cued at a blade), and `Say it`. A recital gives `Stage: ear` and
  `Grew to an ear.`, then `Next` and the end with `1 grew a stage.` and an
  image `Isaiah 41:10, ear`. Or, in its place, the grade `Again`, then
  `Next`: `Nothing grew this time.` and no image.
- `run-held-settings` (only when the drive started before 16:00 local,
  after `run-second`'s recital, in place of its `Next`): `Your field`
  shows home with the heading `Your field` and `Start` (the recital let
  go, the verse still due), and no heading `Settings`. In the sheet
  `5 min` alone is selected; a tap of `5 min`, then `Done`, gives home
  with no heading `Settings`, the Today card and `Start`: the verse left
  before `Next` was not kept, so it is still due.

## How to get to it (user POV)

- Go through the first minute and tap `Continue`: home has nothing to
  tend yet. Come back once the verse is due: home offers `Start`, and
  Today shows the verse and `Say it`. Say it, then tap `Next`.

## Driving it

Nothing native changes. Use an incremental `sim install` of the head under
`lockf -k /tmp/manna-ios-build.lock`, with the bars of `SKILL.md`, Launch.
Or use `--app` with a build of `d19c8ed2e` or later: the JavaScript comes
from the dev server. The garden must start empty: uninstall by udid as
`first.md` says. Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md`
sets them.

The taps are journeys beside this file, each run in one `sim journey`
call: `run`, `run-recite`, `run-next`, `run-second` and `run-held`
(`run.journey.json`, `run-<segment>.journey.json`). Their `shows` and
`hides` hold what a selector can say; the waits for the clock, the raw
snapshots and the log lie between them, by hand. A receipt
(`$EVIDENCE/snapshots/<journey>-<nn>-<step>.txt`, cited below as
`<journey>/<step>`) holds the visible nodes' types and labels, with a
radio's `[checked]`: the counts line, a label built at run time
(`Suggested: Hard`, `36 of 37 words, 1 peeked`) and a checked grade are
read there. A raw snapshot (`first.md`, Driving it) holds the rects, and
the `Grew to …` line (`id=growth`), which the receipt leaves out though
it lies above the fold. Each journey's first step opens `/` and shows where it starts
(the Today card, or the verse's `Say it` or `Next`), so a journey run on
the wrong screen fails there.

1. `first.md` steps 1-7. Note `PLANTED` (`date`).
2. `run-done-first`: `first/first-home` → the nodes above. Then
   `session.md`'s `session-first`, `session-header` and `session-choose`
   (steps 2-3) and `session-field` (step 5), on the Today that
   a tap on `Isaiah 41:10, seed` opens.
3. `run-due`: wait until 7 minutes after `PLANTED`, then
   `sim journey run` → `"ok":true`: a launch (a new plan) on home with the
   Today card and `Start`, then `Start` to Today. `run/run-due-home`: the
   card's `1 verse · about 1 min`, `1 to review` and `Start`.
   `run/run-due`: the row's nodes, the counts line `1 to tend · about 1
   min`. Then a raw snapshot for the rects. When `PLANTED` was in the
   evening, the journey fails at `run-due-home` (no `Start`): record the
   card's `All tended for today` and stop here: only tests reach the rest
   (Gotchas).
4. `run-listening` and `run-recite`: `sim journey run-recite` →
   `"ok":true`: `Say it`, then the wait for the end (a tap on
   `36 of 37 words`, which does nothing). `run-recite/run-listening`,
   taken as the `Say it` tap ends: when it holds `Listening`, no `Minutes`
   radio, no `Voice`, no `Your field`, no `Settings`, no `Plant`, no
   `Remove`. The simulator's scripted recital can end before the receipt
   (it then holds the end, as `run-recite/run-recite`): the journey does not
   wait for `Listening`, and `run-listening` is then unproven in that run.
   `run-recite/run-recite`: `Stage: blade`, the grade radios with one
   `[checked]`, `Next`, no `Say it`. Then a raw snapshot for the rects and
   `id=growth`'s `Grew to a blade.`.
5. `run-held-field` and `run-next`: `sim journey run-next` → `"ok":true`.
   Its first steps are `sayit.md`'s grade and peek (`run-next/sayit-grade`,
   `run-next/sayit-peek`); then `Your field` and `Start`
   (`run-next/run-held-field`: `Stage: seed`, `Say it`, no `Next`); then
   `Say it` again and the wait for its end (`run-next/run-next-recite`:
   `Stage: blade`, `Next`).
6. `run-next/run-next`: the row's nodes; no `Grade`, `Settings`, `Minutes`
   or `Voice`; record how the line holds the image's `role="img"`.
   When `grow.md` rides this drive, its `grow-restart` journey runs now,
   before the verse is due again (it ends on home, in the done state).
7. `run-second`, only when the drive started before 16:00 local: wait 15
   minutes from step 4, then `sim journey run-second` → `"ok":true`
   (from the end or home, a relaunch to home): `Settings`, the
   checked `5 min` again, `Done` (a making), `Start`, `Say it`, and the
   end. `run-second/run-second-due`: `1 to tend`, no word node labelled.
   `run-second/run-second`: `Stage: ear`; a raw snapshot: `id=growth`'s
   `Grew to an ear.`. Its `Next`
   and the end are `run-next`'s at an ear, so step 8 takes its place.
8. `run-held-settings`, only when the drive started before 16:00 local:
   `sim journey run-held` → `"ok":true`. `run-held/run-held-home`: the
   heading `Your field` and `Start`; record the Today card's lines.
   `run-held/run-held-sheet`: `5 min` alone `[checked]`.
   `run-held/run-held-settings`: no heading `Settings`, the Today card and
   `Start`. In a drive of its own, `grow.md`'s
   `grow-again` takes this step's place.

Report only counts, booleans, rect numbers, the labels named, the counts
line and the reference. Delete the `snapshots` folder and the raw
snapshots.

## Gotchas

- The simulator takes the host's clock and zone, and the drive changes
  neither. Every live recital on Today after the first minute waits for the
  passage's due time. Tests alone own:
  - many verses in one run, the mixed order, and a new verse under its full
    text (`apps/heartseed/src/run/*.test.tsx`);
  - long verses over days, whole, beside old pieces, and a held long
    verse (`apps/heartseed/src/phrase/walk-*.test.tsx`);
  - the hold across a Minutes making while a recital listens or finishes,
    which no reader can make from the screen
    (`apps/heartseed/src/session/cells.property.test.ts`);
  - unheard, refused and cancelled endings around a making;
  - the moved and kept placings over many pieces and groups
    (`apps/heartseed/src/run/cells.test.tsx`);
  - the sheet's look in dark on each trip
    (`apps/heartseed/src/look/today.test.tsx`), and the reader walk's
    Minutes trip between chooser changes
    (`apps/heartseed/src/chooser/reader-today.test.tsx`);
  - unheard and refused recitals;
  - the unread garden;
  - Again on a recall pending for `Next`;
  - a leave before `Next` by `Your field`, a return or a relaunch, with
    nothing recorded (`apps/heartseed/src/run/footer.test.tsx`, the run
    and wake walks);
  - a second recital in one sitting (`apps/heartseed/src/sayit/today.test.tsx`).
- A return to the foreground makes the plan again too, and drops a shown
  result: `wake.md` drives it (`wake-due`, `wake-result`). A relaunch
  (a journey's `open` that relaunches) or a `Minutes` tap also makes it.
