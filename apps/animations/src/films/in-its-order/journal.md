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

## 2026-11-06, act 1 re-staged: CRAFT rule 1 overridden for act 1 (ask a11de5e2b65)

- The owner, on the act-1 review render: "there's a lot about this film that just doesn't seem
  gravitating, doesn't seem attractive. Maybe it's the way we're rendering. It just doesn't feel like
  it'll hold any attention." His answer to ask a11de5e2b65: "Both: re-stage act 1 (close two-shot with
  reactions, a moving milk picture, quotes off black cards, short pauses with room tone) and a 5 s
  test of the lead cut into parts".
- The override: CRAFT rule 1 ("Narration is typeset only as a full-screen card") does not hold for
  act 1 of this film. Its two quotes are lettered in the scene by the film's own hand, at any length
  the quote has: Heb 5:12 in `cold-letter` over a band of dusk above the heads (the scroll his `read`
  cell holds is 47 by 60 px on screen, too small for thirteen legible words, so the words sit over
  the visible table, not on the scroll), and 1 Pet 2:2 in ink on the parchment over the open book in
  `milk-pour` (type on the book's pages reads only with the camera near 2.5, which would enlarge the
  villager's drawing past the act's 1.5 cap). CRAFT.md is unchanged, and the prompts keep their `CARDS` sentence: the painted
  pictures still carry no text. Acts 2 onward keep their cards.
- The joke on "smile" is a close two-shot (`cold-smile`): the lead and the man, each head over a
  quarter of the frame (about 0.29, the lead's drawing held under the 1.5 enlarging cap); the man turns from his stare and smiles on the mark, and the lead lowers the
  bottle to his chest a beat after.
- The milk span moves the whole time: one white stream from the book's gutter into the cup, the ink
  dropper brought in and waved away, the cup full on "good".
- The title's voice gap shortens to about 2.95 s (milk's lead 0, its tail 0.6, so no scene moves and
  the score stays current). The first question cannot start earlier without moving the cold open's
  length, which re-times the score (a paid score run): it stays at about 26.2 s.
