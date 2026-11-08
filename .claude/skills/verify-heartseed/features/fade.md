# Cues that fade

Today (`apps/heartseed/app/index.tsx`) shows and recites the passage under
the cue its stage gives, the ladder of `apps/heartseed/src/garden.ts`
(`cueAt`, `cueIn`): the full text before the passage is planted (first
letters before a long verse is planted once a phrase of it is: its join,
`phrase.md`), its first
letters at a seed, nothing at a blade, an ear or full corn. Again makes a
seed, so the letters come back. The cue fades across days, by stage, never
inside one sitting. Nothing new is stored: a recall was helped when it had a
peek or the cue of the stage before it was not nothing, so a recital said
under letters at a seed grows a blade, and one said with nothing at a blade
grows an ear.

Under letters each word is one node (`word-<i>`) whose label is that word's
first letter or number alone; the rest is laid out unseen and hidden from
the screen reader. Under nothing no word node has a label and no word shows.
While a recital listens, each word not yet said shows the recital's cue.
In an unread garden Today shows the verse whole and recites with nothing,
claiming no stage.

## Sub-features

Today runs the plan (`run.md`), so a live recital waits for the passage's
due: every row runs from `run.md`'s `run-due`, the first wait after the
first minute. The replay always misses word 11, so every recital ends
`36 of 37 words`, `Suggested: Hard`.

- `fade-letters` (live at `run-due`): at a seed, 37 `word-<i>` nodes, each
  label exactly one character, and no node holding the passage whole.
- `fade-cued` (live at `run-listening`): while the recital under letters
  listens, every word node not yet lit is labelled with one character.
- `fade-blade` (live at `run-recite`): that recital gives `Stage: blade`,
  `Grew to a blade.`, `Suggested: Hard`, and one `[growth] play` line.
- `fade-nothing` (live at `run-second`, the second wait, only when the drive
  started before 16:00 local; else tests only: `src/sayit/cue.test.tsx`,
  `src/garden/today.test.tsx`): at a blade, no word node has a label and no
  node holds any of the passage's words.
- `fade-ear` (as `fade-nothing`): a recital with nothing gives
  `Stage: ear`, `Grew to an ear.`; two play lines.
- `fade-again` (tests only: `src/garden/today.test.tsx`, Again, then a new
  plan at the seed's due): `Stage: seed`, 37 word nodes each labelled one
  character. A second recital in one sitting needs the seed's due, which
  no live drive waits for.

## How to get to it (user POV)

- Go through the first minute, tap `Continue`, relaunch, and read Today's
  verse; tap `Say it` and say it.

## Driving it

Nothing native changes: an incremental `sim install` of the head under
`lockf -k /tmp/manna-ios-build.lock` with the bars of `SKILL.md`, Launch, or
`--app` with a build of `c65e0f162` or later (the JS comes from the dev
server). With `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them:

1. `run.md`, Driving it, steps 1-3 (the first minute, then `run-due`).
2. `fade-letters`: `run-due`'s snapshot → `Stage: seed`; 37 `word-<i>`
   nodes, each label exactly one character; no node holding the passage
   whole.
3. `fade-cued`: `run-listening`'s raw snapshot (`run.md` step 4) →
   `Listening`; every word node not yet lit labelled with one character.
   Keep only counts and booleans.
4. `fade-blade`: `run-recite`'s snapshot → `Stage: blade`,
   `Grew to a blade.`, `Suggested: Hard`; the log holds exactly one
   `[growth] play` line since `START`, ending `skipped=simulator`.
5. `fade-nothing` and `fade-ear`, only when the drive started before 16:00
   local: `run.md` step 7. `run-second-due`'s snapshot → `Stage: blade`;
   no word node with a label; no node holding any of the passage's words;
   `Say it`. `run-second`'s → `Stage: ear`, `Grew to an ear.`; two play
   lines.
6. `fade-again`: tests only (above).

The log is `grow.md`'s. Report only counts, booleans, labels of one
character as counts, the reference, the stage and grade names. Delete the
`snapshots` folder and the raw snapshot.

## Gotchas

- No screenshot, no recording and no sound; never grant the microphone.
- Tests alone own full corn, the full text (the passage not planted beside
  another verse: no screen reaches it on a fresh install), an unread
  session, a refused write and a recital that could not be heard
  (`src/ladder.property.test.ts`, `src/press.test.ts`,
  `src/sayit/cue.test.tsx`, `src/sayit/cue-say.test.tsx`).
