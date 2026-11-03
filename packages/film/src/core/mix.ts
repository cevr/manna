import { Option, Result, Schema } from 'effect';
import { CUT_FADE } from './align.ts';
import { type Pcm, SPEECH_GATE, fadeEdges, slice, toStereo } from './audio.ts';
import { type Duck, type Limit, addInto, duck, fade, limitInto, toFrames } from './dsp.ts';
import {
  CueInvalid,
  type MovementLength,
  type ScoreUnknown,
  type SoundUseMismatch,
  type UnknownCue,
  type UnknownMark,
  type UnknownScene,
  type UnknownSound,
  type WordMissing,
} from './errors.ts';
import { type Placed, filmEnd } from './layout.ts';
import { hashText } from './narration.ts';
import { TAKE_LEVEL, takeLift } from './recording.ts';
import type { Sound, SoundEffect, SoundManifest } from './schema.ts';
import type { Piece } from './talk.ts';
import {
  type MeasuredSounds,
  type Placing,
  type Playable,
  type SoundSource,
  fileSource,
  gainFor,
  jitterOf,
  levelOf,
  playPlacings,
  playablesOf,
  resolveUse,
  soundEntry,
  sourceLabel,
  soundState,
  unmeasuredOf,
} from './sfx.ts';
import { SCORE, aloneSpans, aloneWeights, applyScore, scoreGains, speechSpans } from './score.ts';
import { loudness } from './synth/loudness.ts';
import { cueTime, partialRange, playedOption, scoreOptionState } from './sound.ts';

export const MIX_RATE = 44100;

export const BED_DUCK: Duck = { threshold: 0.02, ratio: 2, attack: 120, release: 1500, knee: 4 };

export const LIMIT: Limit = { limit: 0.95, attack: 5, release: 50 };

export const MASTER = { loudness: -18 } as const;

const MUSIC_FADE_IN = 2;
const MUSIC_FADE_OUT = 6;

const BED_FADE = 1;

const BED_CROSSFADE = 0.5;

export const bedWrapAt = (secs: number): number => secs - Math.min(BED_CROSSFADE, secs / 4);

export interface Placement<A> {
  readonly name: string;
  readonly sound: A;
  readonly at: number;
  readonly gain: number;
  readonly pitch: number;
}

export interface Take<A> extends Placement<A> {
  readonly staged: boolean;
  readonly from: number;
  readonly dur: Option.Option<number>;
  readonly fade: number;
  readonly content: Option.Option<string>;
}

const playsWhole = <A>(take: Take<A>): boolean =>
  take.from === 0 && Option.isNone(take.dur) && take.fade === 0;

export interface VoicePieces {
  readonly file: string;
  readonly content: string;
  readonly pieces: ReadonlyArray<Piece>;
}

export interface ScoreBed<A> {
  readonly option: string;
  readonly sound: A;
  readonly under: number;
  readonly alone: number;
}

export interface BedSpan<A> {
  readonly sound: A;
  readonly from: number;
  readonly to: number;
  readonly gain: number;
  readonly fade: number;
  readonly duck: boolean;
}

export interface MixPlan<A> {
  readonly seconds: number;
  readonly voice: ReadonlyArray<Take<A>>;
  readonly score: Option.Option<ScoreBed<A>>;
  readonly beds: ReadonlyArray<BedSpan<A>>;
  readonly effects: ReadonlyArray<Placement<A>>;
  readonly warnings: ReadonlyArray<string>;
}

interface MixInput {
  readonly film: string;
  readonly placed: ReadonlyArray<Placed>;
  readonly sound: Option.Option<Sound>;
  readonly manifest: SoundManifest;
  readonly sounds: MeasuredSounds;
  readonly narration: string;
  readonly soundDir: string;
  readonly play: Option.Option<string>;
  readonly inPlace: Option.Option<InPlace>;
  readonly pieces: ReadonlyMap<string, VoicePieces>;
}

export interface InPlace {
  readonly sound: string;
  readonly playable: Playable;
}

export type MixPlanError =
  | UnknownScene
  | UnknownCue
  | UnknownMark
  | WordMissing
  | CueInvalid
  | MovementLength
  | ScoreUnknown
  | UnknownSound
  | SoundUseMismatch;

const variantsFor = (
  input: MixInput,
  name: string,
  entry: Parameters<typeof playablesOf>[2],
  warnings: Array<string>,
): ReadonlyArray<Playable> => {
  const heard = Option.filter(input.inPlace, (inPlace) => inPlace.sound === name);
  if (Option.isSome(heard)) return [heard.value.playable];
  const { sounds } = input;
  const state = soundState(entry, Option.fromUndefinedOr(sounds.lock[name]));
  if (state._tag === 'Missing') {
    warnings.push(`mix.missing sound=${name} hint="run sfx make ${name}, then sfx keep"`);
    return [];
  }
  if (state._tag === 'Stale') warnings.push(`mix.stale sound=${name} hint="run sfx make ${name}"`);
  const unmeasured = unmeasuredOf(sounds, name, entry);
  if (unmeasured > 0) {
    warnings.push(`mix.unmeasured sound=${name} seeds=${unmeasured}`);
    return [];
  }
  return playablesOf(sounds, name, entry);
};

interface Pending extends Placing {
  readonly playables: ReadonlyArray<Playable>;
  readonly level: number;
  readonly sync: Sync;
}

type Sync = NonNullable<SoundEffect['sync']>;

const leadOf = (p: Pending, playable: Playable): number => {
  if (p.sync === 'start') return 0;
  return Option.getOrElse(playable[p.sync], () => 0);
};

const effectPlacements = (input: MixInput, sound: Sound, warnings: Array<string>) =>
  Result.gen(function* () {
    const pending: Array<Pending> = [];
    for (const [id, fx] of Object.entries(sound.effects)) {
      const entry = yield* resolveUse(input.sounds.library, fx.sound, 'one-shot');
      const playables = variantsFor(input, fx.sound, entry, warnings);
      if (playables.length === 0) continue;
      const level = levelOf(entry, Option.fromUndefinedOr(fx.level));
      const sync = fx.sync ?? 'start';
      if (sync !== 'start' && playables.some((p) => Option.isNone(p[sync])))
        warnings.push(`mix.unsynced sound=${fx.sound} hint="run sfx describe"`);
      for (const cue of fx.at)
        pending.push({
          effect: id,
          sound: fx.sound,
          at: yield* cueTime(cue, input.placed),
          playables,
          level,
          sync,
        });
    }
    const played = playPlacings(
      sound.seed ?? input.film,
      pending,
      (name) => pending.find((p) => p.sound === name)?.playables.length ?? 1,
      (name) => Option.flatMap(soundEntry(input.sounds.library, name), (entry) => jitterOf(entry)),
    );
    return pending.flatMap((p, i) =>
      Option.toArray(
        Option.flatMap(Option.fromUndefinedOr(played[i]), (choice) =>
          Option.map(
            Option.fromUndefinedOr(p.playables[choice.variant]),
            (playable): Placement<SoundSource> => ({
              name: p.effect,
              sound: playable.source,
              at: p.at + choice.delay - leadOf(p, playable),
              gain: gainFor(p.level, playable.loudness, 'one-shot') * 10 ** (choice.gain / 20),
              pitch: choice.pitch,
            }),
          ),
        ),
      ),
    );
  });

const bedSpans = (input: MixInput, sound: Sound, warnings: Array<string>) =>
  Result.gen(function* () {
    const spans: Array<BedSpan<SoundSource>> = [];
    const seen = new Map<string, number>();
    for (const bed of sound.beds ?? []) {
      const entry = yield* resolveUse(input.sounds.library, bed.sound, 'bed');
      const playables = variantsFor(input, bed.sound, entry, warnings);
      if (playables.length === 0) continue;
      const from = yield* cueTime(bed.from, input.placed);
      const to = yield* cueTime(bed.to, input.placed);
      if (to <= from)
        return yield* Result.fail(
          CueInvalid.make({
            scene: bed.from.scene,
            reason: `starts bed "${bed.sound}" at ${from.toFixed(2)}s, which ends at ${to.toFixed(2)}s`,
          }),
        );
      const k = seen.get(bed.sound) ?? 0;
      seen.set(bed.sound, k + 1);
      const playable = Option.fromUndefinedOr(playables[k % playables.length]);
      if (Option.isNone(playable)) continue;
      spans.push({
        sound: playable.value.source,
        from,
        to,
        gain: gainFor(
          levelOf(entry, Option.fromUndefinedOr(bed.level)),
          playable.value.loudness,
          'bed',
        ),
        fade: bed.fade ?? BED_FADE,
        duck: entry.duck !== false,
      });
    }
    return spans;
  });

export const mixPlan = (input: MixInput): Result.Result<MixPlan<SoundSource>, MixPlanError> =>
  Result.gen(function* () {
    const { placed, manifest } = input;
    const warnings: Array<string> = [];

    const voice = placed.flatMap((p): ReadonlyArray<Take<SoundSource>> =>
      Option.match(Option.fromUndefinedOr(input.pieces.get(p.spec.id)), {
        onSome: ({ file, content, pieces }) =>
          pieces.map((piece) => ({
            name: p.spec.id,
            sound: fileSource(file),
            at: p.start + p.speechStart + piece.at,
            gain: 1,
            pitch: 0,
            staged: false,
            from: piece.from,
            dur: Option.some(piece.to - piece.from),
            fade: CUT_FADE,
            content: Option.some(content),
          })),
        onNone: () =>
          Option.match(
            Option.filter(Option.fromNullishOr(p.voice.file), () => p.voice.recorded),
            {
              onNone: () => [],
              onSome: (file) => [
                {
                  name: p.spec.id,
                  sound: fileSource(`${input.narration}/${file}`),
                  at: p.start + p.speechStart,
                  gain: 1,
                  pitch: 0,
                  staged: p.voice.source !== 'recorded',
                  from: 0,
                  dur: Option.none(),
                  fade: 0,
                  content: Option.none(),
                },
              ],
            },
          ),
      }),
    );

    let played = Option.none<ScoreBed<SoundSource>>();
    const declared = Option.flatMap(input.sound, (s) => Option.fromNullishOr(s.score));
    if (Option.isSome(declared)) {
      const score = declared.value;
      const option = yield* playedOption(score, input.play);
      const state = scoreOptionState(option, placed, manifest);
      if (state._tag === 'Missing')
        warnings.push(
          `mix.missing asset=score.${option.name} hint="run score to compose it, or score pull"`,
        );
      if (state._tag === 'Stale')
        warnings.push(
          `mix.stale asset=score.${option.name} why=${state.why._tag} hint="movements or timing changed; run score to compose it again"`,
        );
      for (const range of Option.toArray(partialRange(state, placed)))
        warnings.push(
          `mix.partial asset=score.${option.name} through=${range.through} to=${range.to.toFixed(1)}s of=${range.end.toFixed(1)}s hint="no music after it; run score without --through to compose the whole film"`,
        );
      if (state._tag !== 'Missing')
        played = Option.some({
          option: option.name,
          sound: fileSource(`${input.soundDir}/${state.asset.file}`),
          under: score.under,
          alone: score.alone,
        });
    }

    let beds: ReadonlyArray<BedSpan<SoundSource>> = [];
    let effects: ReadonlyArray<Placement<SoundSource>> = [];
    if (Option.isSome(input.sound)) {
      beds = yield* bedSpans(input, input.sound.value, warnings);
      effects = yield* effectPlacements(input, input.sound.value, warnings);
    }

    return { seconds: filmEnd(placed), voice, score: played, beds, effects, warnings };
  });

const soundKey = (source: SoundSource): string => {
  if (source._tag === 'File') return source.file.slice(source.file.lastIndexOf('/') + 1);
  return sourceLabel(source);
};

const pieceKey = (take: Take<SoundSource>): ReadonlyArray<number> =>
  Option.match(
    Option.liftPredicate(take, (t) => !playsWhole(t)),
    {
      onNone: () => [],
      onSome: (t) => [t.from, ...Option.toArray(t.dur), t.fade],
    },
  );

const KeyJson = Schema.fromJsonString(Schema.Json);

export const mixKey = (plan: MixPlan<SoundSource>): string =>
  hashText(
    Schema.encodeSync(KeyJson)({
      levels: {
        MASTER,
        LIMIT: { ...LIMIT },
        BED_DUCK: { ...BED_DUCK },
        MUSIC_FADE_IN,
        MUSIC_FADE_OUT,
        BED_FADE,
        BED_CROSSFADE,
        SCORE,
        SPEECH_GATE,
        TAKE_LEVEL,
      },
      seconds: plan.seconds,
      voice: plan.voice.map((t) => [
        t.name,
        Option.getOrElse(t.content, () => soundKey(t.sound)),
        t.at,
        t.gain,
        t.pitch,
        t.staged,
        ...pieceKey(t),
      ]),
      score: Option.getOrNull(
        Option.map(plan.score, (s) => [s.option, soundKey(s.sound), s.under, s.alone]),
      ),
      beds: plan.beds.map((b) => [soundKey(b.sound), b.from, b.to, b.gain, b.fade, b.duck]),
      effects: plan.effects.map((e) => [e.name, soundKey(e.sound), e.at, e.gain, e.pitch]),
    }),
  );

export interface Mixed {
  readonly master: Pcm;
  readonly masterGain: number;
  readonly voice: Pcm;
  readonly music: Option.Option<Pcm>;
  readonly beds: Option.Option<Pcm>;
  readonly effects: Option.Option<Pcm>;
}

const bus = (frames: number): Array<Float32Array> =>
  Array.from({ length: 2 }, () => new Float32Array(frames));

const pcm = (frames: number, channels: ReadonlyArray<Float32Array>): Pcm => ({
  rate: MIX_RATE,
  frames,
  channels,
});

export const repitch = (sound: Pcm, semitones: number): Pcm => {
  if (semitones === 0) return sound;
  const ratio = 2 ** (semitones / 12);
  const frames = Math.max(1, Math.floor(sound.frames / ratio));
  return {
    rate: sound.rate,
    frames,
    channels: sound.channels.map((plane) => {
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const at = i * ratio;
        const j = Math.floor(at);
        const t = at - j;
        out[i] = (plane[j] ?? 0) * (1 - t) + (plane[j + 1] ?? 0) * t;
      }
      return out;
    }),
  };
};

export const loopFill = (
  sound: ReadonlyArray<Float32Array>,
  length: number,
  frames: number,
  cross: number,
): Array<Float32Array> => {
  const out = bus(frames);
  const x = Math.max(0, Math.min(cross, Math.floor(length / 4)));
  const step = Math.max(1, length - x);
  for (let start = 0, k = 0; start < frames; start += step, k++) {
    const last = start + length >= frames;
    for (let i = 0; i < length && start + i < frames; i++) {
      let w = 1;
      if (k > 0 && i < x) w = Math.sin(((i / x) * Math.PI) / 2);
      if (!last && i >= length - x) w *= Math.cos((((i - (length - x)) / x) * Math.PI) / 2);
      for (const [c, plane] of out.entries()) {
        const from = sound[c] ?? sound[0];
        plane[start + i] = (plane[start + i] ?? 0) + (from?.[i] ?? 0) * w;
      }
    }
  }
  return out;
};

const renderBeds = (
  beds: ReadonlyArray<BedSpan<Pcm>>,
  voice: ReadonlyArray<Float32Array>,
  frames: number,
): Array<Float32Array> => {
  const ducked = bus(frames);
  const under = bus(frames);
  const at = (secs: number) => toFrames(secs, MIX_RATE);
  for (const bed of beds) {
    const from = at(bed.from);
    const span = Math.max(0, Math.min(frames, at(bed.to)) - from);
    const sound = toStereo(bed.sound);
    const filled = loopFill(sound.channels, sound.frames, span, at(BED_CROSSFADE));
    const ends = Math.min(at(bed.fade), Math.floor(span / 2));
    if (ends > 0) {
      fade(filled, { type: 'in', start: 0, frames: ends });
      fade(filled, { type: 'out', start: span - ends, frames: ends });
    }
    let target = under;
    if (bed.duck) target = ducked;
    addInto(target, filled, from, bed.gain);
  }
  duck(ducked, voice, MIX_RATE, BED_DUCK);
  addInto(ducked, under, 0, 1);
  return ducked;
};

const masteringGain = (track: Pcm): number => {
  const { integrated, peak } = loudness(track);
  if (!Number.isFinite(integrated) || !Number.isFinite(peak)) return 0;
  const headroom = 20 * Math.log10(LIMIT.limit) - peak;
  return Math.min(MASTER.loudness - integrated, headroom);
};

const played = (take: Take<Pcm>): ReadonlyArray<Float32Array> => {
  if (playsWhole(take)) return toStereo(take.sound).channels;
  const first = Math.min(take.sound.frames, toFrames(take.from, MIX_RATE));
  const last = Option.match(take.dur, {
    onNone: () => take.sound.frames,
    onSome: (dur) => Math.min(take.sound.frames, first + toFrames(dur, MIX_RATE)),
  });
  return toStereo(fadeEdges(slice(take.sound, first, last - first), take.fade)).channels;
};

export const renderMix = (plan: MixPlan<Pcm>): Mixed => {
  const frames = toFrames(plan.seconds, MIX_RATE);
  const at = (secs: number) => toFrames(secs, MIX_RATE);

  const voice = bus(frames);
  for (const take of plan.voice) {
    let lift = 1;
    if (take.staged) lift = 10 ** (takeLift(take.sound) / 20);
    addInto(voice, played(take), at(take.at), take.gain * lift);
  }

  const music = Option.map(plan.score, (score) => {
    const out = bus(frames);
    addInto(out, toStereo(score.sound).channels, 0, 1);
    const speaking = pcm(frames, voice);
    const weights = aloneWeights(aloneSpans(speechSpans(speaking), plan.seconds), MIX_RATE, frames);
    const gains = scoreGains(pcm(frames, out), speaking, weights, score);
    applyScore(out, weights, gains);
    fade(out, { type: 'in', start: 0, frames: at(MUSIC_FADE_IN) });
    fade(out, {
      type: 'out',
      start: at(Math.max(0, plan.seconds - MUSIC_FADE_OUT)),
      frames: at(MUSIC_FADE_OUT),
    });
    return out;
  });

  const beds = Option.map(
    Option.liftPredicate(plan.beds, (list) => list.length > 0),
    (list) => renderBeds(list, voice, frames),
  );

  const effects = Option.map(
    Option.liftPredicate(plan.effects, (list) => list.length > 0),
    (list) => {
      const out = bus(frames);
      for (const fx of list)
        addInto(out, toStereo(repitch(fx.sound, fx.pitch)).channels, at(fx.at), fx.gain);
      return out;
    },
  );

  const sum = bus(frames);
  for (const channels of [
    voice,
    ...Option.toArray(music),
    ...Option.toArray(beds),
    ...Option.toArray(effects),
  ])
    addInto(sum, channels, 0, 1);

  const masterGain = masteringGain(pcm(frames, sum));
  const lift = 10 ** (masterGain / 20);
  for (const plane of sum) for (let i = 0; i < frames; i++) plane[i] = (plane[i] ?? 0) * lift;
  limitInto(sum, MIX_RATE, LIMIT, sum);

  return {
    master: pcm(frames, sum),
    masterGain,
    voice: pcm(frames, voice),
    music: Option.map(music, (channels) => pcm(frames, channels)),
    beds: Option.map(beds, (channels) => pcm(frames, channels)),
    effects: Option.map(effects, (channels) => pcm(frames, channels)),
  };
};
