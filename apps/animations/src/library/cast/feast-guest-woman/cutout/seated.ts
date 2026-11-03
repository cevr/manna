import { Schema } from 'effect';
import { SeatedRecord, seatedFrames } from '../../../cutout/seated.ts';
import neutral from './seated/frames/neutral.png' with { type: 'file' };
import RECORD from './seated/frames/record.json' with { type: 'json' };
import smile from './seated/frames/smile.png' with { type: 'file' };
import turn from './seated/frames/turn.png' with { type: 'file' };

export const SEATED = seatedFrames(
  'feast-guest-woman',
  Schema.decodeUnknownSync(SeatedRecord)(RECORD),
  {
    neutral,
    turn,
    smile,
  },
);
