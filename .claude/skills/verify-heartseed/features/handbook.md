# The Handbook lists

Stephen N. Haskell's _Bible Handbook_ (1919) is data the app holds as lists
of KJV references (`apps/heartseed/data/handbook.json`, written by
`apps/heartseed/scripts/handbook.ts` from a copy of the EGW database and the book's contents
page): each sub-heading of a teaching section (and each section written
without sub-headings) is one list, named by Haskell's own heading, its
ranges in his order, grouped under its section (`apps/heartseed/src/handbook.ts`:
`HANDBOOK`, `HANDBOOK_LISTS`); the sub-headings of one title in one
section are one list (the two `Second Chapter of Daniel` headings of
`Prophecy` are `bhb-1695`, 102 verses). The eight practical sections
(`Health and Temperance`, `Dress`, `Diet and Dress`, `Business
Principles`, `School of the Prophets`, `Bible Etiquette`, `City Work`,
`Organization of Local Churches Officers`) are left out. References only:
every verse's text comes from the bundled KJV.

Each of the 25 teaching sections is a shelf of the Add a list sheet
(`home.md`), after the 17 others, in the book's order, under Haskell's
title with the text `S. N. Haskell, Bible Handbook (1919)`. A shelf lists
its lists, each with its title, `<n> verses` (distinct verses) and
`Plant <title>` or `In your field`. `Plant` stores the list's id once
in the stored lists' key and leads home, where the list's furrow follows
the reader's passages, titled by the list, every verse in Haskell's
order, titled by the button `Open <title>`, whose page (`list.md`)
holds `Remove <title>`. A verse already in the field keeps its one
plant. Passages and lists count together toward the limit of 3
(`passage.md`).

A development probe, `apps/heartseed/app/probe/handbook.tsx`
(`heartseed://probe/handbook`), prints six lines, counts only, never a
word of a verse: `sections <n>`, `lists <n>`, `ranges <n>`, `verses <n>`
(distinct verses), `resolved <n>` (those verses whose text the device's
corpus gives) and `missing <n>`. A release build renders nothing on it.

## Sub-features

- `handbook-shelf` (live): the sheet's 25 Handbook shelves after `Rest`,
  each with the note; `Seven Churches`' six lists with their counts;
  `Prophecy`'s one `Second Chapter of Daniel`.
- `handbook-plant` (live): `Plant Smyrna` leads home with the `Smyrna`
  furrow after the promise (`Open Smyrna`), its four plants, and no
  `Remove` on home.
- `handbook-row` (live): after a relaunch the furrow shows again, and the
  offer reads `In your field`.
- `handbook-one-plant` (live): `Promises of God` (87 verses) shows the
  promise's own verse at its one stage.
- `handbook-limit` (live): a passage and two lists held show the limit
  line, no add.
- `handbook-remove` (live): `Open <title>`, then the page's `Remove
  <title>` asks; `Keep` keeps; `Remove` shows home without the furrow, the
  plants kept.
- `handbook-probe` (live): the probe shows `sections 25`, `lists 130`,
  `ranges 2528`, `verses 3542`, `resolved 3542` and `missing 0`.
- `handbook-tests-only` (tests only): the generator's rules, the app's
  view of the data, the stored lists' key, the shelves and the furrows
  (`test:handbook-build`, `test:handbook`, `test:passages-lists`,
  `test:passages-session-lists`, `test:shelves-lists*`,
  `test:shelves-walk-lists-*`, `test:field-bar-planted-*`;
  `apps/heartseed/README.md`, The Handbook lists, Passages, Choosing a
  passage).

## How to get to it (user POV)

- Home → scroll to `Add a list` at the field's foot → `Add a list` →
  scroll the sheet past `Rest` → a Handbook shelf
  (`Seven Churches`, `Prophecy`, …) → `Plant <title>`.
- Home → a list's `Open <title>` → `Remove <title>` → `Remove` or `Keep`.

## Driving it

`sim journeys <file>.md` plays the lists below one after another, each in one app session from its start, with no screenshot and no video, and names each journey that fails with its first failed step and the journey before it (`SKILL.md`, Drive). The by-hand steps between them (a raw snapshot, a read of the log) are not part of it.

**Journeys in order:** from a fresh install: `first`, `handbook`, `handbook-row`, `handbook-one-plant`, `handbook-limit`, `handbook-remove`, `handbook-probe`.

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes: the
installed Debug build of `verify-heartseed`, or `--app` with a build of the
head's native code, serves; the JavaScript comes from the dev server. The
sheet holds 42 heads: a journey scrolls to a head below the screen before
its tap; a sheet the driver cannot scroll is a finding to record.

The taps are journeys beside this file, each one `sim journey` call, in
this order: `handbook`, `handbook-row`, `handbook-one-plant`,
`handbook-limit`, `handbook-remove` and `handbook-probe`. A receipt
(`$EVIDENCE/snapshots/<journey>-<nn>-<step>.txt`, cited as
`<journey>/<step>`) holds the visible nodes' types and labels; a list below
the fold is read in a raw snapshot (`first.md`, Driving it) taken where a
journey leaves the screen.

1. On a fresh install, `first.md`'s `sim journey first`, to `first-home`:
   the own furrow and `Protection & Fear` on home.
2. `handbook-shelf`: `sim journey handbook` → `"ok":true` (steps 2-3).
   `handbook/handbook-shelf-scroll`, after `Add a list` and the scroll to
   `Seven Churches` (with a raw snapshot there for the rest of the
   order): after `Rest`, the buttons in order: `The Word of God`, `Duty`,
   `Second Advent of Christ`, `Ministry of Angels`, `The Sanctuary`,
   `Passover`, `The Family`, `Prayer`, `The Bible Sabbath`,
   `The Law of God`, `Nature of Man`, `The Great Adversary`,
   `Holy Spirit`, `Prophecy`, `Seven Churches`,
   `The Twelfth Chapter of Daniel`, `Armageddon`, `Spirit of Prophecy`,
   `The Conscience`, `Faith`, `Ordinances of the Church`,
   `Promises of God`, `Temptation`, `Lessons From Nature`,
   `How Long Was Christ In The Grave?`, each with the text
   `S. N. Haskell, Bible Handbook (1919)`; no node's text holds `octrine`.
   `handbook/handbook-shelf`, after `Seven Churches` → `Ephesus`
   `7 verses`, `Smyrna` `4 verses`, `Pergamos` `6 verses`, `Thyatira`
   `12 verses`, `Sardis` `6 verses`, `Philadelphia` `8 verses`, and a
   button `Plant <title>` for each. `handbook/handbook-prophecy`, after
   `Prophecy` → the text `Second Chapter of Daniel` once, no
   `Second Chapter of Daniel (2)`, and no `Plant Ephesus`.
3. `handbook-plant`: `handbook/handbook-plant-row`, after `Seven
   Churches`, `Plant Smyrna` and the scroll up to `Open Smyrna` → the
   heading `Your field`, no heading `Add a list`; the furrow title buttons
   in order `Open Isaiah 41:10`, `Open Smyrna`, `Open Protection & Fear`;
   the caption `4 verses to learn`; the buttons `Revelation 2:8, not
   planted` to `Revelation 2:11, not planted`; no `Remove`. The journey's
   `handbook-plant-foot` finds `id=add-list` still, at the foot.
4. `handbook-row`: `sim journey handbook-row` → `"ok":true`.
   `handbook-row/handbook-row`, after a relaunch → the `Smyrna` furrow in
   the same place. `handbook-row/handbook-row-offer`, the sheet's
   `Seven Churches` → `In your field`, no `Plant Smyrna`, `Plant Ephesus`
   still. Then `Done`.
5. `handbook-one-plant`: record the own plant's button name
   (`Isaiah 41:10, <stage>`) from `handbook-one-plant/handbook-one-plant-home`.
   `sim journey handbook-one-plant` → `"ok":true`.
   `handbook-one-plant/handbook-one-plant-offer` → `87 verses`,
   `Plant Promises of God`. `handbook-one-plant/handbook-one-plant-row`,
   after the tap and the scroll up to `Open Promises of God` → home with the furrow `Promises of God` after `Smyrna`, its
   caption `87 verses · 1 planted` (or `87 verses · 1 ready today` while
   the own verse is due), the own plant's button name unchanged in every
   furrow that shows the verse, no `Isaiah 41:10, not planted`. Record the
   tap step's `ms` (its line in `$EVIDENCE/results.jsonl`), and whether
   home still scrolls and answers a tap on a plant (the next journeys).
6. `handbook-limit`: `sim journey handbook-limit` → `"ok":true`: the
   sheet, `Psalms`, `Plant Psalms 46:1-3`.
   `handbook-limit/handbook-limit-row`, after the scroll up to
   `Open Psalms 46:1-3` → home: the furrows `Isaiah 41:10`,
   `Psalms 46:1-3`, `Smyrna`, `Promises of God`, `Protection & Fear`; no
   button named `Remove` or starting `Remove `.
   `handbook-limit/handbook-limit-line`, after the scroll down to
   `id=limit` → the text `3 passages or lists, the most for now. Remove
   one to add another.` under `Mark 4:28` and above `Settings`; no
   `id=add-list`, no `id=add-row` (gone from the sources: read it as
   absent in the receipt).
7. `handbook-remove`: `sim journey handbook-remove` → `"ok":true`.
   `handbook-remove/handbook-remove-ask` → `id=ask`
   `Remove Promises of God? Its plants stay in your field.`, `Remove` and
   `Keep`. The journey's `Keep` brings `Remove Promises of God` back with
   no `id=ask`; again, then `Remove`: `handbook-remove/handbook-remove` →
   home: no `Open Promises of God`, the own plant's button name
   unchanged; the journey's `handbook-remove-foot` finds `Add a list` back
   at the foot. After a relaunch,
   `handbook-remove/handbook-remove-relaunch` and its foot → the same.
8. `handbook-probe`: `sim journey handbook-probe` → `"ok":true`.
   `handbook-probe/handbook-probe` → the text nodes `sections 25`,
   `lists 130`, `ranges 2528`, `verses 3542`, `resolved 3542` and
   `missing 0`.
9. Regressions on the same install: `home.md`'s `home-add` and its probe
   line `shelves 42`; `passage.md`'s `passage-limit`. Then `sim doctor`
   (record `head` and `timingsHold`) and `sim down`.

Report the titles, counts, button names and seconds only; delete the
`snapshots` folder.

## Gotchas

- **A link that launches the app lands on home** (`dictation.md`,
  Gotchas): open `/` first, then the probe.
- The probe reads every chapter its verses name once, on the device; it
  shows after the bundle loads, with no wait of its own.
- A list's furrow holds every plant of the list: `Promises of God` draws
  87 buttons in a scroll view that is not virtualised.

## What the simulator cannot show

The tests own each: a refused write and its alert; `Full` and `Held` by
stale props; a double tap and the pending state; unread keys; an unknown
stored id kept; the session's order over a list; the sheet and a list's
furrow in dark and their contrast; whether a 64-character title fits a
furrow's head and a list page's heading; Haskell's page itself (the drive reads
titles and counts only, never text).
