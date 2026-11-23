/* oxlint-disable effect/noTernary -- Exact's data module imports no effect (docs/exact.md), so a report it cannot read branches plainly. */

/**
 * The pinch's reports, as the app's module sends them (`modules/web/index.js`,
 * `modules/apple/Pinch.swift`), turned into the home list's step's inputs
 * (`src/find/step.ts`), as One's `home/pinch.ts` asks its rule: a begin starts
 * a gesture (`pinchBegin`), each move asks at its scale with no speed, and
 * the lift asks once more at its scale and speed. A cancel asks nothing, as
 * One's gesture asks nothing when it is cancelled.
 *
 * A run is the reports `;`-joined: `b`, `m <scale>`, `e <scale> <velocity>`
 * and `c`. A report this reader cannot read is dropped.
 */

import type { Input } from '../find/step.ts';

/** The step's input one report asks for, or none. */
const inputOf = (report: string): ReadonlyArray<Input> => {
  const [word, ...rest] = report.trim().split(/\s+/u);
  const numbers = rest.map(Number);
  const [scale = Number.NaN, velocity = Number.NaN] = numbers;
  switch (word) {
    case 'b':
      return [{ kind: 'pinchBegin' }];
    case 'm':
      return Number.isFinite(scale) ? [{ kind: 'pinch', scale, velocity: 0 }] : [];
    case 'e':
      return Number.isFinite(scale) && Number.isFinite(velocity)
        ? [{ kind: 'pinch', scale, velocity }]
        : [];
    default:
      return [];
  }
};

/** The step's inputs a run of reports asks for, in order. */
export const runOf = (run: string): ReadonlyArray<Input> =>
  run.split(';').flatMap((report) => inputOf(report));
