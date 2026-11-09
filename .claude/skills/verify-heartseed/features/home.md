# Home

The home's rules (`apps/heartseed/README.md`, Home): the greeting by the
reader's local hour, the furrows (one per row of the field, each its list's
kind, icon and ripe count, each plant's stage and ready mark), the lists
the field holds, the shelves Add verses will offer, and Start here, a tap on
a verse that makes it the session's visit. No screen a reader sees draws
them yet (hshomefield onward). The development probe
(`apps/heartseed/app/probe/home.tsx`, in a development build only) shows them as text over the live garden, passages and session,
one line each, and begins the session once the garden is read, as Today
does. Its one button, `Start with <reference>`, starts the first plant (in
furrow order) that `startOf` offers. Nothing it does writes the store.

## Sub-features

- `home-probe`: after the first minute, the probe shows the greeting by
  the host's hour, the own furrow and the `Protection & Fear` furrow with
  their kinds, icons and ripe counts, each plant's label, the counts of
  the plan, the lists and the shelves; `Start with Isaiah 41:10` makes the
  verse the visit, and Today would show it.
- Planned, not yet drivable (the later units of the home, split.md):
  `home-furrows`, `home-dot`, `home-start`, `home-begin`, `home-open`,
  `home-back`, `home-need`, `home-relaunch`, `home-settings`, `home-add`,
  `home-end`, `home-icons`.

## How to get to it (user POV)

- None: a reader never sees the probe. A drive opens it by its link
  (Driving it, step 2).

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes for the
home's rules: `--app` with a build of the head's native code serves; the
JavaScript comes from the dev server.

1. `first.md` steps 1-7, to `first-today`.
2. `home-probe`:

   ```bash
   date +%H%M
   sim open probe/home --expect "label=Home probe"
   sim snapshot home-probe
   ```

   → the text nodes:
   - `greeting Good morning sun` for 0400-1159 by `date +%H%M`,
     `greeting Good afternoon sun` for 1200-1759, else
     `greeting Good evening moon` (take `date` again after the snapshot
     when the first read was within a minute of an edge);
   - `furrow Isaiah 41:10 · own · bow · 0 of 1 ripe`;
   - `furrow Protection & Fear · taught · bow · 0 of 14 ripe`;
   - `counts Nothing to tend now`, or `counts 1 to tend · about 1 min`
     when the seed's learning step had passed when the probe made the
     plan;
   - `plant Isaiah 41:10, seed`, ending `, ready today` exactly when the
     counts line says `1 to tend`;
   - 14 nodes `plant <reference>, not planted`;
   - `lists 2`;
   - `shelves 17` and
     `shelf Psalms · harp · Songs to carry through the day · 6 lists`;
   - a button `Start with Isaiah 41:10`.

3. The tap:

   ```bash
   sim tap "label=Start with Isaiah 41:10"
   sim snapshot home-probe-start
   ```

   → `visit Isaiah 41:10 fresh false` and `today shows Isaiah 41:10`.

4. Regression: `field.md`'s `field-first` and `field-back` on the same
   install pass unchanged.
5. Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Red on base: `sim open probe/home --expect "label=Home probe"` times out
(`ReadinessTimedOut`): base has no such route.

Report only the lines named above and the reference; delete the
`snapshots` folder.

## Gotchas

- The probe's runtime may be a fresh one per route, so the drive asserts
  the visit on the probe (`visit …`, `today shows …`), never on Today.
- The probe shows nothing until the garden, the session, the passages and
  the taught collections are read; `--expect "label=Home probe"` waits for
  all of them.
- On the day of a planting there is no new piece, so the started visit's
  `fresh` is false whether it came from the plan's review item (the seed
  due) or from a review of the plant's recalls (nothing open).
- What the simulator cannot show, the tests own: the greeting at other
  hours and in other zones, a phrase start, Start here landing on Today,
  the shelves sheet and `Plant`, the end of a run, and every icon.
