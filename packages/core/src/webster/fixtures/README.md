# Audited KJV word domain

`kjv-endings.json` is the complete lowercase word census of the repository's
`packages/core/assets/kjv.json` ending in `eth` or `est`. It includes Hebrew
headings, names, ordinary nouns, superlatives and verbs. Apostrophes and hyphens
inside words are retained. Eight explicitly requested extra forms cover the
irregulars `art`, `dost`, `doth`, `hast`, `hath`, `saith`, `wast`, and the noun
`breast` (which does not actually end in either suffix). Frequencies count every
occurrence, including the source's headings and bracketed supplied words.

Reproduce the raw census without an owner database:

```sh
bun packages/scripts/src/webster-compiler/kjv-domain.ts
```

The fixture records a source SHA-256, verse count, frequency, a context reference,
and a reviewed dictionary lemma or `none` for every form. It is an oracle, not
the output of the production lookup. All candidate stems and collision
definitions were reviewed. Past-tense stems return their verb lemma; names and
headings must not become unrelated common words. Missing dictionary lemmas
remain `none`, including meet, meddle, hasten and repay. British spelling and
consonant-y forms use verified existing headwords. The `show` entry explicitly
states that it is also written `shew`, which supports shewest/sheweth → show.

Exact matching remains first. The source has grammar entries for `dost`, `hast`,
`art` and `wast`. Their `lemma` is that valid exact entry; `canonical` records do,
have, be and be. These are not misidentified noun stems. The substantive `be`
entry supports the art/wast alias if the exact grammar entry is absent; the
source's `am` entry is instead a prefix and must not be used as that target.
An alias whose intended target is missing must stop, not try another stem.

`kjv-lexicon.json` independently captures the real pinned dictionary's exact,
candidate and resolved-headword vocabulary needed by the fast fixture-only
test. It includes collision words (doe, saye, aile, frett, mourne, robbe, singe,
springe, stepp, swimm, tri, warre) so a wrong stem can fail without a full DB.
The slow test checks every expected result against the actual SQLite and checks
that the source census still matches. The generic suffix rule applies only
after the audited aliases; it is not evidence of correctness for unseen words.
