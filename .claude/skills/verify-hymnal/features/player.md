# Player

One bottom bar holds the player. While the player holds no hymn, a hymn
page draws the bar as its own, offering `Play hymn <n>` for that hymn: it
comes in with the page's push and goes out with its back, frame for frame,
and a cancelled edge pan leaves it in place. Once a hymn is held, the bar is
docked in the hymnal's layout under the stack and holds that hymn on every
page. Everything is at the thumb, left to right: on a hymn page the `Key`
button (chords-and-capo.md), the opener (`Open player`), the `Sound` switch
and the player's button, marks of one size with no text (a speaker with
waves or a slash, play, pause, again or retry). The bar names no hymn that
the page under it names; off a page, or while another hymn sounds over a
page, the opener holds that hymn's number and title. Play springs the bar
taller (56 to 88 pt) and shows the seeker under the buttons (`Seek`: the
time gone, a track with a knob to drag, the time left); Pause settles it.
A tap on the opener, or a swipe up on the bar, opens the player sheet on
the bar's hymn at `/player?hymn=<n>` (the route names the hymn, as the web
keeps no page under the sheet): the hymn's number and title, what the player
is doing, its button, a `Position` bar to drag in every state (still while
the length is not known), over the hymn's own page its `Key` and `Capo`
dials, and the reader's settings (the `Text size` dial, `Font`, `Line
spacing`, `Keep screen on`).

## Sub-features

- `player-play`: `Play hymn <n>` starts the recording; the button becomes `Pause hymn <n>`.
- `player-pause`: `Pause hymn <n>` pauses; the button becomes `Play hymn <n>` again.
- `player-bar`: the bar (region `Player`) shows on a hymn page and on every screen while the player holds a hymn. On a hymn page it holds, in order, `Key`, `Open player`, `Sound` and `Play hymn <n>`, and no number or title when its hymn is the page's own; off a page it holds no `Key`, and the opener holds the number and title. `Open player` tells the place (`0:30 of 2:00`). `Sound` and Play/Pause are marks of one size (about 22 pt in 44 by 44 targets), with no text (`Play <n>` shows while another hymn sounds over a page). The full player keeps its text buttons.
- `player-spring`: Play springs the bar from 56 to 88 pt with a little overshoot and shows the adjustable `Seek` under the buttons, the first Play after launch too; Pause settles it back and `Seek` goes. A page turn while it plays leaves the tall bar as it is, with no spring. The page under it does not move: its height is the same playing and paused.
- `player-seek-bar`: a drag of `Seek` moves the place, sent once the finger lifts (the knob grows under the finger and settles on release), and the follow marks the line sung there; a drag on `Seek` never opens the sheet, and a swipe up that starts on `Seek` opens the sheet and moves no place.
- `player-bar-page`: while the player holds no hymn, the bar is the hymn page's own: on a back (the header's button or a pan from the left edge) it slides out with the page, never left on the screen after the page has gone; on a push it slides in with it.
- `player-full`: `Open player`, or a swipe up on the bar, opens the sheet `/player?hymn=<n>` on the bar's hymn, with the group `Recording`, that hymn's heading and the `Position` bar in every state, on the web too (where the page under it unmounts). A paused held hymn gives way to the page's, as on the bar.
- `player-sheet-reader`: the sheet holds the group `Reading`: the `Text size` dial (adjustable, its value the share, `100%`), `Font`, `Line spacing` and `Keep screen on`; a step of the size moves the page's words at once. Over the hymn's own page it also holds the group `Chord settings`: the `Chords` switch (chords on or off, as the bar's hold), the `Capo` and `Key` dials and, while moved, `Reset`.
- `player-title`: the sheet's hymn number and title is a button named `<n>, <title>` (hint: opens the hymn's page). A press closes the sheet and pushes that hymn's page where the sheet was, with its back button and back pan; over that hymn's own page the sheet only closes. The player is not told: a track plays or stays paused as it was.
- `player-seek-hold`: on iOS, while a finger drags the sheet's `Position` bar, in any direction, the sheet does not move; once the finger lifts, a drag elsewhere on the sheet moves it again.
- `player-line`: the iOS `Position` bar draws one track, with no line of ticks under it (a column of the sheet's still crosses one line).
- `player-stack`: with two or more hymn pages stacked, the bar and the player sheet act on the page on top: after a sheet over it closes (a chord sheet, the player sheet), after a back to the page below, and on a page pushed twice (`hymns/100`, `hymns/3`, `hymns/100`), whose `Play hymn 100` plays and docks the bar with `Seek`.
- `player-fail`: a recording that cannot load offers `Retry hymn <n>`.
- `player-sound`: the button `Sound`, left of Play in the bar, shows a speaker with waves in the accent while on (the default) and a muted speaker with a slash while off, no text; a press turns it. On the web its `aria-checked` says its state. On iOS its accessibility element is labelled `Sound` and says its state in its value, `checked` (on) or `unchecked` (off). Off, Play sounds nothing and the bar's place runs on the score's clock (follow, [follow.md](follow.md)). The choice is kept after a relaunch.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): the bar at its foot.
- The bar on any screen while a hymn sounds; the full player by a tap on it.

## Driving it with sim

- **Preconditions:** the hymn reader open (`sim open hymns/100 --expect "label=Play hymn 100"`). Web only for steps that play (Gotchas).
- **States:** default, loading. Error (`Retry`) needs the recording's host down and is n/a on a normal run.
- **Regression:** `apps/hymnal/src/player/player.test.ts`, `apps/hymnal/src/player/bar.test.ts`, `apps/hymnal/src/player/page.test.ts` (the page on top over generated stacks), `apps/hymnal/src/player/button.test.ts` (each state's buttons, labels and commands), `apps/hymnal/src/reader/pager.slow.test.ts` (the bottom bar), `apps/hymnal/src/player/ui.slow.test.tsx`, `apps/hymnal/src/player/thumb.slow.test.tsx`, `apps/hymnal/src/player/bar.property.slow.test.tsx`, `apps/hymnal/src/player/world.property.slow.test.ts`, `apps/hymnal/src/feel/feel.slow.test.tsx` (the cues of Play, Pause, `Sound` and the seeker, and no device call a cue adds).

1. **The bar.** `sim snapshot reader`. → the region `Player` holds `Key`, `Open player`, `Sound` and `Play hymn 100`, in that order, and no number or title; no group `Recording` in the page; the header holds no button.
2. **The full player.** `sim tap "label=Open player"`. → the sheet holds the group `Recording` and `Position` (disabled while Idle). On iOS, take a still, crop it to the `Position` band (no hymn words), and read one column across it: one line run, the track. Then close the sheet; on iOS stop here.
3. **Play (web).** `sim tap "label=Play hymn 100"`. → `ok`; `sim snapshot playing` holds `Pause hymn 100` once loading ends (or `Loading hymn 100` before it).
4. **The bar elsewhere (web).** `sim tap label=Search`, then `sim snapshot bar`. → the region `Player` still holds `Pause hymn 100`, and `Open player` tells the place.
5. **Pause (web).** `sim tap "label=Pause hymn 100"`. → `ok`; the button reads `Play hymn 100` again.
6. **Title (web, then iOS with the player idle).** `sim tap "label=Open player"`, then `sim tap "role=button label=100, <title>"`. → the sheet closes on hymn 100's page, and the bar still reads `Pause hymn 100` (web). From the home list, with the bar's hymn held, open the sheet and press the title. → hymn 100's page, the bar unchanged, and its header's `Hymns` button (or a pan from the left edge) gives the home list.
7. **Seek holds the sheet (iOS).** Open the sheet, read the heading's `y` (`agent-device snapshot --json`), then pan from the `Position` bar's middle down and across (`agent-device gesture pan <x> <y> 120 250 700`). → the heading's `y` is unchanged, and the sheet is still open. Pan from the heading down (`agent-device gesture pan <x> <y> 0 250 700`). → the sheet moves: it closes or drops to its lower detent.
8. **Proof.** `sim shot` after steps 2 to 5, and `sim log` for the page's console.
9. **The marks (`player-bar`, `player-sound`).** On hymn 100 with the player idle: `sim shot` with Sound on, `sim tap label=Sound` and `sim shot` with it off, then (web, or iOS with Sound off) Play and Pause and `sim shot` at Play. Crop the bar 1:1. → two marks of one size and no text beyond the number and title; a speaker with waves (on) or a slash (off). The raw snapshot still lists `Sound` with its value and `Play hymn 100`. Put Sound back on.
10. **The spring and the seeker (`player-spring`, `player-seek-bar`; iOS with Sound off).** Read the region `Player`'s `rect` (raw snapshot), `sim tap "label=Play hymn 100"`, wait for `Pause hymn 100`. → the region is 32 pt taller and holds the adjustable `Seek` (`0:0x of <length>`); the page's `hymn-scroll` frame is unchanged. Drag `Seek` from its middle to the right (`agent-device gesture pan <x> <y> 60 0 500`). → `Seek` and `Open player` tell the new place, the sheet did not open, and the follow's selected line is the one sung there. Read `Seek`'s value, then swipe up from the middle of the `Seek` strip (`agent-device gesture pan <x> <y> 0 -120 300`, at `Seek`'s middle). → the player sheet opens, and `Seek`'s value and the place have run on by the time passed and no more; close the sheet (a drag down of its grabber). `sim tap "label=Pause hymn 100"`. → the region's height is back, and `Seek` is gone.
11. **The sheet's reading settings (`player-sheet-reader`).** On hymn 100's page, swipe up on the bar (`agent-device gesture pan <x> <y> 0 -120 300` from the opener's middle). → the player sheet, with `Text size`, `Font`, `Line spacing`, `Keep screen on`, and the `Chords` switch with the `Capo` and `Key` dials. Turn `Text size` one detent up. → the page's words grow at once behind the sheet; turn it back.
12. **The page on top (`player-stack`; iOS with Sound off).** Relaunch the app (`xcrun simctl terminate`, then `launch`) so the stack is empty. `sim open hymns/100 --expect "label=Play hymn 100"`, `sim tap "label=Play hymn 100"`, then `sim tap "label=Pause hymn 100"`; `sim open hymns/3 --expect "label=Stanza 1"`. → `Key` reads `G` and the bar `Play hymn 3`. `sim tap id=chord-1-1-1`, `sim tap label=Done`. → still `G` and `Play hymn 3`. `sim tap "label=Open player"`, then drag its grabber down. → the same. Relaunch; `sim open hymns/100`, `hymns/3`, `hymns/100`, then `sim tap "label=Play hymn 100"`. → `Pause hymn 100` and `Seek` show; pause it. Relaunch; open `hymns/100`, `hymns/3`, `hymns/1`, `hymns/100`, then go back by a pan from the left edge (`agent-device gesture swipe left-edge --session verify-hymnal`) three times. → after each back, `Key` reads the key of the page now on top (`Db` for 100, `G` for 3), and the bar's Play names that page's hymn. Three trials of each.

## Gotchas

- The simulator plays through the Mac's speakers. Never press Play on iOS with sound on; the web browser is muted by `sim boot`, so play there with sound on.
- On iOS, press Play only once the `Sound` button reads off. The presented `sim snapshot` shows only `[button] "Sound"`; read its value with `agent-device snapshot --json --raw --observe-only --force-full --session verify-hymnal` (`checked` is on, `unchecked` is off). `sim tap label=Sound` turns it, and the choice is kept, so a relaunch (or another drive's) may have left it on. Put it back to `Sound on` at the end of a drive, after a relaunch, when the player holds no hymn.
- Step 7 needs a known length, which only a play gives. On iOS, point `audioUrl` (`src/remote.ts`) at a silent local file for the drive alone (`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 120 silent.mp3`, as `file:///<path>`: One's iOS audio takes `file://` or `https://` only), press Play in the sheet, then Pause. Revert the edit before any commit.
- The recording streams from the app's host: offline, Play ends in `Retry hymn <n>`. That is the error state, not a defect of the drive.
- Loading shows a spinner named `Loading hymn <n>`, not a button: wait for `Pause hymn <n>`, never a fixed sleep.
