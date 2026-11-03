import {
  type ComposedFigure,
  type Parts,
  type SeatedParts,
  type StandingParts,
  isSeated,
} from '../figure.ts';
import { type Paper, looked, paper } from '../paper.ts';
import { ARM_SIDES, type AnyArm, type Arm, type ArmSide, type JointedArm } from '../parts/arm.ts';
import type { Beard } from '../parts/beard.ts';
import { type Garment, tonesOn } from '../parts/body.ts';
import type { Ear } from '../parts/ear.ts';
import type { Feet, Sandals, Shoes, StubLegs, Trousers } from '../parts/feet.ts';
import type { Hair } from '../parts/hair.ts';
import type { Headcloth } from '../parts/headcloth.ts';
import type { RoundHead, TracedHead } from '../parts/head.ts';
import type { KitA } from '../parts/kit.ts';
import type { OpenMouth } from '../parts/mouth.ts';
import type { Bands } from '../parts/over.ts';
import type { Seated, Standing } from '../parts/stance.ts';
import type { GivenRobe, Stain } from '../parts/states.ts';
import {
  type Figure,
  type Part,
  type PieceLook,
  type Pt,
  artboard,
  boilTimeline,
  ellipse,
  faceKit,
  gazeTarget,
  hand,
  kitMarks,
  piece,
  silhouette,
  timeline,
} from './parts.ts';
import { type Element, el } from './rml.ts';
import {
  blotOutline,
  garmentOutline,
  roundedPolygon,
  shifted,
  shoeLight,
  shoeOutline,
  tucked,
  tuckedRimmed,
} from './shapes.ts';

const KEY = { y: 14, rotation: 15, scaleY: 17, opacity: 18 } as const;

const ROUND_POINTS = 22;

const EAR_POINTS = 12;

const MOUTH_POINTS = 16;

const STAIN_WANDER = 0.07;

const LEG_TUCK = 16;

const FOOT_POINTS = 9;

const SMALL_BOIL = 0.6;

const BAND_BOIL = 0.5;

const BAND_CORNER = 2;

const TUCK_UNDER_RIM = 2;

const SOLE = { depth: 6.5, past: 4, under: 4 } as const;

const EYES: ReadonlySet<unknown> = new Set(['eyeL', 'eyeR']);

const leanEyes = (node: Element, lean: number): Element => {
  const named = node.attrs.find(([k]) => k === 'name')?.[1];
  const attrs = Object.fromEntries(node.attrs);
  const own = node.name === 'Shape' && EYES.has(named);
  return el(
    node.name,
    own ? { ...attrs, rotation: lean } : attrs,
    node.children.map((c) => leanEyes(c, lean)),
  );
};

const kitOf = (rig: Figure, face: KitA) => {
  const drawn = faceKit(rig, { x: face.x, y: face.y, scale: face.scale }, face.shape, face.extra);
  const kit = face.eyeLean === undefined ? drawn : leanEyes(drawn, face.eyeLean);
  if (face.rotation === undefined) return kit;
  return el('Node', { x: face.x, y: face.y, rotation: face.rotation, name: 'faceTurn' }, [
    el('Node', { x: -face.x, y: -face.y, name: 'faceAt' }, [kit]),
  ]);
};

const stainOf = (rig: Figure, s: Stain) => {
  const flat: PieceLook = { color: s.paper, light: s.paper, ink: 'none', shadow: 0 };
  const [rx, ry] = s.r;
  return el('Node', { x: s.at[0], y: s.at[1], name: 'stain', id: rig.idOf('stain') }, [
    rig.bind('stain', KEY.opacity),
    piece(rig, 'stainBlot', blotOutline(rx, ry, STAIN_WANDER, s.seed), flat),
    ...s.soak.map(([grow, opacity], i) =>
      el('Node', { opacity, name: `stainSoak${i}` }, [
        piece(
          rig,
          `stainSoak${i}Paper`,
          blotOutline(rx * grow, ry * grow, STAIN_WANDER, s.seed),
          flat,
        ),
      ]),
    ),
  ]);
};

const roundHeadOf = (rig: Figure, head: RoundHead, face: KitA) =>
  el('Node', { y: head.neck, name: 'neck', id: rig.idOf('neck') }, [
    el('Node', { name: 'head', id: rig.idOf('head') }, [
      rig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: rig.idOf('nodded') }, [
        rig.bind('nod', KEY.y),
        el('Node', { y: head.y - head.neck, name: 'skull' }, [
          el('Node', { name: 'faceSlide', id: rig.idOf('faceSlide') }, [
            rig.bind('faceY', KEY.y),
            kitOf(rig, face),
          ]),
          piece(
            rig,
            'headPaper',
            ellipse(0, 0, head.r[0], head.r[1], ROUND_POINTS),
            looked(head.paper),
          ),
        ]),
      ]),
    ]),
  ]);

interface Cut {
  readonly key: string;
  readonly pts: ReadonlyArray<Pt>;
  readonly look: PieceLook;
  readonly boil?: number;
  readonly cubic?: true;
  readonly crawl?: 'whole';
}

const cubicOf = (f: Parts): true | undefined => (f.path === 'cubic' ? true : undefined);

const cubicLook = (look: PieceLook, cubic: true | undefined): PieceLook =>
  cubic === undefined ? look : { ...look, tones: (look.tones ?? []).map((t) => ({ ...t, cubic })) };

const cubicCut = <C extends Cut>(cut: C, cubic: true | undefined): C =>
  cubic === undefined ? cut : { ...cut, cubic, look: cubicLook(cut.look, cubic) };

const earsOf = (ear: Ear): Cut[] => {
  const flat = (key: string, pts: ReadonlyArray<Pt>): Cut => ({
    key,
    pts,
    look:
      ear._tag !== 'RoundEar' && ear.tones !== undefined
        ? looked(ear.paper, { tones: ear.tones })
        : looked(ear.paper),
    boil: SMALL_BOIL,
  });
  switch (ear._tag) {
    case 'RoundEar':
      return [flat('ear', ellipse(ear.at[0], ear.at[1], ear.r[0], ear.r[1], EAR_POINTS))];
    case 'TracedEar':
      return [flat('ear', ear.outline)];
    case 'BothEars':
      return [flat('earNear', ear.near), flat('earFar', ear.far)];
  }
};

const CURL_POINTS = 12;

const CURL_BOIL = 0.6;

const hairOf = (hair: Hair): Cut[] => {
  const mass: Cut = {
    key: 'hair',
    pts: hair.outline,
    look: looked(hair.paper, { tones: hair.tones ?? [] }),
  };
  if (hair._tag === 'TracedHair') return [mass];
  const curl = looked(hair.paper, {
    shade: hair.shade,
    crease: { ...hair.paper.crease, crescent: hair.crescent },
  });
  return [
    ...hair.curls.map((c, i): Cut => ({
      key: `curl${i}`,
      pts: ellipse(c.at[0], c.at[1], c.r, c.r, CURL_POINTS),
      look: curl,
      boil: CURL_BOIL,
      crawl: 'whole',
    })),
    mass,
  ];
};

const beardOf = (beard: Beard): Cut[] => [
  ...(beard.lip === undefined
    ? []
    : [{ key: 'lip', pts: beard.lip.outline, look: looked(beard.lip.paper) }]),
  { key: 'beard', pts: beard.outline, look: looked(beard.paper, { tones: beard.tones ?? [] }) },
];

const headclothOf = (cloth: Headcloth): Cut[] => [
  ...(cloth.band === undefined
    ? []
    : [
        {
          key: 'band',
          pts: cloth.band.outline,
          look: looked(cloth.band.paper, { tones: cloth.band.tones ?? [] }),
        },
      ]),
  ...(cloth.edge === undefined
    ? []
    : [
        {
          key: 'clothEdge',
          pts: cloth.edge.outline,
          look: looked(cloth.edge.paper, { tones: cloth.edge.tones ?? [] }),
        },
      ]),
  { key: 'cloth', pts: cloth.outline, look: looked(cloth.paper) },
];

const cutOf = (f: Parts): Cut[] => [
  ...(f.beard === undefined ? [] : beardOf(f.beard)),
  ...(f.ear === undefined ? [] : earsOf(f.ear)),
  ...(f.headcloth === undefined ? [] : headclothOf(f.headcloth)),
  ...(f.hair === undefined ? [] : hairOf(f.hair)),
];

const headPaperOf = (head: TracedHead): Cut => ({
  key: 'headPaper',
  pts: head.outline,
  look: looked(head.paper, { tones: head.tones ?? [] }),
});

const tuckedUnder = (papers: ReadonlyArray<Cut>): Cut[] => {
  const base = papers.length - 1;
  return papers.map((p, i) => {
    const fronts = papers.slice(0, i).map((q) => q.pts);
    const rim = p.look.rim ?? 0;
    const pts =
      i === base && rim > 0
        ? tuckedRimmed(p.pts, fronts, TUCK_UNDER_RIM + rim)
        : tucked(p.pts, fronts);
    return { ...p, pts };
  });
};

const shoutOf = (rig: Figure, mouth: OpenMouth, face: KitA) => {
  const [mx, my] = kitMarks(face.shape).mouth;
  const [dx, dy] = [mx * face.scale, my * face.scale];
  const turn = face.rotation ?? 0;
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  const at = { x: face.x + (dx * cos - dy * sin), y: face.y + (dx * sin + dy * cos) };
  const flat: PieceLook = { color: mouth.paper, light: mouth.paper, ink: 'none', shadow: 0 };
  return el('Node', { ...at, rotation: face.rotation, name: 'shout' }, [
    rig.bind('shout', KEY.opacity),
    el('Node', { name: 'shoutOpen', id: rig.idOf('shoutOpen') }, [
      rig.bind('shout', KEY.scaleY),
      piece(rig, 'shoutPaper', ellipse(0, 0, mouth.w / 2, mouth.h / 2, MOUTH_POINTS), flat),
    ]),
  ]);
};

const shoutsOf = (rig: Figure, f: Parts) =>
  f.mouth === undefined ? [] : [shoutOf(rig, f.mouth, f.face)];

const tracedHeadOf = (rig: Figure, f: Parts, head: TracedHead) => {
  const face = f.beard === undefined ? undefined : kitOf(rig, f.face);
  const cuts = cutOf(f).map((c) => (c.crawl === 'whole' ? c : cubicCut(c, cubicOf(f))));
  const own = cubicCut(headPaperOf(head), cubicOf(f));
  return el('Node', { y: head.neck, name: 'neck', id: rig.idOf('neck') }, [
    el('Node', { name: 'head', id: rig.idOf('head') }, [
      rig.bind('tilt', KEY.rotation),
      el('Node', { name: 'nodded', id: rig.idOf('nodded') }, [
        rig.bind('nod', KEY.y),
        el(
          'Node',
          { x: head.set.x, y: head.y - head.neck, rotation: head.set.cant, name: 'skull' },
          [
            silhouette(
              rig,
              'headCut',
              face === undefined
                ? f.face.layer === 'over'
                  ? [kitOf(rig, f.face), ...cuts, ...shoutsOf(rig, f), own]
                  : [...cuts, ...shoutsOf(rig, f), kitOf(rig, f.face), own]
                : [...shoutsOf(rig, f), face, ...tuckedUnder([...cuts, own])],
              head.chin === 'open' ? { behind: garmentBack(f) } : {},
            ),
          ],
        ),
      ]),
    ]),
  ]);
};

const headOf = (rig: Figure, f: Parts) =>
  f.head._tag === 'TracedHead' ? tracedHeadOf(rig, f, f.head) : roundHeadOf(rig, f.head, f.face);

const garmentKey = (g: Garment) => (g._tag === 'Tunic' ? 'tunic' : 'robe');

const garmentBack = (f: Parts) => {
  const key = garmentKey(f.body);
  return ARM_SIDES.some((side) => f.arms[side] !== undefined) || hemOver(f) !== undefined
    ? `${key}CutInk`
    : key;
};

const bandOutline = (b: Bands, side: -1 | 1): Pt[] => {
  const x = (d: number) => b.x + side * d;
  const top: Pt[] = [
    [x(b.gap), b.from],
    [x(b.gap + b.top), b.from],
  ];
  const bottom: Pt[] = [
    [x(b.gap + b.splay + b.bottom), b.to],
    [x(b.gap + b.splay), b.to],
  ];
  const corners = [...top, ...bottom];
  return roundedPolygon(side < 0 ? [...corners].reverse() : corners, BAND_CORNER);
};

const bandsOf = (rig: Figure, b: Bands) =>
  ([-1, 1] as const).map((side) =>
    piece(
      rig,
      `band${side < 0 ? 'L' : 'R'}`,
      bandOutline(b, side),
      looked(b.paper, { ink: 'none', tones: b.tones ?? [] }),
      { boil: BAND_BOIL },
    ),
  );

const sleeveOf = (
  rig: Figure,
  side: ArmSide,
  arm: Arm,
  key: string,
  look: PieceLook,
  cubic: true | undefined,
): Element =>
  el('Node', { x: arm.pivot[0], y: arm.pivot[1], name: `${key}Arm`, id: rig.idOf(`${key}Arm`) }, [
    rig.bind(`${side}Arm`, KEY.rotation),
    el('Node', { x: -arm.pivot[0], y: -arm.pivot[1], name: `${key}At` }, [
      piece(rig, key, arm.outline, cubicLook(look, cubic), { cubic }),
    ]),
  ]);

interface Sleeves {
  readonly key: string;
  readonly look: (arm: AnyArm, sleeve: 'upper' | 'forearm') => PieceLook;
}

const jointedOf = (
  side: ArmSide,
  arm: JointedArm,
  key: string,
  sleeves: Sleeves,
  cubic: true | undefined,
): Part[] => {
  const shoulder = { at: arm.pivot, knob: `${side}Arm`, name: `${key}Arm` };
  const elbow = { at: arm.elbow, knob: `${side}Elbow`, name: `${key}Elbow` };
  return [
    {
      key: `${key}Fore`,
      pts: arm.forearm,
      look: cubicLook(sleeves.look(arm, 'forearm'), cubic),
      frames: [shoulder, elbow],
      cubic,
    },
    {
      key,
      pts: arm.outline,
      look: cubicLook(sleeves.look(arm, 'upper'), cubic),
      frames: [shoulder],
      cubic,
    },
  ];
};

const sleevedOf = (
  rig: Figure,
  f: Parts,
  key: string,
  outline: ReadonlyArray<Pt>,
  look: PieceLook,
  sleeves: Sleeves,
  under: ReadonlyArray<Element> = [],
): Element => {
  const sided = ARM_SIDES.flatMap((side) => {
    const arm = f.arms[side];
    return arm === undefined ? [] : [{ side, arm, key: `${side}${sleeves.key}` }];
  });
  const cubic = cubicOf(f);
  const front = sided.flatMap(({ side, arm, key: at }) =>
    arm._tag === 'JointedArm' ? jointedOf(side, arm, at, sleeves, cubic) : [],
  );
  const behind = sided.flatMap(({ side, arm, key: at }) =>
    arm._tag === 'Arm' ? [sleeveOf(rig, side, arm, at, sleeves.look(arm, 'upper'), cubic)] : [],
  );
  const hem = hemOver(f);
  const own = f.body._tag === 'TracedRobe' ? cubic : undefined;
  const paper = cubicLook(look, own);
  return front.length === 0 && behind.length === 0 && under.length === 0 && hem === undefined
    ? piece(rig, key, outline, paper, { cubic: own })
    : silhouette(
        rig,
        `${key}Cut`,
        [...front, ...under, { key, pts: outline, look: paper, cubic: own }, ...behind],
        hem === undefined ? {} : { behind: hem },
      );
};

const TROUSERS = 'legs';
const TROUSERS_INK = `${TROUSERS}Ink`;

const hemOver = (f: Parts) =>
  'feet' in f && f.feet?._tag === 'Trousers' ? TROUSERS_INK : undefined;

const jointed = (f: Parts) => ARM_SIDES.some((side) => f.arms[side]?._tag === 'JointedArm');

const sleeveTones = (arm: AnyArm, sleeve: 'upper' | 'forearm') =>
  (sleeve === 'forearm' && arm._tag === 'JointedArm' ? arm.forearmTones : arm.tones) ?? [];

const garmentOf = (
  rig: Figure,
  f: Parts,
  outline: ReadonlyArray<Pt>,
  under: ReadonlyArray<Element> = [],
): Element =>
  sleevedOf(
    rig,
    f,
    garmentKey(f.body),
    outline,
    looked(f.body.paper, { tones: tonesOn(f.body) }),
    {
      key: 'Sleeve',
      look: (arm, sleeve) => looked(arm.paper, { tones: sleeveTones(arm, sleeve) }),
    },
    under,
  );

const skinIn = <T extends { readonly skin?: true }>(tones: ReadonlyArray<T>): ReadonlyArray<T> =>
  tones.filter((t) => t.skin === true);

const robeOf = (rig: Figure, f: Parts, robe: GivenRobe, outline: ReadonlyArray<Pt>): Element => {
  const look = looked(robe.paper, { tones: skinIn(tonesOn(f.body)) });
  return el('Node', { name: 'robe', id: rig.idOf('givenRobe') }, [
    rig.bind('robe', KEY.opacity),
    sleevedOf(rig, f, 'robePaper', outline, look, {
      key: 'RobeSleeve',
      look: (arm, sleeve) => looked(robe.paper, { tones: skinIn(sleeveTones(arm, sleeve)) }),
    }),
  ]);
};

const clothOf = (
  rig: Figure,
  f: Parts,
  over: ReadonlyArray<Element>,
  stain: ReadonlyArray<Element>,
): Element[] => {
  const outline = garmentOutline(f.body);
  const robe = f.states.robe === undefined ? [] : [robeOf(rig, f, f.states.robe, outline)];
  return jointed(f)
    ? [...over, ...robe, garmentOf(rig, f, outline, stain)]
    : [...over, ...robe, ...stain, garmentOf(rig, f, outline)];
};

const legOutline = (legs: StubLegs, hem: number, x: number): Pt[] => {
  const { r } = legs;
  const top = hem - LEG_TUCK;
  const side = (top - r) / 2;
  const foot = Array.from({ length: FOOT_POINTS }, (_, i): Pt => {
    const a = (i / (FOOT_POINTS - 1)) * Math.PI;
    return [x + r * Math.cos(a), -r + r * Math.sin(a)];
  });
  return [[x - r, top], [x + r, top], [x + r, side], ...foot, [x - r, side]];
};

const legsOf = (rig: Figure, legs: StubLegs, hem: number) =>
  ([-1, 1] as const).map((side) =>
    piece(
      rig,
      `leg${side < 0 ? 'L' : 'R'}`,
      legOutline(legs, hem, side * legs.x),
      looked(legs.paper),
      { boil: SMALL_BOIL },
    ),
  );

const shoesOf = (rig: Figure, s: Shoes) =>
  (
    [
      [-1, s.near],
      [1, s.far],
    ] as const
  ).map(([toe, shoe]) => {
    const x = toe * s.x;
    const { color, from, to, depth } = shoe.light;
    return piece(
      rig,
      `shoe${toe < 0 ? 'L' : 'R'}`,
      shifted(shoeOutline(s.w, s.h, toe), x, 0),
      looked(shoe.paper, {
        tones: [{ pts: shifted(shoeLight(s.w, s.h, toe, from, to, depth), x, 0), color }],
      }),
      { boil: SMALL_BOIL },
    );
  });

const soleOf = (corners: ReadonlyArray<Pt>, depth: number): Pt[] => {
  const xs = corners.map(([x]) => x);
  const [heel, toe] = [Math.min(...xs) - SOLE.past, Math.max(...xs) + SOLE.past];
  return [
    [heel, -depth],
    [toe, -depth],
    [toe, SOLE.under],
    [heel, SOLE.under],
  ];
};

const sandalsOf = (rig: Figure, s: Sandals) =>
  (
    [
      ['footNear', s.near],
      ['footFar', s.far],
    ] as const
  ).map(([key, foot]) =>
    piece(
      rig,
      key,
      roundedPolygon(foot.corners, foot.radii),
      looked(s.paper, {
        tones: [
          ...(foot.tones ?? []),
          { pts: soleOf(foot.corners, s.soleDepth ?? SOLE.depth), color: s.sole },
        ],
      }),
      { boil: SMALL_BOIL },
    ),
  );

const trousersOf = (rig: Figure, t: Trousers) =>
  silhouette(rig, TROUSERS, [
    ...(
      [
        ['shoeL', t.shoes.near],
        ['shoeR', t.shoes.far],
      ] as const
    ).map(([key, shoe]) => ({
      key,
      pts: shoe.outline,
      look: looked(t.shoes.paper, { tones: shoe.tones ?? [] }),
      boil: SMALL_BOIL,
    })),
    ...(
      [
        ['legL', t.near],
        ['legR', t.far],
      ] as const
    ).map(([key, leg]) => ({
      key,
      pts: leg.outline,
      look: looked(t.paper, { tones: leg.tones ?? [] }),
      boil: SMALL_BOIL,
    })),
  ]);

const feetOf = (rig: Figure, feet: Feet, hem: number) => {
  switch (feet._tag) {
    case 'Shoes':
      return shoesOf(rig, feet);
    case 'StubLegs':
      return legsOf(rig, feet, hem);
    case 'Sandals':
      return sandalsOf(rig, feet);
    case 'Trousers':
      return [trousersOf(rig, feet)];
  }
};

const standingOf = (
  rig: Figure,
  f: StandingParts,
  head: Element,
  over: ReadonlyArray<Element>,
  stain: ReadonlyArray<Element>,
) =>
  el('Node', { name: 'body', id: rig.idOf('body') }, [
    rig.bind('lean', KEY.rotation),
    head,
    el('Node', { y: f.body.hem, name: 'trunk', id: rig.idOf('trunk') }, [
      el(
        'Node',
        { y: -f.body.hem, name: `${garmentKey(f.body)}Side` },
        clothOf(rig, f, over, stain),
      ),
    ]),
    ...feetOf(rig, f.feet, f.body.hem),
  ]);

const seatedOf = (
  rig: Figure,
  f: SeatedParts,
  head: Element,
  over: ReadonlyArray<Element>,
  stain: ReadonlyArray<Element>,
) => {
  const side = `${garmentKey(f.body)}Side`;
  return el('Node', { y: f.body.hem, name: 'leanPivot', id: rig.idOf('leanPivot') }, [
    rig.bind('lean', KEY.rotation),
    el('Node', { y: -f.body.hem, name: 'upright' }, [
      head,
      el('Node', { name: side, id: rig.idOf(side) }, clothOf(rig, f, over, stain)),
    ]),
  ]);
};

const standingBreath = (rig: Figure, stance: Standing, neck: number) => {
  const { period, trunk, neck: rise } = stance.breath;
  return timeline(
    rig,
    'breath',
    period,
    {
      trunk: {
        scaleY: [
          [0, 1],
          [period / 2, trunk],
          [period, 1],
        ],
      },
      neck: {
        y: [
          [0, neck],
          [period / 2, neck + rise],
          [period, neck],
        ],
      },
    },
    { loop: true },
  );
};

const seatedBreath = (rig: Figure, stance: Seated, side: string, neck: number) => {
  const { period, width, neck: rise } = stance.breath;
  return timeline(
    rig,
    'breath',
    period,
    {
      [side]: {
        scaleX: [
          [0, 1],
          [period / 2, width],
          [period, 1],
        ],
      },
      neck: {
        y: [
          [0, neck],
          [period / 2, neck + rise],
          [period, neck],
        ],
      },
    },
    { loop: true },
  );
};

export const drawFigure = <K extends string>(rig: Figure, f: ComposedFigure<K>): Element[] => {
  const stain = f.states.stain === undefined ? [] : [stainOf(rig, f.states.stain)];
  const head = headOf(rig, f);
  const over = f.over === undefined ? [] : bandsOf(rig, f.over);
  if (isSeated(f)) {
    const body = seatedOf(rig, f, head, over, stain);
    const figure = el('Node', { x: f.art.head[0], y: f.art.head[1], name: 'figure' }, [
      gazeTarget(rig, f.knobs),
      body,
    ]);
    const breath = seatedBreath(rig, f.stance, `${garmentKey(f.body)}Side`, f.head.neck);
    return artboard(rig, f.art, [figure], [breath, boilTimeline(rig)], f.knobs);
  }
  const body = standingOf(rig, f, head, over, stain);
  const figure = el('Node', { x: f.art.feet[0], y: f.art.feet[1], name: 'figure' }, [
    gazeTarget(rig, f.knobs),
    body,
  ]);
  const breath = standingBreath(rig, f.stance, f.head.neck);
  return artboard(rig, f.art, [figure], [breath, boilTimeline(rig)], f.knobs);
};

export const FIGURE_TIMELINES = ['breath', 'boil'] as const;
export type FigureTimeline = (typeof FIGURE_TIMELINES)[number];

export const HAND_TIMELINES = ['boil'] as const;
export type HandTimeline = (typeof HAND_TIMELINES)[number];

export const HAND_ART = { width: 64, height: 64, r: 19 } as const;

export const drawHand = (rig: Figure, p: Paper, size = 1): Element[] =>
  artboard(
    rig,
    { width: HAND_ART.width * size, height: HAND_ART.height * size },
    [
      el(
        'Node',
        { x: (HAND_ART.width * size) / 2, y: (HAND_ART.height * size) / 2, name: 'hand' },
        [hand(rig, 'palm', HAND_ART.r * size, looked(paper(p, 'hand'), { ground: 'host' }))],
      ),
    ],
    [boilTimeline(rig)],
  );
