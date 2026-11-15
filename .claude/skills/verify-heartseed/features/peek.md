# Peek and Show all

A reader who has forgotten a word of a verse can peek at it before saying
it, and one who has forgotten the verse can show it all, each at a cost
(owner, scrawl 1794699589304 #4; q104's working answer: a peek counts the
try as Hard at best, Show all moves the verse back a stage as Move back
does). Both live on Today at rest on a run's planted item: no recital
under way, held or done (`apps/heartseed/app/index.tsx`, `Peek` in
`apps/heartseed/src/sayit/draw.tsx`, `reveal`/`showAll` and `Help` in
`apps/heartseed/src/sayit.ts`, `showAllToday` and `nextItem` in
`apps/heartseed/src/app.ts`, `shownAllCap` and `withHelp` in
`apps/heartseed/src/garden.ts`).

- **A peek**: each word drawn under its cue (its letters at a seed, its
  empty slot past it) sits in a button, `id=peek-<i>`, named by its letter
  or `Word <n>`. A tap shows the word whole in the peeked ink for 1.5 s,
  the button then named by the word (VoiceOver reads it; Today announces
  nothing aloud), and the try that follows can be no better than Hard: the
  suggestion taken, `Suggested:` and every grade above Hard disabled. The
  word counts among the recall's peeks (`, <n> peeked` in the summary).
- **Show all**: in Today's footer outside the scroll view, over `Say it`.
  A tap shows the verse whole (`id=passage`) and reads it a stage lower
  (`Stage: <stage>`, the recital said under that stage's cue); `Show all`,
  the words to peek at and `Move back a stage` go. The try can be no
  better than the stage rule lets the verse stay there: Again from a blade
  and at a seed, Hard from an ear or full corn. Every word counts peeked,
  so full corn, stepped back to an ear, reads a blade after its try (the
  stage rule's for a helped recall).
- **Only Next records** (hscancel's rule): `Next` keeps Show all's step
  back, Move back's own record `heartseed/back/<reference>/<at>` at the
  instant of the tap, before the try, then the try's recall.
  `Your field` before `Next`, after any peek or Show all, records nothing
  and lets the help go: the verse opens again at its stage, at rest.

## Sub-features

- `peek-word`: a word at rest is a button to peek at; a tap shows it.
- `peek-capped`: after a peek or Show all, `Suggested:` and the grades
  above the cap are capped.
- `peek-all`: Show all shows the verse whole and a stage lower; `Next`
  keeps it.
- `peek-tests-only` (tests only, `test:sayit`'s `src/sayit/help.test.ts`
  and `test:back-today`'s `src/garden/peek-today.test.tsx`;
  `apps/heartseed/README.md`, Tests): the cap on the suggestion and on a
  chosen grade, the peek counted once, an ear to a blade and a blade to a
  seed at `Next` with the step back before the try (on a clock that has not
  moved too), a seed kept a seed at Again, and a leave after a peek and
  Show all writing nothing and freeing the next try.

## How to get to it (user POV)

- Home → a planted verse's plant (or a list's row, or `Start`) → Today →
  tap a word, or `Show all` → `Say it` → `Next`.

## Driving it

`sim journeys <file>.md` plays the lists below one after another, each in one app session from its start, with no screenshot and no video, and names each journey that fails with its first failed step and the journey before it (`SKILL.md`, Drive). The by-hand steps between them (a raw snapshot, a read of the log) are not part of it.

**Journeys in order:** from a fresh install: `first`, `peek`.

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes: the
installed Debug build serves the JavaScript from the dev server. Report
labels, counts and booleans only, never a verse's words.

1. Home with `Isaiah 41:10, seed` (after `first.md`'s `sim journey
   first`, or any drive that leaves the passage a seed and no item held).
2. `sim journey peek` → `"ok":true`. It taps the seed's plant
   (`peek/peek-seed`: `Show all` and `id=peek-0`), says it to a blade,
   takes `Next` and `Your field`, taps `Isaiah 41:10, blade`
   (`peek/peek-blade`: `Show all`, `Move back a stage`, `Word 1`), peeks
   at word 1 (`peek/peek-word`: `Word 1` named by its word), shows all
   (`peek/peek-all`: `Stage: seed`, `id=passage`, no `Show all`, no `Move
   back a stage`), says it and taps `Again`, the grade the cap leaves it
   (`peek/peek-capped`: `Stage: seed`, `Next`; its snapshot reads the
   summary's `, 37 peeked` and `Suggested: Again`), takes `Next` and `Your field`
   (`peek/peek-home-seed`: `Isaiah 41:10, seed`). The journey leaves the
   passage a seed, so it runs again.
3. `sim doctor` (record `head` and `timingsHold`) and `sim down`; delete
   the `snapshots` folder.

## What the simulator cannot show

The tests own each: the word hiding again after its moment, the cap on a
grade tapped above it, the step back's instant before the try, an ear
moved to a blade, and a leave writing nothing. VoiceOver reading a peeked
word, and how the buttons feel under a finger, are the owner's Release
build's check.
