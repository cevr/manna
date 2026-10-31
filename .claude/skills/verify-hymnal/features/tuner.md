# Tuner

The app listens to the microphone to tune a guitar. On iOS a Swift module
(`Listen`) records nothing and plays nothing: it takes the input in
2048-sample frames and hands each to the pitch reader, and the system asks
the reader for the microphone with the text `Hymnal listens to your guitar
to tune it. Nothing is recorded or kept.` Android and the web have no
tuner.

## Sub-features

- `tuner-native-build`: `sim install --prebuild` of the branch builds and launches the app, and the built `Info.plist` has `NSMicrophoneUsageDescription` with the usage text.

## How to get to it (user POV)

- None yet: the tuner's sheet and its entries (the chord sheet's `Tuner`, Settings' `Tuner`) come with the sheet.

## Driving it with sim

- **Preconditions:** the baseline's boot; a load of at most 12 and 10 GB free before a cold build (SKILL.md, Launch).
- **States:** default. Focus-visible, open, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/tuner/guard.test.ts` (the declaration equals the contract One derives from `Listen.swift`; the module names no output or player; the session is `.record` with `.measurement` and gives the audio back with `.notifyOthersOnDeactivation` in the category, mode and options it found, unless another owner took the session), `apps/hymnal/src/tuner/pitch.test.ts` and `pitch.property.slow.test.ts` (the pitch reader and the reading).

1. **Build (`tuner-native-build`).** `sim install --prebuild` → `{"ok":true,"command":"install",…}` and the app shows `label=Hymns`.
2. **Usage text.** `/usr/libexec/PlistBuddy -c 'Print :NSMicrophoneUsageDescription' apps/hymnal/ios/build/dd/Build/Products/Debug-iphonesimulator/Hymnal.app/Info.plist` → `Hymnal listens to your guitar to tune it. Nothing is recorded or kept.`

## Gotchas

- Never let the simulator open the Mac's microphone: a drive sets the permission with `xcrun simctl privacy <udid> grant|revoke|reset microphone im.cvr.hymnal` before launch, and feeds the tuner frames instead of the microphone.
- The build may rewrite `apps/hymnal/native/feel/Voice.d.swift.ts`; put it back with `git checkout -- apps/hymnal/native/feel/Voice.d.swift.ts`.
- Only the owner's phone proves a real string: the microphone on hardware, a plucked string and the hand-off with a playing hymn.
