# Natural voice

The natural voice reads a verse with Kokoro-82M on the phone and lights
each word at the sample the model gives it (`apps/heartseed/src/natural`,
over the Swift package `apps/heartseed/native/natural`). No screen a reader
sees calls it yet: a development probe, `app/probe/natural.tsx`, drives the
module. It downloads the 39 pinned model files from the link's `base`,
loads them, reads Today's passage (Isaiah 41:10, 37 words) through the
voice over the natural source, and soaks verses. It reads in the link's
`voice`, `af_heart` or `am_michael` (`VOICES` in
`apps/heartseed/src/natural/manifest.ts`; any other value or none is
`af_heart`). It shows counts only, never a word.

The models come from the local model server, `scripts/natural-serve.ts`,
which fills its cache from Hugging Face at the pinned revision once per
worktree (checking every file's SHA-256, and converting `am_michael.bin`
from the revision's voice rows) and serves the 39 paths. Its cache
is a `natural-models` folder in the worktree's git-ignored `tmp`; nothing is committed
or published.

On the simulator the module renders with every stage on the CPU and plays
nothing: a play logs
`[natural] play utterance=<u> chunk=<k> frames=<Σ> samples=<s> skipped=simulator`
and sends the word ranges by a wall clock over the samples. The audio
session is left alone.

## Sub-features

- `natural-build`: the app builds for iOS 18 with the natural local pod.
- `natural-install`: `Install` fetches the 39 files, checks each one and
  marks the folder out of backups.
- `natural-corrupt`: a file served wrong is fetched three times, never
  kept, and fails the download `check`; the files before it stay.
- `natural-offline`: a server gone mid-download fails it `network`; a
  second `Install` fetches only the missing files.
- `natural-read`: `Load` then `Read` lights all 37 words in order, each
  chunk's samples 600 times its frames.
- `natural-voices`: a `Read` with `voice=am_michael`, then one without,
  each switch keeping the loaded stages and changing the pack the render
  slices.
- `natural-crash`: an app ended during a reading says `crashed true` once.
- `natural-remove`: `Remove` leaves nothing on the phone.

## Driving it

After Launch steps 2-5 of `SKILL.md`, with `sim install --prebuild` (the
`ios` folder must be made again for iOS 18 and the natural pod). Start the
model server in the background on a free port of 8280-8289 other than the
dev server's, with its output in the evidence folder, and stop it by its
own handle (never by name or port):

```bash
MPORT=8281
bun run --cwd apps/heartseed natural:serve -- --port $MPORT --cache "$PWD/tmp/natural-models" > "$EVIDENCE/serve.log"
```

Ready is one JSON line, `{"ready":true,"url":…,"files":39,"fetched":<n>,…}`;
`fetched` is 0 once the cache holds the files. It logs
`[serve] <METHOD> /<path> <status>` per request. The container is
`xcrun simctl get_app_container <udid> app.heartseed data`, and the
module's folder is its `Library/Application Support/Heartseed/natural`.
The module's log:

```bash
xcrun simctl spawn <udid> log show --last 10m --style compact --predicate 'eventMessage CONTAINS "[natural]" AND process == "Heartseed"'
```

The probe's lines, read with `sim snapshot <step>`: `voice <name>`,
`installed <n>/39`,
`bytes <n>`, `excluded <bool>`, `crashed <bool>`, `loaded <bool>`,
`install <kind> <bytes>/<total> <reason>`, `load <ms>`,
`read <finished|stopped|off|interrupted|failed|none>`, `lit <lit>/<words>`,
`order <ok|broken>`, `chunks <k>`, `frames ok <j>/<k>`,
`first-word <ms>`, `rtf <x.xx>`, `peak <MB>` and
`soak <done>/<n> unplanned <u> failed <f> nonfinite <m>`.

`natural-build`:

→ `sim install --prebuild` is ok, and each of these holds:
`grep -F "platform :ios, '18.0'" apps/heartseed/ios/Podfile`; every
deployment target is `18.0`, so
`grep IPHONEOS_DEPLOYMENT_TARGET apps/heartseed/ios/Heartseed.xcodeproj/project.pbxproj | grep -vc "= 18.0;"`
prints `0`;
`grep -F OneSwiftPackages/natural apps/heartseed/ios/Podfile.lock`; and
`$EVIDENCE/build.log` ends `** BUILD SUCCEEDED **`.

`natural-install`:

```bash
sim open / --expect "label=Isaiah 41:10"
sim open "probe/natural?base=http://localhost:$MPORT/" --expect "label=Install"
sim tap Install
sim snapshot natural-install
```

→ the snapshot has `install done 83332513/83332513`, `installed 39/39`
and `excluded true` (tap nothing else until `install done` shows; take
the snapshot again while it says `install progress`).
`xattr -p com.apple.metadata:com_apple_backup_excludeItem` on the
container's `natural` folder prints a value, and `serve.log` has 39
`GET` lines ending `200`, one per path.

`natural-corrupt`: tap `Remove`, stop the server, start it again with
`--corrupt KokoroTail_v2.mlmodelc/weights/weight.bin` added, then
`sim tap Install`:

→ `install failed <bytes>/83332513 check`; `serve.log` has three `GET`s of
that path; the path is absent from the revision folder `2568276a60ff` in
the container's `natural` folder; and the probe shows `installed 28/39` (the 28
files before it in the manifest are kept).

`natural-offline`: with the server (no `--corrupt`) running, tap
`Remove`, then `Install`, and stop the server by its handle while the
probe shows `install progress`:

→ `install failed <bytes>/83332513 network`, and `installed <n>/39` with
`n` below 39. Start the server again and tap `Install`:
`install done 83332513/83332513`, `installed 39/39`, and its new
`serve.log` holds `GET`s of only the `39 − n` missing paths. The `waiting`
event (Low Data Mode, or no network) cannot be made on the simulator
without changing the host; it is the phone check's.

`natural-read`:

```bash
sim tap Load
sim snapshot natural-load
sim tap Read
sim snapshot natural-read
```

→ `voice af_heart`, `load <ms>`, `loaded true`; after the reading
(snapshot again until `read` is not `none`): `read finished`,
`lit 37/37`, `order ok`, `chunks <k>` and `frames ok <k>/<k>` with k at
least 1. The module's log holds
`[natural] load ms=<n> units=cpuOnly voice=af_heart.bin stages=loaded`
(the first load of the process; a later one says `stages=kept`), and,
per chunk, one
`[natural] render utterance=<u> chunk=<c> ids=<n> frames=<Σ> samples=<s>`
and one `[natural] play … skipped=simulator` line, each with
`s = 600 × Σ`. No sound plays.

`natural-voices`: after `natural-read`, open the probe with the second
voice and read, then open it without and read again:

```bash
sim open "probe/natural?base=http://localhost:$MPORT/&voice=am_michael" --expect "label=Read"
sim tap Read
sim snapshot natural-voices-him
sim open "probe/natural?base=http://localhost:$MPORT/" --expect "label=Read"
sim tap Read
sim snapshot natural-voices-her
```

→ the first snapshot has `voice am_michael`, and each, once `read` is not
`none`, has `read finished`, `lit 37/37` and `order ok` (the second
`voice af_heart`). The module's log, after the `natural-read` load, holds
one `[natural] load … voice=am_michael.bin stages=kept` and then one
`[natural] load … voice=af_heart.bin stages=kept`, and no second
`stages=loaded`. Sum each reading's `render` lines' `frames`: the two
readings of the same verse give different totals (a pack that never
switched gives equal ones).

`natural-crash`: tap `Read`, and while `read` is still `none`,
`xcrun simctl terminate <udid> app.heartseed`; then `sim open /` and
the probe link again:

→ `crashed true`, and the log holds `[natural] start crashed=true`.
Terminate, `sim open /` and open the probe again: `crashed false`.

`natural-remove`:

```bash
sim tap Remove
sim snapshot natural-remove
```

→ `installed 0/39`, `bytes 0`, `loaded false`, and the container's
`natural` folder is gone.

A soak on the simulator proves only the tally: open the probe with
`soak=200` added to the link (and `voice=am_michael` for the second
voice), tap `Soak`, and wait for `soak 200/200 …`; report its four
counts. The full soak (31,102 verses)
is the phone check's.

## Gotchas

- The prebuild writes `.one-native-source.json` beside `Natural.swift`;
  it is git-ignored. The module's declaration, `Natural.d.swift.ts`, is
  committed, and `apps/heartseed/src/natural/guard.test.ts` fails when the
  Swift surface changes without it.
- A link opened into a running app reaches its route; after a terminate,
  open `/` first so the app launches, then the probe.
- The first `Load` of a process re-hashes all 39 files (about 83 MB)
  before it loads, so it takes seconds on the simulator; a later load,
  another voice's included, reads only the voice's pack. `Read` before
  `Load` loads too.
- One's dev server may add `/probe/natural` to `apps/heartseed/app/routes.d.ts`;
  leave that change out of any commit.
- Report counts only, then delete the `snapshots` folder.
