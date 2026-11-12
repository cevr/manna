# Passages: the field's lists, the chooser, Plant and Remove

The reader chooses what to learn (`apps/heartseed/src/chooser/screen.tsx`,
the range rule `apps/heartseed/src/chooser.ts`, the field
`apps/heartseed/src/field/screen.tsx`). The free tier holds 3 passages or
Handbook lists together, a passage of up to 20 verses, from the whole KJV
in the bundle.

- **The field's lists** sit in the field's scroll view under the label
  `Lists`: `Add a list` (`id=add-list`) while fewer than 3 passages and
  Handbook lists are held together (`handbook.md`), else the line
  "3 passages or lists, the most for now. Remove one to add another."
  (testID `limit`). `Add a list` opens the Add a list sheet over home
  (`home.md`), whose `Any passage` opens the chooser. With the reader's passages unread
  it offers neither, and no list's page offers `Remove`.
- **The rows**: the promise's (`Isaiah 41:10`), then each passage held in
  the order chosen, titled by its reference (the button `Open
  <reference>`), each verse a plant button
  labelled `<verse reference>, <stage>`, then every other plant, one verse each, in
  the order first sown; an old piece folds into its verse (`phrase.md`). Home
  holds no `Remove`: each passage's own page (`list.md`), and no other
  passage-like page, holds `Remove <its reference>` (shown `Remove this
  list`) at the list's end.
- **Remove asks once**, in that button's place on the page: "Remove
  <reference>? Its plants stay in your field." (testID `ask`) with
  `Remove` and `Keep`. On `Removed` home shows without the row; a remove
  that does not land keeps the page and leaves the alert "<reference> was
  not removed. Try again." (testID `remove-alert`).
- **The chooser** is the root's third screen, in place, opened at its
  books step. Its fixed header holds one way back and the step's one
  heading: `‹ Add verses` (back to the sheet) over `Add a passage` (the labels `Old Testament`
  and `New Testament`, then the 66 books), `‹ Books` over the book (its
  chapters), `‹ Chapters` over `<Book> <chapter>` (every verse, each a
  checkbox named by its reference). A back to the chapters or the books
  clears the range.
- **The range**: a first tap chooses one verse; a second tap on another
  verse of the chapter makes the range between them, clipped to 20 verses
  from the first; a tap on the one verse chosen clears it; a tap on a
  range of more than one verse starts again from that verse.
- **The footer**, fixed under the verses: the range's reference (testID
  `chosen-reference`) and count (`chosen-count`, `1 verse` or
  `<n> verses`), `Up to 20 verses`, `Plant`, and the plant's line. `Plant`
  on `Added` shows the field with the new row last among the passages; on
  `Full` the limit line, on any other answer "<reference> was not planted.
  Try again.", the range kept.
- **One change at a time**: from a tap of `Plant` or of the ask's `Remove`
  until its answer, the other controls of that screen do nothing and show
  as disabled.
- **Today** makes its plan again at each landed add or remove: on a day a
  verse was first planted (the first minute's day among them) no new piece
  shows; after the next 04:00 local the first piece no plant names is new,
  with `Listen` and `Say it`: a verse, whole, long or short (`phrase.md`). A verse whose recital is under way when its
  passage is removed stays on Today until `Next`.
- Nothing is stored but the reader's passages, at a landed add or remove
  (their key: `apps/heartseed/README.md`, Passages).

## Sub-features

- `passage-bar`: on the field, `Lists` and one `Add a list` sit in the
  scroll view, and no `When I need…` and no `Add verses` anywhere.
- `passage-books`: `Add a list`, then the sheet's `Any passage`,
  shows the heading `Add a passage`, `‹ Add verses`, `Old Testament`,
  `New Testament` and the books.
- `passage-range`: `John` → `John 15` → taps on 1 and 5 show
  `John 15:1-5`, `5 verses`, `Up to 20 verses` and `Plant`, with `Plant`
  above the home indicator.
- `passage-clip`: `Psalms` → `Psalms 119` → taps on 1 and 30 show
  `Psalms 119:1-20` and `20 verses`.
- `passage-plant`: `Plant` shows the field with the row `John 15:1-5`
  (`Open John 15:1-5`), five `John 15:<n>, not planted` plants, and no
  `Remove` on home.
- `passage-limit`: after two more passages, no `Add a list`, and the line "3 passages or lists, the most for
  now. Remove one to add another."
- `passage-remove`: a row's `Open <reference>` → its page's `Remove
  <reference>` → the ask → `Remove`: home shows without the row, and
  `Add a list` comes back.
- `passage-keep`: `Open <reference>` → `Remove <reference>` → `Keep` puts
  `Remove <reference>` back and changes nothing.
- `passage-day-one`: back on home, on the first minute's day, the Today
  card's parts line holds no `1 new`, and Today, if `Start` opens it, no
  `Listen`.
- `passage-relaunch`: a relaunch opens home, and the field shows the
  passages kept.
- `passage-new` (the second session, after the next 04:00 local, with no
  uninstall): Today offers `John 15:1` whole (11 words; after the
  promise's review, if due) with `1 new`, `Listen` and
  `Say it`. This is `wake.md`'s
  `wake-listen` live, and its phone follow-up (the voice handing over to
  the recognizer after `Listen`).
- `passage-launch-time`: the time from launch to the pending frame
  (`sim open / --expect "label=Isaiah 41:10"`), on base and on head, three
  runs each: the corpus's cost in the dev bundle. Hermes on a phone is the
  phone build's check.
- `passage-fail` (tests only: a refused write cannot be driven):
  `apps/heartseed/src/chooser/walk-*.test.tsx`,
  `src/field/bar-*.test.tsx`, `src/chooser/reader-*.test.tsx`, and the
  acceptance check's W1.
- `passage-unread` (tests only: unread passages cannot be driven):
  `src/field/bar-kinds.test.tsx`, `bar-lists.test.tsx`, and the acceptance
  check's F4.
- `passage-held-remove` (tests only: no screen reaches it, since the
  page's controls are disabled while a remove is pending):
  `src/session/held.property.test.ts`, and the acceptance check's F1.

## How to get to it (user POV)

- On home (the field), tap `Add a list`, then `Any passage`: a book, a chapter,
  the first verse and the last, then `Plant`.
- On the field, a passage row's `Open <reference>`, then on its page
  `Remove <reference>` (shown `Remove this list`), then `Remove` or `Keep`
  in the ask in its place.

## Driving it

`RUN=hspassage-l1` (or the run's own name), `EVIDENCE=$PWD/tmp/verify/$RUN`,
a free `PORT` of 8280-8289, `sim` = `bun run --cwd apps/heartseed sim`, and
`START` the drive's start time, local and UTC. Nothing native changes for
passages, so an install of a build of `69d70a02d` or later serves
(`SKILL.md`, Launch); the JavaScript comes from the dev server. The garden
must start empty: uninstall by udid as `first.md` says.

1. `first.md` steps 1-7: boot, uninstall, install, revoke the microphone,
   and the first minute to `first-home`.
2. `passage-bar`: on home, `sim snapshot passage-bar`
   → the text `Lists`, one button `Add a list` (`id=add-list`), no
   `When I need…` and no `Add verses`, the heading `Your field`, the row
   `Isaiah 41:10` (the button `Open Isaiah 41:10`) and no `Remove`, no
   button `Today`.
3. `passage-books`: `sim tap "id=add-list"`, `sim tap "label=Any
   passage"`, `sim snapshot passage-books` → the heading `Add a passage`,
   the button `Add verses` showing `‹ Add verses`, no button `Your field`, the texts `Old Testament` and
   `New Testament`, and the buttons `Genesis` and `Revelation`.
4. `passage-range`: `sim tap "label=John"`, `sim tap "label=John 15"`,
   `sim tap "label=John 15:1"`, `sim tap "label=John 15:5"`,
   `sim snapshot passage-range` → the heading `John 15`, `John 15:1-5`,
   `5 verses`, `Up to 20 verses`, a button `Plant`; a raw snapshot →
   `Plant`'s rect inside the window and above the home indicator's area.
5. `passage-clip`: `sim tap "label=Chapters"`, `sim tap "label=Books"`,
   `sim tap "label=Psalms"`, then `sim scroll screen down` until
   `Psalms 119` shows (a snapshot after each scroll), `sim tap
   "label=Psalms 119"`, `sim snapshot passage-clip-top` → `Psalms 119:1`
   the first verse shown, with nothing hidden above it (each step opens at
   its top, whatever the last step's scroll), `sim tap "label=Psalms
   119:1"`, then `sim scroll screen down` until `Psalms 119:30` shows,
   `sim tap "label=Psalms 119:30"`, `sim snapshot passage-clip` →
   `Psalms 119:1-20`, `20 verses`, `Plant`.
6. Back to John 15:1-5: `sim tap "label=Chapters"`,
   `sim tap "label=Books"`, then step 4's taps from `John`.
7. `passage-plant`: `sim tap "label=Plant"`, `sim snapshot passage-plant` →
   the heading `Your field`; the buttons `Open Isaiah 41:10` then
   `Open John 15:1-5`; five buttons `John 15:<n>, not planted` (n 1-5); no
   button named `Remove` or starting `Remove `; one `Add a list`.
8. `passage-limit`: two more passages through `sim tap "id=add-list"`
   and `sim tap "label=Any passage"` (for example `Psalms` → `Psalms 23` → `Psalms 23:1`, then `sim scroll screen
   down` until `Psalms 23:6` shows clear of the footer (it can sit partly
   under it), `Psalms 23:6`, `Plant`; then on the books `sim scroll screen
   down` until `Romans` shows, `Romans` → `Romans 8` → `Romans 8:28`,
   `Plant`; a snapshot after each scroll, then the tap),
   `sim snapshot passage-limit` → the buttons `Open John 15:1-5`,
   `Open Psalms 23:1-6` and `Open Romans 8:28`, no `Remove`, no
   `Add a list`, and the limit line's text.
9. `passage-keep`: `sim tap "label=Open Psalms 23:1-6"`, `sim tap
   "label=Remove Psalms 23:1-6"`, `sim snapshot passage-ask` → `id=ask`
   with the ask's text, `Remove`, `Keep`; then `sim tap "label=Keep"` →
   `Remove Psalms 23:1-6` back and no `id=ask`; `sim tap "label=Your
   field"`, `sim snapshot passage-keep` → as step 8.
10. `passage-remove`: `sim tap "label=Open Romans 8:28"`, `sim tap
    "label=Remove Romans 8:28"`, `sim tap "label=Remove"`, `sim snapshot
    passage-remove` → home: no `Open Romans 8:28`, the buttons `Open John
    15:1-5` and `Open Psalms 23:1-6`, no `Remove`, one `Add a list`.
11. `passage-day-one`: on home, `sim snapshot passage-day-one` → the
    Today card's parts line holds no `1 new`. When the card offers `Start`
    (the promise's review due), `sim tap "label=Start"`,
    `sim open / --expect "id=session" --no-relaunch`, `sim snapshot passage-day-one-today`
    → no `Listen`; then `sim tap "label=Your field"`.
12. `passage-relaunch`: `sim relaunch`, `sim open / --expect "id=today-card"`,
    `sim snapshot passage-relaunch` → the heading `Your field` and the rows'
    buttons `Open Isaiah 41:10`, `Open John 15:1-5`, `Open Psalms 23:1-6`,
    in that order.
13. `passage-launch-time`: three times, `sim relaunch` then
    `sim open / --expect "label=Isaiah 41:10"`, recording each line's `ms`,
    with `sim doctor`'s `timingsHold`; then the same three on a worktree of
    `69d70a02d`, on its own port. Report the six numbers and the load.
14. `sim doctor` (record `head` and `timingsHold`) and `sim down`, keeping
    the install.
15. `passage-new`, the second session, after the next 04:00 local, with no
    uninstall: `sim boot`, then `sim open / --expect "id=today-card"` → the Today
    card's parts line holds `1 new`, with `Start`; `sim tap "label=Start"`,
    `sim open / --expect "id=session" --no-relaunch`,
    `sim snapshot passage-new` → the counts line holds `1 new`; when the
    reference is `Isaiah 41:10` (its review due), run it through `Say it`
    and `Next` first, then snapshot again → the reference `John 15:1`,
    `Listen` before `Say it`. Tap `Listen` and record whether the voice
    hands over to the recognizer when `Say it` follows (on the phone; the
    simulator's voice is silent). Then `sim doctor` and `sim down`.

Report only counts, booleans, rect numbers, the labels named above, the
counts line and the references; delete the `snapshots` folder and the raw
snapshots.

## Gotchas

- The chooser's verses are one scroll view of the whole chapter (176
  verses in Psalms 119), never a virtualized list: a verse below the
  window needs a `sim scroll`, and `Plant` never does. So do a book past
  the first screen of the books (`Romans`), a chapter past the first
  screen of a book's chapters (`Psalms 119`), and a verse partly under the
  footer (`Psalms 23:6`). Each step opens at its top, so a scroll on one
  step never carries into the next.
- A scroll just before a tap can leave the scroll view moving, and the tap
  may then stop the scroll instead of pressing: snapshot after the scroll,
  then tap.
- The simulator's clock cannot be set: the second day is `passage-new`,
  after the next 04:00 local, and every zone and day after it are the
  tests' (`src/chooser/reader-*.test.tsx`).
- Home's one add is `Add a list` (`id=add-list`), in the scroll view;
  on the chooser, `label=Add verses` is its back to the sheet.
- A refused write, unread passages, a double tap in one turn and a remove
  under way are the tests' alone (`passage-fail`, `passage-unread`,
  `passage-held-remove`).
