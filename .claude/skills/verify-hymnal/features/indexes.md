# Back-matter indexes

The eleven indexes the hymnal prints on its pages 776-824 (topics, Scripture
in both directions, worship aids, sentences, canons, young worshipers,
authors, composers, tunes and metres) are committed data in
`packages/hymnal/data/indexes/`, one file per index, with the book's own
breaks of a rule kept in `rulings.json`. A check over them needs no reader.
The data has no app route yet; this feature is CLI only.

## Sub-features

- `indexes-data`: the eleven files decode, every check passes, and the CLI prints one line per index and the total.
- `indexes-checks`: each check catches the faults it names, on a made-up book and on mutations of the committed files.
- `indexes-readings`: every page was read twice blind, every difference ruled, and every printed ruling is in `rulings.json`.

## How to get to it (user POV)

- `bun run --cwd packages/hymnal indexes` runs every check over the committed files.
- `bun run --cwd packages/hymnal indexes --measure` also prints each order rule's broken pairs.
- `bun run --cwd packages/hymnal indexes --reach` also prints how many look-alike digit misreads the checks catch, per index.
- The README section "The back-matter indexes" of `packages/hymnal/README.md` names each check (C1-C12) and each file's fields.

## Driving it with sim

- **Preconditions:** run from the checkout root, packages installed, host load below 12.
  Set `HOME` to a fresh scratch directory. For the readings' audit, set `UNIT` to
  `/Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/findbulk`.
- **States:** default (all checks pass) and error (an open problem exits 1, held by the tests).
  sim drive, focus-visible, open, loading and empty are n/a: the indexes have no app route.
- **Regression:** `packages/hymnal/src/indexes.test.ts` (a made-up book; in `bun run test`),
  `packages/hymnal/src/indexes.data.slow.test.ts` (the committed files and their mutations; in `bun run test:slow`).

1. **Data (`indexes-data`).** `bun run --cwd packages/hymnal indexes`.
   → exit 0. One line `indexes <index> pages=<first>-<last> entries=<n> ruled=<r> problems=0`
   for each of the eleven indexes, then `indexes files=11 entries=9221 problems=0`.
2. **Checks (`indexes-checks`).** `bun test packages/hymnal/src/indexes.test.ts packages/hymnal/src/indexes.data.slow.test.ts`.
   → 0 fail. Each mutation (a number out of range, a verse past its chapter, a stanza
   past its hymn, a swapped pair, a hymn dropped from a section or a tune index, an
   entry dropped from a page) prints its problem at every entry it applies to.
   Then `bun run --cwd packages/hymnal indexes --reach` → exit 0, a `caught/variants`
   count per index (counts only; no pass line).
3. **Readings (`indexes-readings`).** `cd "$UNIT/p6" && bun tools/audit.ts | tail -n 6`.
   → exit 0. The last line is `audit pages=49 readings=98 differences=<d> ruled=<d> unreadable=0`
   (every difference ruled), and the line before it says `printed rulings=<n> = data/indexes/rulings.json`
   and `checks: indexes files=11 entries=9221 problems=0`.

## Gotchas

- Name an entry by its index, page and place (`#3`), never by hymn words.
- The index photos are gone: a fact the checks cannot hold rests on the
  readers and judges, and their records under `$UNIT/p6`. Never re-read a
  page from a guess.
- The audit runs the checks in the findbulk worktree
  (`~/Developer/personal/.rifts/manna/findbulk/packages/hymnal`, fixed in
  `tools/audit.ts`), not in the checkout under test. Once that worktree is
  gone, steps 1-2 stand alone and the audit is read from its last log.
- `--reach` counts change when the look-alike set or a check changes; compare
  them with the run that changed it, not with an older log.
- The slow data test reads the KJV, the 695 compiled hymns and `data/shapes.json`;
  it takes about 0.5 s alone and stays out of the fast tests.
