# Chords and capo

A reader turns chords on with the `Chords` button at the header's top right
(an acoustic guitar's head with its tuning pegs, the same on every platform, filled while on), and
each guitar chord shows above the syllable where it changes, in the words'
own font, the lines wrapping between words. While chords are on, the reader
transposes the hymn and sets a capo fret, and the chords follow: a
transpose raises the sounding key, a capo shows the shapes it plays. Each
hymn keeps its own transpose and capo; chords on or off holds for every
hymn. Chords are Simple at first: at most one plain chord over a syllable,
where the harmony changes, so a line keeps its words' spacing; Settings →
Chords → `Advanced` shows every chord as compiled. Turning chords off shows
the plain hymn again.

## Sub-features

- `chords`: the header's `Chords` button (role button, selected while on) shows and hides the chords over the words on every hymn; the page's body holds no chords switch.
- `transpose`: `Transpose down`/`Transpose up` move the sounding key, read as `Key <key>`, through the twelve keys.
- `capo`: `Capo down`/`Capo up` set a fret from 0 to 11, read as `Capo <n>, <key> shapes` or `No capo`; the chords show that key's shapes.
- `chords-levels`: a part placed by line shows a row of its chords above each line; a plain part, its words alone; a hymn with no chords, its words and "No chords for this hymn yet.".
- `chords-kept`: each hymn's transpose and capo, and the `Chords` choice, survive leaving the hymn and relaunching the app.
- `chords-simple`: Simple by default: at most one plain chord (major, minor or seventh) over a syllable, none where the chord sounding is the one shown before it, so no chord box is wider than its syllable; transpose and capo move it as they move Advanced.
- `chords-tap`: a tap on a chord opens a sheet of how to play each chord shown there, as the page shows it (the played key, under the capo): a guitar chord box (six strings, four frets, `x` muted and `o` open over the strings, a dot with its finger 1 to 4, a barre as one bar, the first fret named when the box starts up the neck), its name, `Capo <n>` or `No capo`; read by VoiceOver as the chord, each string from the low E, and the capo. No animation, no sound; the page does not scroll and the follow does not pause.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): the button `Chords` in the header's top right (beside where `Aa` goes), the only chord control while chords are off.
- While chords are on and the hymn has chords: one row at the page's top, under the number and title, with no tap needed: `Transpose down`, `Key <key>`, `Transpose up`, then `Capo down`, the capo text, `Capo up`.
- Each chord's text is its symbol. The box over syllable s of line l of the page's section p (each from 1, in page order) has the id `chord-p-l-s`; a syllable with no chord has none. The syllable's text has the id `syllable-p-l-s`. A line-level row has the id `chords-p-l`.

## Driving it with sim

- **Preconditions:** chords off, chord style `Simple`, and every hymn at no transpose and no capo (the default of a fresh install, and how steps 9 and 15 leave it). Hymn 100's readings in steps 2 to 9 are the same in either style.
- **States:** default (off), open (on, with the key controls), empty (a hymn with no chords: the notice). Focus-visible, loading and error are n/a.
- **Regression:** `apps/hymnal/src/hymns/chords.property.test.ts`, `apps/hymnal/src/hymns/chords.test.ts`, `apps/hymnal/src/hymns/simple.test.ts`, `apps/hymnal/src/reader/reader.slow.test.tsx`, `apps/hymnal/src/hymns/shapes.test.ts`, `apps/hymnal/src/hymns/shapes.property.test.ts`, `apps/hymnal/src/reader/chordtap.slow.test.tsx`, `apps/hymnal/src/player/ui.slow.test.tsx`, `apps/hymnal/src/settings.test.ts`.

1. **Off.** `sim open hymns/100 --expect "label=Stanza 1"`. → `ok`; the snapshot shows the header's button `Chords`, not selected, no switch in the page, no `chord-` id and no `Transpose` or `Capo`.
2. **Chords on.** `sim tap label=Chords` (the header's button). → `ok`; the button reads selected; `id=chord-1-1-1` reads `Db`, the key text reads `Key Db` and the capo text `No capo`; the shot shows each chord above its syllable with no padded spaces, the lines wrapping between words.
3. **Transpose.** `sim tap "label=Transpose up"`. → `Key D`; `chord-1-1-1` reads `D`.
4. **Capo.** `sim tap "label=Capo up"` twice. → `Capo 2, C shapes`; `chord-1-1-1` reads `C`.
5. **Capo and transpose together.** `sim tap "label=Transpose up"`. → `Key Eb`; `chord-1-1-1` reads `Db`, the printed chord (capo 2 plus transpose 2).
6. **Kept per hymn, on for every hymn.** `sim open hymns/1 --expect "label=Stanza 1"` (no `sim back` here: on a hymn opened by deep link the header has no back button, and `back --in-app` taps `Chords`, its only button). → chords on with no tap, hymn 1's own key and `No capo`. `sim open hymns/100 --expect "label=Stanza 1"`. → `Key Eb`, `Capo 2, Db shapes`.
7. **Relaunch.** `xcrun simctl terminate verify-hymnal im.cvr.hymnal`, then `sim open hymns/100 --expect "label=Stanza 1"`. → `Chords` selected, chords on, `Key Eb`, `Capo 2, Db shapes`.
8. **Levels.** `sim open hymns/126 --expect "label=Stanza 1"`. → the words alone and "No chords for this hymn yet.", no key control. `sim open hymns/11 --expect "label=Stanza 1"`. → `id=chords-1-1` is a row of chords above the line (`sim shot`).
9. **Off again, back to the default.** On hymn 100: `Transpose down` twice, `Capo down` twice (→ `Key Db`, `No capo`), then `sim tap label=Chords`. → the button not selected, the words alone, as in step 1.
10. **The largest page.** `sim open hymns/150 --expect "label=Stanza 1"`, `sim tap label=Chords`, `sim snapshot` holds `chord-1-1-1`. The tap's `ms` stays under 1000 at the recorded load; three trials, chords turned off between them.
11. **Simple keeps the spacing (`chords-simple`).** `sim open hymns/3 --expect "label=Stanza 1"`, `sim tap label=Chords`. → `chord-1-1-1` reads `G`, `chord-1-1-5` reads `D`, no `chord-1-1-6`; for each `chord-1-1-s` present, on iOS its rect's width (`agent-device snapshot --json --session verify-hymnal`) is at most its `syllable-1-1-s` rect's width plus 1 pt; on the web its box (the chord's parent element) is at most `syllable-1-1-s`'s width plus 1 px, read with `agent-browser --session verify-hymnal eval` over `getBoundingClientRect()`.
12. **Key and capo in Simple.** With chords just turned on: `Transpose up`, `Key G`, `Capo up`, `No capo` are shown. `sim tap "label=Transpose up"`. → `Key Ab`, `chord-1-1-1` `Ab`, `chord-1-1-5` `Eb`. `sim tap "label=Capo up"`. → `Capo 1, G shapes`, `chord-1-1-1` `G`, `chord-1-1-5` `D`.
13. **Tap a chord (`chords-tap`).** Still on hymn 3 at `Capo 1, G shapes`: note the page's scroll (`sim snapshot`, the rect of `syllable-1-1-1`). `sim tap id=chord-1-1-1`. → a sheet over the page, at once (no slide): `Capo 1` and `Done` at its top, one chord box under the name `G`, its label (`chord-box-0`) `G. low E fret 3, finger 2; A fret 2, finger 1; D open; G open; B open; high E fret 3, finger 3. capo 1`; the shot shows six strings, the nut thick at the top, `o` over the D, G and B, each dot holding its finger's number. No sound plays, and the follow's `Resume following` does not appear. `sim tap label=Done`. → the sheet is gone and `syllable-1-1-1`'s rect is where it was. `sim tap id=chord-1-1-5`. → the box for `D` (`xx0232`, fingers 1, 3, 2). On iOS, a tap a little above or below a chord's text still opens it (its target is 44 pt tall); the line under it does not move.
14. **Key and capo in Advanced.** `sim open settings --expect label=Advanced`, `sim tap label=Advanced`, `sim open hymns/3 --expect "label=Stanza 1"`. → the move is kept: `Key Ab`, `Capo 1, G shapes`, `chord-1-1-1` `G`, `chord-1-1-5` `Dsus4 Dsus2`. `sim tap "label=Capo down"`. → `No capo`, `chord-1-1-1` `Ab`, `chord-1-1-5` `Ebsus4 Ebsus2`.
15. **Back to the default.** On hymn 3: `Transpose down` (→ `Key G`, `No capo`), `sim tap label=Chords` (off), then in Settings `sim tap label=Simple`.
16. **Proof.** `sim snapshot` and `sim shot` after each step; the video of the journey.

## Gotchas

- Hymn 100 is printed in D-flat: `Db` at rest is right, and a transpose of 12 comes back to `Db`, never `C#`.
- `Capo down` at 0 and `Capo up` at 11 are disabled, not defects. The transpose wraps.
- The app's bundle id for `simctl terminate` is the one `sim install` printed; read it there if it differs.
- A run that leaves chords on or a move set changes the next run's step 1: finish with steps 9 and 15. A run that leaves `Advanced` chosen changes step 11's readings.
- VoiceOver reads a syllable-level line in syllable pieces: a known gap, not a failure of this journey.
