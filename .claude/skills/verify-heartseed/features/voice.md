# Voice

The voice reads a verse aloud on the device and lights each word as it is
spoken (`apps/heartseed/src/voice.ts`, over the Swift package
`apps/heartseed/native/voice`). The first minute's hear phase calls it at
`Listen` (`first.md`, `first-hear`, drives it on a screen). The reader's
choice, Off, Her or Him, is Today's `Voice` button (`session.md`,
`voice-cycle` and `voice-migrate`); Her and Him read with the same system
voice until the natural voice routes them. What this
feature checks is that the app builds with the module.

The voice makes no sound on the simulator: there the module never speaks.
It renders each utterance to audio buffers it drops, logs
`[voice] speak utterance=<n> skipped=simulator`, and paces the render's
word ranges by their sample times. The audio session is left alone.

## Sub-features

- `voice-build`: the app builds with the voice's local pod.

## Driving it

After Launch steps 2-4 of `SKILL.md` (the host, `sim boot`, and
`sim install`, which prebuilds when `apps/heartseed/ios` is missing and
then builds):

→ `sim install` is ok; `grep -F OneSwiftPackages/voice apps/heartseed/ios/Podfile.lock`
succeeds, `ls apps/heartseed/ios/OneSwiftPackages` lists `voice`, and
`$EVIDENCE/build.log` ends `** BUILD SUCCEEDED **`.

## Gotchas

- The prebuild writes `.one-native-source.json` (and maybe
  `.one-native-source.swift.txt`) beside `Voice.swift`; both are
  git-ignored.
- The module's declaration, `Voice.d.swift.ts`, is committed; its guard
  (`apps/heartseed/src/voice/guard.test.ts`) fails when `Voice.swift`
  changes its methods without it.
