ready

Protocol: orchestrate worker protocol carried in the implementor prompt, 2026-11-10.
Spec: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/spec.md
Head: df265337ab0a6babfa512a5df368d427915916fe (tested product head; request-only commit follows).
Base: 4765a7341df808308b81340c3f13b0c23f6c6e6a
Workspace: /Users/cvr/Developer/personal/.rifts/manna/hymseek-r2
Branch: hymnapp/hymseek-r2

## Changes

`git diff --stat 4765a7341df808308b81340c3f13b0c23f6c6e6a..HEAD | tail -1`: `5 files changed, 277 insertions(+), 6 deletions(-)` at the product head.

- `.claude/skills/verify-hymnal/SKILL.md`: spell the probe as an app URL, not an ambiguous repository path.
- `apps/hymnal/src/player/player.ts`: a refused current status observation revokes the owned hold and cuts its pending work before publishing Failed. An owned terminal successful observation ends its watch after cancelling its ask, rather than waiting forever for the cancelled ask's Deferred and overwriting terminal state on a later read. Ordinary no-hold behavior is unchanged.
- `apps/hymnal/src/test/word-seek.ts`: controllable public status effects, explicit acceptance rendezvous, operation-answer boundaries and cancellation observations outside real scoreClock, on both Sound paths.
- `apps/hymnal/src/player/word-seek.property.slow.test.tsx`: verifier's refused-status regression; 448 named phase/outcome/ownership/delay/Sound cases and 128 replayable seeds ×16 completion histories; assert public player/hold state and command trace after completion and late finalization/answers. Original 128×128 immediate and deferred histories, seeds, assertions and floors remain intact.
- `.claude/skills/verify-hymnal/features/scrub.md`: describe current failed-status closure versus inert stale observations and the executable/live boundary.

Commits: d7fdf6de8 docs; 89835b55d refused-status cleanup/property; df265337a terminal-watch closure/stronger post-completion state guards. All pushed fast-forward to origin/hymnapp/hymseek-r2. **Public hold/player seam unchanged**, including Command vocabulary and token types; no gesture-worker changes needed.

## Fix report — every vb-11 finding

- **B1 fixed d7fdf6de8**. Guard: existing deterministic docs anchor check, unchanged. Reproduced exact nonexistent `probe/scrub` path red (131 pass/1 fail, EXIT=1), then green; final head 132 pass/0 fail, `FINAL DOCS EXIT=0`.
- **B2 fixed df265337a (green certification; no budget-source change)**. Guard: unchanged workspace budget and exact fast partition check. Matched full-budget baseline was measured before profiling at dfdc9d44af3fe5523819904c339b253ae202657c in an owned detached worktree, installed with authorized frozen lockfile/real HOME; initial base and round-base legs both green. Final reverse-order pair at product head and that same pre-unit base both green. No base-only red was proved, so no row was routed to /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/guards-backlog.md and no profiling claim is made. No assertions, thresholds, seeds, floors or partitions changed. Detached baseline removed, cleanup EXIT=0.
- **M1 fixed 89835b55d and df265337a**. Guard: owned real-player status-completion property. Refused status reproduced at round base semantically (expected Free/Free, observed Held/Landing, EXIT=1, no timeout). Covers Acquiring, Held, release-Landing and cancel-Landing; six successful status tags plus failed effect; immediate/delayed answers; current, same/different Start, and newer token; both Sound paths. Acquiring/cancel-Landing observe stale reads because no current watcher exists while their pause/resume answer is pending. Late Select/Release/Cancel and cancelled answers cannot modify the retained/replacement state or issue work. Omitting only cut while retaining revocation fails the Landing/error/current cancellation assertion (EXIT=1). Stronger public-player checks also exposed terminal success restarting a cancelled watch at89835; fixed by df265337a, with 76 semantic red cases then full green. No mutation remains installed.

No finding was marked repeat of an earlier round. No finding is rejected or left unaccounted for.

## Reproduce and focused gate

Use absolute cd, `set -o pipefail`, producer output through `| tail -n 12`. Each Bun command has prefix:
`HOME=/private/tmp/claude-501/-Users-cvr-Developer-personal-manna/ea76698e-4894-40eb-b535-9af07b02bd7a/scratchpad/home-findbulk BUN_INSTALL_CACHE_DIR=/Users/cvr/.bun/install/cache`.
Git uses real HOME. No install is needed in the product workspace. Checks run serially with three threads.

Gate log: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/gate-2.log
Final exit line: `ROUND GATE EXIT=0` at the named product head.

From /Users/cvr/Developer/personal/.rifts/manna/hymseek-r2/apps/hymnal, each alone:

| Command                                                                                               | Final result                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bun run typecheck`                                                                                   | `FINAL typecheck EXIT=0`                                                                               |
| `bun run test:player`                                                                                 | `FINAL test:player EXIT=0`, 115 pass, 714 ms                                                           |
| `bun run test:follow`                                                                                 | `FINAL test:follow EXIT=0`, 64 pass, 712 ms                                                            |
| `bun run test:rest`                                                                                   | `FINAL test:rest EXIT=0`, 196 pass, 798 ms                                                             |
| `bun run test:infra`                                                                                  | `FINAL test:infra EXIT=0`, 119 pass, 377 ms                                                            |
| `bun test --parallel=3 --preload ./src/test/setup.ts ./src/follow/seek-targets.property.slow.test.ts` | `FINAL ./src/follow/seek-targets.property.slow.test.ts EXIT=0`, 131 pass, 4,934,598 assertions, 2.27 s |
| `bun test --parallel=3 --preload ./src/test/setup.ts ./src/player/word-seek.property.slow.test.tsx`   | `FINAL ./src/player/word-seek.property.slow.test.tsx EXIT=0`, 882 pass, 114,175 assertions, 2.79 s     |

From the workspace root:

- `bunx --package @informalsystems/quint@0.33.1 quint test /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/hold.qnt --backend typescript --max-samples 1 --match '_test$' --verbosity 3`: `FINAL FORMAL EXIT=0`, 13 named passing tests, 7.098 s; unchanged exact finite closure/invariants.
- Installed `oxlint --threads=3` on the three changed TS/TSX files and `oxfmt --check --threads=3` on all five changed paths: final exits 0.
- Read-only lint:review equivalent: `bun --no-env-file packages/scripts/src/lint-review.ts`, then tracked JS/TS through `JUDGED_REVIEW=1 xargs -0 node_modules/.bin/oxlint --threads=3 --report-unused-disable-directives-severity=error`: final exits 0. Same stored-answer/full-lint legs, one three-thread lint instead of hardcoded four concurrent three-thread parts; cached warnings remain warnings, no paid judgment or cache write.
- `DEAD_EXPORTS_BASE=4765a7341df808308b81340c3f13b0c23f6c6e6a bun run dead-exports`: `FINAL DEAD EXPORTS EXIT=0`, debt=344, new=0, settled=0, grown=0.

From /Users/cvr/Developer/personal/.rifts/manna/hymseek-r2/packages/film: `bun test --parallel=3 ./src/docs.slow.test.ts`: `FINAL DOCS EXIT=0`, 132 pass, 164 assertions, 2.13 s. Existing MaxListeners warning is visible; no assertion was suppressed.

Final focused gate load3.82/3.84. All touched fast parts <0.9 s alone. No flaky retry, assertion weakening, unresolved generated seed or owned child process remains.

## Matched complete budget

Evidence: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/round-2-budget.log
Command in each workspace: `bun run test:budget @manna/hymnal-app` with the same prescribed prefix and serial three-thread tasks. Final head load3.1/3.7; final base load3.94/3.81, ending4.51/3.93; all <=5. A preceding attempt exited77 before any timing because load6.16 exceeded the quiet guard; it is not a budget result.

| Part   | Final head s | Matched pre-unit base s |
| ------ | ------------ | ----------------------- |
| follow | 0.76         | 0.82                    |
| player | 0.73         | 0.66                    |
| rest   | 0.85         | 0.67                    |
| search | 0.83         | 0.79                    |
| tempo  | 0.81         | 0.79                    |
| reader | 0.81         | 0.77                    |
| hymns  | 0.85         | 0.81                    |
| home   | 0.61         | 0.60                    |
| infra  | 0.41         | 0.44                    |

`FINAL MATCHED PAIR EXIT=0`; each complete leg EXIT=0. This establishes green certification, not attribution of the verifier's earlier red or absence of all timing variation.

## Evidence, limits and batch handoff

- /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/round-2-red.log: B1/M1 red→green and omit-cut mutant receipts.
- /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/round-2-mutations.md: semantic witnesses and restored status.
- /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/gate-2.log: terminal-watch red→green and final-head gate. Earlier construction failures remain visible, superseded by final exit lines.

Native mounted-base/TargetMissing, six scrub rows plus player-seek-bar/player-swap-race/follow-seek remain batch-owned per /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/ruling-r1.md. No device, simulator, browser, microphone, sound, screenshot, privacy grant, deploy, CI or owner-data access occurred. Root merged gate and read audit remain batch-owned. No production gesture, adapter, corpus, dependency, persisted format or out-of-scope fix changed. Tests establish score-time and ownership behavior, not acoustic alignment or native effects already issued.

Follow-up only: central lessons ledger is outside Owns; the cheap M1 property guard is committed here for the orchestrator to reference if adding a ledger entry. This request has an identical artifact-only committed mirror at /Users/cvr/Developer/personal/.rifts/manna/hymseek-r2/tmp/orchestrate/hymnapp/hymseek/round-2-request.md; artifact head/checker/push are recorded in /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/state.md.
