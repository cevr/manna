import { Schema } from 'effect';
import { PanelText } from './board.ts';
import { RenderKind } from './catalogue.ts';

const BeatVoice = Schema.Literals(['silent', 'estimated', 'staging', 'owner']);
export type BeatVoice = typeof BeatVoice.Type;

const TimedMark = Schema.Struct({ name: Schema.String, at: Schema.Finite });

const BeatHold = Schema.Struct({
  lead: Schema.Finite,
  tail: Schema.Finite,
  declared: Schema.Array(Schema.Literals(['lead', 'tail'])),
  asked: Schema.Finite,
  min: Schema.Finite,
});
export type BeatHold = typeof BeatHold.Type;

const ClockBeat = Schema.Struct({
  id: Schema.String,
  start: Schema.Finite,
  dur: Schema.Finite,
  hold: BeatHold,
  speech: Schema.optionalKey(Schema.Struct({ start: Schema.Finite, end: Schema.Finite })),
  marks: Schema.Array(TimedMark),
  words: Schema.optionalKey(
    Schema.Array(Schema.Struct({ text: Schema.String, start: Schema.Finite })),
  ),
  voice: BeatVoice,
  drawn: Schema.Boolean,
});
export type ClockBeat = typeof ClockBeat.Type;

const ClockPart = Schema.Struct({
  name: Schema.String,
  from: Schema.String,
  start: Schema.Finite,
  end: Schema.Finite,
});
export type ClockPart = typeof ClockPart.Type;

export const FilmClock = Schema.Struct({
  fps: Schema.Finite,
  beats: Schema.Array(ClockBeat),
  acts: Schema.Array(ClockPart),
  movements: Schema.Array(ClockPart),
});
export type FilmClock = typeof FilmClock.Type;

const VersionFiles = Schema.Literals(['folder', 'film', 'none']);
export type VersionFiles = typeof VersionFiles.Type;

const FilmVersion = Schema.Struct({
  n: Schema.Int,
  title: Schema.String,
  open: Schema.Boolean,
  files: VersionFiles,
});
export type FilmVersion = typeof FilmVersion.Type;

export const Stage = Schema.Literals([
  'script',
  'concept',
  'board',
  'voice',
  'animatic',
  'scenes',
  'sound',
  'render',
  'shorts',
]);
export type Stage = typeof Stage.Type;

export const Track = Schema.Literals([
  'script',
  'concept',
  'board',
  'voice',
  'scenes',
  'sound',
  'render',
]);
export type Track = typeof Track.Type;

const ClipState = Schema.Literals(['made', 'kept', 'approved']);
export type ClipState = typeof ClipState.Type;

const ClipClock = Schema.Literals(['measured', 'estimated']);
export type ClipClock = typeof ClipClock.Type;

const ClipFields = {
  start: Schema.Finite,
  dur: Schema.Finite,
  state: ClipState,
  clock: ClipClock,
};

const ScriptClip = Schema.Struct({
  ...ClipFields,
  beat: Schema.String,
  speech: Schema.optionalKey(Schema.Struct({ start: Schema.Finite, end: Schema.Finite })),
  marks: Schema.Array(TimedMark),
  hold: BeatHold,
});
export type ScriptClip = typeof ScriptClip.Type;

const BoardClip = Schema.Struct({
  ...ClipFields,
  panel: Schema.String,
  beat: Schema.String,
  mark: Schema.String,
  markAt: Schema.Finite,
  try: Schema.optionalKey(Schema.Int),
  file: Schema.optionalKey(Schema.String),
  card: Schema.Boolean,
  text: Schema.optionalKey(PanelText),
  words: Schema.optionalKey(
    Schema.Array(Schema.Struct({ text: Schema.String, payoff: Schema.Boolean })),
  ),
});
export type BoardClip = typeof BoardClip.Type;

const VoiceClip = Schema.Struct({
  ...ClipFields,
  beat: Schema.String,
  source: Schema.Literals(['staging', 'owner']),
});
export type VoiceClip = typeof VoiceClip.Type;

const SceneClip = Schema.Struct({ ...ClipFields, beat: Schema.String });
export type SceneClip = typeof SceneClip.Type;

const SoundClip = Schema.Struct({
  ...ClipFields,
  movement: Schema.String,
  from: Schema.String,
});
export type SoundClip = typeof SoundClip.Type;

const RenderClip = Schema.Struct({
  ...ClipFields,
  address: Schema.String,
  variant: Schema.String,
  kind: RenderKind,
});
export type RenderClip = typeof RenderClip.Type;

const Lane = Schema.Union([
  Schema.Struct({ track: Schema.tag('script'), clips: Schema.Array(ScriptClip) }),
  Schema.Struct({ track: Schema.tag('board'), clips: Schema.Array(BoardClip) }),
  Schema.Struct({ track: Schema.tag('voice'), clips: Schema.Array(VoiceClip) }),
  Schema.Struct({ track: Schema.tag('scenes'), clips: Schema.Array(SceneClip) }),
  Schema.Struct({ track: Schema.tag('sound'), clips: Schema.Array(SoundClip) }),
  Schema.Struct({ track: Schema.tag('render'), clips: Schema.Array(RenderClip) }),
]).pipe(Schema.toTaggedUnion('track'));
export type Lane = typeof Lane.Type;

export const FlowStage = Schema.Union([
  Schema.Struct({ state: Schema.tag('reached'), stage: Stage }),
  Schema.Struct({ state: Schema.tag('gap'), stage: Stage, why: Schema.String }),
  Schema.Struct({ state: Schema.tag('ahead'), stage: Stage, starts: Schema.String }),
]).pipe(Schema.toTaggedUnion('state'));
export type FlowStage = typeof FlowStage.Type;

const NextRow = Schema.Struct({
  stage: Stage,
  starts: Schema.String,
  gap: Schema.optionalKey(Schema.Struct({ stage: Stage, why: Schema.String })),
  later: Schema.Array(Stage),
});
export type NextRow = typeof NextRow.Type;

const Marker = Schema.Union([
  Schema.Struct({
    kind: Schema.tag('ask'),
    id: Schema.String,
    title: Schema.String,
    at: Schema.Finite,
    href: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.tag('note'),
    id: Schema.String,
    text: Schema.String,
    beat: Schema.String,
    at: Schema.Finite,
    status: Schema.Literals(['open', 'replied']),
    href: Schema.String,
  }),
]).pipe(Schema.toTaggedUnion('kind'));
export type Marker = typeof Marker.Type;

const Waiting = Schema.Union([
  Schema.Struct({
    kind: Schema.tag('ask'),
    id: Schema.String,
    title: Schema.String,
    href: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.tag('note'),
    id: Schema.String,
    text: Schema.String,
    href: Schema.String,
  }),
  Schema.Struct({ kind: Schema.tag('approve'), beat: Schema.String, href: Schema.String }),
]).pipe(Schema.toTaggedUnion('kind'));
export type Waiting = typeof Waiting.Type;

const TimelineHeader = Schema.Struct({
  stage: Stage,
  waits: Schema.optionalKey(
    Schema.Struct({ count: Schema.Int, items: Schema.NonEmptyArray(Waiting) }),
  ),
});
type TimelineHeader = typeof TimelineHeader.Type;

export const FilmTimeline = Schema.Struct({
  film: Schema.String,
  production: Schema.optionalKey(Schema.String),
  version: FilmVersion,
  versions: Schema.Array(FilmVersion),
  duration: Schema.Finite,
  bands: Schema.Array(ClockPart),
  lanes: Schema.Array(Lane),
  flow: Schema.Array(FlowStage),
  next: Schema.optionalKey(NextRow),
  markers: Schema.Array(Marker),
  header: TimelineHeader,
});
export type FilmTimeline = typeof FilmTimeline.Type;
