# Pixel match

The Exact ports (`apps/heartseed-exact`, `apps/hymnal-exact`) copy the One
apps (`apps/heartseed`, `apps/hymnal`) pixel for pixel. `@manna/pixel-match`
(`packages/pixel-match`) is the harness that says how far a port is from
that: it captures the One apps as references, drives the port to the same
state, and scores the pair with a strict diff.

```bash
bun run pixel ref <app> [<id>…] [--web] [--repin]  # One references under the pinned One commit (the reference simulator booted and installed)
bun run pixel shot <app> <id>… [--web] [--scheme light|dark] [--size <size>]  # the port against them
bun run pixel report [--unit <unit>]              # tmp/pixel-match/report.json
```

The command line is read before anything runs (`src/args.ts`). A flag that
takes a value and has none (`--size` at the end, or followed by another
flag), a scheme other than `light` or `dark`, a size no cell of the host has
(an iOS text size, or with `--web` a viewport such as `390x844@2`), an
unknown flag, or an id that names no row of the app refuses with its reason
and exit 1.

## Rows and cells

A row is one state of one screen. Each app's rows are in
`packages/pixel-match/screens/<app>/*.ts`, a file per screen, each with:

- its id and the unit that owns it;
- its kind: `match` (both apps draw it), `gap` (One draws it and the port
  does not yet), or `exact-only`;
- its fixture;
- the One side's steps;
- the Exact side's agent ops;
- its masks, each with its reason.

`screens/index.ts` gathers them. Its test holds the counts the run's
inventory gives (70 match rows, 22 gap rows, 423 cells), and that every
match and gap row has a One side over a fixture the harness makes.

A cell is one picture of a row. Each row has a cell in light and dark on
iOS (an iPhone 17 on iOS 27.0) at the default text size. A sweep row also
has light cells at `extra-small`, `extra-extra-extra-large` and
`accessibility-extra-extra-extra-large`. A hymnal row also has web cells:
390 × 844 at 2 px a point and 1280 × 800 at 1, in light and dark.

When One cannot draw a cell, the row names it with its reason
(`notDrawn`). Examples: a transient frame, a web page One does not have.
`pixel ref` lists each such cell and takes no picture.

When the port departs from One on purpose, the row names the cell's
accessibility size with the owner's answer that asks it (`departs`; only
AX1 to AX5, by its type). The cell keeps its reference and is still shot
and scored. `pixel report` lists it under `departures` and prints its score
beside its reason, and the acceptance check does not hold it to the
threshold. The four are Heartseed's `today.new`, `today.letters`,
`today.result` and `list.page` at AX5 (owner, q160);
`screens/screens.test.ts` holds the list to them.

Heartseed's port cells at an accessibility size are drawn smaller than
One's, and no row fixes it. The port's `rem` is UIKit's body size: 28, 33, 40, 47
and 53 pt at AX1 to AX5. React Native scales One's text by its own table
(`RCTUtils.mm`: 1.786, 2.143, 2.643, 3.143 and 3.571 times the default
size, so 30.4 to 60.7 pt for a 17-pt body). So the port's text is 0.922,
0.906, 0.890, 0.880 and 0.873 of One's, and at `extra-small` and
`extra-extra-extra-large` the two agree. Heartseed's `about.page` at AX5
shows it alone: 8.703 %, with each glyph 0.873 of One's height. Exact
gives only `accessibilityTextSize`, which says yes or no, so the port
cannot follow React Native's table; that is an upstream ask. The hymnal
is not measured: One caps some of its text at 1.3 times the default size
(`MOST_SCALE`, on the find bar, the player and the reading sheet), so
there One's text may be the smaller. A hymnal find cell shot at AX5,
glyph heights compared as for `about.page`, would settle it.

## References

`pixel ref` takes the One side, iOS cells first, on the app's own reference
simulator: `verify-heartseed-one` or `verify-hymnal-one`
(`packages/pixel-match/src/sim/apps.ts`). It drives the simulator through
`@manna/sim`, with the dev server on 8290 (Heartseed) or 8260 (the hymnal).
The run scripts are `src/sim/heartseed.ts` and `src/sim/hymnal.ts`, for
example `boot`, `install --prebuild`, and `down --clean`.

For each cell, the harness:

1. stops the app;
2. writes the fixture into One's key-value store (`one_kv` in the app
   container);
3. sets the scheme, text size, Reduce Motion and Prefer Non-Blinking
   Cursor (so a focused field's caret holds steady and drawn, and a
   capture with the keyboard up holds still), then reads them back; `pixel
   shot` sets the same caret on the port's simulator;
4. overrides the status bar to 9:41, full bars and charged;
5. drives the steps;
6. keeps the screen once two takes 500 ms apart are the same bytes (three
   tries);
7. for a keyboard row (`keyboard: true`), reads the keyboard's top from the
   tree (UIKit's `inputView`, the keys with the predictions bar), or
   refuses the capture when no keyboard is up;
8. refuses a Heartseed capture whose greeting's face (morning from 04:00,
   afternoon from 12:00, evening from 18:00) changed between the cell's
   start and the still capture (`src/clock.ts`);
9. refuses the capture if the accessibility tree holds a development
   overlay.

A picture is taken beside the reference (`.taking.png`) and replaces it only
once kept (`keepTaken` in `src/take.ts`), so a capture that is refused
leaves the cell's earlier reference as it was.

`--web` takes the hymnal's web cells from One's production web build
(`bun run --cwd apps/hymnal build`, its `dist/client`). It serves the build
from plain files on 8261 and captures it with headless Chromium
(`--use-mock-keychain --password-store=basic`, so it never asks the login
keychain). The fixture goes into `localStorage` before the
page loads. A blank page is refused.

A reference goes to
`$PIXEL_REF/<one>/<app>/<host>/<id>/<scheme>-<size>.png`, with a `.json`
beside it. The `.json` records the commit, fixture, the cell's start
(`startedAt`), the still capture's time (`capturedAt`) and local hour
(`hour`) with the host's zone (`timeZone`), simulator or browser, the tree's
digest and the picture's hash.

- `<one>` is the pinned One commit, the one line of
  `packages/pixel-match/one-commit` (`src/pin.ts`), 12 hex digits; any other
  text in it stops every command. A port's refactor under a One app's folder
  lands as a commit there, so the key is pinned rather than read from git,
  or every reference would read as missing.
- The One paths are `apps/heartseed`, `apps/hymnal`, `packages/hymnal` and
  `packages/core`, less their tests (`*.test.ts`, `*.test.tsx`) and the
  declarations a One app keeps for its port (`apps/*/exact/**`), none of
  which a One build runs. Each commit under them since the pin (each commit
  a merge brings counted on its own, and a merge itself only when its
  resolution changes a file there, one that differs from every parent) is
  either listed in
  `packages/pixel-match/render-neutral` or a drift. On a drift every
  command prints one line on stderr naming the pin, the latest One
  commit, the unlisted commits and the files they change, and `pixel ref`
  refuses to capture.
- **Listing a commit render-neutral.** Only a commit that cannot change a
  pixel One draws: a rule moved unchanged between modules, an `exports`
  line, a type. Read its diff under the One paths first. Add one line to
  `render-neutral`, the commit's first 12 hex digits (`git rev-parse
  --short=12 <commit>`), a space, and the reason (`move: headLine,
  unchanged, from HymnPage.tsx into reader/head-line.ts`); a line with no
  commit or no reason stops every command. List a commit once it is on
  `main`, whose hashes do not change. A commit that changes what One draws
  is never listed: its rows' references are stale and are taken again.
- `pixel ref … --repin` captures under the latest One commit, rewrites the
  pin and empties `render-neutral`; take every row of both apps that way,
  since the references under the old pin are not read once it moves.
  Commit the pin and the ledger with them.
- `PIXEL_REF` defaults to `tmp/pixel-match/ref` in the checkout.

References hold hymn and verse words. Never commit or publish them.

## Fixtures

`src/fixtures.ts` holds the named states of the stored data, as the pairs
One's store keeps. The fixtures name verses by reference and hymns by
number; none holds a word of either.

A Heartseed fixture is a function of the capture's local day. Each recall
sits at 05:00 local, a whole number of days back, so a capture on any later
day shows the same plan.

Each planting is checked against the app's own `stageOf` and FSRS `review`.
A fixture that would not land on the stage and due state it names throws.
Every hymnal fixture keeps Sound and Sounds and haptics off.

## The diff

`src/diff.ts` is a pure function of two decoded pictures and a list of
masks:

- a pixel differs when any of red, green or blue is more than the channel
  apart;
- a masked pixel is never scored;
- two different sizes fail and are never counted.

It returns the scored, differing and masked counts and the largest
8-connected differing region. Its generated property test holds those
rules. PNGs are read and written by `src/png.ts` over node's zlib.

`pixel shot` drives the port through `bun run exact agent ios` on its Exact
simulator, with the row's ops. It sets the simulator's text size to the
cell's before every iOS cell, reads it back after the drive, records it in
the result (`contentSize`), and refuses the shot when it is not the cell's:
the Exact simulators are shared, and a size an earlier run left on one
would score another screen. After every cell, passed or failed, it puts
the size back to `large` (`atContentSize`), so no later cell, test or
drive inherits it. Each drive's whole stdout and stderr is kept beside the
cell's screen (`<cell>.log` under `tmp/pixel-match/shots/`); a failed cell
prints the log's path and the last lines of both, since an agent run with
`--json` says why it stopped in its last reply on stdout. A row whose
drive must move a system sheet (a drag to the player's full detent) sets
`exact.touch: 'platform'`, and the drive runs with Exact's
`--touch platform`, every tap and drag a real touch. The row's fixture is first written into the
port's own store (`src/port-store.ts`): Heartseed's port keeps One's pairs
in `app:/data/heartseed.json`, so the pairs are written to that file of
the drive's named store (`Library/Caches/exact/<app id>/agent/pm-<id>` in
the app's container, emptied first), and the drive keeps it
(`--keep-storage`). The hymnal's port keeps each setting as a persisted
state of its own name, which an agent drive's named store holds as one file
each, `kv/exact.state/<the name in base32>`, beside `data/`; so each of
One's keys is written as the state the port reads it from (`feel` as
`settingsFeelKept`, `lists.favourites` as `favouriteList`, `lists.recent` as
`recentList`, `chords` as `chordsOn`; `sound` has no switch in the port and
nothing on screen), and a key with no place there is refused. A row with no
fixture starts from an empty store. It leaves
`apps/<app>/app/routes.d.ts`, the route types One's dev server writes while
a reference is taken, in place: the `bun run exact` wrapper sets them aside
for each run and puts them back (`routeTypesAside`,
`packages/exact-kit/src/route-types.ts`). The port runs on the agent's clock, not the wall clock: it is
launched with `--epoch` at half past the reference's recorded hour, today,
and `--time-zone` the host's zone, so it draws the reference's greeting face.
A reference recorded in another zone is refused. It takes the screen with
Exact's `compare` against the reference, then scores the pair at the
threshold's channel (16). It writes, under `tmp/pixel-match/shots/`:

- the result;
- the counts at channel 0, 4, 8 and 16;
- a diff picture: the reference, the screen, the differing pixels in red,
  and the masks hatched.

Before each cell is shot, on either host, its earlier result and diff
picture are removed, so a cell whose shot fails or is refused has no result
for `pixel report` to read, never an older shot's score.

### Heartseed's content band

The port keeps UIKit's navigation bar and tab bar on Heartseed's Garden
screens (home, a list, Today); One draws its own header row and neither
bar (owner, q2). So these rows (`screens/heartseed/band.ts`) are scored over
a band, not the whole picture:

- On the One side, the band runs from an edge read from One's tree when the
  reference is taken, to the picture's foot. On home it starts at the
  greeting's top (home has no header row). On a list it starts under the
  `Your field` back link. On Today it starts under the heading row. The
  reference's `.json` keeps that top as `band.top`, in device pixels.
- On the Exact side, the band runs from the bottom of the node `exact.band.top`
  names (a zero-high node at the top of the content under the navigation
  bar) to the foot of the scrollport of the scroller `exact.band.bottom`
  names (its `port`), both read from the whole-tree `layout` reply, in the
  screen's points. `layout <node>` is not read: its `absolute` box stands in
  the content of the scroller holding the node, so a top inside a scroller
  (an About's first text) answered the same y wherever its sheet sat. UIKit draws the tab bar, so no node has its frame, and
  insets a tab's last scroller by its height, so the scrollport ends where
  the tab bar begins (`src/agent-band.ts`). Today's scroller sits over a
  fixed footer, so its scrollport ends above it: Today names instead a
  zero-high node under the footer, and a node with no scrollport ends the
  band at its top. The row's unit writes both with
  the row's ops; a banded row without them fails.
- The two bands are laid edge to edge at their tops, or at their feet for a
  row scrolled to its end (`anchor: 'bottom'`), and cut to the shorter.
  Masks move with the reference's band and still count toward the mask cap.

The result's `total` is the band's pixels and `picture` the whole
picture's. The acceptance check fails a band under 60 % of the picture.
The Settings and Add sheets are scored whole (`total` equals `picture`).

### Bands outside Heartseed's Garden

- **The keyboard.** The system draws the software keyboard in both apps, and
  its predictions move, so it is left out as Heartseed's bars are, not
  masked: a row with `keyboard: true` (the hymnal's search rows) ends each
  side's band at the keyboard's top. One's is read from the tree when the
  reference is taken (`keyboard` in the `.json`, in device pixels); the
  port's from the agent's `state keyboard` (its `top`, in points) after the
  row's ops. The band runs from the picture's top, or from a banded row's
  top, and a band under 60 % still fails.
- **The About rows** (calibration). One draws each About inside its own
  sheet (Heartseed's page sheet, the hymnal's Settings sheet scrolled to
  its last group) and the port pushes a page of its own under a bar, so the
  two pictures are different screens around the same content. Each is
  scored from the top of the same first text on both sides (Heartseed's
  `about-name` and first licence text, the hymnal's recordings' lead),
  with the port's band edge read from that node's top (`edge: 'top'`).
  The hymnal's port opens Settings at half height, where iOS 26 floats the
  sheet and draws it at 0.96, so its drive first lifts it to full height by
  a real touch (`touch: 'platform'`, a drag on About's list), as One's
  sheet stands. These bands are under 60 % for the hymnal (its group is the sheet's last),
  so its cells fail `accept.ts` by design: they give the calibration's
  ladder, not a pass.

### The web

`pixel shot <app> <id>… --web` takes the port's web cells: the port's web
build in the agent's own Chromium (`bun run exact agent web`, launched with
`--use-mock-keychain --password-store=basic`), at the reference's viewport
(`--size 390x844`) and its device scale (`EXACT_SCALE`, Chrome's own scale
factor, never CDP's emulated one), with the cell's scheme preferred. Its ops
are the row's `exact.web.ops`, else its iOS ops. iOS masks are never laid
on a web picture: a web cell lays only `exact.web.masks`, in CSS pixels.

A web cell starts from the same fixture as the reference's page and the
port's iOS cell (`webSeedOf` in `src/seed.ts`, from the same `seedPlan`),
Sounds and haptics off with it:

- The hymnal's persisted states are written into the drive's own store
  (`src/web-store.ts`). On the web a named store (`--storage pm-<id>`) is a
  Chrome profile of Exact's, and a persisted state lives in the page
  origin's `localStorage` under `exact.state.@<the app directory's
  digest>/<name>`. The profile's path, the digest and the browser are
  Exact's own (`scripts/agent-launch.mjs` at the pin: `webStore`,
  `appDigest`, `chromium`, `removeDriveStore`), never a copy. The store is
  emptied, opened by that browser on a page of the cell's origin, written,
  and the browser closed, which writes `localStorage` to the profile.
- An origin is its port, and the wrapper serves each drive on a port of the
  app's spare range, so the cell claims one port
  (`@manna/exact-kit/port`'s `claimAppPort`), seeds on it, and drives on it
  (`--port`, `--keep-storage`).
- The drive reads each seeded state back (`state <name>`) once the page
  settles, before the row's ops can change it (opening a hymn adds it to
  Recent). A state that does not read its seeded value refuses the cell
  (`readBackRefusal`), so a store the page did not read is never scored.
  `src/shot-web.test.ts` holds this through `shoot` itself, with a fake
  port, store writer and drive.
- A row with no fixture starts from an emptied store (`--reset-storage`).
- Heartseed's port keeps its fixture in a file (`app:/data/heartseed.json`),
  which the web host holds in IndexedDB. Heartseed has no web cells, and a
  web seed of a Heartseed fixture is refused, naming the row.

`pixel report` writes every cell's state to `tmp/pixel-match/report.json`,
in the format the run's acceptance check reads: its references and its
results.
