---
name: verify-heartseed
description: >
  Launch, check and drive Heartseed (apps/heartseed, One: React Native on
  iOS) as a reader does, and keep the proof. Use to build Heartseed for the
  iOS simulator, run it on its own simulator (verify-heartseed) against a
  dev server, read its screen through the shared simulator driver, or check
  a Heartseed change in the real app before review or merge.
---

# Verify Heartseed

Heartseed is one One app (`apps/heartseed`): a Debug build for the iOS
simulator that loads its JavaScript from a dev server (`one dev`). The
passage Today shows is made when the dev server bundles the app, from the
KJV in `@manna/core` (`apps/heartseed/vite/plugin.ts`), so a drive reads the
corpus the checkout holds. iOS is the target; the web build is not.

Every step is one command of one helper, `apps/heartseed/scripts/sim.ts`, an
Effect CLI that prints one JSON line per command. It is the shared driver
`@manna/sim` (`packages/sim`) run with Heartseed's values,
`apps/heartseed/scripts/sim-app.ts`: the simulator named `verify-heartseed`
(an iPhone 17, created when missing, never another one), the bundle
`app.heartseed` and its `heartseed://` links, the dev server on a port of
8280-8289, and iOS alone. A web ask (`--platform web`) fails `BadArguments`
before anything is created.

The owner's rules:

- Drive only `verify-heartseed`. The helper names it or its udid in every
  simulator call, and never uses `booted` or `all`; never erase a
  simulator, and never boot or drive another one (`verify-hymnal` is the
  hymnal's) or the owner's iPhone.
- Never drive the owner's previews on ports 8191 and 8095.
- No screenshot, no recording and no sound: the screen is read from the
  accessibility tree, by the helper's snapshot. Never ask the helper for a
  shot, a video or a journey that records one.
- The microphone stays revoked.

Run every command from the repo root of a worktree of the commit under
test. `RUN` names this run (`heartseed-<topic>`), `EVIDENCE=$PWD/tmp/verify/$RUN`
is its proof folder (`tmp/` is git-ignored), and `PORT` is a free port of
8280-8289. The helper keeps the drive's session in session.json under
tmp/verify-heartseed, one drive at a time per checkout; never point its
`--state` at another app's state folder.

## Launch

1. **The worktree.** The helper refuses the warm main checkout
   (`/Users/cvr/Developer/personal/manna`, and `/workspaces/bible-tools` on
   the Workbox) with `WarmCheckout`, before it reads any argument: never
   drive or `bun install` there. In the worktree, run
   `bun install --frozen-lockfile` once, and again only when `bun.lock`
   changed.
2. **The host.** A 1-minute load at most 12 (`sysctl -n vm.loadavg`), swap
   below 8 GB (`sysctl -n vm.swapusage`), and at least 12 GB free on
   `df -h /System/Volumes/Data`. One Debug build leaves about 9.5 GB in the
   app's git-ignored `ios` folder (1.3 GB of Pods, the rest derived data).
   Run one iOS build on the host at a time. Short of disk, stop: a build
   that dies for disk is a host failure.
3. **Boot.** It boots `verify-heartseed` (creating it when missing), starts
   the dev server (`one dev`, its output in `$EVIDENCE/server.log`) and
   points the app at it:

   ```bash
   bun run --cwd apps/heartseed sim boot --port $PORT --out "$EVIDENCE"
   ```

   Ready is `{"ok":true,"command":"boot",…,"detail":{"udid":…,"port":…,"serverPid":…}}`
   once the server answers. `boot` ends while the server runs on.

4. **Build, install and launch** this checkout's app:

   ```bash
   bun run --cwd apps/heartseed sim install
   ```

   It runs `prebuild:native` (`one prebuild`, which writes the app's
   git-ignored `ios` folder and runs pod install) when that folder holds no
   Heartseed.xcworkspace, or with `--prebuild`. It adds the `heartseed` URL scheme to
   that folder's Heartseed/Info.plist (`detail.schemeAdded`), builds Debug for the simulator (arm64 only, its
   derived data in the `build` folder of the app's `ios`), installs,
   launches, and waits for `label=Isaiah 41:10`, the reference the
   launch's pending frame, the first minute, home (its furrow's title)
   and Today all show
   (`detail.expect`). The build log is `$EVIDENCE/build.log`; it
   ends `** BUILD SUCCEEDED **`, and `detail.buildMs` is the build's time.
   Cold, a build took 397 s on a loaded host; a later one is incremental.
   Lines with `error:` in a successful log are flag and file names, not
   failures. Pass `--prebuild` again when the `build` folder was removed:
   it holds the codegen pod install wrote. `--app <Heartseed.app>` installs
   a given build instead (a copy, the scheme added, signed ad hoc). There is
   no other build: never run one by hand.

5. **The microphone.** The app declares two prompts, speech recognition
   and the microphone (`apps/heartseed/vite/app.ts`), for dictation on a
   device; on the simulator it asks for neither, and no drive ever grants
   either. Keep the microphone revoked on the udid `boot` printed:

   ```bash
   xcrun simctl privacy <udid> revoke microphone app.heartseed
   ```

   The revoke stops the running app, and a link that launches the app
   lands on the screen the launch opens (the first minute on a fresh
   install, else home), so a drive's first step after it is `sim open /`.

## Doctor

Before the first drive, and again after any surprising result:

```bash
bun run --cwd apps/heartseed sim doctor
```

It is read only. It prints `detail` with `head` (the commit the checkout is
at: compare it with the commit under test), `audioHolders`, `load`, `cores`
and `timingsHold`; when `timingsHold` is false, no timing of this drive
claims anything. Or it fails with `Unhealthy` naming the first check that
does not hold (`server-pid`, `port-owner`, `server-answers`, `server-log`,
`native-source`); a simulator that is not booted fails as `SimulatorDown`.
`native-source` reads the app's log since boot and fails when the app's
latest process refused a native source its build lacks (One's "native
module natural.Natural changed; rebuild the app"): the installed build is
older than the JavaScript the server serves, so run `sim install`. It
sees a refusal only once the JavaScript has called the native source
([features/doctor.md](features/doctor.md)).

## Drive

The feature files write `bun run --cwd apps/heartseed sim` as `sim`. Each
step is one command:

```bash
bun run --cwd apps/heartseed sim open / --expect "label=Isaiah 41:10"
bun run --cwd apps/heartseed sim snapshot today
```

`sim open <link> --expect <target>` opens `heartseed://<link>`, answers the
"Open in “Heartseed”?" prompt with Open (`detail.prompts`), and waits for
the target. Into the running app already on `/`, it is a wait: the root
keeps the screen it shows (home, Today), so a feature file
writes `sim open / --expect "id=session" --no-relaunch` after a tap that
opens Today and `--expect "id=today-card" --no-relaunch` for home (no
plant chosen); a wait for
Today that lands on home is a finding to record, not a step to retry.
Without `--no-relaunch` a missing target terminates the app and opens once
more, and every launch opens home, so a wait for home would pass on a tap
that wrongly stayed on Today. The first open after `sim boot`, `sim install`,
the microphone revoke or `sim relaunch` keeps the retry: there the app may
still be launching. `sim snapshot <step>` writes the screen's nodes, as
`[role] "text"`, to `$EVIDENCE/snapshots/<step>.txt`; a feature file says
which nodes prove it. A target is `label=<accessible name>` or
`id=<testID>`, matched whole. `sim tap`, `sim scroll` and `sim back` work as
the hymnal's skill describes; in the first minute a reader taps `Listen`,
`Next`, `Say it` and `Continue`, on Today `Listen` (on a new verse),
`Say it`, a grade, a missed
word's mark, `Next` and `Your field` (back to home); on the
field, which is home, every launch's screen after the first minute: in
its fixed top the Today card (`id=today-card`, its lines `id=today-headline`
and `id=today-parts`, as Today's counts line is `id=session`) with one
button, `Start` or `Practice anyway`, or with a plant chosen the chosen
card (`id=chosen`) with `Practice <reference>` or `Learn <reference>`, or
the ask's `Remove` and `Keep`; in its scroll view `Add a list`
(`id=add-list`), in a furrow `Remove <reference>` (a Handbook list's
`Remove <title>`) and its plants (`<reference>, <stage>`, then `, ready
today` when ready), and at its end the rows `Settings` and `How Heartseed
works` (scroll to them first: `sim scroll "label=Settings" down`); in the Settings sheet `Done`, a `Minutes`
radio (`2 min` … `20 min`), `Voice` (its value `Off`, `Her` or `Him` in a
raw snapshot), an `Appearance` radio (`System`, `Light`, `Dark`) and
`About`; in the Add a list sheet (`Add a list` opens it) `Done`, a
shelf head by its title (`Any passage`, `Psalms`, …, `Seven Churches`) and an offer's
`Plant <reference>` or `Plant <title>`; on About its bar's `Your field`; on the chooser a book, a chapter, a verse, `Plant` and
the backs (`Add verses`, shown `‹ Add verses`, back to the sheet, `Books`, `Chapters`); and on the home's
development probe (`sim open probe/home --expect "label=Home probe"`,
`apps/heartseed/app/probe/home.tsx`) its one button
`Start with <reference>`; and on the light probe (`sim open probe/light
--expect "label=Light probe"`, `apps/heartseed/app/probe/light.tsx`)
`Listen`, `Back 3` and `Forward 3`.
Heartseed has no journey files yet. The features:

- [features/first.md](features/first.md): the first minute a fresh
  install opens on: hear it (the voice's lit words, silent on the
  simulator), say it with first letters, say it alone, Planted, then home
  in the done state (`first-home`). Run it first: the other features
  start from its `first-home`. Today is reached from home by `Start` once
  a verse is due (after a `sim relaunch`), else by `Practice anyway` or a
  plant and `Practice Isaiah 41:10`. Its `first-plantset` row pairs native
  semantic parity with same-head mounted-image receipts; AX cannot
  identify the hidden hand-drawn seed.
- [features/run.md](features/run.md): Today runs the session's plan one
  piece (a verse or a phrase) at a time: the verse under its cue, `Say it`, the result, `Next`,
  and the end (`The field is tended`, what grew, `Your field` the way on)
  with no `Say it`; the action button and the grades in
  a fixed footer; the verse due again after the first minute, through a
  `Minutes` tap in home's Settings. Run it from `first.md`'s `first-home`: `fade.md`, `grow.md`,
  `sayit.md` and `session.md` name the steps of it that are theirs.
- [features/today.md](features/today.md): Today, its header, reference,
  passage, the passage's stage line and its one action button, in the
  footer. Its `today-plantset` row reaches the seed from `first-home`
  without waiting for due, pairing AX parity with mounted-image receipts
  for the hidden 28 pt stage drawing.
- [features/sayit.md](features/sayit.md): Say it on Today, over the scripted
  replay on the simulator: the lit words, the mark and its peek, the count,
  the suggested grade and a changed one.
- [features/voice.md](features/voice.md): the voice's native module, built
  with the app, which the first minute's hear phase calls.
- [features/dictation.md](features/dictation.md): dictation's native
  module, built with the app and its prompts, and its scripted replay on
  the development probe (`apps/heartseed/app/probe/dictation.tsx`). Say it
  calls it on Today.
- [features/natural.md](features/natural.md): the natural voice's native
  module (Kokoro-82M), built for iOS 18, on its development probe
  (`apps/heartseed/app/probe/natural.tsx`) over the local model server:
  the checked download, a corrupt file and a lost server, a read's lit
  words (silent on the simulator), the crash marker and the remove; and
  Today reading by it (`today-*`): the download's line and `Try again`
  in the Settings sheet,
  Her and Him's packs, and the crash fuse.
- [features/fade.md](features/fade.md): cues that fade by stage on Today:
  the passage in first letters at a seed, nothing at a blade, and a recital
  said under that cue; Again brings the letters back. Its rows are steps
  of `run.md`'s drive.
- [features/grow.md](features/grow.md): the passage's stage on Today (seed,
  blade, ear, full corn), the growth line, the stage kept across a
  restart in the device's store, and the growth sound's native module,
  which logs each play it skips on the simulator. The shared hand-drawn
  set is checked by `first.md`'s `first-plantset` and `today.md`'s
  `today-plantset`; hidden artwork is test evidence, not an AX visual claim.
- [features/session.md](features/session.md): the daily session: the
  `Minutes` radios and the `Voice` button (Off, Her, Him, a tap the next)
  in home's Settings sheet and nowhere on Today, kept across a relaunch,
  the old switch's Off carried over, and Today's counts line atop the
  scroll view. Run
  it from `first.md`'s `first-home`, before `run.md` step 3.
- [features/field.md](features/field.md): the field, the app's home,
  which every launch opens and Today's `Your field` leads back to, with
  the Today card's `Start` to Today: a furrow per passage with its caption, a
  plant button per verse at its stage, the local days sown from 04:00 (each by the zone
  offset its record holds), which never fall, and the harvest.
- [features/about.md](features/about.md): the About screen, from the
  `About` of home's Settings sheet: the natural voice's credits and the
  Apache License 2.0 whole, and the way back to the field.
- [features/passage.md](features/passage.md): choosing passages: the
  field's `Add a list` under `Lists` or the limit line, the chooser
  (books, chapters, a chapter's verses, the range clipped to 20, `Plant`
  in a fixed footer), a row's `Remove` and its one ask, and Today over the
  passages chosen, the first day and after the next 04:00. Run it from
  `first.md`'s `first-home`; its second session comes after the next 04:00.
- [features/wake.md](features/wake.md): a return to the foreground makes
  the plan again with no tap (a due verse offers `Start`, a shown result goes),
  and changes nothing while a recital is under way; a new verse's `Listen`
  beside `Say it` (live in `passage.md`'s `passage-new`). Run it from
  `first.md`'s `first-home`, in place of `run.md` step 6.
- [features/promise.md](features/promise.md): the promise collections:
  the Fear collection's row on the field, no `When I need…` on home or
  Today (`need-gone`), and the first Fear phrase after the next 04:00.
  Run it from `first.md`'s `first-home`; its second session comes after
  the next 04:00.
- [features/phrase.md](features/phrase.md): long verses learned as
  phrases first, then joined: John 3:16 planted as a passage, its first
  phrase `John 3:16 [1-6]` new after the next 04:00 with `Listen` and
  `Say it` over its six words, and the field folding the phrase into
  `John 3:16, seed`. Run it from `first.md`'s `first-home`; its second session
  comes after the next 04:00 (`passage.md`'s `passage-new` with John 3:16
  in place of John 15:1-5).
- [features/light.md](features/light.md): each word lit as the voice
  reads it, in the reading view (`id=reading`, a `word-<i>` node per
  word), on the light probe (`apps/heartseed/app/probe/light.tsx`: John
  3:16, `Back 3` and `Forward 3` seeking, a swipe that scrolls and never
  holds) and on Today's `Listen`; the hold-and-drag seek and VoiceOver's
  `Read from here` are the owner's phone rows. Run it from `first.md`'s
  `first-home`.
- [features/app-icon.md](features/app-icon.md): the app icon (light, dark,
  tinted), its name and both launch screens, from one mark in brand C's
  colours, read from the build's asset catalog and Info.plist, never from
  a screenshot.
- [features/appearance.md](features/appearance.md): every screen in brand
  C's light or dark as the reader's appearance (System, Light or Dark,
  chosen in home's Settings sheet) and the system's say, in SF Rounded, on the
  development probe (`apps/heartseed/app/probe/theme.tsx`): the system,
  the stored appearance, the interface style, the scheme, its ground and
  the face; light and then dark with no tap, a choice of Light over a
  dark system, kept across a relaunch, and System again.
  Run it from `first.md`'s `first-home`.
- [features/handbook.md](features/handbook.md): Haskell's Bible Handbook
  as 25 shelves of the Add a list sheet after `Rest`, each list planted whole into
  a furrow titled by the list with `Remove <title>`, one plant per verse,
  the limit of 3 over passages and lists, and its development probe
  (`apps/heartseed/app/probe/handbook.tsx`): the sections, lists, ranges
  and verses, every verse resolved in the device's corpus. Run it from
  `first.md`'s `first-home` on a fresh install.
- [features/home.md](features/home.md): the home's rules (the greeting,
  the furrows with their kinds, icons, captions and ready marks, the
  lists, the shelves Add a list will offer, and a start at the
  session) on the development probe (`apps/heartseed/app/probe/home.tsx`)
  over the live garden, the row `home-icons` (the home's 24 icon PNGs
  loaded on the device), the row `home-probe-motion` (the motion plan
  over the live furrows), and the field in its layout: the greeting and
  the Today card with one `Start` or `Practice anyway` fixed on top,
  furrows of plant buttons with their captions and no numbers, a choice
  with `Practice` or `Learn`, `Add a list` under `Lists`, the gold dot on
  a ready plant, every control there at once while the drawings enter
  (`home-motion-reach`); and home as the root: `Continue` and every
  relaunch open it, Today's `Your field` leads back to it, and the
  `Settings` row at the field's end (the sheet with Minutes, Voice, the
  appearance and About; Today with no choices). Run it from `first.md` (`first-planted` or
  `first-home`).
- [features/doctor.md](features/doctor.md): `sim doctor` against an
  installed build older than the served JavaScript: the row
  `doctor-native-stale` (a native contract changed in the working tree,
  the natural probe's `Load` refused, `native-source`) and
  `doctor-native-fresh` (the source restored, the doctor ok).

Reach a state the way a reader does (a tap, a scroll), never by writing the
app's storage.

## Gotchas

- **The first bundle.** The first open after a fresh dev server waits on
  the bundle: `sim install` waits up to 180 s for the reference (`--timeout`)
  before it fails `ReadinessTimedOut`.
- **The passage comes from the server's bundle**, so a change to the corpus
  or to the display rule shows after the server restarts (`sim down`, then
  `sim boot`), with no rebuild of the app.
- **The Hermes compiler.** `sim boot` hands the dev server the
  `hermes-compiler` that the checkout's react-native depends on
  (`detail.hermesc`), not the pod's. A red box naming the Hermes compiler
  means it did not: give the caller's `HERMESC_PATH` an absolute path to a
  working `hermesc` and boot again.
- **A dynamic import in the dev runtime.** A red box or `server.log` naming
  `Invalid expression encountered` at `import(` means the rolldown vxrn
  resolves emits a dynamic import in its dev runtime, which Hermes cannot
  parse (rolldown 1.3.0 did);
  `bun run --cwd apps/heartseed test:devbundle` names it. The hymnal's
  devDependency `rolldown` is the one vxrn gets.
- **A preserved install serves new JavaScript.** A change to a native
  module's contract (a method, its parameters, a view) needs a rebuild:
  the installed app refuses the call, and the refusal ("native module
  natural.Natural changed; rebuild the app") shows only in the app's log,
  as a step that silently does nothing. `sim doctor` fails `native-source`
  once the JavaScript has called it; run `sim install` (with `--prebuild`
  when the native folder changed).

## Evidence

All of it goes under `$EVIDENCE`, outside the tracked files: `server.log`,
`build.log`, each command's JSON line, the session file `sim down` files
there, and the snapshots. A snapshot of Today holds the passage's words:
read it for the feature's nodes, report only counts, booleans and the
reference, and delete the `snapshots` folder once read. A flaky step is
reported as n/n trials with the load; a failure is run again on the base
commit, in its own worktree and port, to tell a new failure from an old
one.

## Cleanup

```bash
bun run --cwd apps/heartseed sim down
```

`sim down` closes the driver session, shuts down `verify-heartseed` (kept
for the next drive, never erased), asks agent-device to stop its daemon in
the drive's own HOME (the state folder's `home`), stops the dev server by
its recorded pid and start time (never by name or port), and only then
files the session into `$EVIDENCE`. A second `sim down` fails `NoSession`.
When disk is short (under 12 GB free), or when the worktree's work is done,
`sim down --clean` also deletes the app's build output, the `build` folder
of `apps/heartseed/ios` (the clean paths of `apps/heartseed/scripts/sim-app.ts`),
after checking it lies inside the app. The next build is cold again, and
needs `--prebuild`. Delete `apps/heartseed/ios` whole only when prebuild
must run afresh. Evidence stays.

## Helpers

`apps/heartseed/scripts/sim.ts` (`bun run --cwd apps/heartseed sim <command>`;
`--help` on any command). Every command prints one JSON line on stdout and
exits 0, or a line with `"ok":false` and its error's `_tag` and exits 1. The
driver's commands, its tags, the drivers' own HOME and the stop rule are the
hymnal's (`.claude/skills/verify-hymnal/SKILL.md`, Helpers, and
`packages/sim/README.md`). Its tests: the driver's in `packages/sim/src`,
and Heartseed's values and refusals in `apps/heartseed/scripts/sim.test.ts`.

## Hosts

- **The laptop** (macOS): iOS. This skill uses ports 8280-8289 only; the
  hymnal's are 8270-8279 and the owner's previews hold 8191 and 8095. The
  natural voice's model server (`natural:serve`,
  [features/natural.md](features/natural.md)) takes another free port of 8280-8289 than the dev server's.
- **The Workbox** (Linux): no iOS simulator, so no drive there.
