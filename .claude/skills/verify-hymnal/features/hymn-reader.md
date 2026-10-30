# Hymn reader

A hymn shows its topic as a quiet line, its number and title in one row
under it (the number first), and its words in the order they are sung: each stanza under its number, and the refrain
written out each time it is sung. The words scroll; the header keeps the
title and a back button to where the reader came from. On a phone a swipe
turns to the next or the previous hymn of the list the reader opened it
from, and a pan from the screen's left edge goes back. The header holds no
button: the reader's settings are in the player sheet the bottom bar opens
(`Open player`, or a swipe up on the bar): the text size dial, font, line
spacing and keep screen on, each kept across launches. A printed line that wraps hangs: its
later rows sit one indent right of its first.

## Sub-features

- `reader-head`: the topic above (a button, `About this hymn`, that opens the sheet of hymns like it: `about.md`), then the number and the title side by side, the number left of the title.
- `reader-words`: stanzas in order, each a group named `Stanza <n>`, the refrain a group named `Refrain` after each stanza.
- `reader-syllables`: with chords off, a sung line shows its syllables, a muted hyphen between the syllables of a word and the words a space apart, each word kept on one row; the line reads as one element named by its whole words. A Plain part shows its words alone.
- `reader-scroll`: the words scroll to the last stanza and back, inside a page as tall as the pager on every page, the open one and its neighbours.
- `reader-back`: the header's back button returns to the list or the search it came from, in one press however many pages were swiped, and the list is at its place.
- `reader-pager`: on a phone, a swipe left or right turns to the next or previous hymn of the list the hymn was opened from (the home list in number order, its Recent rows too; a search's results; the Recent screen's whole list; every hymn in number order for a link); the header and the page head name the hymn shown. A pan from the left edge goes back on any hymn, after a list press and after a swipe; a pan from mid-screen turns the page.
- `reader-text`: the player sheet (`Open player`) holds the group `Reading`: the `Text size` dial (adjustable, its value the share, `100%`; it stops at each end), `Font` and `Line spacing` radio groups and `Keep screen on`; the page behind follows at once, chords included. The header holds no `Aa` and no `Chords` button.
- `reader-indent`: a wrapped line's later rows start at least one indent (1.25 times the words' size) right of its first.
- `reader-awake`: with `Keep screen on` on, the screen stays on while a hymn page is shown.

## How to get to it (user POV)

- A row of the Hymns list.
- A result of Search (its back button then reads `Search`).
- A swipe from the hymn before or after it in the same list (phone only).
- The link `hymnal://hymns/<n>` (iOS) or the route `/hymns/<n>` (web); from search, `/search/<n>`.

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default. Focus-visible, open, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/reader/reader.slow.test.tsx`; the pager and its left edge in `apps/hymnal/src/reader/pager.slow.test.ts`; the header on every way in, `apps/hymnal/src/reader/header.test.ts`; back on the web, `apps/hymnal/src/reader/back.test.tsx`; the reading sheet, the page's text, the hanging indent and keep-awake in `apps/hymnal/src/reader/reading.slow.test.tsx`.

**The journey:** `sim journey hymn-reader`. Hymn 100 by deep link (`hymn-reader`), a scroll to `Stanza 3` and back, the player sheet (`reading`) scrolled down to its reading settings (`reading-controls`) and closed by its grabber (`reading-close`), a relaunch to the list (`list`), hymn 3 from the list, a swipe to 4 and back to 3 (`sim scroll screen right` and `left`), `sim back` to the list (`reader-back`), hymn 3 again and a pan from the left edge back to the list (`left-edge`), then hymn 100's syllables (`reader-syllables`).

Read in the receipts:

- `hymn-reader`: `100`, `Great Is Thy Faithfulness`, `Stanza 1`, `Refrain`; on iOS the open line's `detail.prompts` is 0 or 1.
- `reading-controls`: the group `Reading`: `Text size` `100%`, `Font` (`System` checked), `Line spacing` (`Normal` checked), `Keep screen on` off.
- `swipe-next`: the header title and `id=hymn-number` read 4.
- `reader-back` and `left-edge`: the Hymns list at its place, not hymn 3 or 4.
- `reader-syllables`: `id=syllable-1-1-1` beneath a `line` (each word one text named by its first syllable); the shot shows muted hyphens inside words and no word split across rows.

By hand:

1. **The head.** `sim open hymns/15 --expect "label=Stanza 1"`, then the frames from `agent-device snapshot --json` (the topic, the number, the title). → `number.x + number.width <= title.x`, their vertical centres within half a line, the topic above both. Read the frames only, then trash the snapshot.
2. **Page height.** On hymn 100, the `rect` of every `hymn-scroll` from the raw snapshot. → each as tall as its `pager-page` (670 pt on a 402 pt wide simulator with the bar under the pager), not as its words.
3. **Largest text.** In the player sheet, `sim gesture pan id=dial-size -300 0 --ms 200`. → `188%`; close the sheet; the page's words and chords larger. At that size, on a hymn with a long line, the second row's first word lies at least one indent (40 pt) right of the line's first word. Read the frames only.
4. **Kept.** `sim tap Serif`, `sim tap Roomy`, `sim relaunch`, open the player sheet again. → the same size, `Serif` and `Roomy` checked. Put each back (`Text size 100%`, `System`, `Normal`, `Keep screen on` off).
5. **A search's pager.** Search `3`, open the second result (30), `sim scroll screen right` → 31, the third result. `left` twice → 30, then 3 (not 29). `sim back` → the results, `3` kept.
6. **The left edge, everywhere** (the owner's rule: "if we swipe directly at the left edge, it should go back"). `sim gesture edge-pan` after two swipes (4 → 3 → 2), on hymn 1 with `--y 750`, on a deep link to 600 with `--y 200`, and with the bar docked (a hymn playing, `Sound` off) with `--y 812`: each goes back. A pan from `x` 30 (`sim gesture pan 30,437 300 0 --ms 500`) turns the page instead.
7. **A link's pager.** `sim open hymns/600 --expect label=600`, `sim scroll screen right` → 601 at once, no jump on the first frame.

## Gotchas

- Hymn 100 has three stanzas, so `label=Stanza 4` is a `TargetMissing`, not a defect.
- A deep link opened while an earlier iOS prompt is unanswered stacks prompts; `sim open` answers up to three. A snapshot that shows only the alert means a prompt is still up.
- The player sheet opens at half the screen (detents 0.5 and 1, `app/(hymnal)/_layout.tsx`): the bar's controls, `Position`, `Chords` and the dials show, and the `Reading` group lies below the fold. Scroll to `Keep screen on` first (`reading-controls`); the scroll lifts the sheet to full height.
- `sim back` does not close the player sheet at full height (`in-app back control is not available`): pan its grabber down, `sim gesture pan "role=button label=Sheet Grabber" 0 760 --ms 400`.
- After `sim open hymns/100` and then `sim open /`, a hymn opened from the list has no `Hymns` back button on iOS, and `sim back` fails with `in-app back control is not available` (measured 2026-10-30). The journey reaches the list by `sim relaunch` instead; after it, the back button shows.
- On iOS a line with chords over its syllables is not one element: its chords keep their `chord-<p>-<l>-<n>` ids at both alignment levels. Each boxed run reads its syllables' text without visual join or trailing hyphens, after its separately accessible chords. `apps/hymnal/src/reader/SyllableWords.test.tsx` holds that paragraph label and reading order, including iOS's fallback to all inline text. A line with chords off reads as one element named by the whole line.
- Pages turn by `sim scroll screen right` and `left`, which drag mid-screen. A pan that starts within 20 pt of the left edge is the back pan (`sim gesture edge-pan`), so a swipe right starts mid-screen.
- The web has no pager: one page per route, and a swipe does nothing there.
- A hymn opened by link has no back button and the header no other button: `sim back --in-app` there finds nothing to tap. Go back with the edge pan or a new `sim open /`.
- On iOS a stanza's group is read as text named `Stanza <n>`; on the web it is a `group` with that `aria-label`. `label=` matches both.
