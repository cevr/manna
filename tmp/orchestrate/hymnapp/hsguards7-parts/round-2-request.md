ready
Protocol: worker protocol carried in the implementor prompt; no protocol.md or safety.md read.
Spec: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsguards7-parts/spec.md
Head: 275eaad1bc7d01494f015e6a51ab6f170267a515 (implementation and checked head; the mandatory request-only receipt commit follows).
Base: 5837d6850dec53cb4cff1f04b80d8bf8545cc3b0
Workspace: /Users/cvr/Developer/personal/.rifts/manna/hsguards7-parts-r2
Branch: hymnapp/hsguards7-parts-r2

## Change and fix report

M1: fixed 275eaad1b — guard: property, inside Owns, in `apps/heartseed/src/natural/voice.test.ts`.

The independent per-index membership oracle is unchanged. Each generated valid partition now also supplies near-partitions: drop an interior or final range, shrink one, shift one, empty one, append an empty boundary range, split one into two fractional non-empty ranges, duplicate one, and extend one into its neighbour or past the total. Original valid, doubled and arbitrary lists remain. Eight counters require at least one independently invalid example each: middle gap, end gap, overlap, duplicate, past total, empty, not whole and bad total. No census fault-message matching is used to award coverage.

Splits use 1.5 and count−1.5 only when count ≥3; neither half can be rejected merely as empty. The appended zero-count boundary range leaves coverage otherwise complete. These isolate the defects the first generator missed. No model, seed, history, step, floor, helper or product source changed.

There are no other findings or repeat findings in round 1. No ledger edit: the spec excludes `docs/lessons.md`; the guard lives entirely in the owned property.

`git diff --stat 5837d6850..275eaad1b | tail -1`:
`1 file changed, 58 insertions(+), 4 deletions(-)`.

One implementation commit: `275eaad1b test(heartseed): cover isolated census faults in generated partitions`. The worker protocol additionally requires the request committed: the receipt-only commit adds the mirror at `tmp/orchestrate/hymnapp/hsguards7-parts/round-2-request.md`, without changing checked code. U's state/log stay external; no git command ran in the main checkout.

## Run and checks

Let W be the workspace above, A=`$W/apps/heartseed`, and U the spec's unit directory. Every Bun command used:

`HOME=/private/tmp/claude-501/-Users-cvr-Developer-personal-manna/ea76698e-4894-40eb-b535-9af07b02bd7a/scratchpad/home-findbulk BUN_INSTALL_CACHE_DIR=/Users/cvr/.bun/install/cache bun`.

Git used the real HOME. Checks ran sequentially; test parts use their registered `--parallel=3` scripts. Long output went through `tail -n 20`.

Gate log: `/Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsguards7-parts/gate-2.log`.
Final exit line: `round-2 gate and acceptance exit 0`.

Focused round gate at the implementation head, exactly the spec's commands:

- A: `bun run typecheck` — exit 0.
- W: `bun packages/scripts/src/lint-gate.ts` and `bun packages/scripts/src/lessons/check.ts` — exit 0 each.
- A: `bun run test:natural-voice`, `test:natural-voice-b`, `test:natural`, `test:need-walk-d`, `test:need-walk-d3`, `test:need-walk-d2`, `test:infra` — exit 0 each; `gate exit 0`.
- W: `bun run lint:review` — `lint:review exit 0` (existing stored-answer warnings only).
- W: `bun run dead-exports` — `dead-exports debt=344 new=0 settled=0 grown=0`; `dead-exports exit 0`.
- Changed-file lint with `--threads=3`, formatting, normal precommit typecheck and lessons — all green.
- `bun run doc-lines 5837d6850` — `files=1 lines=0`; README's existing voice-model/partition descriptions remain true.

The only part touched in this round is `test:natural-voice`. Five standalone package-script trials at this head: 0.452, 0.481, 0.443, 0.456, 0.459 s; median **0.456 s**, green under 0.600. All exit 0, all judged; 1m/5m loads 2.52/4.42 → 2.63/4.41. Final part: 4 pass, 0 fail, 83,469 expects; census case alone: 14,947 expects. No assertions were removed.

## Acceptance at the implementation head

From A, use `bun test --parallel=3 --preload ./src/test/setup.ts` with `ACCEPT_APP=$A` for the three external test files:

| Check | Command suffix / command                                                  | Result                                                    |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1     | `$U/accept/voice-parts.test.ts`                                           | 4 pass / 0 fail; exit 0                                   |
| 2     | `$U/accept/walk-cover.test.ts`                                            | 3 pass / 0 fail; exit 0                                   |
| 3     | `$U/accept/registered.test.ts`                                            | 5 pass / 0 fail; exit 0                                   |
| 4     | `bun $U/accept/budget.ts $A 0.60 test:natural-voice test:natural-voice-b` | medians 0.454 / 0.442, both green; exit 0; load 2.63/4.41 |
| 5     | `bun $U/accept/budget.ts $A 0.85 test:need-walk-d test:need-walk-d3`      | medians 0.748 / 0.752, both green; exit 0; load 3.14/4.49 |
| 6     | `bun run test:infra`                                                      | exit 0 in focused gate                                    |

The first voice acceptance timing was unjudged (all tests passed, but load rose to 8.51/6.01). Retried once after quieting, green as above. The untouched model history timed out once during an early full-part fractional-mutant probe under external load; the committed property-only mutant proof and the restored full part/gate/five trials all pass or fail as intended, with the same timeout/assertions.

## Required mutant proof

Each verifier mutation was applied alone to `src/test/natural-voice.ts`, run against the committed property, and restored with the edit tool. Command from A: `bun test --parallel=3 --preload ./src/test/setup.ts ./src/natural/voice.test.ts -t 'counts every history'`.

| Mutant                                                                | New generated witness (from+count; total) | Observed                            |
| --------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| W4b: remove middle-gap fault (`range.from > at && false`)             | `6+1,0+2,2+1; total=7`                    | census case red, exit 1, 49 expects |
| W4e: permit empty (`range.count < 0`)                                 | `8+1,0+8,9+0; total=9`                    | census case red, exit 1, 14 expects |
| W4f: `Number.isFinite` instead of `Number.isInteger` for range bounds | `1.5+4.5,0+1.5; total=6`                  | census case red, exit 1, 35 expects |

The log records the final committed-property runs explicitly. All mutant edits are restored; no mutant file was created or remains. No own test/server process remains in the post-check process lists.

## Limits and handoff

No product behavior, Swift/iOS build, simulator, CI, model/API call, dependency change or main-checkout git operation. The full gate remains the batch's under the worker protocol and spec §Gate; this request reports the focused round gate, not an unauthorized full gate. No known code gap. Field-garden and the prior walk-d2 budget watch remain out of scope, unchanged. The receipt commit changes only this report, so all checked test code is identical to the implementation head.
