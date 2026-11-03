import { cutoutTable } from '@manna/film/canvas';
import { type CastProp, type CastView, castTable } from '@manna/film/rive';
import {
  HAND_ART,
  type TracedKnob,
  armReach,
  boilTime,
  tracedHands,
  type tracedFigure,
} from '@manna/film/style';
import { PUPPETS as LEAD_PUPPETS } from '../../../library/cast/lead-feast/cutout/puppets.ts';
import { PUPPETS as SOWER_PUPPETS } from '../../../library/cast/sower/cutout/puppets.ts';
import { PUPPETS as CHILD_PUPPETS } from '../../../library/cast/villager-child/cutout/puppets.ts';
import { PUPPETS as TODDLER_PUPPETS } from '../../../library/cast/villager-toddler/cutout/puppets.ts';
import { PUPPETS as FEAST_MOTHER_PUPPETS } from '../cast/feast-mother/cutout/puppets.ts';
import { PUPPETS as IDEA_VILLAGERS_PUPPETS } from '../cast/idea-villagers/cutout/puppets.ts';
import { PUPPETS as PAUL_PUPPETS } from '../../../library/cast/paul/cutout/puppets.ts';
import { PUPPETS as JEREMIAH_PUPPETS } from '../../../library/cast/jeremiah/cutout/puppets.ts';
import { PUPPETS as FEAST_GUEST_MAN_PUPPETS } from '../../../library/cast/feast-guest-man/cutout/puppets.ts';
import { PUPPETS as FEAST_GUEST_WOMAN_PUPPETS } from '../../../library/cast/feast-guest-woman/cutout/puppets.ts';
import { PUPPETS as FILLER_BASES_PUPPETS } from '../../../library/cast/filler-bases/cutout/puppets.ts';
import { own } from '../../../library/cutout/poses.ts';
import { RAISE as LEAD_RAISE } from '../../../library/cast/lead-feast/cutout/raise.ts';
import { poses1View as leadPoses1 } from '../../../library/cast/lead-feast/cutout/poses.ts';
import * as LEAD_BACK from '../../../library/cast/lead-feast/rig/back-traced.ts';
import * as LEAD_DRINKING from '../../../library/cast/lead-feast/rig/drinking-traced.ts';
import * as LEAD_FRONT from '../../../library/cast/lead-feast/rig/front-traced.ts';
import * as LEAD from '../../../library/cast/lead-feast/rig/lead.ts';
import { LABELS as LEAD_LABELS } from '../../../library/cast/lead-feast/rig/labels.ts';
import * as LEAD_PROFILE_LEFT from '../../../library/cast/lead-feast/rig/profile-left-traced.ts';
import * as LEAD_PROFILE_RIGHT from '../../../library/cast/lead-feast/rig/profile-right-traced.ts';
import * as LEAD_REACHING from '../../../library/cast/lead-feast/rig/reaching-traced.ts';
import * as LEAD_RAISED from '../../../library/cast/lead-feast/rig/raised-traced.ts';
import * as LEAD_SEATED from '../../../library/cast/lead-feast/rig/seated-traced.ts';
import * as LEAD_TQ_LEFT from '../../../library/cast/lead-feast/rig/three-quarter-left-traced.ts';
import * as LEAD_TQ_RIGHT from '../../../library/cast/lead-feast/rig/three-quarter-right-traced.ts';
import { CLASSES as LEAD_CLASSES } from '../../../library/cast/lead-feast/rig/trace.ts';
import {
  PAPERS as LEAD_PAPERS,
  TONES as LEAD_TONES,
} from '../../../library/cast/lead-feast/rig/papers.ts';
import { palette } from '../palette.ts';
import { bottle, plate, stool, table } from '../props.ts';
import * as RIGS from './rigs.ts';

type Pt = readonly [number, number];
type Box = readonly [number, number, number, number];
type Numbers = Readonly<Partial<Record<TracedKnob, number>>>;

type Composed = ReturnType<typeof tracedFigure>;

export const PAPER = { base: palette.paper, tone: palette.paperTone, seed: 1844 } as const;

const coloursOf = (
  ...ps: ReadonlyArray<{ readonly color: string; readonly shade?: string; readonly light?: string }>
) =>
  ps.flatMap((p) => [
    p.color,
    ...(p.shade === undefined ? [] : [p.shade]),
    ...(p.light === undefined ? [] : [p.light]),
  ]);

const SOWER_CLASSES = {
  linen: ['#dfc6ab', '#d8bfa4', '#ead0b1', '#e3c9a9', '#e6cbaa', '#dfbc97', '#e0bc96', '#dfbc98'],
  olive: ['#787456', '#797454', '#736f52', '#747055', '#645f58', '#615a52', '#8e7b4e', '#88784d'],
  walnut: ['#946452', '#b87d58', '#ad7750', '#b17951', '#b07a53', '#82593b', '#a17351'],
  skin: [
    '#eaad7b',
    '#ebac78',
    '#e8ab7a',
    '#e09e78',
    '#e9ac7c',
    '#e29d6c',
    '#dc9768',
    '#e49f6a',
    '#d59265',
  ],
} as const;

const FEAST_MOTHER_CLASSES = {
  blue: [
    '#5f94b9',
    '#70a5c8',
    '#557ca6',
    '#547aa7',
    '#4d6394',
    '#5378a4',
    '#4e6999',
    '#5d8bb3',
    '#4f6899',
    '#6998bc',
    '#4777a2',
    '#4f6893',
    '#5f8eb1',
    '#526e99',
    '#5889af',
    '#536f9a',
  ],
  cream: [
    '#f8e4c7',
    '#f7e0c3',
    '#e2c6b7',
    '#c1a18e',
    '#e6cdbd',
    '#f7e2c3',
    '#f7e0c1',
    '#e6cfbe',
    '#f6dbb9',
    '#e4c9b1',
    '#e2c2be',
    '#f6ddbd',
    '#f1d7b9',
    '#fef7e3',
    '#e3cdbe',
    '#f2d8bc',
    '#f0d5bb',
  ],
  skin: ['#fec086', '#fdb981', '#fdb77d', '#fdb67c', '#fdc084', '#febb82', '#feb880', '#ef9f70'],
} as const;

const FEAST_GUEST_MAN_CLASSES = {
  walnut: ['#bf855e', '#b57955', '#b47853', '#b37650', '#ac7d5d', '#a26148'],
  skin: ['#fec190', '#febe8e', '#febc8d', '#fec092', '#fdbf8e', '#fdbd8e', '#fec594', '#fdc18f'],
  indigo: ['#42537f', '#404f76', '#3a4770'],
  wood: ['#9f552a', '#924a26', '#a35429', '#9a5029'],
} as const;

const FEAST_GUEST_WOMAN_CLASSES = {
  olive: ['#a08e55', '#81764d', '#6a6444', '#676141', '#776e46', '#7f774d', '#83794e'],
  skin: ['#febe84', '#fdbd82', '#febc80', '#febb80', '#fdbc81'],
  wood: ['#bc6830', '#985128', '#914d28', '#9a532a', '#844626'],
} as const;

const CHILD_CLASSES = {
  linen: ['#cdaca4', '#d2b4aa', '#dbbca7', '#f0d2af', '#f4d7b1'],
  skin: ['#ea976e', '#f9a873', '#faac77', '#fdae76', '#fdb37d'],
  lavender: ['#b5a5cc', '#bcaacf', '#bcadd4', '#c7b2ca'],
  sandal: ['#8f4c2e', '#935131', '#c2714c'],
} as const;
const TODDLER_CLASSES = {
  linen: [
    '#cca9a8',
    '#d5b6b3',
    '#e8c9b5',
    '#f0d1ae',
    '#f7dab8',
    '#c29e90',
    '#cfada5',
    '#eed1ab',
    '#f0d3b0',
  ],
  skin: ['#e79066', '#fcae7a', '#fdb37a', '#e9956f', '#fcaf78', '#fdb67d'],
  lavender: ['#ae99c9', '#bba7cd', '#beacd2'],
  sandal: ['#b36243', '#b56646', '#b36a49', '#965225', '#a5562b', '#a86942'],
} as const;

const IDEA_VILLAGERS_CLASSES = {
  linen: [
    '#f1d3ae',
    '#f6dfb8',
    '#eecda4',
    '#debca1',
    '#fde1ba',
    '#e5c6b3',
    '#eccaa5',
    '#f4d6b3',
    '#ddb9ae',
    '#f4d9bd',
    '#f6e8c8',
    '#d9beb2',
    '#d5b9ae',
    '#dec2b2',
  ],
  violet: [
    '#c7a8ac',
    '#c9acb3',
    '#d1b0b2',
    '#c1a3af',
    '#c2b7de',
    '#ccbdd9',
    '#c3a7b0',
    '#bea1b3',
    '#bba2b1',
  ],
  skin: [
    '#f8a26d',
    '#f19b68',
    '#faa470',
    '#f6ab75',
    '#f7a66b',
    '#fcbd7e',
    '#f59f66',
    '#fca16b',
    '#f39760',
    '#fda66f',
  ],
} as const;

const PAUL_CLASSES = {
  skin: [
    '#e8ae78',
    '#de9d6d',
    '#f5ce9c',
    '#ebaf7b',
    '#dd9d6e',
    '#f8c994',
    '#ebae7d',
    '#df9e6e',
    '#fbcb95',
    '#eaac77',
    '#de9d6c',
    '#facd9b',
    '#ecae7b',
    '#df9e6f',
    '#f7c795',
    '#ebac79',
    '#de9c6e',
    '#fdc894',
  ],
  mantle: [
    '#86898f',
    '#616072',
    '#81838e',
    '#64637d',
    '#898a8f',
    '#646378',
    '#83858a',
    '#64637d',
    '#8a898f',
    '#68667f',
    '#86858b',
    '#65647d',
  ],
  tunic: [
    '#efd6ad',
    '#e6c9a0',
    '#eed2a5',
    '#e8cba0',
    '#ecd1a6',
    '#e7cba1',
    '#eccfa4',
    '#e5c597',
    '#eccea2',
    '#e6c79c',
    '#edd0a4',
    '#eccda1',
  ],
  hair: [
    '#8c6f56',
    '#8e6041',
    '#82664e',
    '#8f6642',
    '#876c54',
    '#8b6644',
    '#886e57',
    '#896a4e',
    '#896d55',
    '#82664d',
    '#856954',
    '#8a6342',
  ],
} as const;

const JEREMIAH_CLASSES = {
  linen: [
    '#e3cdaf',
    '#cab5a4',
    '#e6cba9',
    '#e0c9a9',
    '#d4bfb1',
    '#e5caa8',
    '#e8cfae',
    '#d0b6a3',
    '#e6cdad',
    '#e1c9ad',
    '#d8c1af',
    '#e6ccaa',
    '#e5cdae',
    '#d9c2af',
    '#e6ccab',
    '#e1c9ac',
    '#d6c0ad',
    '#e8ceb0',
  ],
  skin: [
    '#e3a576',
    '#d7946f',
    '#e0a477',
    '#d2906d',
    '#e9a879',
    '#d7956e',
    '#e2a275',
    '#d6926f',
    '#e0a175',
    '#d59270',
    '#e1a279',
    '#d59371',
  ],
  olive: [
    '#7c775f',
    '#807f61',
    '#8f8566',
    '#7e7867',
    '#7b715e',
    '#80765e',
    '#908568',
    '#756d5a',
    '#7b7259',
    '#867c61',
    '#867d62',
    '#8e8677',
    '#7b725b',
    '#8a7f63',
    '#887d61',
    '#868372',
    '#7c735a',
    '#887e61',
    '#847a5f',
    '#807a68',
    '#7f765d',
    '#897f64',
    '#8e8569',
    '#817b6c',
  ],
} as const;

export const FIT_CLASSES = {
  'lead-feast': {
    cream: {
      sheet: LEAD_CLASSES.cream,
      paper: [
        ...coloursOf(
          LEAD_PAPERS.tunic,
          LEAD_PAPERS.sleeve,
          LEAD_PAPERS.sleeveAcross,
          LEAD_PAPERS.sleeveRaised,
        ),
        LEAD_TONES.sash,
        LEAD_TONES.raisedUnder,
        LEAD_TONES.creamAcrossInner,
        LEAD_TONES.creamAcrossFold,
      ],
    },
    teal: {
      sheet: LEAD_CLASSES.teal,
      paper: [
        ...coloursOf(LEAD_PAPERS.mantleSleeve),
        LEAD_TONES.mantle,
        LEAD_TONES.mantleShade,
        LEAD_TONES.tealEdge,
        LEAD_TONES.lapSleeveUnder,
      ],
    },
    skin: {
      sheet: LEAD_CLASSES.skin,
      paper: [
        ...coloursOf(LEAD_PAPERS.skin, LEAD_PAPERS.ear, LEAD_PAPERS.hand),
        LEAD_PAPERS.foot.color,
        LEAD_TONES.neck,
        LEAD_TONES.jawShade,
        LEAD_TONES.jawSoft,
        LEAD_TONES.earLit,
        LEAD_TONES.earShade,
      ],
    },
  },
  'feast-mother': {
    blue: { sheet: FEAST_MOTHER_CLASSES.blue, paper: FEAST_MOTHER_CLASSES.blue },
    cream: { sheet: FEAST_MOTHER_CLASSES.cream, paper: FEAST_MOTHER_CLASSES.cream },
    skin: { sheet: FEAST_MOTHER_CLASSES.skin, paper: FEAST_MOTHER_CLASSES.skin },
  },
  'feast-guest-man': {
    walnut: { sheet: FEAST_GUEST_MAN_CLASSES.walnut, paper: FEAST_GUEST_MAN_CLASSES.walnut },
    skin: { sheet: FEAST_GUEST_MAN_CLASSES.skin, paper: FEAST_GUEST_MAN_CLASSES.skin },
    indigo: { sheet: FEAST_GUEST_MAN_CLASSES.indigo, paper: FEAST_GUEST_MAN_CLASSES.indigo },
    wood: { sheet: FEAST_GUEST_MAN_CLASSES.wood, paper: FEAST_GUEST_MAN_CLASSES.wood },
  },
  'feast-guest-woman': {
    olive: { sheet: FEAST_GUEST_WOMAN_CLASSES.olive, paper: FEAST_GUEST_WOMAN_CLASSES.olive },
    skin: { sheet: FEAST_GUEST_WOMAN_CLASSES.skin, paper: FEAST_GUEST_WOMAN_CLASSES.skin },
    wood: { sheet: FEAST_GUEST_WOMAN_CLASSES.wood, paper: FEAST_GUEST_WOMAN_CLASSES.wood },
  },
  'idea-villagers': {
    linen: { sheet: IDEA_VILLAGERS_CLASSES.linen, paper: IDEA_VILLAGERS_CLASSES.linen },
    violet: { sheet: IDEA_VILLAGERS_CLASSES.violet, paper: IDEA_VILLAGERS_CLASSES.violet },
    skin: { sheet: IDEA_VILLAGERS_CLASSES.skin, paper: IDEA_VILLAGERS_CLASSES.skin },
  },
  jeremiah: {
    linen: { sheet: JEREMIAH_CLASSES.linen, paper: JEREMIAH_CLASSES.linen },
    skin: { sheet: JEREMIAH_CLASSES.skin, paper: JEREMIAH_CLASSES.skin },
    olive: { sheet: JEREMIAH_CLASSES.olive, paper: JEREMIAH_CLASSES.olive },
  },
  paul: {
    skin: { sheet: PAUL_CLASSES.skin, paper: PAUL_CLASSES.skin },
    mantle: { sheet: PAUL_CLASSES.mantle, paper: PAUL_CLASSES.mantle },
    tunic: { sheet: PAUL_CLASSES.tunic, paper: PAUL_CLASSES.tunic },
    hair: { sheet: PAUL_CLASSES.hair, paper: PAUL_CLASSES.hair },
  },
  sower: {
    linen: { sheet: SOWER_CLASSES.linen, paper: SOWER_CLASSES.linen },
    olive: { sheet: SOWER_CLASSES.olive, paper: SOWER_CLASSES.olive },
    walnut: { sheet: SOWER_CLASSES.walnut, paper: SOWER_CLASSES.walnut },
    skin: { sheet: SOWER_CLASSES.skin, paper: SOWER_CLASSES.skin },
  },
  'villager-child': {
    linen: { sheet: CHILD_CLASSES.linen, paper: CHILD_CLASSES.linen },
    skin: { sheet: CHILD_CLASSES.skin, paper: CHILD_CLASSES.skin },
    lavender: { sheet: CHILD_CLASSES.lavender, paper: CHILD_CLASSES.lavender },
    sandal: { sheet: CHILD_CLASSES.sandal, paper: CHILD_CLASSES.sandal },
  },
  'villager-toddler': {
    linen: { sheet: TODDLER_CLASSES.linen, paper: TODDLER_CLASSES.linen },
    skin: { sheet: TODDLER_CLASSES.skin, paper: TODDLER_CLASSES.skin },
    lavender: { sheet: TODDLER_CLASSES.lavender, paper: TODDLER_CLASSES.lavender },
    sandal: { sheet: TODDLER_CLASSES.sandal, paper: TODDLER_CLASSES.sandal },
  },
} as const;

const SHEET = { width: 1536, height: 1024 } as const;

const SINGLE = { width: 1024, height: 1536 } as const;

const LEAD_TURNAROUND = 1 / LEAD.SHEETS.turnaround.scale;

const LEAD_SINGLE = (1382 - 109) / 440;

const SOWER_TURNAROUND = 549 / 440;

const SOWER_POSES = 586 / 440;

const VILLAGER_POSES = 516 / 440;

const FEAST_MOTHER_TURNAROUND = 600 / 440;

const FEAST_MOTHER_POSES = 814 / 440;

const FEAST_GUEST_MAN_POSES = (LEAD_SINGLE * 161) / 206;

const FEAST_GUEST_WOMAN_POSES = (LEAD_SINGLE * 162) / 206;

const FILLER_BASES_POSES = (871 - 141) / 440;

const IDEA_VILLAGERS_POSES = 512 / 440;

const IDEA_VILLAGERS_SINGLE = (1403 - 274) / 440;

const HEADS_BUST = LEAD_TURNAROUND * 1.13;

export const SHEETS = {
  'lead-feast': {
    turnaround: { ...SHEET, scale: LEAD_TURNAROUND },
    poses: { ...SHEET, scale: 1 / LEAD.SHEETS.poses.scale },
    heads: { ...SHEET, scale: HEADS_BUST },
    single: { ...SINGLE, scale: LEAD_SINGLE },
  },
  'feast-mother': {
    turnaround: { ...SHEET, scale: FEAST_MOTHER_TURNAROUND },
    poses: { ...SHEET, scale: FEAST_MOTHER_POSES },
  },
  'feast-guest-man': {
    poses: { ...SHEET, scale: FEAST_GUEST_MAN_POSES },
  },
  'feast-guest-woman': {
    poses: { ...SHEET, scale: FEAST_GUEST_WOMAN_POSES },
  },
  'filler-bases': {
    poses: { ...SHEET, scale: FILLER_BASES_POSES },
  },
  'idea-villagers': {
    poses: { ...SHEET, scale: IDEA_VILLAGERS_POSES },
    single: { ...SINGLE, scale: IDEA_VILLAGERS_SINGLE },
  },
  jeremiah: {
    heads: { ...SHEET, scale: HEADS_BUST },
  },
  paul: {
    heads: { ...SHEET, scale: HEADS_BUST },
  },
  sower: {
    turnaround: { ...SHEET, scale: SOWER_TURNAROUND },
    poses: { ...SHEET, scale: SOWER_POSES },
  },
  'villager-child': {
    poses: { ...SHEET, scale: VILLAGER_POSES },
  },
  'villager-toddler': {
    poses: { ...SHEET, scale: VILLAGER_POSES },
  },
} as const;

const still = (numbers: Numbers) => ({
  timelines: [
    ['breath', 0],
    ['boil', boilTime(0)],
  ] as const,
  numbers,
});

const turned = ([x, y]: Pt, by: number): Pt => [
  x * Math.cos(by) - y * Math.sin(by),
  x * Math.sin(by) + y * Math.cos(by),
];

type Reach = readonly ['near' | 'far', Pt] | readonly ['near' | 'far', Pt, 'out'];

interface ViewSpec {
  readonly member: 'lead-feast';
  readonly kind: Exclude<keyof (typeof SHEETS)['lead-feast'], 'single'>;
  readonly box: Box;
  readonly at: Pt;
  readonly composed: Composed;
  readonly rig: CastView['rig'];
  readonly hand: CastView['rig'];
  readonly lean: number;
  readonly numbers: Numbers;
  readonly reach: ReadonlyArray<Reach>;
  readonly props: ReadonlyArray<CastProp>;
}

const view = (v: ViewSpec): CastView => {
  const scale = SHEETS[v.member][v.kind].scale;
  const reached = Object.fromEntries(
    v.reach.flatMap(([side, p, elbow]) => {
      const units = turned([(p[0] - v.at[0]) / scale, (p[1] - v.at[1]) / scale], -v.lean);
      const r = armReach(v.composed.arms[side], units, elbow);
      return [
        [`${side}Arm`, r.turn],
        [`${side}Elbow`, r.bend],
      ];
    }),
  );
  const numbers: Numbers = { ...v.numbers, lean: v.lean, ...reached };
  const hands = tracedHands(v.composed.arms, numbers);
  const handPose = {
    timelines: [['boil', boilTime(0)]] as const,
    size: v.composed.hand / (2 * HAND_ART.r),
  };
  return {
    box: v.box,
    at: v.at,
    rig: { ...v.rig, concept: { image: { cast: v.member, sheet: v.kind }, box: v.box } },
    pose: still(numbers),
    with: [
      { rig: v.hand, pose: handPose, at: hands.far },
      { rig: v.hand, pose: handPose, at: hands.near },
    ],
    props: v.props,
  };
};

interface Placed {
  readonly BOX: Box;
  readonly FEET: Pt;
}

const LEAD_HAND = RIGS.leadFeastHandProp;

const turnaround = (t: Placed, composed: Composed, rig: CastView['rig']): CastView =>
  view({
    member: 'lead-feast',
    kind: 'turnaround',
    box: t.BOX,
    at: t.FEET,
    composed,
    rig,
    hand: LEAD_HAND,
    lean: 0,
    numbers: {},
    reach: [],
    props: [],
  });

const pose = (
  box: Box,
  at: Pt,
  composed: Composed,
  rig: CastView['rig'],
  p: Pick<ViewSpec, 'lean' | 'numbers' | 'reach' | 'props'>,
): CastView =>
  view({ member: 'lead-feast', kind: 'poses', box, at, composed, rig, hand: LEAD_HAND, ...p });

const eyesOf = (marks: { readonly eyes: readonly [Pt, Pt] }): Pt => [
  (marks.eyes[0][0] + marks.eyes[1][0]) / 2,
  (marks.eyes[0][1] + marks.eyes[1][1]) / 2,
];

const bust = (
  box: Box,
  eyes: Pt,
  t: Placed & { readonly MARKS: { readonly eyes: readonly [Pt, Pt] } },
  composed: Composed,
  rig: CastView['rig'],
  numbers: Numbers,
): CastView => {
  const ratio = SHEETS['lead-feast'].heads.scale / LEAD_TURNAROUND;
  const [ex, ey] = eyesOf(t.MARKS);
  return view({
    member: 'lead-feast',
    kind: 'heads',
    box,
    at: [eyes[0] + (t.FEET[0] - ex) * ratio, eyes[1] + (t.FEET[1] - ey) * ratio],
    composed,
    rig,
    hand: LEAD_HAND,
    lean: 0,
    numbers,
    reach: [],
    props: [],
  });
};

const CHIN_PROBE = { name: 'chin', along: 'col', at: 120, from: 150, to: 260, dark: 135 } as const;
const EAR_PROBE = { name: 'earLeft', along: 'row', at: 155, from: 20, to: 80, dark: 90 } as const;

const BUST_WHY = "review-art-3 b2: the bust is his turnaround rig, not a bust rig (r155's values)";

const BUST_BARS = {
  'silhouette.edge/head': { max: 9, why: BUST_WHY },
  'outline.turns/head': { max: 23, why: BUST_WHY },
  'silhouette.edge/body': { max: 11, why: BUST_WHY },
  'silhouette.iou': { min: 0.8, why: BUST_WHY },
  slivers: { max: 90, why: BUST_WHY },
  'class.iou/cream': { min: 0, why: BUST_WHY },
} as const;

const NEAR_EAR_WHY =
  "the render's near ear runs on into his cheek under its band, so it is his face's region (r155; review-art-3 B1 kept the band)";

const CIRCLE_HAND_WHY =
  'a circle hand (CRAFT) over the hand the sheet half hides in shade (r155 0.5 and 5.78; review-art-3 kept the view)';

type ViewFit = NonNullable<CastView['fit']>;

const LEAD_FIT = {
  turnaround: {
    front: {
      labels: LEAD_LABELS.front,
      bars: {
        'part.iou/earNear': { why: NEAR_EAR_WHY },
        'part.edge/earNear': { why: NEAR_EAR_WHY },
      },
    },
    threeQuarterLeft: {
      labels: LEAD_LABELS.threeQuarterLeft,
      bars: {
        'part.iou/handNear': { min: 0.45, why: CIRCLE_HAND_WHY },
        'part.edge/handNear': { max: 6, why: CIRCLE_HAND_WHY },
      },
    },
    profileLeft: { labels: LEAD_LABELS.profileLeft },
    back: { labels: LEAD_LABELS.back },
    profileRight: { labels: LEAD_LABELS.profileRight },
    threeQuarterRight: { labels: LEAD_LABELS.threeQuarterRight },
  },
  poses: {
    'poses-1': {
      bars: {
        'silhouette.edge/head': {
          max: 6,
          why: 'review-art-3 b8: the bottle laid over his hand (r155 5.32)',
        },
        'outline.turns/head': {
          max: 72,
          why: "review-art-3 b8: the bottle's top steps his head band's edge (r155 70)",
        },
      },
    },
    'poses-2': {
      bars: {
        'silhouette.edge/head': {
          max: 10,
          why: 'review-art-3 b8, m13: two whole hands side by side at the plate (r155 8.94)',
        },
        'outline.turns/head': {
          max: 103,
          why: "review-art-3 b8: the plate's rim and his hands step his head band's edge (r155 101)",
        },
        'class.iou/teal': { min: 0.5, why: 'review-art-3 b8: his far sleeve short (r155 0.51)' },
      },
    },
    'poses-3': {
      probes: [
        { name: 'seat', along: 'row', at: 375, from: 180, to: 288 },
        { name: 'chestFold', along: 'row', at: 285, from: 98, to: 130, dark: 160 },
      ],
    },
    'poses-4': {
      bars: {
        'outline.turns/head': {
          max: 12,
          why: 'review-art-3 b9: kept ready; his rolled head over the reach (r155 11)',
        },
        'silhouette.edge/body': {
          max: 5.5,
          why: 'review-art-3 b9: the table and the bottle by his reaching hand (r155 5)',
        },
        'outline.turns/body': {
          max: 67,
          why: "review-art-3 b9: the table's top steps his body's edge (r155 65)",
        },
        'silhouette.iou': {
          min: 0.84,
          why: 'review-art-3 b9: the table and the bottle (r155 0.85)',
        },
      },
    },
    'poses-5': {
      bars: {
        'silhouette.edge/head': {
          max: 14,
          why: 'review-art-3 b3: poses-5 is his front at rest; the poses sheet draws his head larger (r155 12.91)',
        },
        'outline.turns/head': { max: 9, why: 'review-art-3 b3 (r155 8)' },
        'silhouette.edge/body': {
          max: 9,
          why: 'review-art-3 b3: his body 23% wider under the chin on the sheet (r155 8.48)',
        },
        'outline.turns/body': { max: 21, why: 'review-art-3 b3 (r155 20)' },
        'silhouette.iou': { min: 0.86, why: 'review-art-3 b3 (r155 0.87)' },
        'class.iou/teal': { min: 0.55, why: 'review-art-3 b3 (r155 0.59)' },
        'class.iou/skin': {
          min: 0.45,
          why: "review-art-3 b3: his head smaller than the sheet's (r155 0.48)",
        },
      },
    },
  },
  heads: {
    'heads-1': { bars: BUST_BARS, probes: [EAR_PROBE] },
    'heads-2': { bars: BUST_BARS, probes: [CHIN_PROBE, EAR_PROBE] },
    'heads-3': {
      bars: BUST_BARS,
      probes: [{ name: 'mouth', along: 'col', at: 72, from: 140, to: 200, dark: 100 }],
    },
    'heads-4': { bars: BUST_BARS, probes: [EAR_PROBE] },
    'heads-5': { bars: BUST_BARS, probes: [EAR_PROBE] },
    'heads-6': { bars: BUST_BARS, probes: [CHIN_PROBE, EAR_PROBE] },
  },
  single: {
    'single-1': {},
    'single-9': {},
    'single-5': {},
  },
} satisfies Readonly<Record<string, Readonly<Record<string, ViewFit>>>>;

const fitted = (fit: ViewFit, view: CastView): CastView => ({ ...view, fit });

const WINCE: Numbers = { wince: 1, eyes: 0, mouthLine: 0, browY: -5, browTilt: -0.5 };

export const CAST = castTable({
  'lead-feast': {
    turnaround: {
      front: fitted(
        LEAD_FIT.turnaround.front,
        turnaround(LEAD_FRONT, LEAD.leadFeastFront, RIGS.leadFeastFrontProp),
      ),
      threeQuarterLeft: fitted(
        LEAD_FIT.turnaround.threeQuarterLeft,
        turnaround(
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
        ),
      ),
      profileLeft: fitted(
        LEAD_FIT.turnaround.profileLeft,
        turnaround(LEAD_PROFILE_LEFT, LEAD.leadFeastProfileLeft, RIGS.leadFeastProfileLeftProp),
      ),
      back: fitted(
        LEAD_FIT.turnaround.back,
        turnaround(LEAD_BACK, LEAD.leadFeastBack, RIGS.leadFeastBackProp),
      ),
      profileRight: fitted(
        LEAD_FIT.turnaround.profileRight,
        turnaround(LEAD_PROFILE_RIGHT, LEAD.leadFeastProfileRight, RIGS.leadFeastProfileRightProp),
      ),
      threeQuarterRight: fitted(
        LEAD_FIT.turnaround.threeQuarterRight,
        turnaround(
          LEAD_TQ_RIGHT,
          LEAD.leadFeastThreeQuarterRight,
          RIGS.leadFeastThreeQuarterRightProp,
        ),
      ),
    },
    poses: {
      'poses-1': fitted(
        LEAD_FIT.poses['poses-1'],
        pose(LEAD_RAISED.BOX, LEAD_RAISED.FEET, LEAD.leadFeastRaised, RIGS.leadFeastRaisedProp, {
          lean: 0,
          numbers: { mouth: 3 },
          reach: [],
          props: [{ name: 'bottle', draw: bottle([-80, -299]), layer: 'front' }],
        }),
      ),
      'poses-2': fitted(
        LEAD_FIT.poses['poses-2'],
        pose(
          LEAD_DRINKING.BOX,
          LEAD_DRINKING.FEET,
          LEAD.leadFeastDrinking,
          RIGS.leadFeastDrinkingProp,
          {
            lean: 0,
            numbers: {},
            reach: [],
            props: [{ name: 'plate', draw: plate([-55, -360], 0.55), layer: 'held' }],
          },
        ),
      ),
      'poses-3': fitted(
        LEAD_FIT.poses['poses-3'],
        pose(LEAD_SEATED.BOX, LEAD_SEATED.FEET, LEAD.leadFeastSeated, RIGS.leadFeastSeatedProp, {
          lean: 0,
          numbers: {},
          reach: [['far', LEAD_SEATED.HAND_FAR.at]],
          props: [{ name: 'stool', draw: stool(69, 133, -97), layer: 'behind' }],
        }),
      ),
      'poses-4': fitted(
        LEAD_FIT.poses['poses-4'],
        pose(
          LEAD_REACHING.BOX,
          LEAD_REACHING.FEET,
          LEAD.leadFeastReaching,
          RIGS.leadFeastReachingProp,
          {
            lean: 0,
            numbers: { mouth: 3 },
            reach: [],
            props: [
              { name: 'table', draw: table(-152, -73, -146, -113), layer: 'behind' },
              { name: 'bottle', draw: bottle([-112, -146]), layer: 'front' },
            ],
          },
        ),
      ),
      'poses-5': fitted(
        LEAD_FIT.poses['poses-5'],
        pose([1259, 225, 1493, 829], [1382, 829], LEAD.leadFeastFront, RIGS.leadFeastFrontProp, {
          lean: 0,
          numbers: {},
          reach: [
            ['near', [1294, 632]],
            ['far', [1460, 632]],
          ],
          props: [],
        }),
      ),
    },
    heads: {
      'heads-1': fitted(
        LEAD_FIT.heads['heads-1'],
        bust(
          [26, 314, 267, 650],
          [105, 446.5],
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
          { mouth: 3.5 },
        ),
      ),
      'heads-2': fitted(
        LEAD_FIT.heads['heads-2'],
        bust(
          [284, 314, 519, 649],
          [362, 453],
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
          WINCE,
        ),
      ),
      'heads-3': fitted(
        LEAD_FIT.heads['heads-3'],
        bust(
          [530, 314, 763, 650],
          [594, 448],
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
          {
            tilt: 0.22,
            browTilt: 0.4,
            mouth: -0.5,
            mouthY: 12,
            mouthW: 0.76,
          },
        ),
      ),
      'heads-4': fitted(
        LEAD_FIT.heads['heads-4'],
        bust(
          [774, 314, 1014, 650],
          [894, 448.5],
          LEAD_FRONT,
          LEAD.leadFeastFront,
          RIGS.leadFeastFrontProp,
          { mouth: 0 },
        ),
      ),
      'heads-5': fitted(
        LEAD_FIT.heads['heads-5'],
        bust(
          [1025, 313, 1265, 650],
          [1144.5, 452],
          LEAD_FRONT,
          LEAD.leadFeastFront,
          RIGS.leadFeastFrontProp,
          WINCE,
        ),
      ),
      'heads-6': fitted(
        LEAD_FIT.heads['heads-6'],
        bust(
          [1276, 313, 1519, 650],
          [1399, 445.5],
          LEAD_FRONT,
          LEAD.leadFeastFront,
          RIGS.leadFeastFrontProp,
          {
            glad: 1,
            marksY: -11,
            browY: 2,
            eyes: 0,
            mouthLine: 0,
          },
        ),
      ),
    },
  },
});

export const CUTOUT = cutoutTable({
  'lead-feast': {
    turnaround: {
      front: own(LEAD_FIT.turnaround.front, LEAD_PUPPETS.front),
      threeQuarterLeft: own(LEAD_FIT.turnaround.threeQuarterLeft, LEAD_PUPPETS.threeQuarterLeft),
    },
    poses: {
      'poses-1': leadPoses1(LEAD_FIT.poses['poses-1']),
    },
    heads: {
      'heads-4': own(LEAD_FIT.heads['heads-4'], LEAD_PUPPETS['heads-4']),
    },
    single: {
      'single-1': own(LEAD_FIT.single['single-1'], LEAD_PUPPETS['single-1']),
      'single-9': own(LEAD_FIT.single['single-9'], LEAD_PUPPETS['single-9']),
      'single-5': own(LEAD_FIT.single['single-5'], LEAD_PUPPETS['single-5']),
    },
  },
  'feast-mother': {
    turnaround: {
      front: own(undefined, FEAST_MOTHER_PUPPETS.front),
      threeQuarterLeft: own(undefined, FEAST_MOTHER_PUPPETS.threeQuarterLeft),
      back: own(undefined, FEAST_MOTHER_PUPPETS.back),
      profileLeft: own(undefined, FEAST_MOTHER_PUPPETS.profileLeft),
      profileRight: own(undefined, FEAST_MOTHER_PUPPETS.profileRight),
      threeQuarterRight: own(undefined, FEAST_MOTHER_PUPPETS.threeQuarterRight),
    },
    poses: {
      'poses-1': own(undefined, FEAST_MOTHER_PUPPETS['poses-1']),
      'poses-2': own(undefined, FEAST_MOTHER_PUPPETS['poses-2']),
      'poses-3': own(undefined, FEAST_MOTHER_PUPPETS['poses-3']),
    },
  },
  'feast-guest-man': {
    poses: {
      'poses-1': own(undefined, FEAST_GUEST_MAN_PUPPETS['poses-1']),
    },
  },
  'feast-guest-woman': {
    poses: {
      'poses-1': own(undefined, FEAST_GUEST_WOMAN_PUPPETS['poses-1']),
    },
  },
  'filler-bases': {
    poses: {
      'poses-1': own(undefined, FILLER_BASES_PUPPETS['poses-1']),
      'poses-2': own(undefined, FILLER_BASES_PUPPETS['poses-2']),
      'poses-3': own(undefined, FILLER_BASES_PUPPETS['poses-3']),
      'poses-4': own(undefined, FILLER_BASES_PUPPETS['poses-4']),
    },
  },
  'idea-villagers': {
    poses: {
      'poses-3': own(undefined, IDEA_VILLAGERS_PUPPETS['poses-3']),
      'poses-4': own(undefined, IDEA_VILLAGERS_PUPPETS['poses-4']),
      'poses-6': own(undefined, IDEA_VILLAGERS_PUPPETS['poses-6']),
    },
    single: {
      'single-15': own(undefined, IDEA_VILLAGERS_PUPPETS['single-15']),
    },
  },
  jeremiah: {
    heads: {
      'heads-1': own(undefined, JEREMIAH_PUPPETS['heads-1']),
      'heads-2': own(undefined, JEREMIAH_PUPPETS['heads-2']),
      'heads-3': own(undefined, JEREMIAH_PUPPETS['heads-3']),
      'heads-4': own(undefined, JEREMIAH_PUPPETS['heads-4']),
      'heads-5': own(undefined, JEREMIAH_PUPPETS['heads-5']),
      'heads-6': own(undefined, JEREMIAH_PUPPETS['heads-6']),
    },
  },
  paul: {
    heads: {
      'heads-1': own(undefined, PAUL_PUPPETS['heads-1']),
      'heads-2': own(undefined, PAUL_PUPPETS['heads-2']),
      'heads-3': own(undefined, PAUL_PUPPETS['heads-3']),
      'heads-4': own(undefined, PAUL_PUPPETS['heads-4']),
      'heads-5': own(undefined, PAUL_PUPPETS['heads-5']),
      'heads-6': own(undefined, PAUL_PUPPETS['heads-6']),
    },
  },
  sower: {
    turnaround: {
      front: own(undefined, SOWER_PUPPETS.front),
      threeQuarterLeft: own(undefined, SOWER_PUPPETS.threeQuarterLeft),
      back: own(undefined, SOWER_PUPPETS.back),
      profileLeft: own(undefined, SOWER_PUPPETS.profileLeft),
      profileRight: own(undefined, SOWER_PUPPETS.profileRight),
      threeQuarterRight: own(undefined, SOWER_PUPPETS.threeQuarterRight),
    },
    poses: {
      'poses-1': own(undefined, SOWER_PUPPETS['poses-1']),
      'poses-2': own(undefined, SOWER_PUPPETS['poses-2']),
      'poses-3': own(undefined, SOWER_PUPPETS['poses-3']),
      'poses-4': own(undefined, SOWER_PUPPETS['poses-4']),
    },
  },
  'villager-child': {
    poses: {
      'poses-5': own(undefined, CHILD_PUPPETS['poses-5']),
    },
  },
  'villager-toddler': {
    poses: {
      'poses-1': own(undefined, TODDLER_PUPPETS['poses-1']),
      'poses-2': own(undefined, TODDLER_PUPPETS['poses-2']),
    },
  },
});

export const EASES = {
  'lead-feast': { raise: LEAD_RAISE },
};
