import { describe, expect, test } from 'bun:test';
import { type Body, type Standing, standing } from './skeleton.ts';

/** A member whose part sheets have no sash: his flaps come from a part named `body`. */
const PARTS = ['head', 'body', 'sleeveRight', 'sleeveLeft', 'robe'] as const;
const BODY: Body = {
  skin: {
    head: ['neck', 'head'],
    body: ['lean'],
    sleeveRight: ['shoulderRight', 'elbowRight', 'wristRight', 'lean'],
    sleeveLeft: ['shoulderLeft', 'elbowLeft', 'wristLeft', 'lean'],
  },
  arms: { right: 'sleeveRight', left: 'sleeveLeft' },
  from: 'body',
  band: { above: 20, below: 5, reach: 30 },
};

const at = (facing: Standing['facing']): Standing => ({
  facing,
  hip: [50, 150],
  neck: [50, 80],
  chin: [50, 70],
  crown: [50, 10],
  shoulderRight: [20, 90],
  elbowRight: [18, 120],
  wristRight: [16, 150],
  handRight: [16, 160],
  shoulderLeft: [80, 90],
  elbowLeft: [82, 120],
  wristLeft: [84, 150],
  handLeft: [84, 160],
  flapRight: 30,
  flapLeft: 70,
  capRight: 6,
  capLeft: 6,
});

const xs = (region: ReadonlyArray<readonly [number, number]>) => [
  Math.min(...region.map((p) => p[0])),
  Math.max(...region.map((p) => p[0])),
];

describe('a standing skeleton', () => {
  test("names only the member's parts: his skin, his arms and the part his flaps come from", () => {
    const made = standing(BODY, at('front'));
    const named = [
      ...Object.keys(made.skin),
      ...(made.flaps ?? []).flatMap((f) => [f.part, f.from]),
    ];
    expect(named.filter((n) => !(PARTS as ReadonlyArray<string>).includes(n))).toEqual([]);
    expect((made.flaps ?? []).map((f) => [f.part, f.from])).toEqual([
      ['sleeveRight', 'body'],
      ['sleeveLeft', 'body'],
    ]);
  });

  test("lays each flap in the member's band about its shoulder", () => {
    const [right, left] = standing(BODY, at('front')).flaps ?? [];
    expect(right?.region).toEqual([
      [-1, 70],
      [30, 70],
      [30, 95],
      [-1, 95],
    ]);
    expect(xs(left?.region ?? [])).toEqual([70, 110]);
  });

  test("mirrors the flaps from the back: his right arm on the viewer's right reaches out by the band", () => {
    const back: Standing = {
      ...at('back'),
      shoulderRight: [80, 90],
      shoulderLeft: [20, 90],
      flapRight: 70,
      flapLeft: 30,
    };
    const [right, left] = standing(BODY, back).flaps ?? [];
    expect(xs(right?.region ?? [])).toEqual([70, 110]);
    expect(xs(left?.region ?? [])).toEqual([-1, 30]);
  });
});
