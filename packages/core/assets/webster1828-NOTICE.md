# Webster's American Dictionary (1828)

Original work: Noah Webster, New York: S. Converse, 1828 (public domain).
Electronic transcription: [akaitsurugi/webster1828 contributors](https://github.com/akaitsurugi/webster1828),
revision `b52403774b5b24d01377bbab29f642be226e9bb4`.

The electronic source and this adapted dictionary artifact are distributed under
[Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).
The complete licence accompanies this notice as `webster1828-LICENSE.txt`.
This data licence is separate from the application's code licence. No upstream
endorsement is implied. Preserve attribution, mark further changes, and apply
ShareAlike to adaptations. Do not impose additional restrictions on the data.

Manna changes: quoted CSV parsing; source-ordinal identifiers; trimmed lowercase
lookup keys; safe HTML-to-plaintext projection; SQLite and FTS5 compilation.
Source HTML, duplicate records, senses and quotations remain in source order.
Definitions are not paraphrased. The build manifest identifies the exact bytes.

Known limits: upstream reports approximately 600 words in its separate
work-in-progress file. That file is excluded. Earlier transcription lineage is
not fully documented. This snapshot is not a complete critical edition.
KJV lookup has one audited precedence exception: closest in Jeremiah 22:15
returns the verb CLOSE instead of the exact adjective CLOSEST. If CLOSE is
absent, it returns no entry. Otherwise lookup uses exact entries, then an audited alias table, then a bounded
suffix heuristic. The complete repository KJV ending-word census is committed
with frequencies and expected resolutions, including explicit no-match cases.
Verb and exact-inflection results are checked against part-of-speech or grammar
labels following their own headword, with necessary same-word exceptions and
their reasons in the KJV fixture.
Headword spelling alone does not establish verb identity. Missing verb entries
include MEET, MEDDLE, HASTEN, REPAY, SOW, SWALLOW, TILL and LEAVE. The last four
keys contain unrelated nouns (swine, bird, vetch and permission); their KJV
verb forms return no entries.
PROCEED contains PROCEEDER's text, and LOATHE has only its heading. The KJV
forms proceedeth and loatheth therefore return no entry. Exact queries retain
these raw transcription records.
The source lacks `shew`; the aliases for shewest/sheweth use `show`, whose entry
explicitly lists that spelling. Unseen forms still carry no universal guarantee.

Two known electronic key defects remain uncorrected: `e` contains DESCRIPTIVE's
text instead of the letter-E entry, and DESCRIPTIVE is also keyed `descriptiv`,
so exact `descriptive` is absent. These are source defects, not valid lexical
aliases. The raw records remain preserved for provenance and future scan work.

Some upstream rows have an empty own heading followed by a neighbouring
headword's text: COINAGE → COINCIDE, FULCRUM → FULFILL, BAIRN → BAIT and
BAILER → BAILIFF. The pinned source preserves these rows and may lack independent
keys for the neighbours, including fulfill, bailiff and hasten. KJV fulfil
therefore has no guaranteed entry. A prior audit counted 839 rows with this
empty-heading shape, including valid spelling variants; these are not all
unrelated-word errors. Future gloss consumers must skip unsafe rows. These
disclosures and KJV stops do not implement gloss selection or repair source text.

The transcription also omits portions of etymologies and quotation-author
credits, adds verse numbers to abbreviated chapter references, and sometimes
renumbers senses. Added verse numbers can be wrong: three of the ten sampled
entries had an incorrect reference expansion. Unchecked expansions must not be
treated as scan-verified citations. This is not a diplomatic transcription.
Manna applies three
scan-backed citation corrections in derived plaintext while preserving source
HTML: `charity`, 1 Corinthians 8:1 → 1 Corinthians 13 (volume 1, leaf 373);
`love`, 1 John 4:7 → 1 John 4 (volume 2, leaf 83); `prevent`, Psalms 119:148 →
Psalms 119 (volume 2, leaf 353). The scans give chapter references only. No
replacement verse number is inferred. These corrections are recorded in
`packages/core/src/webster/corrections.ts` and projection metadata.

Primary facsimiles: [volume 1](https://archive.org/details/americandictiona01websrich)
and [volume 2](https://archive.org/details/americandictiona02websrich).
