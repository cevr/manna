import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Equal, FileSystem, Option, Result, Schema } from 'effect';
import { FigureMeasure, type FigureRead, measureFigure, readFigure } from '../core/figure.ts';
import { drawFigure, type FigureSpec, PLAIN } from '../core/fixtures/figure.ts';
import { repoJson } from '../core/schema.ts';
import { decodePng } from './png.ts';

const CROPS = [
  'cold-34-prosecutor.png',
  'court-12-christ-concept.png',
  'rain-rain-farmer-concept.png',
  'rbf-cold-judge-head-0387.png',
  'rbf-cold-lead-head-2400.png',
  'rbf-cold-prosecutor-face-0387.png',
  'rbf-cold-prosecutor-head.png',
  'rbf-concept-christ-front.png',
  'rbf-concept-christ.png',
  'rbf-concept-farmer.png',
  'rbf-concept-judge.png',
  'rbf-concept-lead.png',
  'rbf-concept-prosecutor.png',
  'rbf-court-christ-head-1651.png',
  'rbf-court-lead-0401.png',
  'rbf-rain-farmer-1419.png',
  'rbf-rain-farmer-1649.png',
  'round-3-judge-head.png',
] as const;

const DRAWN: ReadonlyArray<readonly [string, FigureSpec]> = [
  ['plain', PLAIN],
  ['dark hair', { ...PLAIN, darkHair: true }],
  ['behind a rail', { ...PLAIN, rail: true }],
  ['before a wall', { ...PLAIN, wall: true }],
  ['no feet', { ...PLAIN, feet: false }],
  ['hair ink', { ...PLAIN, hairInk: true }],
  ['ear, no rim', { ...PLAIN, eyeGap: 30, ear: { rim: false } }],
  ['ear, a rim', { ...PLAIN, eyeGap: 30, ear: { rim: true } }],
  ['robe shaded', { ...PLAIN, robeShade: [80, 108, 168] }],
  ['robe grey', { ...PLAIN, robeShade: [104, 118, 135] }],
  ['mouth open', { ...PLAIN, mouth: { open: true, width: 30 } }],
  ['mouth closed', { ...PLAIN, mouth: { open: false, width: 30 } }],
  ['long hair, beard parted', { ...PLAIN, longHair: true, beard: { parted: true } }],
  ['long hair, beard merged', { ...PLAIN, longHair: true, beard: { parted: false } }],
  ['a raised sleeve', { ...PLAIN, limb: { hand: [318, 160], from: [[250, 262]], kind: 'sleeve' } }],
  ['bare shoulders', { ...PLAIN, bareSkin: { kind: 'shoulders', depth: 50 } }],
  ['headcloth', { ...PLAIN, headcloth: [70, 60, 50] }],
];

const GoldenEntry = Schema.Union([
  Schema.Struct({ measure: FigureMeasure }),
  Schema.Struct({ unread: Schema.String }),
]);
type GoldenEntry = typeof GoldenEntry.Type;

const GoldenJson = repoJson(Schema.Record(Schema.String, GoldenEntry));

const entryOf = (measured: ReturnType<typeof measureFigure>): GoldenEntry =>
  Result.match(measured, {
    onSuccess: (measure) => ({ measure }),
    onFailure: (e) => ({ unread: e.message }),
  });

const fixture = (name: string) =>
  new URL(`../core/fixtures/figure/${name}`, import.meta.url).pathname;

type GoldenSet = 'real' | 'drawn';

const goldenCrops = (set: GoldenSet) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (set === 'drawn')
      return DRAWN.map(([name, spec]) => [`drawn: ${name}`, drawFigure(spec)] as const);
    return yield* Effect.forEach(CROPS, (name) =>
      Effect.map(
        fs.readFile(fixture(name)),
        (bytes) => [name, Result.getOrThrow(decodePng(bytes))] as const,
      ),
    );
  });

const goldenPinned = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* Schema.decodeEffect(GoldenJson)(yield* fs.readFileString(fixture('golden.json')));
});

interface GoldenRow {
  readonly name: string;
  readonly now: GoldenEntry;
  readonly pinned: Option.Option<GoldenEntry>;
  readonly full: ReturnType<typeof measureFigure>;
  readonly lean: ReturnType<typeof readFigure>;
}

const goldenRows = (set: GoldenSet) =>
  Effect.gen(function* () {
    const pinned = yield* goldenPinned;
    const crops = yield* goldenCrops(set);
    const rows = crops.map(([name, crop]): GoldenRow => {
      const full = measureFigure(crop);
      return {
        name,
        now: entryOf(full),
        pinned: Option.fromUndefinedOr(pinned[name]),
        full,
        lean: readFigure(crop),
      };
    });
    const names = Object.keys(pinned).filter((n) => (set === 'drawn') === n.startsWith('drawn: '));
    return { rows, names };
  });

const leanOf = ({
  headShading: _h,
  bodyShading: _b,
  artifacts: _a,
  hairBeard: _hb,
  ...rest
}: FigureMeasure) => ({
  ...rest,
  ratios: rest.ratios.filter((r) => r.ratio !== 'innerRim'),
  missing: rest.missing.filter((m) => m.ratio !== 'innerRim'),
});

const leanParts = (lean: FigureRead) => ({
  read: { ...lean, missing: lean.missing.filter((m) => m.ratio !== 'innerRim') },
  rims: lean.missing.filter((m) => m.ratio === 'innerRim'),
});

const RIMS_LACKED = [{ ratio: 'innerRim', why: 'a lean read reads no rims' }];

const rowFaults = (row: GoldenRow): ReadonlyArray<string> => {
  const pinned = Option.match(row.pinned, {
    onNone: () => [`${row.name}: no pin`],
    onSome: (pin) => (Equal.equals(pin, row.now) && []) || [`${row.name}: measured off its pin`],
  });
  if (Result.isFailure(row.full) || Result.isFailure(row.lean))
    return [
      ...pinned,
      ...((Result.isFailure(row.full) !== Result.isFailure(row.lean) && [
        `${row.name}: one read reads it, the other does not`,
      ]) ||
        []),
    ];
  const { read, rims } = leanParts(row.lean.success);
  return [
    ...pinned,
    ...((!Equal.equals(read, leanOf(row.full.success)) && [
      `${row.name}: the lean read is off the full measure`,
    ]) ||
      []),
    ...((!Equal.equals(rims, RIMS_LACKED) && [
      `${row.name}: the lean read does not lack its rims`,
    ]) ||
      []),
  ];
};

export const goldenFaults = (set: GoldenSet) =>
  Effect.map(goldenRows(set), ({ rows, names }) => [
    ...names
      .filter((n) => !rows.some((r) => r.name === n))
      .map((n) => `${n}: pinned, not measured`),
    ...rows.flatMap(rowFaults),
  ]);

if (import.meta.main)
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const crops = [...(yield* goldenCrops('real')), ...(yield* goldenCrops('drawn'))];
    const now = Object.fromEntries(crops.map(([name, c]) => [name, entryOf(measureFigure(c))]));
    yield* fs.writeFileString(fixture('golden.json'), yield* Schema.encodeEffect(GoldenJson)(now));
    yield* Console.log(`figure-golden wrote ${Object.keys(now).length} cases`);
  }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
