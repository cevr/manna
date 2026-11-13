# Field

The field is the reader's progress (`apps/heartseed/src/field/screen.tsx`,
its rule `apps/heartseed/src/field.ts`): every passage is a row and every
verse a plant (Mark 4:28: seed, then blade, then ear, then full corn). It is
the app's home: every launch on a read garden opens it, and so does the
first minute's `Continue`, in place in the root route: no route, no link,
no tab. Today is reached from it by the Today card's `Start` or
`Practice anyway`, or one tap on a plant (its verse, whole), and left by
the button
`Your field` (shown
`‹ Your field`), which leads back to home. Today offers it only once the
garden's read of the device's store completes, and never while Say it
listens. It sits in Today's header beside the heading, outside the scroll
view, so it is on screen without a scroll whatever Today holds (the
recap, the grades, the growth line, an alert). The field has no control
named `Today`. Its heading is `Your field`; under it, the days sown
(`1 day sown`, `<n> days sown`: the distinct local days, each from 04:00,
on which any recall was kept, each record's day read by the zone offset it
stores, a record kept before offsets by its UTC date, so it never falls)
and the harvest (`<n> verses at full corn`,
`1 verse at full corn`: the verses at full corn now, never an old piece, so
Again takes a verse out). After them the label `Lists`, then one furrow
per row (with the legend under them, then `Add a list`, `id=add-list`,
which opens the Add a list sheet over home, `home.md`, or the limit line,
just above `Settings`), each with its icon, title and
caption (`<n> verse(s) · <r> ready today`, else `<n> verse(s) · <p>
planted`, else `<n> verse(s) to learn`): the promise's first (`Isaiah 41:10`, shown
even before its first recall, as bare soil), then each passage the reader
chose, in the order chosen (`passage.md`), then the taught collection's
row `Protection & Fear`, its 14 verses in order
(`promise.md`), then each other verse the garden holds, in the order
first sown. An old piece is never a row or a plant: a verse whose only
plants are old pieces shows `not planted`, and a removed passage's old
pieces make one row for their verse (`phrase.md`). Each plant is one button, labelled
`<reference>, <stage>` (`seed`, `blade`, `ear`, `full corn` or
`not planted`), then `, ready today` when a plan item not done is on it,
its gold dot and drawing hidden inside it, no number under it; a tap
chooses its verse (`home.md`). Each furrow's title is the button `Open
<title>`, which opens the list's own page (`list.md`); home holds no
`Remove`: a held passage's (`passage.md`) and a Handbook list's
(`handbook.md`) lie on its page. A legend of the four stages and the caption `Mark 4:28`,
then the rows `Settings` (`home.md`: the Settings sheet, with the
`Minutes` radios, `Voice`, the appearance and `About`, which opens the
About screen, `about.md`) and `How Heartseed works` (the welcome
replayed, `home.md`'s `home-how`) close the
scroll view. Above the scroll view, fixed, the greeting by the hour
(`home.md`) and the Today card (`id=today-card`: its lines and `Start`,
else `Practice anyway`), and no
`About`. Which screen shows is never stored:
every launch opens on the pending frame, then the first minute or home
(Today on an unread garden).

## Sub-features

- `field-control`: Today, read and quiet, offers a button `Your field` in
  its header, inside the window and above the home indicator's area.
- `field-first`: after the first minute, `Continue` opens the field: the
  passage at a seed as a plant button, then the row `Protection & Fear`
  with no plant planted, `1 day sown`, `0 verses at full corn` and the
  Today card's `Practice anyway`, with no `When I need…`, no `Today`
  heading, no button `Today` and no `Say it`.
- `field-back`: Today's `Your field` shows the field, and `Start` (when
  the field offers it) shows Today as it was.
- `field-grow` (live at the first wait, after `run.md`'s `run-recite`): a
  recital under letters that Today draws at `Stage: blade`, left by
  `Your field` before `Next`, shows on the field unchanged, as
  `Isaiah 41:10, seed`, and `Start` brings back `Say it` at
  `Stage: seed` with no `Next`: nothing was recorded. Red on base, which
  showed `Isaiah 41:10, blade` and the held result. Only `Next` keeps the
  recall; the field then shows the blade (`home.md`'s `home-end`).
- `field-listening` (live at `run.md`'s `run-listening`): while Say it
  listens, Today offers no `Your field`.
- `field-again` (tests only: `src/field/walk-again.test.tsx` and
  `src/field/screen.test.tsx`, unless the second wait, `run.md`'s
  `run-second`, runs): Again on a recital pending for `Next` takes Today's
  stage back to a seed; left by `Your field`, the field shows the passage
  as it was before that recital, and `Start` offers `Say it` again.
- `field-relaunch`: a relaunch opens home, and its first frame claims no
  count (that frame: tests only, `src/home/root.test.tsx`); the field then
  shows as before.
- `field-record`: every recall record the app wrote holds an integer
  `offset`, the host's offset in minutes east of UTC.

## How to get to it (user POV)

- Open the app: home is the field. From Today, tap `Your field`; tap
  `Start` (or `Practice anyway`, or a plant) to go to Today.

## Driving it

`sim journeys <file>.md` plays the lists below one after another, each in one app session from its start, with no screenshot and no video, and names each journey that fails with its first failed step and the journey before it (`SKILL.md`, Drive). The by-hand steps between them (a raw snapshot, a read of the log) are not part of it.

**Journeys in order:** from a fresh install: `first`, `field`, `7 min`, `run`, `run-recite`, `field-grow`, `run-recite`, `run-next`, `field-relaunch`.

Not in a list: `field-again` (step 7) runs only when `run.md`'s `run-second` runs, and inside it, before its `Next`; a list plays whole journeys one after another, so it cannot hold a journey inside another.

`RUN=hsfield-l9` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`, a
free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time, local and UTC. Nothing native changes for the
field, so an install of a build of `c65e0f162` or later serves (`SKILL.md`,
Launch); the JavaScript comes from the dev server.

The taps are the journeys `field`, `field-grow`, `field-again` and
`field-relaunch` beside this file, each one `sim journey` call. A receipt
(`$EVIDENCE/snapshots/<journey>-<nn>-<step>.txt`, cited as
`<journey>/<step>`) holds the visible nodes' types and labels; a count
line or a node below the fold is read there or in a raw snapshot
(`first.md`, Driving it).

1. `first.md`'s `sim journey first`: boot, uninstall, install, revoke the
   microphone, and the first minute to `first-home`.
2. `sim journey field` → `"ok":true` (steps 2-4). `field-first`:
   `field/field-first` → the heading `Your field`; the text
   `Isaiah 41:10`; a button `Isaiah 41:10, seed`; the text
   `Protection & Fear` and 14 buttons ending `, not planted`
   (`promise.md`'s `promise-field`); `1 day sown`;
   `0 verses at full corn`; a button `Practice anyway`; no button
   `When I need…`; no `Today` heading, no button `Today`, no `Say it`, no
   label starting `Stage:`.
3. `field-control`: `field/field-control` → the heading `Today`,
   `Isaiah 41:10`, `Say it` and a button `Your field`.
4. `field-back`: `field/field-back-home` → the heading `Your field` and
   `Start` on the Today card (the visit open); `field/field-back`, after
   `Start` → the heading `Today`, `Isaiah 41:10` and `Say it` (as it
   was), `Your field`.
5. `field-listening` and `field-grow`, at the first wait: `run.md` steps
   3-4. `run-listening`'s raw snapshot → `Listening` present and no
   `Your field` (keep only booleans). After `run-recite`,
   `sim journey field-grow` → `"ok":true`. `field-grow/field-grow` →
   `Isaiah 41:10, seed` (no `Isaiah 41:10, blade`), `1 day sown`,
   `0 verses at full corn`; its last step taps `Start`
   (`field-grow/field-grow-held`: `Say it`, `Stage: seed`, no `Next`).
   `run.md` step 5 then needs the result again: run `run.md`'s
   `sim journey run-recite` once more first.
6. (`field-listening` is in step 5.)
7. `field-again`, only when `run.md` step 7 (`run-second`) runs: before its
   `Next`, `sim journey field-again` → `"ok":true`: `Again`, then
   `Your field`. `field-again/field-again` → a button whose label starts
   `Isaiah 41:10, blade` (the passage as `run-next` kept it; `, ready
   today` follows while its item is open), the same days sown as step 5;
   its last step taps `Start` (`Say it`, no `Next`). Otherwise the tests
   own it.
8. `field-relaunch`: `sim journey field-relaunch` → `"ok":true`.
   `field-relaunch/field-relaunch-launch`, the receipt taken once
   `Isaiah 41:10` shows, holds home already (`Your field` and the counts):
   the pending frame passes before a snapshot lands (5 of 5 relaunches at
   load about 5), so the first frame's claim is the tests'
   (`src/home/root.test.tsx`, pending frames, then home);
   `field-relaunch/field-relaunch` → the heading `Your field`, no heading
   `Today`, and the same plants and days as step 7 (step 5 when step 7
   did not run).
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
  `Your field`. The greeting is plain text too.
- After a `Minutes` tap (in home's Settings sheet) a ready plant's label ends `, ready today`, so
  `label=Isaiah 41:10, seed` no longer matches it: tap it by its full
  label.
- `Your field` never needs a scroll step: it is in Today's header, outside
  the scroll view. Tap it as it is; a scroll just before a tap can leave the
  scroll view moving, and a tap then may stop the scroll instead of pressing.
  The field's Today card likewise sits fixed above the scroll view; its
  `Settings` row lies at the scroll view's end, so scroll to it first.
