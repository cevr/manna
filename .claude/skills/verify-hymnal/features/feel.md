# Feel

The app's controls are felt: a touch that gives a cue plays a haptic while
Settings' `Sounds and haptics` is on. Only the dials are heard too: each
detent of the key dial sounds a short tone at the pitch class of the key it
names, and each detent of the capo and text-size dials a deep, unpitched
thock, like a mechanical key. Every other cue (a dial's end, Reset, the
switches, Play and Pause, `Favourite`, a tap on `Key` or a radio, the
sheet opening, the seeker, the home list's topics, its tabs, `All at
once`'s zoom out and in, and the `Sections` rail's ticks) is felt only. A dial's
sound starts only once the last one has ended, so a fast fling never
stacks them. On iOS the sounds are system sounds: the ring/silent switch
mutes them, the haptics stay, and they never dip or stop a hymn's
recording. The simulator plays no sound at all: it logs each sound it
would have played.

## Sub-features

- `feel-voice`: after the first screen, the app log holds `[feel] ready sounds=13 ms=<t> simulator=true` once (a phone: `simulator=false`), and no `[feel] voice.failed` line.
- `feel-cues`: with `Sounds and haptics` on, each dial detent below writes its `[feel] play sound=<name> skipped=simulator` line, in order, and every other touch writes none.
- `feel-off`: with `Sounds and haptics` off, the same touches write no `[feel] play` line.

## How to get to it (user POV)

- Every screen: the bar's `Key`, its dials, `Sound`, Play and Pause, the seeker, the page's `Favourite`, the player sheet's `Chords` switch and reading radios, `Keep screen on`, the home list's topics as they take the pin, its tabs (`browse.md`), `All at once` and its tiles, and a drag on the `Sections` rail.
- The switch: Settings, `Sounds and haptics` (`settings.md`, `settings-feel`).

## Driving it with sim

- **Preconditions:** a fresh `sim install --prebuild` of the branch (an older build has no Swift package and logs no `[feel]` line); `Sounds and haptics` on and chords off (the defaults).
- **States:** default (on), off. Focus-visible, open, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/feel/feel.test.ts` (the table of bodies, the switch, the silent switch modelled, the ticks' floor, the sounds' gap), `apps/hymnal/src/feel/voice.test.ts` (the 13 sounds, and every candidate's bars), `apps/hymnal/scripts/feel-candidates.test.ts` (the candidates' WAV takes), `apps/hymnal/src/feel/sound.test.ts` (the iOS adapter over a fake native module), `apps/hymnal/src/feel/guard.test.ts` (no audio session on the voice's path), `apps/hymnal/src/player/dial.test.ts` (one detent cue per detent), `apps/hymnal/src/settings.test.ts`, `apps/hymnal/src/feel/feel.slow.test.tsx` (every touch below, on the real screens).

**The journey:** `sim journey feel`. Hymn 100 (`feel-voice`), chords on, the dials, the capo one detent up and down (`feel-cues`), the key one up, `Reset`; then `Sounds and haptics` off in Settings (`feel-off`), the capo once more and `Reset`; then chords off and the switch on again. It never presses Play. Every stored choice it changes is put back.

The journey proves the touches ran; the cues are in the app log. Read `sim log` (`$EVIDENCE/app.log`) with `grep '\[feel\]'`, each step's lines between its own line's time and the next's:

- `feel-voice`: `[feel] ready sounds=13 ms=<t> simulator=true` once. Nothing is touched with the switch on before it.
- `chords-on`, `dials`: no line (a hold and a tap are felt only).
- `feel-cues`: `play sound=thock`; `capo-down`: `thock` again. `key-up`: `play sound=key-2` (D): the key's line names the key at the notch, whatever the capo.
- `feel-off` onwards to `feel-put-back`: no `[feel] play` line; the switch itself is felt only.

By hand: **Felt only.** With `Sound` unchecked (`sim snapshot sound`; `sim tap label=Sound` when it reads checked): Play, then Pause; `Favourite` twice (`sim tap label=Favourite` matches the pager's every page: press the one whose `rect` lies on screen, `agent-device press <x> <y> --session verify-hymnal`); `Open player`, `Chords` twice, close the sheet; `Sound` twice (end `unchecked`); in Settings `Dark`, then `System`. → no `[feel] play` line in the whole step. A turn past the capo's wall gives no `thud` or other line.

## Gotchas

- The simulator never plays a sound (its system sounds would reach the Mac's speaker): `skipped=simulator` lines are the proof, and the sound itself is the owner's phone's (ring switch on ring and on silent, and with a hymn sounding).
- A haptic leaves no log line and the simulator plays none: the haptics are proved by the unit and slow tests, and by the owner's phone.
- A dial's sound starts only once the last one's file has ended (the thock and the key tone are under a quarter second; `voice.ts`), and a tick's haptic no closer than 30 ms after the last. So a fling's lines are fewer than the detents it passed; turn the dials one detent at a time to count lines. On a Debug build the detents reach JavaScript about 160 ms apart after a fling (`chords-and-capo.md` Gotchas), so its lines tell nothing of the click rate: `feel.test.ts` and the candidates' `fling` takes do.
- The sounds are the owner's pick (`tactile`, `tine`), byte for byte the takes he heard (`voice.test.ts` pins their hashes). `bun apps/hymnal/scripts/feel-candidates.ts --out <dir>` writes the candidates in `THOCKS` and `TONES` as WAV takes and a `README.txt`, for a later pick; never play one here.
- A first `sim open` after a boot may fail its `--expect`: run it again once.
- A run that leaves `Sounds and haptics` off silences the next run: end with the switch on, as the journey's last step does.
