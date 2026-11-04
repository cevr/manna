# Voice

The voice reads a verse aloud on the device and lights each word as it is
spoken (`apps/heartseed/src/voice.ts`, over the Swift package
`apps/heartseed/native/voice`). Nothing in the app calls it yet: the hear
phase will, so this feature has no screen to drive. What can be checked is
that the app builds with the module.

The voice makes no sound on the simulator: there the module never speaks.
It renders each utterance to audio buffers it drops, logs
`[voice] speak utterance=<n> skipped=simulator`, and paces the render's
word ranges by their sample times. The audio session is left alone.

## Sub-features

- `voice-build`: the app builds with the voice's local pod.

## Driving it

After Launch steps 2-4 of `SKILL.md` (the host, the prebuild, the build),
with no simulator booted:

→ `prebuild` exits 0; `grep -F OneSwiftPackages/voice apps/heartseed/ios/Podfile.lock`
succeeds, `ls apps/heartseed/ios/OneSwiftPackages` lists `voice`, and
`build.log` ends `** BUILD SUCCEEDED **`.

## Gotchas

- The prebuild writes `.one-native-source.json` (and maybe
  `.one-native-source.swift.txt`) beside `Voice.swift`; both are
  git-ignored.
- The module's declaration, `Voice.d.swift.ts`, is committed; its guard
  (`apps/heartseed/src/voice/guard.test.ts`) fails when `Voice.swift`
  changes its methods without it.
