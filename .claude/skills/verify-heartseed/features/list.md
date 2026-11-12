# A list's own page

Each furrow on home opens its own page (`apps/heartseed/src/list/screen.tsx`,
the rules `apps/heartseed/src/list.ts`; `apps/heartseed/README.md`,
Lists): a tap of its title, the button `Open <title>`, shows the page in
place in the root route (no route, no link, no tab, never stored). Home
holds no `Remove`: a held passage's or Handbook list's remove lives here.

- **Fixed above the scroll view** (`id=list-screen` on the page): the
  button `Your field` (shown `‹ Your field`), back to home; the list's
  title as the page's one heading; the caption (`id=list-caption`: `<n>
  verse(s) · none planted yet`, else `<n> verse(s) · <p> planted`, then `
  · <k> at full corn`); and, while the list has something to start,
  `Practice this list` over its line (`id=list-line`: `<n> ready today ·
  about <k> min`, `Starts with <verse>, nothing is due` or `Starts with
  <verse>, new today`).
- **In the scroll view** one row per verse in the list's order
  (`id=list-row`): its drawing, the reference (`id=list-reference`), the
  stage in words (`id=list-stage`: `A seed`, `A blade`, `An ear`, `Full
  corn`, `Not planted yet`, then ` · ready today`) and a chevron; the row
  is a button named as home's plant (`<reference>, <stage>`, then `, ready
  today`) while a tap can start its verse, and opens Today on it.
- **Remove**, for a held passage or Handbook list, at the list's end:
  `Remove this list` (named `Remove <reference>` or `Remove <title>`) over
  `Its plants stay in your field.`. Its tap shows the ask in its place
  (`id=ask`: `Remove <name>? Its plants stay in your field.`, `Remove`,
  `Keep`); `Keep` puts it back; `Remove` shows home without the furrow, the
  plants kept. A remove that does not land keeps the page with the alert
  `<name> was not removed. Try again.` (`id=remove-alert`).
- `Practice this list` opens Today on the list's open plan items, else on
  its weakest planted verse, else on its first verse to learn; Today's
  `Your field` then leads home, not back to the page. Whenever Say it
  listens the screen is Today.

## Sub-features

- `home-lists` (`home.md`): home's buttons `Open Isaiah 41:10` and `Open
  Protection & Fear`, and 0 buttons named `Remove` or starting `Remove `.
- `list-open`: `Open Protection & Fear` shows its page.
- `list-back`: the page's `Your field` shows home.
- `list-weakest`: before the seed is due, `Open Isaiah 41:10` offers
  `Practice this list` on the planted verse.
- `list-learn`: Fear's `Practice this list` opens Today on its first
  verse, whole (`Psalms 91:1`), its line `Starts with Psalms 91:1, new
  today`; Today's `Your field` leads home.
- `list-verse`: a row's tap opens Today on that verse.
- `list-practice`: with the seed due, the page's line counts it ready.
- `list-remove`: a held passage's page asks, keeps, and removes.
- `list-tests-only` (tests only): a refused remove and its alert, a
  second tap while a remove is pending, Say it starting while a page
  shows, every text's contrast in both schemes, and the visit each start
  makes (`test:list`, `test:list-screen`, `test:list-walk`,
  `test:list-walk-b`; `apps/heartseed/README.md`, Tests).

## How to get to it (user POV)

- Home → a furrow's title (`Open <title>`) → its page → `Practice this
  list`, a verse, `Remove this list`, or `‹ Your field`.

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes: the
installed Debug build of `verify-heartseed`, or `--app` with a build of the
head's native code, serves; the JavaScript comes from the dev server.
Report labels, counts and booleans only, never a verse's words.

1. On a fresh install, `first.md` steps 1-7, to `first-home`, and
   `home.md`'s `home-lists` (step 3).
2. `list-open`: `sim tap "label=Open Protection & Fear"`, `sim snapshot
   list-open` → the heading `Protection & Fear` (the one heading);
   `id=list-caption` `14 verses · none planted yet`; the button `Practice
   this list` with `id=list-line` `Starts with Psalms 91:1, new today`; 14
   buttons ending `, not planted`, `Psalms 91:1` first and `Isaiah 41:13`
   last, in the list's order (`promise.md`); the button `Your field`; 0
   buttons starting `Remove`.
3. `list-back`: `sim tap "label=Your field"` → home: `id=today-card`, the
   heading `Your field`.
4. `list-weakest` (before the seed is due): `sim tap "label=Open Isaiah
   41:10"` → the caption `1 verse · 1 planted`; the line `Starts with
   Isaiah 41:10, nothing is due`; one row button `Isaiah 41:10, seed`.
   `sim tap "label=Practice this list"`, `sim open / --expect "id=session"
   --no-relaunch` → `id=reference` `Isaiah 41:10`, `Say it`. `sim tap
   "label=Your field"`.
5. `list-learn`: `sim tap "label=Open Protection & Fear"` → the line
   `Starts with Psalms 91:1, new today`; `sim tap
   "label=Practice this list"`, `sim open / --expect "id=session"
   --no-relaunch` → `id=reference` `Psalms 91:1`, whole (`phrase.md`);
   `Say it` (`Listen` too while the voice is on). `sim tap
   "label=Your field"` → home (the heading `Your field`, `id=today-card`),
   not the page.
6. `list-verse`: `sim tap "label=Open Protection & Fear"`, `sim tap
   "label=Psalms 91:2, not planted"`, `sim open / --expect "id=session"
   --no-relaunch` → `id=reference` `Psalms 91:2`;
   `Say it`. `sim tap "label=Your field"`.
7. `list-practice`, only in `home.md`'s `home-today` state (7 minutes
   after planting, `5 min` in Settings): `sim tap "label=Open Isaiah
   41:10"` → the row `Isaiah 41:10, seed, ready today`; the line `1 ready
   today · about 1 min`; `sim tap "label=Practice this list"` →
   `id=session` on `Isaiah 41:10`. `sim tap "label=Your field"`.
8. `list-remove`: `passage.md`'s `passage-plant` first (John 15:1-5
   planted). On home 0 buttons starting `Remove`. `sim tap "label=Open
   John 15:1-5"`, `sim tap "label=Remove John 15:1-5"` → `id=ask` with
   `Remove John 15:1-5? Its plants stay in your field.`, the buttons
   `Remove` and `Keep`. `sim tap "label=Keep"` → `Remove John 15:1-5`
   back, no `id=ask`. `sim tap "label=Remove John 15:1-5"`, `sim tap
   "label=Remove"` → home: no `Open John 15:1-5`, `id=add-list` present.
9. `sim doctor` (record `head` and `timingsHold`) and `sim down`; delete
   the `snapshots` folder.

Red on base (`97c44ecad`): at `first-home`, `sim tap "label=Open
Protection & Fear"` fails `TargetMissing`; after `passage-plant`, home's
snapshot holds `Remove John 15:1-5`.

## What the simulator cannot show

The tests own each: a refused remove and its alert, a double tap and the
pending state, Say it starting while a page shows, the page's colours and
contrast in dark, and the visit each start makes. The rows' and the
title's size and weight, and the chevron's reading as a door, are the
owner's Release build's check.
