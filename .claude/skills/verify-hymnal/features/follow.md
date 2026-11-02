# Follow

While a hymn plays, its page follows the singing. The line sung now is
marked: its syllables turn muted and the syllable sung now takes the accent
colour, with chords on or off, with no box and no underline. A line with no
note times (a Plain part's line, a line held to even shares, or an unplayed line) is marked
whole: its words take the accent on a soft tint, with no invented syllable timing.
This stays visible in light mode, where accent equals ordinary ink. The page scrolls each line in about 600 ms
before it is sung, a third of the way down, so a reader never scrolls by
hand. With sound on, the marks keep time with the recording; with sound off
(the `Sound` switch beside Play turned off), nothing sounds and they keep the score's time
from the first sung line. A drag of the page pauses the scroll (the marks
go on) and shows `Resume follow`; a tap on it, or a seek in the player,
brings the sung line back and follows again. The marked line is
`selected` on iOS and `aria-current="true"` on the web.

## Sub-features

- `follow-play`: one tap on `Play hymn <n>` follows the hymn to its last line, with no other touch.
- `follow-play-recording`: with sound on (web, muted browser), the marks follow the recording.
- `follow-line`: exactly one line is marked at a time, in order, never back, each line longer than 1 s seen, and the marked line and the next line's top inside the page's scroll.
- `follow-syllable`: on every line with note times, of a syllable-level or a line-level part, the sung syllable in the accent colour, the rest of the marked line muted, chords on or off (hymn 11 at 0:27: line 1 lights one syllable, then the next). Without note times (a Plain part's line, a line held to even shares, or an unplayed line), the whole line is highlighted in the accent on a soft tint.
- `follow-sound`: with `Sound off`, Play sounds nothing and the marks run on the score's clock. One Play tap is enough: the player shows Playing from the first sung line, which is marked, with no seek. While a recording is still loading, `Sound off`, Pause and Stop answer at once, and a load that never answers is given up after 15 s.
- `follow-tempo`: with `Sound off`, the marks keep the hymn's `Tempo` (player.md, `player-tempo`): the place moves tempo ÷ 100 ms of the hymn each ms from the first sung line, so at 50% `Seek`'s time gone moves 10 s in 20 s, and the marked line moves on or stays, never back. A turn while it plays moves on from the place as it stands. With sound on the recording sets the pace.
- `follow-hand`: a drag of the page while it plays shows `Resume follow` and stops the scroll; a tap on it brings the marked line back into view.
- `follow-intro`: before the first sung line (the recording's intro, or a seek into it), a thin line over the first line fills; it is the `Introduction` progress bar (`testID` `intro`, value `N seconds to the first line`), adds no height, and is gone once line 0 is marked. With `Sound off` Play starts at the first line, so it shows only after a seek into the intro.
- `follow-seek`: a seek on the player's `Position` bar, or on the lock screen, of any size, shows the line sung there and follows again.

## How to get to it (user POV)

### Selected melody and shared notes

- `follow-soprano`: on 388, then control 373, the follow and chords use the same selected melody. A separate tune track is kept when it has one pitch per onset; polyphonic accompaniment cannot displace the keyboard soprano. Legato overlaps alone do not disqualify a tune.
- `follow-melisma`: internal melody notes keep one syllable selected until its next distinct syllable onset. Seek on either side of that boundary. Repeat with chords off/on and Simple/Advanced. The MIDI tempo map supplies the times, rounded to 1/96-beat units before conversion to milliseconds.
- `follow-shared-note`: a zero-note syllable shares its predecessor's onset. At a line opening it shares that line's first owned note, or the previous anchor if the entire line shares. Simultaneous starts select the last syllable in the group; no extra note or time is consumed. A line keeps whole-line marks only without note times: a Plain part's line, a line held to even shares, or an unplayed line.
- `follow-key-continuity`: change Key while silently playing 388 and 373; elapsed place and follow keep advancing. Drag and Resume follow, and seek into the intro and back into a sung line.

For these rows, use Sound off before every Play on web and iOS. Run Doctor before the drive and after surprises. Retain only line/syllable indexes, numeric timing, rectangles and control states. Do not capture media or persist hymn words. Only snapshots near 1 s with Doctor timing approval can support a 1,500 ms live timing claim. Sound-off proof does not establish recording output.

Numeric guards: `packages/hymnal/src/playback.slow.test.ts` walks all 695 hymns, every stored part and sung occurrence, including the held hymns; generated cases cover shared notes, melismas, rests, meters, tempos and accompaniment. `src/player/keyplay.slow.test.ts` checks seek fidelity within the supplied timelines on 388, 373, 214 and shared-note fixtures. Independent MIDI selection is checked by the package's score and corpus tests. `data/playback/census.json` records each stored part's current and baseline follow level. The manifest records unchecked generation provenance and lists changed projections; the build joins only these overrides. The build checks schema, corpus binding and word cuts, with a reason and regenerate command on failure. Generation and the slow fresh-compile test catch staleness.
`src/follow/staleness.slow.test.ts` makes real byte edits in a disposable APFS clone for the generation fingerprint's inputs (`scripts/playback.ts` `inputsHash`), both override MIDIs and an unlisted config. Named, default, promises and Bun file reads see the edits; the join and shared web/native encoders must keep identical output and the timeline/chord properties must pass. The fast storage guard checks all 695 corpus digests and limits the minified numeric set to 17 MB.

- A hymn page, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): `Play hymn <n>` in the bar at its foot.
- `Resume follow` over the page after a drag while it plays.
- `Open player`, then the `Position` bar, to seek.

## Driving it with sim

- **Preconditions:** the hymn reader open. On iOS `Sound` off before any Play: its state is its value, which the presented `sim snapshot` does not show; read it with `agent-device snapshot --json --raw --observe-only --force-full --session verify-hymnal` (the node labelled `Sound`: `checked` is on, `unchecked` off). Play is pressed only with sound off.
- **States:** default (playing, paused by hand, ended), loading (web, before the recording sounds). Empty and error are n/a: every hymn has a timeline.
- **Regression:** `apps/hymnal/src/follow/timeline.test.ts`, `apps/hymnal/src/follow/clock.test.ts`, `apps/hymnal/src/follow/clock.tempo.test.ts` (the clock at every tempo of the dial), `apps/hymnal/src/follow/follower.test.ts` (the lit line over all of hymn 100 at 80% and 120%), `apps/hymnal/src/player/sound.test.ts`, `apps/hymnal/src/follow/follow.slow.test.tsx`, `apps/hymnal/src/follow/whole-line.test.tsx` (visible untimed highlights), `apps/hymnal/src/hymns/chords.property.test.ts` (the syllables of every sung line, one per syllable time), `apps/hymnal/scripts/follow.test.ts` (the checker's judge).

**The journey:** `sim journey follow`. Hymn 100, `Sound` off (`sound-off`, from the default on), Play (`follow-play`), a drag of the page (`follow-hand`) until `Resume follow` shows, `Resume follow` (`follow-resume`), Pause, then `Sound` back on. Check `Sound` reads `checked` before it runs: the journey turns it with a tap, and a run that starts with it off plays aloud.

Read in the receipts (keep readings, not snapshots: they hold the words):

- `follow-play`: a `line` selected in the accent; the shot cropped to the marked line 1:1 shows one syllable in the accent, the rest muted, a muted hyphen between syllables; no box, no underline (`follow-syllable`).
- `follow-hand`: `Resume follow` whole above the playing bar (its rect's bottom at or above the region `Player`'s top).
- `follow-resume`: `Resume follow` gone, the selected line inside the open page's `hymn-scroll` frame, about a third of the way down.

By hand:

1. **One tap to the end (`follow-play`, `follow-line`, `follow-sound`).** With hymn 100 open and `Sound` off: `bun run --cwd apps/hymnal follow --udid <udid> --hymn 100 --out "$EVIDENCE/follow"`. It presses `Play hymn 100` once, records `follow-100.mp4` and reads the tree about every 0.5 s until the button reads `Play hymn 100 again`. → one JSON line, exit 0: `holds` true, `backwards` 0, `missed` [], `last` true, `outside` 0, `doubled` 0, `mismatched` 0, `adrift` 0 (each marked line within 1.5 s of the score clock), `early` false, `ended` true, `touches` 1. The same on hymns 93, 212 and 493, each opened by `sim open` first. With chords on (`sim hold id=key-button --settle 2`, and again after to put them off), the chords keep their own colour over the syllables.
   Under a run whose rules allow no capture of the screen, add `--no-video`: the checker records nothing and reads only the tree.
   - **A looped hymn.** Hymn 663's MIDI file plays one verse for its six stanzas, so its sung file plays that verse once a stanza (`packages/hymnal/src/sung.ts`). With 663 open (`sim open hymns/663`) and `Sound` read as `unchecked`: `bun run --cwd apps/hymnal follow --udid <udid> --hymn 663 --out "$EVIDENCE/follow" --no-video`. → one JSON line, exit 0: `holds` true, `missed` [], `last` true, `adrift` 0, `ended` true, `lines` 7 and `seen` 7: each of the six stanzas' lines marked in turn, about 15.9 s a stanza, for about 96 s. With sound on (`follow-play-recording`) the marks follow the `warm-2` recording, once it is uploaded (`audioUrl(663)` names `warm-2`; before the upload it answers 404).
2. **A seek (`follow-seek`).** While it plays, `sim scroll screen down`, `sim tap "label=Open player"`, `sim gesture pan label=Position 120 0 --ms 700`. → `Position` moves to the place dragged to; `sim back`, and `Resume follow` is gone, the selected line inside `hymn-scroll`'s frame. `sim tap "label=Pause hymn 100"`.
3. **At a tempo (`follow-tempo`, iOS; no journey step: a journey has no wait and reads no value).** With `Sounds and haptics` off and the app relaunched after it (player.md, by hand 8), on hymn 100, `Open player`, turn `Tempo` to `50%` (`sim gesture pan id=dial-tempo 52 0 --ms 1500` is one stop down; read the node `id=dial-tempo`'s value in a raw snapshot after each pan), `sim back` to close the sheet, read `Sound` as `unchecked`, `sim tap "label=Play hymn 100"`. Take two raw snapshots 20 s apart by the host's clock. → `Seek`'s time gone moves 10 s ± 1.5 s, and the selected line's index in the open page (the checker's way, Gotchas) is the same or later, never earlier. `sim tap "label=Pause hymn 100"`, turn `Tempo` to `100%`, close the sheet, Play: → 20 s ± 1.5 s (the control). Pause. Keep the two values and two indexes only, no snapshot. The `bun run --cwd apps/hymnal follow` checker assumes 100% (`adrift` reads the score clock at 1x): use it at 100% only.
4. **The intro (`follow-intro`, iOS).** `Sound` off: Play, `Open player`, `Pause hymn 100` in the sheet, `sim gesture pan label=Position -400 0 --ms 700` to the left end, `sim back`; a raw snapshot → the node `Introduction`, value `19 seconds to the first line`, about 5 pt above line 0. Play, a raw snapshot → `Introduction` with fewer seconds; some seconds later a line is selected and `Introduction` is gone. Pause.

## Gotchas

- Never add a timeout argument to a test or raise a runner timeout. Split long scenarios into cases under the default limit. An extended corpus slow test keeps at least 30% headroom under the 5 s default, measured in five paired runs at load 5 or more.

- The simulator plays through the Mac's speakers: on iOS, read the `Sound` button's value as `unchecked` before every Play. The choice is kept across relaunches. The checker refuses to press Play unless it reads `unchecked` itself.
- The pager keeps the pages beside the open hymn in the tree, each with a `hymn-scroll` and `line` nodes of its own, off the screen. The checker takes the scroll whose frame, cut to its ancestors' frames, the screen shows, and only the lines inside it; read a raw snapshot the same way.
- In a dev build a LogBox toast at the foot can cover the player bar. A tap on the bar then opens the LogBox, the press never reaches the app, and the checker samples a hymn that never plays (`seen` 0, `ended` false). The snapshot still lists the bar's buttons under the toast, so take a `sim shot` before a run. `agent-device react-native dismiss-overlay --session verify-hymnal` clears it; run it again until it reports `No React Native overlay detected`. The pager sets `recycleItems`, so LegendList's warning no longer raises one on every launch.
- On iOS the app's `[follow]` console lines reach neither `sim log` nor `agent-device logs`, so the iOS steps read the follow from the raw snapshot.
- `sim scroll id=hymn-scroll` takes the first of the pager's four `hymn-scroll` nodes, a neighbour page off the screen, so its swipe never reaches the open page. Drag the open page with `sim scroll screen down`, which drags mid-screen (a pan within 20 pt of the left edge goes back).
- While a hymn sounds the bar holds `Seek`; a drag of it seeks, as the sheet's `Position` bar does (player.md, `player-seek-bar`).
- Under load an iOS tap or `sim back` can take 15 s or more, longer than most intros, so the intro (by hand 3) pauses before its seek: a paused intro holds until Play.
- The checker reads the tree without touching the app (`--observe-only`); any other driver acting on the simulator during its run counts as a touch it cannot see. Run nothing else until it prints.
- A load above 12 delays the snapshots: read a run with `missed` lines under such load as no claim and run it again.
- The checker keeps no words: its JSON holds each line's selected state and frame only. Snapshots from `sim snapshot` hold the hymn's words, as the app renders them.
