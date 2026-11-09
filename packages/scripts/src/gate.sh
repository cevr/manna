#!/bin/sh
# `bun run gate`: did a change break something plain? Three legs, side by side:
#
# 1. The lint (`lint-gate.ts`): every deterministic rule. The native rules run
#    over every file; the JS plugins' rules only over the files whose content
#    no earlier run passed. The judged rules are not here: `bun run lint`
#    runs them in the slow suite.
# 2. The lessons ledger (`lessons/check.ts`): each entry of `docs/lessons.md`
#    held to the files its guard names, read every run, since those files lie
#    anywhere in the repo and no workspace's cached inputs can list them.
# 3. Every workspace's unit tests (`gate-tests.ts`: `turbo run test`), cached
#    by turbo on each workspace's inputs (`turbo.json`): a workspace runs again
#    only when a file it or a dependency reads changed. Turbo runs a third of
#    the cores' count of tasks at once, so the tasks' bun workers stay within
#    the cores, and a watchdog ends the run with 124 when a task's process
#    outlives 60 s, naming it (`gate-tests/bound.ts`).
#
# The typecheck and the format run in pre-commit (`lefthook.yml`), on what a
# commit touches. Builds, browser checks, the slow tests, the full lint and
# the e2e are `bun run test:slow` (`test-slow.sh`), by hand and before each
# deploy. The gate prints its wall time last; it holds no lock, since a
# workspace's unit tests take under 1 s (`bun run test:budget`).
set -u
cd "$(dirname "$0")/../../.."

now() { perl -MTime::HiRes=time -e 'printf "%d", time * 1000'; }
started=$(now)

bun packages/scripts/src/lint-gate.ts &
lint_pid=$!
bun packages/scripts/src/lessons/check.ts &
ledger_pid=$!
bun packages/scripts/src/gate-tests.ts
tests=$?
wait "$lint_pid"
lint=$?
wait "$ledger_pid"
ledger=$?

echo "gate: lint exited $lint, ledger $ledger, tests $tests, $(($(now) - started)) ms"
[ "$lint" -eq 0 ] && [ "$ledger" -eq 0 ] && [ "$tests" -eq 0 ]
