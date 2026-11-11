ready — implementor hymseekguard r1

Protocol: supplied orchestrate worker protocol (Implementor). Spec: `/Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseekguard/spec.md`. Head commit: `99addc1a2ca13fb174e80c9337b33ffd0fc990f7` on `hymnapp/hymseekguard`, workspace `/Users/cvr/Developer/personal/.rifts/manna/hymseekguard`.

## Commits

Base `267cfa8074eb3b0307caf0f049a03b9b3b8df047`; implementation head `99addc1a2ca13fb174e80c9337b33ffd0fc990f7`.

`git diff --stat 267cfa807..99addc1a2 | tail -1`: 2 files changed, 104 insertions(+), 11 deletions(-).

- `99addc1a2`: `test(hymnal): guard seek offers and competing input`.
- The request is committed separately as a protocol artifact; no product file changes.

## What changed, by file

- `apps/hymnal/src/reader/WordSeek.test.tsx`:
  - T1: the existing no-seek-control guard counts every drawn element outside the words with a click handler or tabindex, irrespective of its role or name. Existing About, Favourite and Resume follow controls are exempt; named/group, old-id and unseen-status checks remain.
  - T3: Enter and the arrows during a pointer's armed contact leave the hold Free, the timer armed, and the cues and chosen lines unchanged. Its deadline and lift still perform the ordinary pointer seek.
  - T4: call the public action-props hook with the real page seek, observe forwarded step commands at that input boundary, and perform unoffered next-line while idle. Nothing is forwarded and the real seek stays Free. The positive case opens a hold and performs an offered next-line, proving it reaches and moves the real page.
- `apps/hymnal/src/reader/word-seek.property.slow.test.tsx`:
  - T2: after every generated command, while a web or native finger holds, every sung line must offer zero actions, not merely lack `seek`. Both surfaces have coverage floors in the existing coverage case.

No product behavior changed, so no feature-map edit is needed.

## How to run

With the Bun HOME and cache from the start message, from `W/apps/hymnal`:

- `bun run test:seek`.
- `bun test --parallel=3 --preload ./src/test/setup.ts ./src/reader/word-seek.property.slow.test.tsx`.
- Focused round gate: `sh U/gate-1.sh` (sequential checks; three-worker tests and lint).
- Mutation reproduction: apply the matching `U/mut-T<N>.patch` with the host file tool, run the command in `U/mutants.md`, and restore that product edit before the next mutant. Do not commit a mutant.

Here `U=/Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hymseekguard`, `W=/Users/cvr/Developer/personal/.rifts/manna/hymseekguard`.

## Gate at the implementation head

`U/gate-1.log`: `gate exit=0`.

- Hymnal workspace typecheck: exit 0.
- `test:seek`: 21 pass / 0 fail, exit 0.
- Touched-file lint in `JUDGED_REVIEW=1` mode: exit 0; touched-file format check: exit 0.
- `bun run dead-exports`: exit 0, `new=0` (344 debt, no growth or stale debt).
- Normal pre-commit lint, formatting, hymnal typecheck and lessons checks also passed; no hook was disabled.

The supplied worker protocol's focused-check rule reserves the full gate and repo-wide lint to the batch. Accordingly `bun run gate` and the repo-wide `bun run lint:review` requested in the start message are deferred to the orchestrator, not claimed green here. There is no common.md override.

## Acceptance at the implementation head

`bun test --parallel=3 --preload ./src/test/setup.ts ./src/reader/word-seek.property.slow.test.tsx` at `99addc1a2`: `acceptance exit=0`, 136 pass / 0 fail, in `U/gate-1.log`.

Quiet budget at `99addc1a2`: `U/budget-1.log`, `budget exit=0`. The only touched unit-test part, `test:seek`, ran alone at one-minute load 4.83 before and after: 21 pass / 0 fail, Bun 793 ms, external wall 0.80 s (<0.9 s). No base backlog comparison is needed.

## Mutants: apply, run, restore

All four were applied individually at `99addc1a2`, run, and restored with the host patch tool. Logs: `U/head-mut-T1.log` through `U/head-mut-T4.log`. Every log ends `head=99addc1a2 mutant T<N> exit=1`.

| ID  | Mutant                                                | Red result                                                                                                                |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| T1  | Roleless Pressable drawn as Seek beside Resume follow | No-button guard: one extra tappable element in all four states; 1 fail                                                    |
| T2  | Drop the non-steps early return in seekActionsOf      | Web seed 0 and native seed 1 fail at their first held contact with `offer=no actions during finger hold`; 61 fail overall |
| T3  | Drop contact-not-Idle from the web typed listener     | Candidate contact is stolen by Enter, producing seek-grab and an outline; 1 fail                                          |
| T4  | Drop names.includes(name) from useSeekActionProps     | Unoffered next-line reaches the step boundary; 1 fail                                                                     |

The final restored-head focused gate is green. `git diff --exit-code` after reverting all four was 0. Process listings after every check showed no remaining worker-started child. No simulator or server was started.

## Known gaps / precise boundary

- T4's mutant does not make the actual seek leave Free: the downstream step method has an independent idle guard. A Free-only assertion cannot kill that mutant. The test therefore checks both Free and no forwarded step at the hook's documented public boundary, plus a positive offered-step case. No product defect was found.
- happy-dom and existing gesture fixtures only; no simulator, screenshot, microphone, privacy grant or audio. No paid model call, install, native build or persisted-format change.
- Full gate and repo-wide review lint belong to the batch, as above.

## Retro

The previous guard trusted accessibility roles and checked only the entry action, while the fixture prevented unoffered actions before the product saw them. The new guards inspect drawn tappability, compare all offered actions during finger holds, and test the action hook's public command boundary directly. No new testing framework or product seam was added.
