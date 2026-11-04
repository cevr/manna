---
name: verify-hymnal
description: >
  Launch, check and drive the hymnal app (apps/hymnal, One: React Native on
  iOS and react-native-web) as a reader does, and keep the proof. Use to run
  the hymnal on its own iOS simulator (verify-hymnal) or in a headless
  browser, to open a hymn by deep link or route, to tap and scroll the hymn
  list, a hymn, the player, search or settings, or to check a hymnal change
  in the real app before review or merge.
---

# Verify the hymnal

The hymnal is one One app (README of `apps/hymnal`): the same tree runs on
iOS from a Debug build that loads its JavaScript from a dev server, and on
the web from that dev server. Both launch models go through one helper,
`apps/hymnal/scripts/sim.ts`, an Effect CLI that prints one JSON line per
command. It is the shared driver `@manna/sim` (`packages/sim`) run with the
hymnal's values, `apps/hymnal/scripts/sim-app.ts`:

- **iOS** (the default): the simulator named `verify-hymnal` (created when
  missing, never another one), a Debug build of this checkout installed on
  it, the dev server on a port of 8270-8279.
- **Web**: the same dev server, driven in a muted headless browser through
  `agent-browser`.

Never drive the owner's preview (ports 8191 and 8095) or the owner's
iPhone, and never boot, erase or drive another unit's simulator.

Run every command from the repo root. `RUN` names this run
(`hymnal-<topic>`), `EVIDENCE=$PWD/tmp/verify/$RUN` is its proof folder
(`tmp/` is git-ignored), and `PORT` is a free port of 8270-8279. The
helper keeps the drive's session in session.json under tmp/verify-hymnal; one
drive at a time per checkout, or give each its own `--state <dir>`.

## Launch

1. Work in a worktree of the commit under test. The helper refuses the
   warm main checkout (`/Users/cvr/Developer/personal/manna`, and
   `/workspaces/bible-tools` on the Workbox) with `WarmCheckout`, before it
   reads any argument: never drive or `bun install` there. In the worktree,
   `bun install --frozen-lockfile` once, and again only when `bun.lock`
   changed.
2. Check the host first: a 1-minute load at most 12 (`sysctl -n vm.loadavg`),
   swap below 8 GB (`sysctl -n vm.swapusage`) and at least 10 GB free
   (`df -h /System/Volumes/Data`). A cold iOS build takes about 15 minutes
   and some GB of disk in the app's generated ios folder (git-ignored).
3. Boot. It starts the dev server (`one dev`, its output in
   `$EVIDENCE/server.log`) and, on iOS, boots `verify-hymnal` and points the
   app at the server:

   ```bash
   bun run --cwd apps/hymnal sim boot --platform ios --port $PORT --out "$EVIDENCE"
   ```

   Ready is `{"ok":true,"command":"boot",…,"detail":{"udid":…,"port":…,"serverPid":…}}`
   once the server answers. `--platform web` opens the app's `/` in the
   browser instead.

4. iOS only, build and install this checkout's app:

   ```bash
   bun run --cwd apps/hymnal sim install --prebuild
   ```

   It runs `prebuild:native` (with `--prebuild`, or when the app's generated
   ios folder is missing): `one prebuild`. One checks its SDK bindings against
   both the device and simulator SDKs (onejs/one#991). The helper adds the
   `hymnal` URL scheme to that folder's Info.plist (git-ignored),
   builds Debug for the simulator (arm64 only), installs, launches, and
   waits for `label=Hymns`. The build log is `$EVIDENCE/build.log`. Leave
   `--prebuild` off while that folder is fresh: the build after the
   first is incremental. Pass it again when the folder's `build` was
   removed: it holds the codegen pod install wrote, and a build without it
   fails with "Build input file cannot be found". `--app <Hymnal.app>` installs a given build instead
   (a copy, the scheme added, signed ad hoc).

## Doctor

Before the first drive, and again after any surprising result:

```bash
bun run --cwd apps/hymnal sim doctor
```

It is read only. It prints `detail` with `head` (the commit the checkout is
at: compare it with the commit under test), `audioHolders` (lines of
`pmset -g assertions` that hold audio out), `load`, `cores` and
`timingsHold`; when `timingsHold` is false, no timing of this drive claims
anything. Or it fails with `Unhealthy` naming the first check that does not
hold: `server-pid` (the recorded `sim serve` runs: its pid still holds the
start time `boot` recorded, `serverStarted` in the session file; a legacy
session, an older `sim`'s with no start time, fails it, so run `sim down`
and boot again), `port-owner` (the port
is held by that process or a child of it), `server-answers` (the server
answers), `server-log` (no failure line in `server.log`); on iOS a simulator
that is not booted fails as `SimulatorDown`.

## Drive

The feature files write `bun run --cwd apps/hymnal sim` as `sim`. Run a feature as its journey, in one call:
`sim journey <feature> [--skip-video]`. It decodes `features/<feature>.journey.json`, records
`video/<feature>.mp4` (none with `--skip-video`), and runs each step: its action, its expects, then its
receipts (`$EVIDENCE/snapshots/` and `$EVIDENCE/shots/`, named `<feature>-<nn>-<step>`). It prints one JSON line per step and a
summary, appends every line to `$EVIDENCE/results.jsonl`, and stops at the first failed step, which the
summary names in `failedStep` and `failedName`. The journeys:

- [features/about.journey.json](features/about.journey.json), [features/browse.journey.json](features/browse.journey.json), [features/chords-and-capo.journey.json](features/chords-and-capo.journey.json),
  [features/feel.journey.json](features/feel.journey.json), [features/follow.journey.json](features/follow.journey.json), [features/hymn-list.journey.json](features/hymn-list.journey.json),
  [features/hymn-reader.journey.json](features/hymn-reader.journey.json), [features/player.journey.json](features/player.journey.json), [features/search.journey.json](features/search.journey.json),
  [features/settings.journey.json](features/settings.journey.json).

The recipe beside each says what to read in its receipts and which steps stay by hand
([features/README.md](features/README.md)). A by-hand step is one `sim` command:

- `sim open <link> --expect <target>`: `hymnal://hymns/100` on iOS, `http://127.0.0.1:$PORT/hymns/100` on
  the web. On iOS it answers the "Open in “Hymnal”?" prompt with Open (`detail.prompts`).
- `sim tap <target>`, `sim fill <target> <text>`, `sim back`, and
  `sim scroll <target|screen> <up|down|left|right>` (`screen right` turns a hymn page on).
- `sim gesture pan <from> <dx> <dy> [--ms 900]` pans from a target's centre. From `id=dial-key`,
  `dx -52` at 900 ms turns one detent; 300 ms glides past two; 1500 ms stops surest.
- `sim gesture edge-pan` is the back pan from the screen's left edge; a leftward swipe turns the pager on.
- `sim gesture pinch <at> <scale>` pinches two fingers about a point (`x,y`) or a target's centre: a scale
  below 1 closes the fingers (a pinch in), above 1 spreads them, at most 4. agent-device sets the pinch's
  speed, so there is no `--ms`. On iOS the home list has no testID in the tree: pinch it at a point
  (`200,450`).
- `sim hold <target> [--ms 900] [--settle 10]`: the press lands 5 to 9 s after it returns, so `--settle`
  waits; leave 10 s between two holds, or they read as one. `sim relaunch` starts the app afresh.
- A target is `label=<accessible name>` or `id=<testID>`, matched whole. Where a name matches twice, put
  the role first: `role=link label=100, Great Is Thy Faithfulness`, `role=button label=Search`. Name a
  target, never a coordinate or a style; the edge pan, and a pinch where no target covers the place, alone
  start at a point.
- Reach a state the way a reader does: a tap, a scroll, a deep link the app answers. Never write the
  app's storage or call its atoms to get there.

## Tool notes

What the drivers do that a step does not show:

- **The first open after a relaunch lands on the home list.** `sim open` and a journey's open terminate
  the app and open once more on iOS `TargetMissing` (`detail.retried`), never a third time.
- **The pod hermesc.** `sim boot` points the dev server at the checkout's own `hermes-compiler`
  (`detail.hermesc`); a red box "native iOS dev bytecode needs the pod hermesc" means it did not.
- **`label=Key` matches two elements** while chords are on (the bar's button and the word inside it):
  tap `id=key-button`.
- **The follow checker's `TIMING`** (`apps/hymnal/scripts/follow/samples.ts`) lets a mark sit 1500 ms
  from its line's span and assumes a snapshot of about 1 s. When a snapshot takes 2 s (a loaded host),
  `adrift` is a coin toss: read the snapshot's time in the JSON, and claim `adrift` only from a run
  whose snapshots take about 1 s.
- **The web client** (D3): run [Web client](features/web-client.md) after `sim boot --platform web`,
  before any web step. Server HTML alone can satisfy `sim open hymns/100 --expect "label=Stanza 1"`:
  also prove hydration, a home row click and Open player → Reading, with no route-error overlay or raw
  RNW CommonJS requests, by the recipe's numeric and boolean proof; keep hymn words out of evidence.
- **Frame readers** of a journey's video, from the repo root, print one line per frame and read no
  words: `bun .claude/skills/verify-hymnal/scripts/bartop.ts <video.mp4> [from] [to]` prints the bar's
  height in points (its top hairline, the 3x screen of an iPhone 17 Pro);
  `bun .claude/skills/verify-hymnal/scripts/knob.ts <video.mp4> [from] [to]` prints the seeker knob's
  centre `x` while the bar stands tall. Fit the knob's `x` to the clock to prove the seeker moves on
  time (`player-spring`, `chords-sound`).

## Argent

[Argent](https://github.com/software-mansion/argent) 0.30.1 reads what `sim` cannot: React render counts and durations, a Hermes CPU profile of the app itself (not a desktop Hermes stand-in), the React component tree, the JS console, and Instruments traces. Its skills are vendored beside this one (`argent-ios-simulator-setup`, `argent-device-interact`, `argent-react-native-profiler`, `argent-react-native-optimization`, `argent-native-profiler`, `argent-metro-debugger`, `argent-react-native-app-workflow`). It reads beside `sim` and never drives: `sim` stays the journey driver. Measured on One 2.11.1 (`~/Developer/personal/manna/tmp/orchestrate/hymnapp/argent/report.md`, 2026-10-28): it attaches, names components, profiles heavy transitions, samples the CPU, reads the console and the accessibility tree; it places no taps and counts no renders in smooth interactions.

- **Install.** The `argent` binary, installed once per machine with Bun: `bun add -g @swmansion/argent@0.30.1`, then `bun pm -g trust tree-sitter tree-sitter-typescript tree-sitter-javascript @fails-components/webtransport-transport-http3-quiche` (Bun blocks their native install scripts, and argent needs them). Check with `argent --version` (`~/.bun/bin/argent`). Never run it through `npx` inside this repo: npm reads the root `package.json`, refuses its Bun catalog override (`EOVERRIDE`), and the server never starts.
- **Reach it.** In a session that loads the project's `.mcp.json` (it runs `argent mcp`), as the `mcp__argent__*` tools. Elsewhere (orchestrate workers have no MCP servers), as `DO_NOT_TRACK=1 argent run <tool> --help`, then the call; `argent tools` lists the tools.
- **Telemetry** stays off: `.mcp.json` sets `DO_NOT_TRACK`, and every CLI call above sets it too.
- **No screenshots.** The project flag in `.argent/flags.json` (`disable-auto-screenshot`) stops the screenshot argent takes after each action; read the accessibility tree it returns instead. Never call its `screenshot`, `screenshot-diff` or screen-recording tools on a hymn page.
- **The tree holds hymn words.** `describe` and the component tree carry what the screen shows: match by hymn number, testID and accessibility handle, as `sim` does, and copy no text from them into evidence, logs or reports.
- **Only the `verify-hymnal` simulator.** Take its udid from `list-devices` and pass it on every call. Never target an entry of kind `"device"` (the owner's iPhone is one over USB), and never boot, erase or drive another simulator.
- **No sound.** `boot-device` boots muted unless asked; never pass `sound: true`, and never enable the `boot-sound` flag.
- **Read, never steer.** `debugger-evaluate` may read state for a measure; it never writes storage or calls the app's atoms to reach a state (Drive).
- **Attach to One's dev server.** Pass `--port $PORT` (argent defaults to Metro's 8081) and the simulator's udid as `--device_id` to the `debugger-*` and profiler tools.
- **No tap points on One.** `debugger-component-tree` names components but gives no tap points, and `onScreenOnly` filters nothing: argent reads the screen size through Metro's `__r`, which One's Rolldown bundle lacks. Tap by `sim` targets.
- **Hot commits only.** The React profiler keeps per-component detail only for commits of 16 ms or more: profile a heavy transition (opening a hymn), not a smooth scroll. `react-profiler-renders` counts live components, not renders.
- **Analyze needs the root.** `react-profiler-analyze` takes `--project_root <checkout>/apps/hymnal --platform ios`.
- **The CPU profile is coarse.** About one sample per 12 ms on a dev bundle, with dev-only frames: a share under a few samples is a guess.
- **`describe` shows testIDs** (`row-number`, `row-title`) that `sim`'s snapshot does not.
- **Trash argent's files after a run.** It writes profiles to `$TMPDIR/argent-profiler-cwd/` (commit files may hold props, so hymn words) and logs to `~/.argent/tmp/`; neither may reach evidence or the repo.

## Evidence

All of it goes under `$EVIDENCE`, outside the checkout's tracked files:

- `sim journey` takes the video, the receipts and `results.jsonl` itself
  (Drive). A by-hand step adds its own: `sim record start <name>` and
  `sim record stop` around it (`video/<name>.mp4` on iOS, `.webm` on the
  muted web), its JSON line appended to `$EVIDENCE/results.jsonl`, then
  `sim snapshot <step>` (`snapshots/<step>.txt`) and `sim shot <step>`
  (`shots/<step>.png`). Prove a video plays: `ffprobe` reports a duration
  above 0. Skip it only when a run says why.
- `sim log` at the end: `app.log` (the simulator's log for Hymnal since
  boot) or `console.log` (the page's console), beside `server.log`.
- A choice the app keeps (a setting) is proved by a second view: leave the
  screen and come back, or relaunch, and read it again.
- A flaky step is reported as n/n trials with the load.
- A failure is run again on the base commit, in its own checkout and port,
  to tell a new failure from an old one.
- A feature that is not in the build under test is reported as
  `TargetMissing` with the reason from its feature file, never as passed
  through another path.

## Cleanup

```bash
bun run --cwd apps/hymnal sim down --clean
```

`sim down` closes the driver session, shuts down `verify-hymnal` (iOS),
asks agent-device to stop its daemon in the drive's own HOME, stops the dev
server by its recorded pid and start time (never by name, and never a pid
whose start time no longer matches), and only then moves the session file
into `$EVIDENCE` (as `session.json`, or `session-<n>.json` beside one filed
there already; it never replaces a file). A legacy session (no
`serverStarted`) is filed away with no signal and
`detail.serverStopped: false`: stop its server by hand, after checking with
`ps -o lstart= -p <pid>` that the pid is still it. `down` keeps the drive's
HOME (the state folder's `home`) for the next boot, which reuses
agent-device's runner build there. A `down` that fails, is interrupted or
is killed before the server is stopped leaves the session file in the
state, so run `sim down` again: it finds the server and stops it. One that
could not close a driver (its HOME no longer a folder, an `Escaped`
refusal) still stops the server and files the session, then fails with
that error. `boot`, `down` and `down --clean` hold the state while they
run (the state folder's `holders` folder, one link per holding command,
never removed); a second one at once fails `StateBusy` naming the holder's
pid, and changes nothing. A holder whose command was killed is known by
its pid's start time and reclaimed by the next command. `--clean` then deletes the app's build
output (the clean paths of `apps/hymnal/scripts/sim-app.ts` `app`: the `build` and
`Pods` folders of `apps/hymnal/ios`, and `apps/hymnal/dist`, each checked
to lie inside the app first) and fails `Unhealthy` (`port-free`) while
something still listens on the port. Plain `sim down` keeps the build for
the next incremental one. Evidence stays.

## Helpers

`apps/hymnal/scripts/sim.ts` (`bun run --cwd apps/hymnal sim <command>`;
`--help` on any command). Every command prints one JSON line on stdout,
`{"ok":true,"command":…,"platform":…,"paths":{…},"detail":{…},"ms":…}`, and
exits 0; or `{"ok":false,"command":…,"message":…,"error":{"_tag":…},"ms":…}`
and exits 1 (`journey` prints one line per step, then its summary). The
tags: `WarmCheckout`, `NoSession`, `SimulatorDown`, `ReadinessTimedOut`,
`TargetMissing` (with what the driver said), `TargetShown` (a `hides`
expect still showed), `BadJourney` (a journey file that does not decode),
`ToolMissing`, `ToolFailed`, `NotOnPlatform`, `HostFailed`, `Escaped` (the
contained host refused a path that leads out of its roots), `Unhealthy`,
`BootRefused` (`boot` started nothing: the state holds a live, legacy or
undecodable session, or the browser's socket path would not fit),
`StateBusy` (another `boot` or `down` holds the state; it names that
command's pid), `BadArguments` (an unknown command or flag; the help goes
to stderr). agent-device and agent-browser run with `HOME` the drive's own
folder, `<state>/home` (mode 0700; `paths.home` in `boot`'s line), and
agent-browser's sockets in `/tmp/sim-<hash of that HOME>`, so they never
read or write the caller's `~/.agent-device` or `~/.agent-browser`; every
other tool keeps the caller's environment. A link in that HOME that leads
out of the state, or a socket folder that is a link or holds one at the
session's files, fails the step with error `Escaped` before the driver
runs. `boot`'s line records the server's identity (`detail.serverPid` and
`detail.serverStarted`), as the session file does. The
commands: `boot`, `install`, `doctor`, `journey`, `open`, `tap`, `back`,
`fill`, `scroll`, `gesture`, `hold`, `relaunch`, `shot`, `snapshot`,
`record`, `log`, `down`, and `serve` (the dev server's own process, which
`boot` starts). Its tests: the driver's in `packages/sim/src` (a stand-in
Drive or host, no device; `sim.slow.test.ts` and
`app.property.slow.test.ts` run by its `test:slow`), and the hymnal's
journey files' in `apps/hymnal/scripts/sim/features.test.ts`.

`apps/hymnal/scripts/sticky.ts` checks the home list's pinned topic row in
every frame of a recording: from `apps/hymnal`, on a booted `verify-hymnal`
and a Release build, `bun scripts/sticky.ts --udid <udid> --app <Hymnal.app>
--pass all --runs 3 --out "$EVIDENCE/sticky"`. It prints one JSON line per
pass and run, `{pass, run, frames, judged, missing, off, worst}`, and exits
0 only when no frame is off by more than 1 pt. It does not boot the
simulator, and a load above 12 drops frames: read such a run as no timing
claim and run it again. It trashes its `push` video once read, since that
video shows a hymn page. Its classifier's tests: `apps/hymnal/scripts/sticky.test.ts`.

## Hosts

- **The laptop** (macOS): iOS and web. The owner's previews hold 8191 and
  8095; this skill uses 8270-8279 only. The shell unit's simulator and
  ports 8260-8269 belong to another unit.
- **The Workbox** (Linux): no iOS simulator, so the web only. Unproven
  there: no run of this skill has been made on the Workbox.
