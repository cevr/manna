ready: hsplantset r1 — hand-drawn Today and Planted, migrated drawing oracles and focused gate green
Protocol: worker protocol carried in the implementor prompt (not reread from protocol.md).
Spec: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsplantset/spec.md
Head: 6506f5fd6 (product/docs head; final receipt commit also drops one unused lint directive, without behavior/assertion changes).
Base: 7e52f7ede
Workspace: /Users/cvr/Developer/personal/.rifts/manna/hsplantset
Branch: hymnapp/hsplantset

## Commits and delta

1. 9b756a5f0 — feat(heartseed): hand-drawn plants on Today and Planted
2. 43d5f1e41 — test(heartseed): observe stage images through reads and recalls
3. bf309d10e — test(heartseed): the first minute owes its planted seed image
4. 739ab9bff — test(heartseed): plant images across stages schemes and remounts
5. 6506f5fd6 — docs(heartseed): the plant set and its verification limits

`git diff --stat 7e52f7ede..HEAD | tail -1` at the product/docs head:
`22 files changed, 1060 insertions(+), 190 deletions(-)`.
The final receipt commit records this request and removes only the unused
effect/noGlobals directive from plantset.test.tsx. All product sources,
assertions, seeds, devices, schedules and floors are identical to that head.

## Changed files

Paths are repo-relative; Heartseed paths begin apps/heartseed/.

- src/home/plant.tsx (new): still PlantImage, literal stage-to-home-icon mapping, direct ICON_IMAGES/useScheme, 28 or 112 pt, matching source/defaultSource, contain, hidden wrapper/image with the existing plant ids. No field/plot import cycle.
- app/index.tsx: stage-line drawing/import/doc only; PlantImage at 28 pt; conditions unchanged.
- src/first/screen.tsx: Planted drawing/import/doc only; seed at 112 pt in the existing 120 pt place, no scale wrapper.
- src/sayit/draw.tsx: PlantMark and its exclusive styles/import retired; other exports, styles and motion unchanged.
- src/test/plant-image-rule.ts (new): source-normalized image oracle, hidden state, exact cardinality/geometry and still ancestors; anonymous asset scan; authorized home/end classification.
- src/test/stage-rig.tsx: image identity plus effective scheme and stage attribution replace primitive-colour fingerprints. No clock, scheduling or launch edits. Root/claim watcher remains. Home/end alone exempted; forbidden frames still examined with every id/label absent.
- src/garden/today.test.tsx, today-reads.test.tsx, today-reads-b.test.tsx: exact asset assertions and exact required stage maps (four/three/three); retain nonzero forbidden frames, UNREAD_LOOKS >10, all recital/growth/peek/Again/restart/disk/chime assertions. Today summary title now truthful.
- src/test/first-rig.tsx: additive drawing checks at frame/settle seams; Planted owes the actual correct-scheme seed, earlier phases/failing writes owe none. Existing model, waits, commands, seeds and floors unchanged.
- src/first/screen.test.tsx: Planted drawing subtree only in the golden; accurate case/doc title. Non-drawing golden rows and other phases unchanged.
- src/look/first.test.tsx, today.test.tsx: additive source/scheme assertions at existing re-theme checkpoints, no model changes.
- src/home/plantset.test.tsx (new): exhaustive finite property, generated presentation model, seeded oracle fixtures, stored-appearance root cases with motion on. The receipt commit removes its unused noGlobals suppression only.
- package.json, turbo.json: additive test:plantset script/task/dependency and minimal exactly-once/hash-input exclusions; no existing test redistribution.
- README.md: Say it drawing leaf, First minute, Garden, shared icons, migrated test descriptions, new test:plantset entry and native verification limits.
- .claude/skills/verify-heartseed/SKILL.md and features/first.md, grow.md, today.md: drawing contract, first-plantset/today-plantset map rows, native AX versus mounted-image evidence, no-relaunch Today branch and explicit visual/test-only limits. Existing feature ids retained.
- docs/lessons.md: only the Guard title corresponding to today's renamed summary case, authorized by U/ruling-lessons.md. No lesson assertion changed.
- tmp/orchestrate/hymnapp/hsplantset/round-1-request.md: committed mirror of this external run file, since U itself is outside W. No planner file or acceptance scratch test ships.

## Proof domain and mutant sensitivity

PlantImage mounts every 4-stage × 2-scheme × 2-size cell (16); literal
filenames/dimensions are independent of the product mapping. The first
commit is observed before the Image load effect, so defaultSource removal
is caught rather than hidden by a settled source.

The presentation model runs 16 deterministic sequences × 12 commands
(192 post-command comparisons), with all 14 literal transition floors
asserted: each stage, both scheme directions at both sizes, both size
directions, repeated values and remount in the other scheme. Commit 4's
handoff counted 15 floors incorrectly; the actual unmodified list has 14.
Root cases add stored Light/Dark over the opposite system in both screens,
and turn motion on so an entrance around stage text cannot hide behind the
preload's Reduce Motion default.

U/mutants-1.md records each real product mutant alone, exact failing case
and assertion, the revert by edit and restored green parts. Summary:

| Mutant                                     | Assertion that killed it                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Today missing image                        | external Today image count; committed Today/root drawn assets empty instead of seed/corn               |
| Planted missing image                      | external Planted image count; first model: Planted draws 0 images in the plant                         |
| corn mapped to ear                         | 16-cell full corn/light/28 and command-model SetStage: ear-light, not corn-light; Today full-corn root |
| force light in dark                        | cell seed/dark/28; model SetScheme; both dark root/appearance walks                                    |
| cache scheme at mount                      | model seed 1 command 1 SetScheme; mounted dark-first/dark-today flip checkpoints                       |
| remove defaultSource                       | first-commit sources [] rather than [seed-light]; root frame 0 images                                  |
| zero size                                  | 0px×0px rather than 28/112px in property/model/first model                                             |
| keep scale(4) ancestor                     | first model/root fault: a drawing transformed scale(4)                                                 |
| expose wrapper and image                   | property/root: the plant exposed; first model hidden-seed check                                        |
| anonymous seed on unread Today             | reads-b source scan: unread: the image assets/home/seed-light.png where none is owed                   |
| seed in alone before landed write          | alone/write model frame: 1 plants where none is owed; anonymous source fault too                       |
| corn inside correct hidden Planted wrapper | planted model frame: corn-light, not seed-light                                                        |
| whole stage row entrance                   | motion-on root: moving [0,0] rather than [null,null] for stage text and plant                          |

All killed by assertions, not hangs/timeouts. Settled external acceptance
intentionally misses cached-scheme/defaultSource/scale-ancestor defects;
the committed model/first-frame/ancestor checks kill them. Restored run
passed all 11 involved parts plus external acceptance; product source is
unchanged since those receipts.

## How to run and gate

For every bun command, use the HOME and BUN_INSTALL_CACHE_DIR of spec Work
rules, an absolute cd, pipefail and `2>&1 | tail -n 12`. Git uses real HOME.

Acceptance, at product/docs head 6506f5fd6:
`cd /Users/cvr/Developer/personal/.rifts/manna/hsplantset/apps/heartseed && HS_W=/Users/cvr/Developer/personal/.rifts/manna/hsplantset bun test --preload ./src/test/setup.ts /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsplantset/accept/plantset.test.ts`
Exit line: `acceptance exit=0` (3 pass, 0 fail, 110 expects, 702 ms).
Base acceptance: 1 pass, 2 fail because actual mounted Today/Planted lacked images (U/planner-receipts.md).

Gate log: /Users/cvr/Developer/personal/manna/tmp/orchestrate/hymnapp/hsplantset/gate-1.log
Exit line: `Final gate exit: 0`.

Completed: Heartseed typecheck; filtered turbo test (186 successful/186,
0 cached); standalone plantset/today/reads/reads-b/first/dark-first/
dark-today/walk-planted/walk-write, all green and below 0.9 s at loads
1.38–1.43 (1 minute), 2.20 (5 minutes). Times in that order: 651, 685,
716, 526, 748, 632, 867, 817, 872 ms. Docs 130 pass/0 fail, 162 expects.
Final lint:review exit 0; changed-file oxlint exit 0; all 22 changed files
pass oxfmt --check; required fmt changes nothing (before/after diff hash
equal). Full Heartseed budget exit 0 and exactly-once/strength audit green
(loads 2.76/2.91 before, 4.56/3.44 after). The other first-rig consumers'
standalone budget logs are 583–811 ms, also below 0.9 s. test:reads:
219 unit-test tasks, 0 failures, exit 0. Final docs: 130/0, exit 0.
doc-lines: 22 files/36 lines, exit 0; relevant drawing clauses reread.
Final typecheck exit 0; restored acceptance after the directive removal
3/0, 110 expects, 699 ms, exit 0. Processes inspected after every heavy
check; none started by this agent remain. No flake or weakened assertion.

Preparation corrections, not flakes: fmt --threads=3 duplicated the
repository script's hardcoded thread flag (rerun prescribed fmt); first.md
receipt commands needed explicit --cwd and an external ACCEPT variable
rather than a tracked-path claim for scratch; lint:review exposed one
unused noGlobals directive, now removed. No assertions weakened.

## Suppressions and shared hunks

No product suppression or next-line third-party-API suppression added.
New test-only file headers: plant-image-rule.ts disables effect/noNullish
for absent DOM attributes/styles/ancestors; plantset.test.tsx disables
effect/noNullish, effect/noAsyncFunction, effect/noTernary and
eslint/no-await-in-loop for DOM observations and sequential React act
commands. Each has its reason. The unused effect/noGlobals was removed.
Commit 5 adds none.

Shared with hsguards7: package.json/turbo.json additive plantset registration;
README drawing/test descriptions; stage-rig and first-rig drawing-only
hunks; first/screen.test.tsx drawing golden/title only. No split or clock
work. hshandbook's package/turbo changes must both survive batch landing.
Fetched main after commit 5 and again immediately before this request:
still 7e52f7ede, so no rebase/force-push.
Only unit-branch pushes, explicitly requested by orchestrator despite the
spec's default no-push line; main untouched outside U.

## Known gaps and batch obligations

No simulator/live row, Swift/iOS build, device install, browser,
screenshot, microphone, sound/privacy action, deploy or paid call run.
Batch verifier owns first-plantset/today-plantset and the preserved
first/today/grow rows, on its merged head and under its assigned lock.
AX portions intentionally pass base and prove reach/semantic parity, not
artwork. Same-head test:plantset and external acceptance establish hidden
sources/declared geometry/hidden state/re-theme; sharpness, transparent
edges/crop, physical fit, colours, large Dynamic Type, pronunciation and
motion feel remain outside AX proof. Dark/full-corn/first-minute states
not reached live are test-only; no new overnight drive. Owner Release
visual review from main only if requested.

Root full gate and merged-head cache/read audit remain batch obligations.
This unit ran only its focused package gate plus explicitly requested
review/docs/read/budget tooling. No CI was checked or awaited.
