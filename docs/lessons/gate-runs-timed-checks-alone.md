### gate-runs-timed-checks-alone

- **Date:** 2026-10-20
- **Kind:** review
- **Said:** "The contrast check's browser runs in the checks, beside a cold build"
- **Source:** p6-testspeed/findings.md F5
- **Wrong:** A cold gate failed in firsttheblade's contrast check: its screenshots missed their 30 s limit, at the checks' lowered priority beside every cold typecheck and build and Selah's native build.
- **Cause:** The checks phase was laid for work with no time limit, and a package's own `gate` script, which waits on a browser, was taken as one.
- **Guard:** code: `packages/scripts/src/gate.test.ts` `no workspace keeps a gate but the native apps' (Selah, Takes), each run by its test:slow`, `packages/scripts/src/gate.test.ts` `is test-slow.sh: typecheck, builds and each test:slow one at a time under the lock` (a check that waits on a browser is a workspace's `test:slow`, run alone)
