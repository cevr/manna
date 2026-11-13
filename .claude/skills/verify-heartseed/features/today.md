# Today

Today is the run (`apps/heartseed/app/index.tsx`), reached from home
(`home.md`, the screen Heartseed opens on once the garden holds a recall)
by the Today card's `Start` or `Practice anyway`, or one tap on a verse's
plant (its verse, whole); a
fresh install opens the first minute first (`first.md`), whose `Continue`
opens home. An unread garden opens Today, with no `Your field`. It shows the passage the
reader is learning: the header `Today`, then the
passage's reference, then its words in the King James Version. In this
first build the passage is Isaiah 41:10, the brief's first promise. The
reference and the words are made when the app is bundled, from the KJV in
`@manna/core` (`apps/heartseed/vite/passage.ts`), shown by the display rule
of `apps/heartseed/src/display.ts`: a leading `¶` and the space after it
are dropped, and so is every `[`, `]`, `‹` and `›`, the words they enclose
kept. Under the words is the passage's stage line (`grow.md`): after the
first minute, `Stage: seed`; it appears once the garden's read of
the device's store completes, a moment after launch, and not at all in a
session whose read failed. Today runs the session's plan one verse at a
time (`run.md`): the verse, its stage and the one action button show only
while an item is shown, and with nothing to tend Today shows the done
state, the counts line alone. The action button, `Say it` (`sayit.md`) or
`Next`, sits in a fixed footer under the scroll view, beside the grades
once a recital ends; until `Say it` is pressed the screen asks for no permission and
makes no sound. Beside the header `Today`, fixed above the scrolling
passage, once the garden's read completes and never while Say it listens,
is the button `Your field` (shown `‹ Your field`), which leads back to
home, the field, in place (`field.md`); it is on screen without a scroll
whatever Today holds, and Today holds no `When I need…` (`promise.md`:
it is gone). The header holds no `Minutes` radio and no `Voice`
(both are in home's Settings sheet, `home.md`), and at the top of the scroll
view, above the reference, the counts line (`id=session`), such as
`Nothing to tend now` (`session.md`). At the end of a run the heading reads
`The field is tended` and the scroll view holds what grew in place of the
counts line (`run.md`). While a new piece's `Listen` reads
it, its words show as the reading view (`id=reading`, a `word-<i>` node
per word, lit as read) in place of `id=passage` (`light.md`).

## Sub-features

- `today-passage`: whenever Today's run shows the passage (`run.md`: after
  the first minute home is the done state, `run-done-first`; once the
  passage is due and a plan is made, the Today card's `Start`, `run-due`), Today shows the header
  `Today` (role header), the reference `Isaiah 41:10`, its stage line (a
  label starting `Stage: `), one `Say it` button in the fixed footer under
  the scroll view, the button `Your field`, and its words under the cue
  its stage gives (`fade.md`): at a seed, 37 word nodes (`word-<i>`), each
  labelled with its word's first letter as written, in its lines
  (`lines-letters` in `fade.md`: `word-8`, `word-16`, `word-20` and
  `word-25` each start a row a line's step below the row before). The words come from its
  KJV text, exactly
  `Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.`
  Today shows that text whole only before the passage is planted, which no
  live drive reaches.
- `today-plantset`: from `first.md`'s `first-home`, the passage's seed
  reached by one tap on its plant, with no relaunch. Today,
  `Isaiah 41:10`, `Stage: seed`, `Say it` and `Your field` remain present,
  with no exposed image, plant name or control added. The stage's still
  hand-drawn asset is seed, blade, ear or corn (full corn), at 28 × 28 pt,
  source and defaultSource of the effective scheme now, without tint,
  crop, scale or extra soil; wrapper and image are hidden. Read/unplanted
  Today owes no image, unread/pending Today claims no stage or image, and
  bare done owes none. Mounted tests establish those hidden drawing clauses.
- `lines-plain`: Today on `Isaiah 43:2` (`list.md`'s `Open Protection &
  Fear`, then the row `Isaiah 43:2, not planted`), before `Listen`:
  `id=reference` `Isaiah 43:2`; inside `id=passage` the texts `line-0` …
  `line-5` and no `line-6`; each `line-<i>`'s frame starts at the
  same x and below the one before; the six labels' word counts (whitespace
  runs; write no words down) are 6, 5, 9, 6, 5, 7. A verse of more than 20
  words is drawn in its clauses (`linesOf`, the README's **Lines**); the
  break elements are absent from VoiceOver's order, `line-0` to `line-5`
  read in turn. Base (r1) red: one `id=passage` text, no `line-0`, no
  `break-`.
- `lines-short`: Today on `Psalms 91:1` (the row `Psalms 91:1, not
  planted`): `id=passage` one text, as before; no `line-` and no `break-`
  anywhere.

## How to get to it (user POV)

- On a fresh install, go through the first minute and tap `Continue`; it
  and any later launch open home. Once the verse is due, home offers
  `Start`, which opens Today on it.

## Driving it

`sim journeys <file>.md` plays the lists below one after another, each in one app session from its start, with no screenshot and no video, and names each journey that fails with its first failed step and the journey before it (`SKILL.md`, Drive). The by-hand steps between them (a raw snapshot, a read of the log) are not part of it.

**Journeys in order:** from a fresh install: `first`, `today-lines`, `light-lines`, `light-lines-done`, `sayit-lines`, `today-short`.

**Journeys in order:** from a fresh install: `first`, `today-plantset`.

After the Launch of `SKILL.md` (`sim boot`, then `sim install`, which
waits for `label=Isaiah 41:10`) and `run.md` through `run-due` (the
home `Continue` opens at `first-home` is the done state, with no
`Start`, so it is not this row's start), `run.md`'s `run` journey is this
feature's drive: its last step, `run-due`, waits for the stage line
(`id=stage`), which shows only once the garden is read and the run shows
the passage. Its receipt, `run/run-due`
(`$EVIDENCE/snapshots/run-03-run-due.txt`), lists under
`[application] "Heartseed"` the text nodes `Today`, `Isaiah 41:10`, 37
word nodes each labelled one character (the first letters of the passage
above, with no `¶`, `[`, `]`, `‹` or `›`) and no node holding the passage
whole, a label starting `Stage: ` (after the first minute,
`Stage: seed`), a node `Say it`, a node `Your field` and the counts line,
with no `Minutes` radio, no `Voice`, no `Next`, no `Listening` and no
grade (`Again`, `Hard`, `Good`, `Easy`). A short label can appear on two
nodes, so check that the labels are present, not how many nodes carry
them. Count those nodes, report the counts, then delete the receipt: it
holds the passage's words.

## Lines drive (`lines-plain`, `lines-short`)

From home (any home: the journeys start at the Today card), open the
list and the two rows (`list.md`). A receipt holds no id and no frame, so
each row's readout is a raw snapshot (`first.md`, Driving it) taken right
after its journey:

1. `sim journey today-lines` → `"ok":true`: `Open Protection & Fear`,
   then `Isaiah 43:2, not planted`; its last step, `lines-plain`, shows
   `id=reference` `Isaiah 43:2`, `id=line-0` and `id=line-4` and hides
   `id=line-6` (the driver's wait did not find `line-5` live, though the
   raw snapshot holds it hittable: the raw snapshot counts it). Its raw snapshot → the `lines-plain` readout above, from
   the tree's ids and frames: count each `line-<i>`'s whitespace runs and
   report the counts and the `line-<i>` frames' x and y, never the words
   (a `break-<k>` is hidden from VoiceOver, so the tree holds none).
2. `light.md`'s `lines-read` and `sayit.md`'s `lines-say` ride this Today
   when their drives do, in this order: `light-lines`,
   `light-lines-done`, `sayit-lines`. A recital's recall is kept only at
   its `Next` (`run.md`), so `sayit-lines` ends with `Next`
   (`lines-say-next`: no `Next` and no count left); without it, step 3's
   `Your field` would let the recital go unrecorded.
3. `sim journey today-short` → `"ok":true`: `Your field`,
   `Open Protection & Fear`, then `Psalms 91:1, not planted`; its last
   step, `lines-short`, shows `id=passage` and hides `id=line-0`. Its raw
   snapshot → one `id=passage` text, no `line-` and no `break-`.

Delete the raw snapshots: they hold verse words.

## Plant-set drive and receipt (`today-plantset`)

Branch at `first-home` of the same fresh, verifier-owned drive used for
`first-plantset`. After its doctor, one tap on the plant, with no
relaunch: `sim journey today-plantset` → `"ok":true`.
`today-plantset/today-plantset`: Today, `Isaiah 41:10`, `Stage: seed`,
`Say it` and `Your field`.

Expect the row's labels and semantic parity above; report only counts,
booleans and the reference, then delete the receipt. Follow `run.md`
and `grow.md` for due, recite, peek, Again and restart, only as their
timing permits, without time or storage manipulation. No new overnight
or full-corn drive is required. Doctor after and down at the end under
`SKILL.md`'s ownership rules.

Include same-head `test:plantset` and external acceptance results using
`first.md`, Plant-set receipt's commands. Those prove which hidden images
rendered; the external acceptance is red on mounted base `7e52f7ede`
because Today and Planted lacked images. AX parity deliberately passes
base. AX cannot prove artwork; `first.md`, Plant-set receipt lists the
pixel/layout/appearance limitations. Dark, full corn and any other
unreached states are explicitly test-only, not live passed.

## Gotchas

- The first open after a fresh dev server waits on the bundle:
  `sim install` gives it 180 s before it fails `ReadinessTimedOut`.
- A red box naming the Hermes compiler means the dev server did not get a
  working one (`SKILL.md`, Gotchas: `detail.hermesc`, and the caller's
  `HERMESC_PATH`).
- The passage comes from the dev server's bundle, so a change to the
  corpus or to the display rule shows after the server restarts, with no
  rebuild of the app.
