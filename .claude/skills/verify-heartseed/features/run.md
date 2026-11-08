# The run: Today one verse at a time

Today (`apps/heartseed/app/index.tsx`) runs the session's plan
(`session.md`) one verse at a time. It shows the held item if any, else
the first verse not done of a visit (a promise tapped on When I need…,
`promise.md`), else the plan's first item that is not done: its reference, its words under its cue (the full text for a new
verse, first letters at a seed, nothing from a blade on), its stage line,
and `Say it`. Once the recital's recall is kept, the result and the grades
stay, and the button reads `Next`. `Next` moves on to the next item. After
the last item, and whenever the plan holds nothing to tend, Today shows the
done state: under the header there is only the counts line,
`Nothing to tend now`. There is no reference, no verse, no grade and no
button.

The action button (`Say it`, `Listening`, `Next`) and the `Grade` group sit
in a fixed footer under the scroll view, so a reader never scrolls to reach
them. A recital that is not heard, or whose write is refused, leaves
`Say it` on the same verse.

A plan is made when Today first shows in a launch, and again at each
`Minutes` tap. A tap made with no recital under way starts the run again at
the new plan's first item, and an earlier result is gone. A tap made while
a recital listens keeps that verse on screen until its `Next`. Nothing of
the run is stored. A relaunch makes a new plan.

The app holds Isaiah 41:10, then the reader's passages (`passage.md`),
then the Fear collection's verses (`promise.md`). On the first minute's
day no new verse is offered, so this drive's plan holds at most one
item: Isaiah 41:10. After the first minute's alone recital (the replay suggests Hard),
the passage is due again 6 minutes later. That is FSRS's step. A planting
after 18:00 local is due at 04:00 the next morning.

## Sub-features

Every row runs from `first.md`'s `first-today`. `PLANTED` is the local time
of `first-planted`.

- `run-done-first`: Today after the first minute is the done state: the
  counts line `Nothing to tend now`, the header (`Today`, `Your field`,
  `When I need…`, the four `Minutes` radios, `Voice`), and no `Say it`, `Next`, `Grade` or
  `Isaiah 41:10` node on Today.
- `run-due` (daytime only, when `PLANTED` was between 04:00 and 17:52
  local): 7 minutes after `PLANTED`, a tap on the checked `5 min` makes a
  new plan. Today then shows `1 to tend · about 1 min`, the reference
  `Isaiah 41:10`, 37 `word-<i>` nodes in first letters (a seed), and
  `Say it`. In a raw snapshot, `Say it` lies wholly inside the window,
  below the last word node and clear of the bottom safe area.
- `run-recite`: `Say it`, then the recital ends (`36 of 37 words`):
  `Stage: blade`, `Grew to a blade.`, the `Grade` group with one radio
  checked, and a button `Next` where `Say it` was, with no `Say it`. In a
  raw snapshot, `Next` and the four grade radios lie wholly inside the
  window, with no scroll.
- `run-held-field`: `Your field`, then `Today`: the same result and `Next`.
- `run-next`: `Next` gives the done state again (as `run-done-first`).
- `run-listening`: during `run-recite`'s recital, a raw snapshot taken at
  once after `Say it` shows `Listening`, the four `Minutes` radios and
  `Voice` in the header.
- `run-second` (only when the drive started before 16:00 local): once the
  passage is due again after `run-recite` (wait 15 minutes, then tap the
  checked `5 min`), Today shows `1 to tend`, no word node labelled (nothing
  is cued at a blade), and `Say it`. A recital gives `Stage: ear` and
  `Grew to an ear.`, then `Next` and the done state.

## How to get to it (user POV)

- Go through the first minute and tap `Continue`: Today has nothing to tend
  yet. Come back once the verse is due: Today shows it, and `Say it`. Say
  it, then tap `Next`.

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
   (steps 2-3) and `session-field` (step 5). Each now shows the done state
   under the header.
3. `run-due`: wait until 7 minutes after `PLANTED`, then
   `sim tap "label=5 min"` and `sim snapshot run-due`, plus a raw snapshot
   (`agent-device snapshot --json --raw --observe-only --force-full
   --session verify-heartseed`) for the rects. When `PLANTED` was in the
   evening, record `Nothing to tend now` and stop here: only tests reach the
   rest (Gotchas).
4. `run-listening` and `run-recite`: `sim tap "label=Say it"`, a raw
   snapshot at once, then `sim tap "label=36 of 37 words" --timeout 30`,
   `sim snapshot run-recite`, and a raw snapshot for the rects.
5. `run-held-field`: `sim tap "label=Your field"`, `sim tap "label=Today"`,
   `sim snapshot run-held-field`.
6. `run-next`: `sim tap "label=Next"`, `sim snapshot run-next`.
7. `run-second`, only when the drive started before 16:00 local: wait 15
   minutes from step 4, `sim tap "label=5 min"`, `sim snapshot
   run-second-due`, `sim tap "label=Say it"`, `sim tap "label=37 of 37
   words" --timeout 30` (or the count the replay gives), `sim snapshot
   run-second`, `sim tap "label=Next"`.

Report only counts, booleans, rect numbers, the labels named, the counts
line and the reference. Delete the `snapshots` folder and the raw
snapshots.

## Gotchas

- The simulator takes the host's clock and zone, and the drive changes
  neither. Every live recital on Today after the first minute waits for the
  passage's due time. Tests alone own:
  - many verses in one run, the mixed order, and a new verse under its full
    text (`apps/heartseed/src/run/*.test.tsx`);
  - the hold across a Minutes tap while a recital listens;
  - unheard and refused recitals;
  - the unread garden;
  - Again on a kept recall;
  - a second recital in one sitting (`apps/heartseed/src/sayit/today.test.tsx`).
- A return to the foreground makes the plan again too, and drops a shown
  result: `wake.md` drives it (`wake-due`, `wake-result`). A relaunch
  (`sim relaunch`) or a `Minutes` tap also makes it.
