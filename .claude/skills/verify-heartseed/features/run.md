# The run: Today one piece at a time

Today (`apps/heartseed/app/index.tsx`) runs the session's plan
(`session.md`) one piece at a time: a verse, whole, long or short
(`phrase.md`). It shows the held item if any, else
the first verse not done of a visit (a verse started from home by
`Practice anyway` or a tap on its plant,
`home.md`), else the plan's first item that is not done: its reference, its words under its cue (the full text for a new
piece, first letters at a seed, nothing from a blade on), its stage line,
and `Say it`. Once the recital's recall is kept, the result and the grades
stay, and the button reads `Next`. `Next` moves on to the next item. After
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
them. A recital that is not heard, or whose write is refused, leaves
`Say it` on the same verse.

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
- `run-held-field`: `Your field`, then `Start`: the same result and
  `Next`.
- `run-next`: `Next` gives the end (`home.md`'s `home-end`): the heading
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
  shows home with the heading `Your field` and `Start` (the verse just
  said is still held), and no heading `Settings`. In the sheet `5 min`
  alone is selected; a tap of `5 min`, then `Done`, gives home with no
  heading `Settings`, the Today card's `All tended for today` and no
  `Start`: a making with no recital under way drops the hold, and the
  verse just kept is not due.

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

1. `first.md` steps 1-7. Note `PLANTED` (`date`).
2. `run-done-first`: `sim snapshot run-done-first` → the nodes above. Then
   `session.md`'s `session-first`, `session-header` and `session-choose`
   (steps 2-3) and `session-field` (step 5), on the Today that
   a tap on `Isaiah 41:10, seed` opens.
3. `run-due`: wait until 7 minutes after `PLANTED`, then `sim relaunch`,
   `sim open / --expect "id=today-card"` → the Today card's
   `1 verse · about 1 min`, `1 to review` and `Start`; `sim tap "label=Start"`, `sim open / --expect
   "id=session" --no-relaunch`, and `sim snapshot run-due`, plus a raw snapshot
   (`agent-device snapshot --json --raw --observe-only --force-full
   --session verify-heartseed`) for the rects. When `PLANTED` was in the
   evening, record `Nothing to tend now` and stop here: only tests reach the
   rest (Gotchas).
4. `run-listening` and `run-recite`: `sim tap "label=Say it"`, a raw
   snapshot at once, then `sim tap "label=36 of 37 words" --timeout 30`,
   `sim snapshot run-recite`, and a raw snapshot for the rects.
5. `run-held-field`: `sim tap "label=Your field"`, `sim tap "label=Start"`,
   `sim snapshot run-held-field`.
6. `run-next`: `sim tap "label=Next"`, `sim snapshot run-next`.
7. `run-second`, only when the drive started before 16:00 local: wait 15
   minutes from step 4, `sim tap "label=Your field"`,
   `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, `sim tap "label=5 min"`,
   `sim tap "label=Done"`, `sim tap "label=Start"`, `sim snapshot
   run-second-due`, `sim tap "label=Say it"`, `sim tap "label=37 of 37
   words" --timeout 30` (or the count the replay gives), `sim snapshot
   run-second`, `sim tap "label=Next"` (or step 8 in its place).
8. `run-held-settings`, only when the drive started before 16:00 local,
   in place of step 7's `Next`: `sim tap "label=Your field"`,
   `sim snapshot run-held-home` → the heading `Your field`, `Start`, no
   heading `Settings`; record the Today card's lines as shown. Then
   `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, a raw snapshot → `5 min` alone selected;
   `sim tap "label=5 min"`, `sim tap "label=Done"`, `sim snapshot
   run-held-settings` → no heading `Settings`, the Today card's
   `All tended for today`, no `Start`. `run-second`'s last claim (`Next`
   and the end) is `run-next`'s already, at an ear.

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
  - Again on a kept recall;
  - a second recital in one sitting (`apps/heartseed/src/sayit/today.test.tsx`).
- A return to the foreground makes the plan again too, and drops a shown
  result: `wake.md` drives it (`wake-due`, `wake-result`). A relaunch
  (`sim relaunch`) or a `Minutes` tap also makes it.
