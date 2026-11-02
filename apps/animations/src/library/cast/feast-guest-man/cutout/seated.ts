// The man's three seated keys (`seated/frames/record.json`, `../cast-sheet/look.md`):
// on his stool facing the viewer (`neutral`), his head turned a quarter
// toward the viewer's right, surprised (`turn`), and the same turn with a
// kind closed smile (`smile`). He sits picture-left of the lead.

import { Schema } from 'effect';
import { SeatedRecord, seatedFrames } from '../../../cutout/seated.ts';
import neutral from './seated/frames/neutral.png' with { type: 'file' };
import RECORD from './seated/frames/record.json' with { type: 'json' };
import smile from './seated/frames/smile.png' with { type: 'file' };
import turn from './seated/frames/turn.png' with { type: 'file' };

/** His seated keys, read once from the record. */
export const SEATED = seatedFrames(
  'feast-guest-man',
  Schema.decodeUnknownSync(SeatedRecord)(RECORD),
  {
    neutral,
    turn,
    smile,
  },
);
