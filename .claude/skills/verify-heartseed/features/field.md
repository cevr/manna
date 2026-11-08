# Field

The field is the reader's progress (`apps/heartseed/src/field/screen.tsx`,
its rule `apps/heartseed/src/field.ts`): every passage is a row and every
verse a plant (Mark 4:28: seed, then blade, then ear, then full corn). It is
reached from Today by the button `Your field` and left by the button
`Today` (shown `‹ Today`) in its bar, fixed above its scroll view, in place
in the root route: no route, no link, no tab. Today offers
it only once the garden's read of the device's store completes, and never
while Say it listens. It sits in Today's header beside the heading, outside
the scroll view, so it is on screen without a scroll whatever Today holds
(the recap, the grades, the growth line, an alert). Its heading is `Your field`; under it, the days sown
(`1 day sown`, `<n> days sown`: the distinct local days, each from 04:00,
on which any recall was kept, each record's day read by the zone offset it
stores, a record kept before offsets by its UTC date, so it never falls)
and the harvest (`<n> verses at full corn`,
`1 verse at full corn`: the verses at full corn now, so Again takes a verse
out). Then one card per row: the promise's first (`Isaiah 41:10`, shown
even before its first recall, as bare soil), then each passage the reader
chose, in the order chosen (`passage.md`), then the taught collection's
row `Protection & Fear`, its 14 verses in order, with no `Remove`
(`promise.md`), then each other verse the garden holds, in the order
first sown. Each plant is one image to the
screen reader, labelled `<reference>, <stage>` (`seed`, `blade`, `ear`,
`full corn` or `not planted`), its drawing and verse number hidden inside
it. A legend of the four stages and the caption `Mark 4:28` close the
screen. The bar also holds `Add a passage` or the limit line, and a
passage row's `Remove` (`passage.md`). Under the scroll view, a fixed foot
holds one button, `About`, which opens the About screen (`about.md`); like
every field control it is disabled while a remove is pending. Which screen shows is never stored:
every launch opens on the pending frame, then the first minute or Today.

## Sub-features

- `field-control`: Today, read and quiet, offers a button `Your field` in
  its header, inside the window and above the home indicator's area.
- `field-first`: after the first minute, the field shows the passage at a
  seed, then the row `Protection & Fear` with no plant planted,
  `1 day sown`, `0 verses at full corn` and a button `Today`, with no
  `Today` heading and no `Say it`.
- `field-back`: `Today` shows Today as it was.
- `field-grow` (live at the first wait, `run.md`'s `run-recite` and
  `run-held-field`): a recital under letters that grows the passage to a
  blade shows on the field as `Isaiah 41:10, blade`.
- `field-listening` (live at `run.md`'s `run-listening`): while Say it
  listens, Today offers no `Your field`.
- `field-again` (tests only: `src/field/walk-grades.test.tsx`, unless the
  second wait, `run.md`'s `run-second`, runs): Again takes the passage back
  to a seed and never removes a day sown.
- `field-relaunch`: a relaunch opens Today, never the field, and its first
  frame claims no count; the field then shows as before.
- `field-record`: every recall record the app wrote holds an integer
  `offset`, the host's offset in minutes east of UTC.

## How to get to it (user POV)

- From Today, tap `Your field`; tap `Today` to come back.

## Driving it

`RUN=hsfield-l9` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`, a
free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time, local and UTC. Nothing native changes for the
field, so an install of a build of `c65e0f162` or later serves (`SKILL.md`,
Launch); the JavaScript comes from the dev server.

1. `first.md` steps 1-7: boot, uninstall, install, revoke the microphone,
   and the first minute to `first-today`.
2. `field-control`: in `first-today`'s snapshot (Today's done state), a
   button `Your field`.
3. `field-first`: `sim tap "label=Your field"`, `sim snapshot field-first`
   → the heading `Your field`; the text `Isaiah 41:10`; a node labelled
   `Isaiah 41:10, seed`; the text `Protection & Fear` and 14 nodes ending
   `, not planted` (`promise.md`'s `promise-field`); `1 day sown`;
   `0 verses at full corn`; a button
   `Today`; no `Today` heading, no `Say it`, no label starting `Stage:`.
4. `field-back`: `sim tap "label=Today"`, `sim open / --expect "id=session"`,
   `sim snapshot field-back` → the heading `Today`, `Nothing to tend now`
   (the done state, as it was), `Your field`.
5. `field-listening` and `field-grow`, at the first wait: `run.md` steps
   3-4. `run-listening`'s raw snapshot → `Listening` present and no
   `Your field` (keep only booleans). After `run-recite`,
   `sim tap "label=Your field"`, `sim snapshot field-grow` →
   `Isaiah 41:10, blade`, `1 day sown` (or `2 days sown` when 04:00 local
   fell between the planting and this recital: compare `START` with the
   time now, local), `0 verses at full corn`; then `sim tap "label=Today"`
   is `run.md` step 5 (`run-held-field`).
6. (`field-listening` is in step 5.)
7. `field-again`, only when `run.md` step 7 (`run-second`) runs: before its
   `Next`, `sim tap "label=Again"`, then `sim tap "label=Your field"`,
   `sim snapshot field-again` → `Isaiah 41:10, seed`, the same days sown as
   step 5; then `sim tap "label=Today"`. Otherwise the tests own it.
8. `field-relaunch`: `sim relaunch`, `sim open / --expect "label=Isaiah
   41:10"` (the pending frame) and at once
   `sim snapshot field-relaunch-launch` → no `Your field` heading, no label
   ending `sown` or `full corn`; then `sim open / --expect "id=session"`,
   `sim tap "label=Your field"`, `sim snapshot field-relaunch` → the same
   as step 7 (step 5 when step 7 did not run).
9. `field-record`: `C=$(xcrun simctl get_app_container verify-heartseed
   app.heartseed data)`; find `one-kv-heartseed.sqlite` and its `-wal` and
   `-shm` under `$C` with `find`, and copy them into `$EVIDENCE/store/`;
   then `sqlite3 -readonly` on the copy: `SELECT count(*),
   sum(json_extract(value,'$.offset') = <M>),
   sum(json_type(value,'$.offset') = 'integer') FROM one_kv WHERE key LIKE
   'heartseed/recall/%'`, where `<M>` is the host's offset now in minutes
   east (`date +%z`: `-0500` → `-300`) → three equal counts, one per recital
   the drive kept (2 after steps 1-8: the first minute's and `run-recite`'s;
   3 when `run-second` ran). Report only the counts; delete the copy. Red
   on a build before hslocal, which writes no `offset`: the second and
   third counts are 0.
10. Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Report only counts, booleans, the labels named above and the reference;
delete the `snapshots` folder and the raw snapshot.

## Gotchas

- The field counts local days from 04:00, not UTC days: a drive that
  crosses 04:00 local between two recitals sees one more day sown, and one
  that crosses 00:00 UTC does not.
- The simulator takes the host's zone and clock, and the drive changes
  neither: a zone change, daylight saving, travel, old records beside new
  and bad offsets are the tests' (`test:field`, `test:garden`), never the
  drive's.
- A row title is plain text, not a heading; the field's one heading is
  `Your field`.
- `Your field` never needs a `sim scroll`: it is in Today's header, outside
  the scroll view. Tap it as it is; a scroll just before a tap can leave the
  scroll view moving, and a tap then may stop the scroll instead of pressing.
  The field's `Today` likewise sits in its bar, above the scroll view.
