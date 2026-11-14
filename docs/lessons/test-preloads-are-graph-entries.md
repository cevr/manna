### test-preloads-are-graph-entries

- **Date:** 2026-11-14
- **Kind:** review
- **Said:** "env-pass does not take preload files as graph entries (`apps/hymnal/src/test/setup.ts`, `apps/heartseed/src/test/setup.ts`)."
- **Source:** hymnapp/batch-vb-42-findings.md o1 (On base, its first item)
- **Wrong:** A module a task preloads (`--preload` in its script, a bunfig's `preload`) ran before every test of the task, yet the env pass-through check followed only the test files' imports, so a variable read in a preload, or in a module only a preload imports, was dropped by turbo while the check printed no gap; a preload no module imports was taken for a root of the product, and its reads were not counted. Its test of a tsconfig's `extends` passed with `extends` ignored, as every alias it tried also resolved as a workspace package.
- **Cause:** The check took a task's modules to be its test files and what they import, where bun loads the preloads first. It now reads each task's preloads (its scripts' `--preload` and `-r`, the scripts it runs with `bun run`, a wrapper's flags, and the bunfig's `preload` and `[test]` `preload`), counts each as a module of the tests, and checks its reads against the tasks that preload it.
- **Guard:** code: `packages/scripts/src/env-pass/env-pass.test.ts` `a module a task preloads is an entry of that task: a variable it reads that turbo does not pass is a gap`; code: `packages/scripts/src/env-pass/env-pass.test.ts` `takes the paths of the tsconfig a tsconfig extends, from that one's folder, transitively, until one sets its own`
