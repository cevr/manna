# Promises: the Fear collection taught, and When I need…

The app holds Selah's fourteen promise collections as references only
(`apps/heartseed/src/promises.ts`) and teaches one, `Protection & Fear`,
free, after the reader's passages: its 14 verses are pieces of the session
after every passage held, each long one learned as phrases first, then
joined (`phrase.md`), and the field shows its row. Home's bar
offers `When I need…` (`apps/heartseed/src/need/screen.tsx`, its rule
`apps/heartseed/src/need.ts`): the promises the reader knows, by situation.
A tap on one brings Today with its verses ahead of the plan (a visit), each
said as a review (`apps/heartseed/README.md`, When I need…).

- **The entry**: `When I need…` comes first in home's bar, fixed above
  the scroll view, once a plan is made in this launch, and is disabled
  while a remove is pending; never in the pending frame, the first minute,
  over unread passages or on Today.
- **The screen**: a bar fixed above the scroll view holding `‹ Your field`
  (accessible name `Your field`), which leads to home, then the one
  heading `When I need…` and the
  cards in the situations' order. A card (`need-card`) shows its title
  as plain text (`need-title`), each promise the reader knows as a button
  named by its reference (`promise`), and on the taught card
  `<n> still to learn` (`to-learn`). The taught card always shows; any
  other only once one of its promises is known. No lock, no price.
- **A visit**: a tap on a known promise shows Today with the promise's
  first verse not said since the tap, whole (never its phrases), under the
  cue of its own stage, with
  `Say it` and no `Listen`. Its result, grades and `Next` are Today's;
  `Next` shows the visit's next verse, then the plan's item or the done
  state. The counts line stays the plan's. A held result stays held when
  a promise is tapped, until its `Next`.
- **A visit lives as the hold lives**: a Minutes tap, a return to the
  foreground or a landed add or remove with no recital under way drops
  it; the field, About and When I need… and back keep it; a relaunch has
  none.
- **The field's row**: `Protection & Fear` after the passages held and
  before the other plants, its 14 verses as plant buttons, with no
  `Remove`.
- Nothing is stored but the recalls said (and the minutes after a tap):
  no new key.

## Sub-features

- `promise-entry`: on home after the first minute, `When I need…` sits
  first in the bar, inside the window without a scroll; Today holds none.
- `promise-need`: `When I need…` shows the heading `When I need…`,
  `‹ Your field` in the bar, the card `Protection & Fear` with
  `12 still to learn`, and the card `Strength` with the button
  `Isaiah 41:10` (the first minute's promise); no other card.
- `promise-visit`: a tap on `Isaiah 41:10` shows Today with the reference
  `Isaiah 41:10`, `Say it` and no `Listen`.
- `promise-said`: `Say it` (the replay) shows the result and `Next`;
  `Next` shows the plan's item or the done state; the field's
  `Isaiah 41:10` plant holds the new recall's stage.
- `promise-field`: the field shows the row `Protection & Fear` with 14
  `<reference>, not planted` plants and no `Remove`.
- `promise-relaunch`: a relaunch opens home; `When I need…` still lists
  `Isaiah 41:10`, and no visit shows.
- `promise-new` (the second session, after the next 04:00 local, no
  passage held, no uninstall): Today offers `Psalms 91:1 [1-9]` (the
  first phrase of Psalms 91:1, 9 words) as `1 new` with `Listen` and
  `Say it` (after the promise's review, if due).
- `promise-tests-only` (tests only): the whole need rule
  (`apps/heartseed/src/need/need.property.test.ts`), unread passages, a
  multi-verse visit, a visit dropped by a Minutes tap or a return, a held
  result before a visit, every zone and the days after the second
  (`src/session/visit.property.test.ts`, `src/need/walk-*.test.tsx`,
  `src/need/offer.test.tsx`, `src/promises/*.test.*`), and the unit's
  acceptance check (P1-P3, W1).

## How to get to it (user POV)

- From home, tap `When I need…`; tap a promise to say it now, or
  `Your field` in the bar to go back.
- On home: the row `Protection & Fear`.

## Driving it

`RUN=hspromise-l1` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`,
a free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time, local and UTC. Nothing native changes for
promises, so an install of a build of `1064d4138` or later serves
(`SKILL.md`, Launch); the JavaScript comes from the dev server. The garden
must start empty: uninstall by udid as `first.md` says.

1. `first.md` steps 1-7: boot, uninstall, install, revoke the microphone,
   and the first minute to `first-home`.
2. `promise-entry`: `sim snapshot promise-entry` → the heading
   `Your field`, the button `When I need…`, no heading `Today`; then a raw
   snapshot (`agent-device snapshot --json --raw --observe-only
   --force-full --session verify-heartseed`) → `When I need…`'s rect
   inside the window, above the heading `Your field`, at least 44 pt tall,
   with no `sim scroll` before.
3. `promise-need`: `sim tap "label=When I need…"`,
   `sim snapshot promise-need` → the heading `When I need…`, the button
   `Your field` showing `‹ Your field`, the texts `Protection & Fear`,
   `12 still to learn` and `Strength`, the button `Isaiah 41:10`; no other
   card title, no other promise button, no button `Today`, no `Say it`.
4. `promise-visit`: `sim tap "label=Isaiah 41:10"`,
   `sim open / --expect "id=session"`, `sim snapshot promise-visit` → the
   heading `Today`, the reference `Isaiah 41:10`, `Say it`, no `Listen`,
   no `When I need…`; the counts line as in `first-home`
   (`Nothing to tend now`, unless the promise came due).
5. `promise-said`: `sim tap "label=Say it"`, then
   `sim tap "label=36 of 37 words" --timeout 30` (or the count the replay
   gives), `sim snapshot promise-said` → the stage line, the `Grade`
   group with one radio checked, `Next`, no `Say it`. Then
   `sim tap "label=Next"`, `sim snapshot promise-next` → the done state
   (`Nothing to tend now`, no reference) or the plan's item. Then
   `sim tap "label=Your field"` → a button whose label starts
   `Isaiah 41:10, <stage>`, at the stage `promise-said` showed
   (`, ready today` follows while a plan item on it is open).
6. `promise-field`: on the field, `sim snapshot promise-field` → the row
   titles `Isaiah 41:10` then `Protection & Fear`; 14 buttons
   `<reference>, not planted` in that row (`Psalms 91:1` first,
   `Isaiah 41:13` last; count them); `Remove` nowhere.
7. `promise-relaunch`: `sim relaunch`, `sim open / --expect "id=counts"`,
   `sim snapshot promise-relaunch` → the heading `Your field`, no heading
   `Today`, and no `Begin` unless the plan holds an item (the done state
   on the first day: `Nothing to tend now`); `sim tap "label=When I need…"`
   → the button `Isaiah 41:10`; then `sim tap "label=Your field"`.
8. `sim doctor` (record `head` and `timingsHold`) and `sim down`, keeping
   the install.
9. `promise-new`, the second session, after the next 04:00 local, with no
   passage added and no uninstall: `sim boot`, then
   `sim open / --expect "id=counts"` → home's counts line holds `1 new`,
   with `Begin`; `sim tap "label=Begin"`,
   `sim open / --expect "id=session"`, `sim snapshot promise-new` → the
   counts line holds `1 new`; when the reference is `Isaiah 41:10` (its
   review due), run it through `Say it` and `Next` first, then snapshot
   again → the reference `Psalms 91:1 [1-9]`, nine `word-<i>` nodes,
   `Listen` before `Say it`. Then `sim doctor` and `sim down`.

Report only counts, booleans, rect numbers, the labels named above, the
counts line and the references; delete the `snapshots` folder and the raw
snapshots.

## Gotchas

- `When I need…` and its bar's `Your field` never need a `sim scroll`: each is
  outside its screen's scroll view. A promise button is inside it; with
  only the first minute's promise known, it is on the first screen.
- The label has a single ellipsis character (U+2026), not three dots:
  `sim tap "label=When I need…"` as written here.
- The simulator's replay always recites Isaiah 41:10's words, so a visit
  of another promise grades low there (still a recall); multi-verse
  visits, other collections and every zone are the tests' (`promise-tests-only`).
- The simulator's clock cannot be set: the second day is `promise-new`,
  after the next 04:00 local.
- Before the first minute's day is over no new piece shows, so the Fear
  phrases appear on Today only from `promise-new` on, one a day; no Fear
  verse is known in a drive the clock cannot move (Fear's joins and a
  visit of a long verse are the tests': `phrase.md`).
