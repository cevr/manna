# @manna/sim

The simulator driver an app's `sim` script runs: boot a simulator (or a
headless browser) and the app's dev server, build and install the app, open
a screen, tap, scroll, read the log, run a journey, and shut it all down.
Each command prints one JSON line.

`open` on iOS answers a target that does not show by terminating the app and
opening once more (`detail.retried`), which clears a launch hung on the
splash. A wait in the running app asks for none: `--no-relaunch`, or a
journey open step's `relaunch: false`, fails the missing target as it is.

The driver holds no app of its own. An app gives its values as an `App`
record (`src/app.ts`): its simulator, device type, bundle id, URL scheme,
driver session, port range, readiness target, platforms, native project,
open prompt and the build output `down --clean` deletes, and whether it is
quiet: a quiet app's journey takes no video, `--skip-video` given or not,
and a step whose receipt is `both` or `shot` (the default is `both`) is
refused as `BadJourney`, so each step keeps a snapshot or none. `defineApp` checks
the record where the app declares it, and `runSim` checks it again before
any step.

An app's script is a few lines: its `App` and a `launch` call with its place
(the app's folder, the state folder, the script, the journeys' feature
folder, the warm checkouts it refuses). The hymnal's are
`apps/hymnal/scripts/sim-app.ts` and `apps/hymnal/scripts/sim.ts`; the
verify-hymnal skill drives through them. Heartseed's are
`apps/heartseed/scripts/sim-app.ts` and `apps/heartseed/scripts/sim.ts`
(iOS alone, so the parser refuses a web ask before any step); the
verify-heartseed skill drives through them.

| File                             | What it holds                                                           |
| -------------------------------- | ----------------------------------------------------------------------- |
| `src/app.ts`                     | The `App` record and its domain                                         |
| `src/command.ts`                 | The commands: parsing, defaults and help, from the place's app          |
| `src/drive.ts`                   | The `Drive` service and `DriveLive`, every step reading the place's app |
| `src/host.ts`                    | The contained host every step and command reaches files and tools by    |
| `src/journey.ts`                 | `sim journey`: a feature's journey file, run step by step               |
| `src/check.ts`                   | `@manna/sim/check`: journey files loaded and read as data, for tests    |
| `src/screen.ts`                  | The iOS screen as numbers: `sim read`'s readout, the view a scroll pans |
| `src/errors.ts`, `src/result.ts` | The tagged errors and the JSON results                                  |
| `src/tools.ts`                   | Running a tool to its end, and the readiness wait                       |
| `src/index.ts`                   | `launch`: an app's script in one call                                   |

## The contained host

`DriveLive` needs only the platform's services, and `runSim` and every step
run over the contained host of their place (`src/host.ts`): a FileSystem and
a ChildProcessSpawner built over the platform's from the drive's roots, the
place's app, state and features folders, the output folder a session names,
and a given `.app`. Every path is resolved at the moment of use as the kernel
walks it: a link's raw target takes the link's place among the components
still to walk, so a `..` after a link leaves the link's target, never the
link. It must lie under the canonical form of every root that holds it; a
tool's absolute arguments and cwd are checked as it spawns, and the trees a
tool acts on whole (derived data, the app it signs or installs, the native
folder the prebuild writes, less CocoaPods' header links) hold no link out of
their root anywhere a tool can reach, through every folder a link inside them
leads to. A refusal fails the command as `Escaped` and prints its failure
line once, a journey's refused results file and `serve`'s refused output
folder included. oxlint keeps `node:fs`, `child_process` and Bun's file and
spawn calls out of the sources.

## The drive's lifecycle

A drive owns one state folder. Its record, `<state>/session.json`, is the
one place every later command reads the booted drive from, and it stays
there until the server it names is confirmed gone. Who may signal for a
state is decided apart from the record, by the state's holder.

**The holder** (`src/holder.ts`). `boot`, `down` and the `down` part of
`down --clean` hold the state while they run; driver steps, `doctor`,
`install`, journeys and `serve` never hold it, never write or remove the
record, and never signal. A command holds the state by creating the next
generation in `<state>/holders/`: a symbolic link named for its number,
whose target is the text of the holding command's own pid and start time
(`Os.self`) and a nonce, made with an exclusive `symlink`. It lets go by
creating `<generation>.done` beside it, on success, failure and
interruption. No generation and no release is ever removed or renamed, so
each name is created at most once: of any number of commands that judged
one top generation free, exactly one creates the next name, and a stale one
meets a name that still exists. The folder grows by two empty links per
holding command. A command finds the top generation free when it is
released, or when its holder is gone: the start time read at its pid is no
longer the one it recorded, however its command ended (`kill -9`
included), so a dead holder is reclaimed and a foreign process on its pid
does not keep the state busy. A live holder fails the command `StateBusy`,
naming its pid, with nothing changed. A release that fails leaves a hold
that ends with the command's process; a process that runs several commands
(a journey) then meets `StateBusy` until it exits. A state folder made by
an older `sim`, with no `holders/`, works: the first command makes it.

**`boot`**, in order: a web drive whose socket path cannot fit is refused;
then, holding the state, a record that does not decode, a legacy one, or
one whose server still runs refuses the boot (`BootRefused`) with nothing
started; a stale one (its server gone, or its pid taken by another process)
is filed away into its own output folder. Then the simulator, a free port,
the drivers' HOME, the server, and its record as the very next step. The
server starts through the `Os` seam (`src/os.ts`) in two steps. A shell
starts a child that reads its own start time (`ps -o lstart=`, read with
`LC_ALL=C` and `TZ=UTC` over the caller's environment, so one process
reads the same whatever the caller's time zone and locale), prints its pid
and that time, and waits. Only once the drive has read that identity does
it answer `go` on the start's stdin, and only then does the child become
`serve` (by `exec`: the same pid and start time). It first closes the
start's output and sets its input to `/dev/null`, so `serve` holds only
fds 0-2 and no file the booting command holds, and `boot` ends while
`serve` runs. The start leads a session and process group of its own
(the spawner's `detached`), and `serve` stays in them, so a signal to the
group of the shell call that ran `boot` (a host's shell tool ending the
call) never reaches the server. A failure before the
answer (the start itself, the child's read, its line, the drive's read of
it, the answer itself) closes the start's input unanswered, and the child
ends itself: the boot fails typed, with nothing running and nothing
signalled. `boot` runs uninterruptibly from the start to the record, so an
interruption anywhere in that span is held: the drive still answers `go`
and writes the record, and only then does the interruption land. It stops
the server by the stop rule (a SIGTERM) and, once it is gone, files its
record away, and the boot ends interrupted. Any failure or interruption
after the record stops the server by the stop rule and, once it is gone,
files its record away; a server that will not stop keeps its record for
the next `down`.

**The record** (`src/record.ts`) is written whole and only where none is:
the encoded session goes to a file of this write's own name
(`session.<nonce>.writing`, created exclusively), which is linked to
`session.json` (a record already there fails the link) and then removed; a
leftover from a killed command is ignored. If the write or the link fails,
the just-started server is stopped by the stop rule, again after a failed
host call, three times at most. From the answer until the record names the
server, the booting command makes at most three file writes; a `kill -9`
inside that window leaves the server unrecorded (the residual race below).
A `kill -9` before the answer closes the start's input, and the child ends
itself.

**`down`**, holding the state: read the record (none, or one that does not
decode: `NoSession`); close the drivers; stop the server by the stop rule
when the record names it by identity (a stale or legacy record is not
signalled); and only then file the record away. A stop that fails leaves
the record in place and fails typed. Every step before the filing leaves
the record where the next `down` reads it, so a failure, an interruption
or an abrupt exit at any of them is followed by a `down` that finds the
server and stops it. A driver `down` could not close (its HOME no longer a
folder, a refusal of the contained host) does not keep the server running:
the server is stopped and the record filed, then `down` fails with that
problem. With no server to stop (a stale or legacy record), the record is
filed and `down` succeeds. `down --clean` keeps its port-free check, which
never stops the port's holder: it fails `Unhealthy` while another process
holds the recorded port.

**Filing a record away** links it to `<out>/session.json`, else to
`<out>/session-<n>.json` for the first free `n` up to 64, then removes it
from the state. It never replaces a file, so two states, or two sessions of
one state, filed into one `--out` keep both.

**The stop rule** (`stop` in `src/os.ts`) is the only way the drive signals.
It reads the start time of the process holding the recorded pid, and sends
SIGTERM only when it equals the recorded one, with no host call between. It
waits up to 15 s for that start time to go (never by `kill -0`, which any
process holding the pid answers), reads again and sends SIGKILL only on
equality, and confirms the process is gone. A pid that is not an integer of
2 or more is never signalled, and the drive never signals a holder. A
session without `serverStarted` is **legacy** (an older `sim`'s): it
decodes, and grants no signal. `down` of a legacy session closes its
drivers in the caller's environment, files it away, and reports
`serverStopped: false`; its server is the caller's to stop. `doctor` reads
identity by `Os.started` only: it fails `server-pid` on a legacy session,
and on a session whose start time no longer reads back.

**The doctor's native sources** (`src/native-source.ts`). On iOS, once
`server-log` holds, `doctor` reads the app's log since boot as records
(`xcrun simctl spawn <udid> log show --style ndjson --last <since boot>s
--predicate 'process == "<logProcess>"'`) and fails `Unhealthy` at
`native-source` when the app's latest process (the last record's) refused
a native source: a record whose message holds `; rebuild the app` on any
of its lines, as every refusal One writes ends (a module or view changed,
a module, method or view not linked). The reason gives the count, the
first refusal's line and `sim install`. A line that is no record (the
header, the closing count, a record whose pid is not a number) is
skipped; a refusal of an earlier process, before a rebuild and `sim
install` in the same boot or a relaunch, fails nothing. A read that fails
is the step's failure, as `sim log`'s is; the web runs no such read, and
the doctor writes no file. It sees a stale install only once the
JavaScript has called the native source.

**The drivers' HOME.** Only `agent-device` and `agent-browser` run in the
drive's child environment: `HOME` is `<state>/home`, made by `boot` through
the contained host with mode 0700 and kept across drives of the state
(agent-device keeps its daemon and its runner build there, so the first
`open` in a fresh state builds the runner). `AGENT_BROWSER_SOCKET_DIR` is
`/tmp/sim-<FNV-1a 64 of the child HOME>`, so agent-browser's socket path
stays within macOS's 103 bytes whatever the state's length; the drive never
creates or deletes that folder, which lies outside every root. Before a
driver runs, the contained host checks the folders its variables send its
writes to: the HOME (and `AGENT_DEVICE_STATE_DIR`, when set) as a tree no
link leads out of, and the socket folder as not a link, with no link at any
file agent-browser keeps there for the session (its socket, pid, version,
stream, engine, provider, extensions and log files). A link there fails the
step with `Escaped` before the driver starts. That check reads the links
present at the moment of use, immediately before the driver starts, as
part 1's contained host does for every tool. A link another process plants
while agent-device or agent-browser runs, after the check, is not refused:
holding it off would need an OS sandbox around those tools, and another
process of the same user can write anywhere already (the spec's threat
model). A link present before the check, at any depth of the HOME or the
socket path, is refused. `XDG_RUNTIME_DIR` and `AGENT_DEVICE_STATE_DIR` are
not inherited; every other variable is the caller's. `xcrun`, `xcodebuild`,
the prebuild, `serve` and `git` keep the caller's environment. `down` of a
session `boot` made asks agent-device to stop its daemon in the child HOME
(`agent-device daemon stop`, which checks its own pid and start time) and
closes agent-browser's session; the drive never signals either daemon.

**The residual race.** Between the start-time read and the signal lie two
tool runs, `ps` then `kill`. `os.slow.test.ts` measures that gap over 20
stops of its own sleeps: 2.8 ms median and 3.4 ms at most (12 cores,
2026-11-04). A wrong signal needs both of these: the server exits inside
that window, and macOS gives its pid to a new process inside the same
window. Nothing bounds the process creations between the exit and the
reuse from below. XNU hands out pids from a cursor that moves up from the
last pid given, wraps at `PID_MAX` and skips live pids; the cursor moves
for every creation while the server lives, so after a wrap it can sit just
below the server's pid, and the first creation after the exit takes it
(`bsd/kern/kern_fork.c`; `pid.test.ts` models the allocator and holds
this). What bounds the risk is the window itself: the server must exit on
its own within those milliseconds. For the SIGTERM, that is a crash at that
instant; for the SIGKILL, a server that ignored SIGTERM for 15 s exiting in
the same milliseconds. No rate of such a race is claimed. The same
condition covers the holder's read of a command's own identity (`Os.self`).
The start has no such window: the child reads its own start time while it
runs, so its pid cannot pass to another process before the read. A
`kill -9` of `boot` between the answer and the record leaves the server
unrecorded, a window of at most three file writes; the spec accepts it.

## Tests

- The unit tests run as two parts, each a turbo task the gate's `turbo run
  test` runs and each under 1 s alone (`bun run test:budget @manna/sim`):
  `bun run test:host` runs `host.test.ts`, and `bun run test:drive` runs
  every other unit-test file under `src` (`turbo.json`; `parts.test.ts`
  holds each unit-test file to exactly one part). Together they run the
  commands over a stand-in Drive, the journeys, the App
  property over one representative generated app (`app.property.test.ts`),
  and the contained host on the four ways a link once led the driver out of
  the app and on the layouts a real checkout has, and its resolver and tree
  walk against the OS on the review's receipts (`host.test.ts`), and the
  review's layouts through `sim` (`host.scenarios.test.ts`), and the stop
  rule over a scripted `Os` and the test clock: each signal follows a read
  of the recorded process at the same instant, with no tool or wait between
  (`os.test.ts`), and a model of XNU's pid allocator under the residual race
  (`pid.test.ts`), and the drive's lifecycle over a model process table on
  three fixed cases: a `down` killed after its first file mutation, a dead
  holder reclaimed, two downs reclaiming one (`life.test.ts`), and the
  holder under a scheduler that wakes one command at a time at every
  FileSystem and `Os` call, on four fixed interleavings and 50 generated
  worlds (`holder.test.ts`, `src/fixtures/holders.ts`), and the live start
  under `boot` over a model host whose read of the new server's start time
  fails: nothing runs, and the `down` after it has nothing to stop
  (`spawn.test.ts`, `src/fixtures/spawning.ts`).
- `bun run test:slow`: the commands over the live Drive with a stand-in
  host, a script launched as a process (`sim.slow.test.ts`), the App
  property complete, over 128 generated apps and the edges
  (`app.property.slow.test.ts`), the contained host over every command, link
  kind and component (`contain.slow.test.ts`), its resolver and tree walk
  against libc's `realpath` and an independent component walk on 400
  generated link worlds of each kind (`host.differential.slow.test.ts`,
  `src/fixtures/oracle.ts`), every command with each host call refused in
  turn (`refusals.slow.test.ts`), the static leg's oxlint block
  (`lint.slow.test.ts`), the live `Os` over `/bin/sleep`s the test starts
  itself and signals only while it holds them, and a start whose child
  cannot read its start time, or is interrupted while it reads, leaving no
  process, and a command that spawns (`src/fixtures/spawner.ts`) ending
  while its sleep runs on, the sleep holding only `/dev/null` on fds 0-2
  (`os.slow.test.ts`), the live start under `boot` and `down` with a
  typed failure or an interruption at each of its steps: a failure signals
  nothing, and an interruption is held until the record names the server,
  which one SIGTERM then stops (`spawn.slow.test.ts`), the holder over 4,000
  more generated worlds (`holder.slow.test.ts`), and the
  drive's lifecycle over the model (`src/fixtures/life.ts`,
  `src/fixtures/life-cases.ts`): each command is a fresh `DriveLive` over
  one scratch tree and one model process table, whose pids lie above
  4,000,000, past macOS's `PID_MAX`, and nothing executes. A fault lands at
  a host call: a typed failure, an interrupt, or an abrupt exit, after
  which no finalizer runs and the command's process is dead. The census of
  the failed rounds (`life.census.slow.test.ts`), a fault at every host
  call of every subject (`life.sweep.slow.test.ts`), a second fault at
  every call of the recovery of a first (`life.recovery.slow.test.ts`), and
  overlapping pairs, a newer command at every host call, and 60 generated
  sequences (`life.overlap.slow.test.ts`). Every live server is named by its
  state's record at every host call but inside boot's window, inside which
  the booting command makes at most three file writes under the state
  folder and, past them, only the stop rule's start-time reads and signals
  (so a record written after readiness is red), no two commands signal one
  process, every signal follows a read of that
  process's start time, no `*.json` is replaced, and each undisturbed
  command ends as the reference model says.

The package's tests use a probe app (`src/fixtures/probe.ts`) whose every
value differs from every other and from any real app's; the contained
host's tests use the hymnal's values in a scratch tree they remove. No test
boots a device or touches a file outside its own scratch folder. The tools
a test runs are oxlint (`lint.slow.test.ts`) and, in `os.slow.test.ts`,
`/bin/sleep`, `ps`, `lsof` (read only), `bun` (its own spawning fixture)
and `kill`, which signals only a sleep that test started and still holds.
