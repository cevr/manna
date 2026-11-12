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
`[natural] play utterance=<u> chunk=<k> frames=<Σ> samples=<s> from=<f> to=<t> rest=<r> at=<a> skipped=simulator`
and sends the word ranges by a wall clock over the samples. The audio
session is left alone. The voice reads one phrase a call (`;` and `:`
read as a full stop), each phrase trimmed to 20 ms of its audible
samples (`from`, `to`) and followed by its rest (`rest`, samples at
24 kHz: a comma 7200, `;` or `:` 13200, a sentence 19200, a line break
26400, the last chunk 0); `at` is the timeline sample it was scheduled at.
Her renders at speed 0.85 and Him at 0.9 (`SPEEDS`). Each chunk runs in
two module calls: `prosody` (the chain's first four stages: the frames and
Kokoro's pitch curve) and `render` (the last three, on the curve JS
sends). A chunk that ends a phrase or the reading is sent its curve
fallen (`fallOf`, `apps/heartseed/src/natural/fall.ts`, the owner's
Gentle fall: its last ~450 ms gliding to 2 semitones under its middle, no
point raised), a chunk inside a phrase its own; the frames, and so the
samples, do not change.

## Sub-features

- `natural-build`: the app builds for iOS 18 with the natural local pod.
- `natural-install`: `Install` fetches the 39 files, checks each one and
  marks the folder out of backups.
- `natural-corrupt`: a file served wrong is fetched three times, never
  kept, and fails the download `check`; the files before it stay.
- `natural-offline`: a server gone mid-download fails it `network`; a
  second `Install` fetches only the missing files.
- `natural-read`: `Load` then `Read` lights all 37 words in order, one
  chunk a phrase (9), each chunk's samples 600 times its frames, rendered
  at 0.85 and played with its phrase's rest.
- `natural-fall`: the same Her reading sends each chunk a curve that ends
  2 semitones or more under its middle, lowers points on every chunk and
  raises none, with a prosody line before each render.
- `natural-fall-him`: the same in `bm_george` at 0.9.
- `natural-british`: Him's reading sends the British list's ids
  (`data/kjv-phonemes-gb.json`), Her's the American list's.
- `natural-rests`: each chunk plays after the one before it and that
  one's rest, and the reading finishes after the last chunk's audio, not
  after a rest.
- `natural-voices`: a `Read` with `voice=bm_george`, then one without,
  each switch keeping the loaded stages and changing the pack the render
  slices, Him rendered at 0.9.
- `natural-soak-him`: Him's soak of 200 verses plans, renders and stays
  finite by the British list.
- `natural-crash`: an app ended during a reading says `crashed true` once.
- `natural-remove`: `Remove` leaves nothing on the phone.
- `today-mirror`: with no base stored, the app's download goes to
  `models.heartseed.app` (what a release reader sees) and the system voice
  reads.
- `today-off`: Off across a relaunch shows no line and downloads nothing.
- `today-download`: the first tap onto Her downloads from the stored base,
  saying its percent, then getting ready, then nothing.
- `today-read`: the first minute's Listen once ready reads in `af_heart`.
- `today-him`: a tap to Him shows no line (Him reads in `bm_george` at
  0.9; the router's tests hear it).
- `today-fail`: a server gone mid-download waits; a failed download says
  so, and `Try again` finishes it with only the missing files.
- `today-corrupt`: a file served wrong fails the check, with `Try again`.
- `today-fuse`: an app ended mid-reading says so once and reads by the
  system voice until the next `Voice` tap.

## Driving it

After Launch steps 2-5 of `SKILL.md`, with `sim install --prebuild` (the
`ios` folder must be made again for iOS 18 and the natural pod). Start the
model server in the background on port 8281, the port the journeys' probe
links name (so the dev server takes another port of 8280-8289), with its
output in the evidence folder, and stop it by its own handle (never by
name or port):

```bash
MPORT=8281
bun run --cwd apps/heartseed natural:serve -- --port $MPORT --cache "$PWD/tmp/natural-models" > "$EVIDENCE/serve.log"
```

The taps are journeys beside this file, each one `sim journey` call, each
starting at the root (`label=Isaiah 41:10`) or at the screen it names:
`natural` (the root, the probe with the local base, `Install`),
`natural-base` (the root, then the probe: the base stored, nothing
tapped), `natural-missing` (the same with `base=…/missing/`),
`natural-remove`, `natural-load`, `natural-read`, `natural-him` (the probe
with `voice=bm_george`, `Read`), `natural-soak`, `natural-soak-him`,
`natural-reopen` (the root, then the probe, its receipt
`natural-reopen/natural-crash`), and for Today's rows `natural-sheet`,
`natural-voice`, `natural-try`, `natural-relaunch`, `natural-hear`,
`natural-fuse`, `natural-fused` and `natural-listen`. A probe's line is
read with `sim snapshot <step>` (it drives nothing), again until it shows
what the row waits for: the probe's lines are built at run time, so no
journey waits for one.

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
`fall <f>/<k> raised <r>` (of the read's chunks with a voiced point, `k`,
those sent a curve ending 2 semitones or more under their prosody's
middle, `f`, and the points sent above the prosody's own, `r`),
`first-word <ms>`, `rtf <x.xx>` (prosody and render ms over the audio's), `peak <MB>` and
`soak <done>/<n> unplanned <u> failed <f> nonfinite <m>`.

`natural-build`:

→ `sim install --prebuild` is ok, and each of these holds:
`grep -F "platform :ios, '18.0'" apps/heartseed/ios/Podfile`; every
deployment target is `18.0`, so
`grep IPHONEOS_DEPLOYMENT_TARGET apps/heartseed/ios/Heartseed.xcodeproj/project.pbxproj | grep -vc "= 18.0;"`
prints `0`;
`grep -F OneSwiftPackages/natural apps/heartseed/ios/Podfile.lock`; and
`$EVIDENCE/build.log` ends `** BUILD SUCCEEDED **`.

On a fresh container the app's own download starts at launch from the
mirror and waits for it, and while it waits the probe's `Install` does
nothing (`install none`, `installed 0/39`, live at this head). So store
the base first, `sim journey natural-base`, then `sim journey
natural-relaunch`: the launch downloads the 39 files from the local
server itself (`serve.log` gains 39 `GET`s), and the probe's install
then finds them.

`natural-install`: `sim journey natural`, then `sim snapshot
natural-install`

→ the snapshot has `install done 83332513/83332513`, `installed 39/39`
and `excluded true` (tap nothing else until `install done …` shows; take
the snapshot again while it says `install progress …`).
`xattr -p com.apple.metadata:com_apple_backup_excludeItem` on the
container's `natural` folder prints a value, and `serve.log` has 39
`GET` lines ending `200`, one per path.

`natural-corrupt`: `sim journey natural-remove`, stop the server, start it
again with `--corrupt KokoroTail_v2.mlmodelc/weights/weight.bin` added,
then `sim journey natural` (its `Install`) and snapshots:

→ `install failed <bytes>/83332513 check`; `serve.log` has three `GET`s of
that path; the path is absent from the revision folder `2568276a60ff` in
the container's `natural` folder; and the probe shows `installed 28/39` (the 28
files before it in the manifest are kept).

`natural-offline`: with the server (no `--corrupt`) running,
`sim journey natural-remove`, then `sim journey natural`, and stop the
server by its handle while the probe shows `install progress …`:

→ `install failed <bytes>/83332513 network`, and `installed <n>/39` with
`n` below 39. Start the server again and `sim journey natural`:
`install done 83332513/83332513`, `installed 39/39`, and its new
`serve.log` holds `GET`s of only the `39 − n` missing paths. The `waiting`
event (Low Data Mode, or no network) cannot be made on the simulator
without changing the host; it is the phone check's.

`natural-read`: `sim journey natural-load`, `sim snapshot natural-load`
(again until `loaded true`), `sim journey natural-read`, `sim snapshot
natural-read`

→ `voice af_heart`, `load <ms>`, `loaded true`; after the reading
(snapshot again until `read` is not `none`): `read finished`,
`lit 37/37`, `order ok`, `chunks 9` and `frames ok 9/9`. The module's
log holds
`[natural] load ms=<n> units=cpuOnly voice=af_heart.bin stages=loaded`
(the first load of the process; a later one says `stages=kept`), and,
per chunk, one
`[natural] prosody utterance=<u> chunk=<c> ids=<n> frames=<Σ> points=<2Σ> ms=<m> speed=0.85`,
then one
`[natural] render utterance=<u> chunk=<c> ids=<n> frames=<Σ> samples=<s> ms=<m> speed=0.85 points=<2Σ> lowered=<l> raised=0`
and one `[natural] play … skipped=simulator` line, each with
`s = 600 × Σ` and `to − from ≤ s`. The nine play lines' `rest=` are, in
order, `13200,13200,13200,13200,13200,7200,13200,7200,0`. No sound plays.
The nine prosody lines' `ids=` are, in order, `16,20,19,21,24,6,20,6,58`
(sum 190, the American list's plan), on base and on head.

`natural-rests`: in the same reading's play lines,

→ each chunk's `at` is the one before's `at` plus its `to − from` plus its
`rest`, or later (a render that comes late plays at the clock plus
2400); and the probe's `read finished` follows the last chunk's
`at + to − from`, not a rest after it.

`natural-fall`: in the same reading (Her, Isaiah 41:10),

→ the `natural-read` snapshot has `fall 9/9 raised 0` beside
`frames ok 9/9`, `read finished`, `lit 37/37` and `order ok`. The
module's log holds, per chunk, one `[natural] prosody … speed=0.85` line
with `points = 2 × frames`, followed by that chunk's
`[natural] render … speed=0.85 points=<2Σ> lowered=<l> raised=0` with the
same `frames`, `samples = 600 × frames`, and `lowered > 0` on each of the
9 (the planner's Mac CPU run lowered 14, 28, 32, 31, 24, 27, 20, 27 and 18
points; the simulator's CPU should be close). Report every `lowered`.
Base has no `prosody` line and no `fall` line.

`natural-voices`: after `natural-read`, open the probe with the second
voice and read, then open it without and read again:
`sim journey natural-him`, `sim snapshot natural-voices-him` (again until `read` is
not `none`), `sim journey natural-read`, `sim snapshot natural-voices-her`

→ the first snapshot has `voice bm_george`, and each, once `read` is not
`none`, has `read finished`, `lit 37/37` and `order ok` (the second
`voice af_heart`). The module's log, after the `natural-read` load, holds
one `[natural] load … voice=bm_george.bin stages=kept` and then one
`[natural] load … voice=af_heart.bin stages=kept`, and no second
`stages=loaded`; Him's `prosody` and `render` lines say `speed=0.9` and
Her's `speed=0.85`, a `prosody` line before each `render`. `serve.log`'s ready line says `"files":39`, the cache
holding `bm_george.bin` converted from the revision's rows. Sum each
reading's `render` lines' `frames`: the two
readings of the same verse give different totals (a pack that never
switched gives equal ones). Her's nine prosody lines' `ids=` are
`16,20,19,21,24,6,20,6,58` (sum 190).

`natural-british`: in the `natural-voices-him` reading
(`voice=bm_george`, Isaiah 41:10),

→ the snapshot has `read finished`, `lit 37/37`, `order ok`, `chunks 9`,
`frames ok 9/9` and `fall 9/9 raised 0`; the nine
`[natural] prosody … speed=0.9` lines' `ids=` are, in order,
`16,21,20,21,24,6,21,6,58` (sum 193, the British list's plan), and the
play lines' `rest=` stay `13200,13200,13200,13200,13200,7200,13200,7200,0`.
Base: `16,20,19,21,24,6,20,6,58`, red at chunks 1, 2 and 6.

`natural-fall-him`: in the `natural-voices-him` reading (`voice=bm_george`),

→ the snapshot has `fall 9/9 raised 0` and `frames ok 9/9`; each of its 9
chunks logs a `[natural] prosody … points=<2Σ> … speed=0.9` line, then
its `[natural] render … speed=0.9 points=<2Σ> lowered=<l> raised=0`, with
`lowered > 0` on each. Report every `lowered`: the numbers on record (the
planner's Mac CPU run: 11, 21, 29, 22, 26, 12, 21, 12 and 27) were read by
the American list, before Him read British, so the new ones replace them.
Base: red, as for `natural-fall`.

`natural-crash`: `sim journey natural-read`, and while `read` is still
`none`, `xcrun simctl terminate <udid> app.heartseed`; then
`sim journey natural-reopen` (the root launches the app, then the probe):

→ `natural-reopen/natural-crash` has `crashed true`, and the log holds
`[natural] start crashed=true`. Terminate, `sim journey natural-reopen`
again: `crashed false`.

`natural-remove`: `sim journey natural-remove`

→ `natural-remove/natural-remove` has `installed 0/39`, `bytes 0`, `loaded false`, and the container's
`natural` folder is gone.

A soak on the simulator proves only the tally: `sim journey natural-soak`
(the probe with `soak=200`, then `Soak`; `natural-soak-him` adds
`voice=bm_george`), and `sim snapshot` until `soak 200/200 …`; report its four
counts, which should read `unplanned 0 failed 0 nonfinite 0` (each chunk
runs prosody, the fit, the fall and render as a reading does, so a curve
that does not fit counts as failed). The full soak (31,102 verses)
is the phone check's. Her's soak logs 713 `[natural] prosody` lines whose
`ids=` sum to 25,501.

`natural-soak-him`: `sim journey natural-soak-him`:

→ `soak 200/200 unplanned 0 failed 0 nonfinite 0`, and the soak's 713
`[natural] prosody` lines' `ids=` sum to 26,077 (the British list's plan;
base: 25,501, red). It also shows Kokoro renders the British symbols
(`ɒ ː a Q`) finite on the CPU; the Neural Engine's render, and how a
British word sounds, are the phone check's and the owner's ear.

## Today's rows

Driven in this order on two containers, with the model server running as
above. The line and `Voice` live in home's Settings sheet:
`sim journey natural-sheet` opens it from home (its receipt
`natural-sheet/natural-sheet`); read the line from that receipt or from
`sim snapshot <step>`: the `natural-status` node's text under `Voice`,
and the `Try again` button beside it. Every tap of `Voice` below is one
`sim journey natural-voice` in the open sheet. The pill's choice is the
`Voice` button's value (`Her`, `Him`, `Off`): a raw snapshot (`first.md`,
Driving it) holds it, and a receipt only sometimes holds its
`Voice: <choice>` text, so read the choice in the raw snapshot after each
tap. Every `Try again` is one `sim journey natural-try`. A relaunch is
`sim journey natural-relaunch`: its open waits for the reference, which
the open sheet hides, so its retry relaunches, and then its relaunch
step launches again (about 50 s); it ends with the sheet closed. Today offers `Listen`
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
microphone), then `first.md`'s `sim journey first-reading` (the welcome a
fresh install opens on, `Skip`, the first minute's `Listen`) and
`sim journey first` (on to home, `first-home`), then
`sim journey natural-sheet`; snapshots for 60 s:

→ the line is `Natural voice: waiting for a connection`, or
`Natural voice could not download.` with one `Try again` (record which:
the mirror is not deployed; on the laptop it waits); the module's log
holds `[natural] install revision=2568276a60ff missing=39`; the system's
network log of the app names
`https://models.heartseed.app/kokoro/2568276a60ff/` (`log show --info
--debug`, the predicate `eventMessage CONTAINS "models.heartseed.app" AND
process == "Heartseed"`); and the first minute's Listen logs a
`[voice] speak` and no `[natural] render`.

Store the base: `sim journey natural-base` (the root, then the probe with
`base=http://localhost:8281/`, tapping nothing) → the store copy holds
the base key (`BASE_KEY`) = `http://localhost:8281/`.

`today-off`: `sim journey natural-sheet`, then `sim journey natural-voice`
until the raw snapshot's `Voice` value is `Off` (the cycle is Off, Her,
Him), then
`sim journey natural-relaunch` and `sim journey natural-sheet`:

→ `natural-sheet/natural-sheet`: no `natural-status` node; no
`[natural] install` in the log since the relaunch; the choice key
(`CHOICE_KEY`) = `off`.

`today-download`: one `sim journey natural-voice` (Her); snapshots while
it downloads, until no line shows:

→ `Natural voice: downloading, <p>%` with p rising, then
`Natural voice: getting ready`, then no line (from the local server the
download takes about a second, so a snapshot may catch only
`getting ready`); the module's `[natural] install done` and
`load … voice=af_heart.bin stages=loaded`; `serve.log` has 39 `GET`s
ending `200`.

`today-him`: `sim journey natural-voice` (Him):

→ no line; the choice key = `him`. Today offers no `Listen` on the first
day, so a Him reading is not heard here: the router's tests own it.

`today-fail`: `sim journey natural-voice` twice (Off, then Her);
`sim journey natural-remove` (the probe's `Remove`); start the server so
that it stops after some `GET`s (a server lost mid-download);
`sim journey natural-relaunch` (the launch starts the download), then
`sim journey natural-sheet`; snapshots; start the server again:

→ on the simulator the module waits for a connection when the local
server refuses it: `Natural voice: waiting for a connection`, no
`Try again`, and no new `GET` once the server is back (record it). For the
failed download, store a base the server answers 404 for
(`sim journey natural-missing`), `sim journey natural-relaunch`,
`sim journey natural-sheet`, snapshots, then store the good base again
(`sim journey natural-base`), `sim journey natural-sheet` and
`sim journey natural-try`; snapshots until no line shows:
`Natural voice could not download.` with one `Try again` (the module's
`[natural] install status=404` and `[natural] install failed
reason=network`); after the tap, `[natural] install … missing=<n>` with
only the files the lost server never sent, `[natural] install done`, then
no line.

`today-corrupt`: `sim journey natural-remove`; restart the server with
`--corrupt KokoroTail_v2.mlmodelc/weights/weight.bin`;
`sim journey natural-relaunch`, `sim journey natural-sheet`; snapshots;
then restart it without `--corrupt` and `sim journey natural-try`:

→ `Natural voice could not be checked.` with one `Try again`; after the
tap, `[natural] install … missing=11` (the 28 files before it kept), `[natural] install done`,
no line.

The second container (uninstall, install, revoke; store the base,
`sim journey natural-base`; then `sim journey natural-relaunch`, whose
launch opens the welcome): the launch downloads and loads, the module
logging `[natural] install done` and `load … voice=af_heart.bin stages=loaded`.

`today-read`: `sim journey natural-hear` (the welcome, `Skip`, the first
minute's `Listen`, then the wait for `Say it with help`, timeout 60); the
log:

→ `[natural] load … voice=af_heart.bin stages=kept`, and per chunk a
`[natural] render` and a `play … skipped=simulator` line, no
`[voice] speak`; the reading finished (the first minute goes on by
itself).

`today-fuse`: `sim journey natural-fuse` (the welcome, a relaunch: the
garden still holds no recall, so the launch opens the welcome again;
`Skip`, then `Listen`), and at once `xcrun simctl terminate <udid>
app.heartseed`; `sim journey natural-fused` (the welcome, `Skip`); store
copy; `sim journey natural-listen` (`Listen`); the log. Then
`sim journey first` (to `first-home`) and `sim journey natural-sheet`;
snapshot; `sim journey natural-voice` (Him), store copy; twice more (Off,
Her), store copy; `sim journey natural-relaunch`;
`sim journey natural-sheet`:

→ after the crash, `[natural] start crashed=true`, the fuse key
(`FUSE_KEY`) = `blown`, and Listen logs a `[voice] speak` and no
`[natural] render`; in the sheet in that launch the line
`The natural voice stopped unexpectedly, so the system voice reads for now.`,
no `Try again`; after each tap, no line and the fuse `clear`; after the
relaunch, no line. A natural reading after the clearing tap is not heard
here (the garden is planted by then): the router's tests own it.

The simulator cannot show the sound (so not the pitch heard, nor whether
the fall sounds gentle: the counts above show only the curve sent), the
Neural Engine's fp16 vocoder, the latency (the extra JS hop between
`prosody` and `render` included), `Failed space` or
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
