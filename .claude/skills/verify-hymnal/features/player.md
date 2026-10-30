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
the bar's hymn at `/player?hymn=<n>`, with `page=<m>` when another hymn
sounds over the reader. The sheet offers that page's Play and keeps its hymn
after a swap, including on Pause. The route carries this context because the
web keeps no page under the sheet: the hymn's number and title, what the player
is doing, its button, a `Position` bar to drag in every state (still while
the length is not known), over the hymn's own page its `Key` and `Capo`
dials, and the reader's settings (the `Text size` dial, `Font`, `Line
spacing`, `Keep screen on`).

## Sub-features

- `player-swap-page`: while a hymn loads, plays or buffers over another hymn's page, `Play hymn <page>` sends the normal `Command.Start`. It replaces the held hymn at the new hymn's own start and saved Key. Navigation alone does not swap. A paused held hymn gives way to the page's own Play.
- `player-swap-sheet`: Open player keeps the sounding hymn's controls and offers `Play <page>` beside them when another hymn's page is shown. Its link carries the page number as well as the held hymn, since the web unmounts the reader. After that press, its heading, Pause and position all describe the new hymn, including after Pause.
- `player-swap-race`: replies from a former Start cannot change the new hymn's identity, position, terminal state, announcement or follow. Same-millisecond Starts still own separate status reads. With Sound on, the new Play does not wait for the former status observer; its late reply cannot change the new score clock. Model tests cover late status and native load replies; the silent UI drive covers page ownership and follow only.
- `player-key-set`: Play uses the held hymn's saved sounding Key. Printed key uses `warm-1`; offsets -5..-1 use `warm-1-down5..1`, and 1..6 use `warm-1-up1..6`.
- `player-key-switch`: a Key hand-over from Playing keeps the current musical time plus preparation time. A hand-over from Loading or Buffering, a resume from Paused, and a Seek land exactly at their targets. A short gap is allowed. A paused Key selection starts nothing; the next Play uses that Key at the held place. Reset obeys the same rule. During a moving replacement, follow receives its running place, so a hand pause stays held.
  Recording hand-overs seek immediately after Play; on a readiness refusal they pause before waiting and resume after landing only when Play is still wanted. This is best effort. One can sound opening samples before that separate Pause takes effect; recording output and the size of that exposure remain unverified under the playbulk silence rule.
- `player-key-fallback`: an unavailable chosen set is tried once, then printed key is tried once at the retained place. The bar and sheet show `Recording in printed key. Chosen key unavailable. Play retries it.` A later Play from Paused or Retry retries the chosen key. A remote Play while already Playing keeps the sounding fallback. Choosing its effective key updates selection without a load or seek. A stale failed request cannot take back the newest selection.
- `player-capo-invariant`: Capo 0→1→11→0 changes shapes alone. It makes no recording Play, Stop or Seek call and does not reset follow.
- `player-play`: `Play hymn <n>` starts the recording; the button becomes `Pause hymn <n>`.
- `player-pause`: `Pause hymn <n>` pauses; the button becomes `Play hymn <n>` again.
- `player-bar`: the bar (region `Player`) shows on a hymn page and on every screen while the player holds a hymn. On a hymn page it holds, in order, `Key`, `Open player`, `Sound` and `Play hymn <n>`, and no number or title when its hymn is the page's own; off a page it holds no `Key`, and the opener holds the number and title. `Open player` tells the place (`0:30 of 2:00`). `Sound` and Play/Pause are marks of one size (about 22 pt in 44 by 44 targets), with no text (`Play <n>` shows while another hymn sounds over a page). The full player keeps its text buttons.
- `player-spring`: Play springs the bar from 56 to 88 pt with a little overshoot and shows the adjustable `Seek` under the buttons, the first Play after launch too; Pause settles it back and `Seek` goes. A page turn while it plays leaves the tall bar as it is, with no spring. The page under it does not move: its height is the same playing and paused.
- `player-seek-bar`: a drag of `Seek` moves the place, sent once the finger lifts (the knob grows under the finger and settles on release), and the follow marks the line sung there; a drag on `Seek` never opens the sheet, and a swipe up that starts on `Seek` opens the sheet and moves no place.
- `player-bar-page`: while the player holds no hymn, the bar is the hymn page's own: on a back (the header's button or a pan from the left edge) it slides out with the page, never left on the screen after the page has gone; on a push it slides in with it.
- `player-full`: `Open player`, or a swipe up on the bar, opens the sheet `/player?hymn=<n>` on the bar's hymn, with `page=<m>` when a different hymn sounds over the reader. The sheet offers Play for that page and follows it after a swap, including on Pause. It holds the group `Recording`, that hymn's heading and the `Position` bar in every state, on the web too (where the reader unmounts). A paused held hymn gives way to the page before the sheet opens, as on the bar. On a swap, Position and Seek clear the former hymn's held thumb position at once.
- `player-sheet-reader`: the sheet holds the group `Reading`: the `Text size` dial (adjustable, its value the share, `100%`), `Font`, `Line spacing` and `Keep screen on`; a step of the size moves the page's words at once. Over the hymn's own page it also holds the group `Chord settings`: the `Chords` switch (chords on or off, as the bar's hold), the `Capo` and `Key` dials and, while moved, `Reset`.
- `player-title`: the sheet's hymn number and title is a button named `<n>, <title>` (hint: opens the hymn's page). A press closes the sheet and pushes that hymn's page where the sheet was, with its back button and back pan; over that hymn's own page the sheet only closes. The player is not told: a track plays or stays paused as it was.
- `player-seek-hold`: on iOS, while a finger drags the sheet's `Position` bar, in any direction, the sheet does not move; once the finger lifts, a drag elsewhere on the sheet moves it again.
- `player-line`: the iOS `Position` bar draws one track, with no line of ticks under it (a column of the sheet's still crosses one line).
- `player-stack`: with two or more hymn pages stacked, the bar and the player sheet act on the page on top: after a sheet over it closes (a chord sheet, the player sheet), after a back to the page below, and on a page pushed twice (hymn 100, then 3, then 100 again), whose `Play hymn 100` plays and docks the bar with `Seek`.
- `player-fail`: a recording that cannot load offers `Retry hymn <n>`.
- `player-sound`: the button `Sound`, left of Play in the bar, shows a speaker with waves in the accent while on (the default) and a muted speaker with a slash while off, no text; a press turns it. On the web its `aria-checked` says its state. On iOS its accessibility element is labelled `Sound` and says its state in its value, `checked` (on) or `unchecked` (off). Off, Play sounds nothing and the bar's place runs on the score's clock (follow, [follow.md](follow.md)). The choice is kept after a relaunch.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): the bar at its foot.
- The bar on any screen while a hymn sounds; the full player by a tap on it.

## Driving it with sim

- **Preconditions:** the hymn reader open. On iOS, `Sound` off before any Play (Gotchas).
- **States:** default, loading. Error (`Retry`) needs the recording's host down and is n/a on a normal run.
- **Regression:** `apps/hymnal/src/player/player.test.ts`, `apps/hymnal/src/player/bar.test.ts`, `apps/hymnal/src/player/page.test.ts` (the page on top over generated stacks), `apps/hymnal/src/player/button.test.ts` (each state's buttons, labels and commands), `apps/hymnal/src/reader/pager.slow.test.ts` (the bottom bar), `apps/hymnal/src/player/ui.slow.test.tsx`, `apps/hymnal/src/player/thumb.slow.test.tsx`, `apps/hymnal/src/player/bar.property.slow.test.tsx`, `apps/hymnal/src/player/world.property.slow.test.ts`, `apps/hymnal/src/feel/feel.slow.test.tsx` (the cues of Play, Pause, `Sound` and the seeker, and no device call a cue adds).

**The journey:** `sim journey player`. Hymn 100's bar (`player-bar`), the full player (`player-full`), `Sound` off, Play with the spring and `Seek` (`player-spring`), a drag of `Seek` that opens no sheet (`player-seek-bar`), a swipe up on the bar that opens the sheet with the reading settings (`player-sheet-reader`), Pause, `Sound` on again, then hymn 3 over hymn 100 and a pan from the left edge back to 100 (`player-stack`, `stack-back`). Check `Sound` reads `checked` before it runs: the journey turns it off with a tap.

Read in the receipts:

- `player-bar`: the region `Player` holds `Key`, `Open player`, `Sound` and `Play hymn 100`, in that order, and no number or title; no group `Recording` in the page; the header holds no button. The shot cropped 1:1 to the bar: two marks of one size, a speaker with waves (on).
- `player-full`: the group `Recording` and `Position`. A still cropped to the `Position` band (no hymn words), one column across it: one line run, the track.
- `sound-off`: the speaker with a slash.
- `player-spring`: the region 32 pt taller than in `player-bar` (raw snapshot rects), the adjustable `Seek` (`0:0x of <length>`); the page's `hymn-scroll` frame unchanged.
- `player-seek-bar`: `Seek` and `Open player` tell the new place, the follow's selected line the one sung there.
- `player-sheet-reader`: `Seek`'s value and the place have run on by the time passed and no more.
- `pause`: the region's height back, `Seek` gone.
- `player-stack` and `stack-back`: `Key` reads the key of the page on top (`G` for 3, `Db` for 100), and the bar's Play names that page's hymn.

By hand:

1. **Play, the bar elsewhere, the title (web).** `sim tap "label=Play hymn 100"` → `Pause hymn 100` once loading ends; `sim tap label=Search` → the region `Player` still holds `Pause hymn 100`. `sim tap "label=Open player"`, `sim tap "role=button label=100, <title>"` → hymn 100's page, the bar unchanged. On iOS with the player idle, from the home list with the bar's hymn held: the same, and the header's `Hymns` button (or `sim gesture edge-pan`) gives the home list.
2. **Seek holds the sheet.** In the sheet, read the heading's `y`, then `sim gesture pan label=Position 120 250 --ms 700`. → the heading's `y` unchanged, the sheet open. A pan from the heading down (`sim gesture pan "role=heading label=<heading>" 0 250 --ms 700`) moves the sheet.
3. **Turn `Text size` one detent** in the sheet (`sim gesture pan id=dial-size -52 0`). → the page's words grow at once behind it; turn it back.
4. **The stack, three trials.** `sim relaunch`; `sim open` hymns 100, 3, 1 and 100 in turn, then `sim gesture edge-pan` three times. → after each back, `Key` and the bar's Play name the page on top. Play and pause 100 after a relaunch and hymns 100, 3, 100: `Pause hymn 100` and `Seek` show.

## Gotchas

- For `player-swap-*`, use Sound off on both platforms and check it immediately before every Play. Play 100, open 3 without stopping, verify Pause 100 and Play 3, then press Play 3 once. Expect Pause 3 and the first selected line of 3. Open the sheet normally and check Pause 3 and Position. Repeat 100→3→100, both with the old hymn playing and paused. Also open `/player?hymn=3` while 100 plays and press Play 3 in that sheet. Keep only numbers, control states and selected indexes. No images, raw trees, recordings or hymn words. Native recording output is unverified under this silence rule.
- For the four `player-key-*`/`player-capo-invariant` rows, follow the playbulk silence rules on both platforms. Read Sound off immediately before every Play. Use no snapshots, screenshots, recordings or raw console captures. Read only control state, position and selected line indexes in memory. Open 100, Play once, turn Key one detent and Reset. Position must keep advancing and intent must remain Playing. Pause, turn Key, verify the position holds, then Play after reading Sound off again. Turn Capo 0→1→11 and reset without a Key change: the place keeps moving. Leave and return to the hymn to check the saved setting. Recording selection/fallback and native switch-gap arithmetic are proved by fake adapters; Sound-off drives prove score-clock continuity, not recording output or gap quality.
- The simulator plays through the Mac's speakers. Never press Play on iOS with sound on; the web browser is muted by `sim boot`, so play there with sound on.
- On iOS, press Play only once the `Sound` button reads off. The presented `sim snapshot` shows only `[button] "Sound"`; read its value with `agent-device snapshot --json --raw --observe-only --force-full --session verify-hymnal` (`checked` is on, `unchecked` is off). `sim tap label=Sound` turns it, and the choice is kept, so a relaunch (or another drive's) may have left it on. Put it back to `Sound on` at the end of a drive, after a relaunch, when the player holds no hymn.
- Seek holds the sheet (by hand 2) needs a known length, which only a play gives. On iOS, point `audioUrl` (`src/remote.ts`) at a silent local file for the drive alone (`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 120 silent.mp3`, as `file:///<path>`: One's iOS audio takes `file://` or `https://` only), press Play in the sheet, then Pause. Revert the edit before any commit.
- The recording streams from the app's host: offline, Play ends in `Retry hymn <n>`. That is the error state, not a defect of the drive.
- Loading shows a spinner named `Loading hymn <n>`, not a button: wait for `Pause hymn <n>`, never a fixed sleep.
