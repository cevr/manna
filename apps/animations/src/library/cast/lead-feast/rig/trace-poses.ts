// How the series lead's seated pose is traced from his kept poses sheet
// (`bun run concept trace src/library/cast/lead-feast/rig/trace-poses.ts`
// from apps/animations), as his turnaround's views are (`trace.ts`,
// `standing`): poses-3, seated on a low stool three-quarters to screen left,
// his robe over his knees, his sandals showing. His other poses are his
// turnaround's views posed by their numbers. What stands beside him, the
// stool (a prop), is cut from him by a polygon; his sleeves
// lie on his garment, each the region its ink closes. The table it writes
// sits beside it (`seated-traced.ts`). Pure.

import type { TraceSheet } from '@manna/film/tools';
import { rect, sleeveAt, standing } from './trace.ts';

export const TRACE = {
  member: 'lead-feast',
  sheet: '../cast-sheet/kept/poses.png',
  kind: 'poses',
  views: {
    seated: standing({
      box: [604, 331, 892, 836],
      out: 'seated-traced.ts',
      about:
        'seated on a low stool, three-quarters to screen left: his face to our left, his ear behind; his cream right sleeve raised, his hand at his chin; his teal left sleeve on his lap, his hand there; his cream robe over his knees, the mantle over his left side; his sandals side by side under the hem',
      face: [742, 452],
      marked: {
        marks: {
          eyes: [
            [712, 440],
            [752, 440],
          ],
          brows: [
            [712, 422],
            [757, 422],
          ],
          mouth: [732, 477],
        },
      },
      ears: { earNear: [807, 462] },
      chin: { kind: 'open', row: 530 },
      near: {
        pick: sleeveAt([687, 582]),
        clip: rect(640, 515, 770, 690),
        below: 515,
        hand: [707, 527],
      },
      far: {
        pick: sleeveAt([802, 602]),
        clip: rect(740, 515, 860, 690),
        below: 515,
        hand: [732, 647],
      },
      arms: 'onGarment',
      necks: [],
      beside: [
        [809, 690],
        [900, 690],
        [900, 845],
        [809, 845],
      ],
      sash: { band: [790, 630, 812, 652], knots: [], ends: [] },
      hem: 792,
      split: 690,
    }),
  },
} as const satisfies TraceSheet;
