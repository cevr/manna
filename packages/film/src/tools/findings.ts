import { Array as Arr, Match, Option, Schema } from 'effect';
import type {
  CueCycle,
  DeliveryInvalid,
  DuplicateMark,
  DuplicateScene,
  PartOutOfOrder,
  ShortSpanEmpty,
  TurnInvalid,
  ScenesApart,
  UnknownAct,
  UnknownShort,
  UntilBeforeStart,
  MovementTooLong,
  MovementTooShort,
  CueInvalid,
  SoundUseMismatch,
  UnknownCue,
  UnknownMark,
  UnknownScene,
  UnknownSound,
  UnknownVoice,
  WordMissing,
} from '../core/errors.ts';
import { type Address, sceneAddress } from '../core/address.ts';
import { ActName } from '../core/address-schema.ts';
import { TakeStaleReason } from '../core/narration.ts';
import type { CheckLine, FindingAddress } from '../core/schema.ts';
import { SHORT_RULES } from '../core/shorts.ts';
import type {
  AudioMissing,
  AudioStale,
  LeadIn,
  SoundCreditMissing,
  SeedSilent,
  SoundStale,
  SoundUnmade,
} from './errors.ts';

export class EffectHot extends Schema.TaggedError<EffectHot>()('EffectHot', {
  effect: Schema.String,
  scene: Schema.String,
  at: Schema.Finite,
  over: Schema.Finite,
}) {
  override get message() {
    return `effect "${this.effect}" at ${this.at.toFixed(2)}s (scene ${this.scene}) peaks ${this.over.toFixed(1)} dB against the voice around it; lower its level, or re-roll a take whose hit is the problem`;
  }
}

export class MasterLoudness extends Schema.TaggedError<MasterLoudness>()('MasterLoudness', {
  loudness: Schema.Finite,
  target: Schema.Finite,
  tolerance: Schema.Finite,
}) {
  override get message() {
    return `the master measures ${this.loudness.toFixed(1)} LUFS, outside ${this.target} ± ${this.tolerance}: the mix masters to ${this.target}, so a peak held the lift back (see mix.master gain); find the hot peak on its bus (an effect or a take) and lower it`;
  }
}

export class DeadAir extends Schema.TaggedError<DeadAir>()('DeadAir', {
  from: Schema.Finite,
  to: Schema.Finite,
  floor: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `${this.from.toFixed(2)}–${this.to.toFixed(2)}s: ${(this.to - this.from).toFixed(2)}s of the master under ${this.floor} dBFS, over ${this.max.toFixed(1)}s, and no cue declares the silence (score it in sound.ts, or mark the cue silence: true where the script means one)`;
  }
}

export class WordPinFar extends Schema.TaggedError<WordPinFar>()('WordPinFar', {
  scene: Schema.String,
  cue: Schema.String,
  mark: Schema.String,
  word: Schema.String,
  sentences: Schema.Int,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" is pinned to "${this.word}", ${this.sentences} sentences past {${this.mark}}: a re-take that dropped the word near the mark moves the cue there`;
  }
}

const EDGE_HEARD = { start: 'starts to be heard', end: 'stops being heard' } as const;

export class DurOnWord extends Schema.TaggedError<DurOnWord>()('DurOnWord', {
  scene: Schema.String,
  cue: Schema.String,
  dur: Schema.Finite,
  word: Schema.String,
  edge: Schema.Literals(['start', 'end']),
  at: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" (dur ${this.dur}) meets "${this.word}" where it ${EDGE_HEARD[this.edge]}, at ${this.at.toFixed(2)}s: the length is sized to this take, so a re-take leaves it behind; end it \`until\` a mark or pin it to the word`;
  }
}

export class Storyboard extends Schema.TaggedError<Storyboard>()('Storyboard', {
  scene: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}" has no drawing: it plays as its storyboard card (a drawing keyed by the beat's id in scenesOf)`;
  }
}

export class KnobRepeated extends Schema.TaggedError<KnobRepeated>()('KnobRepeated', {
  scene: Schema.String,
  knob: Schema.String,
  of: Schema.String,
  ofKnob: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": knob "${this.knob}" repeats "${this.of}"'s "${this.ofKnob}"; if it calls that framing back, read it there with f.knobsOf(${this.of}) so a drag moves both`;
  }
}

export class CueTwin extends Schema.TaggedError<CueTwin>()('CueTwin', {
  scene: Schema.String,
  cue: Schema.String,
  twin: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" is declared as "${this.twin}" is (same edges on the same anchors, ease, stagger and silence); read f.at('${this.twin}') where "${this.cue}" is read and drop it`;
  }
}

export class CueLate extends Schema.TaggedError<CueLate>()('CueLate', {
  scene: Schema.String,
  cue: Schema.String,
  end: Schema.Finite,
  dur: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" ends at ${this.end.toFixed(2)}s, after the scene (${this.dur.toFixed(2)}s)`;
  }
}

export class SeamLong extends Schema.TaggedError<SeamLong>()('SeamLong', {
  from: Schema.String,
  to: Schema.String,
  seam: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `scenes "${this.from}" → "${this.to}": ${this.seam.toFixed(2)}s between their words, over ${this.max.toFixed(1)}s, and neither declares the pause (set "${this.to}".lead or "${this.from}".tail)`;
  }
}

export class StaticHold extends Schema.TaggedError<StaticHold>()('StaticHold', {
  scene: Schema.String,
  from: Schema.Finite,
  to: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}" ${this.from.toFixed(2)}–${this.to.toFixed(2)}s: ${(this.to - this.from).toFixed(2)}s of speech with nothing moving (no cue runs and the frame holds still), over ${this.max.toFixed(1)}s`;
  }
}

const TalkScene = Schema.optionalKey(Schema.String);
const TalkWhole = Schema.optionalKey(Schema.Boolean);

const verticalNamed = (id: string, talk: boolean) => {
  let kind = 'short';
  if (talk) kind = 'talk';
  return `${kind} "${id}"`;
};

export class ShortUnsafeText extends Schema.TaggedError<ShortUnsafeText>()('ShortUnsafeText', {
  short: Schema.String,
  zone: Schema.String,
  text: Schema.String,
  at: Schema.Finite,
  side: Schema.Literals(['top', 'bottom', 'left', 'right']),
  by: Schema.Finite,
  own: Schema.Boolean,
  others: Schema.Int,
  scene: TalkScene,
}) {
  override get message() {
    const talk = Option.isSome(Option.fromUndefinedOr(this.scene));
    let whose = "the film's";
    if (this.own) whose = "the short's";
    if (talk) whose = "the talk's";
    let more = '';
    if (this.others > 0) more = ` (and ${this.others} more of its lines)`;
    return `${verticalNamed(this.short, talk)} ${this.at.toFixed(2)}s: ${whose} "${this.text}"${more} runs up to ${Math.ceil(this.by)} px past the ${this.side} of the ${this.zone} safe zone, under the platform's buttons`;
  }
}

export class HeldShare extends Schema.TaggedError<HeldShare>()('HeldShare', {
  scene: Schema.String,
  share: Schema.Finite,
  max: Schema.Finite,
  from: Schema.Finite,
  to: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": ${Math.round(this.share * 100)}% of its seconds held still, over ${Math.round(this.max * 100)}%; longest held run ${(this.to - this.from).toFixed(1)}s at ${this.from.toFixed(1)}–${this.to.toFixed(1)}s (slide a plane, push on the turn, pin a motion to a mark, or cut; drift is texture and never clears it)`;
  }
}

const shownMeasure = {
  luma: (v: number) => v.toFixed(0),
  dark: (v: number) => `${Math.round(v * 100)}%`,
  saturation: (v: number) => v.toFixed(2),
};

export class ColourScript extends Schema.TaggedError<ColourScript>()('ColourScript', {
  act: ActName,
  measure: Schema.Literals(['luma', 'saturation', 'dark']),
  value: Schema.Finite,
  low: Schema.Finite,
  high: Schema.Finite,
}) {
  override get message() {
    const shown = shownMeasure[this.measure];
    return `act "${this.act}": ${this.measure} ${shown(this.value)}, outside ${shown(this.low)}–${shown(this.high)}`;
  }
}

export class FaceSmall extends Schema.TaggedError<FaceSmall>()('FaceSmall', {
  scene: Schema.String,
  largest: Schema.Finite,
  min: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": its largest face is ${this.largest.toFixed(0)} px (0: none drawn), where a face should fill ${this.min.toFixed(0)} px (a third of the frame) at least once`;
  }
}

const TRAVEL =
  "move it on a named cue with a duration, f.at('<cue>'), never on a threshold, a switch of target or a cue too short for the way it travels";

const JUMPED = {
  place: (by: number) => ({ jump: `jumps ${by.toFixed(2)} of its length`, fix: TRAVEL }),
  size: (by: number) => ({ jump: `changes size by ${(100 * by).toFixed(0)}%`, fix: TRAVEL }),
  grip: (by: number) => ({
    jump: `swaps ${(100 * by).toFixed(0)}% of its grip`,
    fix: "change it with `was` and `change: f.at('<cue>')` on a named cue with a duration, never on a threshold; what it holds rides the hand (`handOf`) until that cue lets it go",
  }),
} as const;

export class HandJump extends Schema.TaggedError<HandJump>()('HandJump', {
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  T: Schema.Finite,
  what: Schema.Literals(['place', 'size', 'grip']),
  by: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    const { jump, fix } = JUMPED[this.what](this.by);
    return `scene "${this.scene}": the ${this.side} hand ${jump} in one frame at ${this.T.toFixed(2)}s, over ${this.max} (${fix})`;
  }
}

export class HandFar extends Schema.TaggedError<HandFar>()('HandFar', {
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  from: Schema.Finite,
  to: Schema.Finite,
  worst: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    return `scene "${this.scene}": the ${this.side} hand works ${this.worst.toFixed(2)}× its figure's reach from its shoulder, in ${this.frames} drawn frames at ${this.from.toFixed(2)}–${this.to.toFixed(2)}s (stage what it works at, or the figure, nearer)`;
  }
}

export class HandHidden extends Schema.TaggedError<HandHidden>()('HandHidden', {
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  from: Schema.Finite,
  to: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    return `scene "${this.scene}": the ${this.side} hand acts inside its own body and is drawn behind it, in ${this.frames} drawn frames at ${this.from.toFixed(2)}–${this.to.toFixed(2)}s (move its target clear of the body, or into the garment's middle, where the kit draws it over)`;
  }
}

export class EndShort extends Schema.TaggedError<EndShort>()('EndShort', {
  part: Schema.Literals(['after the last word', 'end card']),
  secs: Schema.Finite,
  min: Schema.Finite,
}) {
  override get message() {
    return `${this.part}: ${this.secs.toFixed(1)}s, under ${this.min}s (credits and sources roll 20–30 s; end screens need the last 5–20 s)`;
  }
}

export class CastUnreadable extends Schema.TaggedError<CastUnreadable>()('CastUnreadable', {
  member: Schema.String,
  beats: Schema.Array(Schema.String),
  reason: Schema.String,
}) {
  override get message() {
    return `cast "${this.member}" (named by beat ${this.beats.join(', ')}): ${this.reason}`;
  }
}

export class ShortHook extends Schema.TaggedError<ShortHook>()('ShortHook', {
  short: Schema.String,
  reason: Schema.Literals(['late word', 'still open', 'title card']),
  at: Schema.Finite,
  max: Schema.Finite,
  text: Schema.optionalKey(Schema.String),
  scene: TalkScene,
}) {
  override get message() {
    const named = verticalNamed(this.short, Option.isSome(Option.fromUndefinedOr(this.scene)));
    if (this.reason === 'late word')
      return `${named}: the first word starts at ${this.at.toFixed(2)}s, after ${this.max.toFixed(1)}s; open on the voice`;
    if (this.reason === 'still open')
      return `${named}: nothing moves in the first ${this.at.toFixed(2)}s (by ${this.max.toFixed(1)}s something must)`;
    return `${named}: it opens on the title card "${this.text ?? ''}"; open on the hook, not a title`;
  }
}

export class ShortLoop extends Schema.TaggedError<ShortLoop>()('ShortLoop', {
  short: Schema.String,
  reason: Schema.Literals(['picture', 'gap']),
  value: Schema.Finite,
  max: Schema.Finite,
  talk: TalkWhole,
}) {
  override get message() {
    const named = verticalNamed(this.short, this.talk === true);
    if (this.reason === 'picture')
      return `${named}: its last frame differs from its first by ${this.value.toFixed(3)} (mean absolute per-cell luma difference on a ${SHORT_RULES.loopGrid.cols}×${SHORT_RULES.loopGrid.rows} grid), over ${this.max.toFixed(3)}; the loop shows a cut`;
    return `${named}: ${this.value.toFixed(2)}s of silence from the last word round to the first, over ${this.max.toFixed(1)}s; the loop stalls`;
  }
}

export class ShortLength extends Schema.TaggedError<ShortLength>()('ShortLength', {
  short: Schema.String,
  length: Schema.Finite,
  max: Schema.Finite,
  from: Schema.Finite,
  to: Schema.Finite,
  talk: TalkWhole,
}) {
  override get message() {
    const talk = this.talk === true;
    const named = verticalNamed(this.short, talk);
    let kind = 'a short';
    if (talk) kind = 'a talk';
    if (this.length > this.max)
      return `${named} is ${this.length.toFixed(1)}s, over the ${this.max}s ${kind} may run`;
    return `${named} is ${this.length.toFixed(1)}s, outside the ${this.from}–${this.to}s that hold best`;
  }
}

export class TakeStale extends Schema.TaggedError<TakeStale>()('TakeStale', {
  scene: Schema.String,
  reason: TakeStaleReason,
  recorded: Schema.Boolean,
}) {
  override get message() {
    if (this.recorded)
      return `scene "${this.scene}": recorded take is stale (${this.reason}); record it again and run takes import, or stage it with narrate --only ${this.scene} --replace-recorded`;
    return `scene "${this.scene}": take is stale (${this.reason}); run narrate`;
  }
}

export class AssetStale extends Schema.TaggedError<AssetStale>()('AssetStale', {
  asset: Schema.String,
  stored: Schema.String,
  wanted: Schema.String,
}) {
  override get message() {
    return `sound "${this.asset}" is stale (made for ${this.stored}, the film now asks for ${this.wanted}); run score`;
  }
}

export class AssetMissing extends Schema.TaggedError<AssetMissing>()('AssetMissing', {
  asset: Schema.String,
}) {
  override get message() {
    return `sound "${this.asset}" has not been generated; the mix plays without it`;
  }
}

export class ScorePartial extends Schema.TaggedError<ScorePartial>()('ScorePartial', {
  asset: Schema.String,
  through: Schema.String,
  to: Schema.Finite,
  end: Schema.Finite,
}) {
  override get message() {
    return `sound "${this.asset}" is composed through ${this.through}: music to ${this.to.toFixed(1)}s of the film's ${this.end.toFixed(1)}s, none after it; run score without --through for the whole film`;
  }
}

const sampled = {
  scene: Schema.String,
  time: Schema.Finite,
  at: Schema.String,
};

const where = (f: { readonly scene: string; readonly time: number; readonly at: string }) =>
  `scene "${f.scene}" at ${f.time.toFixed(2)}s (${f.at})`;

export class TextOverlap extends Schema.TaggedError<TextOverlap>()('TextOverlap', {
  ...sampled,
  a: Schema.String,
  b: Schema.String,
  area: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    return `${where(this)}: "${this.a}" overlaps "${this.b}" by ${Math.round(this.area)} px² (${this.frames} sampled frame(s))`;
  }
}

export class TextOffFrame extends Schema.TaggedError<TextOffFrame>()('TextOffFrame', {
  ...sampled,
  text: Schema.String,
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: "${this.text}" leaves the frame, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}

export class InkOverText extends Schema.TaggedError<InkOverText>()('InkOverText', {
  ...sampled,
  text: Schema.String,
  strokes: Schema.Int,
  length: Schema.Finite,
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const box = `${Math.round(this.x)},${Math.round(this.y)} ${Math.round(this.w)}×${Math.round(this.h)}`;
    return `${where(this)}: ${this.strokes} stroke(s) at ${box} cross "${this.text}" for ${Math.round(this.length)} px (${this.frames} sampled frame(s))`;
  }
}

export class DrawThrew extends Schema.TaggedError<DrawThrew>()('DrawThrew', {
  ...sampled,
  why: Schema.String,
}) {
  override get message() {
    return `${where(this)}: the frame throws when drawn: ${this.why}`;
  }
}

export class FrameImpure extends Schema.TaggedError<FrameImpure>()('FrameImpure', {
  ...sampled,
  why: Schema.String,
}) {
  override get message() {
    return `${where(this)}: the frame depends on the frame drawn before it: ${this.why}`;
  }
}

export class InkOverFace extends Schema.TaggedError<InkOverFace>()('InkOverFace', {
  ...sampled,
  x: Schema.Finite,
  y: Schema.Finite,
  size: Schema.Finite,
  strokes: Schema.Int,
  texts: Schema.Array(Schema.String),
  frames: Schema.Int,
}) {
  override get message() {
    const texts = this.texts.map((t) => `"${t}"`).join(', ');
    const over = [
      ...Arr.filter([`${this.strokes} stroke(s)`], () => this.strokes > 0),
      ...Arr.filter([`text ${texts}`], () => this.texts.length > 0),
    ].join(' and ');
    return `${where(this)}: ${over} drawn over the face at ${Math.round(this.x)},${Math.round(this.y)} (${Math.round(this.size)} px tall) (${this.frames} sampled frame(s))`;
  }
}

export class TextOffPlate extends Schema.TaggedError<TextOffPlate>()('TextOffPlate', {
  ...sampled,
  text: Schema.String,
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: "${this.text}" runs off the plate under it, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}

export class PaintingEdge extends Schema.TaggedError<PaintingEdge>()('PaintingEdge', {
  ...sampled,
  painting: Schema.String,
  edges: Schema.Array(Schema.Literals(['top', 'right', 'bottom', 'left'])),
}) {
  override get message() {
    return `${where(this)}: painting ${this.painting} shows its ${this.edges.join(', ')} edge inside the frame (give it more margin, or declare the edge open)`;
  }
}

export class PlateOffFrame extends Schema.TaggedError<PlateOffFrame>()('PlateOffFrame', {
  ...sampled,
  text: Schema.String,
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: the plate under "${this.text}" leaves the frame, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}

type PlaceFinding =
  | DuplicateScene
  | DuplicateMark
  | TurnInvalid
  | DeliveryInvalid
  | CueCycle
  | UntilBeforeStart
  | ScenesApart
  | UnknownAct
  | UnknownShort
  | ShortSpanEmpty;

export type StaticFinding =
  | PlaceFinding
  | CueLate
  | SeamLong
  | TakeStale
  | AssetStale
  | AssetMissing
  | ScorePartial
  | AudioMissing
  | AudioStale
  | UnknownScene
  | UnknownCue
  | UnknownMark
  | CueInvalid
  | PartOutOfOrder
  | MovementTooShort
  | MovementTooLong
  | WordMissing
  | UnknownVoice
  | UnknownSound
  | SoundUseMismatch
  | SoundUnmade
  | SoundStale
  | SeedSilent
  | LeadIn
  | SoundCreditMissing
  | WordPinFar
  | DurOnWord
  | CueTwin
  | Storyboard
  | KnobRepeated
  | EndShort
  | CastUnreadable;
export type MixFinding = DeadAir | MasterLoudness | EffectHot;
export type FrameFinding = TextOverlap | TextOffFrame | InkOverText | PlateOffFrame | TextOffPlate;
export type LayoutFinding = FrameFinding | StaticHold;
export type LookFinding = HeldShare | ColourScript | FaceSmall | HandJump | HandFar | HandHidden;
export type DrawFinding = DrawThrew | FrameImpure | InkOverFace | PaintingEdge;
export type ShortFinding = ShortUnsafeText | ShortHook | ShortLoop | ShortLength;
export type Finding =
  | StaticFinding
  | MixFinding
  | LayoutFinding
  | DrawFinding
  | LookFinding
  | ShortFinding;

type Level = 'error' | 'warning';

export interface CheckOptions {
  readonly allowStale: boolean;
}

const matchFinding = Match.type<Finding>();

export const levelOf = (finding: Finding, options: CheckOptions): Level => {
  const error = (): Level => 'error';
  const warning = (): Level => 'warning';
  const stale = (): Level => {
    if (options.allowStale) return 'warning';
    return 'error';
  };
  return matchFinding.pipe(
    Match.tagsExhaustive({
      CueLate: error,
      SeamLong: warning,
      TakeStale: stale,
      AssetStale: stale,
      AssetMissing: warning,
      ScorePartial: warning,
      AudioMissing: stale,
      AudioStale: stale,
      UnknownScene: error,
      UnknownCue: error,
      UnknownMark: error,
      CueInvalid: error,
      PartOutOfOrder: error,
      DuplicateScene: error,
      DuplicateMark: error,
      TurnInvalid: error,
      DeliveryInvalid: error,
      CueCycle: error,
      UntilBeforeStart: error,
      ScenesApart: error,
      UnknownAct: error,
      UnknownShort: error,
      ShortSpanEmpty: error,
      MovementTooShort: error,
      MovementTooLong: error,
      WordMissing: error,
      UnknownVoice: error,
      UnknownSound: error,
      SoundUseMismatch: error,
      SoundUnmade: error,
      SoundStale: warning,
      SeedSilent: error,
      LeadIn: warning,
      SoundCreditMissing: error,
      WordPinFar: warning,
      DurOnWord: warning,
      CueTwin: warning,
      Storyboard: warning,
      KnobRepeated: warning,
      EndShort: warning,
      CastUnreadable: error,
      DeadAir: error,
      MasterLoudness: warning,
      EffectHot: warning,
      TextOverlap: error,
      TextOffFrame: error,
      InkOverText: error,
      PlateOffFrame: error,
      TextOffPlate: error,
      DrawThrew: error,
      FrameImpure: error,
      InkOverFace: warning,
      PaintingEdge: error,
      StaticHold: warning,
      HeldShare: warning,
      ColourScript: warning,
      FaceSmall: warning,
      HandJump: warning,
      HandFar: warning,
      HandHidden: warning,
      ShortUnsafeText: (f): Level => {
        if (f.own) return 'error';
        return 'warning';
      },
      ShortHook: error,
      ShortLoop: warning,
      ShortLength: (f): Level => {
        if (f.length > f.max) return 'error';
        return 'warning';
      },
    }),
  )(finding);
};

export const addressOf = (finding: Finding): FindingAddress => {
  const film: Address = { _tag: 'Film' };
  const none = (): FindingAddress => ({ part: film });
  const scene = (f: { readonly scene: string }): FindingAddress => ({
    part: sceneAddress(f.scene),
  });
  const at = (scene: string, time: number): FindingAddress => ({
    part: sceneAddress(scene),
    time,
  });
  const span = (f: { readonly scene: string; readonly from: number }) => at(f.scene, f.from);
  const sampledAt = (f: { readonly scene: string; readonly time: number }) => at(f.scene, f.time);
  const short = (f: { readonly short: string }): FindingAddress => ({
    part: { _tag: 'Short', id: f.short },
  });
  const verticalAt = (
    f: { readonly short: string; readonly scene?: string },
    time: number,
  ): FindingAddress =>
    Option.match(Option.fromUndefinedOr(f.scene), {
      onNone: () => short(f),
      onSome: (s) => at(s, time),
    });
  const verticalWhole = (f: { readonly short: string; readonly talk?: boolean }) => {
    if (f.talk === true) return none();
    return short(f);
  };
  return matchFinding.pipe(
    Match.tagsExhaustive({
      CueLate: scene,
      SeamLong: (f) => scene({ scene: f.to }),
      TakeStale: scene,
      AssetStale: none,
      AssetMissing: none,
      ScorePartial: none,
      AudioMissing: none,
      AudioStale: none,
      UnknownScene: none,
      UnknownCue: scene,
      UnknownMark: scene,
      CueInvalid: scene,
      PartOutOfOrder: none,
      DuplicateScene: scene,
      DuplicateMark: scene,
      TurnInvalid: scene,
      DeliveryInvalid: scene,
      CueCycle: scene,
      UntilBeforeStart: scene,
      ScenesApart: none,
      UnknownAct: none,
      UnknownShort: none,
      ShortSpanEmpty: short,
      MovementTooShort: none,
      MovementTooLong: none,
      WordMissing: scene,
      UnknownVoice: scene,
      UnknownSound: none,
      SoundUseMismatch: none,
      SoundUnmade: none,
      SoundStale: none,
      SeedSilent: none,
      LeadIn: none,
      SoundCreditMissing: none,
      WordPinFar: scene,
      DurOnWord: scene,
      CueTwin: scene,
      Storyboard: scene,
      KnobRepeated: scene,
      EndShort: none,
      CastUnreadable: none,
      DeadAir: (f): FindingAddress => ({ part: film, time: f.from }),
      MasterLoudness: none,
      EffectHot: (f) => at(f.scene, f.at),
      TextOverlap: sampledAt,
      TextOffFrame: sampledAt,
      InkOverText: sampledAt,
      PlateOffFrame: sampledAt,
      TextOffPlate: sampledAt,
      DrawThrew: sampledAt,
      FrameImpure: sampledAt,
      InkOverFace: sampledAt,
      PaintingEdge: sampledAt,
      StaticHold: span,
      HeldShare: span,
      ColourScript: (f): FindingAddress => ({ part: { _tag: 'Act', act: f.act } }),
      FaceSmall: scene,
      HandJump: (f) => at(f.scene, f.T),
      HandFar: span,
      HandHidden: span,
      ShortUnsafeText: (f) => verticalAt(f, f.at),
      ShortHook: (f) => {
        let time = 0;
        if (f.reason === 'late word') time = f.at;
        return verticalAt(f, time);
      },
      ShortLoop: verticalWhole,
      ShortLength: verticalWhole,
    }),
  )(finding);
};

export interface Reported {
  readonly level: Level;
  readonly finding: Finding;
  readonly address: FindingAddress;
}

export interface Report {
  readonly findings: ReadonlyArray<Reported>;
  readonly errors: number;
  readonly warnings: number;
}

export const report = (found: ReadonlyArray<Finding>, options: CheckOptions): Report => {
  const findings = found.map((finding): Reported => ({
    level: levelOf(finding, options),
    finding,
    address: addressOf(finding),
  }));
  const errors = findings.filter((r) => r.level === 'error').length;
  return { findings, errors, warnings: findings.length - errors };
};

export const lineOf = ({ level, finding, address }: Reported): CheckLine => ({
  level,
  tag: finding._tag,
  message: finding.message,
  address,
});
