# Corpus database

The CLI reads all 695 hymns and 225 liturgical readings from a reproducible,
versioned SQLite corpus. Existing installed legacy files stay readable. The
phone reads compiled JSON; this feature has no app route.

## Sub-features

- `corpus-db`: 920 stable lookup IDs across the source and public artifact.
- `corpus-db-build`: deterministic schema-2 generation and atomic replacement.
- `corpus-db-census`: lossless structure, timing, topics and source evidence.
- `corpus-db-search`: Unicode FTS and literal, bounded substring search.
- `corpus-db-cli`: get/search/categories/category/missing contracts and isolated init acquisition.
- `corpus-db-legacy`: read-only compatibility with installed version-0 databases.
- `corpus-init-empty`: full init installs all four databases in an empty scratch HOME.
- `corpus-init-preserve`: default init preserves existing files, including offline and legacy installs.
- `corpus-init-wal`: closed WAL artifacts and live WAL commits survive acquisition and verification.

## How to get to it (user POV)

- `bun run --cwd packages/hymnal compile:db` rebuilds the shipped corpus.
- `bun packages/hymnal/scripts/compile-db.ts --out <absolute-file>` builds a scratch corpus.
- `manna hymns get <number> --json`, `search <query> --json --limit <n>`,
  `categories` and `category <id>` read the file selected by `HYMNAL_DB_PATH`.
- `manna init` acquires the raw artifact. The regression uses an isolated HTTP
  fixture and destination instead of running general init against owner storage.

## Driving it with sim

- **Preconditions:** run from the checkout root, packages installed, host load below 12.
  Use an absolute scratch evidence directory. For run acceptance, set `UNIT` to
  `/Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymndb`.
  Set `HOME` to a fresh scratch directory for every build or init run.
- **States:** default build/lookup, empty search/missing ID and invalid-input error.
  sim drive, focus-visible, open and loading are n/a: SQLite has no app route.
- **Regression:** `packages/hymnal/src/database.slow.test.ts`,
  `packages/core/src/hymnal/service-bun.test.ts`,
  `packages/cli/test/commands/hymns.slow.test.ts`.

1. **Build.** `bun packages/hymnal/scripts/compile-db.ts --out "$EVIDENCE/hymnal.db"`.
   → exit 0, `PASS corpus-db-build schema=2 hymns=695 readings=225`.
2. **Census/search.** `bun "$UNIT/acceptance.ts" "$PWD" "$EVIDENCE/hymnal.db"`.
   → exit 0, all normalized table counts and 695 title/first-line FTS checks pass,
   `ACCEPTANCE GREEN failures=0`. The planner measured this path red on the base:
   `red-base.log`, exit 1, `ACCEPTANCE RED failures=18`.
3. **Preservation.** `bun test packages/hymnal/src/database.slow.test.ts`.
   → all fields, repeated refrain occurrences, descriptors, evidence, read-only
   service reconstruction, repeatable bytes and invalid-input preservation pass.
   Chord, timing and refrain mutation probes must each detect the changed field.
   Builds release temporary siblings before returning, including on a failed write.
   A different SQLite library reports a `sqlite_version mismatch` before byte comparison.
   The v0 search comparison derives its rows from the independent capture, without
   Git history, and checks 65 word/operator probes at limits 20 and 920.
4. **CLI/legacy/init.** `bun test packages/core/src/hymnal/service-bun.test.ts packages/cli/test/commands/hymns.slow.test.ts`.
   → both reader formats, literal search, limits, typed failures and local HTTP
   download/skip/force/failure behavior pass. Owner storage stays untouched.
   Operator-like queries (`a*`, `{title}`, `title:`) and a lone accented letter
   use literal substring matches; they do not gain broad FTS token matches.
   For full init, set `INITFRESH_UNIT=/Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/initfresh`
   and `INITFRESH_BOOTSTRAP=$(mktemp -d /tmp/initfresh-bootstrap.XXXXXX)`, then run:
   - `HOME="$INITFRESH_BOOTSTRAP" bun "$INITFRESH_UNIT/acceptance.ts" "$PWD" --compiled --property`
   - `HOME="$INITFRESH_BOOTSTRAP" bun "$INITFRESH_UNIT/acceptance.ts" "$PWD" --compiled --property --delete-journal`
   - `HOME="$INITFRESH_BOOTSTRAP" bun "$INITFRESH_UNIT/wal-probe.ts"` (diagnostic only).
     → each acceptance exits 0 with `ACCEPTANCE GREEN failures=0`: four installed
     targets, populated legacy/prior-provenance/offline preservation, and 16 presence
     subsets per journal mode. Hash, inode, mtime and size stay unchanged for existing
     databases. No provenance migration, HTTP request on the populated offline leg,
     or `.building` residue is allowed. Keep pinned size/digest rejection and force
     refresh covered. The WAL probe's read-only failure is expected diagnostic data.
     Fast guards: `packages/cli/test/commands/init.test.ts` and
     `packages/core/src/platform-bun/file-corpus-lifecycle.test.ts` (tiny closed/live WAL fixtures).
5. **Run proof.** `bun "$UNIT/verify.ts" "$PWD"`.
   → two compiler outputs equal the shipped bytes; 920 source rows and 68 original
   categories equal the planner's copied base; real CLI boundary IDs, all five
   refrain orders, searches/categories/category/missing paths pass. Exit 0,
   `ACCEPTANCE GREEN failures=0`. Keep only safe result labels, counts and hashes.

## Gotchas

- Run `bun run dead-exports` before handoff when a change adds exports.

- Name corpus entries by number in proof. Capture CLI output in memory and reduce
  it to booleans/counts before logging. Assertions compare booleans with safe coordinates.
- Compile and census sources are `data/source-text.json`, never generated SQLite.
  `scripts/census.ts` also reads historical Git database blobs as an independent oracle.
- Source writers share `serializeSourceText`; `topics.test.ts` checks canonical bytes.
  The source capture is excluded from oxfmt.
- Readings 696–920 belong to SDAH-1985. They are not a separate hymnal edition.
- Recording availability is unknown. Metres are incomplete printed evidence.
  This recipe proves neither audio availability nor a phone interaction.
