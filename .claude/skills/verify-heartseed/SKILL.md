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
   Heartseed.xcworkspace, or with `--prebuild`. One warning is known and
   harmless: the vxrn patch "matched nothing in RCTTurboModule.mm - it is
   stale" (One's, not the app's). It adds the `heartseed` URL scheme to
   that folder's Heartseed/Info.plist (`detail.schemeAdded`), builds Debug for the simulator (arm64 only, its
   derived data in the `build` folder of the app's `ios`), installs,
   launches, and waits for `label=Isaiah 41:10`, the reference the
   launch's pending frame, the first minute and Today all show
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
   install, else Today), so a drive's first step after it is `sim open /`.

## Doctor

Before the first drive, and again after any surprising result:

```bash
bun run --cwd apps/heartseed sim doctor
```

It is read only. It prints `detail` with `head` (the commit the checkout is
at: compare it with the commit under test), `audioHolders`, `load`, `cores`
and `timingsHold`; when `timingsHold` is false, no timing of this drive
claims anything. Or it fails with `Unhealthy` naming the first check that
does not hold (`server-pid`, `port-owner`, `server-answers`, `server-log`);
a simulator that is not booted fails as `SimulatorDown`.

## Drive

The feature files write `bun run --cwd apps/heartseed sim` as `sim`. Each
step is one command:

```bash
bun run --cwd apps/heartseed sim open / --expect "label=Isaiah 41:10"
bun run --cwd apps/heartseed sim snapshot today
```

`sim open <link> --expect <target>` opens `heartseed://<link>`, answers the
"Open in “Heartseed”?" prompt with Open (`detail.prompts`), and waits for
the target. `sim snapshot <step>` writes the screen's nodes, as
`[role] "text"`, to `$EVIDENCE/snapshots/<step>.txt`; a feature file says
which nodes prove it. A target is `label=<accessible name>` or
`id=<testID>`, matched whole. `sim tap`, `sim scroll` and `sim back` work as
the hymnal's skill describes; in the first minute a reader taps `Listen`,
`Next`, `Say it` and `Continue`, on Today `Say it`, a grade, a missed
word's mark and `Your field`, and on the field `Today`. Heartseed has no journey files yet. The features:

- [features/first.md](features/first.md): the first minute a fresh
  install opens on: hear it (the voice's lit words, silent on the
  simulator), say it with first letters, say it alone, Planted, then Today
  at a seed. Run it first: the other features start from its Today.
- [features/today.md](features/today.md): Today, its header, reference,
  passage, the passage's stage line and its one button.
- [features/sayit.md](features/sayit.md): Say it on Today, over the scripted
  replay on the simulator: the lit words, the mark and its peek, the count,
  the suggested grade and a changed one.
- [features/voice.md](features/voice.md): the voice's native module, built
  with the app, which the first minute's hear phase calls.
- [features/dictation.md](features/dictation.md): dictation's native
  module, built with the app and its prompts, and its scripted replay on
  the development probe (`apps/heartseed/app/probe/dictation.tsx`). Say it
  calls it on Today.
- [features/fade.md](features/fade.md): cues that fade by stage on Today:
  the passage in first letters at a seed, nothing at a blade, and a recital
  said under that cue; Again brings the letters back. Run it after
  `first.md`, before `grow.md` and `sayit.md`.
- [features/grow.md](features/grow.md): the passage's stage on Today (seed,
  blade, ear, full corn), the growth line, the stage kept across a
  restart in the device's store, and the growth sound's native module,
  which logs each play it skips on the simulator.
- [features/field.md](features/field.md): the field, reached from Today's
  `Your field` and back by `Today`: a row per passage, a plant per verse at
  its stage, the UTC days sown, which never fall, and the harvest.

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
  hymnal's are 8270-8279 and the owner's previews hold 8191 and 8095.
- **The Workbox** (Linux): no iOS simulator, so no drive there.
