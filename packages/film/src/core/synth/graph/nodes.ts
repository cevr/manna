import { Predicate, Schema } from 'effect';
import { NOTE_NAME } from './pitch.ts';
import { MAX_CODE_SECS } from './units.ts';

const Secs = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: MAX_CODE_SECS }));
const Level = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
const Db = Schema.Finite.check(Schema.isBetween({ minimum: -120, maximum: 48 }));
const Hz = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 22050, exclusiveMinimum: true }),
);
const Semitones = Schema.Finite.check(Schema.isBetween({ minimum: -48, maximum: 48 }));
const Q = Schema.Finite.check(Schema.isBetween({ minimum: 0.05, maximum: 100 }));
const Depth = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const Factor = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 100, exclusiveMinimum: true }),
);

const NoteName = Schema.String.check(
  Schema.makeFilter(
    (note: string) => NOTE_NAME.test(note) || `"${note}" is no note name of octaves 0 to 8`,
  ),
);

export interface Degree {
  readonly degree: number;
  readonly octave: number;
}
const Degree: Schema.Codec<Degree> = Schema.Struct({
  degree: Schema.Int.check(Schema.isBetween({ minimum: -48, maximum: 48 })),
  octave: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 8 })),
});

export type Pitch = number | string | Degree;
const Pitch: Schema.Codec<Pitch> = Schema.Union([Hz, NoteName, Degree]);

const SCALES = ['majorPentatonic', 'major', 'minor', 'minorPentatonic'] as const;

export interface Key {
  readonly tonic: string;
  readonly scale: (typeof SCALES)[number];
}
const Key: Schema.Codec<Key> = Schema.Struct({
  tonic: Schema.String.check(Schema.isPattern(/^[A-G](#|b)?$/)),
  scale: Schema.Literals(SCALES),
});

interface Vary<U> {
  readonly _tag: 'Vary';
  readonly min: U;
  readonly max: U;
  readonly curve?: 'linear' | 'log';
}

export interface Pick<U> {
  readonly _tag: 'Pick';
  readonly of: readonly [U, ...Array<U>];
  readonly by: 'seed' | 'chance';
}

export type Value<U> = U | Vary<U> | Pick<U>;

export const isVary = <U>(value: Value<U>): value is Vary<U> => Predicate.isTagged(value, 'Vary');

export const isPick = <U>(value: Value<U>): value is Pick<U> => Predicate.isTagged(value, 'Pick');

export type Curve = 'linear' | 'exponential' | 'smooth';
const Curve = Schema.Literals(['linear', 'exponential', 'smooth']);

export const drawable = <U>(value: Value<U>): ReadonlyArray<U> => {
  if (isPick(value)) return value.of;
  if (isVary(value)) return [value.min, value.max];
  return [value];
};

const curveFits = <U>(curve: Curve, values: ReadonlyArray<Value<U>>): boolean =>
  curve !== 'exponential' ||
  values.flatMap(drawable).every((u) => !Predicate.isNumber(u) || u >= 0);

const CURVE_FITS = { expected: 'an exponential curve between values of 0 or more' };

export interface Ramp<U> {
  readonly _tag: 'Ramp';
  readonly from: Value<U>;
  readonly to: Value<U>;
  readonly secs?: Value<number>;
  readonly curve: Curve;
}

export interface Points<U> {
  readonly _tag: 'Points';
  readonly points: readonly [
    readonly [Value<number>, Value<U>],
    ...Array<readonly [Value<number>, Value<U>]>,
  ];
  readonly curve: Curve;
}

export interface Wobble<U> {
  readonly _tag: 'Wobble';
  readonly around: Value<U>;
  readonly depth: Value<number>;
  readonly rate: Value<number>;
}

export interface Lfo<U> {
  readonly _tag: 'Lfo';
  readonly around: Value<U>;
  readonly depth: Value<number>;
  readonly rate: Value<number>;
  readonly wave: 'sine' | 'triangle';
}

export type Signal<U> = Value<U> | Ramp<U> | Points<U> | Wobble<U> | Lfo<U>;

const logBound = <U>(u: U): boolean => !Predicate.isNumber(u) || u > 0;

const value = <U>(unit: Schema.Codec<U>): Schema.Codec<Value<U>> =>
  Schema.Union([
    unit,
    Schema.TaggedStruct('Vary', {
      min: unit,
      max: unit,
      curve: Schema.optionalKey(Schema.Literals(['linear', 'log'])),
    }).check(
      Schema.makeFilter(
        (vary) => vary.curve !== 'log' || (logBound(vary.min) && logBound(vary.max)),
        { expected: 'a log range above 0' },
      ),
    ),
    Schema.TaggedStruct('Pick', {
      of: Schema.NonEmptyArray(unit),
      by: Schema.Literals(['seed', 'chance']),
    }),
  ]);

const signal = <U>(unit: Schema.Codec<U>): Schema.Codec<Signal<U>> => {
  const held = value(unit);
  const moved = {
    around: held,
    depth: value(Depth),
    rate: value(Hz),
  };
  return Schema.Union([
    held,
    Schema.TaggedStruct('Ramp', {
      from: held,
      to: held,
      secs: Schema.optionalKey(value(Secs)),
      curve: Curve,
    }).check(Schema.makeFilter((ramp) => curveFits(ramp.curve, [ramp.from, ramp.to]), CURVE_FITS)),
    Schema.TaggedStruct('Points', {
      points: Schema.NonEmptyArray(Schema.Tuple([value(Secs), held])),
      curve: Curve,
    }).check(
      Schema.makeFilter(
        (points) =>
          curveFits(
            points.curve,
            points.points.map(([, v]) => v),
          ),
        CURVE_FITS,
      ),
    ),
    Schema.TaggedStruct('Wobble', moved),
    Schema.TaggedStruct('Lfo', { ...moved, wave: Schema.Literals(['sine', 'triangle']) }),
  ]);
};

const StreamName = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9.-]*$/));

interface Partial {
  readonly ratio: number;
  readonly level: number;
  readonly decay: number;
  readonly phase?: number;
}
const Partial: Schema.Codec<Partial> = Schema.Struct({
  ratio: Factor,
  level: Level,
  decay: Schema.Finite.check(Schema.isBetween({ minimum: 0.0001, maximum: MAX_CODE_SECS })),
  phase: Schema.optionalKey(Level),
});

export const PARTIAL_SETS = ['glass', 'bell'] as const;

export interface Osc {
  readonly _tag: 'Osc';
  readonly wave: 'sine' | 'triangle' | 'saw' | 'square';
  readonly pitch: Signal<Pitch>;
  readonly duty?: Signal<number>;
  readonly secs: Value<number>;
  readonly phase?: 'random' | number;
  readonly stream?: string;
}

export interface Noise {
  readonly _tag: 'Noise';
  readonly color: 'white' | 'pink' | 'brown';
  readonly secs: Value<number>;
  readonly stream?: string;
}

export interface Partials {
  readonly _tag: 'Partials';
  readonly pitch: Value<Pitch>;
  readonly set: (typeof PARTIAL_SETS)[number] | readonly [Partial, ...Array<Partial>];
  readonly attack?: Value<number>;
  readonly decayScale?: Value<number>;
  readonly secs: Value<number>;
  readonly stream?: string;
}

export interface Sample {
  readonly _tag: 'Sample';
  readonly sound: string;
  readonly seed?: number;
  readonly stream?: string;
}

export interface Gain {
  readonly _tag: 'Gain';
  readonly db: Signal<number>;
  readonly of: Node;
  readonly stream?: string;
}

export interface Envelope {
  readonly _tag: 'Envelope';
  readonly points: readonly [
    readonly [Value<number>, Value<number>],
    ...Array<readonly [Value<number>, Value<number>]>,
  ];
  readonly curve: Curve;
  readonly of: Node;
  readonly stream?: string;
}

export interface Fade {
  readonly _tag: 'Fade';
  readonly in?: Value<number>;
  readonly out?: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

export interface Drive {
  readonly _tag: 'Drive';
  readonly db: Signal<number>;
  readonly transfer: 'tanh' | 'soft' | 'hard' | 'fold';
  readonly of: Node;
  readonly stream?: string;
}

export interface Crush {
  readonly _tag: 'Crush';
  readonly bits?: Value<number>;
  readonly hz?: Signal<number>;
  readonly of: Node;
  readonly stream?: string;
}

export interface Resample {
  readonly _tag: 'Resample';
  readonly semitones: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

export const FILTERS = [
  'lowpass',
  'highpass',
  'bandpass',
  'notch',
  'peak',
  'lowshelf',
  'highshelf',
  'allpass',
] as const;

export interface Filter {
  readonly _tag: 'Filter';
  readonly type: (typeof FILTERS)[number];
  readonly hz: Signal<Pitch>;
  readonly q: Signal<number>;
  readonly db?: Signal<number>;
  readonly of: Node;
  readonly stream?: string;
}

export interface Delay {
  readonly _tag: 'Delay';
  readonly secs: Signal<number>;
  readonly feedback: Value<number>;
  readonly wet: Value<number>;
  readonly tail: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

export interface Reverb {
  readonly _tag: 'Reverb';
  readonly size: Value<number>;
  readonly damp: Value<number>;
  readonly wet: Value<number>;
  readonly tail: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

export interface Loop {
  readonly _tag: 'Loop';
  readonly crossfade: Value<number>;
  readonly of: Node;
  readonly stream?: string;
}

interface Layered {
  readonly node: Node;
  readonly at?: Value<number>;
  readonly db?: Value<number>;
}

export interface Layer {
  readonly _tag: 'Layer';
  readonly of: readonly [Layered, ...Array<Layered>];
  readonly secs?: Value<number>;
  readonly stream?: string;
}

export interface Sequence {
  readonly _tag: 'Sequence';
  readonly of: readonly [Node, ...Array<Node>];
  readonly gap?: Value<number>;
  readonly stream?: string;
}

interface Count {
  readonly _tag: 'Count';
  readonly every: Value<number>;
  readonly count: Value<number>;
}

interface During {
  readonly _tag: 'During';
  readonly every: Value<number>;
  readonly secs: Value<number>;
}

interface Poisson {
  readonly _tag: 'Poisson';
  readonly rate: Value<number>;
  readonly secs: Value<number>;
}

export interface Repeat {
  readonly _tag: 'Repeat';
  readonly of: Node;
  readonly timing: Count | During | Poisson;
  readonly stream?: string;
}

export type Node =
  | Osc
  | Noise
  | Partials
  | Sample
  | Gain
  | Envelope
  | Fade
  | Drive
  | Crush
  | Resample
  | Filter
  | Delay
  | Reverb
  | Loop
  | Layer
  | Sequence
  | Repeat;

const Child = Schema.suspend((): Schema.Codec<Node> => Node);
const stream = Schema.optionalKey(StreamName);
const Every = Schema.Finite.check(Schema.isBetween({ minimum: 0.005, maximum: MAX_CODE_SECS }));

const Osc: Schema.Codec<Osc> = Schema.TaggedStruct('Osc', {
  wave: Schema.Literals(['sine', 'triangle', 'saw', 'square']),
  pitch: signal(Pitch),
  duty: Schema.optionalKey(signal(Level)),
  secs: value(Secs),
  phase: Schema.optionalKey(Schema.Union([Schema.Literal('random'), Level])),
  stream,
});

const Noise: Schema.Codec<Noise> = Schema.TaggedStruct('Noise', {
  color: Schema.Literals(['white', 'pink', 'brown']),
  secs: value(Secs),
  stream,
});

const Partials: Schema.Codec<Partials> = Schema.TaggedStruct('Partials', {
  pitch: value(Pitch),
  set: Schema.Union([Schema.Literals(PARTIAL_SETS), Schema.NonEmptyArray(Partial)]),
  attack: Schema.optionalKey(value(Secs)),
  decayScale: Schema.optionalKey(value(Factor)),
  secs: value(Secs),
  stream,
});

const Sample: Schema.Codec<Sample> = Schema.TaggedStruct('Sample', {
  sound: Schema.String,
  seed: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  stream,
});

const Gain: Schema.Codec<Gain> = Schema.TaggedStruct('Gain', { db: signal(Db), of: Child, stream });

const Envelope: Schema.Codec<Envelope> = Schema.TaggedStruct('Envelope', {
  points: Schema.NonEmptyArray(Schema.Tuple([value(Secs), value(Level)])),
  curve: Curve,
  of: Child,
  stream,
});

const Fade: Schema.Codec<Fade> = Schema.TaggedStruct('Fade', {
  in: Schema.optionalKey(value(Secs)),
  out: Schema.optionalKey(value(Secs)),
  of: Child,
  stream,
});

const Drive: Schema.Codec<Drive> = Schema.TaggedStruct('Drive', {
  db: signal(Db),
  transfer: Schema.Literals(['tanh', 'soft', 'hard', 'fold']),
  of: Child,
  stream,
});

const Crush: Schema.Codec<Crush> = Schema.TaggedStruct('Crush', {
  bits: Schema.optionalKey(value(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 })))),
  hz: Schema.optionalKey(signal(Hz)),
  of: Child,
  stream,
});

const Resample: Schema.Codec<Resample> = Schema.TaggedStruct('Resample', {
  semitones: value(Semitones),
  of: Child,
  stream,
});

const Filter: Schema.Codec<Filter> = Schema.TaggedStruct('Filter', {
  type: Schema.Literals(FILTERS),
  hz: signal(Pitch),
  q: signal(Q),
  db: Schema.optionalKey(signal(Db)),
  of: Child,
  stream,
});

const Delay: Schema.Codec<Delay> = Schema.TaggedStruct('Delay', {
  secs: signal(Schema.Finite.check(Schema.isBetween({ minimum: 1 / 44100, maximum: 2 }))),
  feedback: value(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 0.95 }))),
  wet: value(Level),
  tail: value(Secs),
  of: Child,
  stream,
});

const Reverb: Schema.Codec<Reverb> = Schema.TaggedStruct('Reverb', {
  size: value(Level),
  damp: value(Hz),
  wet: value(Level),
  tail: value(Secs),
  of: Child,
  stream,
});

const Loop: Schema.Codec<Loop> = Schema.TaggedStruct('Loop', {
  crossfade: value(Secs),
  of: Child,
  stream,
});

const Layered: Schema.Codec<Layered> = Schema.Struct({
  node: Child,
  at: Schema.optionalKey(value(Secs)),
  db: Schema.optionalKey(value(Db)),
});

const Layer: Schema.Codec<Layer> = Schema.TaggedStruct('Layer', {
  of: Schema.NonEmptyArray(Layered),
  secs: Schema.optionalKey(value(Secs)),
  stream,
});

const Sequence: Schema.Codec<Sequence> = Schema.TaggedStruct('Sequence', {
  of: Schema.NonEmptyArray(Child),
  gap: Schema.optionalKey(value(Secs)),
  stream,
});

const Repeat: Schema.Codec<Repeat> = Schema.TaggedStruct('Repeat', {
  of: Child,
  timing: Schema.Union([
    Schema.TaggedStruct('Count', {
      every: value(Every),
      count: value(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000 }))),
    }),
    Schema.TaggedStruct('During', { every: value(Every), secs: value(Secs) }),
    Schema.TaggedStruct('Poisson', {
      rate: value(Schema.Finite.check(Schema.isBetween({ minimum: 0.01, maximum: 400 }))),
      secs: value(Secs),
    }),
  ]),
  stream,
});

export const Node = Schema.Union([
  Osc,
  Noise,
  Partials,
  Sample,
  Gain,
  Envelope,
  Fade,
  Drive,
  Crush,
  Resample,
  Filter,
  Delay,
  Reverb,
  Loop,
  Layer,
  Sequence,
  Repeat,
]).pipe(Schema.toTaggedUnion('_tag'));

export interface CodeSound {
  readonly key?: Key;
  readonly play: Node;
}
export const CodeSound: Schema.Codec<CodeSound> = Schema.Struct({
  key: Schema.optionalKey(Key),
  play: Child,
});
