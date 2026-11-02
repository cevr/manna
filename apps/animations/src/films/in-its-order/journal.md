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

## 2026-11-01, `cold` fix pass after the review render

- The courtyard framings push in toward `cold.letter.4`: close on the mother at the table (`grown`,
  k 2.6), down the table to the lead, closer on his bottle (k 3), back to the three guests waist up
  (`smile`, k 1.9), chest up on him as the letter falls (`read`, k 2.8), onto the seal (`quote`,
  k 3.4) and up to his wince (`ouch`, k 3.2). At 1:1 his head is 77 to 92% of the panel's size from
  `read` to `ouch`, and no plate's edge shows.
- The open scroll lies back on the table at a third of his torso's height and three quarters of his
  shoulders' width; the panel's scroll is about as wide as his shoulders. Kept.
- The baby close has the feast's table in front of the mother (the courtyard's table plate as a near
  plane, 2.75 times its size, its edge where `cold.baby.3` has it), so she sits at the table.
- Without his line pass the lead's sheet line is about two thirds of the guests' at 1:1, and he still
  reads beside them: his line stays off.
- Named gaps for the cut: the paper's white rim round the mother's veil and the baby's head, and the
  dotted rim and the neck step of the lead's wince head (`PuppetLook` has no alpha choke; the wince
  drawing loads without the un-matte); the front table in the baby close is soft at 2.75 to 3.2 times
  its plate.
