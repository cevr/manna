# The daily session

Today (`apps/heartseed/app/index.tsx`) shows the day's session as a plan made
by `apps/heartseed/src/session.ts`: the due reviews, then one new piece,
within the minutes the reader chose. The session's two choices sit in
home's Settings sheet alone (`apps/heartseed/src/settings/sheet.tsx`,
opened by the `Settings` row at the field's end, `home.md`): the radio group
`Minutes` (`2 min`, `5 min`, `10 min`, `20 min`; `5 min` until the reader
picks another) under `A day's tending`, and the button `Voice` under
`Reads new verses aloud`, which each tap cycles Off → Her → Him → Off
(`Her` until the reader taps it; a reader whose old switch was off opens
on `Off`). The button shows `Voice: Off`, `Voice: Her` or `Voice: Him`;
its label stays `Voice` and its accessibility value is the word (a raw
snapshot's `value`). Until the natural voice is ready, Her and Him both
read with the system voice; while `Voice` is not Off, the line under the
pill (`id=natural-status`) says the natural voice's state, with
`Try again` after a failure (`natural.md`). Both choices are kept in the
device's store across launches (their keys: `apps/heartseed/README.md`,
Session). Neither shows in the first minute, and Today's header holds
neither: no frame of Today has a `Minutes` radio, `Voice` or the natural
voice's line.

At the top of Today's scroll view, above the reference, the counts line
(`id=session`) says what the session holds: `<n> to tend`, `1 new`,
`about <k> min`, joined by `·`, or `Nothing to tend now`. It never counts
the backlog. Home's Today card (`id=today-card`, `home.md`) counts the
same items by verse: `<n> verse(s) · about <k> min` and `<r> to review`,
`1 new`, or `All tended for today`. The plan is
made when home or Today first shows in a launch, again
at each Minutes tap in the sheet (home's Today card changes under the
open sheet), at each return to the foreground with no recital
under way (`wake.md`), and at each landed add or remove of a passage
(`passage.md`). An item is done once its piece (a verse, whole,
`phrase.md`) holds a new recall.
Today runs the plan one piece at a time (`run.md`): after a run's last
`Next` it shows the end (`The field is tended` and what grew); when the
run holds nothing and the line reads `Nothing to tend now`, Today shows
the done state. Neither has `Say it`.

A verse planted in the evening (18:00 to 03:59 local) is not due before
04:00 the next morning. Otherwise FSRS's due date rules, so after the first
minute's alone recital (the replay suggests Hard), the passage is due again
6 minutes later.

## Sub-features

Every row runs from `first.md`'s `first-home`. `PLANTED` is the local time
of `first-planted`. After the first minute home offers no `Start` (the
done state), so these rows reach Today by one tap on `Isaiah 41:10, seed`,
whose visit leaves the counts line the plan's.

- `session-first`: after the first minute, home's `Settings` shows the
  group `Minutes` with four radios `2 min`, `5 min`, `10 min` and
  `20 min`, `5 min` alone checked, and the button `Voice` valued `Her`.
  Today (by a tap on `Isaiah 41:10, seed`) shows `Nothing to tend now` and no `Minutes` or
  `Voice`. No snapshot of the first minute (`first-launch` to
  `first-planted`) holds `Minutes`, `Voice`, `Settings`, `to tend` or
  `Nothing to tend`.
- `session-header`: in a raw snapshot of the open sheet, each radio and
  the `Voice` button lies wholly inside the window and clear of the bottom
  safe area. A tap on `10 min` with no scroll checks it.
- `session-choose`: after two taps on `Voice` in the sheet (Her → Him →
  Off) and `20 min` picked, `Done`, a relaunch, then `Settings` shows
  `20 min` checked and `Voice` valued `Off`.
- `voice-migrate`: a reader who turned the old switch off on a build
  before the choice (base: the store's old switch row holds `false`)
  opens the new JavaScript on `Voice` valued `Off` in home's Settings
  sheet; the plain snapshot names `Voice` and no label starting `Voice:`.
  The launch writes nothing; one tap shows `Her` and stores the choice row
  as `her`, and the old switch row stays `false`.
- `voice-cycle`: three taps on `Voice` in the sheet show the values `Him`,
  `Off` and `Her`; a fourth, then a relaunch, shows `Him`, the store's
  choice row holding `him` and the old switch row as it was. The label
  stays `Voice` in every snapshot.

The store's rows are the app's voice keys (`apps/heartseed/README.md`,
Voice): the choice row's key ends in `choice`, the old switch row's in
`enabled`.

- `session-listening`: moved into `run.md`'s `run-listening`, after the
  wait.
- `session-due`: replaced by `run.md`'s `run-due`: 7 minutes after
  `PLANTED`, a relaunch makes the plan and home offers `Start` (a Minutes
  tap in home's Settings works too). The evening rule stays: a planting from 18:00 to
  03:59 local shows `Nothing to tend now` until 04:00 the next morning.
- `session-tend`: replaced by `run.md`'s `run-recite` and `run-next`: the
  recital leaves `Next`, and `Next` the end of the run, never `Say it`.
- `session-field`: Today's `Your field` shows home's Today card counting
  the visit's verse (`1 verse · about <k> min`, `1 to review`) with
  `Start`.

## How to get to it (user POV)

- Go through the first minute and tap `Continue`. On home, the `Settings` row
  `Settings` shows the minutes and the voice; `Practice anyway` or a
  plant (or `Start` once a verse is due) opens Today, whose line under the
  header shows what to tend.

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
2. `session-first` and `session-header`: `first.md` step 7 (`first-home`),
   then `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, `sim snapshot session-first-sheet`,
   and:
   - check the snapshot for the sheet's nodes above;
   - take a raw snapshot (`agent-device snapshot --json --raw --observe-only
     --force-full --session verify-heartseed`) and read the rects of the
     radios, the `Voice` button and the window, keeping only numbers;
   - `sim tap "label=10 min"`, then `sim snapshot session-header` →
     `10 min` checked; `sim tap "label=5 min"` (restored),
     `sim tap "label=Done"`.
     Then `sim tap "label=Isaiah 41:10, seed"`,
     `sim open / --expect "id=session" --no-relaunch`, `sim snapshot session-first` →
     `Nothing to tend now`, and no `Minutes`, `5 min` or `Voice`.
3. `session-choose`: `sim tap "label=Your field"`,
   `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, two `sim tap "label=Voice"` (Her → Him →
   Off), `sim tap "label=20 min"`, `sim tap "label=Done"`, `sim relaunch`,
   `sim open / --expect "id=today-card"` (home), `sim scroll "label=Settings" down`, `sim tap "label=Settings"`,
   `sim snapshot session-choose` and a raw snapshot → `20 min` checked,
   `Voice` valued `Off`. Turn the voice back to `Her` with one
   `sim tap "label=Voice"`, pick `5 min` again, then `sim tap
   "label=Done"`.
4. (`session-listening` is `run.md`'s `run-listening`.)
5. `session-field`: `sim tap "label=Isaiah 41:10, seed"`,
   `sim tap "label=Your field"`, `sim snapshot session-field` → the
   heading `Your field`, the Today card's `1 verse · about <k> min` and
   `1 to review`, and `Start` (the visit open).
6. `session-due` and `session-tend` are `run.md`'s `run-due`, `run-recite`
   and `run-next`: go on with `run.md`, Driving it, from step 3.

Report only counts, booleans, rect numbers, the labels named, the counts
line and the reference. Delete the `snapshots` folder and the raw
snapshots.

Red on base (before the Settings sheet): `sim tap "label=Settings"` finds
no element, and base's Today shows `5 min` and `Voice`.

### The voice's choice across builds

`voice-migrate` and `voice-cycle` need the old JavaScript first, in the
same container: a worktree `B` of a commit before the choice (its
`bun install --frozen-lockfile` run there) and the same `--app` build.
Read a node's value from a raw snapshot (the node whose label is `Voice`,
its `value`), and the store from a copy, as `field.md`'s `field-record`
does (`sqlite3 -readonly` on the copy, never the container): `SELECT key,
value FROM one_kv WHERE key LIKE 'heartseed/voice/%'`.

1. Base half, from B (`sim boot` there): B's `first.md` steps 1-7, whose
   `Continue` opens Today there; tap the old switch off with `agent-device press
   'role=switch label="Voice"' --settle --session verify-heartseed` in the
   drive's HOME (there `sim tap "label=Voice"` fails `AMBIGUOUS_MATCH`:
   the switch's text node is labelled `Voice` too); a store copy → the old
   switch row `false` and no choice row; `sim down`.
2. `voice-migrate`, from the head: `sim boot`, `sim relaunch`,
   `sim open / --expect "id=today-card"` (home), `sim scroll "label=Settings" down`, `sim tap "label=Settings"`;
   a raw snapshot and a store copy → `Voice` valued `Off`, no choice row.
   `sim tap "label=Voice"`; a raw snapshot and a store copy → `Her`, the
   choice row `her`, the old switch row still `false`.
3. `voice-cycle`: three `sim tap "label=Voice"`, a raw snapshot after each
   → `Him`, `Off`, `Her`; one more tap, `sim tap "label=Done"`,
   `sim relaunch`, `sim open / --expect "id=today-card"`,
   `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, a raw snapshot and a store copy → `Him`,
   the choice row `him`. Two taps bring it back to `Her`; then
   `sim tap "label=Done"`.
4. Then `session-choose` (step 3 above) runs from here.

Report only values, booleans and the store's rows (the keys and their
values, never a recall); delete the store copies.

## Gotchas

- The simulator takes the host's clock and zone, and the drive changes
  neither. A drive whose first minute runs after 18:00 local sees
  `Nothing to tend now` until 04:00. Tests alone own the evening rule's
  edges, other zones, months away, a pile of due verses, the cap, the mixed
  order, a new piece beside planted verses, unread and refused stores, and
  every minutes value's effect on a plan. On the first minute's day no
  new piece is offered, so a live plan that day holds at most one item
  (Isaiah 41:10), and the minutes never change its count
  (`apps/heartseed/src/session.property.test.ts` for the plan and the
  counts line, `apps/heartseed/src/session/service.test.ts` for the stored
  minutes, `apps/heartseed/src/settings/` for the sheet's choices and the
  plan made at a tap, and `apps/heartseed/src/session/counts.test.tsx` for
  the counts line on Today).
- The voice reads only in the first minute's hear phase, which a reader
  meets once. So live, the choice's effect is only its state across a
  relaunch. hswake's new-piece Listen is where it is heard.
- VoiceOver's spoken words are not on the simulator; the raw snapshot's
  `value` is what it reads. Her and Him sound the same until the natural
  voice is ready; the simulator is silent either way, and the natural
  voice's packs show in its log (`natural.md`, `today-read` and
  `today-him`). A rollback build reading the old key is the tests'
  (`apps/heartseed/src/voice/choice.test.ts`,
  `apps/heartseed/src/session/pill.test.tsx`): the old key is never
  written.
- The sheet's slide and swipe-down close are not drivable (no drag);
  `Done` closes it in every row.
