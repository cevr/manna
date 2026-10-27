// The series lead's part labels (`core/label.ts`): each part his turnaround's
// views pick by colour class and by where it lies against another part, in
// place of a seed in the sheet's pixels (`trace.ts`). His face is the largest
// region of his skin; his hands the skin below it, to either side of it or
// against the garment they come out of; his ears the skin beside it, against
// it. From behind, his head's paper is his hair and his neck the skin against
// it. In profile, his hand is the skin against his mantle, and the sleeve it
// comes out of the mantle's teal (screen left) or the cream above his hand
// (screen right). Measured: each label picks the region the seed it replaced
// picked, and every table traced from them is the seeded one, byte for byte
// (`labels.slow.test.ts`). A region the sheet runs on into another part
// with no line between them (his mantle and a sleeve, his robe and a sleeve)
// is read for other labels' rules, and compared on a render by no fit row
// (`compared: false`). Pure.

import type { LabelTable } from '@manna/film/tools';

const SKIN = ['skin'];

/** His mantle's teal runs on into a sleeve of it with no line between them, where a render draws them apart: a label for other labels' rules, compared by no fit row. */
const MANTLE = 'His mantle: the largest run of teal, a teal sleeve with it.';

/** His face: the largest region of his skin, on every view that shows it. */
const FACE = { face: { classes: SKIN, doc: 'His face: the largest run of his skin.' } } as const;

/** His hands from in front or turned: the skin below his face, each to its side of it. */
const HANDS = {
  handNear: {
    classes: SKIN,
    where: [{ below: 'face' }, { left: 'face' }],
    doc: 'His near hand: the largest skin below his face, to its left.',
  },
  handFar: {
    classes: SKIN,
    where: [{ below: 'face' }, { right: 'face' }],
    doc: 'His far hand: the largest skin below his face, to its right.',
  },
} as const;

/** From in front: his face, his ears beside it and against it, his hands. */
const FRONT = {
  ...FACE,
  earNear: {
    classes: SKIN,
    where: [{ left: 'face' }, { touching: 'face' }],
    doc: 'His near ear: the skin against his face, to its left.',
  },
  earFar: {
    classes: SKIN,
    where: [{ right: 'face' }, { touching: 'face' }],
    doc: 'His far ear: the skin against his face, to its right.',
  },
  ...HANDS,
} as const satisfies LabelTable;

/** Turned three-quarters: his face (his ear's skin runs on into it, so the ear is his face's region), his hands. */
const TURNED = { ...FACE, ...HANDS } as const satisfies LabelTable;

/**
 * From behind: his head's paper is his hair, the largest of it; his neck the
 * skin against it; his ears the skin above his neck, either side of it; his
 * hands the skin below it, each against the sleeve it comes from (the
 * mantle's teal on screen left, the cream on screen right), so neither of his
 * heels, as large, is read.
 */
const BACK = {
  face: { classes: ['hair'], doc: "His head's paper from behind: the largest run of his hair." },
  neck: {
    classes: SKIN,
    where: [{ touching: 'face' }],
    doc: 'His neck: the skin against his hair.',
  },
  earNear: {
    classes: SKIN,
    where: [{ above: 'neck' }, { left: 'neck' }],
    doc: 'His near ear: the skin above his neck, to its left.',
  },
  earFar: {
    classes: SKIN,
    where: [{ above: 'neck' }, { right: 'neck' }],
    doc: 'His far ear: the skin above his neck, to its right.',
  },
  mantle: { classes: ['teal'], compared: false, doc: MANTLE },
  robe: {
    classes: ['cream'],
    compared: false,
    doc: 'His cream: the largest run of it, his robe and a sleeve with no line between them.',
  },
  handNear: {
    classes: SKIN,
    where: [{ below: 'neck' }, { left: 'neck' }, { touching: 'mantle' }],
    doc: 'His near hand: the skin below his neck, to its left, against his mantle.',
  },
  handFar: {
    classes: SKIN,
    where: [{ below: 'neck' }, { right: 'neck' }, { touching: 'robe' }],
    doc: 'His far hand: the skin below his neck, to its right, against his cream.',
  },
} as const satisfies LabelTable;

/** In profile: his face (his ear's skin runs on into it), his mantle, and his one hand, the skin below his face against his mantle. */
const PROFILE = {
  ...FACE,
  mantle: { classes: ['teal'], compared: false, doc: MANTLE },
  hand: {
    classes: SKIN,
    where: [{ below: 'face' }, { touching: 'mantle' }],
    doc: 'His hand: the skin below his face against his mantle.',
  },
} as const satisfies LabelTable;

/** In profile to screen left, his sleeve is his mantle's teal. */
const PROFILE_LEFT = {
  ...PROFILE,
  sleeve: {
    classes: ['teal'],
    compared: false,
    doc: 'His sleeve: his mantle, the largest run of teal, with no line between them; the tracer cuts it out by its polygon.',
  },
} as const satisfies LabelTable;

/** In profile to screen right, his sleeve is the cream between his face and his hand. */
const PROFILE_RIGHT = {
  ...PROFILE,
  sleeve: {
    classes: ['cream'],
    where: [{ below: 'face' }, { above: 'hand' }],
    doc: 'His sleeve: the largest cream below his face, above his hand.',
  },
} as const satisfies LabelTable;

/** Each turnaround view's labels. */
export const LABELS = {
  front: FRONT,
  threeQuarterLeft: TURNED,
  profileLeft: PROFILE_LEFT,
  back: BACK,
  profileRight: PROFILE_RIGHT,
  threeQuarterRight: TURNED,
} as const satisfies Readonly<Record<string, LabelTable>>;
