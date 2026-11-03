import type { LabelTable, TracePart, TracePt, TraceSheet, TraceSheetView } from '@manna/film/tools';
import { Option } from 'effect';
import { LABELS } from './labels.ts';

export const CLASSES = {
  cream: ['#fde1bc', '#e3bea0', '#feecca', '#f7d8b2'],
  teal: ['#4e7182', '#58859b', '#61898d', '#4e768b', '#3f5f73'],
  skin: ['#fdaf70', '#e58a62', '#f3996a', '#f8a062'],
  hairLight: ['#894b2d', '#7e442f', '#85492e'],
  hair: ['#6a3e2b', '#673b28', '#75442d', '#6f412c'],
  hairDark: ['#563124', '#4f2b21', '#543022', '#5a3324'],
} as const;

const BROWN = ['hairLight', 'hair', 'hairDark'];

export const rect = (x0: number, y0: number, x1: number, y1: number): TracePt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

export const oval = (cx: number, cy: number, rx: number, ry: number): TracePt[] =>
  Array.from({ length: 16 }, (_, i): TracePt => [
    Math.round((cx + rx * Math.cos((i / 16) * 2 * Math.PI)) * 2) / 2,
    Math.round((cy + ry * Math.sin((i / 16) * 2 * Math.PI)) * 2) / 2,
  ]);

const shifted = (pts: ReadonlyArray<TracePt>, by: TracePt): TracePt[] =>
  pts.map(([x, y]) => [x + by[0], y + by[1]]);

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

const LOBE_UNDER = 4;

const SASH_SHADE: TracePt = [4, 2];

const KNOT_SHADE: TracePt = [1, 2];

interface SashEnd {
  readonly top: readonly [left: number, right: number, row: number];
  readonly bottom: readonly [left: number, right: number, row: number];
}

const endOf = ({ top, bottom }: SashEnd): TracePt[] => [
  [top[0], top[2]],
  [top[1], top[2]],
  [bottom[1], bottom[2]],
  [bottom[0], bottom[2]],
];

interface Sash {
  readonly band: readonly [number, number, number, number];
  readonly ends: ReadonlyArray<SashEnd>;
  readonly knots: ReadonlyArray<readonly [number, number, number, number]>;
}

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
    knotShade: knot("The knot's rose shade, round it and under it to its right.", KNOT_SHADE, 2),
    knot: knot("The sash's knot, over its band.", [0, 0], 0),
  } satisfies Record<string, TracePart>;
};

interface Chin {
  readonly kind: 'open' | 'closed';
  readonly row: number;
  readonly line?: ReadonlyArray<TracePt>;
  readonly shade?: ReadonlyArray<TracePt>;
  readonly corner?: ReadonlyArray<TracePt>;
  readonly fade?: ReadonlyArray<TracePt>;
  readonly paint?: keyof typeof JAW_LINE;
}

const JAW_LINE = {
  brown: { near: '#985636', far: ['#fdaf70', '#f8a062', '#e58a62', '#e07a50'] },
  rose: { near: '#d47048', far: ['#fdaf70', '#f8a062', '#e8875a', '#f2a06c', '#e58d5f'] },
} as const;

const JAW_SHADE = { near: '#e8875a', far: ['#f2a06c', '#fdaf70', '#feb476', '#fcdb9c', '#f9cb8a'] };

const JAW_SOFT = { near: '#f2a06c', far: ['#fdaf70', '#feb476', '#fcdb9c', '#f9cb8a'] };

const JAW_REACH = 36;

const CHIN = {
  open: {
    garment: 25,
    shade: 45,
    under: 0,
    shadeIn: 'head',
    jaw: 15,
    doc: "His head's paper down into his garment's neck (his chin open): his face, his ears, his neck and his skull under his hair.",
  },
  closed: {
    garment: 10,
    shade: 0,
    under: 45,
    shadeIn: 'body',
    jaw: 0,
    doc: "His head's paper to the line under his chin: his face, his ears and his skull under his hair.",
  },
} as const;

type Picked = TracePt | { readonly label: string };

const pickOf = (
  p: Picked,
): { readonly seeds: ReadonlyArray<TracePt> } | { readonly label: string } => {
  if ('label' in p) return { label: p.label };
  return { seeds: [p] };
};

type ArmPick =
  | { readonly silhouette: true }
  | { readonly seeds: ReadonlyArray<TracePt>; readonly grow: number }
  | { readonly label: string; readonly grow: number };

const SILHOUETTE: ArmPick = { silhouette: true };

export const sleeveAt = (p: Picked): ArmPick => ({ ...pickOf(p), grow: 6 });

interface ArmSpec {
  readonly pick: ArmPick;
  readonly clip: TracePt[];
  readonly below: number;
  readonly hand: Picked;
  readonly off?: TracePt[];
  readonly plus?: TracePt[];
}

const UNDER_ARMS = {
  beside: ['armNearBelow', 'armFarBelow', 'handNearRing', 'handFarRing'],
  onGarment: [],
  raised: ['armNearOff', 'armFarOff', 'armFarBelow', 'handNearRing', 'handFarRing'],
} as const;

const PROFILE_RIGHT_SLEEVE: TracePt[] = [
  [1091, 405],
  [1166, 405],
  [1166, 607],
  [1088, 607],
  [1088, 436],
];

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

interface EarAt {
  readonly label: string;
  readonly at?: TracePt;
}

interface Standing {
  readonly box: readonly [number, number, number, number];
  readonly out: string;
  readonly about: string;
  readonly labels?: LabelTable;
  readonly face: Picked;
  readonly marked: Pick<TraceSheetView, 'marks'>;
  readonly ears: { readonly earNear: TracePt | EarAt; readonly earFar?: TracePt | EarAt };
  readonly earClips?: {
    readonly earNear?: ReadonlyArray<TracePt>;
    readonly earFar?: ReadonlyArray<TracePt>;
  };
  readonly earBand?: keyof typeof EAR_BAND_CLIP;
  readonly earLobes?: {
    readonly earNear?: ReadonlyArray<TracePt>;
    readonly earFar?: ReadonlyArray<TracePt>;
  };
  readonly earSharp?: ReadonlyArray<TracePt>;
  readonly earLit?: ReadonlyArray<TracePt>;
  readonly chin: Chin;
  readonly sharp: ReadonlyArray<TracePt>;
  readonly skinLit?: ReadonlyArray<string>;
  readonly hairOpen?: number;
  readonly hairReach?: ReadonlyArray<TracePt>;
  readonly near: ArmSpec;
  readonly far: ArmSpec;
  readonly arms: keyof typeof UNDER_ARMS;
  readonly necks: ReadonlyArray<TracePt> | { readonly label: string };
  readonly beside: TracePt[];
  readonly sash: Sash;
  readonly hem: number;
  readonly split: number;
}

const EAR_REACH = 26;

const earBox = (seed: TracePt, top = EAR_REACH) =>
  rect(seed[0] - 16, seed[1] - top, seed[0] + 16, seed[1] + EAR_REACH);

const BAND_TOP = 18;

const UNDER_EAR = { from: 10, to: 52, left: 32, right: 24 } as const;

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
    minus: [band],
    into: 'ink',
    open: 2,
    doc: "An ear, flat skin cut inside his head: its ink is his head's, and the hair beside it lies round it.",
  }) satisfies TracePart;

const cutRound = (e: TracePt | EarAt, cut: (at: TracePt) => TracePt[]): TracePt[] => {
  if (!('label' in e)) return cut(e);
  return Option.match(Option.fromUndefinedOr(e.at), { onNone: () => [], onSome: cut });
};

const earPick = (e: TracePt | EarAt) => {
  if ('label' in e) return pickOf({ label: e.label });
  return pickOf(e);
};

const jawAround = (face: Picked, row: number, jaw: number): TracePt[] => {
  if ('label' in face) return [];
  return rect(face[0] - JAW_REACH, row - jaw, face[0] + JAW_REACH, row + 12);
};

const neckPick = (necks: Standing['necks']) => {
  if ('label' in necks) return { label: necks.label };
  return { seeds: necks };
};

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
    path: 'cubic',
    line: 'brown',
    labels: v.labels ?? {},
    ...v.marked,
    parts: {
      face: { ...pickOf(v.face), clip: wide(y0, v.chin.row), as: 'none' },
      faceAbove: { within: 'face', clip: wide(y0, v.chin.row - chin.garment), grow: 0, as: 'none' },
      ...ears,
      ...lobeParts,
      hairMass: {
        classes: BROWN,
        clip: wide(y0, v.chin.row),
        minus: ['beside', 'handNearRing', 'handFarRing'],
        as: 'none',
      },
      neckSkin: { classes: ['skin'], clip: neckBand, minus: ['beside'], as: 'none' },
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
        reach: 'figure',
        minus: ['handNearPaper', 'handFarPaper'],
        open: 0,
        close: 2,
        smooth: 4,
        sharp: v.sharp,
        grow: 3,
        doc: chin.doc,
      },
      hair: {
        within: 'hairMass',
        plus: ['hairReach'],
        reach: 'figure',
        grow: 4,
        open: v.hairOpen ?? 2,
        inside: 'head',
        minus: [...Object.keys(ears), ...bandsCut, 'jaw'],
        doc: 'His hair, the whole mass of curls over his head.',
      },
      ...bands,
      earsAll: { plus: Object.keys(ears), grow: 0, as: 'none' },
      earLight: {
        classes: ['skin'],
        colour: { near: '#f9d08f', far: ['#fbbb7a', '#f5a068', '#f3975f', '#ec9060'] },
        inside: 'earsAll',
        grow: 0,
        as: 'tones',
        min: 15,
        doc: 'The light on his ears, their lit rim.',
      },
      earLit: {
        classes: ['skin'],
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
        colour: { near: '#e8905f', far: ['#f59d66', '#f7a469', '#e27e55', '#fac17f', '#fdd695'] },
        inside: 'earsAll',
        grow: 0,
        as: 'tones',
        min: 15,
        doc: 'An ear where it turns from the light: its skin a step deeper, toward rose.',
      },
      earHollow: {
        classes: ['skin'],
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
        clip: v.chin.line ?? jawAround(v.face, v.chin.row - chin.shade, chin.jaw),
        grow: 1,
        as: 'none',
      },
      jawCorner: { silhouette: true, clip: v.chin.corner ?? [], reach: 'figure', as: 'none' },
      jaw: {
        plus: ['jawLine', 'jawCorner'],
        edge: 'outer',
        reach: 'figure',
        grow: 0,
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
      armNearPlus: { silhouette: true, clip: v.near.plus ?? [], as: 'none' },
      armFarPlus: { silhouette: true, clip: v.far.plus ?? [], as: 'none' },
      armNear: {
        ...v.near.pick,
        clip: v.near.clip,
        plus: ['armNearPlus'],
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
      armNearBelow: { within: 'armNear', clip: wide(v.near.below, y1), shrink: 6, as: 'none' },
      armNearOff: { within: 'armNear', clip: v.near.off ?? [], as: 'none' },
      armFarOff: { within: 'armFar', clip: v.far.off ?? [], as: 'none' },
      armFarBelow: { within: 'armFar', clip: wide(v.far.below, y1), shrink: 6, as: 'none' },
      body: {
        silhouette: true,
        clip: wide(v.chin.row - chin.garment, v.hem),
        smooth: 8,
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
      ears: {
        earNear: { label: 'earNear', at: [72, 322] },
        earFar: { label: 'earFar', at: [210, 322] },
      },
      earBand: 'tone',
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
      skinLit: ['#fcdb9c', '#f9cb8a', '#fbd59c'],
      chin: {
        kind: 'closed',
        row: 393,
        line: rect(112, 376, 172, 397),
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
        corner: [
          [369, 385],
          [379, 383],
          [380, 392],
          [375, 392],
          [375, 386],
          [369, 386],
        ],
        fade: rect(404, 350, 430, 395),
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
      ears: { earNear: { label: 'face' } },
      earClips: { earNear: oval(656.5, 320.5, 13, 16) },
      earLit: oval(656.5, 320.5, 13, 16),
      chin: {
        kind: 'closed',
        row: 392,
        line: [
          [623, 374],
          [640, 365],
          [642, 368],
          [627, 386],
          [623, 386],
        ],
        corner: [
          [615, 377],
          [621, 375],
          [627, 375],
          [627, 384],
          [621, 384],
          [621, 378],
          [615, 378],
        ],
        fade: rect(615, 360, 645, 390),
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
        line: [],
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
      ears: { earNear: { label: 'face' } },
      earClips: { earNear: oval(1124.5, 320.5, 12, 17) },
      earLit: oval(1124.5, 320.5, 12, 17),
      chin: {
        kind: 'closed',
        row: 394,
        line: [],
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
      ears: { earNear: { label: 'face', at: [1338, 322] } },
      earClips: { earNear: THREE_QUARTER_RIGHT_EAR },
      earBand: 'under',
      earLit: THREE_QUARTER_RIGHT_EAR,
      skinLit: ['#fcdb9c', '#f9cb8a', '#fbd59c'],
      chin: {
        kind: 'closed',
        row: 391,
        line: [
          [1412, 384],
          [1366, 362],
          [1364, 364],
          [1364, 378],
          [1412, 402],
        ],
        corner: [
          [1422, 385],
          [1412, 383],
          [1411, 393],
          [1419, 393],
          [1419, 386],
          [1422, 386],
        ],
        fade: rect(1350, 350, 1376, 395),
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
