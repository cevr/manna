import { Option, Schema } from 'effect';

export class FilmUnknown extends Schema.TaggedError<FilmUnknown>()('FilmUnknown', {
  film: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `no film "${this.film}" (the films: ${this.known.join(', ') || 'none'})`;
  }
}

export class TakeMismatch extends Schema.TaggedError<TakeMismatch>()('TakeMismatch', {
  id: Schema.String,
  script: Schema.String,
  heard: Schema.String,
  wer: Schema.Finite,
  attempt: Schema.optionalKey(Schema.String),
}) {
  override get message() {
    return `take ${this.id} says something else (wer ${(this.wer * 100).toFixed(1)}%)\n  script: ${this.script}\n  heard:  ${this.heard}`;
  }
}

export class RecordingInvalid extends Schema.TaggedError<RecordingInvalid>()('RecordingInvalid', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.reason}`;
  }
}

export class AudioInvalid extends Schema.TaggedError<AudioInvalid>()('AudioInvalid', {
  reason: Schema.String,
}) {
  override get message() {
    return `the recording sent is not audio the studio reads: ${this.reason}`;
  }
}

export class RecordingLossy extends Schema.TaggedError<RecordingLossy>()('RecordingLossy', {
  type: Schema.String,
}) {
  override get message() {
    return `a recording of type "${this.type}" is lossy; send the take as audio/wav (PCM) or audio/flac`;
  }
}

export class BodyTooLarge extends Schema.TaggedError<BodyTooLarge>()('BodyTooLarge', {
  limit: Schema.Int,
}) {
  override get message() {
    return `the request body is over ${this.limit} bytes`;
  }
}

export class ElevenLabsFailed extends Schema.TaggedError<ElevenLabsFailed>()('ElevenLabsFailed', {
  op: Schema.String,
  exitCode: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `elevenlabs ${this.op} failed (${this.exitCode}): ${this.reason}`;
  }
}

export class StagingTakeUnknown extends Schema.TaggedError<StagingTakeUnknown>()(
  'StagingTakeUnknown',
  { file: Schema.String },
) {
  override get message() {
    return `the staging cache keeps no take ${this.file.slice(0, 12)}`;
  }
}

export class DraftUnknown extends Schema.TaggedError<DraftUnknown>()('DraftUnknown', {
  series: Schema.String,
  draft: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    return `no draft "${this.series}/${this.draft}" (the drafts: ${this.known.join(', ') || 'none'})`;
  }
}

export class DraftUnread extends Schema.TaggedError<DraftUnread>()('DraftUnread', {
  draft: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.draft} does not read: ${this.reason}`;
  }
}

export class StagingCapReached extends Schema.TaggedError<StagingCapReached>()(
  'StagingCapReached',
  {
    day: Schema.String,
    spent: Schema.Int,
    asked: Schema.Int,
    cap: Schema.Int,
  },
) {
  override get message() {
    return `the staging voice has spent ${this.spent} of ${this.cap} characters today (${this.day}); this take asks ${this.asked} more`;
  }
}

export class SttUntimed extends Schema.TaggedError<SttUntimed>()('SttUntimed', {
  file: Schema.String,
  heard: Schema.Int,
}) {
  override get message() {
    return `speech-to-text heard ${this.heard} words in ${this.file} but timed none of them; import it again`;
  }
}

export class MediaFailed extends Schema.TaggedError<MediaFailed>()('MediaFailed', {
  op: Schema.Literals(['read', 'decode', 'encode', 'write', 'join']),
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `could not ${this.op} ${this.file}: ${this.reason}`;
  }
}

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()('NoteNotFound', {
  film: Schema.String,
  id: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0) return `film "${this.film}" has no note "${this.id}"; it has none`;
    return `film "${this.film}" has no note "${this.id}"; its notes are ${this.known.join(', ')}`;
  }
}

export class SceneNotLocated extends Schema.TaggedError<SceneNotLocated>()('SceneNotLocated', {
  film: Schema.String,
  scene: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `film "${this.film}": scene "${this.scene}" has no editable drawing in source: ${this.reason}`;
  }
}

export class SourceShared extends Schema.TaggedError<SourceShared>()('SourceShared', {
  film: Schema.String,
  field: Schema.Literals(['timeline', 'knobs']),
  file: Schema.String,
  scenes: Schema.Array(Schema.String),
}) {
  override get message() {
    return `film "${this.film}": the ${this.field} in ${this.file} is read by scenes ${this.scenes.join(', ')}; the lab will not write a literal they share (give each scene its own drawing)`;
  }
}

export class SourceRefused extends Schema.TaggedError<SourceRefused>()('SourceRefused', {
  file: Schema.String,
  target: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: will not edit ${this.target}: ${this.reason}`;
  }
}

export class TimelineUnresolved extends Schema.TaggedError<TimelineUnresolved>()(
  'TimelineUnresolved',
  {
    file: Schema.String,
    target: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `${this.file}: will not write ${this.target}: the timeline would not resolve: ${this.reason}`;
  }
}

export class SourceChanged extends Schema.TaggedError<SourceChanged>()('SourceChanged', {
  file: Schema.String,
  target: Schema.String,
}) {
  override get message() {
    return `${this.file} changed on disk while the lab was writing ${this.target}; it was left as it is now: reload and write again`;
  }
}

export class ReviewFileUnknown extends Schema.TaggedError<ReviewFileUnknown>()(
  'ReviewFileUnknown',
  { ref: Schema.String },
) {
  override get message() {
    return `no file ${this.ref} under the review's roots`;
  }
}

export class PhoneCopyUnmade extends Schema.TaggedError<PhoneCopyUnmade>()('PhoneCopyUnmade', {
  ref: Schema.String,
}) {
  override get message() {
    return `no phone copy of ${this.ref} yet`;
  }
}

export class PhoneCopyFailed extends Schema.TaggedError<PhoneCopyFailed>()('PhoneCopyFailed', {
  ref: Schema.String,
}) {
  override get message() {
    return `the phone copy of ${this.ref} could not be made`;
  }
}

export class StillUnknown extends Schema.TaggedError<StillUnknown>()('StillUnknown', {
  film: Schema.String,
  name: Schema.String,
}) {
  override get message() {
    return `film "${this.film}" has no still ${this.name}`;
  }
}

export class AttemptUnknown extends Schema.TaggedError<AttemptUnknown>()('AttemptUnknown', {
  beat: Schema.String,
  file: Schema.String,
}) {
  override get message() {
    return `beat "${this.beat}" has no attempt ${this.file}`;
  }
}

export class FreshProcessFailed extends Schema.TaggedError<FreshProcessFailed>()(
  'FreshProcessFailed',
  {
    command: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `${this.command} failed: ${this.reason}`;
  }
}

export class ChoiceUnknown extends Schema.TaggedError<ChoiceUnknown>()('ChoiceUnknown', {
  film: Schema.String,
  point: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    const known = this.known.join(', ') || 'none';
    return `film "${this.film}" has no choice "${this.point}" (it has: ${known})`;
  }
}

export class VariantUnknown extends Schema.TaggedError<VariantUnknown>()('VariantUnknown', {
  film: Schema.String,
  point: Schema.String,
  variant: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    const known = this.known.map((k) => k.slice(0, 24)).join(', ') || 'none';
    return `"${this.point}" of film "${this.film}" has no variant "${this.variant.slice(0, 24)}" (it has: ${known})`;
  }
}

export class VerbRefused extends Schema.TaggedError<VerbRefused>()('VerbRefused', {
  point: Schema.String,
  variant: Schema.String,
  verb: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `cannot ${this.verb} ${this.variant.slice(0, 24)} of "${this.point}": ${this.reason}`;
  }
}

export class VersionChanged extends Schema.TaggedError<VersionChanged>()('VersionChanged', {
  point: Schema.String,
  variant: Schema.String,
  shown: Schema.String,
  now: Schema.Option(Schema.String),
}) {
  override get message() {
    const now = Option.match(this.now, {
      onNone: () => 'it is gone',
      onSome: (key) => `it is ${key.slice(0, 12)} now`,
    });
    return `${this.variant.slice(0, 24)} of "${this.point}" changed since it was shown (${this.shown.slice(0, 12)}; ${now}): read it again and say it of the version now there`;
  }
}

export const renderCommand = (film: string, scene: string, variant: string) =>
  `film project render ${film} --scene ${scene} --variant ${variant}`;

export class SceneNotRendered extends Schema.TaggedError<SceneNotRendered>()('SceneNotRendered', {
  film: Schema.String,
  scene: Schema.String,
  variant: Schema.String,
}) {
  override get message() {
    return `${this.film} has no render of scene ${this.scene} (variant ${this.variant}) to review; run ${renderCommand(this.film, this.scene, this.variant)} first`;
  }
}

export class CatalogueInvalid extends Schema.TaggedError<CatalogueInvalid>()('CatalogueInvalid', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the render catalogue ${this.file} does not read: ${this.reason}`;
  }
}

export class TakeUnknown extends Schema.TaggedError<TakeUnknown>()('TakeUnknown', {
  sound: Schema.String,
  take: Schema.String,
}) {
  override get message() {
    return `sound "${this.sound}" has no kept or waiting take ${this.take.slice(0, 12)}`;
  }
}

export class ReviewToolFailed extends Schema.TaggedError<ReviewToolFailed>()('ReviewToolFailed', {
  tool: Schema.Literal('cache'),
  ref: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.tool} failed on ${this.ref}: ${this.reason}`;
  }
}

export class UndoUnavailable extends Schema.TaggedError<UndoUnavailable>()('UndoUnavailable', {
  reason: Schema.String,
}) {
  override get message() {
    return `nothing to undo: ${this.reason}`;
  }
}

export class StepNotNewest extends Schema.TaggedError<StepNotNewest>()('StepNotNewest', {
  reason: Schema.String,
}) {
  override get message() {
    return `cannot undo that change: ${this.reason}`;
  }
}

export const newerFirst = (top: string): string => `${top} came after it: undo that first`;

export class HoldUnchanged extends Schema.TaggedError<HoldUnchanged>()('HoldUnchanged', {
  beat: Schema.String,
  edge: Schema.Literals(['lead', 'tail']),
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

export class VersionMoved extends Schema.TaggedError<VersionMoved>()('VersionMoved', {
  production: Schema.String,
  after: Schema.Int,
  current: Schema.Int,
}) {
  override get message() {
    return `${this.production} is at v${this.current} now, not v${this.after}: read it again before moving forward`;
  }
}

export class Undecided extends Schema.TaggedError<Undecided>()('Undecided', {
  production: Schema.String,
  version: Schema.Int,
}) {
  override get message() {
    return `${this.production} v${this.version} holds no decision of the owner's: file the word he gave with \`decide\` (his own words, verbatim), or ask him (\`ask\`), then move forward`;
  }
}

export class DecisionUnknown extends Schema.TaggedError<DecisionUnknown>()('DecisionUnknown', {
  production: Schema.String,
  version: Schema.Int,
  at: Schema.Finite,
  held: Schema.Array(Schema.Struct({ at: Schema.Finite, text: Schema.String })),
}) {
  override get message() {
    return `${this.production} v${this.version} holds no decision of the owner's at ${this.at}: name one it holds by its \`at\`: ${this.held.map((d) => `${d.at} "${d.text}"`).join(', ')}`;
  }
}

export class WordUnaimed extends Schema.TaggedError<WordUnaimed>()('WordUnaimed', {
  names: Schema.Literals(['point', 'variant']),
}) {
  override get message() {
    return (
      {
        point: '`point` is a choice in a set: name the `set`',
        variant: "`variant` is one of a choice's: name the `point`",
      } as const
    )[this.names];
  }
}

export class BoardRefused extends Schema.TaggedError<BoardRefused>()('BoardRefused', {
  film: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `film "${this.film}": ${this.reason}`;
  }
}

export class BoardFileUnknown extends Schema.TaggedError<BoardFileUnknown>()('BoardFileUnknown', {
  film: Schema.String,
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `film "${this.film}": board image ${this.file}: ${this.reason}`;
  }
}

export class AskUnknown extends Schema.TaggedError<AskUnknown>()('AskUnknown', {
  id: Schema.String,
}) {
  override get message() {
    return `the lab has no ask "${this.id}"`;
  }
}

export class AskRefused extends Schema.TaggedError<AskRefused>()('AskRefused', {
  id: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `ask "${this.id}": ${this.reason}`;
  }
}

export class AskInvalid extends Schema.TaggedError<AskInvalid>()('AskInvalid', {
  problems: Schema.Array(Schema.String),
}) {
  override get message() {
    return `the ask may not render: ${this.problems.join('; ')}`;
  }
}

export class FilmVersionUnknown extends Schema.TaggedError<FilmVersionUnknown>()(
  'FilmVersionUnknown',
  {
    film: Schema.String,
    version: Schema.Int,
    versions: Schema.Array(Schema.Int),
  },
) {
  override get message() {
    return `${this.film} has no v${this.version} (its versions: ${this.versions.map((v) => `v${v}`).join(', ')})`;
  }
}

export class FilmVersionUnkept extends Schema.TaggedError<FilmVersionUnkept>()(
  'FilmVersionUnkept',
  {
    film: Schema.String,
    version: Schema.Int,
    kept: Schema.Array(Schema.Int),
  },
) {
  override get message() {
    return `${this.film} keeps no files of v${this.version}: a later version replaced them in place (versions with files: ${this.kept.map((v) => `v${v}`).join(', ')})`;
  }
}
