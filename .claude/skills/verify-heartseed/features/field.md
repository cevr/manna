# Field

The field is the reader's progress (`apps/heartseed/src/field/screen.tsx`,
its rule `apps/heartseed/src/field.ts`): every passage is a row and every
verse a plant (Mark 4:28: seed, then blade, then ear, then full corn). It is
reached from Today by the button `Your field` and left by the button
`Today`, in place in the root route: no route, no link, no tab. Today offers
it only once the garden's read of the device's store completes, and never
while Say it listens. It sits in Today's header beside the heading, outside
the scroll view, so it is on screen without a scroll whatever Today holds
(the recap, the grades, the growth line, an alert). Its heading is `Your field`; under it, the days sown
(`1 day sown`, `<n> days sown`: the distinct UTC days on which any recall
was kept, so it never falls) and the harvest (`<n> verses at full corn`,
`1 verse at full corn`: the verses at full corn now, so Again takes a verse
out). Then one card per row: Today's passage first (`Isaiah 41:10`, shown
even before its first recall, as bare soil), then each other verse the
garden holds, in the order first sown. Each plant is one image to the
screen reader, labelled `<reference>, <stage>` (`seed`, `blade`, `ear`,
`full corn` or `not planted`), its drawing and verse number hidden inside
it. A legend of the four stages and the caption `Mark 4:28` close the
screen. Nothing is stored for it: every launch opens on the pending frame,
then the first minute or Today.

## Sub-features

- `field-control`: Today, read and quiet, offers a button `Your field` in
  its header, inside the window and above the home indicator's area.
- `field-first`: after the first minute, the field shows the passage at a
  seed, `1 day sown`, `0 verses at full corn` and a button `Today`, with no
  `Today` heading and no `Say it`.
- `field-back`: `Today` shows Today as it was.
- `field-grow`: a recital that grows the passage to an ear shows on the
  field as `Isaiah 41:10, ear`.
- `field-listening`: while Say it listens, Today offers no `Your field`.
- `field-again`: Again takes the passage back to a seed and never removes
  a day sown.
- `field-relaunch`: a relaunch opens Today, never the field, and its first
  frame claims no count; the field then shows as before.

## How to get to it (user POV)

- From Today, tap `Your field`; tap `Today` to come back.

## Driving it

`RUN=hsfield-l9` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`, a
free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time in UTC. Nothing native changes for the
field, so an install of a build of `c65e0f162` or later serves (`SKILL.md`,
Launch); the JavaScript comes from the dev server.

1. `first.md` steps 1-7: boot, uninstall, install, revoke the microphone,
   and the first minute to `first-today`.
2. `field-control`: in `first-today`'s snapshot, a button `Your field`.
3. `field-first`: `sim tap "label=Your field"`, `sim snapshot field-first`
   → the heading `Your field`; the text `Isaiah 41:10`; a node labelled
   `Isaiah 41:10, seed`; `1 day sown`; `0 verses at full corn`; a button
   `Today`; no `Today` heading, no `Say it`, no label starting `Stage:`.
4. `field-back`: `sim tap "label=Today"`, `sim open / --expect "id=stage"`,
   `sim snapshot field-back` → the heading `Today`, `Stage: seed`,
   `Your field`.
5. `field-grow`: `grow.md`'s `grow-ear` (Say it, 36 of 37 words), then
   `sim tap "label=Your field"`, `sim snapshot field-grow` →
   `Isaiah 41:10, ear`, `1 day sown` (or `2 days sown` when 00:00 UTC fell
   between the planting and this recital: compare `START` with the time
   now), `0 verses at full corn`; then `sim tap "label=Today"`.
6. `field-listening`: `sim tap "label=Say it"` and at once a raw snapshot
   (`agent-device snapshot --json --raw --observe-only --force-full
   --session verify-heartseed`, in the drive's HOME) → `Listening` present
   and no `Your field`; wait for the recital's count (`sim tap "label=36 of
   37 words" --timeout 30`). Keep only booleans.
7. `field-again`: `sim tap "label=Again"`, then `sim tap "label=Your
   field"`, `sim snapshot field-again` → `Isaiah 41:10, seed`, the same
   days sown as step 5; then `sim tap "label=Today"`.
8. `field-relaunch`: `sim relaunch`, `sim open / --expect "label=Isaiah
   41:10"` and at once `sim snapshot field-relaunch-launch` → no
   `Your field` heading, no label ending `sown` or `full corn`; then
   `sim open / --expect "id=stage"`, `sim tap "label=Your field"`,
   `sim snapshot field-relaunch` → the same as step 7.
9. From a relaunched Today, run `grow.md` and `sayit.md` as `first.md`
   step 9 says (their counts follow from this drive's extra recitals), then
   `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Report only counts, booleans, the labels named above and the reference;
delete the `snapshots` folder and the raw snapshot.

## Gotchas

- The field counts UTC days, not the simulator's local days: a drive that
  crosses 00:00 UTC between two recitals sees one more day sown.
- A row title is plain text, not a heading; the field's one heading is
  `Your field`.
- `Your field` never needs a `sim scroll`: it is in Today's header, outside
  the scroll view. Tap it as it is; a scroll just before a tap can leave the
  scroll view moving, and a tap then may stop the scroll instead of pressing.
