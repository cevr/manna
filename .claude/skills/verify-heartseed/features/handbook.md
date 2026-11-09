# The Handbook lists

Stephen N. Haskell's _Bible Handbook_ (1919) is data the app holds as lists
of KJV references (`apps/heartseed/data/handbook.json`, written by
`apps/heartseed/scripts/handbook.ts` from a copy of the EGW database and the book's contents
page): each sub-heading of a teaching section (and each section written
without sub-headings) is one list, named by Haskell's own heading, its
ranges in his order, grouped under its section (`apps/heartseed/src/handbook.ts`:
`HANDBOOK`, `HANDBOOK_LISTS`). The eight practical sections (`Health and
Temperance`, `Dress`, `Diet and Dress`, `Business Principles`, `School of
the Prophets`, `Bible Etiquette`, `City Work`, `Organization of Local
Churches Officers`) are left out. References only: every verse's text
comes from the bundled KJV.

No screen a reader sees shows the lists yet: the shelves in Add verses and
planting a list are a later unit's. A development probe,
`apps/heartseed/app/probe/handbook.tsx` (`heartseed://probe/handbook`),
prints six lines, counts only, never a word of a verse: `sections <n>`,
`lists <n>`, `ranges <n>`, `verses <n>` (distinct verses),
`resolved <n>` (those verses whose text the device's corpus gives) and
`missing <n>`. A release build renders nothing on it.

## Sub-features

- `handbook-probe` (live): the probe shows `sections 25`, `lists 131`,
  `ranges 2529`, `verses 3542`, `resolved 3542` and `missing 0`.
- `handbook-quiet` (live, regression): the field's rows are unchanged
  (`promise.md`'s `promise-field`: `Protection & Fear` with 14 verses), no
  row titled by a Handbook list, and home unchanged.
- `handbook-tests-only` (tests only): the generator's rules and the app's
  view of the data (`test:handbook-build`, `test:handbook`;
  `apps/heartseed/README.md`, The Handbook lists).

## How to get to it (user POV)

- Not yet: a reader reaches no Handbook list in this build. The probe is a
  developer's link, not a reader's.

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes: the
installed Debug build of `verify-heartseed`, or `--app` with a build of the
head's native code, serves; the JavaScript comes from the dev server.

1. `first.md` steps 1-7, to `first-home`.
2. `handbook-probe`:

   ```bash
   sim open / --expect "id=counts"
   sim open probe/handbook --expect "label=resolved 3542"
   sim snapshot handbook-probe
   ```

   → the text nodes `sections 25`, `lists 131`, `ranges 2529`,
   `verses 3542`, `resolved 3542` and `missing 0`.

3. `handbook-quiet`:

   ```bash
   sim open / --expect "id=counts"
   sim snapshot handbook-field
   ```

   → home as `first.md`'s `first-home`; the field's rows titled
   `Isaiah 41:10` then `Protection & Fear`, 14 nodes
   `<reference>, not planted` in the second, and no other row.

4. `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Report the probe's lines, the rows' titles and the counts only; delete the
`snapshots` folder.

## Gotchas

- **A link that launches the app lands on home** (`dictation.md`,
  Gotchas): open `/` first, then the probe.
- The probe reads every chapter its verses name once, on the device; it
  shows after the bundle loads, with no wait of its own.

## What the simulator cannot show

The Add verses shelves and planting a list (not built yet); whether a
title fits its row; Haskell's page itself (the drive reads counts only,
never text).
