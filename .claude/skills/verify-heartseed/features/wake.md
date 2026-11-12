# The return: a new plan when Heartseed comes back, and a new verse's Listen

Home or Today (`apps/heartseed/app/index.tsx`) makes the session's plan
(`session.md`, `run.md`) when it first shows in a launch, at each `Minutes`
tap (in home's Settings sheet), and now whenever the app **returns to the foreground**: iOS reports
the app `active` again after it was in the `background` (the home screen,
another app, the app switcher, a lock). A return makes the plan again at
that instant, so a reader who left the app open overnight finds this
morning's verses, not yesterday's plan. It also lets go of the verse
whose result shows: the run starts again at the new plan's first item.
Home reads its greeting again at a return (`home.md`). Nothing else
changes at a return:

- a recital under way (`Listening`) keeps its verse, its result and its
  `Next`, and no plan is made;
- the first minute keeps its phase;
- an unread garden keeps its verse and its result.
  A pull of the notification center or Control Center (`inactive` with no
  `background`) is not a return.

A new piece (a verse the plan offers to plant, whole, shown under its
full text, `phrase.md`) also
offers `Listen` while `Voice` is not `Off` (`Her` or `Him`). It sits in the fixed footer
before `Say it`. `Listen` has the voice read that piece's own text. While the voice
reads, `Listen` is gone, and `Say it` stops the voice before it listens; a
tap of `Voice` onto `Off` (in home's Settings sheet, reached by
`‹ Your field`) stops it too, and a tap from `Her` to `Him` lets it go on. Listening is offered, not required. With `Voice` at `Off`, only
`Say it` shows.
A review, `Next`, the done state and an unread garden never show `Listen`.

The first minute plants Isaiah 41:10, and no new piece is offered on its
day, so a new piece shows live only on the second day: `passage.md`'s
`passage-new` (a passage's first verse), `promise.md`'s `promise-new`
(the Fear collection's first verse) and `phrase.md`'s `whole-new`
drive `Listen` then.

## Sub-features

Every row runs from `first.md`'s `first-home`. `PLANTED` is the local time
of `first-planted`. **Away** means: record the app's pid
(`xcrun simctl spawn <udid> launchctl list | grep app.heartseed`), send the
app to the background with `xcrun simctl launch <udid>
com.apple.Preferences`, wait 5 s, then bring it back with
`sim open / --expect "id=today-card" --no-relaunch` from home, or
`sim open / --expect "id=session" --no-relaunch` from Today. The pid read again must be
the same: a different pid means the app was relaunched, and the row
proves nothing.

- `wake-stays`: right after `run-done-first` (home), **away** and back →
  the done state as before (`All tended for today`, `Practice anyway`, no
  `Start`, no heading `Today`), with the same pid. This holds on base too; it guards that a
  return with nothing due changes nothing.
- `wake-sheet-stays`: right after `wake-stays` (home, the done state),
  `Settings` opens the sheet (the heading `Settings`, `Done`, `5 min`
  alone selected); **away** and back with the sheet open → the heading
  `Settings` and `Done` still, `5 min` alone selected, with the same pid;
  then `Done` → home's `Your field`, no heading `Settings`,
  `All tended for today`, no `Start`. It confirms on the device the state
  `apps/heartseed/src/test/wake-walk.ts` models (states sent with the
  sheet open); green on base by design (S4 changes no product), red before
  the sheet (`7add51242`: no `Settings` to tap). A sheet gone after the
  return is a finding against that walk, not a drive error.
- `wake-due` (daytime only, when `PLANTED` was between 04:00 and 17:52
  local): 7 minutes after `PLANTED`, with no `Minutes` tap and no relaunch,
  **away** and back → the Today card's `1 verse · about 1 min` and
  `1 to review`, the button
  `Isaiah 41:10, seed, ready today` and `Start`, with the same pid; then
  `Start` → Today with `1 to tend · about 1 min`, the reference
  `Isaiah 41:10`, 37 `word-<i>` nodes in first letters, and `Say it`. Red
  on a base before hswake: home shows the done state until a
  `Minutes` tap or a relaunch.
- `wake-result`: after `run.md`'s `run-held-field` (the result, the grades
  and `Next` showing), **away** and back → the done state: `Nothing to tend
  now`, no `Grade` group, no summary, no `Next`, no `Say it`, with the same
  pid. Red on base: base keeps the result and `Next`.
- `wake-listen` (live in `passage.md`'s `passage-new`): `Listen` before `Say it` in
  the footer on a new verse while `Voice` is not `Off`; the voice reads that
  verse; no `Listen` while it reads, on a review, at `Next`, in the done
  state or with `Voice` at `Off`; `Say it` stops the voice first. Owned by
  `apps/heartseed/src/wake/listen.test.tsx`, `listen-b.test.tsx`,
  `reading.test.tsx`, `reading-b.test.tsx` and `listen-edges.test.tsx`, and the acceptance check's L1-L8.

## How to get to it (user POV)

- Go through the first minute and tap `Continue`. Leave the app (the home
  screen) and come back once the verse is due: home offers `Start` for
  it, with no other tap.
- Say it, then leave the app while the result shows, and come back: Today
  shows the session's next verse, or nothing to tend.

## Driving it

Nothing native changes. Use an incremental `sim install` of the head under
`lockf -k /tmp/manna-ios-build.lock`, with the bars of `SKILL.md`, Launch,
or `--app` with a build of `d19c8ed2e` or later. The garden must start
empty: uninstall by udid as `first.md` says. Set `RUN`, `EVIDENCE`, `PORT`
and `START` as `first.md` sets them.

1. `first.md` steps 1-7. Note `PLANTED` (`date`).
2. `run.md`'s `run-done-first` (its step 2). Then `wake-stays`: **away**,
   `sim snapshot wake-stays`.
   Then `wake-sheet-stays`: record the pid; `sim scroll "label=Settings" down`, `sim tap "label=Settings"`
   and a raw snapshot (the heading `Settings`, `Done`, `5 min` alone
   selected); send the app away with `xcrun simctl launch <udid>
   com.apple.Preferences`, wait 5 s, bring it back with `xcrun simctl
   launch <udid> app.heartseed` (a running app comes to the foreground;
   no link, so the route does not move); `sim snapshot wake-sheet-stays`
   and a raw snapshot (the heading `Settings` and `Done` still, `5 min`
   alone selected, the same pid); `sim tap "label=Done"`,
   `sim snapshot wake-sheet-done` (the heading `Your field`, no heading
   `Settings`, `All tended for today`, no `Start`).
3. `wake-due`: wait until 7 minutes after `PLANTED`, **away** (from
   home), then `sim snapshot wake-due-home`; `sim tap "label=Start"`,
   `sim open / --expect "id=session" --no-relaunch`, `sim snapshot wake-due`, plus a
   raw snapshot
   (`agent-device snapshot --json --raw --observe-only --force-full
   --session verify-heartseed`) for `run.md`'s `run-due` rects. When
   `PLANTED` was in the evening, record `All tended for today` and stop
   here: only tests reach the rest.
4. `run.md` steps 4-5 (`run-listening`, `run-recite`, `run-held-field`).
5. `wake-result`: **away** (from Today), `sim snapshot wake-result`. This takes the
   place of `run.md`'s step 6 in this drive: its end state is the done
   state `run-next` shows, and `run-next` stays owned by
   `apps/heartseed/src/run/*.test.tsx`.
6. `sim doctor` (record `head` and `timingsHold`), then `sim down`.

Report only counts, booleans, rect numbers, the pids' equality, the labels
named, the counts line and the reference. Delete the `snapshots` folder and
the raw snapshots.

## Gotchas

- The simulator takes the host's clock and zone, and the drive changes
  neither. Tests alone own:
  - `inactive` with no `background` (the driver has no notification-center
    pull), and a second `active`;
  - a return while `Say it` listens or finishes;
  - a return in the first minute, in an unread garden, and on the field
    (the greeting read again at a return: `test:home-wake`);
  - a return after 04:00 local that brings an evening planting
    ("plant at night, recall in the morning");
  - many verses, the mixed order and a new verse, and every zone;
  - `Listen` in all its states (`wake-listen`);
  - a return under the open Settings sheet that brings a new plan (the
    drive cannot time a due under the sheet; `wake:sheet-return`, home's
    Today card made again under the sheet, in the wake walk);
  - a `Voice` change from the sheet while Listen's reading goes on (the
    simulator's voice is silent and a reading ends in seconds;
    `wake-listen`, `wake-reading`);
  - an unread garden offering no `Settings`, `Voice` or Minutes (it needs
    a failed store read; the wake walk's `minutes:none-unread` and
    `voice:none-unread`);
  - a Minutes making while a recital listens or finishes, long verse or
    short (no reader can make one; `test:session-cells`, and the phrase walks at
    the session seam);
  - each launch's AppState subscription, removed when the launch ends.
- `sim open /` on a running app brings it to the foreground; it does not
  relaunch it (the pid check proves it). `sim relaunch` is a relaunch, which
  makes a new plan as on base, so it proves nothing here.
- Opening Settings with `xcrun simctl launch` touches no Heartseed state and
  grants nothing. Never change a privacy setting there.
