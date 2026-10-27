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
and an expected dictionary lemma or `none` for every form. Headword spelling
alone cannot establish verb identity. The slow property checks each verb and
exact-inflection result's original source HTML for a verb label or explicit grammatical entry after its own bold headword,
independently of the expected lemma. Past-tense stems return their verb lemma;
names and headings must not become unrelated common words. Missing dictionary
lemmas remain `none`, including meet, meddle, hasten, repay, sow, swallow, till and leave.
The last four keys contain unrelated nouns: the swine, the bird, a vetch and
permission. Their seven KJV verb forms retain the verb in `canonical` and must
return no entries. British spelling and consonant-y forms use verified existing
headwords. The `show` entry explicitly states that it is also written `shew`,
which supports shewest/sheweth → show.

The one audited precedence exception is `closest`: Jeremiah 22:15 uses the verb
`close`, while the exact CLOSEST record is an adjective. It returns `close` with
`kjv-alias`, or no entry if CLOSE is absent. All other exact matching remains
first. The source has grammar entries for `dost`, `hast`,
`art` and `wast`. Their `lemma` is that valid exact entry; `canonical` records do,
have, be and be. These are not misidentified noun stems. The substantive `be`
entry supports the art/wast alias if the exact grammar entry is absent; the
source's `am` entry is instead a prefix and must not be used as that target.
An alias whose intended target is missing must stop, not try another stem.

`kjv-lexicon.json` independently captures the real pinned dictionary's exact,
candidate and resolved-headword vocabulary needed by the fast fixture-only
test. It includes collision words (doe, saye, aile, frett, mourne, robbe, singe,
springe, stepp, swimm, tri, warre) so a wrong stem can fail without a full DB.
The slow test compares required exact keys, suffix candidates, reviewed targets
and canonical irregular targets with real SQLite. It requires every required
existing key and rejects any nonexistent fixture key. Curated collision extras
remain. It also reproduces the full census and freezes the reviewed 970-row
judgments with a digest, independently of the production stemmer.
Its separate source property covers 876 `verb` and `exact-inflection` rows,
including art/dost/hast/wast and rows with `lemma: "none"`. A neighbouring word's
label or body prose cannot establish identity. Later verb senses under the same
word remain valid. A verb label alone cannot distinguish sing from singe; the
reviewed lemma property checks that separately. `verbSourceExceptions` records
the reasons for same-word water, haste, sorrow, smooth and drop; prose auxiliary
shall; and cross-reference enquire. Every exception must be necessary and used.
Challenge and ought have ordinary source markers and need no exception.
PROCEED contains PROCEEDER's text and LOATHE has only its heading, so proceedeth
and loatheth return no entry while their raw exact records remain available.
The source also uses italic `v.`, plain `v.`, `VT` and explicit second-person or
past-tense grammar entries. These are verb markers, not spelling evidence.
The generic suffix rule applies only after the audited aliases; it is not
evidence of correctness for unseen words.
