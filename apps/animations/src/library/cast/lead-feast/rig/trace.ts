// How each view of the series lead's kept turnaround is traced (`bun run
// concept trace src/library/cast/lead-feast/rig/trace.ts` from
// apps/animations): the sheet, its colour classes, and per view its parts by
// his part labels (`labels.ts`), none by a seed: a point of the sheet places
// only a polygon it cuts (an ear's box and band) and a mark of his face (each
// read as the ink nearest it). The sheet inks only his silhouette, his
// face and the sleeve that lies on his side in profile, so a part the sheet
// parts by colour alone is cut by a polygon read off the sheet (a sleeve at
// its shoulder, the sash's band, knot and ends). A head whose neck runs into
// its jaw with no line under it (every view but the back) is traced down
// into the garment's neck, its chin open, the shade under his jaw a tone on
// it, and the garment's top is the neckline the sheet paints round it. Every
// view writes the same tones (one with no pieces where the view shows none),
// so every view's table is read the one way. The tables it writes sit beside
// it, one per view (`<view>-traced.ts`). Pure.

import type { LabelTable, TracePart, TracePt, TraceSheet, TraceSheetView } from '@manna/film/tools';
import { Option } from 'effect';
import { LABELS } from './labels.ts';

/** The sheet's colour classes: each its lit side and its shade, sampled from the kept turnaround. */
export const CLASSES = {
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
export const oval = (cx: number, cy: number, rx: number, ry: number): TracePt[] =>
  Array.from({ length: 16 }, (_, i): TracePt => [
    Math.round((cx + rx * Math.cos((i / 16) * 2 * Math.PI)) * 2) / 2,
    Math.round((cy + ry * Math.sin((i / 16) * 2 * Math.PI)) * 2) / 2,
  ]);

/** `pts` moved by `by`. */
const shifted = (pts: ReadonlyArray<TracePt>, by: TracePt): TracePt[] =>
  pts.map(([x, y]) => [x + by[0], y + by[1]]);

/** A polygon swollen `by` pixels: each point moved that far from its middle. */
const swollen = (pts: ReadonlyArray<TracePt>, by: number): TracePt[] => {
  const [mx, my] = [
    pts.reduce((s, [x]) => s + x, 0) / Math.max(1, pts.length),
    pts.reduce((s, [, y]) => s + y, 0) / Math.max(1, pts.length),
  ];
  return pts.map(([x, y]) => {
    const l = Math.max(1, Math.hypot(x - mx, y - my));
    return [x + ((x - mx) / l) * by, y + ((y - my) / l) * by];
  });
};

/** How far past an ear's lobe its band's tone runs, sheet pixels: past his head's edge there, which it is laid inside. */
const LOBE_UNDER = 4;

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
  /** Round the line the sheet paints under his chin in brown with no ink (his jaw, rising to his ear on a turned head), the polygon his jaw tone is read in: under an open chin, a band about his face's seed unless given. */
  readonly line?: ReadonlyArray<TracePt>;
  /** Round the rose shade the sheet paints under that line (up to his ear and down the far side of his neck on a turned head), the polygon his jaw's shade is read in: none unless given. */
  readonly shade?: ReadonlyArray<TracePt>;
  /** Where that line meets his ink at his chin's corner, a polygon over both: the line starts under the ink (none unless given). */
  readonly corner?: ReadonlyArray<TracePt>;
  /** Where that line lightens toward his ear, the polygon it is laid lighter in (none unless given). */
  readonly fade?: ReadonlyArray<TracePt>;
  /** How the sheet paints that line: in brown (`brown`, unless given), or in a deep rose (`rose`, his poses: #d47048, L 133 to 140), read nearer it than his rose shade. */
  readonly paint?: keyof typeof JAW_LINE;
}

/**
 * The colour his jaw's line is read nearer than his skin's colours, lit and
 * shaded, by how the sheet paints it: the sheet's brown (the line lightens
 * toward his ear, so it is read by colour, not by his hair's classes alone),
 * or its deep rose, nearer it than his shade's rose.
 */
const JAW_LINE = {
  brown: { near: '#985636', far: ['#fdaf70', '#f8a062', '#e58a62', '#e07a50'] },
  rose: { near: '#d47048', far: ['#fdaf70', '#f8a062', '#e8875a', '#f2a06c', '#e58d5f'] },
} as const;

/** The rose shade under his jaw's line, read nearer than his lit skin. */
const JAW_SHADE = { near: '#e8875a', far: ['#f2a06c', '#fdaf70', '#feb476', '#fcdb9c', '#f9cb8a'] };

/** The soft rose round that shade (L 170 to 182, #f3a374 at 414,352), read nearer than his lit skin. */
const JAW_SOFT = { near: '#f2a06c', far: ['#fdaf70', '#feb476', '#fcdb9c', '#f9cb8a'] };

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

/** How a part is picked: by a seed in the sheet's pixels, or by a label of the view's table (`labels.ts`). */
type Picked = TracePt | { readonly label: string };

/** A part's pick as the tracer takes it: its seed, or its label. */
const pickOf = (
  p: Picked,
): { readonly seeds: ReadonlyArray<TracePt> } | { readonly label: string } => {
  if ('label' in p) return { label: p.label };
  return { seeds: [p] };
};

/** How an arm is read: as the silhouette cut to its polygon, or (lying on the garment, in profile) as the region the sheet's ink closes round its sleeve, by its seed or its label. */
type ArmPick =
  | { readonly silhouette: true }
  | { readonly seeds: ReadonlyArray<TracePt>; readonly grow: number }
  | { readonly label: string; readonly grow: number };

/** An arm read as the silhouette cut to its polygon. */
const SILHOUETTE: ArmPick = { silhouette: true };

/** An arm read as its sleeve's region, seeded at `p` or labelled `p`, grown through its ink to meet its hand at its cuff. */
export const sleeveAt = (p: Picked): ArmPick => ({ ...pickOf(p), grow: 6 });

/** An arm: how it is read, its polygon, the row under its armpit, and how its hand is picked. */
interface ArmSpec {
  readonly pick: ArmPick;
  readonly clip: TracePt[];
  readonly below: number;
  readonly hand: Picked;
  /** Raised clear of his side: the polygon of its sleeve his garment gives up, all but its root at his shoulder (that stays the garment's, so the arm turns inside it). */
  readonly off?: TracePt[];
  /** Where the sheet paints its sleeve's edge in a shade darker than its seed reaches, with no line between it and his garment: the polygon its sleeve runs out to. */
  readonly plus?: TracePt[];
}

/** What the garment keeps where the arms lie: beside it, it gives up what they cover below the armpit and each hand with its ring of ink (else the ring's inner half stays the garment's, a hook bared when the arm swings); on it (a profile), it keeps all. */
const UNDER_ARMS = {
  beside: ['armNearBelow', 'armFarBelow', 'handNearRing', 'handFarRing'],
  onGarment: [],
  // An arm raised clear of his side: the garment gives up its sleeve but for its root (at his shoulder, or a raised far sleeve's elbow end), so his side under it is the garment's own.
  raised: ['armNearOff', 'armFarOff', 'armFarBelow', 'handNearRing', 'handFarRing'],
} as const;

/**
 * The profile right's sleeve, its back edge on the line where the sheet's
 * teal strip behind it meets its cream (x 1087-1088, rows 436-532). The
 * polygon bounds the sleeve's region there, so its growth through the
 * strip's shaded teal stops at that line and the edge stays straight.
 */
const PROFILE_RIGHT_SLEEVE: TracePt[] = [
  [1091, 405],
  [1166, 405],
  [1166, 607],
  [1088, 607],
  [1088, 436],
];

/** The three-quarter right's ear, read off the sheet round its skin: its skin runs on into his cheek (no line at x 1349), and its lobe turns in at its lower left, where the band of hair under it meets his hair (x 1329-1331, rows 330-335). */
const THREE_QUARTER_RIGHT_EAR: TracePt[] = [
  [1330, 303],
  [1340, 302],
  [1347, 305],
  [1349, 312],
  [1349, 334],
  [1347, 341],
  [1338, 339],
  [1333, 334],
  [1329, 328],
  [1327, 318],
  [1327, 308],
];

/** A labelled ear: its label, and the point its box and its band are cut round, sheet pixels (it picks no region: its label does), where the view cuts either round a point. */
interface EarAt {
  readonly label: string;
  readonly at?: TracePt;
}

/** What one standing view is read from: its parts' seeds or its labels, and the polygons the sheet parts by colour alone. */
interface Standing {
  readonly box: readonly [number, number, number, number];
  readonly out: string;
  readonly about: string;
  /** The view's part labels (`labels.ts`): none for a view picked by seeds alone. */
  readonly labels?: LabelTable;
  /** How his face is picked; a labelled face names its chin's line (`chin.line`), since the line round its seed is read from a point. */
  readonly face: Picked;
  /** The face's marks (a view from behind shows none). */
  readonly marked: Pick<TraceSheetView, 'marks'>;
  /** Each ear: both from in front or behind, the one that shows on a turned head (`earNear`). */
  readonly ears: { readonly earNear: TracePt | EarAt; readonly earFar?: TracePt | EarAt };
  /**
   * An ear the sheet draws with no line between it and his cheek (its skin
   * runs on into his face, a turned head's), as the polygon round it read
   * off the sheet (the oval it is, or its skin's own edge where its lobe
   * turns in). Its skin is cut there, never a box of his face.
   */
  readonly earClips?: {
    readonly earNear?: ReadonlyArray<TracePt>;
    readonly earFar?: ReadonlyArray<TracePt>;
  };
  /**
   * Where the sheet paints the dark brown band beside an ear as its contour
   * (a front: between his ear and his cheek, and round its outer edge), it is
   * laid on his head as a tone (`earBand`), not as his hair (`tone`). Where
   * the band under a turned head's ear is parted from his hair by the sheet's
   * line, it is laid so too, under the ear alone (`under`): his hair is one
   * piece, so a parted band is lost from it. Elsewhere the band runs on into
   * his hair and is his hair (`hair`).
   */
  readonly earBand?: keyof typeof EAR_BAND_CLIP;
  /**
   * An ear whose lobe the sheet draws inside its line (the front's far ear:
   * its lower third dark brown and ink), as the polygon round it, read off
   * the sheet's outer edge less the house's line (7 px): the ear is read
   * within it, and his head and the band's tone run out to it, so the lobe is
   * round, in the band's brown, and the line round it keeps its width.
   */
  readonly earLobes?: {
    readonly earNear?: ReadonlyArray<TracePt>;
    readonly earFar?: ReadonlyArray<TracePt>;
  };
  /** Where an ear's outline turns as sharply as the sheet draws it (the tip of a crescent ear seen from behind), vouched for (`TracePart.sharp`). */
  readonly earSharp?: ReadonlyArray<TracePt>;
  /** Where an ear is turned to the light, its skin lit as his face's but for its hollow (the three-quarter right's): read there as a tone (`earLit`) on the ear's deeper paper. None unless given. */
  readonly earLit?: ReadonlyArray<TracePt>;
  readonly chin: Chin;
  /** Where his head's outline turns back as sharply as the sheet draws it (his nape under his curls), vouched for (`TracePart.sharp`). */
  readonly sharp: ReadonlyArray<TracePt>;
  /** The lit rim a view paints down his face's edge, as more of his skin's samples (none unless given): paler than his skin, nearer his cream than it. */
  readonly skinLit?: ReadonlyArray<string>;
  /** How far his hair is opened where a view draws the band behind his ear thinner than 2 px opens clean (2 unless given). */
  readonly hairOpen?: number;
  /**
   * Where the sheet paints his hair into his line as dark as its ink (L 40
   * to 43, behind an ear down to his neck), so a reading of the line takes
   * it, and his head and hair stop short of his silhouette: the polygon round
   * it, read off the sheet's outer edge less the house's line (7 px). His
   * head, his hair and its dark run out to it. None unless given.
   */
  readonly hairReach?: ReadonlyArray<TracePt>;
  readonly near: ArmSpec;
  readonly far: ArmSpec;
  readonly arms: keyof typeof UNDER_ARMS;
  /** His neck's seeds, or its label, where it shows as a tone on the garment (from behind). */
  readonly necks: ReadonlyArray<TracePt> | { readonly label: string };
  /** What stands beside him in his view (a stool), as a polygon, no part of him: none for a view with nothing there. */
  readonly beside: TracePt[];
  readonly sash: Sash;
  readonly hem: number;
  readonly split: number;
}

/** How far above and below an ear's seed its box runs, sheet pixels. */
const EAR_REACH = 26;

/** The box round an ear's seed its skin is read within, from `top` above the seed. */
const earBox = (seed: TracePt, top = EAR_REACH) =>
  rect(seed[0] - 16, seed[1] - top, seed[0] + 16, seed[1] + EAR_REACH);

/** How far above an ear's seed his hair gives its brown up to the band's tone, sheet pixels: the ear's top, where the sheet's hair ends over it. */
const BAND_TOP = 18;

/** How far round an ear's seed the band under a turned head's ear is read, sheet pixels: from its lobe's lower half (the ear's skin is not brown) to where it tapers out down his neck, and from the band's far end to its near (x 1329-1362, rows 335-372 on the three-quarter right; x 232-262, rows 378-393 on poses-1). */
const UNDER_EAR = { from: 10, to: 52, left: 32, right: 24 } as const;

/** Where an ear's band is read as its tone, by how the view lays it: in the ear's box from `top` above its seed (`tone`), under the ear alone (`under`), or nowhere (`hair`: it runs on into his hair). */
const EAR_BAND_CLIP = {
  tone: earBox,
  under: (seed: TracePt, _top: number): TracePt[] =>
    rect(
      seed[0] - UNDER_EAR.left,
      seed[1] + UNDER_EAR.from,
      seed[0] + UNDER_EAR.right,
      seed[1] + UNDER_EAR.to,
    ),
  hair: (_seed: TracePt, _top: number): TracePt[] => [],
} as const;

/** An ear picked by `pick` (its seed or its label): flat skin cut inside his head, within `clip` (a box round its point, the oval the sheet draws it where its skin runs on into his cheek, or the polygon round its lobe). */
const ear = (
  pick: ReturnType<typeof pickOf>,
  clip: ReadonlyArray<TracePt>,
  sharp: ReadonlyArray<TracePt>,
  band: string,
) =>
  ({
    ...pick,
    clip,
    sharp,
    // Less its band where the view lays one: the band's specks of ink are the band's, never grown over by the ear.
    minus: [band],
    // Grown into his ink alone: the dark brown band beside it is his hair's (or its contour tone), never his ear.
    into: 'ink',
    // Opened 2 px: the thin tip an ear seen past his hair ends in is no part of it.
    open: 2,
    doc: "An ear, flat skin cut inside his head: its ink is his head's, and the hair beside it lies round it.",
  }) satisfies TracePart;

/** A polygon `cut` round an ear's point: a bare point (its seed too) or a labelled ear's; none round a labelled ear that gives none. */
const cutRound = (e: TracePt | EarAt, cut: (at: TracePt) => TracePt[]): TracePt[] => {
  if (!('label' in e)) return cut(e);
  return Option.match(Option.fromUndefinedOr(e.at), { onNone: () => [], onSome: cut });
};

/** An ear's pick: its label, else its point as its seed. */
const earPick = (e: TracePt | EarAt) => {
  if ('label' in e) return pickOf({ label: e.label });
  return pickOf(e);
};

/** The band round a seeded face's point his jaw's deep shade is read in, from `jaw` above `row` to 12 below it: none round a labelled face (it names its chin's line). */
const jawAround = (face: Picked, row: number, jaw: number): TracePt[] => {
  if ('label' in face) return [];
  return rect(face[0] - JAW_REACH, row - jaw, face[0] + JAW_REACH, row + 12);
};

/** His neck's pick: its label, or its seeds (none: no neck read). */
const neckPick = (necks: Standing['necks']) => {
  if ('label' in necks) return { label: necks.label };
  return { seeds: necks };
};

/** A standing view's parts: his head, hair and ears; his garment, its mantle, sash and neck; his arms and hands; his feet and straps. */
export const standing = (v: Standing): TraceSheetView => {
  const [x0, y0, x1, y1] = v.box;
  const wide = (a: number, b: number) => rect(x0 - 10, a, x1 + 10, b);
  const chin = CHIN[v.chin.kind];
  const clips: Readonly<Record<string, ReadonlyArray<TracePt>>> = v.earClips ?? {};
  const lobes: Readonly<Record<string, ReadonlyArray<TracePt>>> = v.earLobes ?? {};
  const ears = Object.fromEntries(
    Object.entries(v.ears).map(([name, e]) => [
      name,
      ear(
        earPick(e),
        lobes[name] ?? clips[name] ?? cutRound(e, (at) => earBox(at)),
        v.earSharp ?? [],
        `${name}Band`,
      ),
    ]),
  );
  // Each ear's lobe, where the view reads one: his figure within its polygon, his head's (`<ear>Lobe`); and the band's tone over it, swollen past it so it reaches his head's edge there with no skin between them (`<ear>LobeUnder`, laid on his head's paper, it shows only inside it). None elsewhere.
  const lobeOf = (pts: ReadonlyArray<TracePt>): TracePart => ({
    silhouette: true,
    clip: pts,
    reach: 'figure',
    as: 'none',
  });
  const lobeParts = Object.fromEntries(
    Object.keys(v.ears).flatMap((name) => [
      [`${name}Lobe`, lobeOf(lobes[name] ?? [])],
      [`${name}LobeUnder`, lobeOf(swollen(lobes[name] ?? [], LOBE_UNDER))],
    ]),
  );
  const lobeNames = Object.keys(v.ears).map((name) => `${name}Lobe`);
  const lobesUnder = Object.keys(v.ears).map((name) => `${name}LobeUnder`);
  // Each ear's band, its brown round the ear in the ear's box (grown 2 px over the specks of ink in it), none unless the view lays it as a tone: what his hair gives up below the ear's top (`<ear>Band`), and the tone, which runs on up under his hair from the box's top (`<ear>BandUnder`), so no skin shows between them.
  const bandOf = (e: TracePt | EarAt, top: number): TracePart => ({
    classes: BROWN,
    clip: cutRound(e, (at) => EAR_BAND_CLIP[v.earBand ?? 'hair'](at, top)),
    grow: 2,
    as: 'none',
  });
  const bands = Object.fromEntries(
    Object.entries(v.ears).flatMap(([name, e]) => [
      [`${name}Band`, bandOf(e, BAND_TOP)],
      [`${name}BandUnder`, bandOf(e, EAR_REACH)],
    ]),
  );
  const bandsCut = Object.keys(v.ears).map((name) => `${name}Band`);
  const bandsUnder = Object.keys(v.ears).map((name) => `${name}BandUnder`);
  const neckBand = wide(v.chin.row - chin.shade, v.chin.row);
  const shadeBand = wide(v.chin.row - chin.shade, v.chin.row + chin.under);
  return {
    box: v.box,
    out: v.out,
    about: v.about,
    classes: { ...CLASSES, skin: [...CLASSES.skin, ...(v.skinLit ?? [])] },
    head: 'head',
    feet: ['footNear', 'footFar'],
    // His outlines and the tones on them fitted as cubics; his feet and their straps, drawn as sandals, are points.
    path: 'cubic',
    // His line is read brown too: the sheet paints the inner part of the line round his far ear in his band's brown, inside 1 px of ink.
    line: 'brown',
    labels: v.labels ?? {},
    ...v.marked,
    parts: {
      face: { ...pickOf(v.face), clip: wide(y0, v.chin.row), as: 'none' },
      // His face above where his garment is read from: the garment rises behind his head's paper there, so no gap shows his head's line under it.
      faceAbove: { within: 'face', clip: wide(y0, v.chin.row - chin.garment), grow: 0, as: 'none' },
      ...ears,
      ...lobeParts,
      // What stands beside him (a wooden plate at his lips, and the hands that hold it there) is none of his hair, nor his neck; nor is a hand with its ring of ink (the dark where his fist meets his chin, poses-3).
      hairMass: {
        classes: BROWN,
        clip: wide(y0, v.chin.row),
        minus: ['beside', 'handNearRing', 'handFarRing'],
        as: 'none',
      },
      // An open chin's neck: the skin between his jaw and the garment's neckline (none under a closed chin).
      neckSkin: { classes: ['skin'], clip: neckBand, minus: ['beside'], as: 'none' },
      // Where the view reads his hair painted into his line as dark as its ink: his figure within its polygon, past the line (none unless given).
      hairReach: { silhouette: true, clip: v.hairReach ?? [], reach: 'figure', as: 'none' },
      head: {
        plus: [
          'face',
          'hairMass',
          'neckSkin',
          'jawCorner',
          'hairReach',
          ...Object.keys(ears),
          ...lobeNames,
        ],
        // Out to an ear's lobe where the view reads one, past the sheet's line there.
        reach: 'figure',
        // A hand raised to the chin is its own circle, never the head's skin.
        minus: ['handNearPaper', 'handFarPaper'],
        // Never opened: an ear joins his head by a neck thinner than his ear's line, and opening it parts the ear off.
        open: 0,
        // Closed 2 px: a slip of his line's inner edge is filled, never the notch his line dips into between his hair and his ear's top (filled, it shows as skin inside his line).
        close: 2,
        // Smoothed 4 px each way: the brush's grain on his line's inner edge is no corner of his jaw.
        smooth: 4,
        sharp: v.sharp,
        grow: 3,
        doc: chin.doc,
      },
      hair: {
        within: 'hairMass',
        // Out past his line where the view reads his hair painted into it (`hairReach`).
        plus: ['hairReach'],
        reach: 'figure',
        grow: 4,
        // Opened 2 px (or as the view says): the band of hair the sheet draws behind an ear is his, the hairline tip it ends in is not.
        open: v.hairOpen ?? 2,
        inside: 'head',
        // Less his jaw's line: on a turned head it runs on into his hair at his ear.
        minus: [...Object.keys(ears), ...bandsCut, 'jaw'],
        doc: 'His hair, the whole mass of curls over his head.',
      },
      ...bands,
      earsAll: { plus: Object.keys(ears), grow: 0, as: 'none' },
      earLight: {
        classes: ['skin'],
        // Only the pale rim (L 205 and up, #f9d695 at 50,115), not the ear's lit middle beside it (#f8bb76, L 197): that is the ear's paper.
        colour: { near: '#f9d08f', far: ['#fbbb7a', '#f5a068', '#f3975f', '#ec9060'] },
        inside: 'earsAll',
        grow: 0,
        as: 'tones',
        min: 15,
        doc: 'The light on his ears, their lit rim.',
      },
      earLit: {
        classes: ['skin'],
        // Its lit skin and its rim (L 195 and up, #fcbc84 at 1338,334), not its hollow (#fbab75, L 189): the palest of the rim is laid over it (`earLight`).
        colour: { near: '#fcbf85', far: ['#f9a571', '#f59d66'] },
        inside: 'earsAll',
        clip: v.earLit ?? [],
        grow: 0,
        as: 'tones',
        min: 15,
        doc: 'An ear turned to the light: its skin lit as his face (none unless the view reads it).',
      },
      earShade: {
        classes: ['skin'],
        // His ear turned from the light, a step deeper than its paper (#f09261 L 169 at 194,125; #e79162 L 165 at 432,319), not its deep hollow.
        colour: { near: '#e8905f', far: ['#f59d66', '#f7a469', '#e27e55', '#fac17f', '#fdd695'] },
        inside: 'earsAll',
        grow: 0,
        as: 'tones',
        min: 15,
        doc: 'An ear where it turns from the light: its skin a step deeper, toward rose.',
      },
      earHollow: {
        classes: ['skin'],
        // Only its deep rose (L 148 to 158, #e07a55 at 186,125), not the mid tone round it (#f09261, L 169): that is the ear's paper.
        colour: { near: '#e27e55', far: ['#ee9262', '#f5a068', '#f7a265', '#fac17f', '#fdd695'] },
        inside: 'earsAll',
        grow: 0,
        as: 'tones',
        min: 15,
        doc: "The hollow of an ear in shade, its skin turned toward rose (a lit ear's hollow is its own paper).",
      },
      earBand: {
        plus: [...bandsUnder, ...lobesUnder],
        reach: 'figure',
        as: 'tones',
        min: 20,
        doc: "The dark brown band the sheet paints round an ear as its contour (a front's), laid on his head: none where the band runs on into his hair.",
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
        // And his hair painted into his line, as dark as it is (`hairReach`).
        plus: ['hairReach'],
        reach: 'figure',
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
      jawLine: {
        classes: [...BROWN, 'skin'],
        colour: JAW_LINE[v.chin.paint ?? 'brown'],
        inside: 'head',
        // Under the chin only, never the curls beside the jaw: its band runs out to the hair at the ear; or the line the sheet paints, as the view reads it.
        clip: v.chin.line ?? jawAround(v.face, v.chin.row - chin.shade, chin.jaw),
        grow: 1,
        as: 'none',
      },
      // Where his jaw's line meets his ink at his chin's corner: his figure there, the ink too, his head's paper and his jaw's line, so the line starts under the ink and the garment's edge behind his chin shows no light between them.
      jawCorner: { silhouette: true, clip: v.chin.corner ?? [], reach: 'figure', as: 'none' },
      jaw: {
        plus: ['jawLine', 'jawCorner'],
        // Written along its edge pixels' outer sides: a thin line, it keeps the width the sheet paints it.
        edge: 'outer',
        reach: 'figure',
        grow: 0,
        // Never opened, smoothed 1 px: the line tapers to a point where it rises to his ear, and a wider smoothing thins its tail.
        open: 0,
        smooth: 1,
        as: 'tones',
        min: 30,
        doc: "The line his jaw lays on his neck under his chin, in the sheet's brown: from side to side, or rising to his ear (none under a closed chin).",
      },
      jawFade: {
        within: 'jaw',
        edge: 'outer',
        clip: v.chin.fade ?? [],
        reach: 'figure',
        grow: 0,
        open: 0,
        smooth: 1,
        as: 'tones',
        min: 10,
        doc: "His jaw's line where it lightens toward his ear, laid over it (none unless the view reads it).",
      },
      jawShade: {
        classes: ['skin'],
        colour: JAW_SHADE,
        clip: v.chin.shade ?? [],
        // Plus his jaw's line: it runs on under the line, so no lit skin shows between them.
        plus: ['jaw'],
        reach: 'figure',
        grow: 0,
        smooth: 4,
        as: 'tones',
        min: 30,
        doc: "The rose shade under his jaw's line, laid on his head and his neck: up to his ear and down the far side of his neck on a turned head (none unless the view reads it).",
      },
      jawSoft: {
        classes: ['skin'],
        colour: JAW_SOFT,
        clip: v.chin.shade ?? [],
        // Plus the deeper shade: it runs on under it, so no lit skin shows between them.
        plus: ['jawShade'],
        reach: 'figure',
        grow: 0,
        smooth: 4,
        as: 'tones',
        min: 30,
        doc: 'The soft rose round the shade under his jaw, laid under it: his skin turning from the light below his ear and down his neck (none unless the view reads it).',
      },
      handNear: {
        ...pickOf(v.near.hand),
        grow: 1,
        as: 'circle',
        doc: 'His near hand at its cuff.',
      },
      handFar: { ...pickOf(v.far.hand), grow: 1, as: 'circle', doc: 'His far hand at its cuff.' },
      handNearPaper: { ...pickOf(v.near.hand), grow: 0, as: 'none' },
      handFarPaper: { ...pickOf(v.far.hand), grow: 0, as: 'none' },
      handNearRing: { ...pickOf(v.near.hand), grow: 8, as: 'none' },
      handFarRing: { ...pickOf(v.far.hand), grow: 8, as: 'none' },
      // Each sleeve out to its shaded edge where the view gives its polygon (none unless it does).
      armNearPlus: { silhouette: true, clip: v.near.plus ?? [], as: 'none' },
      armFarPlus: { silhouette: true, clip: v.far.plus ?? [], as: 'none' },
      armNear: {
        ...v.near.pick,
        clip: v.near.clip,
        plus: ['armNearPlus'],
        // Opened 3 px: a sliver its polygon leaves along the garment's side is no part of the sleeve.
        open: 3,
        minus: ['handNearPaper', 'handFarPaper'],
        doc: 'His near arm (screen left) in its sleeve, from his shoulder to his cuff.',
      },
      armFar: {
        ...v.far.pick,
        clip: v.far.clip,
        plus: ['armFarPlus'],
        open: 3,
        minus: ['handNearPaper', 'handFarPaper'],
        doc: 'His far arm (screen right) in its sleeve, from his shoulder to his cuff.',
      },
      // Each worn in 6 px: the garment the arm hangs beside runs on under its sleeve's paper, so the garment's line lies under the sleeve.
      armNearBelow: { within: 'armNear', clip: wide(v.near.below, y1), shrink: 6, as: 'none' },
      // A raised sleeve, all but its root (none unless the view gives its polygon), each.
      armNearOff: { within: 'armNear', clip: v.near.off ?? [], as: 'none' },
      armFarOff: { within: 'armFar', clip: v.far.off ?? [], as: 'none' },
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
          'faceAbove',
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
        ...neckPick(v.necks),
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
      labels: LABELS.front,
      about:
        "his front view: curly hair over his ears' tops, his ears, a beardless face; his cream tunic, the teal mantle from his left shoulder (screen right) down to his right hip, the cream sash knotted at his waist with its two ends hanging; his cream right sleeve and his teal left sleeve; his sandals",
      face: { label: 'face' },
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
      // Each ear's box and its band's tone are cut round these points.
      ears: {
        earNear: { label: 'earNear', at: [72, 322] },
        earFar: { label: 'earFar', at: [210, 322] },
      },
      earBand: 'tone',
      // His far ear's lobe, which the sheet draws dark inside its line (rows 336-346): the sheet's outer edge (221 at rows 312-322, 216 at 334, 198 at 347) less the line's 7 px.
      earLobes: {
        earFar: [
          [198, 298],
          [212, 298],
          [213, 306],
          [214, 310],
          [214, 324],
          [212, 328],
          [210, 331],
          [208, 334],
          [206, 336],
          [204, 338],
          [202, 340],
          [199, 342],
          [196, 344],
          [193, 346],
          [190, 347],
          [198, 332],
        ],
      },
      // The lit rim down his cheeks and jaw (#fcdb9c at 85,314; #f9cb8a at 69,330) is his skin: his face runs to his line.
      skinLit: ['#fcdb9c', '#f9cb8a', '#fbd59c'],
      chin: {
        kind: 'closed',
        row: 393,
        line: rect(112, 376, 172, 397),
        // The rose under his chin, from under its line (#e88d63 at 140,392).
        shade: rect(100, 380, 186, 414),
      },
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
        hand: { label: 'handNear' },
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
        hand: { label: 'handFar' },
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
      labels: LABELS.threeQuarterLeft,
      about:
        "his three-quarter view turned to screen left: his face to our left of his head's middle, his far ear behind it; the mantle over his left shoulder (screen right) and down across him; his cream right sleeve near us, his teal left sleeve far; his sandals",
      face: { label: 'face' },
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
      // His ear's skin runs on into his face: its region is his face's, cut to the oval the sheet draws it.
      ears: { earNear: { label: 'face' } },
      earClips: { earNear: oval(440.5, 323, 12.5, 19.5) },
      skinLit: ['#fcdb9c', '#f9cb8a', '#fbd59c'],
      chin: {
        kind: 'closed',
        row: 391,
        line: [
          [370, 384],
          [416, 362],
          [422, 364],
          [422, 378],
          [370, 402],
        ],
        // Its corner, where the sheet's ink runs into its brown (#492713 at 378,386).
        corner: [
          [369, 385],
          [379, 383],
          [380, 392],
          [375, 392],
          [375, 386],
          [369, 386],
        ],
        // Lighter past x 404, toward his ear (mean L 110 there against L 93 under his chin).
        fade: rect(404, 350, 430, 395),
        // The rose under his jaw's line (#e07a50 at 392,390), up to his ear (#dc7651 at 416,370) and down the far side of his neck.
        shade: [
          [378, 390],
          [392, 384],
          [410, 372],
          [416, 362],
          [428, 350],
          [440, 354],
          [440, 372],
          [430, 409],
          [412, 416],
          [392, 406],
          [378, 397],
        ],
      },
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
        hand: { label: 'handNear' },
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
        hand: { label: 'handFar' },
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
      labels: LABELS.profileLeft,
      about:
        'his profile facing screen left: one eye, his ear behind his cheek, his curls behind; his teal left arm hanging over his side in front of him, the sash knotted at his front with its end hanging; his sandals',
      face: { label: 'face' },
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
      // His ear's skin runs on into his face: its region is his face's, cut to the oval the sheet draws it.
      ears: { earNear: { label: 'face' } },
      // His ear's skin runs on into his cheek at its front and lobe (no line, rows 321-336): x 644-669, rows 305-336.
      earClips: { earNear: oval(656.5, 320.5, 13, 16) },
      earLit: oval(656.5, 320.5, 13, 16),
      chin: {
        kind: 'closed',
        row: 392,
        // His jaw's short line, from his chin's ink (x 623, rows 376-382) up toward his ear, tapering out by x 639.
        line: [
          [623, 374],
          [640, 365],
          [642, 368],
          [627, 386],
          [623, 386],
        ],
        // Its corner, where the sheet's ink runs into its brown (x 622-623, rows 376-382).
        corner: [
          [615, 377],
          [621, 375],
          [627, 375],
          [627, 384],
          [621, 384],
          [621, 378],
          [615, 378],
        ],
        // All of it light (mean L 117-131, #b0603e at 630,373).
        fade: rect(615, 360, 645, 390),
        // The rose under it (#e7895b at 640,367) and up to under his ear (#ed8c5a at 652,347), soft round it (#f39c69 at 644,360).
        shade: [
          [648, 338],
          [660, 338],
          [660, 355],
          [647, 367],
          [640, 375],
          [636, 385],
          [624, 387],
          [624, 381],
          [638, 368],
          [644, 355],
        ],
      },
      // His nape: his last curl turns under, and his neck runs down from it.
      sharp: [[668.5, 397.5]],
      near: {
        pick: sleeveAt({ label: 'sleeve' }),
        clip: [
          [612, 405],
          [700, 405],
          [705, 607],
          [612, 607],
        ],
        below: 405,
        hand: { label: 'hand' },
      },
      far: {
        pick: sleeveAt({ label: 'sleeve' }),
        clip: [
          [612, 405],
          [700, 405],
          [705, 607],
          [612, 607],
        ],
        below: 405,
        hand: { label: 'hand' },
      },
      arms: 'onGarment',
      necks: [],
      beside: [],
      sash: {
        band: [560, 540, 615, 562],
        knots: [[572, 552, 13, 12]],
        ends: [{ top: [565, 586, 560], bottom: [568, 588, 722] }],
      },
      hem: 808,
      split: 640,
    }),
    back: standing({
      box: [761, 194, 1018, 857],
      out: 'back-traced.ts',
      labels: LABELS.back,
      about:
        'his back: his curls over the whole of his head, his ears either side; the mantle over his left shoulder (screen left from behind) and down across his back; his teal left sleeve on screen left, his cream right sleeve on screen right; his heels in their sandals',
      face: { label: 'face' },
      marked: {},
      ears: {
        earNear: { label: 'earNear', at: [819, 322] },
        earFar: { label: 'earFar', at: [962, 322] },
      },
      earSharp: [[964.5, 307.5]],
      chin: {
        kind: 'closed',
        row: 380,
        // No jaw seen from behind.
        line: [],
        // The rose his hair lays on his neck under it (#e58860 at 891,379), soft below (#ef9e6a at 891,389), his skin from row 389 down.
        shade: rect(856, 366, 926, 400),
      },
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
        hand: { label: 'handNear' },
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
        hand: { label: 'handFar' },
      },
      arms: 'beside',
      necks: { label: 'neck' },
      beside: [],
      sash: { band: [826, 540, 956, 562], knots: [], ends: [] },
      hem: 808,
      split: 888,
    }),
    profileRight: standing({
      box: [1048, 194, 1237, 858],
      out: 'profile-right-traced.ts',
      labels: LABELS.profileRight,
      about:
        'his profile facing screen right: one eye, his ear behind his cheek, his curls behind; his cream right arm hanging over his side in front of him, the mantle down his back, the sash knotted at his front with its end hanging; his sandals',
      face: { label: 'face' },
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
      // His ear's skin runs on into his face: its region is his face's, cut to the oval the sheet draws it.
      ears: { earNear: { label: 'face' } },
      // His ear's skin runs on into his cheek at its front (no line, rows 312-330): x 1113-1138, rows 304-337.
      earClips: { earNear: oval(1124.5, 320.5, 12, 17) },
      earLit: oval(1124.5, 320.5, 12, 17),
      chin: {
        kind: 'closed',
        row: 394,
        // No brown line: the sheet lays his jaw as its rose alone (#dd7a4e at 1144,369).
        line: [],
        // The rose along his jaw from his chin's ink (#e1845a at 1156,379) up to under his ear, soft round it (#f19a69 at 1138,366), down his neck under his chin.
        shade: [
          [1116, 362],
          [1124, 352],
          [1132, 338],
          [1140, 344],
          [1148, 358],
          [1158, 370],
          [1160, 376],
          [1160, 401],
          [1152, 397],
          [1144, 389],
          [1136, 380],
          [1126, 374],
          [1118, 372],
        ],
      },
      sharp: [],
      near: {
        pick: sleeveAt({ label: 'sleeve' }),
        clip: PROFILE_RIGHT_SLEEVE,
        below: 405,
        hand: { label: 'hand' },
      },
      far: {
        pick: sleeveAt({ label: 'sleeve' }),
        clip: PROFILE_RIGHT_SLEEVE,
        below: 405,
        hand: { label: 'hand' },
      },
      arms: 'onGarment',
      necks: [],
      beside: [],
      sash: {
        band: [1165, 540, 1225, 562],
        knots: [[1207, 550, 13, 12]],
        ends: [{ top: [1193, 1212, 560], bottom: [1192, 1212, 716] }],
      },
      hem: 808,
      split: 1140,
    }),
    threeQuarterRight: standing({
      box: [1268, 194, 1510, 856],
      out: 'three-quarter-right-traced.ts',
      labels: LABELS.threeQuarterRight,
      about:
        "his three-quarter view turned to screen right: his face to our right of his head's middle; the mantle over his left shoulder (screen right) and down across him; his cream right sleeve on screen left, his teal left sleeve on screen right; his sandals",
      face: { label: 'face' },
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
      // His ear's skin runs on into his face: its region is his face's, cut to its skin's edge; the band under it is cut round this point.
      ears: { earNear: { label: 'face', at: [1338, 322] } },
      earClips: { earNear: THREE_QUARTER_RIGHT_EAR },
      // The band under his ear (x 1329-1362, rows 335-372), parted from his hair by the sheet's line (x 1318-1328, rows 331-339).
      earBand: 'under',
      earLit: THREE_QUARTER_RIGHT_EAR,
      skinLit: ['#fcdb9c', '#f9cb8a', '#fbd59c'],
      chin: {
        kind: 'closed',
        row: 391,
        // His jaw's line, from the band under his ear (x 1364) down to his chin's ink (x 1412, rows 384-390).
        line: [
          [1412, 384],
          [1366, 362],
          [1364, 364],
          [1364, 378],
          [1412, 402],
        ],
        // Its corner, where the sheet's ink runs into its brown (x 1412-1413, rows 384-390).
        corner: [
          [1422, 385],
          [1412, 383],
          [1411, 393],
          [1419, 393],
          [1419, 386],
          [1422, 386],
        ],
        // Lighter before x 1376, toward his ear (mean L 116-129 there against L 94-99 under his chin).
        fade: rect(1350, 350, 1376, 395),
        // The rose under his jaw's line (#e4855b at 1386,389), from under his ear to his chin (#e3906a at 1408,400).
        shade: [
          [1362, 362],
          [1372, 368],
          [1390, 378],
          [1414, 388],
          [1414, 408],
          [1402, 406],
          [1390, 400],
          [1376, 390],
          [1364, 380],
          [1360, 370],
        ],
      },
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
        hand: { label: 'handNear' },
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
        hand: { label: 'handFar' },
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
