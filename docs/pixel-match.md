# Pixel match

The Exact ports (`apps/heartseed-exact`, `apps/hymnal-exact`) copy the One
apps (`apps/heartseed`, `apps/hymnal`) pixel for pixel. `@manna/pixel-match`
(`packages/pixel-match`) is the harness that says how far a port is from
that: it captures the One apps as references, drives the port to the same
state, and scores the pair with a strict diff.

```bash
bun run pixel ref <app> [<id>…] [--web]           # One references (the reference simulator booted and installed)
bun run pixel shot <app> <id>… [--scheme light|dark] [--size <size>]  # the port against them
bun run pixel report [--unit <unit>]              # tmp/pixel-match/report.json
```

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
3. sets the scheme, text size and Reduce Motion, then reads them back;
4. overrides the status bar to 9:41, full bars and charged;
5. drives the steps;
6. keeps the screen once two takes 500 ms apart are the same bytes (three
   tries);
7. refuses the capture if the accessibility tree holds a development
   overlay.

`--web` takes the hymnal's web cells from One's production web build
(`bun run --cwd apps/hymnal build`, its `dist/client`). It serves the build
from plain files on 8261 and captures it with headless Chromium
(`--use-mock-keychain`). The fixture goes into `localStorage` before the
page loads. A blank page is refused.

A reference goes to
`$PIXEL_REF/<one>/<app>/<host>/<id>/<scheme>-<size>.png`, with a `.json`
beside it. The `.json` records the commit, fixture, capture hour, simulator
or browser, the tree's digest and the picture's hash.

- `<one>` is the last commit that changed a One app or the packages they
  draw from.
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
simulator, from a fresh store, with the row's ops. It takes the screen with
Exact's `compare` against the reference, then scores the pair at the
threshold's channel (16). It writes, under `tmp/pixel-match/shots/`:

- the result;
- the counts at channel 0, 4, 8 and 16;
- a diff picture: the reference, the screen, the differing pixels in red,
  and the masks hatched.

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
  names (the navigation bar) to the top of the node `exact.band.bottom` names
  (the tab bar), each read with the agent's `layout` op at the capture. The
  row's unit writes both with the row's ops; a banded row without them fails.
- The two bands are laid edge to edge at their tops, or at their feet for a
  row scrolled to its end (`anchor: 'bottom'`), and cut to the shorter.
  Masks move with the reference's band and still count toward the mask cap.

The result's `total` is the band's pixels and `picture` the whole
picture's. The acceptance check fails a band under 60 % of the picture.
Sheets and every hymnal row are scored whole (`total` equals `picture`).

`pixel report` writes every cell's state to `tmp/pixel-match/report.json`,
in the format the run's acceptance check reads: its references and its
results.
