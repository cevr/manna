# Tuner

The app listens to the microphone to tune a guitar. On iOS a Swift module
(`Listen`) records nothing and plays nothing: it takes the input in
2048-sample frames and hands each to the pitch reader, and the system asks
the reader for the microphone with the text `Hymnal listens to your guitar
to tune it. Nothing is recorded or kept.` Android and the web have no
tuner.

## Sub-features

- `tuner-native-build`: `sim install --prebuild` of the branch builds and launches the app, and the built `Info.plist` has `NSMicrophoneUsageDescription` with the usage text.
- `tuner-open-chord`: a hymn → a chord → the chord sheet's `Tuner` → the tuner sheet (`id=tuner-sheet`) over it; `Done` or a pan down from its grabber returns to the chord sheet at its own detent.
- `tuner-open-settings`: Settings → `Tuner` → the tuner sheet.
- `tuner-permission`: with the permission reset, opening the tuner runs the system request (`[tuner] permission state=undetermined`, then the alert in the tree with the usage text); Allow → `[tuner] permission state=granted`.
- `tuner-denied`: with the permission revoked, the sheet reads `Microphone is off for Hymnal` and holds `Open Settings`; no `[tuner] listen` line.
- `tuner-listen`: with the permission granted, `hymnal://tuner?feed=E2:-12` → `id=tuner-reading` is labelled `Low E string, 12 cents flat` (±2), and the log holds `[tuner] listen source=feed`.
- `tuner-tuned`: `feed=A2:0` → `id=tuner-string-A2` is labelled `A string, tuned` within 2 s; the other five strings are not tuned.
- `tuner-pauses-player`: with Sound off, hymn 100 playing, the tuner opened from Settings → the player reads Paused and the log holds `[tuner] paused player` once; after the tuner closes the player stays Paused.
- `tuner-no-sound`: through every row above, no `[feel] play` line comes from the tuner, and Play is pressed only in `tuner-pauses-player`, with Sound off.
- `tuner-speed`: over at least 50 `[tuner] frame ms=` lines of the feed, the median is at most 8 ms and the p95 at most 16 ms.

## How to get to it (user POV)

- A hymn's chord sheet → `Tuner` (in its head, beside `Done`), or Settings → `Tuner`; both open the sheet at `/tuner`. Deep link: `hymnal://tuner`; in development `hymnal://tuner?feed=<string>:<cents>` (for example `A2:-12`) feeds frames in place of the microphone.

## Driving it with sim

- **Preconditions:** the baseline's boot; a load of at most 12 and 10 GB free before a cold build (SKILL.md, Launch).
- **States:** default. Focus-visible, open, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/tuner/session.property.test.ts` (the listen, permission and player rule over generated worlds), `apps/hymnal/src/tuner/guard.test.ts` (the declaration equals the contract One derives from `Listen.swift`; the module names no output or player; the session is `.record` with `.measurement` and gives the audio back with `.notifyOthersOnDeactivation` in the category, mode and options it found, unless another owner took the session), `apps/hymnal/src/tuner/pitch.test.ts` and `pitch.property.slow.test.ts` (the pitch reader and the reading).

1. **Build (`tuner-native-build`).** `sim install --prebuild` → `{"ok":true,"command":"install",…}` and the app shows `label=Hymns`.
2. **Usage text.** `/usr/libexec/PlistBuddy -c 'Print :NSMicrophoneUsageDescription' apps/hymnal/ios/build/dd/Build/Products/Debug-iphonesimulator/Hymnal.app/Info.plist` → `Hymnal listens to your guitar to tune it. Nothing is recorded or kept.`
3. **The log.** The `[tuner]` lines are JS console lines, which `sim log` does not see. Read them with Argent: `argent run debugger-connect --port $PORT --device_id <udid>`, then `argent run debugger-log-registry --port $PORT --device_id <udid> --json` names the log file to grep. A reconnect starts a new file. Each later step reads its lines from that file.
4. **Opened with no feed (`tuner-open-settings`, `tuner-denied`).** Run `xcrun simctl privacy <udid> revoke microphone im.cvr.hymnal` first, so a sheet opened with no feed starts nothing. `sim open settings --expect label=Simple`, `sim scroll label=Tuner down`, `sim tap label=Tuner` → `id=tuner-sheet`, `label=Microphone is off for Hymnal`, `label=Open Settings`, and no `[tuner] listen` line.
5. **From the chord sheet (`tuner-open-chord`).** With chords on, `sim open hymns/3 --expect "label=Stanza 1"`, `sim tap id=chord-1-1-1` → the chord sheet with `label=Tuner` beside `label=Done`. `sim tap label=Tuner` → `id=tuner-sheet`. `sim tap label=Done` → the chord sheet again (`id=chord-box-0`). Open the tuner again and pan its grabber down (`agent-device gesture pan <grabber x> <grabber y> 0 400 400`) → the chord sheet again, at its `Half screen` detent.
6. **The request (`tuner-permission`).** Run `xcrun simctl privacy <udid> reset microphone im.cvr.hymnal`, then `sim open 'tuner?feed=E2:0'` twice (see Gotchas). → `[tuner] permission state=undetermined`, and the system alert with the usage text is in the tree. Tap `Allow` → `[tuner] permission state=granted`, then `[tuner] listen source=feed`.
7. **A reading (`tuner-listen`, `tuner-tuned`).** With the permission granted, `sim open 'tuner?feed=E2:-12' --expect id=tuner-string-E2` → `id=tuner-reading` is labelled `Low E string, 12 cents flat`. `sim open 'tuner?feed=A2:0'` → within 2 s, `id=tuner-string-A2` is labelled `A string, tuned` and no other `tuner-string-*` is tuned.
8. **The player (`tuner-pauses-player`).** Turn the bar's `Sound` off (`value` `unchecked`) and `Sounds and haptics` off in Settings. On hymn 100, `sim tap "label=Play hymn 100"` (the one Play of the drive) → `label=Pause hymn 100`. Open Settings and `sim open 'tuner?feed=E2:0'` → exactly one `[tuner] paused player` line, before the `listen` line. `sim back`, then `sim open hymns/100` → the bar reads `label=Play hymn 100`, and its place does not move for 8 s. Turn `Sound` and `Sounds and haptics` on again.
9. **Speed (`tuner-speed`).** Leave `feed=E2:-12` open until the log holds at least 50 `[tuner] frame ms=` lines (about 40 s), at a load of at most 12. Take the median and the p95 of the numbers.
10. **No sound (`tuner-no-sound`).** Over the whole drive, the log holds no `[feel] play` line from the tuner, and no Swift `[tuner]` line (the feed never starts `Listen`).

## Gotchas

- Never let the simulator open the Mac's microphone: a drive sets the permission with `xcrun simctl privacy <udid> grant|revoke|reset microphone im.cvr.hymnal` before launch, and feeds the tuner frames instead of the microphone.
- A sheet opened with the permission granted and no feed starts the real microphone. Open the tuner with no feed only with the permission revoked. Every listening row opens the feed link.
- `xcrun simctl privacy` ends the app. The next `sim open` lands on the hymn list and fails its `--expect`: run it again.
- A development build mounts the sheet twice (React's StrictMode): each open logs two `[tuner] permission state=` lines and one `listen` line.
- The system alert makes the app inactive and then active again: after `Allow` the log holds `granted`, `listen`, `stop reason=away`, a second permission read and a second `listen`.
- `tuner-pauses-player` opens the feed link from Settings, not Settings' `Tuner` row: with the permission granted, the row would start the real microphone. The pause runs the same path.
- The build may rewrite `apps/hymnal/native/feel/Voice.d.swift.ts`; put it back with `git checkout -- apps/hymnal/native/feel/Voice.d.swift.ts`.
- Only the owner's phone proves a real string: the microphone on hardware, a plucked string and the hand-off with a playing hymn.
