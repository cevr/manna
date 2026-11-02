# Search

The search box (`Number, title or first line`) finds a hymn by
its number in any form a reader writes one, or by any line of any stanza
or refrain half remembered: with a typo or two in its longer words, a word
or two left out, two words swapped, or a modern word for an old one
(`you` for `thee`, `your` for `thy`, `has` for `hath`, and the other way).
On a phone a tap on `Search` in the find bar at the list's foot enters
search mode: the bar grows into the focused search box, with `Cancel`
at its right, under the results. The results are hymn rows as in the list;
a result found by a line other than its title shows that line under the
title, quiet. On a phone, after a pause of about 150 ms in the typing,
the five strongest matches are followed by a section `Hymns about this`
(up to 10 hymns by meaning, not among those five), then the rest of the
matches under `More matches`, each hymn once; a query that holds a digit, or is under
three letters, has no such section. A press opens the hymn, with a back button `Hymns`. A query
with no match says `No hymn matches “<query>”.`, except on a phone a
query of known words with no text match: it shows `Hymns about this`
alone, with no empty message. Cancel clears the query
and brings the list back where it was.

The search box also finds hymns by the hymnal's back-matter indexes: a Bible
reference (`John 3:16`, `Ps 23`, `Psalm 23:1`: any book name or
abbreviation of the canon) lists first the hymns the Scriptural index
gives that verse, then the rest of that chapter's by verse distance, then
the word results; a chapter alone (`Psalm 23`) ranks as its verse 1
does, so a hymn on verse 1 leads one that takes the whole chapter (known,
accepted for now); a topic's name lists the hymns whose title holds its
words, then the hymns the Topical index lists under it, then the word
results. `About this hymn` opens
search with where a passage begins (`about.md`); a topic there opens the
home list's `Topics` tab instead (`browse.md`).

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
- `search-topic`: a topic's name finds the hymns whose title holds its words, then every hymn the Topical index lists under it, each once. `About this hymn`'s `Topics` row opens the `Topics` tab, not search (`browse.md`, `browse-topics`).
- `search-scripture`: a reference finds first the hymns the Scriptural index gives that verse (a range from its first verse, a chapter from verse 1), then the rest of the chapter's by verse distance; a book alone gives no reference hits. `About this hymn`'s `Scripture` row (`about-scripture`) opens search mode with where its passage begins as the query, its hymn among the first results: the find bar open at the list's foot with that query, the keyboard down.
- `search-open`: a result opens the hymn, with a back button `Hymns`. Back returns to the same results, at the row the reader left and with `Hymns about this` as it stood, and the keyboard stays down.
- `search-empty`: a query with no match shows the empty message. On a phone a query of known words with no text match shows `Hymns about this` alone instead; a made-up word such as `zzzz` knows no hymn by meaning and shows the empty message.
- `search-hermes`: each keystroke's search runs under 4 ms at the 95th percentile and under 8 ms at most in Hermes (`hermes-engine-cli` 0.12.0, the research harness over the app's own `src/hymns/search.ts`), and its index is built as search mode opens, never at the app's start.
- `search-in-hymn`: on a hymn page the find bar (`id=find-bar`) stands over the right end of the page's bar and holds `Search` (`id=find-search`) and then the `#` (`id=find-number`) by `x`; the bar's `Key`, `Tuner`, `Sound` and Play stay reachable under it. `Search` grows the bar into the focused box (`id=find-box`) with `Cancel` (`id=find-cancel`), as on the home list, and the results cover the page down to the window's foot: no node of the page (its heading, `Favourite`, the bar's marks) is in the tree while search is open. `Cancel` returns to the same page where it was, with its heading, the back button `Hymns` and `Search` in the bar; no route is pushed or popped.
- `search-in-hymn-open`: a result of the search on a hymn page replaces the page with its hymn, a folded find bar on it (`id=find-search`, no `id=find-box`), and closes the search: its query is empty and no results wait under any screen. `sim back` returns to the screen under the first page (the home list or Recent), with no `id=find-box` and no results; the first page opened again shows its folded find bar.
- `search-in-hymn-same`: a result of the hymn the page shows leaves the page in place and closes the search: `id=find-search`, no `id=find-box`; one `sim back` reaches the screen under it.
- `search-in-hymn-number`: on a hymn page, the `#` opens the drums (`id=find-drums`) over the bar, and `Open` on another dialled hymn replaces the page with it; `sim back` returns to the screen under it.
- `search-in-hymn-number-same`: on a hymn page, `Open` on the hymn the page shows closes the drums and leaves the page in place; one `sim back` reaches the screen under it.

## How to get to it (user POV)

- On a phone, `Search` in the find bar: at the home list's foot (`browse.md`, `browse-findbar-rest`, `browse-findbar-open`), where no search field stands at the list's top, and over the right end of a hymn page's bar, where it searches in place over the page; `Cancel` returns to the page where it was.
- On the web, the field above the home list.

## Driving it with sim

- **Preconditions:** the home list, not in search mode (`sim open / --expect "label=Hymns"`).
- **States:** default, empty, focus-visible (the search box). Open, loading and error are n/a.
- **Words:** a step that types a line builds it from the reader's own tree read in memory (`agent-device snapshot --json`, as `drive.ts` reads it) and prints numbers only; never write a hymn's words into a log, a note, a journey file or a command line kept in evidence.
- **Regression:** `apps/hymnal/src/hymns/search.test.ts`, `apps/hymnal/src/hymns/search.property.slow.test.ts` (every hymn by number and title, seeded half-remembered lines), `apps/hymnal/src/reader/rows.test.ts` and `apps/hymnal/src/reader/HymnList.native.slow.test.ts` (the found line in a result's row, and `Hymns about this` under the strongest five), `apps/hymnal/src/hymns/meaning.test.ts`, `apps/hymnal/test/browser/list.slow.test.ts`, the acceptance's `topic` and `scripture` rows (`search-topic`, `search-scripture`), `apps/hymnal/src/home/opening.test.ts` (push, replace or stay by every screen's path and every hymn) and `apps/hymnal/src/home/numreplace.slow.test.tsx` (a result and the `#` `Open` over the stack: push off a hymn page, replace or stay on one, Back, the search closed).

**The journey:** `sim journey search`. Search mode (`search`), the number forms `no 100`, `#100` and `Hymn #100` (`search-number`, `search-number-forms`), `hymns about the second coming` (`search-about`), `Psalm 23` (`search-scripture`), `no 100` again with no `Hymns about this`, open hymn 100 and back to the query (`search-open`, `query-kept`), `zzzz` (`search-empty`), `Cancel`, then on hymn 1's page, opened from its row on the home list: the find bar (`search-in-hymn`), `Search` with the page out of the tree, `100`, `Cancel` back to the page, `Search` and `100` again, its result in the page's place (`search-in-hymn-open`), on hymn 100 a search for `100` whose result leaves the page in place (`search-in-hymn-same`), one Back to the home list, hymn 1's row again with its find bar folded, and the `#`'s drums (`search-in-hymn-number`) with `Open` on the hymn they show, which leaves the page in place (`search-in-hymn-number-same`), and one Back to the home list. `Open` on another dialled hymn needs a drum turn, so it is driven by hand (step 6), with `Sounds and haptics` off.

Read in the receipts:

- `search-number`, `search-number-forms`, `search-number-hymn`: the first result row `100, …`.
- `search-about`: the heading `Hymns about this` after at most five rows; the rows after it, to `More matches`, none of those five; no number twice.
- `search-scripture`: the first rows' numbers, in order, equal the first numbers of `onVerse(19, 23, 1)` from the checkout (`apps/hymnal/src/hymns/indexes.ts`), printed as numbers only.
- `search-open`: the back button is `Hymns`.

By hand:

1. **A line (`search-line`, `search-typo`, `search-matched-line`).** Read the third line of hymn 100's `Stanza 2` from the tree in memory, enter search and type it with one letter of its longest word dropped. → `100, …` among the first five, its row taller than its neighbours (its `height` about 56 against 44): the matched line under the title.
2. **A title (`search-order`).** Type the first word of hymn 100's title, read from its row's name in memory. → the hymns whose titles hold it, in number order, each a one-line row.
3. **A topic (`search-topic`).** Fill the first topic of hymn 100 (`topicsOf(100)`). → every hymn the topic lists among the results, after the hymns whose title holds its words.
4. **Search on a hymn page** (`search-in-hymn`). `sim open hymnal://hymns/8 --expect id=find-bar`, then `sim snapshot`. → `id=find-bar` holds `id=find-search` left of `id=find-number`; its bottom above the page bar's top and its right end near the screen's right edge; `id=key-button`, `Sound` and `Play hymn 8` in the tree. `sim tap id=find-search` → `id=find-box` focused, `id=find-cancel` shown, and no `Play hymn 8`, `Favourite` or page heading in the tree. `sim fill id=find-box 100` → a link `100, …`. `sim tap id=find-cancel` → hymn 8's page again, with its heading, the back button `Hymns` and `id=find-search`.
   Steps 5 to 8 reach hymn 8 from its row on the home list (`sim open / --expect label=Hymns`, then tap the row `8, …`), never by deep link, so Back has a screen under the page (README, Baseline).
5. **A result from a hymn page** (`search-in-hymn-open`). On hymn 8, `sim tap id=find-search`, `sim fill id=find-box 100`, then `sim tap "role=link label=100, …"`. → hymn 100's page, `Play hymn 100`, `id=find-search` and no `id=find-box`. `sim back` → the home list, with no `id=find-box`, no `id=find-cancel` and no `Play hymn 8`. Tap the row `8, …` again → hymn 8's page with `id=find-search` and no `id=find-box`.
6. **The `#` on a hymn page** (`search-in-hymn-number`; `Sounds and haptics` off first, `player.md`). On hymn 8, `sim tap id=find-number` → `id=find-drums`, the drums on 8 (the page's hymn, else 1). Turn `Tens` one detent (`sim gesture pan "role=other label=Tens" 0 120 --ms 200`) and read the dialled number `n` from the raw snapshot. `sim tap id=find-open` → `Play hymn <n>`, no `id=find-drums`. `sim back` → the home list, no `Play hymn 8`.
7. **The page's own hymn by number** (`search-in-hymn-number-same`). On hymn 8, `sim tap id=find-number`, then `sim tap id=find-open` with no turn. → still `Play hymn 8`, no `id=find-drums`. `sim back` → the home list.
8. **The page's own hymn from search** (`search-in-hymn-same`). On hymn 8, `sim tap id=find-search`, `sim fill id=find-box 8`, then `sim tap "role=link label=8, …"`. → still `Play hymn 8`, `id=find-search`, no `id=find-box`. `sim back` → the home list.
9. **Over Recent.** From the home list's `See all` (Recent), tap a row → its page; step 5's search and `100` → `Play hymn 100`; `sim back` → Recent, not the first page.

## Gotchas

- Search opens on the screen whose find bar opened it, the home list or a hymn page, and belongs to that screen's path. On the home list (or any screen that is not a hymn page) a hymn opened from its results leaves it open beneath, and Back returns to the results. On a hymn page a result replaces the page, or is the page's own hymn and moves nothing, and either closes the search (`apps/hymnal/src/home/opening.ts`). There is no Search tab or `/search` route.
- A hymn page opened by deep link has nothing under it, so a replace there leaves Back nothing to return to; reach a page from a row to drive `search-in-hymn-open`, `search-in-hymn-same`, `search-in-hymn-number` and `search-in-hymn-number-same`.
- On iOS the find bar's controls carry ids: `id=find-search` enters search mode, `id=find-box` is the search box (named `Number, title or first line`) to fill, `id=find-cancel` leaves it.
- Results follow the typing after a deferral: wait for a result (`--expect`, or `sim tap` of the row with its timeout), never a fixed sleep.
- A result's name is `<n>, <title>` and, when it was found by a line, `, <line>` after it: match a result by its leading `<n>, ` only.
