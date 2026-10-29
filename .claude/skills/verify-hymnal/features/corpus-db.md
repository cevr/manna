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
- `corpus-db-indexes`: `manna hymns get <n> --json` gives a hymn's back-matter indexes (`indexes`, the `HymnIndexes` shape) from the `index_*` tables; a reading (696-920) and a database with no index tables give `indexes: null`, and the text form adds `Topics:`, `Tunes:` and `Metres:` lines under the hymn.
- `corpus-init-empty`: full init installs all four databases in an empty scratch HOME.
- `corpus-init-preserve`: default init preserves existing files, including offline and legacy installs.
- `corpus-init-wal`: closed WAL artifacts and live WAL commits survive acquisition and verification.
- `corpus-init-wal-refuse`: forced init checks the destination and resolved path, refuses non-empty WALs, preserves linked targets and side files, finishes unaffected databases and exits non-zero. Every install stages and renames.
- `corpus-init-runtime-repeat`: verified Webster runtime data stays byte-identical through two default init calls; explicit refresh still verifies and activates.

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
     or `.building*` residue (including `-journal`, `-wal` and `-shm`) is allowed. Keep pinned size/digest rejection and force
     refresh covered. The WAL probe's read-only failure is expected diagnostic data.
     Fast guards: `packages/cli/test/commands/init.test.ts` and
     `packages/core/src/platform-bun/file-corpus-lifecycle.test.ts` (tiny closed/live WAL fixtures).
     For forced-refresh refusal, set `INITWAL_UNIT=/Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/initwal`
     and `INITWAL_BOOTSTRAP=$(mktemp -d /tmp/initwal-bootstrap-scratch.XXXXXX)`, then run:
   - `HOME="$INITWAL_BOOTSTRAP" bun "$INITWAL_UNIT/acceptance.ts" "$PWD"`
   - `HOME="$INITWAL_BOOTSTRAP" bun "$INITWAL_UNIT/acceptance.ts" "$PWD" --property`
     → exits 0, `INITWAL GREEN cases=1 failures=0` and `INITWAL GREEN cases=76 failures=0`.
     Each refusal names its database and WAL, explains corruption risk and asks the user
     to close the database-using program and let SQLite checkpoint cleanly before retrying.
     No database open, checkpoint or side-file cleanup is permitted on a refused target.
     Live, crash-image and malformed one-byte WALs are refused; absent/empty controls
     refresh normally. Default init and unrelated installed databases stay unchanged.
     The 76 cases include all four live-WAL symlink targets, symlink and hard-link
     no-WAL controls, and the original 64 WAL cases. Both the supplied and resolved
     database path are checked. No install writes through an existing database link:
     bytes go to a fresh exclusive `<dest>.building` and rename follows the WAL recheck.
     A missing database with a leftover WAL is refused with matching-database recovery
     instructions. Do not rebuild a different database over that WAL. Expected refusals
     print clear diagnostics and a failed final status without a runtime stack trace.
     For runtime-repeat timing, make `INITWAL_TEST_HOME=$(mktemp -d /tmp/initwal-test-scratch.XXXXXX)`.
     Run `HOME="$INITWAL_TEST_HOME" bun test packages/cli/test/commands/webster.slow.test.ts --test-name-pattern 'keeps a verified active runtime corpus unchanged across repeated init'`
     three times in sequence below load 12, without a global timeout override. Record each
     test duration; each must pass at the default limit. The compact synthetic fixture
     retains the real 62,391-row verifier. The relocated CLI case retains the real corpus:
     build the prerequisite with `HOME="$INITWAL_TEST_HOME" bun run build:webster` only when
     `packages/core/data/webster.db` is absent, then run the full slow file with the same HOME.
     These checks use CLI/SQLite; sim drive, app launch, audio and device steps are n/a.
5. **Run proof.** `bun "$UNIT/verify.ts" "$PWD"`.
   → two compiler outputs equal the shipped bytes; 920 source rows and 68 original
   categories equal the planner's copied base; real CLI boundary IDs, all five
   refrain orders, searches/categories/category/missing paths pass. Exit 0,
   `ACCEPTANCE GREEN failures=0`. Keep only safe result labels, counts and hashes.
6. **Indexes (`corpus-db-indexes`).** Build to scratch as in step 1, then read hymn 2 through it:
   `HYMNAL_DB_PATH="$EVIDENCE/hymnal.db" bun packages/cli/src/main.ts hymns get 2 --json | jq -c '.indexes | {number, topics: (.topics|length), passages: (.passages|length), tunes: (.tunes|length), metres: (.metres|length)}'`
   → exit 0, `{"number":2,"topics":2,"passages":3,"tunes":1,"metres":2}`. The same
   command for `696` prints `.indexes` as `null`, and the text form (`hymns get 2`)
   has one `Topics:`, one `Tunes:` and one `Metres:` line. The regression is the
   indexes case of `packages/cli/test/commands/hymns.slow.test.ts`. Trash the
   scratch db after the run.

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
