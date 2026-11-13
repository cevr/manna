# Move back a stage

A reader no longer sure of a verse moves it back one stage (Mark 4:28:
full corn to an ear, an ear to a blade, a blade to a seed) from Today
opened on it by a tap: its row on a list's page (`list.md`), its plant on
home (`home.md`) or `Practice this list` (`apps/heartseed/src/garden/back.tsx`,
`Backs` in `apps/heartseed/src/garden.ts`; `apps/heartseed/README.md`,
Garden).

- **The control**, in Today's footer outside the scroll view, over `Say
  it`: `Move back a stage`, while the verse shown is a tapped verse (the
  visit's) past a seed and at rest: no recital under way, held or done. A
  seed shows none (no stage lies below it), and neither does the plan's own
  item (Today by `Start`).
- **The ask**, in its place: `id=back-ask` `Move <reference> back to
  <stage>? It comes due again soon.` with `Move back` and `Keep`. `Keep`
  puts the control back.
- **Moved**: one record `heartseed/back/<reference>/<at>`; the stage line
  (`Stage: <stage>`), `id=moved` `Moved back to <stage>.`, home's plant
  (`<reference>, <stage>`) and the list's row show the lower stage. The
  verse's card takes an Again there, so it comes due within minutes, in a
  later plan, said under its new stage's cue. A write that fails leaves
  `id=back-alert` `<reference> was not moved back. Try again.` and the
  stage.

## Sub-features

- `back-none-seed`: a tapped seed shows no `Move back a stage`.
- `back-ask`: a tapped blade's control asks, naming the verse and the
  stage below; `Keep` keeps it.
- `back-moved`: `Move back` shows `Stage: seed`, `Moved back to a seed.`,
  no control, and home's `Isaiah 41:10, seed`.
- `back-tests-only` (tests only, `test:back`, `test:back-today`;
  `apps/heartseed/README.md`, Tests): full corn and an ear moved back, the
  card's Again and its due, a relaunch reading the step back, a refused
  write's alert, an unread garden, no control on the plan's item, and
  two taps of `Move back` in one turn moving the verse once, and
  generated asks (taps and slow or refused saves) each moving it at most
  one stage with the line or alert matching what was saved.

## How to get to it (user POV)

- Home → a planted verse's plant (or a list's row) → Today → `Move back a
  stage` → `Move back`.

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes: the
installed Debug build serves, the JavaScript from the dev server. Report
labels, counts and booleans only, never a verse's words.

1. Home with `Isaiah 41:10, seed` (after `first.md`'s `sim journey
   first`, or any drive that leaves the passage a seed and no item held).
2. `sim journey back` → `"ok":true`. It taps the seed's plant
   (`back/back-seed`: `Stage: seed`, `Say it`, no `Move back a stage`:
   `back-none-seed`), says it (`back/back-grown`: `Stage: blade`), takes
   `Next` and `Your field`, taps `Isaiah 41:10, blade`
   (`back/back-blade`: `Move back a stage`), asks (`back/back-ask`: the
   line `Move Isaiah 41:10 back to a seed? It comes due again soon.`,
   `Move back`, `Keep`), keeps, asks again and moves
   (`back/back-moved`: `Stage: seed`, `Moved back to a seed.`, no
   control), then `Your field` (`back/back-home-seed`: `Isaiah 41:10,
   seed`). The journey leaves the passage a seed, so it runs again.
3. `sim doctor` (record `head` and `timingsHold`) and `sim down`; delete
   the `snapshots` folder.

Red on base (`67358563f`): `back`'s `back-blade` fails `TargetMissing` on
`label=Move back a stage`.

## What the simulator cannot show

The tests own each: full corn and an ear moved back, the due within ten
minutes, the step back read at a relaunch, a refused write and its alert,
and no control on the plan's own item. The control's weight beside `Say
it` is the owner's Release build's check.
