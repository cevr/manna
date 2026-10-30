# Browse tabs

On a phone, the home list has a row of tabs under its search field:
`Sections`, `Lists`, `Topics`, `Metres` and `Scripture`. Each tab groups
the hymns its own way, a heading over each group: `Sections` by the
hymnal's sections (the list as it always was, under the `Recent` shelf),
`Lists` by the reader's `Favourites` and `Recent`, and the other three by
the back-matter indexes (`indexes.md`): the Topical index's topics, the
Metrical index's headings and the Scriptural index's books. A row opens its
hymn, and a swipe on its page pages the whole hymnal in number order, from
any tab. `All at once` zooms the list out to one tile per group of the tab
in use; a tile zooms back in at that group. On `Sections` a number rail in
a gutter at the list's right edge takes a tap or a drag to any hymn, with a bubble showing the
number and section under the thumb. The tab in use is kept across launches,
and each tab opens where the reader left it in this run of the app. A `#`
at the right of the floating bar (or alone where the bar docks, on the home
list with no hymn held) opens three number drums: the list scrolls to the
dialled hymn's row, `Open` opens it and `Play` plays it.

## Sub-features

- `browse-tabs`: under the field, a tab list of the five tabs, each a `tab` named by the tab (on iOS the snapshot lists it as `other`, Gotchas), the one in use `[selected]`; a tap on another tab shows its list with a `tab` cue (felt only), and a tap on the tab in use does nothing. A tab read from an index shows only when its index has an entry. At a large text size the row scrolls sideways. Each group's heading is a `heading` named by the group; under it each row is `<n>, <title>`, as in `hymn-list.md`.
- `browse-sections`: `Sections` is the list of `hymn-list.md`: the `Recent` shelf, then each section's heading over its hymns in number order.
- `browse-lists`: `Lists` shows the heading `Favourites` over the reader's favourites in number order, then `Recent` over the hymns opened last, newest first. A list with no hymn has no heading; the tab shows even when both are empty.
- `browse-topics`: `Topics` shows the Topical index's topics in printed order, each over its hymns. A topic row in `About this hymn` opens this tab with that topic's heading at the list's top (`about.md`, `about-topics`).
- `browse-metres`: `Metres` shows the Metrical index's headings, each over its hymns ascending.
- `browse-scripture`: `Scripture` shows the Scriptural index's books in the canon's order, each over its hymns ascending.
- `browse-all-at-once`: the title's `All at once` button, or a tap on a group's heading (its hint `Shows every group at once`), zooms out: a screen with the heading `<tab>, all at once` and `Done` over two columns of tiles, each a button `<group>, <n> hymns` (`1 hymn` for one; `, playing` after it for the group of the hymn the player has), with a strip of where its hymns lie from 1 to 695. The first row holds the group that was at the list's top. A tile zooms back in with its group's heading at the list's top; `Done` zooms back in where the list was. The zoom out and the zoom in are felt only (`zoom-out`, `zoom-in`). While it shows, the list beneath is out of VoiceOver's reach.
- `browse-rail`: on `Sections`, the rail is a 44 pt gutter at the list's right edge with six faint numbers from 1 to 695 drawn in it; every row and the pinned topic end before the gutter, so no number lies over a row and no row control (a title, a star, `See all`) lies under the rail. The rail takes a touch in the gutter at once, with no hold: a tap jumps the list to the hymn under the finger, and a drag shows the thumb in the accent and a bubble beside it with the hymn number and section under it; the list follows the thumb, and each section the drag crosses is one `rail-tick`, felt only. Release leaves the list there. While the rail is held the list does not scroll under the finger. A flick that starts left of the gutter is the list's.
- `browse-tab-kept`: the tab in use is a stored choice (`home.tab`, default `Sections`): a relaunch opens on it. Each tab's place is kept in memory only: back to a tab in the same run opens it where it was; a relaunch opens the kept tab at the list's top.
- `browse-number`: a button `Find a hymn by number` (a `#`) sits at the right, over the floating bar while the bar shows (`player.md`, `player-bar`). A tap opens three drums over it, adjustables `Hundreds`, `Tens` and `Ones`, with `Open` and `Play` under them; the button's accessibility state is expanded while they show. The drums are three vertical wheels side by side, left to right hundreds, tens, ones, like an iOS picker: the selected digit in the centre row, its neighbours above and below; their frames' x differ and their y are equal. The drums open on the bar's hymn, else on 1, and hold to 1–695: `Hundreds` stops at 0 and 6, `Tens` and `Ones` wrap. A drum is turned by a vertical swipe or fling, with the key dial's detent and fling (`chords-and-capo.md`, `chords-fling`), or by VoiceOver's swipe up and down, which says `<digit>, number <n>`. Each detent is the dial's thock and haptic (`feel.md`, `feel-cues`) while the player's `Sound` is on, and the haptic alone while it is off. While the drums show on the home list, the list scrolls to the dialled hymn's row (only an exact number; a number no row of the tab holds leaves the list where it is). `#` again, or a swipe down on the panel outside the drums (the gaps, the `Open` and `Play` row), closes them; a vertical swipe on a drum, its title included, turns it and leaves the panel open.
- `browse-number-open`: `Open` opens the dialled hymn's page (`/hymns/<n>`) and closes the drums.
- `browse-number-play`: `Play` starts the dialled hymn as the page's Play does (`player.md`, `player-swap-page`): it replaces the held hymn, sounds as `Sound` says, and closes the drums. A detent never starts a hymn.
- `browse-number-idle`: with no hymn held, the home list shows the `#` alone at the right where the bar docks. No other screen shows it with no hymn held, and the list's end leaves room under it, so the last row is never under the `#`.

## How to get to it (user POV)

- The home screen's tab row, under the search field at the list's top (`hymn-list.md`).
- The title's `All at once` button, beside `Settings`; or a tap on a group's heading in any tab.
- A tap, or a drag, in the gutter at the right edge of the `Sections` list.
- A topic row in `About this hymn` (`about.md`), which opens `Topics` at that topic.
- `Find a hymn by number` at the right of the floating bar, or alone at the foot of the home list with no hymn held.

## Driving it with sim

- **Preconditions:** the list at its top, so the tab row is on screen (`sim open /` on a fresh launch); for `browse-lists`, one hymn starred and one opened (`hymn-list.md`, steps 6 and 8); `Sounds and haptics` on for the cue lines (`feel.md`).
- **States:** default, open (`All at once`, the drums), empty (`Lists` with no hymn: no heading). Focus-visible, loading and error are n/a (the hymns and indexes are compiled in).
- **Regression:** `apps/hymnal/src/home/tabs.test.ts` (every tab's groups, tiles, `groupAt`), `apps/hymnal/src/home/TabRow.test.tsx`, `apps/hymnal/src/home/open.test.ts` (a row of every tab opens its hymn and pages in number order), `apps/hymnal/src/reader/rail-marks.test.ts`, `apps/hymnal/src/reader/pin.test.ts` (`topicStart`), `apps/hymnal/src/reader/About.test.tsx` (a topic row opens `Topics`), `apps/hymnal/src/feel/feel.test.ts` (the `tab`, `zoom-out`, `zoom-in` and `rail-tick` cues), `apps/hymnal/src/player/drums.test.ts` (each drum's digits, walls and wrap, the fling, a detent's thock or haptic by `Sound`, the dialled hymn's row), `apps/hymnal/src/player/bar.test.ts` (the find drums: `#`, a dial, `Open`, `Play` and the swipe down; where the `#` shows; the list end's room).
- **Step 9 changes a stored choice:** put `Sections` back at the end.
- **Sound:** steps 10 to 13 turn no drum and press no `Play` while the player's `Sound` is on; a drum's detent sounds with it on.

**The journey:** `sim journey browse`. The five tabs (`browse-tabs` to `browse-sections`), `All at once` and `Done`, the drums opened, closed and opened again (`browse-number`, `drums-close`, `drums-again`), `Open` from the drums and back home (`browse-number-open`, `back-home`), then `Topics` kept across a reopen (`tab-topics`, `browse-tab-kept`) and `Sections` put back (`tab-put-back`). The steps below are what to read in its receipts, and what it cannot drive (a row's pager, a drum's turn, the rail).

1. **The tabs** (`browse-tabs`). `sim open /`, then `sim snapshot tabs`. → the snapshot lists `Sections` `[selected]`, `Lists`, `Topics`, `Metres`, `Scripture` in one row under the field (`other` elements on iOS, `tab` on the web).
2. **Another tab** (`browse-topics`). `sim tap "label=Topics"`. → `ok`; the snapshot shows `Topics` `[selected]` and a `heading` named by the Topical index's first topic over rows `<n>, …`. Repeat with `Metres` and `Scripture` (`browse-metres`, `browse-scripture`): a `heading` named by a metre, then by a book.
3. **Lists** (`browse-lists`). `sim tap "label=Lists"`. → `ok`; with the preconditions, the headings `Favourites` and `Recent`, each over its rows; on a fresh install, no heading.
4. **Sections** (`browse-sections`). `sim tap "label=Sections"`. → `ok`; the snapshot shows the `Recent` shelf (when Recent has a hymn) and the first section's heading over `1, …`.
5. **A row and its pager.** On `Metres`, tap a row by its leading number, then swipe left (`sim scroll screen right`). → the reader shows the next hymn by number, not the next row of the group.
6. **All at once** (`browse-all-at-once`). `sim tap "role=button label=All at once"`. → `ok`; the snapshot shows the heading `<tab>, all at once`, `Done`, and buttons `<group>, <n> hymns`. `sim tap "label=Done"`. → the list where it was.
7. **A tile.** Open `All at once` again from a group's heading (`sim tap "role=heading label=<group>"`), then tap another tile by its whole label. → the list with that tile's group heading at its top.
8. **The rail** (`browse-rail`). On `Sections`, pan down 400 pt over 300 ms from the gutter at `<width - 22>` (a pan by coordinates, Gotchas; the rail takes it at once, no hold). → the list has moved down to a later section (`sim snapshot`), and the app log holds no `[feel] play` line for the ticks (felt only). A row tap near the gutter's left edge (`<width - 50>`) opens that row's hymn, not the rail. The bubble cannot be read from the tree (Gotchas).
9. **The tab is kept** (`browse-tab-kept`). `sim tap "label=Topics"`, relaunch (`sim open /` after a `sim install`, or quit and open the app). → `Topics` `[selected]` at the list's top. Put `Sections` back.
10. **The `#` alone** (`browse-number-idle`). On a fresh install, with no hymn held, `sim open /`, then `sim snapshot number-idle`. → a button `Find a hymn by number` and no region `Player`. `sim scroll screen down` to the list's end. → the last row's `rect` ends above the button's. `sim open hymns/100`, then `sim back` with nothing played. → the home list's button again. `sim open settings --expect label=Dark`, then `sim snapshot`. → no button `Find a hymn by number`.
11. **The drums** (`browse-number`). `sim open /`, then `sim tap "label=Find a hymn by number"`. → `ok`; the snapshot lists the adjustables `Hundreds`, `Tens` and `Ones` and the buttons `Open` and `Play`, and in the raw snapshot the three adjustables stand side by side: their frames' x differ and their y are equal. `sim tap "label=Find a hymn by number"` again. → the drums are gone. To turn a drum, first turn the player's `Sound` off (`player.md`), then swipe a drum up or down (`sim gesture pan label=Tens 0 120 --ms 200` swipes `Tens` down from the drum's middle) or use VoiceOver's swipe up on it; → its value moves one digit a detent, the list's rows move to the dialled hymn's row, and the drums stay open. Open the drums again and swipe down on the panel outside the drums (`sim gesture pan id=find-open 0 120 --ms 200`, from `Open` in the `Open` and `Play` row; a swipe on a drum, its title included, turns it). → the drums are gone.
12. **Open** (`browse-number-open`). Open the drums, then `sim tap "label=Open"`. → the reader shows `Stanza 1` of the dialled hymn (1 on a fresh install), and the drums are gone.
13. **Play** (`browse-number-play`; once, with the player's `Sound` off). Turn `Sound` off first (the bar's `Sound` on a hymn page, `player.md`), back on the home list open the drums, then `sim tap "label=Play"`. → the bar shows `Pause hymn <n>` for the dialled hymn, and the drums are gone. `sim tap "label=Pause hymn <n>"` after.

## Gotchas

- The tab row is part of the list's content, under the field: it scrolls away with the rows. Drive a tab from the list's top; deep in the list, a tab tap answers `TargetMissing`.
- On iOS a tab is not a `tab` in the snapshot: React Native 0.88 gives the `tab` role no iOS trait (VoiceOver reads the role from the value), so the runner lists each tab as `other`, with `[selected]` on the one in use. `role=tab` answers `TargetMissing` there; match a tab by its label alone (`label=Lists`) or as `role=other label=Lists`. `role=tab` matches on the web.
- The `Recent` heading under `Lists` and the Recent shelf's header share a name: match them as `role=heading label=Recent`.
- The rail and its bubble are hidden from the accessibility tree, so `sim tap`, `sim snapshot` and VoiceOver never find them. Drive the rail with a pan by coordinates at the screen's right edge, and read where the list landed from the snapshot's rows. VoiceOver readers move through the hymns by the headings, the tabs and `All at once`.
- The rail is a 44 pt gutter at the right edge, and the rows end before it: a pan or tap that starts more than 44 pt from the edge is the list's, and one inside the gutter is the rail's from its first point (a tap jumps the list, a pan drives it). A plain pan by coordinates in the gutter drives the rail; no hold is needed. `sim gesture pan` and `sim hold` start only from a target's centre, and the rail is no target, so a pan by coordinates in the gutter needs another driver (not yet proven here).
- A tile's label holds its count: match the whole label, `<group>, <n> hymns`, read from the snapshot first.
- `All at once` covers the list: while it shows, the snapshot lists only its heading, `Done` and the tiles.
- Topic, metre and book names hold no hymn words, but a row's label holds its title: match a row by its leading `<n>, ` and keep titles out of logs.
- Android's Back does not close `All at once` (iOS is the target).
- A drum's detent is the only touch on the drums that sounds: turn a drum or press `Play` only with the player's `Sound` off, and never on a shared room's speakers.
- The `#` with no hymn held is on the home list only: on a hymn page it rides the page's own bar, and on `Settings` there is none. Read the home list for step 10.
