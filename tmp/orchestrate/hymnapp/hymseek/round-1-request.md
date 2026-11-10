ready

Protocol: 2026-11-10 orchestrate worker protocol, carried in the implementor prompt.
Spec: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/spec.md
Head: 3ab8a364728298486230c6e54d4a7a1b2432cb71 (tested product head; an artifact-only request commit follows).
Base: dfdc9d44af3fe5523819904c339b253ae202657c
Workspace: /Users/cvr/Developer/personal/.rifts/manna/hymseek
Branch: hymnapp/hymseek

## Change and commits

`git diff --stat dfdc9d44af3fe5523819904c339b253ae202657c..HEAD | tail -1` at the product head:
`17 files changed, 2421 insertions(+), 11 deletions(-)`.

Product stages committed/pushed in order: 67354fa69 targets; 12ffc8094 owned hold; 22e2074fd interruption/lifetime/model histories; 50058f11f guarded probe/map; 3ab8a3647 numeric count-in observability fix. All pushes fast-forward to origin/hymnapp/hymseek; no rebase, force push or main mutation.

Changed files, relative to the workspace:

- `apps/hymnal/src/follow/seek-targets.ts`: pure targetsOf/targetAt/initialTarget; original occurrence identity, one stanza cut, earliest trusted word onsets/shared ordinals, honest line-only targets and malformed-input refusal.
- `apps/hymnal/src/follow/seek-targets.test.ts`: fast numeric regressions, assigned to test:follow.
- `apps/hymnal/src/follow/seek-targets.property.slow.test.ts`: independent generated oracle, full 695-hymn/9475-subset census, punctuation/shared/repeat/663 regressions and anchor sweeps.
- `apps/hymnal/src/player/word-seek.ts`: public branded token, HoldCommand/HoldState, projection provider and topology comparison.
- `apps/hymnal/src/player/player.ts`: player-owned acquisition/frozen origin/preview/first-finalization/landing/resume, synchronous external-intent revocation and continuation snapshot guards; ordinary Command vocabulary unchanged.
- `apps/hymnal/src/player/word-seek.test.ts`: fast real-player/real-scoreClock happy, early-release and early-cancel traces, assigned to test:player.
- `apps/hymnal/src/player/word-seek.property.slow.test.tsx`: fixed adversarial traces, 128 seeds ×128 immediate inputs and 128 seeds ×128 deferred histories; public state/trace observations after inputs/completions; rendered route guard and probe controls/count-in receipt.
- `apps/hymnal/src/test/word-seek.ts`: scoped controllable Playback fixture, Deferred/Queue/TestClock and separate logical/raw-device traces, not a copied player/clock.
- `apps/hymnal/src/player/LivePlayer.tsx`: optional Sound/projection wiring and named HoldLifetime route-layout/AppState/teardown adapter; listener removed on cleanup.
- `apps/hymnal/src/player/WordSeekProbe.tsx`, `apps/hymnal/app/(hymnal)/probe/scrub.tsx`: development-only silent synthetic fixture over the normal projection/player/scoreClock, isolated registry/settings, stable numeric/control IDs; production renders nothing.
- `apps/hymnal/package.json`, `apps/hymnal/turbo.json`: exact fast-part membership/exclusion and explicit registration of both slow acceptance files; no dependency or lock changes, no new part.
- `apps/hymnal/README.md`: seam, ownership/limitations, registration and hymscrub handoff.
- `.claude/skills/verify-hymnal/features/scrub.md`, `.claude/skills/verify-hymnal/features/README.md`, `.claude/skills/verify-hymnal/SKILL.md`: exactly six scrub IDs, by-hand silent numeric recipe/no journey, scoped numeric-only evidence exception.

## Reproduction and gate

Use an absolute cd, set -o pipefail, and pipe producer output through tail -n12. Prefix each Bun command with:
`HOME=/private/tmp/claude-501/-Users-cvr-Developer-personal-manna/ea76698e-4894-40eb-b535-9af07b02bd7a/scratchpad/home-findbulk BUN_INSTALL_CACHE_DIR=/Users/cvr/.bun/install/cache`.
Git retains real HOME. No install or dependency command is needed.

Gate log: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/gate-1.log
Final exit line: `ROUND GATE EXIT=0` at the named product head.

From /Users/cvr/Developer/personal/.rifts/manna/hymseek/apps/hymnal, run each alone:

- `bun run typecheck`: EXIT=0.
- `bun run test:player`: EXIT=0,115 pass,671ms.
- `bun run test:follow`: EXIT=0,64 pass,757ms.
- `bun run test:rest`: EXIT=0,196 pass,805ms.
- `bun run test:infra`: EXIT=0,119 pass,406ms; exact fast partition guard included.
- Acceptance command `bun test --parallel=3 --preload ./src/test/setup.ts ./src/follow/seek-targets.property.slow.test.ts`: `./src/follow/seek-targets.property.slow.test.ts EXIT=0`,131 pass,4934598 assertions,2.46s.
- Acceptance command `bun test --parallel=3 --preload ./src/test/setup.ts ./src/player/word-seek.property.slow.test.tsx`: `./src/player/word-seek.property.slow.test.tsx EXIT=0`,305 pass,64142 assertions,1.483s.

From /Users/cvr/Developer/personal/.rifts/manna/hymseek:

- `bunx --package @informalsystems/quint@0.33.1 quint test /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/hold.qnt --backend typescript --max-samples 1 --match '_test$' --verbosity 3`: `FORMAL EXIT=0`,13 named passing tests; exact finite closure/invariants, not randomized quint run.
- Installed oxlint --threads=3 over the exact 11 changed TS/TSX paths: `FOCUSED LINT EXIT=0`; installed oxfmt --check --threads=3 over all17 changed paths: `FOCUSED FORMAT EXIT=0`.
- Read-only lint:review equivalent: `bun --no-env-file packages/scripts/src/lint-review.ts`, then full tracked JS/TS files through `JUDGED_REVIEW=1 xargs -0 node_modules/.bin/oxlint --threads=3 --report-unused-disable-directives-severity=error`: both EXIT=0. This preserves the script's stored-answer and full-lint checks but uses one three-thread lint invocation instead of its hardcoded four parallel three-thread parts. Cached repo warnings remain warnings; no paid judgment/API call or cache write.
- `DEAD_EXPORTS_BASE=dfdc9d44af3fe5523819904c339b253ae202657c bun run dead-exports`: `DEAD EXPORTS EXIT=0`, `dead-exports debt=344 new=0 settled=0 grown=0`.

One/five-minute load3.66/3.68 (12cores), all touched fast parts <0.9s alone. Checks serial; post-check ps showed no owned children left. No flake retry/assertion weakening or unresolved seed. Runtime-disposal and count-in fixture issues found during construction were fixed, not suppressed.

## Red and mutation receipts

- /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/stage-1-red.log: executable absent-seam tracer.
- /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/stage-1-mutations.md: actual last-syllable, uncut-time, collapsed-occurrence and fabricated-untimed-word product edits, each EXIT=1 on the fast target guards; all restored.
- /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/stage-3-mutations.md and /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/stage-3-gate.log: actual missing-Pause, seek-on-Select, duplicate-finalization, resume-before-landing, stale local/remote Pause resume, stale same/different Start seek, ignored-settings-snapshot and orphan-early-Release mutations; each EXIT=1, all restored. Refined Pause guards fail on actual stale resumes, not only timeout. Early-release orphan is a bounded timeout guard.
- /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/stage-4-gate.log: rendered production guard green, real guard-bypass mutation EXIT=1 without timeout, restored. Final sources/tests include every guard; final gate is green with no mutation installed.

## Known limits and batch handoff

No production reader interaction, gesture, native adapter, corpus, sound, persisted format or dependency was changed. Pure targets prove score-time/index/cut behavior, not recording alignment. Device tests cannot un-issue an already-issued native effect. Shared times do not promise uniquely lit words; unplayed/untimed targets are score-only.

Per /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/ruling-r1.md, batch verifier owns mounted native-base proof, base TargetMissing, all six scrub rows and player-seek-bar/player-swap-race/follow-seek on merged head. Existing planner web TargetMissing was inconclusive; it is not claimed feature-red. No implementor simulator/build/live/browser/audio/port/deployment/CI work or owner-data read was performed in these implementation stages.

Root gate, docs slow, full budget/test:reads and native live proof remain the orchestrator's batch checks under spec lines137–145. No blanket whole-repo gate/slow/e2e success is claimed. hshandbook's shared package/turbo edits must both survive any later batch rebase/merge. No out-of-scope fix is bundled.

This complete request is mirrored for an artifact-only commit at /Users/cvr/Developer/personal/.rifts/manna/hymseek/tmp/orchestrate/hymnapp/hymseek/round-1-request.md; the handback copy remains /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/round-1-request.md. The tested product head above remains exact; the request-only commit changes no executable source. Branch/artifact head and request-checker exit are recorded in /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseek/state.md.
