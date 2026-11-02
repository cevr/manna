// The woman's three seated keys (`seated/frames/record.json`, `../cast-sheet/look.md`):
// on her stool facing the viewer (`neutral`), her head turned a quarter
// toward the viewer's left, surprised (`turn`), and the same turn with a
// kind closed smile (`smile`). She sits picture-right of the lead.

import { Schema } from 'effect';
import { SeatedRecord, seatedFrames } from '../../../cutout/seated.ts';
import neutral from './seated/frames/neutral.png' with { type: 'file' };
import RECORD from './seated/frames/record.json' with { type: 'json' };
import smile from './seated/frames/smile.png' with { type: 'file' };
import turn from './seated/frames/turn.png' with { type: 'file' };

/** Her seated keys, read once from the record. */
export const SEATED = seatedFrames(
  'feast-guest-woman',
  Schema.decodeUnknownSync(SeatedRecord)(RECORD),
  {
    neutral,
    turn,
    smile,
  },
);
