import { Array as Arr, Option, Predicate, Schema, SchemaTransformation, Struct } from 'effect';
import { ActName, Address, PartId } from './address-schema.ts';
import { isSegment } from './segment.ts';
import { SketchItem } from './sketch.ts';
import type { ease } from './time.ts';

const PRINT_WIDTH = 100;

const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

const scalarText = (value: Json): string =>
  (Predicate.isNumber(value) && jsonText(value).replace('e+', 'e')) || jsonText(value);

const jsonValue = Schema.decodeSync(Schema.fromJsonString(Schema.Json));

type Json = Schema.Json;

const isArray = (value: Json): value is Schema.JsonArray => Array.isArray(value);

const isObject = (value: Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !isArray(value);

const entriesOf = (value: Json): ReadonlyArray<readonly [string, Json]> =>
  (isObject(value) && Object.entries(value)) || [];

const flatJson = (value: Json): string => {
  if (isArray(value)) return `[${value.map(flatJson).join(', ')}]`;
  if (!isObject(value)) return scalarText(value);
  const entries = entriesOf(value);
  if (entries.length === 0) return '{}';
  return `{ ${entries.map(([k, v]) => `${jsonText(k)}: ${flatJson(v)}`).join(', ')} }`;
};

const isMatrix = (items: ReadonlyArray<Json>): boolean =>
  items.length > 1 && items.every((v) => (isArray(v) && v.length > 1) || entriesOf(v).length > 1);

const breaksAlways = (value: Json): boolean =>
  (isArray(value) && (isMatrix(value) || value.some(breaksAlways))) || entriesOf(value).length > 0;

const filled = (numbers: ReadonlyArray<string>, indent: string): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  numbers.forEach((n, k) => {
    const last = lines.at(-1);
    const comma = Number(k < numbers.length - 1);
    if (
      Predicate.isNotUndefined(last) &&
      indent.length + last.length + 2 + n.length + comma <= PRINT_WIDTH
    )
      lines[lines.length - 1] = `${last}, ${n}`;
    else lines.push(n);
  });
  return lines;
};

const printJson = (value: Json, indent: string, column: number, tail: number): string => {
  const inner = `${indent}  `;
  if (isArray(value)) {
    if (value.length === 0) return '[]';
    const flat = flatJson(value);
    if (!breaksAlways(value) && column + flat.length + tail <= PRINT_WIDTH) return flat;
    const lines =
      (value.every(Predicate.isNumber) &&
        filled(
          value.map((n) => scalarText(n)),
          inner,
        )) ||
      value.map((v, k) => printJson(v, inner, inner.length, (k < value.length - 1 && 1) || 0));
    return `[\n${lines.map((line) => `${inner}${line}`).join(',\n')}\n${indent}]`;
  }
  if (!isObject(value)) return scalarText(value);
  const entries = entriesOf(value);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, v], i) => {
    const key = `${jsonText(k)}: `;
    const rest = (i < entries.length - 1 && 1) || 0;
    return `${inner}${key}${printJson(v, inner, inner.length + key.length, rest)}`;
  });
  return `{\n${lines.join(',\n')}\n${indent}}`;
};

export const repoJson = <S extends Parameters<typeof Schema.fromJsonString>[0]>(schema: S) =>
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.fromJsonString(schema),
      SchemaTransformation.transform<string, string>({
        decode: (text) => text,
        encode: (json) => `${printJson(jsonValue(json), '', 0, 0)}\n`,
      }),
    ),
  );

const repeated = (names: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(names.filter((name, i) => names.indexOf(name) !== i)),
];

export const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const maybe = <S extends Schema.Top>(schema: S) => Schema.OptionFromOptionalKey(schema);

export const TAKE_TOLERANCE = 0.05;

export const Word = Schema.Struct({
  text: Schema.String,
  start: Seconds,
  end: Seconds,
}).check(Schema.makeFilter((w) => w.start <= w.end || `"${w.text}" ends before it starts`));
export type Word = typeof Word.Type;

export const Heard = Seconds.pipe(Schema.brand('Heard'));
export type Heard = typeof Heard.Type;

export const Voiced = Schema.Struct({ start: Heard, end: Heard });
export type Voiced = typeof Voiced.Type;

export interface HeardWord extends Voiced {
  readonly text: string;
}

export const TakeWord = Schema.Struct({
  text: Schema.String,
  start: Seconds,
  end: Seconds,
  voiced: Voiced,
}).check(
  Schema.makeFilter((w) => {
    if (w.start > w.end) return `"${w.text}" ends before it starts`;
    const { start, end } = w.voiced;
    return (
      (w.start <= start && start <= end && end <= w.end) ||
      `"${w.text}" is heard ${start}–${end}s, outside its ${w.start}–${w.end}s span`
    );
  }),
);
export type TakeWord = typeof TakeWord.Type;

export const TakeSource = Schema.Literals(['elevenlabs', 'recorded']);
export type TakeSource = typeof TakeSource.Type;

export const VoiceTiming = Schema.Struct({
  hash: Schema.String,
  file: Schema.String,
  duration: Seconds,
  words: Schema.Array(TakeWord),
  delivered: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(TakeSource).pipe(
    Schema.decodeTo(
      TakeSource,
      SchemaTransformation.transformOptional({
        decode: (source) => Option.orElseSome(source, (): TakeSource => 'elevenlabs'),
        encode: (source) => Option.filter(source, (s) => s !== 'elevenlabs'),
      }),
    ),
  ),
}).check(
  Schema.makeFilter((take) => {
    const issues: Array<Schema.FilterIssue> = [];
    for (const [i, w] of take.words.entries()) {
      const early = Option.exists(Arr.get(take.words, i - 1), (before) => w.start < before.start);
      if (early)
        issues.push({
          path: ['words', i],
          issue: `"${w.text}" starts before the word ahead of it`,
        });
      if (w.end > take.duration + TAKE_TOLERANCE)
        issues.push({
          path: ['words', i],
          issue: `"${w.text}" ends at ${w.end}s, after the ${take.duration}s take`,
        });
    }
    return issues;
  }),
);
export type VoiceTiming = typeof VoiceTiming.Type;

export const Timings = Schema.Struct({
  voice: Schema.String,
  scenes: Schema.Record(Schema.String, VoiceTiming),
});
export type Timings = typeof Timings.Type;

export const TimingsJson = repoJson(Timings);

const VoiceSettings = Schema.Record(Schema.String, Schema.Finite);

const settingsOnly = (model: string, keys: ReadonlyArray<string>) =>
  Schema.makeFilter((settings: Readonly<Record<string, number>>) => {
    const entries = Object.entries(settings);
    const unknown = entries.filter(([key]) => !keys.includes(key)).map(([key]) => key);
    if (unknown.length > 0) {
      return `${model} takes ${keys.join(' and ')} only, not ${unknown.join(', ')}`;
    }
    const out = entries.filter(([, value]) => value < 0 || value > 1).map(([key]) => key);
    return out.length === 0 || `${out.join(', ')} must be from 0 to 1`;
  });

export const Reader = Schema.Union([
  Schema.Struct({
    voiceId: Schema.String,
    model: Schema.Literals(['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5']),
    settings: VoiceSettings,
  }),
  Schema.Struct({
    voiceId: Schema.String,
    model: Schema.Literal('eleven_v4'),
    settings: VoiceSettings.check(settingsOnly('eleven_v4', ['stability', 'similarity_boost'])),
  }),
]);
export type Reader = typeof Reader.Type;

const CastVoice = Schema.Struct({ name: Schema.String, voiceId: Schema.String });
type CastVoice = typeof CastVoice.Type;

export const Cast = Schema.Struct({
  model: Schema.Literals(['eleven_v3', 'eleven_v4']),
  settings: VoiceSettings.check(
    Schema.makeFilter(
      (settings: Readonly<Record<string, number>>) =>
        'stability' in settings || 'a cast needs stability',
    ),
    settingsOnly('text-to-dialogue', ['stability', 'similarity']),
  ),
  voices: Schema.NonEmptyArray(CastVoice),
}).check(
  Schema.makeFilter((cast) => {
    const twice = repeated(cast.voices.map((v) => v.name));
    return twice.length === 0 || `the cast names ${twice.join(', ')} more than once`;
  }),
);
export type Cast = typeof Cast.Type;

export const Voice = Schema.Union([Reader, Cast]);
export type Voice = typeof Voice.Type;

export const isCast = (voice: Voice): voice is Cast => 'voices' in voice;

export const Transition = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('cut') }),
  Schema.Struct({ kind: Schema.Literal('fade'), dur: Seconds }),
  Schema.Struct({
    kind: Schema.Literal('pan'),
    dur: Seconds,
    dir: Schema.optionalKey(Schema.Literals([1, -1])),
  }),
  Schema.Struct({
    kind: Schema.Literal('ink'),
    dur: Seconds,
    color: Schema.optionalKey(Schema.String),
  }),
]);
export type Transition = typeof Transition.Type;

export const EaseName = Schema.Literals([
  'linear',
  'inQuad',
  'outQuad',
  'inOutQuad',
  'inCubic',
  'outCubic',
  'inOutCubic',
  'outQuart',
  'inOutQuart',
  'outExpo',
  'inOutExpo',
  'inSine',
  'inOutSine',
  'outBack',
  'outSoft',
]);
export type EaseName = typeof EaseName.Type;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type _EaseNamesMatch = Assert<Same<EaseName, keyof typeof ease>>;

const Landmark = Schema.Literals(['start', 'speech', 'speechEnd', 'end']);
type Landmark = typeof Landmark.Type;

const none = Schema.optionalKey(Schema.Never);

const onMark = {
  mark: Schema.String,
  word: Schema.optionalKey(Schema.String),
  cue: none,
  edge: none,
  at: none,
};

const onCue = {
  cue: Schema.String,
  edge: Schema.optionalKey(Schema.Literals(['start', 'end'])),
  mark: none,
  word: none,
  at: none,
};

const onLandmark = { at: Landmark, mark: none, word: none, cue: none, edge: none };

export const ScenePoint = Schema.Union([
  Schema.Struct(onMark),
  Schema.Struct(onCue),
  Schema.Struct(onLandmark),
]);
export type ScenePoint = typeof ScenePoint.Type;

const Share = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

const spanTiming = {
  offset: Schema.optionalKey(Schema.Finite),
  ease: Schema.optionalKey(EaseName),
  stagger: Schema.optionalKey(Share),
  silence: Schema.optionalKey(Schema.Literal(true)),
  track: Schema.optionalKey(Schema.NonEmptyString),
};

const byDur = {
  dur: Schema.optionalKey(Seconds),
  ends: Schema.optionalKey(Schema.Literal(true)),
  until: Schema.optionalKey(Schema.Never),
  untilOffset: Schema.optionalKey(Schema.Never),
};

export const Until = Schema.Union([
  Schema.String,
  Schema.Struct({ at: Landmark, cue: none, edge: none }),
  Schema.Struct({
    cue: Schema.String,
    edge: Schema.optionalKey(Schema.Literals(['start', 'end'])),
    at: none,
  }),
]);
export type Until = typeof Until.Type;

const untilPoint = {
  until: Until,
  untilOffset: Schema.optionalKey(Schema.Finite),
  dur: Schema.optionalKey(Schema.Never),
  ends: Schema.optionalKey(Schema.Never),
};

const anchored = <A extends Schema.Struct.Fields>(anchor: A) =>
  [
    Schema.Struct({ ...anchor, ...spanTiming, ...byDur }),
    Schema.Struct({ ...anchor, ...spanTiming, ...untilPoint }),
  ] as const;

export const Span = Schema.Union([
  ...anchored({
    mark: Schema.String,
    word: Schema.optionalKey(Schema.String),
  }),
  ...anchored({ after: Schema.String }),
  ...anchored({ with: Schema.String }),
  ...anchored({ at: Landmark }),
]);
export type Span = typeof Span.Type;

export const Timeline = Schema.Record(Schema.String, Span);
export type Timeline = typeof Timeline.Type;

export const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);
export type Point = typeof Point.Type;

export const Knob = Schema.Union([Schema.Finite, Point]);
export type Knob = typeof Knob.Type;

export const Knobs = Schema.Record(Schema.String, Knob);
export type Knobs = typeof Knobs.Type;

export const Timed = Schema.Struct({
  id: PartId,
  say: Schema.optionalKey(Schema.String),
  lead: Schema.optionalKey(Seconds),
  tail: Schema.optionalKey(Seconds),
  min: Schema.optionalKey(Seconds),
  enter: Schema.optionalKey(Transition),
  timeline: Schema.optionalKey(Timeline),
  knobs: Schema.optionalKey(Knobs),
  storyboard: Schema.optionalKey(Schema.Literal(true)),
});
export type Timed = typeof Timed.Type;

export const Beat = Schema.Struct({
  id: Timed.fields.id,
  say: Timed.fields.say,
  lead: Timed.fields.lead,
  tail: Timed.fields.tail,
  min: Timed.fields.min,
  enter: Timed.fields.enter,
  cite: Schema.optionalKey(Schema.Array(Schema.String)),
  picture: Schema.String,
  cast: Schema.optionalKey(
    Schema.Array(
      Schema.String.check(
        Schema.makeFilter((name: string) => isSegment(name) || `${name} is not one path segment`),
      ),
    ),
  ),
});
export type Beat = typeof Beat.Type;

export const defineScript = <const Id extends string>(
  beats: ReadonlyArray<Beat & { readonly id: Id }>,
): ReadonlyArray<Beat & { readonly id: Id }> => beats;

export const HeardAs = Schema.Record(Schema.String, Schema.Array(Schema.String));
export type HeardAs = typeof HeardAs.Type;

export const ShortSpan = Schema.Struct({
  scene: Schema.String,
  from: ScenePoint,
  to: ScenePoint,
});
export type ShortSpan = typeof ShortSpan.Type;

export const Short = Schema.Struct({
  id: PartId,
  title: Schema.String,
  hook: Schema.optionalKey(Schema.NonEmptyString),
  spans: Schema.NonEmptyArray(ShortSpan),
});
export type Short = typeof Short.Type;

export const Shorts = Schema.Array(Short).check(
  Schema.makeFilter((shorts) => {
    const twice = repeated(shorts.map((s) => s.id));
    return twice.length === 0 || `short ids must be unique: ${twice.join(', ')}`;
  }),
);
export type Shorts = typeof Shorts.Type;

const inScene = { scene: Schema.String, offset: Schema.optionalKey(Schema.Finite) };

export const Cue = Schema.Union([
  Schema.Struct({ ...inScene, ...onMark }),
  Schema.Struct({ ...inScene, ...onCue }),
  Schema.Struct({ ...inScene, ...onLandmark }),
]);
export type Cue = typeof Cue.Type;

export const Movement = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  styles: Schema.Array(Schema.String),
  avoid: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type Movement = typeof Movement.Type;

export const MusicModel = Schema.Literals(['music_v2', 'music_v2_5']);

export const Music = Schema.Struct({
  model: MusicModel,
  styles: Schema.Array(Schema.String),
  avoid: Schema.Array(Schema.String),
  movements: Schema.Array(Movement),
});
export type Music = typeof Music.Type;

export const Score = Schema.Struct({
  play: Schema.String,
  under: Schema.Finite,
  alone: Schema.Finite,
  options: Schema.Record(Schema.String, Music),
}).check(
  Schema.makeFilter(
    (score) =>
      Object.hasOwn(score.options, score.play) ||
      `plays "${score.play}", which is none of its options (${Object.keys(score.options).join(', ')})`,
  ),
);
export type Score = typeof Score.Type;

export const SoundEffect = Schema.Struct({
  sound: Schema.String,
  level: Schema.optionalKey(Schema.Finite),
  sync: Schema.optionalKey(Schema.Literals(['start', 'onset', 'hit'])),
  at: Schema.Array(Cue),
});
export type SoundEffect = typeof SoundEffect.Type;

const SoundBed = Schema.Struct({
  sound: Schema.String,
  level: Schema.optionalKey(Schema.Finite),
  from: Cue,
  to: Cue,
  fade: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
});
type SoundBed = typeof SoundBed.Type;

export const Sound = Schema.Struct({
  seed: Schema.optionalKey(Schema.String),
  score: Schema.optionalKey(Score),
  beds: Schema.optionalKey(Schema.Array(SoundBed)),
  effects: Schema.Record(Schema.String, SoundEffect),
});
export type Sound = typeof Sound.Type;

export const ScoreAsset = Schema.Struct({
  hash: Schema.String,
  file: Schema.String,
  sha256: Schema.String,
  through: Schema.optionalKey(Schema.String),
});
export type ScoreAsset = typeof ScoreAsset.Type;

export const SoundManifest = Schema.Struct({
  scores: Schema.optionalKey(Schema.Record(Schema.String, ScoreAsset)),
});
export type SoundManifest = typeof SoundManifest.Type;

export const SoundManifestJson = repoJson(SoundManifest);

export const PlanChunk = Schema.Struct({
  text: Schema.String,
  duration_ms: Schema.Int,
  positive_styles: Schema.Array(Schema.String),
  negative_styles: Schema.Array(Schema.String),
  context_adherence: Schema.Literal('high'),
});
export type PlanChunk = typeof PlanChunk.Type;

export const Plan = Schema.Struct({ chunks: Schema.Array(PlanChunk) });
export type Plan = typeof Plan.Type;

export const VoiceKey = Schema.fromJsonString(VoiceSettings);

export const MusicRequestKey = Schema.fromJsonString(
  Schema.Struct({ model: MusicModel, plan: Plan }),
);

const Range = Schema.Tuple([Schema.Finite, Schema.Finite]);

export const Act = Schema.Struct({
  from: PartId,
  name: ActName,
  chapter: Schema.optionalKey(Schema.String),
  luma: Schema.optionalKey(Range),
  saturation: Schema.optionalKey(Range),
  dark: Schema.optionalKey(Share),
});
export type Act = typeof Act.Type;

export const Look = Schema.Struct({
  acts: Schema.Array(Act).check(
    Schema.makeFilter((acts) => {
      const twice = repeated(acts.map((a) => a.name));
      return twice.length === 0 || `acts must be named once: ${twice.join(', ')}`;
    }),
  ),
});
export type Look = typeof Look.Type;

const LookOption = Schema.Struct({
  options: Schema.Record(Schema.String, Schema.Finite),
  play: Schema.String,
}).check(
  Schema.makeFilter(
    (look) =>
      Object.hasOwn(look.options, look.play) ||
      `plays "${look.play}", which is none of its levels (${Object.keys(look.options).join(', ')})`,
  ),
);
type LookOption = typeof LookOption.Type;

export const Looks = Schema.Record(Schema.String, LookOption);
export type Looks = typeof Looks.Type;

const NoteBox = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  h: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
});
type NoteBox = typeof NoteBox.Type;

const InkStroke = Schema.Array(Point);
type InkStroke = typeof InkStroke.Type;

export const NoteAuthor = Schema.Literals(['user', 'agent']);
export type NoteAuthor = typeof NoteAuthor.Type;

export const NoteStatus = Schema.Literals(['open', 'replied', 'resolved']);
export type NoteStatus = typeof NoteStatus.Type;

const Seq = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const Reply = Schema.Struct({
  seq: Seq,
  by: NoteAuthor,
  text: Schema.String,
  still: Schema.optionalKey(Schema.String),
  at: Schema.String,
});
export type Reply = typeof Reply.Type;

const NoteCue = Schema.Struct({
  name: Schema.String,
  edge: Schema.Literals(['start', 'end']),
});
type NoteCue = typeof NoteCue.Type;

const NoteRange = Schema.Struct({ from: Seconds, to: Seconds }).check(
  Schema.makeFilter((r) => r.to > r.from || 'a range ends after it starts'),
);
type NoteRange = typeof NoteRange.Type;

const NoteSource = Schema.Struct({
  file: Schema.String,
  line: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  text: Schema.String,
});
type NoteSource = typeof NoteSource.Type;

export const NoteWords = Schema.Struct({
  beat: Schema.String,
  from: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  to: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  text: Schema.String,
}).check(Schema.makeFilter((w) => w.to >= w.from || 'the words end at or after they start'));
export type NoteWords = typeof NoteWords.Type;

const NoteKind = Schema.Literals(['note', 'correction', 'removal']);
type NoteKind = typeof NoteKind.Type;

const PanelAsk = Schema.Literals(['note', 'tweak']);
type PanelAsk = typeof PanelAsk.Type;

const NotePanel = Schema.Struct({
  id: Schema.String,
  try: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  ask: Schema.optionalKey(PanelAsk),
});
type NotePanel = typeof NotePanel.Type;

interface Asking {
  readonly words?: NoteWords;
  readonly kind?: NoteKind;
  readonly replace?: string;
}

const saysOtherWords = (n: Asking): boolean =>
  Option.exists(
    Option.fromUndefinedOr(n.replace),
    (r) => r.trim() !== '' && r.trim() !== n.words?.text,
  );

const ASKS_OF_WORDS = Schema.makeFilterGroup<Asking>([
  Schema.makeFilter(
    (n) =>
      !('kind' in n) ||
      'words' in n || { path: ['kind'], issue: 'a note asks something only of its words' },
  ),
  Schema.makeFilter(
    (n) =>
      !('replace' in n) ||
      n.kind === 'correction' || {
        path: ['replace'],
        issue: 'only a correction says words instead',
      },
  ),
  Schema.makeFilter(
    (n) =>
      n.kind !== 'correction' ||
      saysOtherWords(n) || {
        path: ['replace'],
        issue: 'a correction says other words than its own',
      },
  ),
]);

export const NoteDraft = Schema.Struct({
  scene: Schema.String,
  T: Seconds,
  local: Schema.optionalKey(Seconds),
  frame: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  cue: Schema.optionalKey(NoteCue),
  mark: Schema.optionalKey(Schema.String),
  range: Schema.optionalKey(NoteRange),
  source: Schema.optionalKey(NoteSource),
  words: Schema.optionalKey(NoteWords),
  kind: Schema.optionalKey(NoteKind),
  replace: Schema.optionalKey(Schema.String),
  panel: Schema.optionalKey(NotePanel),
  sketch: Schema.optionalKey(Schema.Array(SketchItem)),
  box: Schema.optionalKey(NoteBox),
  ink: Schema.optionalKey(Schema.Array(InkStroke)),
  text: Schema.String.check(Schema.isNonEmpty()),
}).check(ASKS_OF_WORDS);
export type NoteDraft = typeof NoteDraft.Type;

export const Note = Schema.Struct({
  ...NoteDraft.fields,
  id: Schema.String,
  film: Schema.String,
  seq: Seq,
  changed: Seq,
  status: NoteStatus,
  still: Schema.String,
  thread: Schema.Array(Reply),
  createdAt: Schema.String,
}).check(ASKS_OF_WORDS);
export type Note = typeof Note.Type;

export const NotesFile = Schema.Struct({
  film: Schema.String,
  seq: Seq,
  notes: Schema.Array(Note),
});
export type NotesFile = typeof NotesFile.Type;

export const NotesFileJson = repoJson(NotesFile);

export const NoteEvent = Schema.Union([
  Schema.TaggedStruct('NoteAdded', { seq: Seq, note: Note }),
  Schema.TaggedStruct('NoteReplied', { seq: Seq, note: Note, reply: Reply }),
  Schema.TaggedStruct('NoteResolved', { seq: Seq, note: Note }),
]);
export type NoteEvent = typeof NoteEvent.Type;

export const NotesWait = Schema.Struct({ cursor: Seq, events: Schema.Array(NoteEvent) });
export type NotesWait = typeof NotesWait.Type;

const CueOffset = Schema.Finite;

const CueDur = Seconds;

export const CuePatchFields = {
  offset: Schema.optionalKey(
    CueOffset.annotate({ description: "The cue's offset from its anchor, in seconds." }),
  ),
  dur: Schema.optionalKey(CueDur.annotate({ description: "The cue's length, in seconds." })),
  until: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "End on this mark instead: it replaces the span's `dur`, as a `dur` replaces its `until`, and ends on the mark itself unless `untilOffset` comes with it.",
    }),
  ),
  untilOffset: Schema.optionalKey(
    CueOffset.annotate({
      description:
        'Where an `until` span ends off its point, in seconds: 0 puts it back on the point (the key dropped).',
    }),
  ),
  ease: Schema.optionalKey(
    EaseName.annotate({ description: 'The ease `f.at` applies across the cue, by its name.' }),
  ),
  stagger: Schema.optionalKey(
    Share.annotate({ description: "The cue's stagger across its items, a share from 0 to 1." }),
  ),
};

export const CUE_PATCH_KEYS = Struct.keys(CuePatchFields);

const Patched = Schema.Struct(CuePatchFields);
type Patched = typeof Patched.Type;

export const spanEnds = [
  Schema.makeFilter(
    (p: Patched) =>
      !('dur' in p && 'until' in p) || 'a span ends by its dur or on a mark, not both',
  ),
  Schema.makeFilter(
    (p: Patched) =>
      !('dur' in p && 'untilOffset' in p) ||
      'a span that ends by its dur has no until point to be off',
  ),
] as const;

export const CuePatch = Schema.Struct(CuePatchFields)
  .check(
    Schema.makeFilter(
      (p) => Object.keys(p).length > 0 || `set at least one of ${CUE_PATCH_KEYS.join(', ')}`,
    ),
  )
  .check(...spanEnds);
export type CuePatch = typeof CuePatch.Type;

export const ResolvedCue = Schema.Struct({
  start: Schema.Finite,
  end: Schema.Finite,
  dur: Schema.Finite,
  ease: EaseName,
  stagger: Share,
});
export type ResolvedCue = typeof ResolvedCue.Type;

export const FindingAddress = Schema.Struct({
  part: Address,
  time: Schema.optionalKey(Schema.Finite),
});
export type FindingAddress = typeof FindingAddress.Type;

export const CheckLine = Schema.Struct({
  level: Schema.Literals(['error', 'warning']),
  tag: Schema.String,
  message: Schema.String,
  address: Schema.optionalKey(FindingAddress),
});
export type CheckLine = typeof CheckLine.Type;

const LabStep = Schema.Struct({
  scene: Schema.optionalKey(Schema.String),
  file: Schema.String,
  target: Schema.String,
});

export const ChangeId = Schema.String.pipe(Schema.brand('ChangeId'));
export type ChangeId = typeof ChangeId.Type;

export const RequestId = Schema.String.pipe(Schema.brand('RequestId'));
export type RequestId = typeof RequestId.Type;

export const CodeRange = Schema.Tuple([Schema.Int, Schema.Int]);
export type CodeRange = typeof CodeRange.Type;

const CodeSite = Schema.Struct({
  name: Schema.String,
  at: CodeRange,
  reads: Schema.Array(CodeRange),
});

const MarkSite = Schema.Struct({
  name: Schema.String,
  reads: Schema.Array(CodeRange),
  speaks: Schema.Array(Schema.Struct({ at: CodeRange, to: Schema.optionalKey(Schema.String) })),
});

export const SceneCode = Schema.Struct({
  scene: Schema.String,
  file: Schema.String,
  text: Schema.String,
  cues: Schema.Array(CodeSite),
  knobs: Schema.Array(CodeSite),
  marks: Schema.Array(MarkSite),
  refused: Schema.Array(
    Schema.Struct({ field: Schema.Literals(['timeline', 'knobs']), reason: Schema.String }),
  ),
});
export type SceneCode = typeof SceneCode.Type;

export const PageBuild = Schema.Struct({ build: Schema.Finite, server: Schema.String });
export type PageBuild = typeof PageBuild.Type;

const mixedField = { mixed: Schema.optionalKey(PageBuild) } as const;

export const LabWrite = Schema.Struct({
  ...LabStep.fields,
  change: Schema.optionalKey(ChangeId),
  span: Schema.optionalKey(Span),
  resolved: Schema.optionalKey(ResolvedCue),
  unresolved: Schema.optionalKey(Schema.String),
  knob: Schema.optionalKey(Knob),
  findings: Schema.Array(CheckLine),
  ...mixedField,
});
export type LabWrite = typeof LabWrite.Type;
