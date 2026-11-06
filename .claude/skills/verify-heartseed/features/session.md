# The daily session

Today (`apps/heartseed/app/index.tsx`) shows the day's session as a plan made
by `apps/heartseed/src/session.ts`: the due reviews, then one new piece,
within the minutes the reader chose. Today's fixed header, above the
scrolling passage, holds the session's two choices: the radio group
`Minutes` (`2 min`, `5 min`, `10 min`, `20 min`; `5 min` until the reader
picks another) and the switch `Voice` (on until the reader turns it off).
Both are kept in the device's store across launches (their keys:
`apps/heartseed/README.md`, Session). Neither shows in the
first minute. Both stay on screen, outside the scroll view, while Say it
listens.

At the top of the scroll view, above the reference, the counts line
(`id=session`) says what the session holds: `<n> to tend`, `1 new`,
`about <k> min`, joined by `·`, or `Nothing to tend now`. It never counts
the backlog. The plan is made when Today first shows in a launch, and again
at each Minutes tap. An item is done once its verse holds a new recall.
Today runs the plan one verse at a time (`run.md`): when the line reads
`Nothing to tend now`, Today shows the done state, with no `Say it`.

A verse planted in the evening (18:00 to 03:59 local) is not due before
04:00 the next morning. Otherwise FSRS's due date rules, so after the first
minute's alone recital (the replay suggests Hard), the passage is due again
6 minutes later.

## Sub-features

Every row runs from `first.md`'s `first-today`. `PLANTED` is the local time
of `first-planted`.

- `session-first`: Today after the first minute shows the group `Minutes`
  with four radios `2 min`, `5 min`, `10 min` and `20 min`, `5 min` alone
  checked, the switch `Voice` checked, and `Nothing to tend now`. No
  snapshot of the first minute (`first-launch` to `first-planted`) holds
  `Minutes`, `Voice`, `to tend` or `Nothing to tend`.
- `session-header`: in a raw snapshot of `first-today`, each radio and the
  switch lies wholly inside the window, above the counts line (`id=session`;
  Today is the done state, so no `Isaiah 41:10` shows), and clear of the
  bottom safe area. A tap on `10 min` with no scroll checks it. The same
  tap while the recap and the grade row show is `run.md`'s `run-recite`
  state.
- `session-choose`: after `Voice` is tapped off and `20 min` is picked, a
  relaunch shows `20 min` checked and `Voice` not checked.
- `session-listening`: moved into `run.md`'s `run-listening`, after the
  wait.
- `session-due`: replaced by `run.md`'s `run-due`: 7 minutes after
  `PLANTED`, a Minutes tap makes the plan, with no relaunch needed (a
  relaunch still works). The evening rule stays: a planting from 18:00 to
  03:59 local shows `Nothing to tend now` until 04:00 the next morning.
- `session-tend`: replaced by `run.md`'s `run-recite` and `run-next`: the
  recital leaves `Next`, and `Next` the done state, never `Say it`.
- `session-field`: `Your field`, then `Today`, leaves the counts line as it
  was, and the done state with it.

## How to get to it (user POV)

- Go through the first minute and tap `Continue`. The header shows the
  minutes and the voice, and the line under it shows what to tend.

## Driving it

Nothing native changes. Use an incremental `sim install` of the head under
`lockf -k /tmp/manna-ios-build.lock`, with the bars of `SKILL.md`, Launch.
Or use `--app` with a build of `d19c8ed2e` or later: the JavaScript comes
from the dev server. The garden must start empty: uninstall by udid as
`first.md` says. Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md`
sets them.

1. `first.md` steps 1-6. Before each of `first-launch`, `first-letters`,
   `first-alone` and `first-planted`, check the snapshot for
   `session-first`'s absences. Note `PLANTED` (`date`).
2. `session-first` and `session-header`: `first.md` step 7 (`first-today`),
   then:
   - check the snapshot for the nodes above;
   - take a raw snapshot (`agent-device snapshot --json --raw --observe-only
     --force-full --session verify-heartseed`) and read the rects of the
     radios, the switch, the counts line (`id=session`) and the window,
     keeping only numbers;
   - `sim tap "label=10 min"`, then `sim snapshot session-header` →
     `10 min` checked.
3. `session-choose`: `sim tap "label=Voice"`, `sim tap "label=20 min"`,
   `sim relaunch`, `sim open / --expect "id=session"`,
   `sim snapshot session-choose` → `20 min` checked, `Voice` not checked,
   `Nothing to tend now`. Turn the voice back on with `sim tap "label=Voice"`,
   and pick `5 min` again (`run.md`'s `run-due` taps the checked `5 min`).
4. (`session-listening` is `run.md`'s `run-listening`.)
5. `session-field`: `sim tap "label=Your field"`, `sim tap "label=Today"`,
   `sim snapshot session-field` → the counts line as in step 3, and no
   `Say it`.
6. `session-due` and `session-tend` are `run.md`'s `run-due`, `run-recite`
   and `run-next`: go on with `run.md`, Driving it, from step 3.

Report only counts, booleans, rect numbers, the labels named, the counts
line and the reference. Delete the `snapshots` folder and the raw
snapshots.

## Gotchas

- The simulator takes the host's clock and zone, and the drive changes
  neither. A drive whose first minute runs after 18:00 local sees
  `Nothing to tend now` until 04:00. Tests alone own the evening rule's
  edges, other zones, months away, a pile of due verses, the cap, the mixed
  order, a new piece beside planted verses, unread and refused stores, and
  every minutes value's effect on a plan. The app holds one passage, so a
  live plan holds at most one item, and the minutes never change its count
  (`apps/heartseed/src/session.property.test.ts` for the plan and the
  counts line, `apps/heartseed/src/session/service.test.ts` for the stored
  minutes, `apps/heartseed/src/session/header.test.tsx` for the header's
  row and `apps/heartseed/src/session/counts.test.tsx` for the counts line
  on Today).
- The voice reads only in the first minute's hear phase, which a reader
  meets once. So live, the switch's effect is only its state across a
  relaunch. hswake's new-piece Listen is where it is heard.
