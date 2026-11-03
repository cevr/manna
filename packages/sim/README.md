# @manna/sim

The simulator driver an app's `sim` script runs: boot a simulator (or a
headless browser) and the app's dev server, build and install the app, open
a screen, tap, scroll, read the log, run a journey, and shut it all down.
Each command prints one JSON line.

The driver holds no app of its own. An app gives its values as an `App`
record (`src/app.ts`): its simulator, device type, bundle id, URL scheme,
driver session, port range, readiness target, platforms, native project,
open prompt and the build output `down --clean` deletes. `defineApp` checks
the record where the app declares it, and `runSim` checks it again before
any step.

An app's script is a few lines: its `App` and a `launch` call with its place
(the app's folder, the state folder, the script, the journeys' feature
folder, the warm checkouts it refuses). The hymnal's are
`apps/hymnal/scripts/sim-app.ts` and `apps/hymnal/scripts/sim.ts`; the
verify-hymnal skill drives through them.

| File                             | What it holds                                                           |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/app.ts`                     | The `App` record and its domain                                         |
| `src/command.ts`                 | The commands: parsing, defaults and help, from the place's app          |
| `src/drive.ts`                   | The `Drive` service and `DriveLive`, every step reading the place's app |
| `src/host.ts`                    | The contained host every step and command reaches files and tools by    |
| `src/journey.ts`                 | `sim journey`: a feature's journey file, run step by step               |
| `src/errors.ts`, `src/result.ts` | The tagged errors and the JSON results                                  |
| `src/tools.ts`                   | Running a tool to its end, and the readiness wait                       |
| `src/index.ts`                   | `launch`: an app's script in one call                                   |

## The contained host

`DriveLive` needs only the platform's services, and `runSim` and every step
run over the contained host of their place (`src/host.ts`): a FileSystem and
a ChildProcessSpawner built over the platform's from the drive's roots, the
place's app, state and features folders, the output folder a session names,
and a given `.app`. Every path is resolved at the moment of use, each link on
it followed, and must lie under the canonical form of every root that holds
it; a tool's absolute arguments and cwd are checked as it spawns, and the
trees a tool acts on whole (derived data, the app it signs or installs, the
native folder the prebuild writes, less CocoaPods' header links) hold no link
out of their root. A refusal fails the command as `Escaped`. oxlint keeps
`node:fs`, `child_process` and Bun's file and spawn calls out of the sources.

## Tests

- `bun run test`: the commands over a stand-in Drive, the journeys, the App
  property over one representative generated app (`app.property.test.ts`),
  and the contained host on the four ways a link once led the driver out of
  the app and on the layouts a real checkout has (`host.test.ts`).
- `bun run test:slow`: the commands over the live Drive with a stand-in
  host, a script launched as a process (`sim.slow.test.ts`), the App
  property complete, over 128 generated apps and the edges
  (`app.property.slow.test.ts`), the contained host over every command, link
  kind and component (`contain.slow.test.ts`), and the static leg's oxlint
  block (`lint.slow.test.ts`).

The package's tests use a probe app (`src/fixtures/probe.ts`) whose every
value differs from every other and from any real app's; the contained
host's tests use the hymnal's values in a scratch tree they remove. No test
boots a device or touches a file outside its own scratch folder, and the
only tool a test runs is oxlint (`lint.slow.test.ts`).
