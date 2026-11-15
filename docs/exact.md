# Exact

Heartseed and the hymnal are being ported to [Exact](https://github.com/expo/exact): a view in Contract (`app.contract`), data in TypeScript (`app.ts`), tests as `*.test.contract` scripts. The ports live beside the current apps until they replace them:

| Workspace                                         | What                                                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/heartseed-exact` (`@manna/heartseed-exact`) | Heartseed on Exact, bundle id `app.heartseed.exact`                                                                                                        |
| `apps/hymnal-exact` (`@manna/hymnal-exact`)       | The hymnal on Exact, bundle id `im.cvr.hymnal.exact`                                                                                                       |
| `packages/exact-kit` (`@manna/exact-kit`)         | The command wrapper, the Effect runner, the host helpers for a port's tools (`prepare`, `drive`), the test helpers, and the lab (`packages/exact-kit/lab`) |

## Install

Exact is not a package: an app runs it from a clone, by path. Nothing of Exact is committed here.

1. Rust through rustup, Bun, Xcode 27.1 or later.
2. Clone and pin it:

   ```sh
   git clone https://github.com/expo/exact.git ~/Developer/vendor/exact
   git -C ~/Developer/vendor/exact checkout --detach d1a71d7cb6bb4477f452f9c7351c49bc9b88adb3
   ```

3. `bun scripts/exact.mjs setup` in the clone: it installs Exact's Rust toolchains (1.99.1 and a nightly, without changing `rustup default`), wasm-bindgen, Binaryen (`~/.cache/exact/binaryen`), Exact's own `node_modules`, Playwright's headless Chromium, and the Hermes bundles (`~/.cargo/hermes-lean-sys/`). `bun scripts/exact.mjs setup --check --platform ios` names what is still missing and changes nothing.

Exact needs the real `HOME`: rustup, Cargo and the Hermes bundles are found through it.

## The pin

Exact is pre-1.0 and lands about a hundred commits a day with no stability promise, so every app runs one commit:

**`d1a71d7cb6bb4477f452f9c7351c49bc9b88adb3`** (2026-11-15).

The pin is `EXACT_PIN` in `packages/exact-kit/src/run.ts`; its test holds this file to it. Only the `ex-pin` unit moves it: it moves the constant and this file together, runs every contract test of both apps on the web and iOS, and records what it cost.

## The wrapper: `bun run exact <verb>`

Every Exact command runs through the app's own script, from the app's folder:

```sh
cd apps/heartseed-exact
bun run exact contract build app.contract --json --errors-only
bun run exact test web
bun run exact test ios
bun run exact verify
bun run exact verify ios
```

`bun run exact` is the package's command `manna-exact` (`src/bin.ts`), which runs `@manna/exact-kit`'s wrapper (`main` in `src/main.ts`, over `runExact` in `src/run.ts`) for the app in the current folder. Each app's `exact.mjs` is the kit's launcher into the same wrapper, for Exact's own tools, which run `bun exact.mjs <verb>` inside a command. Never run Exact another way: not `bun <clone>/scripts/exact.mjs` on an app, not Exact's generated `exact.mjs`. The wrapper:

- **Refuses before any process starts**: `share`, `deploy` and `release` (they publish: the owner's alone), `update` and `snapback` (they write Exact's own `exact.mjs` and `AGENTS.md` over the app's, which run Exact past the wrapper and tell agents to share and send feedback), `feedback` with anything but `never` (feedback goes to Expo), `--sim` and `--device` (another simulator, or the owner's iPhone), a `--port`, or a caller's port variable (`EXACT_PORT`, `PORT`, `EXACT_TOOL_PORT`), not the app's, and `ios --run` or `mac --run` for a quiet app (Heartseed and the lab): a launch outside the agent speaks through the simulator, so a quiet app is built with `ios` alone and looked at with `agent ios`.
- **Refuses a rewritten app**: an `exact.mjs` that is not the kit's launcher, or an `AGENTS.md` that holds Exact's generated block (`<!-- exact:begin`), with the `git checkout` that restores them. The `exact-kit` unit test holds each app's `bun run exact` to `manna-exact`, so a rewritten `exact.mjs` cannot take the wrapper out.
- **Refuses a clone off the pin**, naming both commits, and a missing clone with how to clone it.
- **Sets, over whatever the caller's environment holds**: `EXACT` (the clone), `EXACT_FEEDBACK=0`, `EXACT_SIM` (the app's simulator), `PORT_LO` and `PORT_HI` (the app's spare range), and each variable the pinned Exact reads a listening port from: `EXACT_PORT` (`web`'s dev loop and the drives, before `PORT_LO`/`PORT_HI`), `PORT` (`serve`, and an app's fixture server) and `EXACT_TOOL_PORT` (the design tool's). Each is the caller's when it is the app's, else the app's own port for the verb that listens by it given no `--port` (`web` by `EXACT_PORT`, `serve` by `PORT`), else removed from what the child inherits. So no child listens outside the app's ports, whatever the caller's environment holds.
- **Takes the build lock** `/tmp/manna-exact-build.lock` (`lockf -k`) for `ios`, `mac`, and `test`, `verify` and `agent` on `ios`, `macos` or `mac`, so native builds and drives on this Mac run one at a time.

The clone is `~/Developer/vendor/exact`, under the home folder, unless `EXACT` names another; that is the one machine path the repo knows.

## Simulators, ports and the lock

|                                                 | Heartseed                | The hymnal            | The lab                  |
| ----------------------------------------------- | ------------------------ | --------------------- | ------------------------ |
| Simulator (iPhone 17, iOS 27.0)                 | `verify-heartseed-exact` | `verify-hymnal-exact` | `verify-heartseed-exact` |
| Web port (`bun run exact web`, `serve`)         | 8765                     | 8766                  | 8774                     |
| Spare ports (`test web`, `verify`, `agent web`) | 8770-8774                | 8775-8779             | 8774                     |
| Quiet (`ios --run` refused)                     | yes                      | no                    | yes                      |

The lab, `packages/exact-kit/lab`, is the kit's Effect probe (`docs/exact-data-layer.md`), run like an app from its own folder: `bun run exact test web`, `bun run exact test ios`, and its drive `bun run drive:lab web|ios` from `packages/exact-kit`. It shares Heartseed's simulator, so its native runs wait on the same build lock.

The current apps' simulators (`verify-heartseed`, `verify-hymnal`) and their ports are never Exact's. Exact's own default, "a simulator that's already booted", is never used: the wrapper always names the app's.

Create a missing simulator with `xcrun simctl create verify-heartseed-exact com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-27-0` (the hymnal's likewise). After an app's first install on it, revoke its microphone: `xcrun simctl privacy verify-heartseed-exact revoke microphone app.heartseed.exact`.

## Rules for agents

- Screenshots of the Exact simulators are allowed and stay under each app's `.exact/` (ignored). No sound, no recording, no microphone.
- A native build needs 12 GB free disk; it waits on the build lock itself.
- Never `share`, `deploy`, `release` or send feedback; the wrapper refuses them, and no other way is taken round it.
- `verify ios` and an iOS agent run leave Exact's touch runner (`xcodebuild test-without-building … exact-touches-<udid>`) running after they exit, by design: the next run on that simulator reuses it. A kept runner idles out in 10 minutes; never signal it, by hand or from a drive, since another run may be using it.
- Exact's type check (`contract build`, every build) stages the declarations of every package any `.ts` or `.js` file in the app's folder imports, and follows the import lines inside their doc comments, and refuses two copies of one package (`package declarations: two copies of …`). `effect`'s doc comments reach `rolldown`, so the root `package.json` overrides it to one version. A package imported by `app.ts` must ship declarations (`types` before `default` in its `exports`).
- The data layer is Effect through `@manna/exact-kit/effect`'s runner: `docs/exact-data-layer.md` (the rule, the evidence, a worked example).
- Each app's `tsconfig.src.json` (extending the root's) is the typecheck's; the app has no `tsconfig.json`, since Exact's type check reads that file and refuses a config that extends one outside the app.
- Exact's tests are run by hand per unit, as the film e2e is. `bun run gate` runs only each workspace's Bun tests and needs no clone: `app.ts` imports the generated `app.contract.d.ts`, so it stays out of the typecheck, which covers `src/` alone.

## Where a feature's files go

Each app keeps one feature in `features/<name>.contract` (its view), `src/<name>/**` (its logic, pure TypeScript with Bun tests), and `<name>.test.contract` beside `app.contract` (its contract tests: Exact's `test` and `verify` read only `*.test.contract` there). The root `app.contract` and `app.ts` take one line per feature. Logic of a current app is imported through its package's exports, never copied: each app's `src/no-copy.test.ts` fails on a file that shares more than a few lines with a current app's source (`noCopies` in `@manna/exact-kit/no-copy/testing`).

## A port's tools: `prepare` and `drive`

A port's host scripts live in its `tools/` and run under Bun, never inside Exact. The kit holds what they share, in plain TypeScript (no `effect`), each module tested over scratch folders or a stand-in machine:

- `@manna/exact-kit/prepare`: `linkExactModules(appDir, names, clone)` links each of Exact's standard modules the Contract uses into `node_modules/@exact/` from the clone (they are not on npm), and names every problem (a module the clone lacks, a folder where a link goes) before it writes anything. `writeGenerated(path, source)` writes a generated module only when its text changed, so its time is kept. The lab's `tools/prepare.ts` uses both; an app's `bun run exact` runs its own `tools/prepare.ts` first.
- `@manna/exact-kit/drive`: `makeDrive({ name, host, appDir })` runs steps through `bun run exact agent <host> --json` in a process group of its own (`launch` resets the storage, `relaunch` keeps it), returns each step's JSON replies, prints one `PASS` or `FAIL` line per `check`, reports a step that failed and goes on, and `finish()` returns the exit code. The one signal it sends is to a run's own group when the run overruns; `finish` signals nothing, a kept touch runner included (the rule above). The lab's `packages/exact-kit/lab/tools/drive.ts` is the example.

## What the first ports taught

Each of these cost a round or an hour in the first slices of the ports.

- **Contract tests sit beside `app.contract`**, one `<feature>.test.contract` per feature: Exact's `test` and `verify` look nowhere else.
- **What a contract test cannot do goes in a drive.** At the pin a test cannot set a module's value or answer a permission prompt. A drive (`tools/drive-<feature>.ts`, over `@manna/exact-kit/drive`) sets them through the agent (`prefer permission.<name> granted|denied`, `prefer extension <module>.<key>=<value>`), relaunches with the storage kept, prints a line per check and exits non-zero on any failure. It runs on `web` and `ios` and counts as acceptance, as a test file does.
- **Speech recognition listens on a track**: `getUserMedia(audio=true)`, then `startSpeechRecognition(track=…)`, and `stopTrack` when done or refused. Passing `microphone=true` instead traps the iOS app at the pin.
- **Data made at build time is a written module.** A host tool run before Exact writes an ignored module, and a tracked `.d.ts` beside it declares it (Heartseed's `tools/licences.ts` and `src/about/licences.d.ts`); the hymnal's JSON goes through `src/hymns/make.ts` and `tsconfig.json` paths. Nothing derived is committed, and the gate passes with the written file absent.
- **A package `app.ts` imports ships a declaration.** Exact's type check stages `.d.ts` files, never source. The export is `{ "types": "./exact/<name>.d.ts", "default": "./src/<name>.ts" }`, the declaration written by hand in the port's terms and importing nothing, and a type-level check the owning workspace's typecheck compiles holds it to its source (as `packages/exact-kit/src/effect/runner.test.ts` does for `runner.d.ts`).
- **Effect runs only through the runner**: `runCall` or `runCallSync` from `@manna/exact-kit/effect`, on the call's time and seed from `exactTime()`. Nothing `app.ts` reaches calls `Effect.runPromise`, `runSync` or `runFork`; a step waits with `await`, never a timer armed in a bare `.then`; state that outlives a call lives in Exact's storage or in Contract.
- **`withDataHost` is synchronous**, so a test that drives `answer` needs storage that answers at once, and every rule a call starts runs inside it (`apps/heartseed-exact/src/app.test.ts`).
- **Exact's build type checks every Bun test and source file in the app's folder.** None imports `bun` or `node:*`: host scripts live in `tools/`. If `contract build` refuses `effect` in the app's folder, the seeded generator in `src/test/random.ts` stands in.
- **A module, grant or asset used for the first time needs a native rebuild** (`bun run exact ios`) before the iOS tests; a Contract or TypeScript edit runs on the build there is. A source edited while `test ios` runs makes it refuse the build as stale.
- **Driving**: `clock data` after an input whose reply the next step reads; `clock settle` after a `type` on iOS, a sheet, an alert or a push. `expect text` on a row joins its descendants' text with no space. A drag over 8 viewports is refused, so drag in parts. A count that follows a native event stream is checked as a rising lower bound. Every row of a list is in the tree on both hosts, so "back at the row it left" is held by `expect perf built … == 0`.
- **Contract**: numbers are unquoted; a `change` action may not write its own trigger, even unchanged; generated types are mutable arrays and widen string unions to `string`; a grant needs its purpose in `strings/en.json`; a screen is a route, never an `if` over state.
- **`verify ios`** needs the simulator's accessibility runtime on and keeps its touch runner, which idles out (the rule above). A largest-text finding is fixed in the layout; one accepted in `app.json` carries its reason.
- **Budgets** (`bun run test:budget`) count only at load 5 or less; above it, a measurement is "not measured" with the load.

## Testing a data module's logic in Bun

`withDataHost(run)` (`@manna/exact-kit/data-host/testing`) runs `run` as Exact's data module would: `Date.now()`, `Date()`, a bare `new Date()`, `Math.random()`, `performance.now()`, `setInterval` and `requestAnimationFrame` throw, and `Symbol.dispose` is gone, as on Hermes. Everything is put back afterwards.
