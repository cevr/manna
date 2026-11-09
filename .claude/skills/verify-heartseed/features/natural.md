# Natural voice

The natural voice reads a verse with Kokoro-82M on the phone and lights
each word at the sample the model gives it (`apps/heartseed/src/natural`,
over the Swift package `apps/heartseed/native/natural`). Today reads by it:
`Voice` set to Her reads in `af_heart` and Him in `bm_george` once its
download is ready and its crash fuse clear, and the system voice reads
until then; a line under the `Voice` pill of home's Settings sheet says
the download's state, with `Try again` after a failure (`apps/heartseed/README.md`, Natural voice).
The `today-*` rows below drive that. A development probe,
`app/probe/natural.tsx`, drives the module alone. It downloads the 39 pinned model files from the link's `base`,
loads them, reads Today's passage (Isaiah 41:10, 37 words) through the
voice over the natural source, and soaks verses. It reads in the link's
`voice`, `af_heart` or `bm_george` (`VOICES` in
`apps/heartseed/src/natural/manifest.ts`; any other value or none is
`af_heart`). It shows counts only, never a word.

The models come from the local model server, `scripts/natural-serve.ts`,
which fills its cache from Hugging Face at the pinned revision once per
worktree (checking every file's SHA-256, and converting `bm_george.bin`
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
- `natural-voices`: a `Read` with `voice=bm_george`, then one without,
  each switch keeping the loaded stages and changing the pack the render
  slices.
- `natural-crash`: an app ended during a reading says `crashed true` once.
- `natural-remove`: `Remove` leaves nothing on the phone.
- `today-mirror`: with no base stored, the app's download goes to
  `models.heartseed.app` (what a release reader sees) and the system voice
  reads.
- `today-off`: Off across a relaunch shows no line and downloads nothing.
- `today-download`: the first tap onto Her downloads from the stored base,
  saying its percent, then getting ready, then nothing.
- `today-read`: the first minute's Listen once ready reads in `af_heart`.
- `today-him`: a tap to Him shows no line (Him reads in `bm_george`; the
  router's tests hear it).
- `today-fail`: a server gone mid-download waits; a failed download says
  so, and `Try again` finishes it with only the missing files.
- `today-corrupt`: a file served wrong fails the check, with `Try again`.
- `today-fuse`: an app ended mid-reading says so once and reads by the
  system voice until the next `Voice` tap.

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
sim open "probe/natural?base=http://localhost:$MPORT/&voice=bm_george" --expect "label=Read"
sim tap Read
sim snapshot natural-voices-him
sim open "probe/natural?base=http://localhost:$MPORT/" --expect "label=Read"
sim tap Read
sim snapshot natural-voices-her
```

→ the first snapshot has `voice bm_george`, and each, once `read` is not
`none`, has `read finished`, `lit 37/37` and `order ok` (the second
`voice af_heart`). The module's log, after the `natural-read` load, holds
one `[natural] load … voice=bm_george.bin stages=kept` and then one
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
`soak=200` added to the link (and `voice=bm_george` for the second
voice), tap `Soak`, and wait for `soak 200/200 …`; report its four
counts. The full soak (31,102 verses)
is the phone check's.

## Today's rows

Driven in this order on two containers, with the model server running as
above. The line and `Voice` live in home's Settings sheet: from Today
`sim tap "label=Your field"`, then the gear, `sim tap "label=Settings"`;
read the line from `sim snapshot <step>`: the `natural-status` node's
text under `Voice`, and the `Try again` button beside it; `Done` closes
the sheet. Every tap of `Voice` and `Try again` below is in the open
sheet. Today offers `Listen`
only for a new verse after the next 04:00 (`wake.md`), and the promise's
row has no `Remove`, so the reading a drive can hear is the first minute's
`Listen` (`first.md`), on a container whose garden is still empty: the
first container walks the first minute to Today for the line's rows, the
second keeps the first minute for the readings. The first minute shows
no `Voice`, so the second container's choice is the stored one. The app's own JavaScript
logs (`natural.install`, `natural.fallback`) reach neither `log show` nor
the dev server's log on the simulator; the module's `[natural]` lines and
the system's network log do. The line's words, one state each:

- `Natural voice: downloading, <p>%` (p rounded down);
- `Natural voice: waiting for a connection`;
- `Natural voice: getting ready`;
- `Natural voice could not download.` with `Try again`;
- `Natural voice could not be checked.` with `Try again`;
- `Not enough space for the natural voice (83 MB).` with `Try again`;
- `Natural voice could not start.` with `Try again`;
- `The natural voice stopped unexpectedly, so the system voice reads for now.`

The store is read from a copy, never the container itself: copy the
container's store (as `field.md`'s `field-record` does) and run
`sqlite3 -readonly <copy> "SELECT key, value FROM one_kv WHERE key LIKE 'heartseed/natural/%' OR key = 'heartseed/voice/choice'"`.

`today-mirror`: a fresh container (uninstall by udid, install, revoke the
microphone), then `sim open / --expect "label=Hear it"`, the first
minute's `Listen`, and `first.md`'s steps 3-7 to Today, then home's
Settings sheet; snapshots for 60 s:

→ the line is `Natural voice: waiting for a connection`, or
`Natural voice could not download.` with one `Try again` (record which:
the mirror is not deployed; on the laptop it waits); the module's log
holds `[natural] install revision=2568276a60ff missing=39`; the system's
network log of the app names
`https://models.heartseed.app/kokoro/2568276a60ff/` (`log show --info
--debug`, the predicate `eventMessage CONTAINS "models.heartseed.app" AND
process == "Heartseed"`); and the first minute's Listen logs a
`[voice] speak` and no `[natural] render`.

Store the base: `sim open "probe/natural?base=http://localhost:$MPORT/" --expect "label=Install"`,
tapping nothing in the probe → the store copy holds
the base key (`BASE_KEY`) = `http://localhost:$MPORT/`.

`today-off`: `sim open /`, the sheet, tap `Voice` until `Voice: Off`,
`sim relaunch`, `sim open / --expect "label=Settings"`, the sheet,
snapshot:

→ no `natural-status` node; no `[natural] install` in the log since the
relaunch; the choice key (`CHOICE_KEY`) = `off`.

`today-download`: one `sim tap "label=Voice"` (Her); snapshots while it
downloads, until no line shows:

→ `Natural voice: downloading, <p>%` with p rising, then
`Natural voice: getting ready`, then no line (from the local server the
download takes about a second, so a snapshot may catch only
`getting ready`); the module's `install done` and
`load … voice=af_heart.bin stages=loaded`; `serve.log` has 39 `GET`s
ending `200`.

`today-him`: `sim tap "label=Voice"` (`Voice: Him`):

→ no line; the choice key = `him`. Today offers no `Listen` on the first
day, so a Him reading is not heard here: the router's tests own it.

`today-fail`: tap `Voice` to Off, then Her; the probe's `Remove`; start
the server so that it stops after some `GET`s (a server lost
mid-download); `sim relaunch` (the launch starts the download);
snapshots; start the server again:

→ on the simulator the module waits for a connection when the local
server refuses it: `Natural voice: waiting for a connection`, no
`Try again`, and no new `GET` once the server is back (record it). For the
failed download, store a base the server answers 404 for (the probe's
link with `base=http://localhost:$MPORT/missing/`), `sim relaunch`,
snapshots, then store the good base again and `sim tap "label=Try again"`;
snapshots until no line shows: `Natural voice could not download.` with
one `Try again` (the module's `install status=404` and
`install failed reason=network`); after the tap, `install … missing=<n>`
with only the files the lost server never sent, `install done`, then no
line.

`today-corrupt`: `Remove`; restart the server with
`--corrupt KokoroTail_v2.mlmodelc/weights/weight.bin`; relaunch;
snapshots; then restart it without `--corrupt` and `Try again`:

→ `Natural voice could not be checked.` with one `Try again`; after the
tap, `install … missing=11` (the 28 files before it kept), `install done`,
no line.

The second container (uninstall, install, revoke; `sim open / --expect
"label=Hear it"`; store the base as above; `sim relaunch`; `sim open /
--expect "label=Hear it"`): the launch downloads and loads, the module
logging `install done` and `load … voice=af_heart.bin stages=loaded`.

`today-read`: the first minute's `sim tap "label=Listen"`, then
`sim tap "label=Say it with help" --timeout 60`; the log:

→ `[natural] load … voice=af_heart.bin stages=kept`, and per chunk a
`[natural] render` and a `play … skipped=simulator` line, no
`[voice] speak`; the reading finished (the first minute goes on by
itself).

`today-fuse`: `sim relaunch`, `sim open / --expect "label=Hear it"`,
Listen, and at once `xcrun simctl terminate <udid> app.heartseed`;
`sim open /`; store copy; Listen; the log. Then `first.md`'s steps 3-7 to
Today and home's Settings sheet; snapshot; `sim tap "label=Voice"` (Him),
snapshot, store copy; twice more (Off, Her), snapshot, store copy;
`sim relaunch`; the sheet; snapshot:

→ after the crash, `[natural] start crashed=true`, the fuse key
(`FUSE_KEY`) = `blown`, and Listen logs a `[voice] speak` and no
`[natural] render`; in the sheet in that launch the line
`The natural voice stopped unexpectedly, so the system voice reads for now.`,
no `Try again`; after each tap, no line and the fuse `clear`; after the
relaunch, no line. A natural reading after the clearing tap is not heard
here (the garden is planted by then): the router's tests own it.

The simulator cannot show the sound, the latency, `Failed space` or
`Failed load` (the tests own both), Low Data Mode, a release build
(`today-mirror` stands in: a development build with no base stored reads
the same mirror), or a Today reading by the natural voice (Today's
`Listen` waits for the next day).

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
