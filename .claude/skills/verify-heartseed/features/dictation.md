# Dictation

Dictation hears a verse said and lights each word as it is said
(`apps/heartseed/src/dictation.ts`, over the Swift package
`apps/heartseed/native/dictation`). No reader-facing screen calls it yet:
Say it will. A development probe, `app/probe/dictation.tsx`, recites
Today's passage less its 11th word through the module's scripted replay,
so the drive checks the module, its events crossing into JS and the
matcher, with no microphone. It shows counts only, never a word.

On the simulator the module opens nothing and asks for nothing: a listen
logs `[dictation] listen session=<n> skipped=simulator` and fails
`unavailable`; the probe never listens. A replay logs
`[dictation] replay session=<n> steps=<count>`. The microphone stays
revoked, and no drive grants speech recognition or the microphone.

## Sub-features

- `dictation-build`: the app builds with the dictation local pod and
  declares the two prompts.
- `dictation-script`: the probe's replay of the passage ends finished,
  every word but the skipped one matched at the script's time.

## Driving it

After Launch steps 2-5 of `SKILL.md` (the host, `sim boot`, `sim install`
with `--prebuild` when `apps/heartseed/ios` predates the dictation module,
and the microphone revoked):

`dictation-build`:

→ `sim install` is ok; `grep -F OneSwiftPackages/dictation apps/heartseed/ios/Podfile.lock`
succeeds, `ls apps/heartseed/ios/OneSwiftPackages` lists `dictation`,
`$EVIDENCE/build.log` ends `** BUILD SUCCEEDED **`, and the app's
Info.plist (the Heartseed folder of `apps/heartseed/ios`) holds the keys
`NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`;
each of these exits 0:

```bash
plutil -extract NSMicrophoneUsageDescription raw apps/heartseed/ios/Heartseed/Info.plist
plutil -extract NSSpeechRecognitionUsageDescription raw apps/heartseed/ios/Heartseed/Info.plist
```

`dictation-script`, with the microphone revoked
(`xcrun simctl privacy <udid> revoke microphone app.heartseed` before the
open):

```bash
sim open probe/dictation --expect "label=ended finished"
sim snapshot dictation
```

→ the snapshot has the text nodes `matched 36`, `missed 1`,
`tentative 0`, `pending 0`, `extra 0`, `grade 2` and `timed 36` (the
passage has 37 words), and one node each starting `analyzer `,
`dictation ` and `recognizer ` with a status (`ready`, `missing` or
`unsupported`): record those three as evidence of what the simulator
offers, not as a pass or a fail. `$EVIDENCE/server.log` or the
simulator's log holds `[dictation] replay session=1` and no
`[dictation] listen` line. Report counts only, then delete the snapshot.

## Gotchas

- The prebuild writes `.one-native-source.json` (and maybe
  `.one-native-source.swift.txt`) beside `Dictation.swift`; both are
  git-ignored.
- The module's declaration, `Dictation.d.swift.ts`, is committed; its
  guard (`apps/heartseed/src/dictation/guard.test.ts`) fails when
  `Dictation.swift` changes its methods without it.
- A simulator build compiles only the simulator branch of
  `Dictation.swift`; the device branch is compiled by a device build alone.
