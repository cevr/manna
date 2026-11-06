/**
 * Today's run against its model on generated devices, leaning toward a
 * Minutes tap around each ending of a recital (`src/test/run-walk.ts`):
 * every cell of how the recital ended (heard, unheard, refused, cancelled),
 * when the tap came (while it listens, while it finishes, after its end
 * with its item still held) and where the new plan puts the held item
 * (another item first, or the held one), each a floor met by generated
 * devices and each step checked against the run model.
 */

import { CELLS, walkCase } from '../test/run-walk';

walkCase(
  'cells',
  5,
  3,
  CELLS.map((cell) => cell.key),
);
