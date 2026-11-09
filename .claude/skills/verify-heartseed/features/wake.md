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

A new piece (a verse or a phrase the plan offers to plant, shown under its
full text, or a join under first letters, `phrase.md`) also
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
(the Fear collection's first phrase) and `phrase.md`'s `phrase-say`
drive `Listen` then.

## Sub-features

Every row runs from `first.md`'s `first-home`. `PLANTED` is the local time
of `first-planted`. **Away** means: record the app's pid
(`xcrun simctl spawn <udid> launchctl list | grep app.heartseed`), send the
app to the background with `xcrun simctl launch <udid>
com.apple.Preferences`, wait 5 s, then bring it back with
`sim open / --expect "id=counts"` from home, or
`sim open / --expect "id=session"` from Today. The pid read again must be
the same: a different pid means the app was relaunched, and the row
proves nothing.

- `wake-stays`: right after `run-done-first` (home), **away** and back →
  the done state as before (`Nothing to tend now`, no `Begin`, no heading
  `Today`), with the same pid. This holds on base too; it guards that a
  return with nothing due changes nothing.
- `wake-due` (daytime only, when `PLANTED` was between 04:00 and 17:52
  local): 7 minutes after `PLANTED`, with no `Minutes` tap and no relaunch,
  **away** and back → home's `1 to tend · about 1 min`, the button
  `Isaiah 41:10, seed, ready today` and `Begin`, with the same pid; then
  `Begin` → Today with `1 to tend · about 1 min`, the reference
  `Isaiah 41:10`, 37 `word-<i>` nodes in first letters, and `Say it`. Red
  on a base before hswake: it shows `Nothing to tend now` until a
  `Minutes` tap or a relaunch.
- `wake-result`: after `run.md`'s `run-held-field` (the result, the grades
  and `Next` showing), **away** and back → the done state: `Nothing to tend
  now`, no `Grade` group, no summary, no `Next`, no `Say it`, with the same
  pid. Red on base: base keeps the result and `Next`.
- `wake-listen` (live in `passage.md`'s `passage-new`): `Listen` before `Say it` in
  the footer on a new verse while `Voice` is not `Off`; the voice reads that
  verse; no `Listen` while it reads, on a review, at `Next`, in the done
  state or with `Voice` at `Off`; `Say it` stops the voice first. Owned by
  `apps/heartseed/src/wake/listen.test.tsx`, `reading.test.tsx` and
  `listen-edges.test.tsx`, and the acceptance check's L1-L8.

## How to get to it (user POV)

- Go through the first minute and tap `Continue`. Leave the app (the home
  screen) and come back once the verse is due: home offers `Begin` for
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
3. `wake-due`: wait until 7 minutes after `PLANTED`, **away** (from
   home), then `sim snapshot wake-due-home`; `sim tap "label=Begin"`,
   `sim open / --expect "id=session"`, `sim snapshot wake-due`, plus a
   raw snapshot
   (`agent-device snapshot --json --raw --observe-only --force-full
   --session verify-heartseed`) for `run.md`'s `run-due` rects. When
   `PLANTED` was in the evening, record `Nothing to tend now` and stop
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
  - each launch's AppState subscription, removed when the launch ends.
- `sim open /` on a running app brings it to the foreground; it does not
  relaunch it (the pid check proves it). `sim relaunch` is a relaunch, which
  makes a new plan as on base, so it proves nothing here.
- Opening Settings with `xcrun simctl launch` touches no Heartseed state and
  grants nothing. Never change a privacy setting there.
