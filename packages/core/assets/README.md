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

## Strong's lexicon

`strongs.json` is James Strong's Greek (1890) and Hebrew (1894) dictionaries,
one entry per Strong's number (`G<n>`, `H<n>`): `lemma`, `xlit`, `def` (the
definition, a dash, how the KJV renders the word), and `pron` (every Hebrew
entry, and the Greek entries the repair gave one) and `kjvDef` (Hebrew).
Strong's own text is in the public domain.

The 4,710 entries that were defective (a definition that began with `null`
and its pronunciation, written twice, with no letter, or with Greek or Hebrew
words dropped) were refilled from Open Scriptures' JSON edition of the two
dictionaries; every other entry is as it was. That edition says in each
file: "Copyright 2009 (Greek), 2010 (Hebrew), Open Scriptures. CC-BY-SA.
Derived from XML" (the Greek XML by Ulrik Petersen, the Hebrew by David
Instone-Brewer and David Troidl). Credit Open Scriptures wherever the lexicon
is shown, and share an adapted lexicon under the same terms.

- Source repository: <https://github.com/openscriptures/strongs>, commit
  `0acd2f251c2d35ff8db2dece4e0593979d3ac223` (2021-07-15)
- `greek/strongs-greek-dictionary.js` SHA-256:
  `7624ee738ae47e80f1a352223e28a26d011c9cd4898822cee52f47a010c04efd`
- `hebrew/strongs-hebrew-dictionary.js` SHA-256:
  `5ce6aeed551c709f49bcfa341cadf2f34bc7599b85d9de9e6ac2ecbf60fc3739`
- Repair: download both files into one directory outside the repository, then
  `bun run --cwd packages/scripts strongs:clean --source <that directory>`.
  The tool refuses a file whose SHA-256 differs, leaves every sound entry as
  it is, and run again changes nothing. Without `--source` it applies the
  rules alone (`packages/scripts/src/strongs-clean/rules.ts`).
