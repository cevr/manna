// In Its Order's cast render (`film concept render in-its-order <member>`):
// each kept view of the sheets of the members `cold` casts, drawn by its rig
// in its pose (`CAST`), on the film's paper (`PAPER`), each sheet at its one
// scale (`SHEETS`, sheet pixels a canon unit, from the member's anchor view
// on that sheet). A standing view's rig stands with its feet where the sheet
// draws them on its ground line; a bust (a heads view) lies with its eyes'
// middle where the sheet draws it. A posed hand reaches to where the sheet
// lays it (`armReach`), and the host draws each circle hand at its cuff
// where the numbers put it (`tracedHands`); the props the sheet draws lie
// where it draws them (`../props.ts`). Each view's rig declares the kept
// view it is held to (`concept`: its sheet and box). `cast.test.ts` holds the
// table to the members' records: every kept view, no other, each in its kept
// box. Pure.

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

/** A traced composition, as `tracedFigure` gives it. */
type Composed = ReturnType<typeof tracedFigure>;

/** The film's paper, as its page lays it (`film.ts`). */
export const PAPER = { base: palette.paper, tone: palette.paperTone, seed: 1844 } as const;

/** A paper's colours: its own, its shade and its light. */
const coloursOf = (
  ...ps: ReadonlyArray<{ readonly color: string; readonly shade?: string; readonly light?: string }>
) =>
  ps.flatMap((p) => [
    p.color,
    ...(p.shade === undefined ? [] : [p.shade]),
    ...(p.light === undefined ? [] : [p.light]),
  ]);

/**
 * The sower's colour classes, each sample the 3 by 3 median of his kept
 * views' own pixels (`cast-sheet/views/<view>.png`, x,y in the view): his
 * linen tunic (front 127,420 127,480 35,300 127,230 100,500; poses-1 120,215
 * 220,450 330,250), his olive mantle, lit and shaded (front 70,300 75,370
 * 160,285 170,300 185,260 200,300; poses-1 185,300 275,300), his walnut bag
 * and strap (front 195,380 180,400; poses-1 285,410 300,390 320,400 225,240
 * 250,300) and his skin (front 100,95 128,70 30,360 228,365 160,100; poses-1
 * 30,210 360,360 200,130 225,110). His belt (#684430) is darker than luma 90,
 * so it reads as his line and is no class.
 */
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

/**
 * The feast mother's colour classes, each sample the 3 by 3 median of her
 * kept views' own pixels (`cast-sheet/views/<view>.png`, x,y in the view):
 * her dusty-blue robe and sleeves, lit and shaded (front 60,300 40,450 80,520
 * 150,350 160,450 120,500; back 108,450 60,450 160,450; poses-1 30,380 280,380
 * 280,450; poses-3 100,600 230,650 120,300 260,550), her cream veil with the
 * baby's swaddle, and the veil's warm shade (front 28,200 45,140 190,220
 * 60,170 170,170; back 108,150 60,200 150,200; poses-1 100,350 170,440
 * 300,240; poses-3 200,350 250,340 180,340 270,330 70,250 60,280), and her
 * skin with the baby's (front 100,120 120,110 28,380 186,375 70,100; poses-3
 * 250,240 150,150 225,410). The veil and the swaddle are one class: their
 * colours lie within a few units of each other (#f8e4c7 against #f6ddbd), so
 * two classes would split one colour. Her hair (#291309) is darker than luma
 * 90, so it reads as her line and is no class; the clay cup of poses-1 is
 * too small a patch for a class of its own and counts as its nearest.
 */
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

/**
 * The villagers' colour classes, read off their kept poses sheet (the child's
 * poses-5, the toddler's poses-1 and poses-2; x,y in the view's crop): their
 * linen tunic and its warm shade (child 156,281 199,140 120,290 104,326
 * 87,202; toddler poses-1 177,196 156,146 145,128 105,138 87,178, poses-2
 * 80,194 117,154 60,221 65,146), their skin (child 59,271 97,52 95,91 70,95
 * 124,117; toddler poses-1 227,115 104,53 35,52, poses-2 126,44 86,43 46,82),
 * the lavender of their ground shadow (child 112,386 109,387 119,385 189,384
 * 195,385; toddler poses-2 101,241 80,240 68,239 160,230) and their sandals'
 * lit leather (child 133,370 131,369 143,354; toddler poses-1 216,233 215,233
 * 214,267, poses-2 30,203 132,207 41,209). Their hair (#341c15, #312218) is
 * darker than luma 90, so it reads as their line and is no class. The
 * shadow's pale feathered edge is not a sample: the cool white halo round
 * their outline (#d9d1c5 to #f2f0f1, which the un-matte clears) lies nearer
 * it than the linen, so samples there would class that halo as shadow
 * (measured: 58 px on the toddler's poses-1, which has no ground shadow).
 */
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

/**
 * The IDEA villagers' colour classes, each sample the 3 by 3 median of their
 * kept views' own pixels (`cast-sheet/views/<view>.png`, x,y in the view):
 * their linen, the grown villager's headcloth and tunic with the baby's wrap,
 * lit and in its warm shade (poses-3 181,13 191,9 189,11 213,19 145,25
 * 225,165; poses-4 75,123 67,117 123,121; poses-6 109,9 93,9 139,19 141,19
 * 133,21), the linen's far side turned toward violet with the baby's violet
 * ground shadow (poses-3 215,163 209,163 215,169; poses-4 107,117 51,195
 * 9,191; poses-6 133,151 177,205 155,299), and their skin, lit and shaded
 * (poses-3 199,59 183,59 201,59; poses-4 87,23 109,19 85,19 101,21; poses-6
 * 101,55 91,55 109,55). Every view holds all three. Their hair, beard and the
 * sandals' leather lie at or under luma 90, so they read as the line and are
 * no class; the baby's small brown tuft counts as its nearest.
 */
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

/**
 * Paul's colour classes, each sample the 3 by 3 median of his kept heads
 * views' own pixels (`library/cast/paul/cast-sheet/views/heads-<n>.png`,
 * x,y in the view, heads-1 to heads-6 in order). Every view holds all four.
 * Line is luma under 90 (his outline and his eyes), so it is no class.
 * - `skin`: his face and bald crown, lit, in shade, and the crown's light
 *   (125,13 153,17 107,11; 109,11 123,19 79,15; 109,11 137,25 95,13; 129,13
 *   157,29 119,13; 131,13 147,21 99,13; 133,13 163,31 113,13).
 * - `mantle`: his slate-blue cloak over the shoulders, lit and its far side
 *   turned toward violet (61,247 179,221; 59,247 193,219; 65,255 173,227;
 *   63,247 181,239; 59,257 181,241; 69,251 189,247).
 * - `tunic`: the linen V at his collar, lit and in shade (81,261 133,267;
 *   101,253 137,261; 79,267 129,269; 83,265 133,275; 83,263 139,277; 83,259
 *   103,275).
 * - `hair`: his grey-brown beard and the brown hair at the sides of his head
 *   (57,157 193,135; 83,183 17,109; 41,165 31,45; 53,153 81,17; 57,149
 *   49,137; 53,139 109,11). Both lie above luma 100, so they are not line, and
 *   without their own class each pixel would count as the cloak's or skin's.
 */
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

/**
 * Jeremiah's colour classes, each sample the 3 by 3 median of his kept heads
 * views' own pixels (`library/cast/jeremiah/cast-sheet/views/heads-<n>.png`,
 * x,y in the view, heads-1 to heads-6 in order). Every view holds all three.
 * Line is luma under 90 (his outline, his eyes and his dark beard), so it is
 * no class. His paper is 252,243,226; the headcloth's lightest edge lies
 * within 15 of it, so no sample is taken there.
 * - `linen`: his headcloth, lit and on its shaded hanging side, and the linen
 *   V of his tunic at the collar (133,15 185,90 125,280; 121,15 185,90
 *   125,280; 115,17 175,60 125,280; 123,15 185,90 125,280; 133,15 185,90
 *   125,280; 113,15 185,90 125,280).
 * - `skin`: his face, lit and in shade (77,79 123,91; 67,113 123,107; 61,75
 *   127,97; 117,79 160,95; 117,69 160,95; 115,79 160,95).
 * - `olive`: the grey-olive band round his headcloth, in shade and lit, and
 *   his robe over the shoulders, lit and in shade. Band and robe are one
 *   paint, so they are one class (95,39 79,47 75,229 197,249; 151,57 109,65
 *   79,222 201,236; 115,43 91,39 71,228 169,240; 129,43 75,53 77,226 201,248;
 *   119,35 91,35 67,232 201,250; 105,47 85,43 67,232 201,252).
 */
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

/**
 * Each member's colour classes for his fit rows (`film concept render`): a
 * class's samples on his kept sheets, and the papers and tones that paint it
 * on his rigs. His hair and its brown read as his line (darker than luma
 * 90), so it is no class.
 */
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

/** Every kept sheet of many views is drawn 1536 by 1024. */
const SHEET = { width: 1536, height: 1024 } as const;

/** A kept single drawing, one figure on the page, is drawn 1024 by 1536. */
const SINGLE = { width: 1024, height: 1536 } as const;

/** The series lead on his turnaround: his front, hair to soles 440 units (`lead.ts`). */
const LEAD_TURNAROUND = 1 / LEAD.SHEETS.turnaround.scale;

/** The series lead on his single-1: his front, bottle raised, hair (row 109) to soles (row 1382, his kept box) 1273 rows, 440 units. */
const LEAD_SINGLE = (1382 - 109) / 440;

/** The sower on his turnaround: his front's ink, crown to soles, is 549 rows, 440 units. */
const SOWER_TURNAROUND = 549 / 440;

/** The sower on his poses: poses-4, his front standing, crown to soles 586 rows, 440 units. */
const SOWER_POSES = 586 / 440;

/** The villagers on their one poses sheet: its view 6, the grown villager standing at rest, ink crown to soles 516 rows (250 to 765), 440 units. */
const VILLAGER_POSES = 516 / 440;

/** The feast mother on her turnaround: her front's ink, crown to soles, is 600 rows (194 to 793), 440 units. */
const FEAST_MOTHER_TURNAROUND = 600 / 440;

/** The feast mother on her poses: poses-3, her front standing with the baby, ink crown to soles 814 rows (97 to 910), 440 units. */
const FEAST_MOTHER_POSES = 814 / 440;

/** The IDEA villagers on their poses sheet: poses-6, the grown villager standing at rest, ink crown to soles 512 rows (248 to 759, his kept box), 440 units. */
const IDEA_VILLAGERS_POSES = 512 / 440;

/**
 * The bust scale of a heads sheet, read off the lead's: his busts have no
 * feet, so it is 1.13 of his turnaround's, the mean of his eyes' spacing (52
 * px on heads-4 against 46.5 on the turnaround's front) and his head's width
 * across his ears at his eyes' row (185 px against 162).
 *
 * Paul's heads sheet takes it too: his busts have no rig, so no view of his is
 * a canon anchor, and his sheet shares the lead's bust framing (each bust
 * crown to cut 297 to 313 rows). Jeremiah's heads sheet takes it as well: his
 * busts have no rig either, so no view of his is a canon anchor. The cut-out
 * page reads only the sheet's size.
 */
const HEADS_BUST = LEAD_TURNAROUND * 1.13;

/**
 * Each member's sheets: their size and one scale, sheet pixels a canon unit,
 * each read off the sheet's anchor view. The lead's poses: poses-5, his
 * front at rest, hair (row 225) to soles (row 829) 440 units. His heads,
 * Paul's and Jeremiah's: the bust scale (`HEADS_BUST`).
 */
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
  'idea-villagers': {
    poses: { ...SHEET, scale: IDEA_VILLAGERS_POSES },
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

/** A still pose: the breath at rest, the paper's boil at its first tick, the numbers given. */
const still = (numbers: Numbers) => ({
  timelines: [
    ['breath', 0],
    ['boil', boilTime(0)],
  ] as const,
  numbers,
});

/** `p` turned `by` radians about the origin. */
const turned = ([x, y]: Pt, by: number): Pt => [
  x * Math.cos(by) - y * Math.sin(by),
  x * Math.sin(by) + y * Math.cos(by),
];

/** A hand the sheet lays at a point, sheet pixels: which arm's, and where its elbow bends (`armReach`; at rest's side unless given). */
type Reach = readonly ['near' | 'far', Pt] | readonly ['near' | 'far', Pt, 'out'];

/** One kept view as the render draws it. */
interface ViewSpec {
  readonly member: 'lead-feast';
  readonly kind: keyof (typeof SHEETS)['lead-feast'];
  readonly box: Box;
  /** Where the rig's origin (his feet) stands, sheet pixels. */
  readonly at: Pt;
  readonly composed: Composed;
  readonly rig: CastView['rig'];
  readonly hand: CastView['rig'];
  /** His lean, radians, and the rest of his numbers (his face's, his head's). */
  readonly lean: number;
  readonly numbers: Numbers;
  /** The hands the sheet lays away from his sides: each arm reaches there. */
  readonly reach: ReadonlyArray<Reach>;
  readonly props: ReadonlyArray<CastProp>;
}

/**
 * A view: its rig in its kept box at `at`, held to that box of its sheet
 * (`concept`), each reaching arm's numbers those that take its hand to where
 * the sheet lays it (its lean undone first, since the host leans the hand
 * after), its two circle hands at its cuffs.
 */
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

/** A traced view's place on its own sheet: its kept box and its feet. */
interface Placed {
  readonly BOX: Box;
  readonly FEET: Pt;
}

const LEAD_HAND = RIGS.leadFeastHandProp;

/** A turnaround view of the lead: his rig at rest, standing where the sheet draws him. */
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

/** A pose of the lead on his poses sheet: his feet at `at` on its ground line. */
const pose = (
  box: Box,
  at: Pt,
  composed: Composed,
  rig: CastView['rig'],
  p: Pick<ViewSpec, 'lean' | 'numbers' | 'reach' | 'props'>,
): CastView =>
  view({ member: 'lead-feast', kind: 'poses', box, at, composed, rig, hand: LEAD_HAND, ...p });

/** A traced table's eyes' middle, sheet pixels. */
const eyesOf = (marks: { readonly eyes: readonly [Pt, Pt] }): Pt => [
  (marks.eyes[0][0] + marks.eyes[1][0]) / 2,
  (marks.eyes[0][1] + marks.eyes[1][1]) / 2,
];

/**
 * A bust of the lead on his heads sheet: his rig with its eyes' middle where
 * the sheet draws it (`eyes`, sheet pixels), his feet that far below at the
 * heads sheet's scale, his face's numbers `numbers`.
 */
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

/**
 * A probe across a feature review-art-3 measured (`review-art-3-receipts/
 * probes-155.txt`), crop pixels, at the review's own line and darkness: his
 * chin's line down x 120 (luma under 135), his near ear's outer edge along
 * row 155 (under 90).
 */
const CHIN_PROBE = { name: 'chin', along: 'col', at: 120, from: 150, to: 260, dark: 135 } as const;
const EAR_PROBE = { name: 'earLeft', along: 'row', at: 155, from: 20, to: 80, dark: 90 } as const;

/**
 * Why a bust's rows are held to the busts' bars: review-art-3's b2, kept
 * ready on render 155. Each bust is his turnaround rig at the heads sheet's
 * scale (7 to 8% wide, his shoulders narrow, his sash at his neck, his cream
 * garment read teal), not a bust rig of its own: a follow-up.
 */
const BUST_WHY = "review-art-3 b2: the bust is his turnaround rig, not a bust rig (r155's values)";

/**
 * The busts' bars, each just past the widest the four busts review-art-3
 * kept ready read on render 155 (heads-1, 2, 4 and 5): his head band's edge
 * 8.17 (heads-2), its turn 22 (heads-2), his body's edge 10.18 (heads-1),
 * the overlap 0.81 (heads-5), thin paper 82 px (heads-5's chevrons), his
 * cream 0.01 (heads-5). A bust's own defect is its probe's: heads-3's frown,
 * heads-6's chin and ear.
 */
const BUST_BARS = {
  'silhouette.edge/head': { max: 9, why: BUST_WHY },
  'outline.turns/head': { max: 23, why: BUST_WHY },
  'silhouette.edge/body': { max: 11, why: BUST_WHY },
  'silhouette.iou': { min: 0.8, why: BUST_WHY },
  slivers: { max: 90, why: BUST_WHY },
  'class.iou/cream': { min: 0, why: BUST_WHY },
} as const;

/** Why the front's near ear is held to no part bar: the render lays its band to the ear's lobe alone, so the ear's skin runs on into his cheek under it and is his face's region (r155, keep-ready in review-art-3; the band's place is held by B1's `earLeft` probe on the busts). */
const NEAR_EAR_WHY =
  "the render's near ear runs on into his cheek under its band, so it is his face's region (r155; review-art-3 B1 kept the band)";

/** Why the three-quarter left's near hand is held looser: the house draws a hand as a whole circle (CRAFT, circle hands) where the sheet hides its far side behind his sleeve's shade. */
const CIRCLE_HAND_WHY =
  'a circle hand (CRAFT) over the hand the sheet half hides in shade (r155 0.5 and 5.78; review-art-3 kept the view)';

/** A view's own fit: its labels, its probes and its bars, each with why (`CastView.fit`). */
type ViewFit = NonNullable<CastView['fit']>;

/**
 * The lead's views' own fits, by kind and view: the busts' bars and probes,
 * each pose's bars where review-art-3 kept it ready with a difference he is
 * shown (its value on render 155 just inside), and the probes on what
 * review-art-3 measured wrong (poses-3's seat and chest fold, heads-3's
 * frown, heads-6's chin and ear).
 */
const LEAD_FIT = {
  // Each turnaround view's part rows, by the labels his tables are traced from (`labels.ts`). From behind, his head's label is his hair, which the fit rows read as his line (no fit class), so his head's, neck's, ears' and hands' rows fail as unresolved on both crops, and his back's critique waits, until his back has labels the fit classes read.
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
        // a1: the stool's line under his torso, read across the seat; a2: the "A" bar on his chest (luma under 160, the review's #).
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
    // a5: the frown, down x 72 above his chin (luma under 100).
    'heads-3': {
      bars: BUST_BARS,
      probes: [{ name: 'mouth', along: 'col', at: 72, from: 140, to: 200, dark: 100 }],
    },
    'heads-4': { bars: BUST_BARS, probes: [EAR_PROBE] },
    'heads-5': { bars: BUST_BARS, probes: [EAR_PROBE] },
    // a4: the nod that cut his ears and raised his chin's line.
    'heads-6': { bars: BUST_BARS, probes: [CHIN_PROBE, EAR_PROBE] },
  },
  // His single drawing, bottle raised: the member's bars as they stand, and no labels yet, so its rows are the silhouette's and the classes'.
  single: {
    'single-1': {},
  },
} satisfies Readonly<Record<string, Readonly<Record<string, ViewFit>>>>;

/** `view` with its own fit (`CastView.fit`). */
const fitted = (fit: ViewFit, view: CastView): CastView => ({ ...view, fit });

/** A wince: his eyes squeezed shut as `>` `<`, his brows knit, his mouth a wavering line. */
const WINCE: Numbers = { wince: 1, eyes: 0, mouthLine: 0, browY: -5, browTilt: -0.5 };

/** Each member's kept views, by kind and view name, as the render draws them. */
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
      // Three-quarters left, his near arm raised with the bottle at his shoulder's height: his raised composition, its sleeve and his rolled head as the sheet draws them.
      'poses-1': fitted(
        LEAD_FIT.poses['poses-1'],
        pose(LEAD_RAISED.BOX, LEAD_RAISED.FEET, LEAD.leadFeastRaised, RIGS.leadFeastRaisedProp, {
          lean: 0,
          numbers: { mouth: 3 },
          reach: [],
          // The bottle in front of his fist, its foot at the sheet's (70, 418).
          props: [{ name: 'bottle', draw: bottle([-80, -299]), layer: 'front' }],
        }),
      ),
      // In profile to the left, both hands up, his head tipped back, the plate at his mouth.
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
            // The plate's rim at his lips (the sheet's 397, 337), the dish out before his face; held: over his sleeves, under his hands.
            props: [{ name: 'plate', draw: plate([-55, -360], 0.55), layer: 'held' }],
          },
        ),
      ),
      // Seated on the stool, three-quarters left, his near hand at his chin, his far hand on his lap.
      'poses-3': fitted(
        LEAD_FIT.poses['poses-3'],
        pose(LEAD_SEATED.BOX, LEAD_SEATED.FEET, LEAD.leadFeastSeated, RIGS.leadFeastSeatedProp, {
          lean: 0,
          numbers: {},
          // His near arm is the raised sleeve the sheet draws, its hand at his chin as traced (`leadFeastSeated`): it reaches nowhere.
          reach: [['far', LEAD_SEATED.HAND_FAR.at]],
          // The stool behind him, its seat's top on the sheet's line (row 703) and running in under his mantle; its front leg beside his robe's side (x 803-825) and its far one at x 855-877, where the sheet draws them.
          props: [{ name: 'stool', draw: stool(69, 133, -97), layer: 'behind' }],
        }),
      ),
      // Three-quarters left, leaning to the low table, his near hand on the bottle there: his reaching composition, its sleeve as the sheet draws it.
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
            // The table's top at the sheet's row 617 from its left end to 1007, its leg at 952; the bottle on it, its middle at 953, in front of his hand.
            props: [
              { name: 'table', draw: table(-152, -73, -146, -113), layer: 'behind' },
              { name: 'bottle', draw: bottle([-112, -146]), layer: 'front' },
            ],
          },
        ),
      ),
      // His front at rest.
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
      // Three-quarters left: glad, a warm smile.
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
      // Three-quarters left: a wince.
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
      // Three-quarters left, his head tipped: worried, his brows' inner ends up, his mouth turned down.
      'heads-3': fitted(
        LEAD_FIT.heads['heads-3'],
        bust(
          [530, 314, 763, 650],
          // Where the sheet draws his eyes' middle less the 21 px his roll swings them right of his rig's (eyes 57-67 and 102-114 against the render's 80-89 and 122-133 at 615): his head inside its box.
          [594, 448],
          LEAD_TQ_LEFT,
          LEAD.leadFeastThreeQuarterLeft,
          RIGS.leadFeastThreeQuarterLeftProp,
          {
            // Rolled 13°, as the sheet's head is.
            tilt: 0.22,
            browTilt: 0.4,
            // His frown short and near flat, where the sheet draws it (rows 178-188 at x 65-80), under the line his rig's mouth lies on: 0.22 of his eyes' spacing wide.
            mouth: -0.5,
            mouthY: 12,
            mouthW: 0.76,
          },
        ),
      ),
      // His front: plain, his mouth level.
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
      // His front: a wince.
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
      // His front: glad, his eyes shut in a smile and the glad mark's wide smile in place of his mouth's line, his face turned up as the sheet draws it: his marks lifted inside a head that holds the bust's place (`marksY`), so his chin's line and his ears stay where the sheet draws them.
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
            // His brows 3 px back down, under the fringe his rig's hair hangs lower than the sheet's.
            browY: 2,
            eyes: 0,
            mouthLine: 0,
          },
        ),
      ),
    },
  },
});

/**
 * The views a member has a puppet for (`film concept render --figure
 * cutout`): each kept view his part sheet's puppet at rest (`own`), standing
 * where the kept view stands, and each pose view his fitted puppet
 * (`fitted`), held to the same fit rows as his rig's view. `CAST` is the
 * rigs' table, unchanged beside it.
 */
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
  'idea-villagers': {
    poses: {
      'poses-3': own(undefined, IDEA_VILLAGERS_PUPPETS['poses-3']),
      'poses-4': own(undefined, IDEA_VILLAGERS_PUPPETS['poses-4']),
      'poses-6': own(undefined, IDEA_VILLAGERS_PUPPETS['poses-6']),
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

/** Each member's eases (`film concept ease`): the lead's bottle raise, drawn from keys. */
export const EASES = {
  'lead-feast': { raise: LEAD_RAISE },
};
