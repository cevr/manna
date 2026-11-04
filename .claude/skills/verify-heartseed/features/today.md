# Today

Today is the screen Heartseed opens on (`apps/heartseed/app/index.tsx`). It
shows the passage the reader is learning: the header `Today`, then the
passage's reference, then its words in the King James Version. In this
first build the passage is Isaiah 41:10, the brief's first promise. The
reference and the words are made when the app is bundled, from the KJV in
`@manna/core` (`apps/heartseed/vite/passage.ts`), shown by the display rule
of `apps/heartseed/src/display.ts`: a leading `¶` and the space after it
are dropped, and so is every `[`, `]`, `‹` and `›`, the words they enclose
kept. The screen has no button yet, asks for no permission and makes no
sound.

## Sub-features

- `today-passage`: on launch, Today shows the header `Today` (role header),
  the reference `Isaiah 41:10` and its KJV text, exactly
  `Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.`

## How to get to it (user POV)

- Open the app: Today is its first and only screen.

## Driving it

After the Launch of `SKILL.md`, its Drive's three commands are this
feature's drive: `open`, `wait text "Isaiah 41:10"`, and the snapshot into
`$EVIDENCE/snapshot-today.txt`.

→ `wait` exits 0, and the snapshot lists, under `[application] "Heartseed"`,
the text nodes `Today`, `Isaiah 41:10` and the passage above, whole, with
no `¶`, `[`, `]`, `‹` or `›` in it.

## Gotchas

- The first open after a fresh dev server waits on the bundle: give
  `wait` its full 120 s before calling the step failed.
- A red box naming the Hermes compiler means the dev server started
  without the pod's `HERMESC_PATH` (`SKILL.md`, step 6).
- The passage comes from the dev server's bundle, so a change to the
  corpus or to the display rule shows after the server restarts, with no
  rebuild of the app.
