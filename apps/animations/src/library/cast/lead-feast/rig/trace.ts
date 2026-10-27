// How each view of the series lead's kept turnaround is traced (`bun run
// concept trace src/library/cast/lead-feast/rig/trace.ts` from
// apps/animations): the sheet, its colour classes, and per view its parts by
// their seeds in the sheet's pixels. The sheet inks only his silhouette, his
// face and the sleeve that lies on his side in profile, so a part the sheet
// parts by colour alone is cut by a polygon read off the sheet (a sleeve at
// its shoulder, the sash's band, knot and ends). A head whose neck runs into
// its jaw with no line under it (every view but the back) is traced down
// into the garment's neck, its chin open, the shade under his jaw a tone on
// it, and the garment's top is the neckline the sheet paints round it. Every
// view writes the same tones (one with no pieces where the view shows none),
// so every view's table is read the one way. The tables it writes sit beside
// it, one per view (`<view>-traced.ts`). Pure.

import type { TracePart, TracePt, TraceSheet, TraceSheetView } from '@manna/film/tools';

/** The sheet's colour classes: each its lit side and its shade, sampled from the kept turnaround. */
const CLASSES = {
  cream: ['#fde1bc', '#e3bea0', '#feecca', '#f7d8b2'],
  teal: ['#4e7182', '#58859b', '#61898d', '#4e768b', '#3f5f73'],
  skin: ['#fdaf70', '#e58a62', '#f3996a', '#f8a062'],
  hairLight: ['#894b2d', '#7e442f', '#85492e'],
  hair: ['#6a3e2b', '#673b28', '#75442d', '#6f412c'],
  hairDark: ['#563124', '#4f2b21', '#543022', '#5a3324'],
} as const;

/** The hair's classes, light to dark: his curls, and his sandals' straps. */
const BROWN = ['hairLight', 'hair', 'hairDark'];

/** A box as a polygon. */
export const rect = (x0: number, y0: number, x1: number, y1: number): TracePt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** An oval as a polygon of 16 points, `rx` across and `ry` down from its middle. */
const oval = (cx: number, cy: number, rx: number, ry: number): TracePt[] =>
  Array.from({ length: 16 }, (_, i): TracePt => [
    Math.round((cx + rx * Math.cos((i / 16) * 2 * Math.PI)) * 2) / 2,
    Math.round((cy + ry * Math.sin((i / 16) * 2 * Math.PI)) * 2) / 2,
  ]);

/** `pts` moved by `by`. */
const shifted = (pts: ReadonlyArray<TracePt>, by: TracePt): TracePt[] =>
  pts.map(([x, y]) => [x + by[0], y + by[1]]);

/** Where the sheet lays the sash's rose shade: each piece again, this far to its right and down, under it. */
const SASH_SHADE: TracePt = [4, 2];

/** How far the knot's shade, 2 px wider than it all round, lies to its right and down. */
const KNOT_SHADE: TracePt = [1, 2];

/** A hanging end of the sash: its left and right edges and its row where it leaves the knot, and again where it ends, sheet pixels. */
interface SashEnd {
  readonly top: readonly [left: number, right: number, row: number];
  readonly bottom: readonly [left: number, right: number, row: number];
}

/** A hanging end as the quad it is: it narrows or widens, and leans, from its top to its end. */
const endOf = ({ top, bottom }: SashEnd): TracePt[] => [
  [top[0], top[2]],
  [top[1], top[2]],
  [bottom[1], bottom[2]],
  [bottom[0], bottom[2]],
];

/** The sash as the sheet paints it on a view: its band across the waist, its two ends, and its knot (an oval: its middle, its half-width and half-height) where the view shows one. */
interface Sash {
  readonly band: readonly [number, number, number, number];
  readonly ends: ReadonlyArray<SashEnd>;
  readonly knots: ReadonlyArray<readonly [number, number, number, number]>;
}

/**
 * The sash's tones: its band and ends, each the silhouette cut to its
 * polygon on his garment, as one; then its knot over them; each with its rose
 * shade, the same piece moved `SASH_SHADE` to its right and down, laid under
 * it, as the sheet lights it.
 */
const sashParts = (s: Sash) => {
  const pieces = [rect(...s.band), ...s.ends.map(endOf)];
  const piece = (clip: TracePt[]) =>
    ({ silhouette: true, clip, inside: 'body', grow: 0, as: 'none' }) satisfies TracePart;
  const names = pieces.map((_, i) => `sashPiece${i}`);
  const shades = pieces.map((_, i) => `sashShadePiece${i}`);
  const knot = (doc: string, by: TracePt, grow: number) =>
    ({
      silhouette: true,
      clip: s.knots.flatMap(([x, y, rx, ry]) => shifted(oval(x, y, rx + grow, ry + grow), by)),
      inside: 'body',
      grow: 0,
      as: 'tones',
      min: 20,
      doc,
    }) satisfies TracePart;
  return {
    ...Object.fromEntries(
      pieces.flatMap((pts, i) => [
        [`sashPiece${i}`, piece(pts)],
        [`sashShadePiece${i}`, piece(shifted(pts, SASH_SHADE))],
      ]),
    ),
    sashShade: {
      plus: shades,
      grow: 0,
      as: 'tones',
      min: 20,
      doc: "The sash's rose shade round its edge.",
    },
    sash: {
      plus: names,
      grow: 0,
      as: 'tones',
      min: 20,
      doc: 'The cream sash: its band and its ends.',
    },
    // The knot's shade rims it all round, deepest under it to its right: the bulge the sheet paints on the band.
    knotShade: knot("The knot's rose shade, round it and under it to its right.", KNOT_SHADE, 2),
    knot: knot("The sash's knot, over its band.", [0, 0], 0),
  } satisfies Record<string, TracePart>;
};

/** Where the head is cut from the garment: `open` where the sheet draws no line under the chin (the head runs down into the neck to `row`), `closed` at its chin's `row`. */
interface Chin {
  readonly kind: 'open' | 'closed';
  readonly row: number;
}

/** How far either side of the face's seed the jaw's deep shade is read, sheet pixels. */
const JAW_REACH = 36;

/** How far above the chin's row the garment is read from, how tall the band the shade under the jaw is read in, and how far above that band the jaw's deep shade is read from, by the chin's kind. */
const CHIN = {
  open: {
    garment: 25,
    shade: 45,
    under: 0,
    shadeIn: 'head',
    jaw: 15,
    doc: "His head's paper down into his garment's neck (his chin open): his face, his ears, his neck and his skull under his hair.",
  },
  // His chin closed on the line the sheet draws under it: his neck is his garment's, narrower than his jaw, its shade laid on it under his chin.
  closed: {
    garment: 10,
    shade: 0,
    under: 45,
    shadeIn: 'body',
    jaw: 0,
    doc: "His head's paper to the line under his chin: his face, his ears and his skull under his hair.",
  },
} as const;

/** How an arm is read: as the silhouette cut to its polygon, or (lying on the garment, in profile) as the region the sheet's ink closes round its sleeve. */
type ArmPick =
  | { readonly silhouette: true }
  | { readonly seeds: ReadonlyArray<TracePt>; readonly grow: number };

/** An arm read as the silhouette cut to its polygon. */
const SILHOUETTE: ArmPick = { silhouette: true };

/** An arm read as its sleeve's region, seeded at `p`, grown through its ink to meet its hand at its cuff. */
export const sleeveAt = (p: TracePt): ArmPick => ({ seeds: [p], grow: 6 });

/** An arm: how it is read, its polygon, the row under its armpit, and its hand's seed. */
interface ArmSpec {
  readonly pick: ArmPick;
  readonly clip: TracePt[];
  readonly below: number;
  readonly hand: TracePt;
}

/** What the garment keeps where the arms lie: beside it, it gives up what they cover below the armpit and each hand with its ring of ink (else the ring's inner half stays the garment's, a hook bared when the arm swings); on it (a profile), it keeps all. */
const UNDER_ARMS = {
  beside: ['armNearBelow', 'armFarBelow', 'handNearRing', 'handFarRing'],
  onGarment: [],
} as const;

/** What one standing view is read from: its seeds and the polygons the sheet parts by colour alone. */
interface Standing {
  readonly box: readonly [number, number, number, number];
  readonly out: string;
  readonly about: string;
  readonly face: TracePt;
  /** The face's marks (a view from behind shows none). */
  readonly marked: Pick<TraceSheetView, 'marks'>;
  /** Each ear's seed: both from in front or behind, the one that shows on a turned head (`earNear`). */
  readonly ears: { readonly earNear: TracePt; readonly earFar?: TracePt };
  readonly chin: Chin;
  /** Where his head's outline turns back as sharply as the sheet draws it (his nape under his curls), vouched for (`TracePart.sharp`). */
  readonly sharp: ReadonlyArray<TracePt>;
  readonly near: ArmSpec;
  readonly far: ArmSpec;
  readonly arms: keyof typeof UNDER_ARMS;
  /** His neck's seeds, where it shows as a tone on the garment (from behind). */
  readonly necks: ReadonlyArray<TracePt>;
  /** What stands beside him in his view (a stool), as a polygon, no part of him: none for a view with nothing there. */
  readonly beside: TracePt[];
  readonly sash: Sash;
  readonly hem: number;
  readonly split: number;
}

/** An ear seeded at `seed`: flat skin cut inside his head, within a box round the seed (on a turned head its skin runs on into his neck). */
const ear = (seed: TracePt) =>
  ({
    seeds: [seed],
    clip: rect(seed[0] - 16, seed[1] - 26, seed[0] + 16, seed[1] + 26),
    // Opened 2 px: the thin tip an ear seen past his hair ends in is no part of it.
    open: 2,
    doc: "An ear, flat skin cut inside his head: its ink is his head's, and the hair beside it lies round it.",
  }) satisfies TracePart;

/** A standing view's parts: his head, hair and ears; his garment, its mantle, sash and neck; his arms and hands; his feet and straps. */
export const standing = (v: Standing): TraceSheetView => {
  const [x0, y0, x1, y1] = v.box;
  const wide = (a: number, b: number) => rect(x0 - 10, a, x1 + 10, b);
  const chin = CHIN[v.chin.kind];
  const ears = Object.fromEntries(Object.entries(v.ears).map(([name, seed]) => [name, ear(seed)]));
  const neckBand = wide(v.chin.row - chin.shade, v.chin.row);
  const shadeBand = wide(v.chin.row - chin.shade, v.chin.row + chin.under);
  return {
    box: v.box,
    out: v.out,
    about: v.about,
    classes: CLASSES,
    head: 'head',
    feet: ['footNear', 'footFar'],
    // His outlines and the tones on them fitted as cubics; his feet and their straps, drawn as sandals, are points.
    path: 'cubic',
    ...v.marked,
    parts: {
      face: { seeds: [v.face], clip: wide(y0, v.chin.row), as: 'none' },
      ...ears,
      hairMass: { classes: BROWN, clip: wide(y0, v.chin.row), as: 'none' },
      // An open chin's neck: the skin between his jaw and the garment's neckline (none under a closed chin).
      neckSkin: { classes: ['skin'], clip: neckBand, as: 'none' },
      head: {
        plus: ['face', 'hairMass', 'neckSkin', ...Object.keys(ears)],
        // A hand raised to the chin is its own circle, never the head's skin.
        minus: ['handNearPaper', 'handFarPaper'],
        // Never opened: an ear joins his head by a neck thinner than his ear's line, and opening it parts the ear off.
        open: 0,
        // Closed 5 px: the notch an ear's own line leaves where it meets his outline is filled.
        close: 5,
        // Smoothed 4 px each way: the brush's grain on his line's inner edge is no corner of his jaw.
        smooth: 4,
        sharp: v.sharp,
        grow: 3,
        doc: chin.doc,
      },
      hair: {
        within: 'hairMass',
        grow: 4,
        // Opened 2 px: the band of hair the sheet draws behind an ear is his, the hairline tip it ends in is not.
        open: 2,
        inside: 'head',
        minus: Object.keys(ears),
        doc: 'His hair, the whole mass of curls over his head.',
      },
      curls: {
        within: 'hair',
        minus: ['hairDarkMask'],
        grow: 0,
        as: 'curls',
        doc: 'His curls, each a disc on a lobe of his hair where its dark does not part them.',
      },
      hairDarkMask: { classes: ['hairDark'], inside: 'hair', grow: 0, as: 'none' },
      hairLight: {
        classes: ['hairLight'],
        inside: 'hair',
        grow: 0,
        as: 'tones',
        min: 40,
        doc: 'The light on his curls.',
      },
      hairDark: {
        classes: ['hairDark'],
        inside: 'hair',
        grow: 0,
        as: 'tones',
        min: 40,
        doc: 'The dark under his curls.',
      },
      neckShade: {
        classes: ['skin'],
        colour: { near: '#e58a62', far: ['#fdaf70', '#f8a062'] },
        inside: chin.shadeIn,
        clip: shadeBand,
        grow: 0,
        as: 'tones',
        min: 150,
        smooth: 8,
        doc: 'The shade under his jaw, down his neck (none under a closed chin).',
      },
      jaw: {
        classes: BROWN,
        inside: 'head',
        // Under the chin only, never the curls beside the jaw: its band runs out to the hair at the ear.
        clip: rect(
          v.face[0] - JAW_REACH,
          v.chin.row - chin.shade - chin.jaw,
          v.face[0] + JAW_REACH,
          v.chin.row - chin.shade + 12,
        ),
        grow: 1,
        as: 'tones',
        min: 30,
        doc: 'The deep shade his jaw lays on his neck right under his chin, the edge it closes over (none under a closed chin).',
      },
      handNear: { seeds: [v.near.hand], grow: 1, as: 'circle', doc: 'His near hand at its cuff.' },
      handFar: { seeds: [v.far.hand], grow: 1, as: 'circle', doc: 'His far hand at its cuff.' },
      handNearPaper: { seeds: [v.near.hand], grow: 0, as: 'none' },
      handFarPaper: { seeds: [v.far.hand], grow: 0, as: 'none' },
      handNearRing: { seeds: [v.near.hand], grow: 8, as: 'none' },
      handFarRing: { seeds: [v.far.hand], grow: 8, as: 'none' },
      armNear: {
        ...v.near.pick,
        clip: v.near.clip,
        // Opened 3 px: a sliver its polygon leaves along the garment's side is no part of the sleeve.
        open: 3,
        minus: ['handNearPaper', 'handFarPaper'],
        doc: 'His near arm (screen left) in its sleeve, from his shoulder to his cuff.',
      },
      armFar: {
        ...v.far.pick,
        clip: v.far.clip,
        open: 3,
        minus: ['handNearPaper', 'handFarPaper'],
        doc: 'His far arm (screen right) in its sleeve, from his shoulder to his cuff.',
      },
      // Each worn in 6 px: the garment the arm hangs beside runs on under its sleeve's paper, so the garment's line lies under the sleeve.
      armNearBelow: { within: 'armNear', clip: wide(v.near.below, y1), shrink: 6, as: 'none' },
      armFarBelow: { within: 'armFar', clip: wide(v.far.below, y1), shrink: 6, as: 'none' },
      body: {
        silhouette: true,
        clip: wide(v.chin.row - chin.garment, v.hem),
        // Smoothed past the house's step: its sides run on under the arms' paper (`shrink`), and the step where they begin is no corner of it.
        smooth: 8,
        // An open chin's head runs down into the neck: the garment's top is the neckline the sheet paints round it.
        minus: [
          ...UNDER_ARMS[v.arms],
          'handNearPaper',
          'handFarPaper',
          'face',
          'neckSkin',
          'beside',
        ],
        doc: 'His tunic and the mantle over it as one garment: its neck, its shoulders, its sides under his arms, its hem.',
      },
      beside: { silhouette: true, clip: v.beside, as: 'none' },
      skin: {
        classes: ['skin'],
        inside: 'body',
        minus: ['handNearRing', 'handFarRing'],
        as: 'tones',
        min: 280,
        smooth: 4,
        doc: "His skin the garment's neck shows, below his chin: lit, as his face.",
      },
      neck: {
        seeds: v.necks,
        inside: 'body',
        as: 'tones',
        doc: "His neck under his hair, in the tunic's neck (from behind).",
      },
      mantle: {
        classes: ['teal'],
        inside: 'body',
        grow: 2,
        as: 'tones',
        min: 150,
        doc: 'The teal mantle across him, laid on his tunic.',
      },
      mantleShade: {
        classes: ['teal'],
        colour: { near: '#3f5f73', far: ['#58859b', '#61898d', '#4e7182'] },
        inside: 'body',
        grow: 0,
        as: 'tones',
        min: 120,
        doc: "The mantle's far side, turned toward blue-violet.",
      },
      ...sashParts(v.sash),
      footNear: {
        silhouette: true,
        clip: rect(x0 - 10, v.hem, v.split, y1 + 10),
        minus: ['beside'],
        path: 'points',
        doc: 'His near foot in its sandal.',
      },
      footFar: {
        silhouette: true,
        clip: rect(v.split, v.hem, x1 + 10, y1 + 10),
        minus: ['beside'],
        path: 'points',
        doc: 'His far foot in its sandal.',
      },
      strapNear: {
        classes: BROWN,
        inside: 'footNear',
        grow: 1,
        as: 'tones',
        path: 'points',
        doc: "His near sandal's strap.",
      },
      strapFar: {
        classes: BROWN,
        inside: 'footFar',
        grow: 1,
        as: 'tones',
        path: 'points',
        doc: "His far sandal's strap.",
      },
    },
  };
};

export const TRACE = {
  member: 'lead-feast',
  sheet: '../cast-sheet/kept/turnaround.png',
  kind: 'turnaround',
  views: {
    front: standing({
      box: [18, 194, 265, 857],
      out: 'front-traced.ts',
      about:
        "his front view: curly hair over his ears' tops, his ears, a beardless face; his cream tunic, the teal mantle from his left shoulder (screen right) down to his right hip, the cream sash knotted at his waist with its two ends hanging; his cream right sleeve and his teal left sleeve; his sandals",
      face: [133, 334],
      marked: {
        marks: {
          eyes: [
            [116, 312],
            [164, 312],
          ],
          brows: [
            [114, 286],
            [167, 286],
          ],
          mouth: [141, 350],
        },
      },
      ears: { earNear: [72, 322], earFar: [210, 322] },
      chin: { kind: 'closed', row: 393 },
      sharp: [],
      near: {
        pick: SILHOUETTE,
        clip: [
          [0, 430],
          [69, 430],
          [71, 440],
          [80, 598],
          [84, 610],
          [0, 610],
        ],
        below: 472,
        hand: [48, 622],
      },
      far: {
        pick: SILHOUETTE,
        clip: [
          [290, 430],
          [213, 430],
          [214, 450],
          [218, 598],
          [214, 610],
          [290, 610],
        ],
        below: 472,
        hand: [235, 622],
      },
      arms: 'beside',
      necks: [],
      beside: [],
      sash: {
        band: [83, 539, 198, 562],
        knots: [[142, 552, 16, 13]],
        ends: [
          { top: [128, 141, 560], bottom: [117, 139, 672] },
          { top: [145, 160, 560], bottom: [146, 172, 728] },
        ],
      },
      hem: 808,
      split: 141,
    }),
    threeQuarterLeft: standing({
      box: [292, 194, 511, 857],
      out: 'three-quarter-left-traced.ts',
      about:
        "his three-quarter view turned to screen left: his face to our left of his head's middle, his far ear behind it; the mantle over his left shoulder (screen right) and down across him; his cream right sleeve near us, his teal left sleeve far; his sandals",
      face: [382, 334],
      marked: {
        marks: {
          eyes: [
            [335, 313],
            [375, 313],
          ],
          brows: [
            [333, 286],
            [378, 286],
          ],
          mouth: [358, 351],
        },
      },
      ears: { earNear: [440, 322] },
      chin: { kind: 'closed', row: 390 },
      sharp: [],
      near: {
        pick: SILHOUETTE,
        clip: [
          [280, 430],
          [328, 430],
          [334, 450],
          [342, 598],
          [336, 612],
          [280, 612],
        ],
        below: 472,
        hand: [315, 623],
      },
      far: {
        pick: SILHOUETTE,
        clip: [
          [525, 440],
          [446, 440],
          [442, 460],
          [444, 598],
          [450, 612],
          [525, 612],
        ],
        below: 470,
        hand: [476, 623],
      },
      arms: 'beside',
      necks: [],
      beside: [],
      sash: {
        band: [340, 540, 437, 562],
        knots: [[378, 552, 16, 13]],
        ends: [
          { top: [364, 376, 560], bottom: [350, 370, 672] },
          { top: [379, 392, 560], bottom: [376, 400, 706] },
        ],
      },
      hem: 808,
      split: 400,
    }),
    profileLeft: standing({
      box: [552, 195, 733, 857],
      out: 'profile-left-traced.ts',
      about:
        'his profile facing screen left: one eye, his ear behind his cheek, his curls behind; his teal left arm hanging over his side in front of him, the sash knotted at his front with its end hanging; his sandals',
      face: [618, 335],
      marked: {
        marks: {
          eyes: [[589, 312]],
          brows: [[592, 285]],
          mouth: {
            ends: [
              [576, 352],
              [591, 346],
            ],
            line: 5,
          },
        },
      },
      ears: { earNear: [657, 322] },
      chin: { kind: 'closed', row: 392 },
      // His nape: his last curl turns under, and his neck runs down from it.
      sharp: [[668.5, 397.5]],
      near: {
        pick: sleeveAt([650, 480]),
        clip: [
          [612, 405],
          [700, 405],
          [705, 607],
          [612, 607],
        ],
        below: 405,
        hand: [644, 622],
      },
      far: {
        pick: sleeveAt([650, 480]),
        clip: [
          [612, 405],
          [700, 405],
          [705, 607],
          [612, 607],
        ],
        below: 405,
        hand: [644, 622],
      },
      arms: 'onGarment',
      necks: [],
      beside: [],
      sash: {
        band: [560, 540, 615, 562],
        knots: [[572, 552, 13, 12]],
        ends: [{ top: [560, 580, 560], bottom: [560, 580, 680] }],
      },
      hem: 808,
      split: 640,
    }),
    back: standing({
      box: [761, 194, 1018, 857],
      out: 'back-traced.ts',
      about:
        'his back: his curls over the whole of his head, his ears either side; the mantle over his left shoulder (screen left from behind) and down across his back; his teal left sleeve on screen left, his cream right sleeve on screen right; his heels in their sandals',
      face: [892, 288],
      marked: {},
      ears: { earNear: [819, 322], earFar: [962, 322] },
      chin: { kind: 'closed', row: 380 },
      sharp: [],
      near: {
        pick: SILHOUETTE,
        clip: [
          [750, 430],
          [800, 430],
          [822, 450],
          [826, 598],
          [820, 612],
          [750, 612],
        ],
        below: 472,
        hand: [788, 625],
      },
      far: {
        pick: SILHOUETTE,
        clip: [
          [1030, 430],
          [980, 430],
          [963, 450],
          [961, 598],
          [966, 612],
          [1030, 612],
        ],
        below: 472,
        hand: [988, 625],
      },
      arms: 'beside',
      necks: [[891, 390]],
      beside: [],
      sash: { band: [826, 540, 956, 562], knots: [], ends: [] },
      hem: 808,
      split: 888,
    }),
    profileRight: standing({
      box: [1048, 194, 1237, 858],
      out: 'profile-right-traced.ts',
      about:
        'his profile facing screen right: one eye, his ear behind his cheek, his curls behind; his cream right arm hanging over his side in front of him, the mantle down his back, the sash knotted at his front with its end hanging; his sandals',
      face: [1167, 336],
      marked: {
        marks: {
          eyes: [[1198, 312]],
          brows: [[1196, 285]],
          mouth: {
            ends: [
              [1195, 346],
              [1210, 352],
            ],
            line: 5,
          },
        },
      },
      ears: { earNear: [1123, 322] },
      chin: { kind: 'closed', row: 394 },
      sharp: [],
      near: {
        pick: sleeveAt([1110, 480]),
        clip: [
          [1083, 405],
          [1166, 405],
          [1166, 607],
          [1083, 607],
        ],
        below: 405,
        hand: [1130, 620],
      },
      far: {
        pick: sleeveAt([1110, 480]),
        clip: [
          [1083, 405],
          [1166, 405],
          [1166, 607],
          [1083, 607],
        ],
        below: 405,
        hand: [1130, 620],
      },
      arms: 'onGarment',
      necks: [],
      beside: [],
      sash: {
        band: [1165, 540, 1225, 562],
        knots: [[1207, 550, 13, 12]],
        ends: [{ top: [1193, 1213, 560], bottom: [1193, 1213, 670] }],
      },
      hem: 808,
      split: 1140,
    }),
    threeQuarterRight: standing({
      box: [1268, 194, 1510, 856],
      out: 'three-quarter-right-traced.ts',
      about:
        "his three-quarter view turned to screen right: his face to our right of his head's middle; the mantle over his left shoulder (screen right) and down across him; his cream right sleeve on screen left, his teal left sleeve on screen right; his sandals",
      face: [1402, 333],
      marked: {
        marks: {
          eyes: [
            [1401, 312],
            [1442, 312],
          ],
          brows: [
            [1399, 285],
            [1445, 285],
          ],
          mouth: [1419, 350],
        },
      },
      ears: { earNear: [1338, 322] },
      chin: { kind: 'closed', row: 391 },
      sharp: [],
      near: {
        pick: SILHOUETTE,
        clip: [
          [1258, 430],
          [1318, 430],
          [1336, 450],
          [1340, 598],
          [1336, 612],
          [1258, 612],
        ],
        below: 472,
        hand: [1300, 622],
      },
      far: {
        pick: SILHOUETTE,
        clip: [
          [1520, 430],
          [1470, 430],
          [1455, 450],
          [1453, 598],
          [1458, 612],
          [1520, 612],
        ],
        below: 472,
        hand: [1483, 622],
      },
      arms: 'beside',
      necks: [],
      beside: [],
      sash: {
        band: [1343, 540, 1450, 562],
        knots: [[1403, 552, 16, 13]],
        ends: [
          { top: [1390, 1403, 560], bottom: [1377, 1400, 672] },
          { top: [1407, 1419, 560], bottom: [1406, 1431, 727] },
        ],
      },
      hem: 808,
      split: 1390,
    }),
  },
} as const satisfies TraceSheet;
