# Today

Today is the screen Heartseed opens on (`apps/heartseed/app/index.tsx`). It
shows the passage the reader is learning: the header `Today`, then the
passage's reference, then its words in the King James Version. In this
first build the passage is Isaiah 41:10, the brief's first promise. The
reference and the words are made when the app is bundled, from the KJV in
`@manna/core` (`apps/heartseed/vite/passage.ts`), shown by the display rule
of `apps/heartseed/src/display.ts`: a leading `¶` and the space after it
are dropped, and so is every `[`, `]`, `‹` and `›`, the words they enclose
kept. Below the passage is one button, `Say it` (`sayit.md`);
until it is pressed the screen asks for no permission and makes no sound.

## Sub-features

- `today-passage`: on launch, Today shows the header `Today` (role header),
  the reference `Isaiah 41:10`, one `Say it` button, and its KJV text, exactly
  `Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.`

## How to get to it (user POV)

- Open the app: Today is its first and only screen.

## Driving it

After the Launch of `SKILL.md` (`sim boot`, then `sim install`, which
waits for `label=Isaiah 41:10`), its Drive's two commands are this
feature's drive:

```bash
sim open / --expect "label=Isaiah 41:10"
sim snapshot today
```

→ `open` is ok, and the snapshot (`$EVIDENCE/snapshots/today.txt`) lists,
under `[application] "Heartseed"`, the text nodes `Today`, `Isaiah 41:10`
and the passage above, whole, with no `¶`, `[`, `]`, `‹` or `›` in it,
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
