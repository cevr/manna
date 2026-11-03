import { Schema } from 'effect';
import { SceneTimes, type StillView } from './easel.ts';
import { type Copies, type Encoder, EncoderChoice } from './encoder.ts';
import { FigureMark } from './match.ts';
import { Point } from './schema.ts';

export const ExportInfo = Schema.Struct({
  width: Schema.Int,
  height: Schema.Int,
  fps: Schema.Finite,
  duration: Schema.Finite,
  frames: Schema.Int,
  audio: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
});
export type ExportInfo = typeof ExportInfo.Type;

export const TextBox = Schema.Struct({
  text: Schema.String,
  scene: Schema.String,
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  corners: Schema.Tuple([Point, Point, Point, Point]),
  alpha: Schema.Finite,
  order: Schema.Int,
  hand: Schema.optionalKey(Schema.Finite),
  on: Schema.optionalKey(Schema.Int),
  scale: Schema.Finite,
  caption: Schema.optionalKey(Schema.Literal(true)),
});
export type TextBox = typeof TextBox.Type;

export const InkMark = Schema.Struct({
  kind: Schema.Literals(['stroke', 'fill', 'plate']),
  scene: Schema.String,
  points: Schema.Array(Point),
  width: Schema.Finite,
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  alpha: Schema.Finite,
  order: Schema.Int,
  marks: Schema.optionalKey(Schema.Array(Schema.Finite)),
  scale: Schema.Finite,
  caption: Schema.optionalKey(Schema.Literal(true)),
});
export type InkMark = typeof InkMark.Type;

export const FaceMark = Schema.Struct({
  scene: Schema.String,
  x: Schema.Finite,
  y: Schema.Finite,
  size: Schema.Finite,
  alpha: Schema.Finite,
  order: Schema.Int,
});
export type FaceMark = typeof FaceMark.Type;

export const GripShares = Schema.Struct({
  open: Schema.Finite,
  hold: Schema.Finite,
  point: Schema.Finite,
  palm: Schema.Finite,
});
export type GripShares = typeof GripShares.Type;

export const HandMark = Schema.Struct({
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  x: Schema.Finite,
  y: Schema.Finite,
  sx: Schema.Finite,
  sy: Schema.Finite,
  tx: Schema.Finite,
  ty: Schema.Finite,
  size: Schema.Finite,
  radius: Schema.Finite,
  reach: Schema.Finite,
  grip: GripShares,
  formed: Schema.Finite,
  inside: Schema.Boolean,
  over: Schema.Boolean,
  alpha: Schema.Finite,
});
export type HandMark = typeof HandMark.Type;

export const FootageMark = Schema.Struct({
  source: Schema.String,
  at: Schema.Finite,
});
export type FootageMark = typeof FootageMark.Type;

export const Probed = Schema.Struct({
  texts: Schema.Array(TextBox),
  inks: Schema.Array(InkMark),
  faces: Schema.optionalKey(Schema.Array(FaceMark)),
  hands: Schema.optionalKey(Schema.Array(HandMark)),
  footage: Schema.optionalKey(Schema.Array(FootageMark)),
});
export type Probed = typeof Probed.Type;

const FrameFormat = Schema.Literals(['image/png', 'image/jpeg']);
type FrameFormat = typeof FrameFormat.Type;

export const LumaArea = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  cols: Schema.Int,
  rows: Schema.Int,
});
export type LumaArea = typeof LumaArea.Type;

const LookedFrames = Schema.Struct({
  thumbs: Schema.Uint8ArrayFromBase64,
  faces: Schema.Array(Schema.Array(FaceMark)),
  hands: Schema.Array(Schema.Array(HandMark)),
});
type LookedFrames = typeof LookedFrames.Type;

export const ChunkTiming = Schema.Struct({
  draw: Schema.Finite,
  page: Schema.Finite,
});
export type ChunkTiming = typeof ChunkTiming.Type;

const EncodedChunk = Schema.Struct({
  master: Schema.OptionFromOptionalKey(Schema.Uint8ArrayFromBase64),
  share: Schema.OptionFromOptionalKey(Schema.Uint8ArrayFromBase64),
  timing: ChunkTiming,
});
type EncodedChunk = typeof EncodedChunk.Type;

export interface CallArgs {
  readonly frame: readonly [i: number, format: FrameFormat];
  readonly probe: readonly [i: number];
  readonly lookbook: readonly [format: FrameFormat];
  readonly encoder: readonly [scale: number, copies: Copies, candidates: ReadonlyArray<Encoder>];
  readonly encode: readonly [
    from: number,
    to: number,
    scale: number,
    copies: Copies,
    encoder: Encoder,
  ];
  readonly contact: readonly [frames: ReadonlyArray<number>];
  readonly look: readonly [frames: ReadonlyArray<number>, w: number, h: number];
  readonly luma: readonly [i: number, area: LumaArea];
  readonly drawTimes: readonly [frames: ReadonlyArray<number>];
  readonly scenes: readonly [];
  readonly still: readonly [i: number, view: StillView];
  readonly figures: readonly [i: number];
  readonly filmTimed: readonly [from: number, to: number];
}

export type ExportCall = keyof CallArgs;

const Answers = {
  frame: Schema.Uint8ArrayFromBase64,
  probe: Probed,
  lookbook: Schema.Uint8ArrayFromBase64,
  encoder: EncoderChoice,
  encode: EncodedChunk,
  contact: Schema.Uint8ArrayFromBase64,
  look: LookedFrames,
  luma: Schema.Array(Schema.Finite),
  drawTimes: Schema.Array(Schema.Finite),
  scenes: Schema.Array(SceneTimes),
  still: Schema.Uint8ArrayFromBase64,
  figures: Schema.Array(FigureMark),
  filmTimed: Schema.Array(Schema.Boolean),
} satisfies { readonly [K in ExportCall]: Schema.Top };

export type WireAnswers = { readonly [K in ExportCall]: (typeof Answers)[K]['Encoded'] };

export type CallAnswers = { readonly [K in ExportCall]: (typeof Answers)[K]['Type'] };

type AnswerSchemas = {
  readonly [K in ExportCall]: Schema.Codec<CallAnswers[K], WireAnswers[K]>;
};

export const ExportAnswers: AnswerSchemas = Answers;

type HandleCalls = {
  readonly [K in ExportCall]: (...args: CallArgs[K]) => WireAnswers[K] | Promise<WireAnswers[K]>;
};

export interface ExportHandle extends HandleCalls {
  readonly info: typeof ExportInfo.Encoded;
}
