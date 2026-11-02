# In Its Order: look notes

## 2026-11-01, `title` against `title.start.2`

- Looked at `cue:pull@0`, `cue:path@0.9` and `cue:pull@1` on the spare lab (8271), each at 1:1 beside
  the kept panel `board/title.start.2.png`.
- Worst mismatch, fixed: the low wall and the floor were the chipboard brown (`board`, `boardLight`),
  a brown slab behind the guests where the panel is pale sand stone. They are now the town's pale
  sand (`SAND`, `STONE` in `scenes/courtyard.ts`), and the far ridges are a hazed pale violet in
  place of the dark grey-violet.
- Named staging differences, kept: three guests (a villager, the lead, his mother) in place of the
  panel's ten; the title strip over the sky, which the panel has no room for; flat plant food in
  place of bowls, grapes and flowers.
- Still off, for a later pass: the panel's lanterns glow warm yellow and its garlands carry
  flowers; the path in the panel winds in an S, here it is a short zigzag; the panel's town fills
  the middle distance with terraces and planters, here a few blocks stand behind the wall.

## 2026-11-01, `title` on painted plates

- The courtyard is now the painter's plates (`plates/plates.ts`: sky, distance, near, table), so the
  code-drawn courtyard (`scenes/courtyard.ts`) is deleted; `cold` has no drawing and imported none of it.
- Looked at `cue:pull@0`, `cue:pull@0.5`, `cue:pull@1` and `cue:path@0.5` on the spare lab (8271),
  and at the end of the pull at 1:1 beside the kept panel `board/title.start.2.png` (mapped to the
  frame) and the plates' prototype frame `plates.end.png`.
- The end of the pull matches the prototype's frame: the same plates in the same framing, the dawn
  light within 2 px. The first entry's "still off" items are gone: the lanterns glow warm yellow,
  the garlands carry flowers, the path winds in the panel's S, the town fills the middle distance
  with terraces, and the table carries bowls, grapes and flowers.
- The gold path: `distance.png` has the path painted out, and the title reveals the painter's path
  (`path.png`) from the foot along its length, clipped to the brush's circles, so the frame at the
  reveal's end is the painter's plate, but for 62 px on the hill's edge against the sky (at most 64
  of 255 in one channel; unseen at full size). At 1:1 the hill before the reveal shows no trace of the
  path, and the reveal's tip is the brush's round end.
- Named staging differences, kept: three guests in place of the panel's ten; the title strip over
  the sky; the guests stand, so their sandals show under the painted table between its legs, where
  the panel's guests sit and only their robes show under it.
- Rendered act `feast` with `--review` and read its title frames at 30.5, 31.7 and 33.3 s: the
  plates, the path half drawn and then whole, and the name match the stills.
