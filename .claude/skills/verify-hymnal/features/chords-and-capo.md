# Chords and capo

A reader turns chords on and off at the thumb: a hold of the bottom bar's
`Key` button (an acoustic guitar's head, then a small `KEY` over the
sounding key, or `CAPO n` over the key the chords are played in), or the
`Chords` switch in the player sheet over the hymn's page. Each guitar
chord shows above the syllable where it changes, in the words' own font, the
lines wrapping between words. A tap on `Key` opens two dials above the bar:
the key dial turns the sounding key through the twelve keys and wraps, the
printed key marked; the capo dial sets a fret from 0 to 11 and stops at each
end, each fret over the key played there, the open keys (C, A, G, E, D)
marked. Each dial drags, flings and snaps to a detent. With chords off the
button is the dim guitar alone, and a tap opens the key dial alone: turning
it turns chords on. Each hymn keeps its own key and capo; chords on or off
holds for every hymn. Chords are Simple at first: at most one plain chord
over a syllable, where the harmony changes; Settings → Chords → `Advanced`
shows every chord as compiled. No dial, reset or hold reaches the sound.

## Sub-features

- `chords`: a hold (450 ms) of the bar's `Key` shows and hides the chords on every hymn, and no tap follows the hold; VoiceOver's action on `Key` is `Turn chords off` or `Turn chords on`. The player sheet's `Chords` switch, in its group `Chord settings` over the hymn's own page, does the same with a tap. The header holds no button.
- `chords-key`: a tap on `Key` opens the `Capo` and `Key` dials above the bar, and a tap on `Key` or on the page closes them. With chords off it opens the `Key` dial alone, and one turn of it turns chords on and keeps the key turned to.
- `transpose`: the `Key` dial (adjustable, its value the sounding key, `Db`) turns through the twelve keys and wraps.
- `capo`: the `Capo` dial (adjustable, its value `No capo` or `Capo <n>, <key> shapes`) runs from 0 to 11 and stops at each end; the chords show that key's shapes, and `Key` reads `CAPO n` over them.
- `chords-reset`: while the key or the capo differs from the printed hymn, `Reset` reads `↺ <printed key>, no capo`; it, or a double tap on either dial, gives the printed key, no capo, and the dials closed.
- `chords-sound`: with sound off, while a hymn plays, turning the capo and the key, a reset and a hold leave the player's place and state as they are.
- `chords-levels`: a part placed by line shows a row of its chords above each line; a plain part, its words alone; a hymn with no chords, its words and "No chords for this hymn yet.", and `Key` opens no dials there.
- `chords-kept`: each hymn's key and capo, and chords on or off, survive leaving the hymn and relaunching the app.
- `chords-simple`: Simple by default: at most one plain chord (major, minor or seventh) over a syllable, none where the chord sounding is the one shown before it; the key and the capo move it as they move Advanced. On hymn 3 some Simple chord boxes are wider than their syllable (a known follow-up, F2).
- `chords-tap`: a tap on a chord pushes the route `/chord`, a native form sheet with a grabber (as the player sheet), of how to play each chord shown there, as the page shows it (in the played key): a guitar chord box (six strings, four frets, `x` muted and `o` open over the strings, a dot with its finger 1 to 4, a barre as one bar, the first fret named when the box starts up the neck) under its name, the neck in the middle of the sheet; read by VoiceOver as the chord and each string from the low E. The sheet says no capo: a shape is the same at any fret, so one played chord draws one sheet at every capo. A drag down on the grabber, or `Done`, closes it. No sound; the page does not scroll and the follow does not pause.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): the bottom bar's `Key` button at its left end, the only chord control.
- A tap on `Key` opens the dials above the bar: `Capo`, then `Key`, and `Reset` above them while the hymn is moved. The player sheet (`Open player`) holds the group `Chord settings` while it is over the hymn's own page: the `Chords` switch, then the same two dials and `Reset`.
- Each chord's text is its symbol. The box over syllable s of line l of the page's section p (each from 1, in page order) has the id `chord-p-l-s`; a syllable with no chord has none. The syllable's text has the id `syllable-p-l-s`. A line-level row has the id `chords-p-l`.

## Driving it with sim

- **Preconditions:** chords off, chord style `Simple`, and every hymn at no transpose and no capo (the default of a fresh install, and how steps 9 and 15 leave it). Hymn 100's readings in steps 2 to 9 are the same in either style. On iOS read `Key`'s value, a dial's value and `Sound`'s value from `agent-device snapshot --json --raw --observe-only --force-full --session verify-hymnal` (the presented snapshot shows labels only).
- **A hold:** `agent-device longpress <x> <y> --session verify-hymnal` at the middle of the `Key` button's `rect` in the raw snapshot.
- **A dial turn:** `agent-device gesture pan <x> <y> -44 0 300 --session verify-hymnal` from the dial's middle turns it one detent up (a pan to the right, `44`, one down); a longer, faster pan flings it on. VoiceOver's swipe up and down on a dial turns it one detent.
- **States:** default (off), open (on, the dials closed), dials open, empty (a hymn with no chords: the notice). Focus-visible, loading and error are n/a.
- **Regression:** `apps/hymnal/src/player/thumb.test.ts`, `apps/hymnal/src/player/dial.test.ts`, `apps/hymnal/src/player/thumb.slow.test.tsx`, `apps/hymnal/src/hymns/chords.property.test.ts`, `apps/hymnal/src/hymns/chords.test.ts`, `apps/hymnal/src/hymns/simple.test.ts`, `apps/hymnal/src/reader/reader.slow.test.tsx`, `apps/hymnal/src/hymns/shapes.test.ts`, `apps/hymnal/src/hymns/shapes.property.test.ts`, `apps/hymnal/src/reader/chordtap.slow.test.tsx`, `apps/hymnal/src/player/ui.slow.test.tsx`, `apps/hymnal/src/settings.test.ts`.

1. **Off.** `sim open hymns/100 --expect "label=Stanza 1"`. → `ok`; the header holds no button; the bar's `Key` reads `Chords off` and draws the dim guitar alone; no `chord-` id.
2. **Chords on (`chords`).** Hold `Key`. → `Key` reads `Db` (`KEY` over `Db`); `id=chord-1-1-1` reads `Db`; the shot shows each chord above its syllable with no padded spaces. No dial opened: the hold is no tap.
3. **The dials (`chords-key`).** `sim tap label=Key`. → the `Capo` dial (`No capo`) and the `Key` dial (`Db`) above the bar, no `Reset`. Turn the key dial one detent up. → `Key` reads `D`; `chord-1-1-1` reads `D`; `Reset` reads `↺ Db, no capo`.
4. **Capo (`capo`).** Turn the capo dial two detents up. → `Capo 2, C shapes`; `chord-1-1-1` reads `C`; the button reads `CAPO 2` over `C`. Fling the capo dial up hard. → it stops at `Capo 11`, and goes no further; fling it back down to `No capo`.
5. **Reset (`chords-reset`).** Turn the capo to 2 again, then `sim tap label=Reset`. → the dials close; `sim tap label=Key` shows `Db` and `No capo`. Turn the key one detent, then double tap the key dial. → the dials close, the printed key and no capo again.
6. **Kept per hymn, on for every hymn (`chords-kept`).** Turn the key one detent and the capo two (→ `D`, `Capo 2, C shapes`), close the dials (`sim tap label=Key`). `sim open hymns/1 --expect "label=Stanza 1"` (no `sim back` here: on a hymn opened by deep link the header has no back button and no other button). → chords on with no tap, hymn 1's own key, no capo. `sim open hymns/100 --expect "label=Stanza 1"`. → `Key` reads `CAPO 2` over `C`.
7. **Relaunch.** `xcrun simctl terminate verify-hymnal im.cvr.hymnal`, then `sim open hymns/100 --expect "label=Stanza 1"`. → chords on, `Key` reads `CAPO 2` over `C`.
8. **Levels.** `sim open hymns/126 --expect "label=Stanza 1"`. → the words alone and "No chords for this hymn yet."; `sim tap label=Key` opens no dial. `sim open hymns/11 --expect "label=Stanza 1"`. → `id=chords-1-1` is a row of chords above the line (`sim shot`).
9. **Chords off, back to the default.** On hymn 100: `sim tap label=Key`, `sim tap label=Reset`, then hold `Key`. → `Key` reads `Chords off`, the words alone, as in step 1. `sim tap label=Key`. → the `Key` dial alone. Turn it one detent. → chords on, `Key` reads `D`. Reset, then hold `Key` again (off). Then the sheet's switch: `sim tap "label=Open player"`, `sim tap label=Chords`. → the switch reads on, the sheet's `Capo` dial shows, and `chord-1-1-1` reads `Db` behind the sheet. `sim tap label=Chords` again. → off, the `Key` dial alone; drag the sheet's grabber down to close it.
10. **The largest page.** `sim open hymns/150 --expect "label=Stanza 1"`, hold `Key`, `sim snapshot` holds `chord-1-1-1`; three trials, chords turned off between them.
11. **Simple (`chords-simple`).** `sim open hymns/3 --expect "label=Stanza 1"`, hold `Key`. → `chord-1-1-1` reads `G`, `chord-1-1-5` reads `D`, no `chord-1-1-6`.
12. **Key and capo in Simple.** `sim tap label=Key`, turn the key one detent up. → `Ab`, `chord-1-1-1` `Ab`, `chord-1-1-5` `Eb`. Turn the capo one detent up. → `Capo 1, G shapes`, `chord-1-1-1` `G`, `chord-1-1-5` `D`.
13. **Tap a chord (`chords-tap`).** Still on hymn 3 at `Capo 1, G shapes`, the dials closed (`sim tap label=Key`): note the page's scroll (`sim snapshot`, the rect of `syllable-1-1-1`). `sim tap id=chord-1-1-1`. → at the first tap (5 of 5 tries, closing between them), a form sheet with a grabber at its top and `Done`, one chord box under the name `G`, its label (`chord-box-0`) `G. low E fret 3, finger 2; A fret 2, finger 1; D open; G open; B open; high E fret 3, finger 3`, and no text with `capo` in it (read the raw snapshot); the box's rect is centred on the screen's width (its middle within a point or two of half the width); the shot shows six strings, the nut thick at the top, `o` over the D, G and B, each dot holding its finger's number. No sound plays, and the follow's `Resume following` does not appear. Close it with a drag down from the grabber (`agent-device gesture pan <x> <y> 0 400 400 --session verify-hymnal` from the grabber's middle). → the sheet is gone and `syllable-1-1-1`'s rect is where it was. `sim tap id=chord-1-1-5`. → the box for `D` (`xx0232`, fingers 1, 3, 2). On iOS, a tap a little above or below a chord's text still opens it (its target is 44 pt tall); the line under it does not move.
14. **The sound left alone (`chords-sound`, iOS).** On hymn 100, `Sound` off (player.md, Gotchas), `sim tap "label=Play hymn 100"`, wait 10 s, read `Open player`'s value. Open the dials, turn the capo through every fret and the key through all twelve, `Reset`, hold `Key` twice. → `Pause hymn 100` still shows; `Open player`'s value has run on by the time passed and no more; the follow's selected line moved only as the recording ran. `sim tap "label=Pause hymn 100"`.
15. **Back to the default.** On hymn 3: `Reset`, hold `Key` (off), then in Settings `sim tap label=Simple`.
16. **Proof.** `sim snapshot` and `sim shot` after each step, cropped to the bar, the dials or the sheet; the video of the journey.

## Gotchas

- Hymn 100 is printed in D-flat: `Db` at rest is right, and twelve detents of the key dial come back to `Db`, never `C#`.
- The capo dial stops at 0 and at 11; the key dial wraps. A capo dial that will not go past 11 is right.
- A hold must last past 450 ms: a short press is a tap and opens the dials.
- The app's bundle id for `simctl terminate` is the one `sim install` printed; read it there if it differs.
- A run that leaves chords on or a move set changes the next run's step 1: finish with steps 9 and 15. A run that leaves `Advanced` chosen changes step 11's readings.
- VoiceOver reads a syllable-level line in syllable pieces: a known gap, not a failure of this journey.
