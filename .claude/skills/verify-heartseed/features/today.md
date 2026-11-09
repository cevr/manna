# Today

Today is the run (`apps/heartseed/app/index.tsx`), reached from home
(`home.md`, the screen Heartseed opens on once the garden holds a recall)
by `Begin`, `Start here with <reference>` or a promise of When I need…; a
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
it is on home's bar). The header holds no `Minutes` radio and no `Voice`
(both are in home's Settings sheet, `home.md`), and at the top of the scroll
view, above the reference, the counts line (`id=session`), such as
`Nothing to tend now` (`session.md`). While a new piece's `Listen` reads
it, its words show as the reading view (`id=reading`, a `word-<i>` node
per word, lit as read) in place of `id=passage` (`light.md`).

## Sub-features

- `today-passage`: whenever Today's run shows the passage (`run.md`: after
  the first minute home is the done state, `run-done-first`; once the
  passage is due and a plan is made, home's `Begin`, `run-due`), Today shows the header
  `Today` (role header), the reference `Isaiah 41:10`, its stage line (a
  label starting `Stage: `), one `Say it` button in the fixed footer under
  the scroll view, the button `Your field`, and its words under the cue
  its stage gives (`fade.md`): at a seed, 37 word nodes (`word-<i>`), each
  labelled with its word's first letter as written. The words come from its
  KJV text, exactly
  `Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.`
  Today shows that text whole only before the passage is planted, which no
  live drive reaches.

## How to get to it (user POV)

- On a fresh install, go through the first minute and tap `Continue`; it
  and any later launch open home. Once the verse is due, home offers
  `Begin`, which opens Today on it.

## Driving it

After the Launch of `SKILL.md` (`sim boot`, then `sim install`, which
waits for `label=Isaiah 41:10`) and `run.md` through `run-due` (the
home `Continue` opens at `first-home` is the done state, with no
`Begin`, so it is not this row's start), its Drive's two commands are this feature's drive, the
open waiting for the stage line (`id=stage`), which shows only once the
garden is read and the run shows the passage:

```bash
sim open / --expect "id=stage"
sim snapshot today
```

→ `open` is ok, and the snapshot (`$EVIDENCE/snapshots/today.txt`) lists,
under `[application] "Heartseed"`, the text nodes `Today`, `Isaiah 41:10`,
37 word nodes each labelled one character (the first letters of the
passage above, with no `¶`, `[`, `]`, `‹` or `›`) and no node holding the
passage whole, a label starting `Stage: ` (after the first minute,
`Stage: seed`),
a node `Say it`, a node `Your field` and the counts line, with no
`Minutes` radio, no `Voice`, no `Next`, no `Listening` and no grade
(`Again`, `Hard`, `Good`, `Easy`). A short label can appear on two nodes, so check that the
labels are present, not how many nodes carry them.
Count those nodes, report the counts, then delete the snapshot: it holds
the passage's words.

## Gotchas

- The first open after a fresh dev server waits on the bundle:
  `sim install` gives it 180 s before it fails `ReadinessTimedOut`.
- A red box naming the Hermes compiler means the dev server did not get a
  working one (`SKILL.md`, Gotchas: `detail.hermesc`, and the caller's
  `HERMESC_PATH`).
- The passage comes from the dev server's bundle, so a change to the
  corpus or to the display rule shows after the server restarts, with no
  rebuild of the app.
