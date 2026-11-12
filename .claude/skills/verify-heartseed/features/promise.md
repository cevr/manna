# Promises: the Fear collection taught

The app holds Selah's fourteen promise collections as references only
(`apps/heartseed/src/promises.ts`) and teaches one, `Protection & Fear`,
free, after the reader's passages: its 14 verses are pieces of the session
after every passage held, each learned whole, long or short
(`phrase.md`), and the field shows its row. Neither home nor Today
offers `When I need…`: its screen is gone (owner, 2026-11-11), and a
promise is said as any verse is, on the plan, by `Practice anyway`, or by
one tap on its plant (`home.md`).

- **The field's row**: `Protection & Fear` after the passages held and
  before the other plants, titled by the button `Open Protection & Fear`,
  its 14 verses as plant buttons; neither home nor its page (`list.md`)
  offers a `Remove`.
- **A visit** (a plant's start, `home.md`) lives as the hold lives:
  a Minutes tap, a return to the foreground or a landed add or remove with
  no recital under way drops it; the field, About and back keep it; a
  relaunch has none.
- Nothing is stored but the recalls said (and the minutes after a tap):
  no new key.

## Sub-features

- `need-gone`: snapshots of home and Today hold no `When I need…`
  (count 0 in both).
- `promise-field`: the field shows the row `Protection & Fear` with 14
  `<reference>, not planted` plants, its title the button `Open
  Protection & Fear`, and no `Remove`.
- `promise-relaunch`: a relaunch opens home, and no visit shows.
- `promise-new` (the second session, after the next 04:00 local, no
  passage held, no uninstall): Today offers `Psalms 91:1`, whole (19
  words), as `1 new` with `Listen` and
  `Say it` (after the promise's review, if due).
- `promise-tests-only` (tests only): unread passages, a multi-verse
  visit, a visit dropped by a Minutes tap or a return, a held result
  before a visit, every zone and the days after the second
  (`src/session/visit.property.test.ts`, `src/promises/*.test.*`).

## How to get to it (user POV)

- On home: the row `Protection & Fear`; a tap on a plant there.

## Driving it

`RUN=hspromise-l1` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`,
a free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time, local and UTC. Nothing native changes for
promises, so an install of a build of `1064d4138` or later serves
(`SKILL.md`, Launch); the JavaScript comes from the dev server. The garden
must start empty: uninstall by udid as `first.md` says.

The taps are the journeys `promise` and `promise-new` beside this file,
each one `sim journey` call. A receipt
(`$EVIDENCE/snapshots/<journey>-<nn>-<step>.txt`, cited as
`<journey>/<step>`) holds the visible nodes' types and labels. `When I
need…` is gone from the app's sources, so no selector may name it (R4):
its absence is a count of 0 read in each receipt.

1. `first.md`'s `sim journey first`: boot, uninstall, install, revoke the
   microphone, and the first minute to `first-home`.
2. `sim journey promise` → `"ok":true` (steps 2-4). `need-gone`:
   `promise/need-gone-home`, `promise/need-gone-home-end` (after the
   scroll to `How Heartseed works`) and `promise/need-gone-today` (after
   `Practice anyway`) → `When I need…` count 0 in each.
3. `promise-field`: `promise/promise-field`, after `Your field` → the row
   title buttons `Open Isaiah 41:10` then `Open Protection & Fear`; 14
   buttons `<reference>, not planted` in that row (`Psalms 91:1` first,
   `Isaiah 41:13` last; count them, those below the fold in a raw
   snapshot, `first.md`, Driving it); `Remove` nowhere.
4. `promise-relaunch`: `promise/promise-relaunch` → the heading
   `Your field`, no heading `Today`, and `Start` only when the plan holds
   an item (here the visit `Practice anyway` opened; with none, the done
   state of the first day: `All tended for today` and `Practice anyway`).
5. `sim doctor` (record `head` and `timingsHold`) and `sim down`, keeping
   the install.
6. `promise-new`, the second session, after the next 04:00 local, with no
   passage added and no uninstall: `sim boot`, then
   `sim journey promise-new` → `"ok":true`.
   `promise-new/promise-new-home` → the Today card's parts line holds
   `1 new`, with `Start`; `promise-new/promise-new` → the counts line
   holds `1 new`; when the reference is `Isaiah 41:10` (its review due),
   run `run.md`'s `run-recite` and `run-next` first, then
   `sim journey promise-new` again → the reference `Psalms 91:1`, its
   words whole in one `id=passage` node (the reading view draws words
   only while `Listen` reads, `light.md`), `Listen` before `Say it`. Then
   `sim doctor` and `sim down`.

Report only counts, booleans, the labels named above, the counts line and
the references; delete the `snapshots` folder and the raw snapshots.

Red on base (`7cd3cfa9b`): `promise/need-gone-home` holds `When I need…`
once a plan is made.

## Gotchas

- The label `When I need…` has a single ellipsis character (U+2026), not
  three dots: count `label=When I need…` as written here.
- The simulator's clock cannot be set: the second day is `promise-new`,
  after the next 04:00 local.
- Before the first minute's day is over no new piece shows, so the Fear
  verses appear on Today only from `promise-new` on, one a day; no Fear
  verse is known in a drive the clock cannot move (a visit of a long
  verse is the tests': `phrase.md`).
