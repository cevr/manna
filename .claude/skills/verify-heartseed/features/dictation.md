# Dictation

Dictation hears a verse said and lights each word as it is said
(`apps/heartseed/src/dictation.ts`, over the Swift package
`apps/heartseed/native/dictation`). Today's Say it calls it through the
app's one runtime (`apps/heartseed/src/app.ts`; `sayit.md`),
which in a development build on the simulator plays the same scripted
replay as the probe. A development probe, `app/probe/dictation.tsx`, recites
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
- `dictation-hear`: the replay with each archaic word said as a
  recognizer writes its sound (its first hearing, `src/matcher/hearings.ts`)
  grades as the exact one.
- `dictation-modern`: the replay with each archaic word modernized keeps
  those words missed and grades Again.

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
opens). The revoke stops the app, so open Today first: it launches the app
afresh, and a link opened into a running app reaches its route (Gotchas):

```bash
sim open / --expect "label=Isaiah 41:10"
sim open probe/dictation --expect "label=ended finished"
sim snapshot dictation
```

→ the snapshot has the text nodes `script exact`, `said 0`, `matched 36`, `missed 1`,
`tentative 0`, `pending 0`, `extra 0`, `grade 2` and `timed 36` (the
passage has 37 words), and one node each starting `analyzer `,
`dictation ` and `recognizer ` with a status (`ready`, `missing` or
`unsupported`): record those three as evidence of what the simulator
offers, not as a pass or a fail. The simulator's log holds
`[dictation] replay session=1` and no `[dictation] listen` line (the
module logs with `NSLog`, which the dev server's log does not carry):

```bash
xcrun simctl spawn <udid> log show --last 10m --style compact --predicate 'eventMessage CONTAINS "[dictation]" AND process == "Heartseed"'
```

Report counts only, then delete the snapshot.

`dictation-hear`, the same way (microphone revoked, Today first):

```bash
sim open / --expect "label=Isaiah 41:10"
sim open "probe/dictation?script=hear" --expect "label=ended finished"
sim snapshot dictation-hear
```

→ the text nodes `script hear`, `said 7`, `matched 36`, `missed 1`,
`tentative 0`, `pending 0`, `extra 0`, `grade 2` and `timed 36`: the
seven archaic words said as their hearings light as said exactly.

`dictation-modern`: the same with `script=modern` and
`sim snapshot dictation-modern` → `script modern`, `said 8`,
`matched 28`, `missed 9`, `extra 8`, `grade 1` and `timed 28`: a
modernized word is another word, never a hearing.

The simulator cannot show which words Apple's engines write for the
archaic words on a phone; the hearings themselves are the matcher's
tests' (`src/matcher/hearings.property.test.ts`). Report counts only,
then delete the snapshots.

## Gotchas

- **A link that launches the app lands on Today.** `sim open probe/dictation`
  into a stopped app shows Today, and so does its one retry, which stops
  the app again; into the running app it shows the probe. One reads a
  launch link with a 150 ms limit (`getInitialURL` in its native linking),
  the likely cause. Revoking a permission stops the app. Open `/` first,
  then the probe.
- One open may log the replay twice, each `session=1`: a development build
  runs the probe's effect, cleans it up and runs it again, and each run
  builds its own service, whose sessions start at 1.

- The prebuild writes `.one-native-source.json` (and maybe
  `.one-native-source.swift.txt`) beside `Dictation.swift`; both are
  git-ignored.
- The module's declaration, `Dictation.d.swift.ts`, is committed; its
  guard (`apps/heartseed/src/dictation/guard.test.ts`) fails when
  `Dictation.swift` changes its methods without it.
- A simulator build compiles only the simulator branch of
  `Dictation.swift`; the device branch is compiled by a device build alone.
