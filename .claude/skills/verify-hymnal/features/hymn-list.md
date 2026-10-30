# Hymn list

The Hymns tab lists all 695 hymns, one row each: the number and the title.
A press on a row opens the hymn. On a phone, the reader's latest five hymns
come first under a `Recent` header that opens all of Recent, and each of the reader's favourites has a
star at the end of every row it has, after its title and the size of its number. The list keeps its scroll offset
when the reader opens a hymn and comes back, or switches tabs and returns.

## Sub-features

- `list-rows`: every row is one line, number and title, named `<n>, <title>` (`<n>, <title>, favourite` for a favourite on a phone).
- `list-open`: a press on a row opens that hymn.
- `list-place`: back from a hymn, or back to the tab, the list is where it was.
- `list-favourites`: on a phone, a hymn starred on its page (the head's `Favourite` button) shows a star at the row's end, after its title and the size of its number, in each of its rows, under `Recent`, under its topic and on the Recent screen; a long title's ellipsis comes before the star, and a row with no star keeps the title's full width; and VoiceOver reads the row as `<n>, <title>, favourite`. The list has no `Favourites` row. Kept across launches (`lists.favourites`).
- `list-recent`: on a phone, the hymns opened last show first under a `Recent` header, most recent first, at most 5 there; Recent keeps the latest 50, across launches (`lists.recent`). A row pressed under `Recent` opens its hymn, and a swipe there pages in number order, as from any home row.
- `list-search-reveal`: on a phone, deep in the list (past the search field's resting place under the title), an upward scroll of 8 pt or more, a drag or its glide, slides the search field `Number, title or first line` in over the list's top, under the status bar, as Safari's toolbar comes back. The list's rows and offset do not move for it.
- `list-search-hide`: once shown, a downward scroll of 8 pt or more slides it away again; while hidden it is out of VoiceOver's reach and takes no touch. While shown a tap on it enters search mode, as the field at the top does, and Cancel brings the list back where it was, the field still shown.
- `list-search-top`: at the list's top the field sits where it always has, under the title (pull down to bring it out); the shown field goes under the title as the list nears its top, out of touch and VoiceOver's reach while the title covers it, and is never a second field there.
- `list-search-pin`: the pinned topic row sits flush under the shown field, moves down and up with it as it slides, and never jumps or hides under it.
- `list-recent-all`: the `Recent` header is a button, named `Recent, see all` and showing `See all ›`; it pushes the Recent screen (`/recent`, title `Recent`), every hymn Recent keeps, most recent first, a favourite starred. A row there opens its hymn, a swipe pages through that whole list, and a pan from the left edge goes back to it; its back button `Hymns` goes home. With nothing opened it says `The hymns you open show here.`

## How to get to it (user POV)

- The app's first screen.
- The `Hymns` tab.
- The back button `Hymns` on a hymn opened from the list.
- The link `hymnal://` (iOS) or the route `/` (web).
- The Recent screen: the `Recent` header's `See all ›` on a phone's home list, or the route `/recent`.

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default. Focus-visible, open, loading, empty and error are n/a (the hymns are compiled in).
- **Regression:** `apps/hymnal/test/browser/list.slow.test.ts`, `apps/hymnal/src/reader/back.test.tsx`; the lists: `apps/hymnal/src/reader/pager.slow.test.ts` (the reader's lists, the Recent header and screen), `apps/hymnal/src/reader/lists.test.ts`, `apps/hymnal/src/reader/rows.test.ts`, `apps/hymnal/src/settings.test.ts`, the field over the list's top: `apps/hymnal/src/home/reveal.test.ts` (when it turns) and `apps/hymnal/src/reader/pin.test.ts` (the pin under it), `apps/hymnal/src/feel/feel.slow.test.tsx` (the `section` cue as a topic takes the pin, and `Favourite`'s chimes).

**The journey:** `sim journey hymn-list`. The first screen (`hymn-list`), a scroll to row 31, open it and come back to the same place (`back-keeps-place`), then the field over the list: to the top, four screens down until it is gone (`list-search-hide`), one up until it shows (`list-search-reveal`), a tap into search mode and `Cancel`. It opens hymn 31, which joins `Recent` (data, not a stored choice).

Read in the receipts:

- `scroll` and `back-keeps-place`: the same rows on screen; not `1, Praise to the Lord` at the top.
- `list-search-reveal`: one node named `Number, title or first line`, its `y` just under the status bar (about 70 on an iPhone 17 Pro), the first row's `y` below its bottom.
- `search-cancel`: the same first row as before the tap, the field still shown.

By hand (these change the app's data; the lists stay until the app is reinstalled or erased):

1. **Favourite.** Open hymn 3, `sim tap "role=button label=Favourite"` → `Favourite` `[selected]`. `sim back` → the list starts `Recent`, then `3, …, favourite`; no row named `Favourites`. Under its topic the row is `3, …, favourite` too, and `sim shot` shows a star at its right end, as tall as the number.
2. **Recent, five.** Open hymns 1, 2, 4, 5 and 6 from the list, each with `sim back`. → `Recent` lists `6, …`, `5, …`, `4, …`, `2, …`, `1, …`; hymn 3 not among them, its row under its topic still starred. `sim relaunch` → the same.
3. **A list's pager.** Press the `5, …` row under `Recent` by its ref (`agent-device press @eN --session verify-hymnal`: the label also names the row under its topic), then `sim scroll screen right`. → hymn 6, the next in number order, not 4.
4. **Place with a new Recent row.** Deep in the list, read a row's `y`, open a hymn not yet in Recent, `sim back`. → the row's `y` unchanged; from the top, the new hymn first under `Recent`.
5. **See all.** `sim tap "role=button label=Recent, see all"`. → the header `Recent`; every hymn opened, most recent first, hymn 3 starred. Press its `4, …` row, `sim scroll screen right` → hymn 2; twice more → 1, then 3. `sim gesture edge-pan` → the Recent screen, led by the hymn last shown. `sim back` → home.
6. **The pin (`list-search-pin`).** On a Release build, `bun scripts/sticky.ts` (SKILL.md, Helpers): the pinned topic row off by no more than 1 pt in any frame, flush under the shown field. Without a recording, `pin.test.ts` holds the rule and `HymnList.native.slow.test.ts` holds the pin to the field's cover.

## Gotchas

- A favourite's row name ends `, favourite`: a `--expect` on `label=<n>, <title>` alone misses it once the hymn is starred. Take the star off (by hand 1 again) at the end of the drive.
- On iOS a row's link and its group share one name: a target without `role=link` fails with `AMBIGUOUS_MATCH`.
- On a hymn opened from the list, `Hymns` names both the back button and the tab (`role=button label=Hymns` is `AMBIGUOUS_MATCH` on iOS): go back with `sim back`, and use the tab only from another tab.
- On the web a screen is mounted anew when the reader returns, so a place kept on the web is the app's own restore, not a cached view: check it after the list has drawn (`--expect`), never after a fixed sleep.
- The `Recent` header scrolls away with its rows: it is not pinned as a topic's row is, so tap it from the list's top.
