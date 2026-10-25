# Feel

The app's controls are felt and heard: a touch that gives a cue plays a
haptic and a short code-made sound while Settings' `Sounds and haptics`
is on. The key dial rings each key at its own pitch, the capo and the text
size click wood at each detent, a dial's end thuds, `Favourite` chimes up
and down, a switch clicks on or off, Play and Pause click, a tap on `Key`
or a radio taps, and the seeker ticks each five seconds it is dragged. On
iOS the sounds are system sounds: the ring/silent switch mutes them, the
haptics stay, and they never dip or stop a hymn's recording. The simulator
plays no sound at all: it logs each sound it would have played.

## Sub-features

- `feel-voice`: after the first screen, the app log holds `[feel] ready sounds=31 ms=<t> simulator=true` once (a phone: `simulator=false`), and no `[feel] voice.failed` line.
- `feel-cues`: with `Sounds and haptics` on, each touch below writes its `[feel] play sound=<name> skipped=simulator` line(s), in order.
- `feel-off`: with `Sounds and haptics` off, the same touches write no `[feel] play` line.

## How to get to it (user POV)

- Every screen: the bar's `Key`, its dials, `Sound`, Play and Pause, the seeker, the page's `Favourite`, the player sheet's `Chords` switch and reading radios, `Keep screen on`, and the home list's topics as they take the pin.
- The switch: Settings, `Sounds and haptics` (`settings.md`, `settings-feel`).

## Driving it with sim

- **Preconditions:** a fresh `sim install --prebuild` of the branch (an older build has no Swift package and logs no `[feel]` line); `Sounds and haptics` on and chords off (the defaults).
- **States:** default (on), off. Focus-visible, open, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/feel/feel.test.ts` (the table of bodies, the switch, the silent switch modelled, the ticks' floor), `apps/hymnal/src/feel/voice.test.ts` (the 31 sounds), `apps/hymnal/src/feel/sound.test.ts` (the iOS adapter over a fake native module), `apps/hymnal/src/feel/guard.test.ts` (no audio session on the voice's path), `apps/hymnal/src/player/dial.test.ts` (one detent cue per detent), `apps/hymnal/src/settings.test.ts`, `apps/hymnal/src/feel/feel.slow.test.tsx` (every touch below, on the real screens).

The app log is `sim log` (`$EVIDENCE/app.log`, the simulator's unified log for Hymnal). Read its `[feel]` lines with `grep '\[feel\]'`, and count a step's lines as those written after the step before it.

1. **Ready (`feel-voice`).** `sim open hymns/100 --expect "label=Stanza 1"`, then `sim log`. → `[feel] ready sounds=31 ms=<t> simulator=true` once. Touch nothing with the switch on before this line is in the log.
2. **Sound off first.** `sim snapshot sound`: `Sound` reads `unchecked`; if not, `sim tap label=Sound` and read it again. Never press Play with `Sound` on.
3. **Capo (`feel-cues`).** Hold `Key` (chords on): → `play sound=switch-on`. `sim tap label=Key`: → `play sound=press`. Turn the capo dial up two detents with VoiceOver's action (or two slow pans of one detent each; chords-and-capo Gotchas): → `play sound=wood` twice. Turn it down to `No capo`: → `wood` twice. Once more down, at the end: → `wood`, then `play sound=thud`.
4. **Key.** Turn the key dial one detent up: → `play sound=key-2` (D). One down: → `key-1` (Db).
5. **Favourite.** `sim tap label=Favourite`: → `play sound=chime-up`. Again: → `play sound=chime-down`.
6. **The sheet's Chords switch.** `sim tap "label=Open player"`: → `play sound=press`. `sim tap label=Chords`: → `play sound=switch-off`. Again: → `switch-on`. Close the sheet.
7. **Sound.** `sim tap label=Sound` twice: → `play sound=switch-on`, then `switch-off`; end with `Sound` `unchecked`.
8. **Radios.** In Settings, `sim tap label=Dark`, then `sim tap label=System`: → `play sound=press` each.
9. **Off (`feel-off`).** In Settings, `sim tap "label=Sounds and haptics"` (off): → no line. Repeat steps 5 and 8. → no `[feel] play` line after the switch. `sim tap "label=Sounds and haptics"` (on): → `play sound=switch-on`.
10. **Back to the default.** Chords off (hold `Key`), no favourite on hymn 100 (step 5 twice), `System`, `Sounds and haptics` on.

## Gotchas

- The simulator never plays a sound (its system sounds would reach the Mac's speaker): `skipped=simulator` lines are the proof, and the sound itself is the owner's phone's (ring switch on ring and on silent, and with a hymn sounding).
- A haptic leaves no log line and the simulator plays none: the haptics are proved by the unit and slow tests, and by the owner's phone.
- A fast fling plays a tick no closer than 30 ms after the last, so a fling's lines can be fewer than the detents it passed; turn the dials one detent at a time to count lines.
- A first `sim open` after a boot may fail its `--expect`: run it again once.
- A run that leaves `Sounds and haptics` off silences the next run: end with step 10.
