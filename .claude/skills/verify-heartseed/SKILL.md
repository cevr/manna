---
name: verify-heartseed
description: >
  Launch, check and drive Heartseed (apps/heartseed, One: React Native on
  iOS) as a reader does, and keep the proof. Use to build Heartseed for the
  iOS simulator, run it on its own simulator (verify-heartseed) against a
  dev server, read its screen through agent-device, or check a Heartseed
  change in the real app before review or merge.
---

# Verify Heartseed

Heartseed is one One app (`apps/heartseed`): a Debug build for the iOS
simulator that loads its JavaScript from a dev server (`one dev`). The
passage Today shows is made when the dev server bundles the app, from the
KJV in `@manna/core` (`apps/heartseed/vite/plugin.ts`), so a drive reads the
corpus the checkout holds. iOS is the target; the web build is not.

This is a start: the launch is the manual steps below, one shell command
each. Every command names the simulator `verify-heartseed` or its udid.
Never use `booted` or `all`, never `erase`, and never boot or drive another
simulator (`verify-hymnal` is the hymnal's) or the owner's iPhone. Never
drive the owner's previews on ports 8191 and 8095. No screenshot, no
recording and no sound: the screen is read from the accessibility tree.

Run every command from the repo root of a worktree of the commit under
test, never the warm main checkout (`/Users/cvr/Developer/personal/manna`).
Shell variables do not outlive one agent command, so each value is kept in
a file and read back:

- `RUN` names this run (`heartseed-<topic>`);
- `EVIDENCE=$PWD/tmp/verify/$RUN` is its proof folder (`tmp/` is git-ignored);
- `APP=$PWD/apps/heartseed`;
- `PORT` is a free port of 8280-8289, kept in `$EVIDENCE/port`;
- `UDID` is the udid of `verify-heartseed`, kept in `$EVIDENCE/udid`;
- `SESSION=heartseed-$RUN` is the agent-device session of this drive.

Append each command's exit code to `$EVIDENCE/exits.txt` as
`<step> exit <code>`: run it as `<command>; echo "<step> exit $?" >> "$EVIDENCE/exits.txt"`.

## Launch

1. **The worktree.** `bun install --frozen-lockfile` once, and again only
   when `bun.lock` changed. Then `mkdir -p "$EVIDENCE"`.
2. **The host.** A 1-minute load at most 12 (`sysctl -n vm.loadavg`), swap
   below 8 GB (`sysctl -n vm.swapusage`), and at least 12 GB free on
   `df -h /System/Volumes/Data`. One Debug build leaves about 9.5 GB in the
   app's git-ignored `ios` folder (1.3 GB of Pods, the rest derived data).
   Run one iOS build on the host at a time. Short of disk, stop: a build
   that dies for disk is a host failure.
3. **Prebuild.** It writes the app's git-ignored `ios` folder and runs pod
   install:

   ```bash
   bun run --cwd apps/heartseed prebuild:native > "$EVIDENCE/prebuild.log" 2>&1; echo "prebuild exit $?" >> "$EVIDENCE/exits.txt"
   ```

   Exit 0. One warning is known and harmless: the vxrn patch "matched
   nothing in RCTTurboModule.mm - it is stale" (One's, not the app's).
   Skip this step while `apps/heartseed/ios` is fresh from the same
   `vite.config.ts`.

4. **Build** Debug for the simulator, arm64 only, its derived data inside
   the `build` folder of the app's `ios` (git-ignored with it):

   ```bash
   xcodebuild -workspace "$APP/ios/Heartseed.xcworkspace" -scheme Heartseed -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath "$APP/ios/build/dd" SKIP_BUNDLING=1 ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build > "$EVIDENCE/build.log" 2>&1; echo "build exit $?" >> "$EVIDENCE/exits.txt"
   ```

   Read the log's tail only: it ends `** BUILD SUCCEEDED **`. Cold, it took
   397 s on a loaded host; a later build is incremental. Lines with
   `error:` in a successful log are flag and file names, not failures. The
   app is `$APP/ios/build/dd/Build/Products/Debug-iphonesimulator/Heartseed.app`.

5. **The simulator.** Find `verify-heartseed`:

   ```bash
   xcrun simctl list devices | grep 'verify-heartseed ('
   ```

   When it is missing, create it (an iPhone 17 on iOS 27.0) and keep its udid:

   ```bash
   xcrun simctl create verify-heartseed com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-27-0 > "$EVIDENCE/udid"
   ```

   Otherwise write the udid the list shows to `$EVIDENCE/udid`. Then, with
   `UDID=$(cat "$EVIDENCE/udid")`, boot it and wait for it:

   ```bash
   xcrun simctl boot "$UDID"; echo "boot exit $?" >> "$EVIDENCE/exits.txt"
   xcrun simctl bootstatus "$UDID" -b; echo "bootstatus exit $?" >> "$EVIDENCE/exits.txt"
   ```

   `boot` fails with "Unable to boot device in current state: Booted" when
   it is up already; `bootstatus` then answers at once.

6. **The dev server.** Pick a port of 8280-8289 that nothing listens on
   (`lsof -nP -iTCP:$PORT -sTCP:LISTEN` prints nothing) and write it to
   `$EVIDENCE/port`. Start `one dev` so it outlives the command that starts
   it: an agent runs it as a background task (Bash with
   `run_in_background`), a person in a terminal of its own. A detached `&`
   or `nohup` inside a one-shot shell dies with that shell. The command
   records its own pid, then becomes the server, with the pod's Hermes
   compiler for the native bundle:

   ```bash
   cd "$APP" && echo $$ > "$EVIDENCE/server.pid" && HERMESC_PATH="$APP/ios/Pods/hermes-engine/destroot/bin/hermesc" exec ./node_modules/.bin/one dev --port "$PORT" > "$EVIDENCE/server.log" 2>&1
   ```

   Ready when `curl -sf "http://127.0.0.1:$PORT/" > /dev/null` exits 0
   (within seconds). `server.log` shows `Server running` and the Local URL
   on the port.

7. **Point the app at the server, install and launch:**

   ```bash
   xcrun simctl spawn "$UDID" defaults write app.heartseed RCT_jsLocation "127.0.0.1:$PORT"; echo "jslocation exit $?" >> "$EVIDENCE/exits.txt"
   xcrun simctl install "$UDID" "$APP/ios/build/dd/Build/Products/Debug-iphonesimulator/Heartseed.app"; echo "install exit $?" >> "$EVIDENCE/exits.txt"
   xcrun simctl launch "$UDID" app.heartseed; echo "launch exit $?" >> "$EVIDENCE/exits.txt"
   ```

   The bundle id is `app.heartseed`. The app asks for no permission.

## Drive

agent-device (0.21.35 or later on the PATH) reads the screen through its own
session, named for this run, never another drive's:

```bash
agent-device open app.heartseed --platform ios --udid "$UDID" --session "$SESSION" --metro-port "$PORT" --no-record; echo "open exit $?" >> "$EVIDENCE/exits.txt"
agent-device wait text "Isaiah 41:10" 120000 --session "$SESSION"; echo "wait exit $?" >> "$EVIDENCE/exits.txt"
agent-device snapshot --session "$SESSION" > "$EVIDENCE/snapshot-today.txt"; echo "snapshot exit $?" >> "$EVIDENCE/exits.txt"
```

The first open bundles the app on the dev server, so the wait can take a
minute on a cold server. The snapshot lists the screen's nodes as
`[role] "text"`; a feature file says which nodes prove it. The features:

- [features/today.md](features/today.md): Today, its header, reference and
  passage.

Reach a state the way a reader does (a tap, a scroll), never by writing the
app's storage.

## Evidence

All of it goes under `$EVIDENCE`, outside the tracked files: `exits.txt`
(each step's exit), `prebuild.log`, `build.log`, `server.log`, and one
`snapshot-<step>.txt` a read. A report quotes the exit lines and the
snapshot's text nodes. A flaky step is reported as n/n trials with the
load; a failure is run again on the base commit, in its own worktree and
port, to tell a new failure from an old one.

## Cleanup

1. Close the driver's session:
   `agent-device close --session "$SESSION"`.
2. Stop the dev server by its recorded pid, never by name or port: read
   `$EVIDENCE/server.pid`, check `ps -o command= -p <pid>` shows the One dev
   server, and send that pid alone a SIGTERM. Nothing then listens on
   `$PORT`.
3. Shut the simulator down: `xcrun simctl shutdown "$UDID"`. Keep it for
   the next drive; it is never erased.
4. When disk is short (under 12 GB free), or when the worktree's work is
   done, delete the app's build output, the `build` folder of
   `apps/heartseed/ios`, after checking the path lies inside
   `apps/heartseed`. The next build is cold
   again. Delete `apps/heartseed/ios` whole only when prebuild must run
   afresh.

Evidence stays.

## Hosts

- **The laptop** (macOS): iOS. This skill uses ports 8280-8289 only; the
  hymnal's are 8270-8279 and the owner's previews hold 8191 and 8095.
- **The Workbox** (Linux): no iOS simulator, so no drive there.
