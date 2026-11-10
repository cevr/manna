ready

Protocol: worker protocol carried in the implementor prompt; protocol.md and safety.md were not read.
Spec: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/spec.md
Head: 20c1ce925622b8cc47dfa3869b7968831cefc745 (verified code head; following commit contains this report only).
Base: 2fe209339600ea5527595eb7867f0fdef9f48342
A3 amendment: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/ruling-a3.md
Workspace: /Users/cvr/Developer/personal/.rifts/manna/hsrigread
Branch: hymnapp/hsrigread

## Diff and commits

`git diff --stat 2fe209339600ea5527595eb7867f0fdef9f48342..20c1ce925622b8cc47dfa3869b7968831cefc745 | tail -1`:
`8 files changed, 1032 insertions(+), 36 deletions(-)`.

Commits, in order: `37b9f1b5f` frozen reference/property; `c3de59f02` scoped cheaper reader; `1ea6648ec` coverage/limits; `20c1ce925` proof-driven overhead reduction. All pushed to origin/hymnapp/hsrigread without force. An administrative commit adds the workspace copy of this report only; no code changes followed the verified head.

## Changes by file (relative to workspace)

- `apps/heartseed/src/test/field-rig.tsx`: scoped visibility/style plumbing, pure `readoutsOf(host)` with the same five minima, deferred reader loading. Rules, diagnostics, mount contract and frame collection remain intact.
- `apps/heartseed/src/test/seen.ts`: per-read identity snapshots, lazy values and iterative ancestor visibility; conservative eligible chain reuse for multi-row fields, identity fallback otherwise. No cache crosses reads, frames or mounts.
- `apps/heartseed/src/test/contrast.ts`: optional style-reader argument through the unchanged opaque-ground walk; default behavior and formula unchanged.
- `apps/heartseed/src/test/field-read-model.ts`: independent frozen base reader/contrast/readouts, unchanged since the first commit.
- `apps/heartseed/src/field/read.property.test.ts`: generated transitions, full field/minima parity, distinction witnesses and a real mounted malformed-frame fault witness; 22 tests, 639 assertions.
- `apps/heartseed/package.json` and `apps/heartseed/turbo.json`: exactly one new `test:field-read` with usual preload, slow exclusion, three workers and complete inputs.
- `apps/heartseed/README.md`: Tests section's new part and actual reader contract/host limits.

## Preservation and test contract

No existing test file, seed, floor, assertion, fault string, clock/deadline or observer call changed. Model seeds 7/19/83/211, 19 command kinds, floor 76 observations, two successive reads after every command, two mount generations, unbounded-support size/depth/branching draws and all five readout minima (including Infinity).

Coverage and seam audit: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/seams-and-floors.md
Eligibility/fallback proof and happy-dom limits: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/cache-proof.md
Manifest review: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/manifest-review.log

Manifest review checks actual package command grammar and rg import chains, not just counts: 78 transitive importing test files, 73 pre-existing parts plus the new part, no missing direct importer. All 155 selected field/contrast consumer parts passed the correctness gate.

## Gate and acceptance at verified code head

Gate log: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/gate-1.log
Exit line: `gate-1 exit=0; paired A3 is recorded separately in paired.log`.
Gate includes A1, all selected field/contrast parts, typecheck, infra, clock-reads, changed-file lint/format, A2, stored-answer lint:review, docs, read hashing and Heartseed budget. Every step exit 0; no assertion weakened or dependency installed.

A1 command from absolute workspace/apps/heartseed: `bun test --no-isolate --parallel=3 --preload ./src/test/setup.ts ./src/field/read.property.test.ts`.
Exit line: `A1 exit=0; owned process group empty`; 22 pass, 0 fail, 639 assertions, 796 ms.

A2 command from absolute workspace: `bun /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/mutants.ts`.
Exit line: `A2-mutants exit=0; owned process group empty`; restored-green 22/639, exit 0.
Seven actual integration defects fail named semantic assertions: omit ancestor -> ancestor; omit inline -> generated parity/inline; omit tag -> tag; stale sheet/remount reuse -> stylesheet-remount; transparent text seen -> transparent; passing contrast -> contrast; bypass frame faults -> malformed mounted frame. No missing-import/typecheck kill claim and no committed mutant.

## A3: retained matrix plus authorized focused rerun

Retained full session: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/paired.log
Amended review and focused receipt: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/reader-remove-rerun.log

The original full session's `paired timing exit=1` is preserved, not rewritten. Under the explicit ruling's max(3%, 30 ms) tolerance, all 73 other parts pass without resampling. Review checks all 636 retained samples: every test exit 0; maximum before/after load 4.9893. Garden paired median 949.609 -> 635.489 ms (<800); introduced field-read 847.053 ms (<900). Other importing medians are <1000 except the separately ruled reader-remove. Exact non-projected shelves-walk-lists-a median 864.937 ms (<900).

Authorized command from absolute workspace: `bun /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/reader-remove-rerun.ts`.
Review exit: `ruling retained review exit=0; passes-without-resampling=73; focused-rerun=test:reader-remove; unexpected-failures=`.
Focused exit: `reader-remove five-pair exit=0; owned child groups empty; base-over-1000ms-in-retained-session=budget-backlog`.

Five alternating pairs, three workers, every sample load <=5, unchanged actual two-file task command. Base samples (ms): 1197.322, 831.253, 858.222, 866.428, 852.054. Head: 837.889, 850.876, 832.316, 832.790, 859.798. Medians base 858.222, head 837.889; delta -20.333 ms, allowed increase 30 ms. All ten exits 0. It does not still regress, so the ruling requires neither a profile nor a fix. No code changed; the existing head gate remains applicable.

Timing uses actual part commands and symmetric scratch loaders: exact base sources via git show, identical loader overhead on both versions, same tests/dependencies/test clock. The sole base helper addition exposes its existing readout computation. All raw samples, Bun summaries, loads and exits remain available; no selected samples or synthetic load. Every child starts in its own process group and is checked empty afterward.

Baseline performance red receipt: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/base-timing.log (garden 876 ms against <800).
Earlier failed/load-rejected sessions remain at /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/paired-attempt-1.log and /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/paired-attempt-2.log. The earlier blocked report is historical, superseded by the ruling and focused proof, not deleted.

## How to run

Before every bun/git command, cd to the absolute workspace (or its apps/heartseed for A1). Bun environment: `HOME=/private/tmp/claude-501/-Users-cvr-Developer-personal-manna/ea76698e-4894-40eb-b535-9af07b02bd7a/scratchpad/home-findbulk BUN_INSTALL_CACHE_DIR=/Users/cvr/.bun/install/cache`; git uses real HOME. Use pipefail and `2>&1 | tail -n 12`. No installation needed. Gate command: `bun /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/gate.ts`. The focused rerun command above also reviews the retained session under the ruling; do not resample passing parts.

## Known gaps and backlog

- Budget backlog: retained reader-remove base median 1018.246 ms (head 1130.562 ms) in the earlier full harness. Preserve this pre-existing >1000 ms finding; the authorized quiet five-pair rerun passes. Idle-host `test:budget @manna/heartseed` is green in gate-1.log; batch verifier repeats it under the ruling.
- Happy-dom-only test optimization. Media/pseudo context is only proven to happy-dom's behavior; unknown stylesheet/context inputs fall back. No browser/native rendering, motion, contrast or performance proof is claimed.
- No native/live row added. No simulator, iOS/Swift/device build, browser, microphone, sound, screenshot, privacy grant, deploy, Alchemy, paid call or CI action. Live rows and merged batch gates remain the orchestrator/verifier's.
- No unresolved correctness finding. No source edits followed the focused rerun. State and complete receipt paths are in /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsrigread/state.md.
