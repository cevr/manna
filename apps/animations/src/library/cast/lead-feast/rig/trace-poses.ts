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
import { oval, rect, sleeveAt, standing } from './trace.ts';

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
      // His ear's skin runs on into the rose of his cheek (no line, rows 354-374): x 247-269, rows 345-375.
      earClips: { earNear: oval(258, 360, 11, 15) },
      // The band of curls under his ear (x 232-262, rows 378-393), parted from his hair by the sheet's line.
      earBand: 'under',
      earLit: oval(258, 360, 11, 15),
      chin: {
        kind: 'closed',
        // Below his jaw's line where it leaves his chin's ink (rows 408-418 at x 188).
        row: 420,
        // His jaw's line, rising from his chin's ink to his ear, in a deep rose (#d7774b at 192,413; #d36d43 at 222,400): 10 rows deep at x 188, 5 at x 224.
        paint: 'rose',
        line: [
          [186, 406],
          [228, 394],
          [232, 400],
          [206, 416],
          [188, 420],
          [186, 420],
        ],
        // That rose, from his chin's ink up to his ear, and the soft rose under it on his neck (#ea9566 at 202,423); his head rolled from the light, the soft rose runs on up his face's far edge to his temple (x 236-240 at row 330, x 228-258 at row 370).
        shade: [
          [234, 326],
          [244, 326],
          [244, 350],
          [262, 356],
          [262, 372],
          [244, 384],
          [234, 396],
          [232, 414],
          [204, 432],
          [186, 428],
          [186, 404],
          [204, 400],
          [218, 390],
          [226, 378],
          [228, 354],
        ],
      },
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
    drinking: standing({
      box: [324, 226, 601, 831],
      out: 'drinking-traced.ts',
      about:
        'in profile to screen left, his head tipped back, drinking from the wooden plate at his lips: one eye, his ear behind his cheek, his curls behind; his teal left sleeve raised before him, its upper arm across his chest, its forearm up to his hand under the plate; his cream right sleeve raised beyond it to his hand at the plate; the sash knotted at his front, its end hanging; his sandals',
      face: [485, 347],
      marked: {
        marks: {
          eyes: [[465, 330]],
          brows: [[475, 307]],
          // His mouth at the plate's rim, hidden by it: where the sheet would draw it.
          mouth: {
            ends: [
              [441, 361],
              [452, 363],
            ],
            line: 5,
          },
        },
      },
      ears: { earNear: [528, 360] },
      // His ear's skin runs on into his cheek at its front (no line, rows 350-372): x 517-541, rows 342-375.
      earClips: { earNear: oval(529, 358, 12, 17) },
      earLit: oval(529, 358, 12, 17),
      // His head tipped back: no line under his jaw runs level, so his head runs down his throat to the neckline (row 440), the shade under his jaw a tone on it.
      chin: {
        kind: 'open',
        row: 440,
        // His jaw's line, from his chin's ink back to under his ear, in a deep rose (#d4744a at 482,398; #e68e60 at 508,388).
        paint: 'rose',
        line: [
          [470, 394],
          [490, 391],
          [512, 383],
          [514, 389],
          [492, 402],
          [470, 405],
        ],
        // That rose, and the soft rose under it down his throat (#f29660 at 494,406).
        shade: [
          [468, 392],
          [484, 388],
          [500, 384],
          [510, 376],
          [520, 378],
          [520, 392],
          [512, 402],
          [512, 418],
          [474, 418],
          [468, 404],
        ],
      },
      sharp: [],
      near: {
        pick: { silhouette: true },
        // His teal sleeve: its forearm up from his elbow to his hand, its upper arm across his chest to his shoulder, cut from his mantle where the sheet shades it.
        clip: [
          [388, 406],
          [396, 393],
          [420, 393],
          [432, 400],
          [440, 404],
          [454, 440],
          [522, 414],
          [532, 420],
          [530, 494],
          [470, 502],
          [432, 514],
          [400, 508],
          [384, 482],
        ],
        below: 830,
        hand: [404, 370],
        // His forearm's top half his garment gives up; its lower half (joining his far sleeve to him) and his upper arm on his chest it keeps, under the sleeve.
        off: rect(330, 380, 440, 440),
      },
      far: {
        pick: { silhouette: true },
        // His cream sleeve beyond his teal forearm, from its elbow up to his hand at the plate.
        clip: [
          [336, 388],
          [386, 388],
          [384, 470],
          [400, 500],
          [380, 506],
          [338, 482],
        ],
        below: 830,
        hand: [354, 375],
        // His garment keeps all of it (no `off`), joined to him through his teal elbow: it turns about its elbow inside that.
      },
      arms: 'raised',
      necks: [],
      // The plate at his lips, no part of him; and his hands under it, their own circles (none of his neck).
      beside: [
        [326, 294],
        [420, 294],
        [456, 330],
        [452, 366],
        [440, 384],
        [442, 398],
        [432, 410],
        [340, 410],
        [326, 390],
      ],
      sash: {
        band: [432, 550, 540, 576],
        knots: [[444, 562, 11, 13]],
        ends: [{ top: [434, 452, 576], bottom: [433, 453, 703] }],
      },
      hem: 784,
      split: 470,
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
      // His ear's skin runs on into the rose of his cheek (no line, rows 340-370): x 1104-1128, rows 334-372.
      earClips: { earNear: oval(1116, 352, 12, 18) },
      earLit: oval(1116, 352, 12, 18),
      chin: {
        kind: 'closed',
        row: 428,
        // His jaw's line, rising from his chin's ink (x 1069, rows 419-426) to his ear, in a deep rose (#d16e44 at 1075,422; #d47148 at 1101,403).
        paint: 'rose',
        line: [
          [1067, 416],
          [1107, 397],
          [1111, 402],
          [1109, 408],
          [1071, 430],
          [1067, 428],
        ],
        // That rose, the soft rose under it on his neck (#e99467 at 1099,422), and up his face's far edge to his temple (#f19968, x 1089-1095 at row 336).
        shade: [
          [1089, 326],
          [1099, 326],
          [1105, 336],
          [1095, 362],
          [1103, 372],
          [1113, 372],
          [1117, 392],
          [1113, 408],
          [1121, 418],
          [1117, 432],
          [1095, 436],
          [1069, 430],
          [1065, 420],
          [1085, 412],
          [1099, 398],
          [1093, 382],
          [1089, 352],
        ],
      },
      sharp: [],
      // His darkest hair, behind his ear down to his neck, painted into his line as dark as its ink (L 40-43 at x 1109-1120, row 382), and the band of curls under his ear it holds (x 1106-1129, rows 362-392): out to the sheet's outer edge (x 1145 at row 362, 1134 at 382, 1124 at 392) less 7 px.
      hairReach: [
        [1131, 350],
        [1139, 356],
        [1138, 362],
        [1133, 372],
        [1127, 382],
        [1117, 392],
        [1107, 398],
        [1103, 392],
        [1105, 372],
        [1114, 364],
        [1124, 352],
      ],
      // The hairline over his brow runs out to a tip thinner than 2 px opens (it doubles back at 997.5,353.5).
      hairOpen: 3,
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
      // His ear's skin runs on into the rose of his cheek (no line, rows 455-478): x 797-819, rows 447-479.
      earClips: { earNear: oval(808, 463, 11, 16) },
      earLit: oval(808, 463, 11, 16),
      chin: {
        kind: 'closed',
        row: 517,
        // His jaw's line, brown where it leaves his fist (#753a20 at 754,508), a deep rose on toward his ear (#d57048 at 764,508; rows 491-499 at x 784): laid in its rose.
        paint: 'rose',
        line: [
          [744, 504],
          [766, 500],
          [786, 489],
          [788, 497],
          [776, 508],
          [760, 518],
          [744, 520],
        ],
        // That rose, the soft rose under it on his neck (#e58d5f at 784,511), and up his face's far edge to his temple (x 776-790, rows 427-500).
        shade: [
          [780, 427],
          [790, 427],
          [794, 451],
          [790, 481],
          [800, 491],
          [798, 507],
          [796, 523],
          [774, 527],
          [754, 525],
          [750, 517],
          [770, 507],
          [774, 497],
          [776, 481],
          [780, 459],
        ],
      },
      sharp: [],
      near: {
        pick: sleeveAt([687, 582]),
        clip: rect(640, 515, 770, 690),
        below: 515,
        hand: [707, 527],
        // His sleeve's inner edge, a mauve stripe (#a17d71 at 720,576) the seed stops at, out to where his tunic's cream begins (x 726-729, rows 565-593).
        plus: [
          [704, 565],
          [726, 565],
          [726, 571],
          [727, 581],
          [729, 593],
          [704, 593],
        ],
      },
      far: {
        pick: sleeveAt([802, 602]),
        clip: rect(740, 515, 860, 690),
        below: 515,
        hand: [732, 647],
      },
      arms: 'onGarment',
      necks: [],
      // The stool he sits on, behind him: its seat from its top's line (row 699) under the mantle's lower edge, which runs over the seat from his back (x 854, row 694) down to his robe's side (x 804, row 724); then its front leg beside his robe's side (x 797-803) and under his hem.
      beside: [
        [904, 699],
        [860, 699],
        [854, 694],
        [850, 697],
        [844, 704],
        [839, 708],
        [834, 711],
        [829, 713],
        [824, 714],
        [819, 715],
        [814, 717],
        [809, 718],
        [804, 724],
        [803, 731],
        [802, 746],
        [800, 756],
        [797, 761],
        [797, 794],
        [793, 799],
        [793, 845],
        [904, 845],
      ],
      sash: { band: [790, 630, 812, 652], knots: [], ends: [] },
      hem: 792,
      split: 690,
    }),
  },
} as const satisfies TraceSheet;
