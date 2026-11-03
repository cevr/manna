import type { LabelTable } from '@manna/film/tools';

const SKIN = ['skin'];

const MANTLE = 'His mantle: the largest run of teal, a teal sleeve with it.';

const FACE = { face: { classes: SKIN, doc: 'His face: the largest run of his skin.' } } as const;

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

const TURNED = { ...FACE, ...HANDS } as const satisfies LabelTable;

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

const PROFILE = {
  ...FACE,
  mantle: { classes: ['teal'], compared: false, doc: MANTLE },
  hand: {
    classes: SKIN,
    where: [{ below: 'face' }, { touching: 'mantle' }],
    doc: 'His hand: the skin below his face against his mantle.',
  },
} as const satisfies LabelTable;

const PROFILE_LEFT = {
  ...PROFILE,
  sleeve: {
    classes: ['teal'],
    compared: false,
    doc: 'His sleeve: his mantle, the largest run of teal, with no line between them; the tracer cuts it out by its polygon.',
  },
} as const satisfies LabelTable;

const PROFILE_RIGHT = {
  ...PROFILE,
  sleeve: {
    classes: ['cream'],
    where: [{ below: 'face' }, { above: 'hand' }],
    doc: 'His sleeve: the largest cream below his face, above his hand.',
  },
} as const satisfies LabelTable;

export const LABELS = {
  front: FRONT,
  threeQuarterLeft: TURNED,
  profileLeft: PROFILE_LEFT,
  back: BACK,
  profileRight: PROFILE_RIGHT,
  threeQuarterRight: TURNED,
} as const satisfies Readonly<Record<string, LabelTable>>;
