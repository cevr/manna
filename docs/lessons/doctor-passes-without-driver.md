### doctor-passes-without-driver

- **Date:** 2026-11-13
- **Kind:** review
- **Said:** "`sim doctor` answers `ok:true` with `agent-device` absent; the first journey then fails `ToolMissing`."
- **Source:** hymnapp/simjourneys/round-1-findings.md o1 (On base, its first item, which carries no id of its own); hymnapp/batch-vb-50-findings.md
- **Wrong:** On a process whose PATH did not hold the nvm folder `agent-device` lives in, `sim doctor` answered ok and every journey after it failed `ToolMissing agent-device` at its first step.
- **Cause:** Doctor checked the server, the port, the simulator and the logs, never the driver every step runs through. It now runs the platform's driver (`agent-device` on iOS, `agent-browser` on the web) with `--version` first and fails as `Unhealthy` at `driver`, naming the tool and the PATH, when the tool is not found.
- **Guard:** code: `packages/sim/src/doctor.test.ts` `fails at driver when the platform's driver is not found, naming it, and runs nothing after`
