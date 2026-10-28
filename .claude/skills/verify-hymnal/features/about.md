# About this hymn

A hymn page's quiet line above its number and title (its topic, with a `›`
in the accent) is a button, `About this hymn`. A tap opens a sheet over
the page, with a grabber and `Done`: the hymn's number and title, quiet,
then the heading `More like this` over the 8 hymns whose meaning lies
nearest the hymn's, nearest first, each a row named `<n>, <title>`. A row
closes the sheet and opens that hymn's page over the one the reader came
from; Back returns there. A drag down or `Done` closes the sheet. The
hymns come from a word table and hymn vectors distilled from
EmbeddingGemma that ship with the app; no model runs on the phone and
nothing goes over the network.

## Sub-features

- `about-sheet`: on a hymn page the button `About this hymn` (its value the topic) opens a form sheet with `Done`; `Done` or a drag down closes it, and the page is where it was.
- `about-more-like`: the sheet's first section is the heading `More like this` over 8 hymn rows, never the hymn itself; a row closes the sheet and opens its hymn, and Back returns to the hymn the sheet was opened on.
- `search-about-size`: the iOS app grows by at most 20 MB against base (the table is a 13 MB module in the JS bundle, one byte a character in Hermes bytecode), and `Hymns about this` (`search.md`, `search-about`) takes under 30 ms a query in Hermes.

## How to get to it (user POV)

- A hymn page's quiet line, above its number and title.
- The route `hymnal://about?hymn=<n>` (iOS) or `/about?hymn=<n>` (web).

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default, open. Focus-visible, loading, empty and error are n/a (a route naming no hymn says `No hymn`).
- **Regression:** `apps/hymnal/src/reader/About.test.tsx` (the rows equal `moreLike`, the page's line opens the sheet, a row closes it and opens its hymn), `apps/hymnal/src/hymns/meaning.test.ts` (the ranking is the cosine over the shipped vectors), `packages/hymnal/scripts/meaning/table.test.ts` (the file's format), the acceptance's `find-meaning-theme`.

1. **Open the sheet.** `sim open hymns/100 --expect "label=Stanza 1"`, then `sim tap "label=About this hymn"`. → `ok`; the snapshot holds `Done` and the heading `More like this`.
2. **The rows.** Read the sheet's rows from the tree in memory (`agent-device snapshot --json`): the labels that start `<n>, `. → 8 rows, none `100, `; their numbers equal `moreLike(100, 8)` from the checkout (`apps/hymnal/src/hymns/meaning.ts`) run in Bun with the app's test preload. Print the numbers only.
3. **Open a row.** `sim tap` the first row by its leading number. → the sheet is gone and the reader shows that hymn (`id=hymn-number` reads its number); `sim back`. → hymn 100.
4. **Close.** Open the sheet again, then `sim tap label=Done`. → hymn 100's page, scrolled where it was.
5. **Size** (`search-about-size`). `du -sk` of the base and head Release `Hymnal.app` (or the two `main.jsbundle` files when the native inputs are the same). → head minus base ≤ 20 MB. Time `aboutQuery` over the research's 48 theme queries in `hermes-engine-cli` 0.12.0 (`hermes -O`, the bundle made as `search-hermes` makes its own). → each query under 30 ms.

## Gotchas

- The button's label is `About this hymn`, its value the topic: `label=` matches the button, not the topic's words.
- The first sheet of a launch reads the table (about 90 ms in Hermes 0.12 on a Mac); later sheets do not.
- A row's name holds the hymn's title: match it by its leading `<n>, ` and keep titles out of logs.
