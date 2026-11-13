# Doctor

`sim doctor` (`packages/sim/src/drive.ts`, its pure rule
`packages/sim/src/native-source.ts`) fails `Unhealthy` at the check
`native-source` when the app's latest process refused a native source its
installed build lacks: One writes the refusal ("native module
natural.Natural changed; rebuild the app", and the same for a module,
method or view not linked) only to the app's log, and the step that made
the call does nothing on screen. The doctor reads the app's log since boot
(`log show --style ndjson`) after `server-log` holds; a refusal of an
earlier process (a rebuild and `sim install` in the same boot, or a
relaunch) fails nothing, and the web runs no such read. It writes no file.

## Sub-features

- `doctor-native-stale`: with the head's build installed and `sim doctor`
  ok, a native contract changed in the working tree and not rebuilt, the
  natural probe's `Load` refused → `sim doctor` fails `native-source`,
  naming `natural.Natural` and `sim install`.
- `doctor-native-fresh`: the source restored and the drive booted again →
  `sim doctor` ok.

## How to get to it (user POV)

A reader never sees it: it is the driver's own check, run before the
first drive and after any surprising result.

## Driving it

`sim journeys <file>.md` plays the lists below one after another, each in one app session from its start, with no screenshot and no video, and names each journey that fails with its first failed step and the journey before it (`SKILL.md`, Drive). The by-hand steps between them (a raw snapshot, a read of the log) are not part of it.

**Journeys in order:** from a relaunch: `doctor`.

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Install the head's build first
(`sim install`, or `--app` with a build whose native code is the head's),
and start the model server as `natural.md` does (`MPORT`).

The taps are two journeys beside this file: `doctor` (the root, until
`label=Isaiah 41:10` shows) and `doctor-stale` (the root, the natural
probe as `natural.md` opens it, with the base on port 8281, then `Load`).

1. `sim boot`, `sim journey doctor`, `sim doctor` → `ok: true`.
2. `doctor-native-stale`: in the working tree only (never committed), give
   an exported method of `apps/heartseed/native/natural/Natural.swift` one
   more parameter. `sim down`, `sim boot`, then `sim journey doctor-stale`
   (`apps/heartseed/app/probe/natural.tsx`'s `Load`) and `sim doctor`

   → `ok: false`, `error._tag` `Unhealthy`, `check: native-source`, its
   reason naming `natural.Natural` and `sim install`.

3. `doctor-native-fresh`: restore `Natural.swift` (`git diff` on it prints
   nothing), `sim down`, `sim boot`, `sim journey doctor`, `sim doctor` →
   `ok: true`.
4. `sim down`.

Red on base: the same steps print `ok: true` at step 2, while `sim log`'s
file holds the refusal.

The simulator does not show, and `packages/sim/src/sim.slow.test.ts`
holds instead: a refusal of an earlier process after a rebuild in one
boot (it needs a second build), and the order of the checks. No check
sees a stale native source before the JavaScript first calls it: the
doctor passes until then, and fails once the call has been refused.
