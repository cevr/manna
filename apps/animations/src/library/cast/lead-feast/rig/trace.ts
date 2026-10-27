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
}

/** The sheet's brown his jaw's line is read nearer than his skin's colours, lit and shaded: the line lightens toward his ear, so it is read by colour, not by his hair's classes alone. */
const JAW_LINE = { near: '#985636', far: ['#fdaf70', '#f8a062', '#e58a62', '#e07a50'] };

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
  /** Raised clear of his side: the polygon of its sleeve his garment gives up, all but its root at his shoulder (that stays the garment's, so the arm turns inside it). */
  readonly off?: TracePt[];
}

/** What the garment keeps where the arms lie: beside it, it gives up what they cover below the armpit and each hand with its ring of ink (else the ring's inner half stays the garment's, a hook bared when the arm swings); on it (a profile), it keeps all. */
const UNDER_ARMS = {
  beside: ['armNearBelow', 'armFarBelow', 'handNearRing', 'handFarRing'],
  onGarment: [],
  // An arm raised clear of his side: the garment gives up its sleeve but for its root (at his shoulder, or a raised far sleeve's elbow end), so his side under it is the garment's own.
  raised: ['armNearOff', 'armFarOff', 'armFarBelow', 'handNearRing', 'handFarRing'],
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
  /**
   * An ear the sheet draws with no line between it and his cheek (its skin
   * runs on into his face, a turned head's), as the oval it is, read off the
   * sheet: its middle, its half-width and its half-height. Its skin is cut
   * there, never a box of his face.
   */
  readonly earOvals?: {
    readonly earNear?: readonly [number, number, number, number];
    readonly earFar?: readonly [number, number, number, number];
  };
  /**
   * Where the sheet paints the dark brown band beside an ear as its contour
   * (a front: between his ear and his cheek, and round its outer edge), it is
   * laid on his head as a tone (`earBand`), not as his hair; elsewhere the
   * band runs on into his hair and is his hair.
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
  readonly chin: Chin;
  /** Where his head's outline turns back as sharply as the sheet draws it (his nape under his curls), vouched for (`TracePart.sharp`). */
  readonly sharp: ReadonlyArray<TracePt>;
  /** The lit rim a view paints down his face's edge, as more of his skin's samples (none unless given): paler than his skin, nearer his cream than it. */
  readonly skinLit?: ReadonlyArray<string>;
  /** How far his hair is opened where a view draws the band behind his ear thinner than 2 px opens clean (2 unless given). */
  readonly hairOpen?: number;
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

/** How far above and below an ear's seed its box runs, sheet pixels. */
const EAR_REACH = 26;

/** The box round an ear's seed its skin is read within, from `top` above the seed. */
const earBox = (seed: TracePt, top = EAR_REACH) =>
  rect(seed[0] - 16, seed[1] - top, seed[0] + 16, seed[1] + EAR_REACH);

/** How far above an ear's seed his hair gives its brown up to the band's tone, sheet pixels: the ear's top, where the sheet's hair ends over it. */
const BAND_TOP = 18;

/** Where an ear's band is read as its tone, by how the view lays it: in the ear's box from `top` above its seed (`tone`), or nowhere (`hair`: it runs on into his hair). */
const EAR_BAND_CLIP = {
  tone: earBox,
  hair: (_seed: TracePt, _top: number): TracePt[] => [],
} as const;

/** An ear seeded at `seed`: flat skin cut inside his head, within `clip` (a box round the seed, the oval the sheet draws it where its skin runs on into his cheek, or the polygon round its lobe). */
const ear = (
  seed: TracePt,
  clip: ReadonlyArray<TracePt>,
  sharp: ReadonlyArray<TracePt>,
  band: string,
) =>
  ({
    seeds: [seed],
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

/** A standing view's parts: his head, hair and ears; his garment, its mantle, sash and neck; his arms and hands; his feet and straps. */
export const standing = (v: Standing): TraceSheetView => {
  const [x0, y0, x1, y1] = v.box;
  const wide = (a: number, b: number) => rect(x0 - 10, a, x1 + 10, b);
  const chin = CHIN[v.chin.kind];
  const ovals: Readonly<Record<string, TracePt[]>> = Object.fromEntries(
    Object.entries(v.earOvals ?? {}).map(([name, o]) => [name, oval(...o)]),
  );
  const lobes: Readonly<Record<string, ReadonlyArray<TracePt>>> = v.earLobes ?? {};
  const ears = Object.fromEntries(
    Object.entries(v.ears).map(([name, seed]) => [
      name,
      ear(seed, lobes[name] ?? ovals[name] ?? earBox(seed), v.earSharp ?? [], `${name}Band`),
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
  const bandOf = (seed: TracePt, top: number): TracePart => ({
    classes: BROWN,
    clip: EAR_BAND_CLIP[v.earBand ?? 'hair'](seed, top),
    grow: 2,
    as: 'none',
  });
  const bands = Object.fromEntries(
    Object.entries(v.ears).flatMap(([name, seed]) => [
      [`${name}Band`, bandOf(seed, BAND_TOP)],
      [`${name}BandUnder`, bandOf(seed, EAR_REACH)],
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
    ...v.marked,
    parts: {
      face: { seeds: [v.face], clip: wide(y0, v.chin.row), as: 'none' },
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
      head: {
        plus: ['face', 'hairMass', 'neckSkin', 'jawCorner', ...Object.keys(ears), ...lobeNames],
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
        colour: JAW_LINE,
        inside: 'head',
        // Under the chin only, never the curls beside the jaw: its band runs out to the hair at the ear; or the line the sheet paints, as the view reads it.
        clip:
          v.chin.line ??
          rect(
            v.face[0] - JAW_REACH,
            v.chin.row - chin.shade - chin.jaw,
            v.face[0] + JAW_REACH,
            v.chin.row - chin.shade + 12,
          ),
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
      earOvals: { earNear: [440.5, 323, 12.5, 19.5] },
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
        ends: [{ top: [565, 586, 560], bottom: [568, 588, 722] }],
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
      earSharp: [[964.5, 307.5]],
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
        ends: [{ top: [1193, 1212, 560], bottom: [1192, 1212, 716] }],
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
