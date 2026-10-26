# Corpus Supply

## Webster 1828

Webster is an optional File Corpus. Bible bootstrap stays unchanged.
`manna init` explicitly ensures Webster through `Target.webster()` and reports
missing or rejected data with a remedy. A corrupt candidate fails closed.
The native lifecycle verifies before atomic activation and preserves the prior
active file after acquisition or verification failure.

Run `bun run build:webster` from a source checkout. The compiler fetches only the
CSV pinned in `packages/core/assets/webster1828-source.json`, verifies its bytes
and SHA-256, and emits ignored `packages/core/data/webster.db` and
`webster.manifest.json`. `--source <CSV>` accepts the same pinned bytes offline;
`--out <path>` selects a build output. Builds reject the owner's runtime
`.bible` directory. Compilation uses a fresh sibling, validates SQLite/FTS,
closes the connection and atomically replaces the selected database. The
adjacent manifest holds size and digest; no self-hash is stored in the database.

The snapshot retains all 62,391 records and 62,388 normalized keys, including
two `anticonstitutional` and three `counter-revolution` rows. Each entry keeps
source HTML, plaintext, original headword and stable source-ordinal id.
Definitions retain their senses and quotation order. FTS5 searches literal
definition terms with AND, rank and id tie-breaking. Exact lookup wins before
the bounded `-eth` / `-est` fallback; candidates must exist in the dictionary.
The response labels heuristic matches. This does not claim universal KJV
lemmatization, irregular spelling resolution or verse-aware glosses.

`@manna/core/webster` is portable. `@manna/core/webster/bun` opens existing
read-only SQLite at an explicit filename, `WEBSTER_DB_PATH`, or
`~/.bible/webster.db`. `manna webster <word> [--json]` looks up an entry;
`manna webster search <definition words> [--limit 1..100] [--json]` searches
definitions. JSON has `query` and `entries`. No match is successful empty data;
missing or corrupt storage is an actionable error.

There is no Webster release pin. Native sources are packaged, workspace, then
existing runtime data. A binary distributor must build the corpus first.
The CLI build stages the artifact, manifest, `webster1828-NOTICE.md` and
`webster1828-LICENSE.txt` into package data and beside the executable. Missing
optional assets are reported; CLI compilation never downloads or builds them.

The original 1828 work is public domain. The selected electronic transcription
and adapted artifact are CC BY-SA 4.0. Preserve the complete licence, attribution
to Noah Webster and the akaitsurugi/webster1828 contributors, the pinned
revision, marked changes, ShareAlike, and no additional restrictions. This data
licence is distinct from the application's code licence. Upstream reports
roughly 600 work-in-progress words outside this snapshot and does not fully
document the earlier transcription lineage. This is not a complete critical
edition. App distribution, mobile/browser adapters and Heartseed UI are outside
this corpus unit.

The scan sample also found omitted etymological text and quotation credits,
expanded biblical references and altered numbering. Three incorrect references
in `charity`, `love` and `prevent` are corrected in plaintext using the original
scans, recorded in `packages/core/src/webster/corrections.ts`. Source HTML stays
unchanged. Projection metadata identifies this transformation. See the shipped
notice for exact corrections and source limits.

`CorpusSupply.ensure(input?)` is the only application-facing asset bootstrap operation. New computers do not need repository asset folders or manual copying: CLI and browser acquire the pinned release Artifact, while desktop first checks its packaged and workspace sources before falling back to the same release.

## Current Bible Artifact

- Release: `db-v2`
- Size: `156291072` bytes
- SHA-256: `e72244f576be2bfa1b28c4816f60d3668338c1322d7cd329d73143ec43bf277c`
- Contents: 66-book KJV Canon, Strong's lexicon and verse data, OpenBible and TSKe Cross References, Margin Notes, and Topics

The manifest is declared once in `packages/core/src/corpus-supply/file-artifact.ts`, alongside the generic File Corpus Artifact the Bible instance is built from. Native sources stream directly from GitHub. Browser sources use `/api/assets/bible` so GitHub's transport-specific CORS behavior remains in the web adapter.

Browser generations are owned by one durable generation store. It registers a candidate before acquisition, activates the verified reader before publishing its marker, rolls the reader back if that durable commit fails, and reconciles every registered inactive generation on startup. The worker composition root supplies VFS mechanics but cannot reorder activation or retirement.

## Adapter contract

Bible inputs become a `BibleCorpusArchive` by decoding all seven source shapes before the single SQL Installation. A portable database becomes a `BibleArtifact` only when its declared Provenance matches its bytes and semantic verification proves the complete Canon and Study data.

Writings inputs become a `PublicationStream`: the Publication's record, then its chapters one at a time as `ArchiveChapter`s, so no step between the download and the database holds a whole book (one dictionary of 150,525 paragraphs expands to 89 MB of JSON; a Worker holds 128 MB). `provenanceForBytes` hashes the downloaded archive's bytes before any chapter is read, and `installPublication` stages each chapter as it arrives, then makes the live rows the staged ones in one atomic group with the source, revision, and digest. That group writes only the rows that differ, so a reinstall that changes nothing writes no paragraph (rewriting the 319,370 paragraphs of the Topical Index in one group was more than D1 answers in time). A chapter that fails to read fails the install with the source's own error and leaves the Publication as it was. The Writings recipe orders `packaged`, `provider`, then `archive` sources. It falls through only on `CorpusSourceUnavailableError`; `CorpusContributionRejectedError` fails closed.

To add an Asset Source:

1. Decode untrusted input with an Effect Schema at the adapter boundary.
2. Coerce it to `BibleCorpusArchive`, `BibleArtifact`, or `WritingsContribution`.
3. Supply exact Provenance; portable Artifacts must pin their SHA-256 digest.
4. Add the adapter to the static recipe with an existing source kind, or deliberately extend the exhaustive priority table.
5. Prove unavailable fallback, rejected-contribution fail-closed behavior, semantic verification, and preservation of the active generation in tests.

Do not expose URLs, paths, VFS handles, download ordering, or source selection through `CorpusSupply.ensure`.

## Publishing a Bible revision

1. Run `bun run --cwd packages/core sync:bible:force` to decode every source and build `packages/core/data/bible.db`.
2. Run the full gate and verify SQLite integrity plus the required semantic counts.
3. Compute the file size and SHA-256, then update the single manifest constant.
4. Publish a new release tag and asset; never replace bytes under an existing revision.
5. Verify the GitHub asset digest and exercise the web same-origin proxy before committing the manifest change.

The release Artifact is replaceable product data. User state lives in separate databases and is never included in this lifecycle.
