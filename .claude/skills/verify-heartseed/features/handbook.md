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
order, with `Remove <title>`. A verse already in the field keeps its one
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
  furrow after the promise, its four plants and `Remove Smyrna`.
- `handbook-row` (live): after a relaunch the furrow shows again, and the
  offer reads `In your field`.
- `handbook-one-plant` (live): `Promises of God` (87 verses) shows the
  promise's own verse at its one stage.
- `handbook-limit` (live): a passage and two lists held show the limit
  line, no add.
- `handbook-remove` (live): `Remove <title>` asks; `Keep` keeps; `Remove`
  takes the furrow out, the plants kept.
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

- Home → `Add a list` → scroll the sheet past `Rest` → a Handbook shelf
  (`Seven Churches`, `Prophecy`, …) → `Plant <title>`.
- Home → a list's furrow → `Remove <title>` → `Remove` or `Keep`.

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes: the
installed Debug build of `verify-heartseed`, or `--app` with a build of the
head's native code, serves; the JavaScript comes from the dev server. The
sheet holds 42 heads: `sim scroll screen down`, with a `sim snapshot`
after each scroll, before a tap on a head below the screen; a sheet the
driver cannot scroll is a finding to record.

1. On a fresh install, `first.md` steps 1-7, to `first-home`: the own
   furrow and `Protection & Fear` on home.
2. `handbook-shelf`: `sim tap "id=add-list"`, then scroll to the
   sheet's end. After `Rest`, the buttons in order: `The Word of God`,
   `Duty`, `Second Advent of Christ`, `Ministry of Angels`, `The
   Sanctuary`, `Passover`, `The Family`, `Prayer`, `The Bible Sabbath`,
   `The Law of God`, `Nature of Man`, `The Great Adversary`, `Holy
   Spirit`, `Prophecy`, `Seven Churches`, `The Twelfth Chapter of Daniel`,
   `Armageddon`, `Spirit of Prophecy`, `The Conscience`, `Faith`,
   `Ordinances of the Church`, `Promises of God`, `Temptation`, `Lessons
   From Nature`, `How Long Was Christ In The Grave?`, each with the text
   `S. N. Haskell, Bible Handbook (1919)`; no node's text holds `octrine`.

   ```bash
   sim tap "label=Seven Churches"
   sim snapshot handbook-shelf
   ```

   → `Ephesus` `7 verses`, `Smyrna` `4 verses`, `Pergamos` `6 verses`,
   `Thyatira` `12 verses`, `Sardis` `6 verses`, `Philadelphia` `8
   verses`, and a button `Plant <title>` for each. Then `sim tap
   "label=Prophecy"` and a snapshot → the text `Second Chapter of Daniel`
   once, no `Second Chapter of Daniel (2)`, and no `Plant Ephesus`.

3. `handbook-plant`:

   ```bash
   sim tap "label=Seven Churches"
   sim tap "label=Plant Smyrna"
   sim open / --expect "id=today-card" --no-relaunch
   sim snapshot handbook-plant
   ```

   → the heading `Your field`, no heading `Add a list`; the furrow titles
   in order `Isaiah 41:10`, `Smyrna`, `Protection & Fear`; the caption
   `4 verses to learn`;
   the buttons `Revelation 2:8, not planted` to `Revelation 2:11, not
   planted`; `Remove Smyrna`; `id=add-list` still.

4. `handbook-row`: `sim relaunch`, `sim open / --expect "id=today-card"`,
   snapshot → the `Smyrna` furrow in the same place. The sheet, `Seven
   Churches` → `In your field`, no `Plant Smyrna`, `Plant Ephesus` still.
   `Done`.
5. `handbook-one-plant`: record the own plant's button name
   (`Isaiah 41:10, <stage>`). The sheet, `Promises of God` → `87 verses`,
   `Plant Promises of God`; tap it → home with the furrow `Promises of
   God` after `Smyrna`, its caption `87 verses · 1 planted` (or
   `87 verses · 1 ready today` while the own verse is due), the own plant's button name
   unchanged in every furrow that shows the verse, no `Isaiah 41:10, not
   planted`. Record the seconds from the tap to home, and whether home
   still scrolls and answers a tap on a plant.
6. `handbook-limit`: the sheet, `Psalms` → `Plant Psalms 46:1-3` → home:
   the furrows `Isaiah 41:10`, `Psalms 46:1-3`, `Smyrna`, `Promises of
   God`, `Protection & Fear`; the text `3 passages or lists, the most for
   now. Remove one to add another.`; no `id=add-list`, no `id=add-row`;
   exactly three `Remove <…>` buttons.
7. `handbook-remove`: `sim tap "label=Remove Promises of God"` → `Remove
   Promises of God? Its plants stay in your field.`, `Remove` and `Keep`.
   `Keep` → as before. Again, then `sim tap "label=Remove"` → no `Promises
   of God` furrow, `Add a list` back, no limit line, the own plant's
   button name unchanged. `sim relaunch` → the same.
8. `handbook-probe`:

   ```bash
   sim open / --expect "id=today-card" --no-relaunch
   sim open probe/handbook --expect "label=resolved 3542"
   sim snapshot handbook-probe
   ```

   → the text nodes `sections 25`, `lists 130`, `ranges 2528`,
   `verses 3542`, `resolved 3542` and `missing 0`.

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
furrow's head beside `Remove`; Haskell's page itself (the drive reads
titles and counts only, never text).
