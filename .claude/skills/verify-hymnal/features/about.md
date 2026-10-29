# About this hymn

A hymn page's quiet line above its number and title (its section, then the
first passage the Scriptural index gives the hymn with `+N` for the rest,
and a `›` in the accent) is a button, `About this hymn`. A tap opens a
sheet over the page, with a grabber and `Done`: the hymn's number and
title, quiet, then the heading `More like this` over the 8 hymns whose
meaning lies nearest the hymn's, nearest first, each a row named
`<n>, <title>`. Under it come `Topics` (the Topical index's topics the hymn
is listed under, a subtopic with its parent under its name), `Scripture`
(the passages the Scriptural index gives it, as `Psalms 98:4, 6`) and
`Sing to another tune` (the other hymns of its metre heading in the
Metrical index, in number order, each a row `<n>, <title>`). A section the
indexes give nothing for is left out. A hymn row closes the sheet and
opens that hymn's page over the one the reader came from; Back returns
there. A topic or a passage closes the sheet and the pages under it and
searches the hymns for it on the home screen (`search.md`, `search-topic`,
`search-scripture`). A drag down or `Done` closes the sheet. The `More like
this` hymns come from a word table and hymn vectors distilled from
EmbeddingGemma that ship with the app, the other sections from the
back-matter indexes bundled as numbers and names (`indexes.md`); no model
runs on the phone and nothing goes over the network.

## Sub-features

- `about-sheet`: on a hymn page the button `About this hymn` (its value the section, then `·` and the first passage with ` +N` for the rest, or the section alone when the hymn has no passage) opens a form sheet with `Done`; `Done` or a drag down closes it, and the page is where it was.
- `about-more-like`: the sheet's first section is the heading `More like this` over 8 hymn rows, never the hymn itself; a row closes the sheet and opens its hymn, and Back returns to the hymn the sheet was opened on.
- `about-topics`: the heading `Topics` over one row a topic the hymn is listed under (`about-topic-<i>`, named by the topic); a row closes the sheet and the pages under it and opens search mode with the topic's name as the query (`search-topic`).
- `about-scripture`: the heading `Scripture` over one row a passage (`about-scripture-<i>`, named `<Book> <chapter>:<verses>`); a row closes the sheet and the pages under it and opens search mode with where the passage begins as the query (`search-scripture`).
- `about-tunes`: the heading `Sing to another tune` over the other hymns of the hymn's metre heading (`about-tune-<n>`, named `<n>, <title>`), in number order, never the hymn itself; a row closes the sheet and opens its hymn, and Back returns to the hymn the sheet was opened on. A section the indexes give nothing for has no heading.
- `search-about-size`: the iOS app grows by at most 20 MB against base (the table is a 13 MB module in the JS bundle, one byte a character in Hermes bytecode), and `Hymns about this` (`search.md`, `search-about`) takes under 30 ms a query in Hermes.

## How to get to it (user POV)

- A hymn page's quiet line, above its number and title.
- The route `hymnal://about?hymn=<n>` (iOS) or `/about?hymn=<n>` (web).

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default, open. Focus-visible, loading, empty and error are n/a (a route naming no hymn says `No hymn`).
- **Regression:** `apps/hymnal/src/reader/About.test.tsx` (the rows equal `moreLike`, `topicsOf`, `referencesOf` and `sameMetre`, an empty section is left out, the page's line opens the sheet and gives the section and first passage, a hymn row closes it and opens its hymn, a topic or passage row sets the search query and search mode), `apps/hymnal/src/hymns/indexes.test.ts` (the lookups, `passageText`, `passageQuery`), `apps/hymnal/src/hymns/meaning.test.ts` (the ranking is the cosine over the shipped vectors), `packages/hymnal/scripts/meaning/table.test.ts` (the file's format), the acceptance's `find-meaning-theme`.

1. **Open the sheet.** `sim open hymns/100 --expect "label=Stanza 1"`, then `sim tap "label=About this hymn"`. → `ok`; the snapshot holds `Done` and the heading `More like this`.
2. **The rows.** Read the sheet's rows from the tree in memory (`agent-device snapshot --json`): the labels that start `<n>, `. → 8 rows, none `100, `; their numbers equal `moreLike(100, 8)` from the checkout (`apps/hymnal/src/hymns/meaning.ts`) run in Bun with the app's test preload. Print the numbers only.
3. **Open a row.** `sim tap` the first row by its leading number. → the sheet is gone and the reader shows that hymn (`id=hymn-number` reads its number); `sim back`. → hymn 100.
4. **Close.** Open the sheet again, then `sim tap label=Done`. → hymn 100's page, scrolled where it was.
5. **The index sections** (`about-topics`, `about-scripture`, `about-tunes`). Open the sheet again and scroll it down. → the headings `Topics`, `Scripture` and `Sing to another tune`; the `about-tune-<n>` row numbers equal `sameMetre(100)` from the checkout (`apps/hymnal/src/hymns/indexes.ts`), printed as numbers only. `sim tap` the first `about-tune-<n>` row. → that hymn's page; `sim back`. → hymn 100.
6. **A topic** (`search-topic`). Open the sheet, `sim tap` `id=about-topic-0`. → the home screen in search mode, the search box holding the topic's name, its first results the hymns the topic lists. `sim tap label=Cancel`.
7. **A passage** (`search-scripture`). Open hymn 100 and its sheet, `sim tap` `id=about-scripture-0`. → search mode with where the passage begins as the query, hymn 100 among the first results. `sim tap label=Cancel`.
8. **Size** (`search-about-size`). `du -sk` of the base and head Release `Hymnal.app` (or the two `main.jsbundle` files when the native inputs are the same). → head minus base ≤ 20 MB. Time `aboutQuery` over the research's 48 theme queries in `hermes-engine-cli` 0.12.0 (`hermes -O`, the bundle made as `search-hermes` makes its own). → each query under 30 ms, the first of a launch too (search mode reads the table in a task of its own after it opens, `readMeaningSoon`, so the first pause does not). Time `moreLike(100, 8)` the same way, cold (the first call of a launch) and after `readMeaningSoon` has run. → cold about 70 ms, after about 13 ms: the hymn page reads the table in a task of its own after it opens, so the sheet's first render is the 13 ms one.

## Gotchas

- The button's label is `About this hymn`, its value the section and first passage: `label=` matches the button, not those words.
- The heading `More like this` is drawn in capitals; its label is `More like this` (an uppercase style alone would make the label `MORE LIKE THIS`).
- The table is read once a launch, in a task of its own (about 55 ms in Hermes 0.12 on a Mac): the task after search mode or a hymn page opens (`readMeaningSoon`). Search mode's open task builds the search index alone (about 180 ms). A sheet opened before that task runs reads the table in its render (about 70 ms); after it, the sheet's rows take about 13 ms, and so does the first query.
- A row's name holds the hymn's title: match it by its leading `<n>, ` and keep titles out of logs.
- A topic or passage row returns to the stack's first screen (`router.dismissAll()`) before search opens. Open the hymn from the home list or by `sim open hymns/<n>` over the home screen: a hymn the app was launched into by deep link, with no home screen under it, stays on its page, with the query and search mode set.
- Match a topic or passage row by its id (`about-topic-<i>`, `about-scripture-<i>`); topic names hold no hymn words, but a row's id is steadier than its name.
