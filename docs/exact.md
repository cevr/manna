# Exact

Heartseed and the hymnal are being ported to [Exact](https://github.com/expo/exact): a view in Contract (`app.contract`), data in TypeScript (`app.ts`), tests as `*.test.contract` scripts. The ports live beside the current apps until they replace them:

| Workspace                                         | What                                                           |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `apps/heartseed-exact` (`@manna/heartseed-exact`) | Heartseed on Exact, bundle id `app.heartseed.exact`            |
| `apps/hymnal-exact` (`@manna/hymnal-exact`)       | The hymnal on Exact, bundle id `im.cvr.hymnal.exact`           |
| `packages/exact-kit` (`@manna/exact-kit`)         | The command wrapper, the data-host test helper, the copy guard |

## Install

Exact is not a package: an app runs it from a clone, by path. Nothing of Exact is committed here.

1. Rust through rustup, Bun, Xcode 27.1 or later.
2. Clone and pin it:

   ```sh
   git clone https://github.com/expo/exact.git ~/Developer/vendor/exact
   git -C ~/Developer/vendor/exact checkout --detach 0fa708e34ef4d2e49af98b25edc76bedc46ae7fa
   ```

3. `bun scripts/exact.mjs setup` in the clone: it installs Exact's Rust toolchains (1.97.0 and a nightly, without changing `rustup default`), wasm-bindgen, Binaryen (`~/.cache/exact/binaryen`), Exact's own `node_modules`, Playwright's headless Chromium, and the Hermes bundles (`~/.cargo/hermes-lean-sys/`). `bun scripts/exact.mjs setup --check --platform ios` names what is still missing and changes nothing.

Exact needs the real `HOME`: rustup, Cargo and the Hermes bundles are found through it.

## The pin

Exact is pre-1.0 and lands about a hundred commits a day with no stability promise, so every app runs one commit:

**`0fa708e34ef4d2e49af98b25edc76bedc46ae7fa`** (2026-11-14).

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

`bun run exact` is the app's `exact.mjs`, which runs `@manna/exact-kit`'s wrapper (`main` in `src/main.ts`, over `runExact` in `src/run.ts`; `manna-exact <verb>`, the package's command, runs it for the app in the current folder). Never run Exact another way: not `bun <clone>/scripts/exact.mjs` on an app, not Exact's generated `exact.mjs` (the apps hold ours in its place). The wrapper:

- **Refuses before any process starts**: `share`, `deploy` and `release` (they publish: the owner's alone), `feedback` with anything but `never` (feedback goes to Expo), `--sim` and `--device` (another simulator, or the owner's iPhone), and a `--port` not the app's.
- **Refuses a clone off the pin**, naming both commits, and a missing clone with how to clone it.
- **Sets, over whatever the caller's environment holds**: `EXACT` (the clone), `EXACT_FEEDBACK=0`, `EXACT_SIM` (the app's simulator), `PORT_LO` and `PORT_HI` (the app's spare range), and for `web` with no `--port`, `EXACT_PORT` (the app's port).
- **Takes the build lock** `/tmp/manna-exact-build.lock` (`lockf -k`) for `ios`, `mac`, `test ios`, `verify ios` and `agent ios`, so native builds on this Mac run one at a time.

The clone is `~/Developer/vendor/exact`, under the home folder, unless `EXACT` names another; that is the one machine path the repo knows.

## Simulators, ports and the lock

|                                                 | Heartseed                | The hymnal            |
| ----------------------------------------------- | ------------------------ | --------------------- |
| Simulator (iPhone 17, iOS 27.0)                 | `verify-heartseed-exact` | `verify-hymnal-exact` |
| Web port (`bun run exact web`)                  | 8765                     | 8766                  |
| Spare ports (`test web`, `verify`, `agent web`) | 8770-8774                | 8775-8779             |

The current apps' simulators (`verify-heartseed`, `verify-hymnal`) and their ports are never Exact's. Exact's own default, "a simulator that's already booted", is never used: the wrapper always names the app's.

Create a missing simulator with `xcrun simctl create verify-heartseed-exact com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-27-0` (the hymnal's likewise). After an app's first install on it, revoke its microphone: `xcrun simctl privacy verify-heartseed-exact revoke microphone app.heartseed.exact`.

## Rules for agents

- Screenshots of the Exact simulators are allowed and stay under each app's `.exact/` (ignored). No sound, no recording, no microphone.
- A native build needs 12 GB free disk; it waits on the build lock itself.
- Never `share`, `deploy`, `release` or send feedback; the wrapper refuses them, and no other way is taken round it.
- `bun exact.mjs update` rewrites the app's `exact.mjs` and `AGENTS.md`: put ours back from git after it.
- Exact's type check (`contract build`, every build) stages the declarations of every package any `.ts` or `.js` file in the app's folder imports, and follows the import lines inside their doc comments, and refuses two copies of one package (`package declarations: two copies of …`). `effect`'s doc comments reach `rolldown`, so the root `package.json` overrides it to one version. A package imported by `app.ts` must ship declarations (`types` before `default` in its `exports`).
- The data layer is Effect through `@manna/exact-kit/effect`'s runner: `docs/exact-data-layer.md` (the rule, the evidence, a worked example).
- Each app's `tsconfig.src.json` (extending the root's) is the typecheck's; the app has no `tsconfig.json`, since Exact's type check reads that file and refuses a config that extends one outside the app.
- Exact's tests are run by hand per unit, as the film e2e is. `bun run gate` runs only each workspace's Bun tests and needs no clone: `app.ts` imports the generated `app.contract.d.ts`, so it stays out of the typecheck, which covers `src/` alone.

## Where a feature's files go

Each app keeps one feature in `features/<name>.contract` (its view), `src/<name>/**` (its logic, pure TypeScript with Bun tests), and `tests/<name>.test.contract` (its contract tests). The root `app.contract` and `app.ts` take one line per feature. Logic of a current app is imported through its package's exports, never copied: each app's `src/no-copy.test.ts` fails on a file that shares more than a few lines with a current app's source (`noCopies` in `@manna/exact-kit/no-copy/testing`).

## Testing a data module's logic in Bun

`withDataHost(run)` (`@manna/exact-kit/data-host/testing`) runs `run` as Exact's data module would: `Date.now()`, `Date()`, a bare `new Date()`, `Math.random()`, `performance.now()`, `setInterval` and `requestAnimationFrame` throw, and `Symbol.dispose` is gone, as on Hermes. Everything is put back afterwards.
