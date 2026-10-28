// Recuts the raise's drawn keys (`raise/record.json`, read by `raise.ts`) from
// their okra drawings: each key whose source is an okra call is registered to
// his kept front by the parts the raise leaves still (`fitKey`: the viewer's
// right half and the legs), laid in his front part sheet's frame (`frames.ts`)
// padded `PAD` px on the left, where a raised sleeve runs out past the kept
// box, and its arm cut out on the record's joints (`cutLimb`). The cut takes
// the kept front's ink (`inkTo`), is written to `raise/keys/<id>.png`, and its
// place in the sheet frame goes back into the record. Run it from the repo
// root with `bun apps/animations/src/library/cast/lead-feast/cutout/raise-cut.ts`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { figureOf } from '@manna/film/core';
import { cutLimb, decodePng, encodePng, fitKey, inkOf, inkTo, keyInFrame } from '@manna/film/tools';
import { Array as Arr, Console, Effect, FileSystem, Option, Schema } from 'effect';
import { boxOf, keptAt } from './frames.ts';

const here = import.meta.dir;
const RAISE = `${here}/raise`;
const FRONT = `${here}/../cast-sheet/views/front.png`;

/** Canvas px left of the sheet frame, where the raised sleeve runs. */
const PAD = 60;
/** His sleeve's capsules round its bones, px: shoulder to elbow, elbow to wrist. */
const R_UPPER = 26;
const R_FORE = 24;
/** The front's px (kept view px) the raise leaves still: right of his chest's middle, and his legs. */
const still = (x: number, y: number) => x >= 130 || y >= 520;

/** An object of the record: the fields read here, and the rest kept as it is read. */
const Kept = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.StructWithRest(Schema.Struct(fields), [Schema.Record(Schema.String, Schema.Unknown)]);
const Pt = Schema.Tuple([Schema.Finite, Schema.Finite]);
const Key = Kept({
  id: Schema.String,
  png: Schema.String,
  place: Schema.Struct({ s: Schema.Finite, dx: Schema.Finite, dy: Schema.Finite }),
  pivot: Pt,
  elbow: Schema.optional(Pt),
  wrist: Schema.optional(Pt),
  source: Kept({ okra: Schema.optional(Schema.Finite) }),
});
/** The record's JSON text, two-space indented as it is kept. */
const RecordJson = Schema.fromJsonString(
  Kept({
    view: Schema.Literal('front'),
    keys: Schema.Array(Key),
    okra: Kept({ calls: Schema.Array(Kept({ n: Schema.Finite, out: Schema.String })) }),
  }),
  { space: 2 },
);

/** The same text read as plain fields, so a write keeps every field where it stands. */
const Fields = Schema.Record(Schema.String, Schema.Unknown);
const RawJson = Schema.fromJsonString(Fields, { space: 2 });

class KeyUncut extends Schema.TaggedError<KeyUncut>()('KeyUncut', {
  key: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.key}: ${this.reason}`;
  }
}

const readPng = Effect.fn('readPng')(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.fromResult(decodePng(yield* fs.readFile(path))).pipe(
    Effect.mapError((e) => KeyUncut.make({ key: path, reason: String(e.message) })),
  );
});

const recut = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(`${RAISE}/record.json`);
  const record = yield* Schema.decodeEffect(RecordJson)(text);
  const front = yield* readPng(FRONT);
  const { figure } = figureOf(front);
  const kept = yield* Effect.fromOption(inkOf(front, (i) => figure[i] === 1)).pipe(
    Effect.mapError(() => KeyUncut.make({ key: 'front', reason: 'the kept front has no ink' })),
  );
  const [x0, y0, x1, y1] = boxOf(record.view);
  const frame = [x1 - x0 + PAD, y1 - y0] as const;
  const origin = [PAD + keptAt(record.view)[0], keptAt(record.view)[1]] as const;
  const canvas = (p: readonly [number, number]) => [p[0] + PAD, p[1]] as const;
  const present = <A>(a: Option.Option<A>, key: string, reason: string) =>
    Effect.fromOption(a).pipe(Effect.mapError(() => KeyUncut.make({ key, reason })));

  const recutKey = Effect.fn('recutKey')(function* (key: typeof Key.Type, n: number) {
    const call = yield* present(
      Arr.findFirst(record.okra.calls, (c) => c.n === n),
      key.id,
      `no okra call ${n}`,
    );
    const elbow = yield* present(Option.fromUndefinedOr(key.elbow), key.id, 'no elbow');
    const wrist = yield* present(Option.fromUndefinedOr(key.wrist), key.id, 'no wrist');
    const drawn = yield* readPng(`${RAISE}/${call.out}`);
    const fit = fitKey(drawn, front, still);
    const cut = cutLimb(keyInFrame(drawn, fit, frame, origin), fit.ground, {
      root: canvas(key.pivot),
      elbow: canvas(elbow),
      wrist: canvas(wrist),
      rUpper: R_UPPER,
      rFore: R_FORE,
    });
    yield* fs.writeFile(`${RAISE}/${key.png}`, encodePng(inkTo(cut.raster, kept)));
    yield* Console.log(
      `${key.id}: fit s ${fit.s.toFixed(4)} dx ${fit.dx.toFixed(1)} dy ${fit.dy.toFixed(1)} error ${fit.error.toFixed(2)}; ${cut.raster.width}x${cut.raster.height} at ${cut.at[0] - PAD},${cut.at[1]}`,
    );
    return { s: 1, dx: cut.at[0] - PAD, dy: cut.at[1] };
  });

  const places = yield* Effect.forEach(record.keys, (key) =>
    Option.match(Option.fromUndefinedOr(key.source.okra), {
      onNone: () => Effect.succeed(key.place),
      onSome: (n) => recutKey(key, n),
    }),
  );
  // the record as it was read, field order kept, with each key's place the only change
  const raw = yield* Schema.decodeEffect(RawJson)(text);
  const rawKeys = yield* Schema.decodeUnknownEffect(Schema.Array(Fields))(raw['keys']);
  const keys = rawKeys.map((key, i) => ({ ...key, place: places[i] }));
  yield* fs.writeFileString(
    `${RAISE}/record.json`,
    `${yield* Schema.encodeEffect(RawJson)({ ...raw, keys })}\n`,
  );
});

if (import.meta.main) recut.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
