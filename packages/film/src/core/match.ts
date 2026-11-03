import { Array as Arr, Boolean as Bool, Match, Option, Order, Schema } from 'effect';
import { keptFile, type SheetKind } from './cast-sheet.ts';
import { ARTIFACT_KINDS, type ArtifactKind, type ArtifactMark } from './render-artifacts.ts';
import {
  type FigureMeasure,
  type FigureSilhouette,
  HEAD_RADII,
  type HairBeard,
  RATIO_LABELS,
  RATIOS,
  type Ratio,
  PixelBox,
  type Shading,
} from './figure.ts';
import { type Raster, type RasterPath, besideRaster, scaleRaster, strokeRaster } from './raster.ts';

const NAME = '(?!\\.\\.?(?:/|$))[A-Za-z0-9_.-]+';

const SetName = Schema.String.check(
  Schema.isPattern(new RegExp(`^${NAME}$`), { message: "a set's folder: one name" }),
);

const SetFile = Schema.String.check(
  Schema.isPattern(new RegExp(`^${NAME}(?:/${NAME})*\\.(?:png|jpe?g|webp)$`), {
    message: "a set's image, by its path in the set's folder",
  }),
);

const BoardImage = Schema.String.check(
  Schema.isPattern(new RegExp(`^${NAME}\\.(?:png|jpe?g|webp)$`), {
    message: "a Board try's file, as board.json names it",
  }),
);

const CastMember = Schema.String.check(
  Schema.isPattern(new RegExp(`^${NAME}$`), { message: "a cast member's id: one name" }),
);

const CastSheetKind = Schema.Literals(['turnaround', 'poses', 'heads']);

const SingleView = Schema.String.check(
  Schema.isPattern(/^single-[1-9]\d*$/, { message: "a single drawing's view: single-<n>" }),
);

export const ConceptImage = Schema.Union([
  Schema.Struct({ set: SetName, file: SetFile }),
  Schema.Struct({ board: BoardImage }),
  Schema.Struct({ cast: CastMember, sheet: CastSheetKind, view: Schema.optionalKey(Schema.Never) }),
  Schema.Struct({ cast: CastMember, sheet: Schema.Literal('single'), view: SingleView }),
]);
export type ConceptImage = typeof ConceptImage.Type;

export const ConceptRef = Schema.Struct({ image: ConceptImage, box: PixelBox });
export type ConceptRef = typeof ConceptRef.Type;

export const castConceptImage = (member: string, kind: SheetKind, view: string): ConceptImage => {
  if (kind === 'single') return { cast: member, sheet: kind, view };
  return { cast: member, sheet: kind };
};

export const conceptImageName = (image: ConceptImage): string =>
  Match.value(image).pipe(
    Match.when({ set: Match.string }, (set) => `${set.set}/${set.file}`),
    Match.when({ board: Match.string }, (board) => `board/${board.board}`),
    Match.when(
      { cast: Match.string },
      (cast) => `cast/${cast.cast}/${keptFile(cast.sheet, cast.view ?? cast.sheet)}`,
    ),
    Match.exhaustive,
  );

export const FigureMark = Schema.Struct({
  scene: Schema.String,
  key: Schema.String,
  box: PixelBox,
  face: Schema.Boolean,
  concept: Schema.optional(ConceptRef),
});
export type FigureMark = typeof FigureMark.Type;

export const figureName = (key: string): string => key.slice(key.lastIndexOf('/') + 1);

export const onFrame = (mark: FigureMark, width: number, height: number): boolean => {
  const [x0, y0, x1, y1] = mark.box;
  return x1 > 0 && y1 > 0 && x0 < width && y0 < height;
};

export const sceneBoxOf = (
  mark: FigureMark,
  marks: ReadonlyArray<FigureMark>,
  width: number,
  height: number,
): PixelBox => {
  const centre = (b: PixelBox) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] as const;
  const gap = (b: PixelBox, to: PixelBox) => {
    const [x, y] = centre(b);
    return Math.hypot(Math.max(to[0] - x, 0, x - to[2]), Math.max(to[1] - y, 0, y - to[3]));
  };
  const figures = marks.filter((m) => m.face);
  const hands = marks.filter(
    (m) =>
      !m.face &&
      figures.every((other) => other === mark || gap(m.box, mark.box) <= gap(m.box, other.box)) &&
      gap(m.box, mark.box) < Math.max(mark.box[2] - mark.box[0], mark.box[3] - mark.box[1]),
  );
  const boxes = [mark.box, ...hands.map((h) => h.box)];
  const [x0, y0, x1, y1] = [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
  const room = Math.max(x1 - x0, y1 - y0) / 20;
  return [
    Math.max(0, Math.floor(x0 - room)),
    Math.max(0, Math.floor(y0 - room)),
    Math.min(width, Math.ceil(x1 + room)),
    Math.min(height, Math.ceil(y1 + room)),
  ];
};

export const MatchPost = Schema.Struct({
  scene: Schema.String,
  at: Schema.String,
  figure: Schema.optional(Schema.String),
  from: Schema.optionalKey(Schema.String),
});
export type MatchPost = typeof MatchPost.Type;

const RowUnit = Schema.Literals(['ratio', 'degrees', 'value', 'rule']);
type RowUnit = typeof RowUnit.Type;

const MatchRow = Schema.Struct({
  name: Schema.String,
  unit: RowUnit,
  concept: Schema.optionalKey(Schema.Finite),
  scene: Schema.optionalKey(Schema.Finite),
  diff: Schema.optionalKey(Schema.Finite),
  flagged: Schema.Boolean,
  note: Schema.optionalKey(Schema.String),
});
type MatchRow = typeof MatchRow.Type;

export const FigureMatched = Schema.Struct({
  figure: Schema.String,
  key: Schema.String,
  concept: ConceptRef,
  rows: Schema.Array(MatchRow),
  side: Schema.String,
  table: Schema.String,
  crops: Schema.Struct({ concept: Schema.String, scene: Schema.String }),
});
export type FigureMatched = typeof FigureMatched.Type;

export const Unmatched = Schema.Struct({ figure: Schema.String, reason: Schema.String });
export type Unmatched = typeof Unmatched.Type;

export const MatchTaken = Schema.Struct({
  build: Schema.String,
  scene: Schema.String,
  at: Schema.String,
  frame: Schema.Int,
  time: Schema.Finite,
  marks: Schema.Record(Schema.String, Schema.Finite),
  figures: Schema.Array(FigureMatched),
  unmatched: Schema.Array(Unmatched),
});
export type MatchTaken = typeof MatchTaken.Type;

export class MatchFigureUnknown extends Schema.TaggedError<MatchFigureUnknown>()(
  'MatchFigureUnknown',
  {
    scene: Schema.String,
    figure: Schema.String,
    known: Schema.Array(Schema.String),
  },
) {
  override get message() {
    return `scene ${this.scene} draws no figure "${this.figure}" there (it draws: ${this.known.join(', ') || 'none'})`;
  }
}

const RATIO_TOLERANCE = 0.05;

const INTERIOR_INK_MOST = 0.02;

const INNER_RIM_MORE = 0.1;

const SILHOUETTE_TOLERANCE = { head: 0.03, body: 0.05 } as const;

const TURN_TOLERANCE_SKIN_SHARE = 0.1;

const ROLL_TOLERANCE_DEG = 6;

const rollGrain = (eyes: number) => (Math.atan2(2, Math.max(1, eyes)) * 180) / Math.PI;

const SHADE_TOLERANCE = { drop: 0.05, turn: 8, kept: 0.15, edge: 15 } as const;

const valueOf = (m: FigureMeasure, ratio: Ratio): Option.Option<number> =>
  Option.map(
    Arr.findFirst(m.ratios, (r) => r.ratio === ratio),
    (r) => r.value,
  );

const whyMissing = (m: FigureMeasure, ratio: Ratio): Option.Option<string> =>
  Option.map(
    Arr.findFirst(m.missing, (r) => r.ratio === ratio),
    (r) => r.why,
  );

const diffOf = (unit: RowUnit, concept: number, scene: number): Option.Option<number> =>
  Match.value(unit).pipe(
    Match.when('ratio', () =>
      Option.map(
        Option.liftPredicate(Math.abs(concept), (size) => size > 0),
        (size) => ((scene - concept) / size) * 100,
      ),
    ),
    Match.orElse(() => Option.some(scene - concept)),
  );

const rowOf = (
  name: string,
  unit: RowUnit,
  concept: Option.Option<number>,
  scene: Option.Option<number>,
  why: { readonly concept: Option.Option<string>; readonly scene: Option.Option<string> },
  tolerance: number,
): MatchRow => {
  const sides = {
    ...Option.match(concept, { onNone: () => ({}), onSome: (v) => ({ concept: v }) }),
    ...Option.match(scene, { onNone: () => ({}), onSome: (v) => ({ scene: v }) }),
  };
  const notes = [
    ...Option.toArray(Option.map(why.concept, (w) => `concept: ${w}`)),
    ...Option.toArray(Option.map(why.scene, (w) => `scene: ${w}`)),
  ];
  const noted = Option.map(Option.liftPredicate(notes, Arr.isArrayNonEmpty), (all) =>
    all.join('; '),
  );
  const diff = Option.flatMap(Option.all([concept, scene]), ([c, d]) => diffOf(unit, c, d));
  const past = Match.value(unit).pipe(
    Match.when('ratio', () => tolerance * 100),
    Match.orElse(() => tolerance),
  );
  return {
    name,
    unit,
    ...sides,
    ...Option.match(diff, { onNone: () => ({}), onSome: (d) => ({ diff: d }) }),
    flagged: Option.exists(diff, (d) => Math.abs(d) > past),
    ...Option.match(noted, { onNone: () => ({}), onSome: (note) => ({ note }) }),
  };
};

const turnOf = (s: Shading) => ((s.shade.hue - s.lit.hue + 540) % 360) - 180;

const shadeRows = (
  part: 'head' | 'body',
  concept: Option.Option<Shading>,
  scene: Option.Option<Shading>,
): ReadonlyArray<MatchRow> => {
  const none = (side: Option.Option<Shading>) =>
    Option.match(side, {
      onNone: () => Option.some('one tone, no shade read'),
      onSome: () => Option.none<string>(),
    });
  const why = { concept: none(concept), scene: none(scene) };
  const by = (f: (s: Shading) => number) => [Option.map(concept, f), Option.map(scene, f)] as const;
  const kindOf = (side: Option.Option<Shading>) =>
    Option.getOrElse(
      Option.map(side, (s): string => s.kind),
      () => 'none',
    );
  return [
    rowOf(
      `${part} shade: value drop`,
      'value',
      ...by((s) => s.lit.value - s.shade.value),
      why,
      SHADE_TOLERANCE.drop,
    ),
    rowOf(`${part} shade: hue turn`, 'degrees', ...by(turnOf), why, SHADE_TOLERANCE.turn),
    rowOf(
      `${part} shade: saturation kept`,
      'value',
      ...by((s) => s.shade.saturation / Math.max(Number.EPSILON, s.lit.saturation)),
      why,
      SHADE_TOLERANCE.kept,
    ),
    rowOf(`${part} shade: edge angle`, 'degrees', ...by((s) => s.edge), why, SHADE_TOLERANCE.edge),
    {
      name: `${part} shade: colour, not grey`,
      unit: 'rule',
      flagged: Option.exists(scene, (s) => s.kind === 'grey'),
      note: `concept ${kindOf(concept)}, scene ${kindOf(scene)}`,
    },
    ...(['lit', 'shade'] as const).flatMap((side) =>
      (['hue', 'saturation', 'value'] as const).map((channel): MatchRow => ({
        ...rowOf(
          `${part} ${side}: ${channel}`,
          Match.value(channel).pipe(
            Match.when('hue', (): RowUnit => 'degrees'),
            Match.orElse((): RowUnit => 'value'),
          ),
          ...by((s) => s[side][channel]),
          why,
          Infinity,
        ),
        flagged: false,
      })),
    ),
  ];
};

const SIDES = [
  'top',
  'top right',
  'right',
  'bottom right',
  'bottom',
  'bottom left',
  'left',
  'top left',
] as const;

const largestBy = <A>(values: ReadonlyArray<A>, size: (a: A) => number): Option.Option<A> =>
  Option.map(Option.liftPredicate(values, Arr.isReadonlyArrayNonEmpty), (some) =>
    Arr.max(some, Order.mapInput(Order.Number, size)),
  );

const headRow = (c: FigureSilhouette, s: FigureSilhouette): MatchRow => {
  const gaps = Arr.zipWith(c.head, s.head, (painted, drawn) => drawn - painted).map((gap, k) => ({
    gap,
    k,
  }));
  const head = gaps.reduce((sum, g) => sum + Math.abs(g.gap), 0) / Math.max(1, gaps.length);
  const name = "head outline: mean gap from the concept's";
  return Option.match(
    largestBy(gaps, (g) => Math.abs(g.gap)),
    {
      onNone: (): MatchRow => ({ name, unit: 'value', flagged: false, note: 'no outline read' }),
      onSome: ({ gap, k }): MatchRow => {
        const degrees = (360 * k) / HEAD_RADII;
        const side = SIDES[Math.round(degrees / 45) % SIDES.length];
        const way = Match.value(gap > 0).pipe(
          Match.when(true, () => 'outside'),
          Match.orElse(() => 'inside'),
        );
        return {
          name,
          unit: 'value',
          scene: head,
          flagged: head > SILHOUETTE_TOLERANCE.head,
          note: `widest at ${degrees.toFixed(0)}° (${side}): the scene's ${way} by ${Math.abs(gap).toFixed(3)}`,
        };
      },
    },
  );
};

const bodyPairs = (c: FigureSilhouette, s: FigureSilhouette) =>
  c.body.flatMap((row) =>
    Option.toArray(
      Option.map(
        Option.filter(
          largestBy(s.body, (q) => -Math.abs(q.y - row.y)),
          (near) => Math.abs(near.y - row.y) <= 0.025,
        ),
        (near) => ({ c: row, s: near }),
      ),
    ),
  );

const bodyRow = (c: FigureSilhouette, s: FigureSilhouette): MatchRow => {
  const pairs = bodyPairs(c, s);
  const gapOf = (p: (typeof pairs)[number]) =>
    (Math.abs(p.s.left - p.c.left) + Math.abs(p.s.right - p.c.right)) / 2;
  const body = pairs.reduce((sum, p) => sum + gapOf(p), 0) / Math.max(1, pairs.length);
  const name = "body outline: mean gap from the concept's";
  return Option.match(largestBy(pairs, gapOf), {
    onNone: (): MatchRow => ({
      name,
      unit: 'value',
      flagged: false,
      note: 'no body rows both show',
    }),
    onSome: (wide): MatchRow => ({
      name,
      unit: 'value',
      scene: body,
      flagged: body > SILHOUETTE_TOLERANCE.body,
      note: `over ${pairs.length} rows; widest ${wide.c.y.toFixed(2)} heads under the head's centre: left ${(wide.s.left - wide.c.left).toFixed(3)}, right ${(wide.s.right - wide.c.right).toFixed(3)}`,
    }),
  });
};

const feetOf = (m: FigureMeasure): 'shown' | 'none' | 'hidden' =>
  Option.match(Option.fromUndefinedOr(m.silhouette.feet), {
    onSome: () => 'shown',
    onNone: () =>
      Match.value(Option.contains(whyMissing(m, 'feetWidth'), 'no feet under the hem')).pipe(
        Match.when(true, () => 'none' as const),
        Match.orElse(() => 'hidden' as const),
      ),
  });

const silhouetteRows = (concept: FigureMeasure, scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const [c, s] = [concept.silhouette, scene.silhouette];
  const [painted, drawn] = [feetOf(concept), feetOf(scene)];
  const feet: MatchRow = {
    name: 'feet: shown under the hem',
    unit: 'rule',
    flagged: (painted === 'shown' && drawn === 'none') || (painted === 'none' && drawn === 'shown'),
    note: `concept ${painted}, scene ${drawn}`,
  };
  return [headRow(c, s), bodyRow(c, s), feet];
};

const ruleRow = (
  ratio: Ratio,
  sides: readonly [Option.Option<number>, Option.Option<number>],
  why: { readonly concept: Option.Option<string>; readonly scene: Option.Option<string> },
  broken: boolean,
  note: string,
): MatchRow => {
  const row = rowOf(RATIO_LABELS[ratio], 'rule', ...sides, why, Infinity);
  return Match.value(broken).pipe(
    Match.when(true, (): MatchRow => ({ ...row, flagged: true, note })),
    Match.orElse(() => row),
  );
};

const informing = (row: MatchRow, why: string): MatchRow => ({
  ...row,
  flagged: false,
  note: [...Option.toArray(Option.fromUndefinedOr(row.note)), why].join('; '),
});

const HEIGHT_IS_THE_BAND =
  "information: a figure's height comes from the cast's height band, and a concept is a design sketch";

const EXPRESSION_RATIOS: ReadonlySet<Ratio> = new Set([
  'eyeHeight',
  'browLength',
  'browAbove',
  'mouthWidth',
  'mouthBelowCentre',
]);

const posesOf = (concept: FigureMeasure, scene: FigureMeasure) =>
  [Option.fromUndefinedOr(concept.mouth), Option.fromUndefinedOr(scene.mouth)] as const;

const poseRow = (concept: FigureMeasure, scene: FigureMeasure): MatchRow => {
  const [painted, drawn] = posesOf(concept, scene).map((pose) =>
    Option.getOrElse(pose, () => 'none'),
  );
  return {
    name: 'face: its mouth',
    unit: 'rule',
    flagged: false,
    note: `concept ${painted}, scene ${drawn}`,
  };
};

const expressionDiffers = (concept: FigureMeasure, scene: FigureMeasure): Option.Option<string> =>
  Option.flatMap(Option.all(posesOf(concept, scene)), ([painted, drawn]) =>
    Option.liftPredicate(
      `information: the expression differs (the concept's mouth ${painted}, the scene's ${drawn}), so the face's marks do not compare`,
      () => painted !== drawn,
    ),
  );

const ratioRow = (concept: FigureMeasure, scene: FigureMeasure, ratio: Ratio): MatchRow => {
  const why = { concept: whyMissing(concept, ratio), scene: whyMissing(scene, ratio) };
  const sides = [valueOf(concept, ratio), valueOf(scene, ratio)] as const;
  const [painted, drawn] = sides;
  return Match.value(ratio).pipe(
    Match.when('interiorInk', () =>
      ruleRow(
        ratio,
        sides,
        why,
        Option.exists(drawn, (v) => v > INTERIOR_INK_MOST),
        'the hair carries its own line: the owner rule is none',
      ),
    ),
    Match.when('innerRim', () =>
      ruleRow(
        ratio,
        sides,
        why,
        Option.exists(drawn, (v) => v - Option.getOrElse(painted, () => 0) > INNER_RIM_MORE),
        'a light rim inside an inner part the concept does not paint: the owner rule is none',
      ),
    ),
    Match.when('heightInHeads', () =>
      informing(rowOf(RATIO_LABELS[ratio], 'ratio', ...sides, why, Infinity), HEIGHT_IS_THE_BAND),
    ),
    Match.orElse(() => rowOf(RATIO_LABELS[ratio], 'ratio', ...sides, why, RATIO_TOLERANCE)),
  );
};

const ratioRows = (concept: FigureMeasure, scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const differs = expressionDiffers(concept, scene);
  return [
    ...RATIOS.map((ratio) => {
      const row = ratioRow(concept, scene, ratio);
      return Option.match(
        Option.filter(differs, () => EXPRESSION_RATIOS.has(ratio)),
        { onNone: () => row, onSome: (why) => informing(row, why) },
      );
    }),
    poseRow(concept, scene),
  ];
};

const ANGLE_IS_DESIGN = "a concept's head angle is design, not a sketch's slip: draw the concept's";

const facingRows = (concept: FigureMeasure, scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const none = { concept: Option.none<string>(), scene: Option.none<string>() };
  const [c, s] = [concept.facing, scene.facing];
  const turn = rowOf(
    'head: turn (eyes in the face)',
    'value',
    Option.some(c.turn),
    Option.some(s.turn),
    none,
    TURN_TOLERANCE_SKIN_SHARE,
  );
  const roll = rowOf(
    'head: roll (the eye line)',
    'degrees',
    Option.some(c.roll),
    Option.some(s.roll),
    none,
    ROLL_TOLERANCE_DEG + rollGrain(c.eyes) + rollGrain(s.eyes),
  );
  return [turn, roll].map((row) =>
    Match.value(row.flagged).pipe(
      Match.when(true, (): MatchRow => ({ ...row, note: ANGLE_IS_DESIGN })),
      Match.orElse(() => row),
    ),
  );
};

const ARTIFACT_LABELS: Readonly<Record<ArtifactKind, string>> = {
  seam: 'artifacts: seam (a light line between two fills)',
  sliver: 'artifacts: sliver (a fill short of the outline)',
  weather: 'artifacts: weather over the face',
};

const BOXES_LISTED = 4;

const artifactRows = (scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const width = Math.max(1, scene.head[2] - scene.head[0]);
  return ARTIFACT_KINDS.map((kind): MatchRow => {
    const marks = scene.artifacts.filter((a) => a.kind === kind);
    const row: MatchRow = {
      name: ARTIFACT_LABELS[kind],
      unit: 'rule',
      scene: marks.reduce((sum, a) => sum + a.length, 0) / width,
      flagged: marks.length > 0,
    };
    return Option.match(Arr.head(marks), {
      onNone: () => row,
      onSome: () => ({ ...row, note: artifactNote(marks) }),
    });
  });
};

const artifactNote = (marks: ReadonlyArray<ArtifactMark>): string => {
  const at = marks
    .slice(0, BOXES_LISTED)
    .map((a) => a.box.map(Math.round).join(','))
    .join(' ');
  const more = Match.value(marks.length > BOXES_LISTED).pipe(
    Match.when(true, () => ' …'),
    Match.orElse(() => ''),
  );
  return `${marks.length} in the scene crop at ${at}${more}: the owner rule is none`;
};

const PARTED = { edge: 0.1, step: 0.1 } as const;

const HAIR_BEARD_RULE = 'hair/beard: parted';

const stepOf = (hb: HairBeard) => Math.abs(hb.hair.value - hb.beard.value);

const hueGapOf = (hb: HairBeard) => Math.abs(((hb.beard.hue - hb.hair.hue + 540) % 360) - 180);

const partedOf = (hb: HairBeard) =>
  Option.exists(Option.fromUndefinedOr(hb.edge), (edge) => edge >= PARTED.edge) ||
  stepOf(hb) >= PARTED.step;

const hairBeardRows = (concept: FigureMeasure, scene: FigureMeasure): ReadonlyArray<MatchRow> => {
  const [c, s] = [
    Option.fromUndefinedOr(concept.hairBeard),
    Option.fromUndefinedOr(scene.hairBeard),
  ];
  if (Option.isNone(c) && Option.isNone(s)) return [];
  const noBeard = (side: Option.Option<HairBeard>) =>
    Option.match(side, {
      onNone: () => Option.some('no beard read'),
      onSome: () => Option.none<string>(),
    });
  const why = { concept: noBeard(c), scene: noBeard(s) };
  const noEdge = (side: Option.Option<HairBeard>) =>
    Option.match(side, {
      onNone: () => Option.some('no beard read'),
      onSome: (hb) =>
        Option.match(Option.fromUndefinedOr(hb.edge), {
          onNone: () => Option.some('no row meets fill past the beard'),
          onSome: () => Option.none<string>(),
        }),
    });
  const by = (f: (hb: HairBeard) => Option.Option<number>) =>
    [Option.flatMap(c, f), Option.flatMap(s, f)] as const;
  const quiet = (row: MatchRow): MatchRow => ({ ...row, flagged: false });
  const told = (side: Option.Option<HairBeard>) =>
    Option.getOrElse(
      Option.map(side, (hb) => {
        const parted = Bool.match(partedOf(hb), {
          onTrue: () => 'parted',
          onFalse: () => 'merged',
        });
        const edge = Option.getOrElse(
          Option.map(Option.fromUndefinedOr(hb.edge), (e) => e.toFixed(3)),
          () => '–',
        );
        return `${parted} (edge ${edge}, step ${stepOf(hb).toFixed(3)})`;
      }),
      () => 'no beard',
    );
  return [
    quiet(
      rowOf(
        'hair/beard: edge',
        'value',
        ...by((hb) => Option.fromUndefinedOr(hb.edge)),
        { concept: noEdge(c), scene: noEdge(s) },
        Infinity,
      ),
    ),
    quiet(
      rowOf(
        'hair/beard: value step',
        'value',
        ...by((hb) => Option.some(stepOf(hb))),
        why,
        Infinity,
      ),
    ),
    quiet(
      rowOf(
        'hair/beard: hue turn',
        'degrees',
        ...by((hb) => Option.some(hueGapOf(hb))),
        why,
        Infinity,
      ),
    ),
    {
      name: HAIR_BEARD_RULE,
      unit: 'rule',
      flagged: Option.exists(c, partedOf) && Option.exists(s, (hb) => !partedOf(hb)),
      note: `concept ${told(c)}, scene ${told(s)}`,
    },
  ];
};

export const hairBeardLine = (rows: ReadonlyArray<MatchRow>): Option.Option<string> =>
  Option.flatMap(
    Arr.findFirst(rows, (r) => r.name === HAIR_BEARD_RULE),
    (r) => Option.fromUndefinedOr(r.note),
  );

export const compareFigures = (
  concept: FigureMeasure,
  scene: FigureMeasure,
): ReadonlyArray<MatchRow> => [
  ...ratioRows(concept, scene),
  ...facingRows(concept, scene),
  ...silhouetteRows(concept, scene),
  ...artifactRows(scene),
  ...hairBeardRows(concept, scene),
  ...shadeRows(
    'head',
    Option.fromUndefinedOr(concept.headShading),
    Option.fromUndefinedOr(scene.headShading),
  ),
  ...shadeRows(
    'body',
    Option.fromUndefinedOr(concept.bodyShading),
    Option.fromUndefinedOr(scene.bodyShading),
  ),
];

const numberIn = (unit: RowUnit, v: number) =>
  Match.value(unit).pipe(
    Match.when('degrees', () => v.toFixed(0)),
    Match.orElse(() => v.toFixed(3)),
  );

const cell = (row: MatchRow, v: Option.Option<number>) =>
  Option.getOrElse(
    Option.map(v, (n) => numberIn(row.unit, n)),
    () => '–',
  );

const diffCell = (row: MatchRow) =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(row.diff), (d) => {
      const sign = Match.value(d > 0).pipe(
        Match.when(true, () => '+'),
        Match.orElse(() => ''),
      );
      return Match.value(row.unit).pipe(
        Match.when('ratio', () => `${sign}${d.toFixed(0)}%`),
        Match.orElse((unit) => `${sign}${numberIn(unit, d)}`),
      );
    }),
    () => '–',
  );

const sidesOf = (row: MatchRow) =>
  [Option.fromUndefinedOr(row.concept), Option.fromUndefinedOr(row.scene)] as const;

export const matchTable = (
  figure: string,
  concept: ConceptRef,
  rows: ReadonlyArray<MatchRow>,
  place: string,
): string =>
  [
    `### ${figure} (${place})`,
    '',
    `Concept: ${conceptImageName(concept.image)}, box ${concept.box.join(',')}. Ratios are shares of the head's outer width, the face's marks (eyes, brows, mouth) of the eye spacing; a ratio is flagged past ${RATIO_TOLERANCE * 100}% of the concept's.`,
    '',
    '| Measure | Concept | Scene | Diff | Flag | Note |',
    '|---|---|---|---|---|---|',
    ...rows.map((row) => {
      const [painted, drawn] = sidesOf(row);
      const flag = Match.value(row.flagged).pipe(
        Match.when(true, () => 'FLAG'),
        Match.orElse(() => ''),
      );
      const note = Option.getOrElse(Option.fromUndefinedOr(row.note), () => '');
      return `| ${row.name} | ${cell(row, painted)} | ${cell(row, drawn)} | ${diffCell(row)} | ${flag} | ${note} |`;
    }),
    '',
  ].join('\n');

export const matchLines = (m: FigureMatched): ReadonlyArray<string> => {
  const flagged = m.rows.filter((r) => r.flagged);
  return [
    `${m.figure}: ${m.side} ${m.table} flagged=${flagged.length}`,
    ...flagged.map((r) => {
      const [painted, drawn] = sidesOf(r);
      const note = Option.getOrElse(
        Option.map(Option.fromUndefinedOr(r.note), (n) => ` (${n})`),
        () => '',
      );
      return `  ${r.name}: concept ${cell(r, painted)} scene ${cell(r, drawn)} ${diffCell(r)}${note}`;
    }),
  ];
};

export const matchStem = (figure: string, time: number, build: string): string =>
  `${figure}.t${time.toFixed(2).padStart(7, '0')}.b${build}`;

const OUTLINE_COLOUR = [232, 0, 140] as const;

const outlinePaths = (
  silhouette: FigureSilhouette,
  head: PixelBox,
  factor: number,
): ReadonlyArray<RasterPath> => {
  const W = head[2] - head[0];
  const [cx, cy] = [(head[0] + head[2]) / 2, (head[1] + head[3]) / 2];
  const at = (u: number, v: number) => [(cx + u * W) * factor, (cy + v * W) * factor] as const;
  const radius = silhouette.head.map((r, k) => {
    const angle = (2 * Math.PI * k) / silhouette.head.length;
    return at(r * Math.sin(angle), -r * Math.cos(angle));
  });
  type Edge = (typeof silhouette.body)[number];
  const joins = (last: Edge, row: Edge) =>
    row.y - last.y <= 0.16 &&
    Math.abs(row.left - last.left) <= 0.25 &&
    Math.abs(row.right - last.right) <= 0.25;
  const runs = silhouette.body.reduce<Array<Array<Edge>>>((all, row) => {
    const joined = Option.flatMap(Arr.last(all), (run) =>
      Option.filter(
        Option.map(Arr.last(run), (last) => ({ run, last })),
        ({ last }) => joins(last, row),
      ),
    );
    Option.match(joined, { onNone: () => all.push([row]), onSome: ({ run }) => run.push(row) });
    return all;
  }, []);
  const sides = runs.flatMap((run) => [
    { points: run.map((row) => at(row.left, row.y)), closed: false },
    { points: run.map((row) => at(row.right, row.y)), closed: false },
  ]);
  const feet = Option.toArray(
    Option.map(Option.fromUndefinedOr(silhouette.feet), ([x0, y0, x1, y1]) => ({
      points: [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)],
      closed: true,
    })),
  );
  return [{ points: radius, closed: true }, ...sides, ...feet];
};

const SIDE_HEAD = 200;

const ARTIFACT_COLOURS: Readonly<Record<ArtifactKind, readonly [number, number, number]>> = {
  seam: [255, 0, 0],
  sliver: [0, 90, 255],
  weather: [0, 200, 0],
};

const markArtifacts = (raster: Raster, measure: FigureMeasure, factor: number): Raster =>
  measure.artifacts.reduce((out, a) => {
    const [x0, y0, x1, y1] = [
      a.box[0] * factor,
      a.box[1] * factor,
      a.box[2] * factor,
      a.box[3] * factor,
    ];
    const room = 3;
    return strokeRaster(
      out,
      [
        {
          points: [
            [x0 - room, y0 - room],
            [x1 + room, y0 - room],
            [x1 + room, y1 + room],
            [x0 - room, y1 + room],
          ],
          closed: true,
        },
      ],
      ARTIFACT_COLOURS[a.kind],
      2,
    );
  }, raster);

export const sideBySide = (
  concept: { readonly crop: Raster; readonly measure: FigureMeasure },
  scene: { readonly crop: Raster; readonly measure: FigureMeasure },
  head: number = SIDE_HEAD,
): Raster => {
  const scaled = ({
    crop,
    measure,
  }: {
    readonly crop: Raster;
    readonly measure: FigureMeasure;
  }) => {
    const factor = head / Math.max(1, measure.head[3] - measure.head[1]);
    return { raster: scaleRaster(crop, factor), top: measure.head[1] * factor, factor };
  };
  const [left, scaledScene] = [scaled(concept), scaled(scene)];
  const middle = {
    ...scaledScene,
    raster: markArtifacts(scaledScene.raster, scene.measure, scaledScene.factor),
  };
  const over = strokeRaster(
    middle.raster,
    outlinePaths(concept.measure.silhouette, scene.measure.head, middle.factor),
    OUTLINE_COLOUR,
    Math.max(2, head / 70),
  );
  return besideRaster([left, middle, { raster: over, top: middle.top }], Math.round(head / 8));
};
