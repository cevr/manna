// How the series lead's raised and seated poses are traced from his kept
// poses sheet (`bun run concept trace src/library/cast/lead-feast/rig/trace-poses.ts`
// from apps/animations), as his turnaround's views are (`trace.ts`,
// `standing`): poses-1, standing three-quarters to screen left, his near
// sleeve raised and bent at its elbow below the bottle in his hand (a
// standing view's sleeve, drawn narrow beside his side, raises to a stick, and
// his garment runs on under it); poses-3, seated on a low stool
// three-quarters to screen left, his robe over his knees, his sandals
// showing. His other poses are his turnaround's views posed by their numbers.
// What stands beside him, the bottle and the stool (props), is cut from him
// by a polygon; a seated sleeve lies on his garment, the region its ink
// closes. The tables it writes sit beside it (`raised-traced.ts`,
// `seated-traced.ts`). Pure.

import type { TraceSheet } from '@manna/film/tools';
import { rect, sleeveAt, standing } from './trace.ts';

export const TRACE = {
  member: 'lead-feast',
  sheet: '../cast-sheet/kept/poses.png',
  kind: 'poses',
  views: {
    raised: standing({
      box: [22, 226, 310, 828],
      out: 'raised-traced.ts',
      about:
        "standing three-quarters to screen left, his head rolled toward the bottle: his face to our left, his ear behind; his cream right sleeve raised, bent at its elbow below his hand, the bottle in his hand at his shoulder's height; his teal left sleeve hanging at his side; the cream sash knotted at his waist, its two ends hanging; his sandals",
      face: [190, 360],
      marked: {
        marks: {
          eyes: [
            [164, 340],
            [206, 342],
          ],
          brows: [
            [168, 313],
            [212, 320],
          ],
          mouth: [180, 383],
        },
      },
      ears: { earNear: [262, 366] },
      chin: { kind: 'closed', row: 408 },
      sharp: [],
      // The band of curls behind his ear runs out to a hairline thinner than 2 px opens.
      hairOpen: 3,
      // The lit rim down his face's left edge (145-148 on row 330).
      skinLit: ['#fbd59c', '#f9bf86'],
      near: {
        pick: { silhouette: true },
        // His raised sleeve, from his cuff under his hand round his elbow to his shoulder, cut from his tunic where the sheet shades it there.
        clip: [
          [10, 428],
          [96, 428],
          [106, 436],
          [154, 414],
          [160, 424],
          [150, 446],
          [137, 503],
          [137, 525],
          [10, 525],
        ],
        below: 503,
        hand: [38, 400],
        // All but a tongue of its root round its pivot (124.7, 477.9), clear of its edges: the rest his garment gives up.
        off: [
          [0, 400],
          [160, 400],
          [160, 464],
          [106, 464],
          [106, 494],
          [160, 494],
          [160, 540],
          [0, 540],
        ],
      },
      far: {
        pick: { silhouette: true },
        // Its inner edge in the dark the sheet paints between his sleeve and his mantle (239-246), so the sleeve covers it.
        clip: [
          [330, 440],
          [262, 440],
          [248, 462],
          [239, 485],
          [238, 600],
          [244, 614],
          [330, 614],
        ],
        below: 470,
        hand: [278, 636],
      },
      arms: 'raised',
      necks: [],
      // The bottle in his hand, no part of him.
      beside: [
        [44, 314],
        [102, 314],
        [102, 421],
        [44, 421],
      ],
      sash: {
        band: [128, 551, 246, 575],
        knots: [[184, 564, 17, 13]],
        ends: [
          { top: [165, 180, 575], bottom: [156, 175, 674] },
          { top: [181, 198, 575], bottom: [179, 204, 716] },
        ],
      },
      hem: 786,
      split: 192,
    }),
    reaching: standing({
      box: [899, 232, 1221, 829],
      out: 'reaching-traced.ts',
      about:
        'standing three-quarters to screen left, leaning to the low table: his face to our left, his ear behind; his cream right sleeve reaching down from his shoulder to his hand on the bottle there, the sleeve against his side; his teal left sleeve hanging; the cream sash knotted at his waist, its two ends hanging; his sandals',
      face: [1042, 382],
      marked: {
        marks: {
          eyes: [
            [1024, 364],
            [1065, 361],
          ],
          brows: [
            [1017, 338],
            [1063, 336],
          ],
          mouth: [1056, 402],
        },
      },
      ears: { earNear: [1126, 350] },
      chin: { kind: 'closed', row: 428 },
      sharp: [],
      // The lit rim down his face's left edge (1009-1010 on row 380).
      skinLit: ['#f9dda2', '#fac88d'],
      near: {
        pick: { silhouette: true },
        // His sleeve from his shoulder down to his hand on the bottle, cut from his tunic where the sheet shades it there, short of the bottle and ending at his hand's middle; the drape under his elbow against his side his garment's (a hand ends its sleeve: no sleeve lies farther from the elbow than it).
        clip: [
          [975, 415],
          [1046, 415],
          [1056, 440],
          [1054, 535],
          [1000, 575],
          [984, 588],
          [975, 560],
        ],
        below: 465,
        hand: [980, 585],
        // All but its shoulder (above row 465): the rest his garment gives up.
        off: rect(960, 465, 1070, 630),
      },
      far: {
        pick: { silhouette: true },
        // Its inner edge on the line the sheet inks between his sleeve and his mantle.
        clip: [
          [1230, 440],
          [1165, 440],
          [1145, 470],
          [1140, 490],
          [1146, 530],
          [1152, 590],
          [1155, 613],
          [1230, 613],
        ],
        below: 480,
        hand: [1194, 634],
      },
      arms: 'raised',
      necks: [],
      // The low table and the bottle on it, no part of him.
      beside: [
        [890, 515],
        [978, 515],
        [978, 612],
        [1012, 612],
        [1012, 650],
        [985, 650],
        [985, 840],
        [890, 840],
      ],
      sash: {
        band: [1050, 556, 1142, 580],
        knots: [[1106, 568, 17, 14]],
        ends: [
          { top: [1088, 1100, 582], bottom: [1078, 1097, 676] },
          { top: [1103, 1116, 582], bottom: [1102, 1125, 716] },
        ],
      },
      hem: 786,
      split: 1125,
    }),
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
      chin: { kind: 'closed', row: 517 },
      sharp: [],
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
