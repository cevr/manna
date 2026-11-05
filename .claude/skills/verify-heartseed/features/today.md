# Today

Today is the screen Heartseed opens on once the garden holds a recall
(`apps/heartseed/app/index.tsx`); a fresh install opens the first minute
first (`first.md`), whose `Continue` opens Today. It shows the passage the
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
session whose read failed. Below the passage is one button, `Say it`
(`sayit.md`); until it is pressed the screen asks for no permission and
makes no sound.

## Sub-features

- `today-passage`: at every launch after the first minute (`first-again`,
  or a `sim relaunch` later), Today shows the header `Today` (role header),
  the reference `Isaiah 41:10`, its stage line (a label starting `Stage: `),
  one `Say it` button, and its KJV text, exactly
  `Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.`

## How to get to it (user POV)

- On a fresh install, go through the first minute and tap `Continue`; any
  later launch opens Today.

## Driving it

After the Launch of `SKILL.md` (`sim boot`, then `sim install`, which
waits for `label=Isaiah 41:10`) and `first.md` through `first-again` (or a
`sim relaunch` on an install whose garden already holds a recall; the
Today `Continue` opens at `first-today` still shows the alone recital's
count and grades, so it is not this row's start), its Drive's two commands
are this feature's drive, the open waiting for the stage line
(`id=stage`), which shows only once the garden is read:

```bash
sim open / --expect "id=stage"
sim snapshot today
```

→ `open` is ok, and the snapshot (`$EVIDENCE/snapshots/today.txt`) lists,
under `[application] "Heartseed"`, the text nodes `Today`, `Isaiah 41:10`
and the passage above, whole, with no `¶`, `[`, `]`, `‹` or `›` in it,
a label starting `Stage: ` (after the first minute, `Stage: seed`),
and a node `Say it`, with no `Listening` and no grade (`Again`, `Hard`,
`Good`, `Easy`). A short label can appear on two nodes, so check that the
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
