# Corpus assets

Webster 1828 uses the pinned CSV identified by `webster1828-source.json`.
Run `bun run build:webster` to generate the ignored SQLite and digest manifest
under `packages/core/data`. This adapted electronic transcription is CC BY-SA
4.0; distribute `webster1828-NOTICE.md` and the complete
`webster1828-LICENSE.txt` beside it. The notice states the source limitations.

`naves-topical-bible.json` is a normalized public-domain edition of Orville J.
Nave's *Nave's Topical Bible*. It was copied from the CC0 Open Christian Data
repository at commit `f00ee65` on 2026-07-19.

- Source file: `data/topical-reference/naves/naves-topical-bible.json`
- Source repository: <https://github.com/OpenChristianData/open-christian-data>
- Imported file SHA-256: `02230f547d8096e76bc844718d934a8e8b6f209e9d590581d1712e86062fe494`
- Original CrossWire source and provenance are retained in the asset's `meta`
  envelope.
