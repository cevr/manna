import { Option, Schema } from 'effect';

export class UnknownScene extends Schema.TaggedError<UnknownScene>()('UnknownScene', {
  scene: Schema.String,
  known: Schema.Array(Schema.String),
  by: Schema.optionalKey(Schema.String),
}) {
  override get message() {
    const said = `the film has no scene "${this.scene}"; its scenes are ${this.known.join(', ')}`;
    return Option.match(Option.fromUndefinedOr(this.by), {
      onNone: () => said,
      onSome: (by) => `${by}: ${said}`,
    });
  }
}

export class UnknownAct extends Schema.TaggedError<UnknownAct>()('UnknownAct', {
  act: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0) return `the film has no act "${this.act}": it declares no acts`;
    return `the film has no act "${this.act}"; its acts are ${this.known.join(', ')}`;
  }
}

export class UnknownShort extends Schema.TaggedError<UnknownShort>()('UnknownShort', {
  film: Schema.String,
  id: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0)
      return `film "${this.film}" has no short "${this.id}": it declares none (a shorts.ts beside its script)`;
    return `film "${this.film}" has no short "${this.id}"; its shorts are ${this.known.join(', ')}`;
  }
}

export class ScenesApart extends Schema.TaggedError<ScenesApart>()('ScenesApart', {
  named: Schema.Array(Schema.String),
  between: Schema.Array(Schema.String),
}) {
  override get message() {
    return `scenes ${this.named.join(', ')} are not one stretch of the film (between them: ${this.between.join(', ')}); name those too, or address each scene alone`;
  }
}

export class AddressConflict extends Schema.TaggedError<AddressConflict>()('AddressConflict', {
  given: Schema.Array(Schema.String),
}) {
  override get message() {
    return `an address names one scope (an act, scenes or a short), not ${this.given.join(' and ')}`;
  }
}

export class UnknownCue extends Schema.TaggedError<UnknownCue>()('UnknownCue', {
  scene: Schema.String,
  cue: Schema.String,
  by: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.by}: scene "${this.scene}" has no cue "${this.cue}"; its cues are ${this.known.join(', ') || 'none'}`;
  }
}

export class UnknownMark extends Schema.TaggedError<UnknownMark>()('UnknownMark', {
  scene: Schema.String,
  mark: Schema.String,
  by: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    const marks = this.known.map((m) => `{${m}}`).join(' ') || 'none';
    return `${this.by}: scene "${this.scene}" has no mark {${this.mark}}; its marks are ${marks}`;
  }
}

export class WordMissing extends Schema.TaggedError<WordMissing>()('WordMissing', {
  scene: Schema.String,
  by: Schema.String,
  mark: Schema.String,
  word: Schema.String,
}) {
  override get message() {
    return `${this.by}: scene "${this.scene}" pins the word "${this.word}", which the line never says at or after {${this.mark}}`;
  }
}

export class CueCycle extends Schema.TaggedError<CueCycle>()('CueCycle', {
  scene: Schema.String,
  cycle: Schema.Array(Schema.String),
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cycle.at(-1) ?? ''}" is part of a cycle (${this.cycle.join(' → ')})`;
  }
}

export class UntilBeforeStart extends Schema.TaggedError<UntilBeforeStart>()('UntilBeforeStart', {
  scene: Schema.String,
  cue: Schema.String,
  until: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" ends at ${this.until}, before it starts`;
  }
}

export class FloodInTransition extends Schema.TaggedError<FloodInTransition>()(
  'FloodInTransition',
  {
    scene: Schema.String,
    cue: Schema.String,
    side: Schema.Literals(['into', 'out']),
    next: Schema.String,
    at: Schema.Finite,
    edge: Schema.Finite,
  },
) {
  override get message() {
    if (this.side === 'into')
      return `scene "${this.scene}": its card's flood "${this.cue}" starts at ${this.at.toFixed(2)} s, inside the scene's ${this.edge.toFixed(2)} s way in; a flood is drawn over the scene alone: start it after ${this.edge.toFixed(2)} s, or enter on a cut`;
    return `scene "${this.scene}": its card's flood "${this.cue}" runs to ${this.at.toFixed(2)} s, past the scene's end into ${this.next}'s way in; a flood is drawn over the scene alone: end it by ${this.edge.toFixed(2)} s`;
  }
}

export class CardsOverlap extends Schema.TaggedError<CardsOverlap>()('CardsOverlap', {
  scene: Schema.String,
  first: Schema.String,
  second: Schema.String,
  from: Schema.Finite,
  to: Schema.Finite,
  at: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": its cards over "${this.first}" (${this.from.toFixed(2)}–${this.to.toFixed(2)} s) and "${this.second}" (from ${this.at.toFixed(2)} s) hold the frame at once; a frame shows one card: end "${this.first}" by ${this.at.toFixed(2)} s, or start "${this.second}" after ${this.to.toFixed(2)} s`;
  }
}

export class DuplicateScene extends Schema.TaggedError<DuplicateScene>()('DuplicateScene', {
  scene: Schema.String,
}) {
  override get message() {
    return `the film has two scenes "${this.scene}"`;
  }
}

export class DuplicateMark extends Schema.TaggedError<DuplicateMark>()('DuplicateMark', {
  scene: Schema.String,
  mark: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": the line names {${this.mark}} twice`;
  }
}

export class TurnInvalid extends Schema.TaggedError<TurnInvalid>()('TurnInvalid', {
  scene: Schema.String,
  voice: Schema.String,
  reason: Schema.Literals(['follows another turn before any word', 'has no word after it']),
}) {
  override get message() {
    return `scene "${this.scene}": the turn to {@${this.voice}} ${this.reason}`;
  }
}

export class DeliveryInvalid extends Schema.TaggedError<DeliveryInvalid>()('DeliveryInvalid', {
  scene: Schema.String,
  mark: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": ${this.mark} ${this.reason}`;
  }
}

export type LineError = DuplicateMark | TurnInvalid | DeliveryInvalid;

export class CueInvalid extends Schema.TaggedError<CueInvalid>()('CueInvalid', {
  scene: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `sound: a cue in scene "${this.scene}" ${this.reason}`;
  }
}

export class MovementTooShort extends Schema.TaggedError<MovementTooShort>()('MovementTooShort', {
  movement: Schema.String,
  ms: Schema.Finite,
}) {
  override get message() {
    return `sound: movement "${this.movement}" is ${this.ms}ms; movements must run in film order, 3s or more`;
  }
}

export class MovementTooLong extends Schema.TaggedError<MovementTooLong>()('MovementTooLong', {
  movement: Schema.String,
  ms: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `sound: movement "${this.movement}" is ${this.ms}ms, over the ${this.max}ms one movement may last; start another at a scene inside it`;
  }
}

export type MovementLength = MovementTooShort | MovementTooLong;

export class PartOutOfOrder extends Schema.TaggedError<PartOutOfOrder>()('PartOutOfOrder', {
  part: Schema.String,
  from: Schema.String,
  after: Schema.String,
}) {
  override get message() {
    return `"${this.part}" starts on scene "${this.from}", which does not play after "${this.after}", the part declared ahead of it; declare parts in film order`;
  }
}

export class ScoreUnknown extends Schema.TaggedError<ScoreUnknown>()('ScoreUnknown', {
  option: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the score has no option "${this.option}"; its options are ${this.known.join(', ') || 'none'}`;
  }
}

export class AlignmentMismatch extends Schema.TaggedError<AlignmentMismatch>()(
  'AlignmentMismatch',
  { spoken: Schema.String, words: Schema.Int, expected: Schema.Int },
) {
  override get message() {
    return `alignment has ${this.words} words, text has ${this.expected}: ${this.spoken}`;
  }
}

export class BeatUnplaced extends Schema.TaggedError<BeatUnplaced>()('BeatUnplaced', {
  beat: Schema.String,
  heard: Schema.Finite,
}) {
  override get message() {
    return `beat "${this.beat}" was not found in the recording (${Math.round(this.heard * 100)}% of its words heard); record it again, or import it alone`;
  }
}

export type PointError = UnknownCue | UnknownMark | WordMissing;

export type SoundCueError = UnknownScene | PointError;

export class UnknownVoice extends Schema.TaggedError<UnknownVoice>()('UnknownVoice', {
  scene: Schema.String,
  voice: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0)
      return `scene "${this.scene}" hands a line to "${this.voice}", but one voice reads this film; declare a cast in voice.ts`;
    return `scene "${this.scene}" hands a line to "${this.voice}"; the cast is ${this.known.join(', ')}`;
  }
}

export class ShortSpanEmpty extends Schema.TaggedError<ShortSpanEmpty>()('ShortSpanEmpty', {
  short: Schema.String,
  scene: Schema.String,
  from: Schema.Finite,
  to: Schema.Finite,
}) {
  override get message() {
    return `short "${this.short}": the span in scene "${this.scene}" runs from ${this.from.toFixed(2)}s to ${this.to.toFixed(2)}s (film time), which holds no frame`;
  }
}

export type ShortError = UnknownScene | PointError | ShortSpanEmpty;

export class UnknownSound extends Schema.TaggedError<UnknownSound>()('UnknownSound', {
  name: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the library has no sound "${this.name}"; it has ${this.known.join(', ') || 'none'}`;
  }
}

export class SoundUseMismatch extends Schema.TaggedError<SoundUseMismatch>()('SoundUseMismatch', {
  name: Schema.String,
  declared: Schema.Literals(['one-shot', 'bed']),
  placed: Schema.Literals(['one-shot', 'bed']),
}) {
  override get message() {
    return `sound "${this.name}" is declared a ${this.declared}, and placed as a ${this.placed}`;
  }
}

export class SampleUnknown extends Schema.TaggedError<SampleUnknown>()('SampleUnknown', {
  sound: Schema.String,
  sample: Schema.String,
}) {
  override get message() {
    return `code sound "${this.sound}" samples "${this.sample}", which the library does not declare`;
  }
}

export class SampleNotCode extends Schema.TaggedError<SampleNotCode>()('SampleNotCode', {
  sound: Schema.String,
  sample: Schema.String,
  kind: Schema.Literals(['generated', 'recorded']),
}) {
  override get message() {
    return `code sound "${this.sound}" samples "${this.sample}", a ${this.kind} sound; only a code sound can be sampled`;
  }
}

export class SampleCycle extends Schema.TaggedError<SampleCycle>()('SampleCycle', {
  path: Schema.Array(Schema.String),
}) {
  override get message() {
    return `code sounds sample each other in a ring: ${this.path.join(' → ')}`;
  }
}

export class CodeTooLong extends Schema.TaggedError<CodeTooLong>()('CodeTooLong', {
  sound: Schema.String,
  measure: Schema.Literals(['length', 'work']),
  secs: Schema.Finite,
  limit: Schema.Finite,
}) {
  override get message() {
    if (this.measure === 'length')
      return `code sound "${this.sound}" can be ${this.secs.toFixed(1)} s long, past the ${this.limit} s a code sound may be`;
    return `code sound "${this.sound}" can write ${this.secs.toFixed(0)} s of frames, past the ${this.limit} s a render may write`;
  }
}

export class DegreeWithoutKey extends Schema.TaggedError<DegreeWithoutKey>()('DegreeWithoutKey', {
  sound: Schema.String,
}) {
  override get message() {
    return `code sound "${this.sound}" plays a degree but names no key: give it a key (a tonic and a scale)`;
  }
}

export class StreamDuplicate extends Schema.TaggedError<StreamDuplicate>()('StreamDuplicate', {
  sound: Schema.String,
  stream: Schema.String,
}) {
  override get message() {
    return `code sound "${this.sound}" names stream "${this.stream}" on two nodes, which would draw the same numbers; a stream is one node's`;
  }
}

export class FitUnmatched extends Schema.TaggedError<FitUnmatched>()('FitUnmatched', {
  sound: Schema.String,
  kind: Schema.Literals(['generated', 'code', 'undeclared']),
}) {
  override get message() {
    if (this.kind === 'undeclared')
      return `fits/${this.sound}.json fits a sound the library does not declare: remove the fit, or declare "${this.sound}" as recorded`;
    if (this.kind === 'code')
      return `fits/${this.sound}.json fits "${this.sound}", a code sound that names no recording's licence; only a recorded sound, or code kept from its fit (keptFit, with the recording's licence), has a fit`;
    return `fits/${this.sound}.json fits "${this.sound}", a ${this.kind} sound; only a recorded sound, or code kept from its fit, has a fit`;
  }
}

export class FitUnreadable extends Schema.TaggedError<FitUnreadable>()('FitUnreadable', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} is not a fit: ${this.reason}`;
  }
}

export type CodeError =
  | SampleUnknown
  | SampleNotCode
  | SampleCycle
  | CodeTooLong
  | DegreeWithoutKey
  | StreamDuplicate
  | FitUnmatched
  | FitUnreadable;

export class BoardUnreadable extends Schema.TaggedError<BoardUnreadable>()('BoardUnreadable', {
  film: Schema.String,
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `film "${this.film}": its Board at ${this.url} cannot be read (${this.reason}); a Board render draws every kept try or none`;
  }
}

export class NarrationUnreadable extends Schema.TaggedError<NarrationUnreadable>()(
  'NarrationUnreadable',
  { film: Schema.String, url: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `film "${this.film}": its narration timings at ${this.url} cannot be read (${this.reason}); the page will not lay the film out on estimates the tools do not use`;
  }
}

export class TalkUnreadable extends Schema.TaggedError<TalkUnreadable>()('TalkUnreadable', {
  film: Schema.String,
  url: Schema.optionalKey(Schema.String),
  reason: Schema.String,
}) {
  override get message() {
    const at = Option.match(Option.fromUndefinedOr(this.url), {
      onNone: () => '',
      onSome: (url) => ` at ${url}`,
    });
    return `talk "${this.film}"${at} cannot be read: ${this.reason}`;
  }
}

export class RigUnloadable extends Schema.TaggedError<RigUnloadable>()('RigUnloadable', {
  rig: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `rig ${this.rig} cannot be loaded: ${this.reason}`;
  }
}

export class RigNameMissing extends Schema.TaggedError<RigNameMissing>()('RigNameMissing', {
  rig: Schema.String,
  kind: Schema.Literals(['artboard', 'timeline', 'view-model number', 'node']),
  name: Schema.String,
  has: Schema.Array(Schema.String),
}) {
  override get message() {
    const said = `rig ${this.rig} has no ${this.kind} "${this.name}"`;
    return Option.match(
      Option.liftPredicate(this.has, (has) => has.length > 0),
      {
        onNone: () => said,
        onSome: (has) => `${said}; it has ${has.join(', ')}`,
      },
    );
  }
}
