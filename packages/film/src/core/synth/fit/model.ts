import { Schema } from 'effect';

const Finite = Schema.Finite;
const Secs = Finite.check(Schema.isGreaterThanOrEqualTo(0));

const Point = Schema.Tuple([Finite, Finite]);
export type Point = readonly [number, number];

const Mode = Schema.Tuple([Finite, Finite, Finite, Finite]);

const Post = Schema.Struct({
  eq_db: Schema.optionalKey(Schema.Array(Finite)),
  pre: Schema.optionalKey(Schema.Unknown),
});

const present = Schema.optionalKey(Schema.Unknown);
const channels = Schema.optionalKey(Schema.Finite);

const post = Schema.optionalKey(Schema.NullOr(Post));

const Modal = Schema.Struct({
  kind: Schema.Literal('modal'),
  length_s: Secs,
  fade_out_s: Schema.optionalKey(Schema.NullOr(Secs)),
  strikes: Schema.Array(
    Schema.Struct({
      t: Secs,
      ramp_ms: Secs,
      modes: Schema.Array(Mode),
      attack: Schema.optionalKey(Schema.NullOr(Schema.Array(Mode))),
    }),
  ),
  sub: present,
  channels,
  noise: Schema.Struct({
    edges: Schema.Array(Finite),
    env: Schema.Array(Schema.Array(Point)),
  }),
  post,
});
export type Modal = typeof Modal.Type;

const Sines = Schema.Struct({
  kind: Schema.Literal('sines'),
  duration: Secs,
  channels,
  onsets: Schema.optionalKey(Schema.NullOr(Schema.Array(Finite))),
  partials: Schema.Array(
    Schema.Struct({
      t0: Secs,
      t1: Secs,
      rel: Secs,
      rise: Secs,
      ph: Finite,
      freq: Schema.NonEmptyArray(Point),
      amp: Schema.NonEmptyArray(Point),
    }),
  ),
  transients: Schema.Array(Schema.Struct({ t: Finite, atoms: Schema.Array(Mode) })),
  residual: Schema.Struct({
    bands: Schema.Array(Finite),
    times: Schema.Array(Finite),
    db: Schema.Array(Schema.Array(Finite)),
  }),
  post,
});
export type Sines = typeof Sines.Type;

const Spectral = Schema.Struct({
  kind: Schema.Literal('spectral_noise'),
  dur: Secs,
  stereo: present,
  texture: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        am: Schema.optionalKey(Schema.Unknown),
        grains: Schema.optionalKey(Schema.Unknown),
      }),
    ),
  ),
  bands: Schema.Struct({
    n: Schema.Int.check(Schema.isGreaterThan(1)),
    f_lo: Finite,
    f_hi: Finite,
  }),
  env: Schema.Struct({ t: Schema.Array(Finite), db: Schema.Array(Schema.Array(Finite)) }),
  ridges: Schema.optionalKey(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          t: Schema.NonEmptyArray(Finite),
          f: Schema.NonEmptyArray(Finite),
          db: Schema.NonEmptyArray(Finite),
        }),
      ),
    ),
  ),
  post,
});
export type Spectral = typeof Spectral.Type;

const EarshotModel = Schema.Union([Modal, Sines, Spectral]).pipe(Schema.toTaggedUnion('kind'));
export type EarshotModel = typeof EarshotModel.Type;

export const EarshotModelJson = Schema.fromJsonString(EarshotModel);
