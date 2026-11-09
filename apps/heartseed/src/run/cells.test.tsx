/**
 * Today's run against its model on generated devices, leaning toward a
 * Minutes trip after each ending of a recital, its item still held
 * (`src/test/run-walk.ts`): every cell of how the recital ended (heard,
 * unheard, refused, cancelled) and where the plan made in home's Settings
 * sheet puts the held item (another item first, or the held one), each a
 * floor met by generated devices and each step checked against the run
 * model. The cells of a making while a recital listens or finishes are
 * `src/session/cells.property.test.ts`'s. This part runs the walk's first
 * device, `src/run/cells-b.test.tsx` and `src/run/cells-c.test.tsx` its
 * second and third.
 */

import { CELLS, walkCase } from '../test/run-walk';

walkCase('cells', 20, 1, [...CELLS.map((cell) => cell.key), 'settings:minutes']);
