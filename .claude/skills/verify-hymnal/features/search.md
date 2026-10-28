# Search

The home screen's field (`Number, title or first line`) finds a hymn by
its number in any form a reader writes one, or by any line of any stanza
or refrain half remembered: with a typo or two in its longer words, a word
or two left out, two words swapped, or a modern word for an old one
(`you` for `thee`, `your` for `thy`, `has` for `hath`, and the other way).
On a phone a tap on the field enters search mode: the focused search box
and `Cancel` over the results. The results are hymn rows as in the list;
a result found by a line other than its title shows that line under the
title, quiet. On a phone, after a pause of about 150 ms in the typing,
the five strongest matches are followed by a section `Hymns about this`
(up to 10 hymns by meaning, not among those five), then the rest of the
matches under `More matches`, each hymn once; a query that holds a digit, or is under
three letters, has no such section. A press opens the hymn, with a back button `Hymns`. A query
with no match says `No hymn matches “<query>”.` Cancel clears the query
and brings the list back where it was.

## Sub-features

- `search-number`: a number finds that hymn first, then the hymns whose number starts with it.
- `search-number-forms`: `100`, `#100`, `# 100`, `no 100`, `no. 100`, `No.100`, `hymn 100`, `Hymn #100`, `hymn no. 100` and `number 100` each find hymn 100 first, and so do they with punctuation around the number (`100.`, `(100)`).
- `search-text`: words of a title find the hymns whose title holds them first, in number order, then the hymns whose lines hold them, and only then the hymns a typo of a word finds. The last word may be half typed: it finds the words it starts.
- `search-line`: any line of any stanza or refrain, typed whole, finds its hymn first or among the first five.
- `search-typo`: the line with one or two typos (a letter dropped, doubled, swapped or mistyped) in words of 4 letters or more still finds it.
- `search-dropped`: the line with one or two words left out still finds it.
- `search-modern`: the line with a modern word for an old one (`you`/`thee`/`thou`/`ye`, `your`/`thy`/`thine`, `are`/`art`, `has`/`hath`, `have`/`hast`, `does`/`doth`, `do`/`dost`, `shall`/`shalt`, `will`/`wilt`, `can`/`canst`, `did`/`didst`), or the other way, still finds it.
- `search-order`: the line with two words swapped still finds it.
- `search-matched-line`: on a phone, a result found by a line other than its title shows that line under the title in the muted colour, one line long, in a taller row; VoiceOver reads it after the title. A result found by its title or its number shows the title alone. The home list's rows stay one line.
- `search-about`: on a phone, a query of words (`hymns about the second coming`) shows, after a pause of about 150 ms, the heading `Hymns about this` under at most five matches, its hymns by meaning (none of the five above it), then `More matches` over the rest of the matches, each hymn once in the results; a number (`no 100`) shows no such heading. No model runs on the phone (`about.md`, `search-about-size`).
- `search-open`: a result opens the hymn, with a back button `Hymns`.
- `search-empty`: a query with no match shows the empty message.
- `search-hermes`: each keystroke's search runs under 4 ms at the 95th percentile and under 8 ms at most in Hermes (`hermes-engine-cli` 0.12.0, the research harness over the app's own `src/hymns/search.ts`), and its index is built as search mode opens, never at the app's start.

## How to get to it (user POV)

- The home screen's field `Number, title or first line`: at the list's top, or shown again over the list's top after an upward scroll deep in the list (`hymn-list.md`, `list-search-reveal`).
- On the web, the field above the home list.

## Driving it with sim

- **Preconditions:** the home list, not in search mode (`sim open / --expect "label=Hymns"`).
- **States:** default, empty, focus-visible (the search box). Open, loading and error are n/a.
- **Regression:** `apps/hymnal/src/hymns/search.test.ts`, `apps/hymnal/src/hymns/search.property.slow.test.ts` (every hymn by number and title, seeded half-remembered lines), `apps/hymnal/src/reader/rows.test.ts` and `apps/hymnal/src/reader/HymnList.native.slow.test.ts` (the found line in a result's row, and `Hymns about this` under the strongest five), `apps/hymnal/src/hymns/meaning.test.ts`, `apps/hymnal/test/browser/list.slow.test.ts`.
- **Words:** a step that types a line builds it from the reader's own tree read in memory (`agent-device snapshot --json`, as `drive.ts` reads it) and prints numbers only; never write a hymn's words into a log, a note or a command line kept in evidence.

1. **Enter search.** `sim tap "role=button label=Number, title or first line"`. → `ok`; the snapshot holds the search box and `Cancel`.
2. **Number forms.** `sim fill "label=Number, title or first line" "no 100"`. → the first result row is named `100, …`. Again with `#100`, `Hymn #100` and `number 100`: the same first row.
3. **A line.** Open hymn 100 (`sim open hymns/100 --expect "label=Stanza 1"`), read the third line of `Stanza 2` from the tree in memory, go home, enter search and type it with one letter of its longest word dropped. → a result named `100, …` among the first five, and its row shows a second, quieter line under the title (the row is taller than its neighbours: its `height` in `agent-device snapshot --json`, about 56 at the usual text size against 44).
4. **A title.** Type the first word of hymn 100's title, read from its row's name in memory. → the first results are the hymns whose titles hold that word, in number order, each a one-line row.
5. **Open a result.** `sim tap` the first result's row. → the reader shows `Stanza 1`; the back button is `Hymns`. `sim back`. → search mode with the query kept.
6. **Hymns about this** (`search-about`). `sim fill "label=Number, title or first line" "hymns about the second coming"`, then wait for `label=Hymns about this` (`sim tap` it with a timeout, or `--expect`). → the heading is in the tree after at most five result rows; the rows after it, to `More matches`, are none of those five, and no hymn number shows twice in the results. `sim fill` with `no 100`. → no `Hymns about this`.
7. **Empty.** `sim fill "label=Number, title or first line" "zzzz"`. → the snapshot holds `No hymn matches “zzzz”.`
8. **Cancel.** `sim tap label=Cancel`. → the home list where it was.

## Gotchas

- Search lives on the home screen; there is no Search tab or `/search` route. Reach it from the list's field, at the top or shown again over the top.
- On iOS the field at the list's top is a button named `Number, title or first line`; in search mode the search box has the same name. Use `role=button` to enter, `label=` to fill.
- Results follow the typing after a deferral: wait for a result (`--expect`, or `sim tap` of the row with its timeout), never a fixed sleep.
- A result's name is `<n>, <title>` and, when it was found by a line, `, <line>` after it: match a result by its leading `<n>, ` only.
