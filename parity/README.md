# Parity harness

The Ergo port (`ergo/`) is checked against the TypeScript CLI's own outputs,
recorded once and frozen under `frozen/<suite>-<seed>.json`.

- `suites.ts`: the corpus. Per suite, sessions of steps (`args`, `stdin`, `env`);
  fixed rows plus rows generated from a seed (42 and 7 are recorded).
- `world.ts`: the world each session runs in: a scratch `HOME`, `NO_COLOR=1`,
  `TERM=dumb`, and `BIBLE_DB_PATH` at the offline-built `bible.db` (read only).
- `record.ts --case=<suite> --seed=N`: runs `bun packages/cli/src/main.ts` for
  each step and writes the record file. Its header holds the reference commit
  and the sha256 of every store file the suite reads.
- `run.ts --case=<suite> --seed=N [--binary=bin/manna-ergo]`: refuses to run when
  a store differs from the header, then compares stdout, stderr and the exit
  status byte for byte. A usage step compares only its exit status and that
  stderr is not empty (help layout is Ergo's own).
- `mutants.ts --case=<suite> [--binary=… | --reference]`: wraps the candidate in
  `mutate.ts` (drops the last newline, swaps the exit status, reorders JSON keys,
  drops stderr, empties stdout); each must fail `run.ts`, and the unchanged
  candidate must pass.
- `parse-record.ts --seed=42`: the reference parser's answers for 5,000 queries
  (fixed edge rows, then generated ones) into `ergo/bible/testdata/parse-42.tsv`,
  which the port's test `ParseIsTheReference` reads.
- `parse-receipt.ts`: the TypeScript side of Parse's receipt.

Differences the port keeps on purpose are in `declared-differences.md`.
