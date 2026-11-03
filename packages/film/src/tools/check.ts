import { Array as Arr, Match, Option, Order, Predicate, Record as Rec, Result } from 'effect';
import { BOIL_FPS, STROKE_JITTER } from '../canvas/ink.ts';
import { type Pcm, windowPowers } from '../core/audio.ts';
import { BALANCE, hotEffects } from '../core/balance.ts';
import type { MixPlan, Mixed } from '../core/mix.ts';
import { loudness } from '../core/synth/loudness.ts';
import type { Placed } from '../core/layout.ts';
import {
  DEFAULT_TAIL,
  MIN_LEAD,
  everyTakeRecorded,
  filmEnd,
  sceneAt,
  transitionDur,
} from '../core/layout.ts';
import { type SceneMoment, sceneMoments } from '../core/moments.ts';
import { PHRASE_GAP } from '../core/phrases.ts';
import { insidePolygon } from '../core/polygon.ts';
import {
  endsSentence,
  lastVoiced,
  linesOf,
  takeScript,
  takeState,
  voiceKey,
  wordAfter,
} from '../core/narration.ts';
import type {
  Knob,
  Score,
  Point,
  Sound,
  SoundManifest,
  Span,
  Timeline,
  Until,
} from '../core/schema.ts';
import type { FaceMark, InkMark, Probed, TextBox } from '../core/export-handle.ts';
import {
  LEAD_IN,
  type Library,
  type LibraryEntry,
  type MeasuredSounds,
  type SoundUse,
  type Sounds,
  heardNothing,
  isDerived,
  playablesOf,
  resolveUse,
  seedSources,
  soundState,
  creditLine,
  soundCredits,
  sourceLabel,
} from '../core/sfx.ts';
import { type Credit, missingSoundCredits } from '../canvas/credits.ts';
import {
  cueTime,
  movementSpans,
  partialRange,
  scoreOptionState,
  scoreOptions,
} from '../core/sound.ts';
import {
  CLOCK_EPSILON,
  DEFAULT_EASE,
  type Interval,
  framesOf,
  heardAtOrAfter,
  secondsAt,
} from '../core/time.ts';
import { endsLate } from '../core/timeline.ts';
import type { PartError } from '../core/acts.ts';
import type {
  MovementLength,
  SoundUseMismatch,
  UnknownSound,
  UnknownVoice,
} from '../core/errors.ts';
import {
  type AudioMissing,
  type AudioStale,
  LeadIn,
  SeedSilent,
  SoundCreditMissing,
  SoundStale,
  SoundUnmade,
} from './errors.ts';
import {
  AssetMissing,
  AssetStale,
  ScorePartial,
  CueLate,
  CueTwin,
  DeadAir,
  EffectHot,
  EndShort,
  type FrameFinding,
  InkOverText,
  KnobRepeated,
  MasterLoudness,
  type MixFinding,
  PlateOffFrame,
  SeamLong,
  type StaticFinding,
  Storyboard,
  TakeStale,
  TextOffFrame,
  TextOffPlate,
  TextOverlap,
  DurOnWord,
  InkOverFace,
  WordPinFar,
} from './findings.ts';
import type { LoadedFilm, MeasuredFilm } from './film-repo.ts';
import { type Master, masterFinding } from './mixer.ts';

const PIN_REACH = 1;

export const farPins = (placed: ReadonlyArray<Placed>): ReadonlyArray<WordPinFar> =>
  placed.flatMap((p) =>
    Object.entries(Option.getOrElse(Option.fromNullishOr(p.spec.timeline), () => ({}))).flatMap(
      ([cue, span]) => {
        if (!('word' in span)) return [];
        const mark = span.mark;
        const pin = Option.all({
          word: Option.fromNullishOr(span.word),
          m: Option.fromNullishOr(p.voice.marks.get(mark)),
        });
        const landed = Option.flatMap(pin, ({ word, m }) =>
          Option.map(wordAfter(p.voice.words, m, word), (t) => ({ word, m, t })),
        );
        return Option.toArray(landed).flatMap(({ word, m, t }) => {
          const sentences = p.voice.words.filter(
            (w) => heardAtOrAfter(w, m) && w.start < t && endsSentence(w.text),
          ).length;
          if (sentences <= PIN_REACH) return [];
          return [WordPinFar.make({ scene: p.spec.id, cue, mark, word, sentences })];
        });
      },
    ),
  );

const DUR_ON_WORD = 0.08;

const DUR_MIN = 1;

interface PhraseEdge {
  readonly word: string;
  readonly edge: 'start' | 'end';
  readonly at: number;
}

const phraseEdges = (words: Placed['voice']['words']): ReadonlyArray<PhraseEdge> =>
  words.flatMap((w, i) => {
    const before = Arr.get(words, i - 1);
    const after = Arr.get(words, i + 1);
    const opens = Option.match(before, {
      onNone: () => true,
      onSome: (b) => w.voiced.start - b.voiced.end >= PHRASE_GAP,
    });
    const closes = Option.match(after, {
      onNone: () => true,
      onSome: (a) => a.voiced.start - w.voiced.end >= PHRASE_GAP,
    });
    return [
      ...Arr.filter([{ word: w.text, edge: 'start' as const, at: w.voiced.start }], () => opens),
      ...Arr.filter([{ word: w.text, edge: 'end' as const, at: w.voiced.end }], () => closes),
    ];
  });

export const durOnWords = (placed: ReadonlyArray<Placed>): ReadonlyArray<DurOnWord> =>
  placed.flatMap((p) => {
    const edges = phraseEdges(p.voice.words);
    return Object.entries(
      Option.getOrElse(Option.fromNullishOr(p.spec.timeline), () => ({})),
    ).flatMap(([cue, span]) => {
      const dur = Option.filter(Option.fromNullishOr(span.dur), (d) => d >= DUR_MIN);
      const found = Option.flatMap(
        Option.all({ dur, resolved: Option.fromNullishOr(p.cues.get(cue)) }),
        ({ dur, resolved }) => {
          const sized = Match.value(span.ends === true).pipe(
            Match.when(true, () => resolved.start),
            Match.orElse(() => resolved.end),
          );
          const voiceAt = sized - p.speechStart;
          return Option.map(
            Arr.findFirst(edges, (e) => Math.abs(e.at - voiceAt) <= DUR_ON_WORD + CLOCK_EPSILON),
            (e) =>
              DurOnWord.make({ scene: p.spec.id, cue, dur, word: e.word, edge: e.edge, at: sized }),
          );
        },
      );
      return Option.toArray(found);
    });
  });

interface DeclaredPoint {
  readonly anchor: string;
  readonly offset: number;
}

interface DeclaredCue {
  readonly start: DeclaredPoint;
  readonly end: DeclaredPoint;
  readonly ease: string;
  readonly stagger: number;
  readonly silence: boolean;
}

const plus = (p: DeclaredPoint, seconds: number): DeclaredPoint => ({
  anchor: p.anchor,
  offset: p.offset + seconds,
});

const markPoint = (mark: string, word?: string): DeclaredPoint => ({
  anchor: `mark ${mark} ${word ?? ''}`,
  offset: 0,
});

const edgesFrom = (
  span: Span,
  anchor: DeclaredPoint,
  ended: (until: Until) => Option.Option<DeclaredPoint>,
): Option.Option<Pick<DeclaredCue, 'start' | 'end'>> => {
  const at = plus(
    anchor,
    Option.getOrElse(Option.fromUndefinedOr(span.offset), () => 0),
  );
  const off = Option.getOrElse(Option.fromUndefinedOr(span.untilOffset), () => 0);
  return Option.match(Option.fromUndefinedOr(span.until), {
    onSome: (until) => Option.map(ended(until), (end) => ({ start: at, end: plus(end, off) })),
    onNone: () => {
      const dur = Option.getOrElse(Option.fromUndefinedOr(span.dur), () => 0);
      if (span.ends === true) return Option.some({ start: plus(at, -dur), end: at });
      return Option.some({ start: at, end: plus(at, dur) });
    },
  });
};

const playOf = (span: Span): Pick<DeclaredCue, 'ease' | 'stagger' | 'silence'> => ({
  ease: Option.getOrElse(Option.fromUndefinedOr(span.ease), () => DEFAULT_EASE),
  stagger: Option.getOrElse(Option.fromUndefinedOr(span.stagger), () => 0),
  silence: span.silence === true,
});

const declaredCues = (timeline: Timeline): ReadonlyMap<string, DeclaredCue> => {
  const out = new Map<string, DeclaredCue>();
  const visiting = new Set<string>();
  const declare = (name: string, span: Span): Option.Option<DeclaredCue> => {
    visiting.add(name);
    const edges = Option.flatMap(anchorOf(span), (a) => edgesFrom(span, a, untilOf));
    visiting.delete(name);
    return Option.map(edges, (e) => {
      const declared = { ...e, ...playOf(span) };
      out.set(name, declared);
      return declared;
    });
  };
  const cue = (name: string): Option.Option<DeclaredCue> =>
    Option.orElse(Option.fromUndefinedOr(out.get(name)), () =>
      Option.flatMap(
        Option.filter(Rec.get(timeline, name), () => !visiting.has(name)),
        (span) => declare(name, span),
      ),
    );
  const anchorOf = (span: Span): Option.Option<DeclaredPoint> => {
    if ('mark' in span) return Option.some(markPoint(span.mark, span.word));
    if ('after' in span) return Option.map(cue(span.after), (c) => c.end);
    if ('with' in span) return Option.map(cue(span.with), (c) => c.start);
    return Option.some({ anchor: `at ${span.at}`, offset: 0 });
  };
  const untilOf = (until: Until): Option.Option<DeclaredPoint> =>
    Match.value(until).pipe(
      Match.when(Predicate.isString, (mark) => Option.some(markPoint(mark))),
      Match.orElse((point) =>
        Option.match(Option.fromUndefinedOr(point.cue), {
          onNone: () => Option.some({ anchor: `at ${point.at}`, offset: 0 }),
          onSome: (name) =>
            Option.map(cue(name), (c) =>
              Match.value(point.edge).pipe(
                Match.when('start', () => c.start),
                Match.orElse(() => c.end),
              ),
            ),
        }),
      ),
    );
  for (const name of Object.keys(timeline)) cue(name);
  return out;
};

const samePoint = (a: DeclaredPoint, b: DeclaredPoint) =>
  a.anchor === b.anchor && Math.abs(a.offset - b.offset) < CLOCK_EPSILON;

const sameCue = (a: DeclaredCue, b: DeclaredCue) =>
  samePoint(a.start, b.start) &&
  samePoint(a.end, b.end) &&
  a.ease === b.ease &&
  a.stagger === b.stagger &&
  a.silence === b.silence;

export const cueTwins = (placed: ReadonlyArray<Placed>): ReadonlyArray<CueTwin> =>
  placed.flatMap((p) => {
    const cues = [...declaredCues(p.spec.timeline ?? {})];
    return cues.flatMap(([cue, declared], i) =>
      Option.toArray(
        Option.map(
          Arr.findFirst(cues.slice(0, i), ([, earlier]) => sameCue(earlier, declared)),
          ([twin]) => CueTwin.make({ scene: p.spec.id, cue, twin }),
        ),
      ),
    );
  });

export const storyboards = (placed: ReadonlyArray<Placed>): ReadonlyArray<Storyboard> =>
  placed
    .filter((p) => p.spec.storyboard === true)
    .map((p) => Storyboard.make({ scene: p.spec.id }));

const knobKey = (
  knobs: ReadonlyMap<string, Knob>,
  knob: string,
  point: readonly [number, number],
): string => {
  const zoom = knobs.get(`${knob}Zoom`);
  if (Predicate.isNumber(zoom)) return `${point.join(',')}×${zoom}`;
  return point.join(',');
};

export const repeatedKnobs = (placed: ReadonlyArray<Placed>): ReadonlyArray<KnobRepeated> => {
  const owners = new Map<string, { readonly scene: string; readonly knob: string }>();
  return placed.flatMap((p) =>
    [...p.knobs].flatMap(([knob, value]) => {
      if (Predicate.isNumber(value)) return [];
      const key = knobKey(p.knobs, knob, value);
      return Option.match(Option.fromUndefinedOr(owners.get(key)), {
        onNone: () => {
          owners.set(key, { scene: p.spec.id, knob });
          return [];
        },
        onSome: (owner) => {
          if (owner.scene === p.spec.id) return [];
          return [
            KnobRepeated.make({ scene: p.spec.id, knob, of: owner.scene, ofKnob: owner.knob }),
          ];
        },
      });
    }),
  );
};

export const lateCues = (placed: ReadonlyArray<Placed>): ReadonlyArray<CueLate> =>
  placed.flatMap((p) =>
    [...p.cues]
      .filter(([, c]) => endsLate(c, p.dur))
      .map(([cue, c]) => CueLate.make({ scene: p.spec.id, cue, end: c.end, dur: p.dur })),
  );

export const MAX_SEAM = MIN_LEAD + DEFAULT_TAIL;

export const seamAfter = (p: Placed, q: Placed): Option.Option<number> => {
  if (p.voice.duration <= 0 || q.voice.duration <= 0) return Option.none();
  return Option.some(p.length - (p.speechStart + lastVoiced(p.voice)) + q.speechStart);
};

const declaresEnd = (p: Placed) =>
  Predicate.isNotUndefined(p.spec.tail) ||
  Option.exists(
    Option.fromUndefinedOr(p.spec.min),
    (min) => min > p.speechStart + p.voice.duration + DEFAULT_TAIL + CLOCK_EPSILON,
  );

export const longSeams = (placed: ReadonlyArray<Placed>): ReadonlyArray<SeamLong> =>
  placed.slice(1).flatMap((q, i) => {
    const p = Arr.getUnsafe(placed, i);
    if (declaresEnd(p) || Predicate.isNotUndefined(q.spec.lead)) return [];
    return Option.match(seamAfter(p, q), {
      onNone: () => [],
      onSome: (seam) => {
        if (seam <= MAX_SEAM + CLOCK_EPSILON) return [];
        return [SeamLong.make({ from: p.spec.id, to: q.spec.id, seam, max: MAX_SEAM })];
      },
    });
  });

export const staleTakes = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<TakeStale> => {
  const voice = Option.match(film.voice, { onNone: () => '', onSome: voiceKey });
  return placed.flatMap((p) => {
    if (p.voice.spoken.length === 0) return [];
    const state = takeState(p.spec.id, takeScript(p.voice), film.timings, voice, p.voice.delivery);
    if (state._tag !== 'Stale') return [];
    return [TakeStale.make({ scene: p.spec.id, reason: state.reason, recorded: state.recorded })];
  });
};

export const unknownVoices = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<UnknownVoice> =>
  Option.match(film.voice, {
    onNone: () => [],
    onSome: (voice) =>
      placed.flatMap((p) =>
        Result.match(linesOf(p.spec.id, p.voice, voice), {
          onFailure: (error) => [error],
          onSuccess: () => [],
        }),
      ),
  });

export const musicFindings = (
  score: Score,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
): ReadonlyArray<PartError | MovementLength | AssetStale | AssetMissing | ScorePartial> =>
  scoreOptions(score).flatMap(
    (
      option,
    ): ReadonlyArray<PartError | MovementLength | AssetStale | AssetMissing | ScorePartial> => {
      const through = Option.flatMap(Option.fromUndefinedOr(manifest.scores?.[option.name]), (a) =>
        Option.fromUndefinedOr(a.through),
      );
      const movements = Result.match(movementSpans(option.music, placed, through), {
        onFailure: (error): ReadonlyArray<PartError | MovementLength> => [error],
        onSuccess: (spans) => Arr.getFailures(spans),
      });
      if (movements.length > 0) return movements;
      const asset = `score.${option.name}`;
      const state = scoreOptionState(option, placed, manifest);
      if (state._tag === 'Missing') return [AssetMissing.make({ asset })];
      if (state._tag === 'Current')
        return Option.toArray(
          Option.map(partialRange(state, placed), (range) =>
            ScorePartial.make({ asset, ...range }),
          ),
        );
      if (state.why._tag !== 'Retimed') return [state.why];
      return [AssetStale.make({ asset, stored: state.asset.hash, wanted: state.why.key })];
    },
  );

export const balanceFindings = (
  placed: ReadonlyArray<Placed>,
  plan: MixPlan<Pcm>,
  mixed: Mixed,
): ReadonlyArray<MasterLoudness | EffectHot> => {
  const { tolerance } = BALANCE;
  const found: Array<MasterLoudness | EffectHot> = [];
  const master = loudness(mixed.master).integrated;
  if (Number.isFinite(master) && Math.abs(master - BALANCE.master) > tolerance)
    found.push(MasterLoudness.make({ loudness: master, target: BALANCE.master, tolerance }));
  for (const hot of hotEffects(mixed.voice, plan.effects))
    found.push(
      EffectHot.make({
        effect: hot.name,
        scene: Option.match(sceneAt(placed, hot.at), {
          onNone: () => '',
          onSome: (p) => p.spec.id,
        }),
        at: hot.at,
        over: hot.over,
      }),
    );
  return found;
};

const libraryFindings = (
  sounds: Sounds,
  name: string,
  use: SoundUse,
): Result.Result<
  { readonly entry: LibraryEntry; readonly findings: ReadonlyArray<StaticFinding> },
  UnknownSound | SoundUseMismatch
> =>
  Result.map(resolveUse(sounds.library, name, use), (entry) => {
    const state = soundState(entry, Option.fromUndefinedOr(sounds.lock[name]));
    const findings: Array<StaticFinding> = [];
    if (state._tag === 'Missing')
      findings.push(SoundUnmade.make({ name, candidates: state.candidates }));
    if (state._tag === 'Stale') findings.push(SoundStale.make({ name }));
    return { entry, findings };
  });

const leadIn = (
  effect: string,
  placing: Sound['effects'][string],
  entry: LibraryEntry,
  sounds: MeasuredSounds,
): ReadonlyArray<LeadIn> => {
  if ((placing.sync ?? 'start') !== 'start') return [];
  const late = playablesOf(sounds, placing.sound, entry).flatMap((p, i) =>
    Option.toArray(
      Option.map(
        Option.filter(Option.all({ onset: p.onset, hit: p.hit }), ({ onset }) => onset > LEAD_IN),
        (timing) => ({ variant: i + 1, ...timing }),
      ),
    ),
  );
  return Option.toArray(
    Option.map(Arr.last(Arr.sort(late, lateOrder)), (take) =>
      LeadIn.make({ effect, name: placing.sound, ...take }),
    ),
  );
};

const lateOrder = Order.mapInput(Order.Number, (t: { readonly onset: number }) => t.onset);

const silentSeeds = (
  name: string,
  entry: LibraryEntry,
  sounds: MeasuredSounds,
): ReadonlyArray<SeedSilent> => {
  if (!isDerived(entry)) return [];
  return seedSources(sounds, name, entry).flatMap((source) =>
    Option.toArray(
      Option.map(
        Option.filter(
          Option.fromUndefinedOr(sounds.measured.get(sourceLabel(source))),
          heardNothing,
        ),
        () => SeedSilent.make({ name, seed: source.seed }),
      ),
    ),
  );
};

export const soundFindings = (
  sound: Sound,
  placed: ReadonlyArray<Placed>,
  sounds: MeasuredSounds,
): ReadonlyArray<StaticFinding> => {
  const named = new Set<string>();
  const once = (name: string, found: ReadonlyArray<StaticFinding>) => {
    if (named.has(name)) return [];
    named.add(name);
    return found;
  };
  const cueFindings = (cue: Sound['effects'][string]['at'][number]) =>
    Result.match(cueTime(cue, placed), { onFailure: (e) => [e], onSuccess: () => [] });
  const beds = (sound.beds ?? []).flatMap((bed) => [
    ...cueFindings(bed.from),
    ...cueFindings(bed.to),
    ...Result.match(libraryFindings(sounds, bed.sound, 'bed'), {
      onFailure: (e) => once(bed.sound, [e]),
      onSuccess: ({ entry, findings }) =>
        once(bed.sound, [...findings, ...silentSeeds(bed.sound, entry, sounds)]),
    }),
  ]);
  const effects = Object.entries(sound.effects).flatMap(([id, effect]) => [
    ...effect.at.flatMap(cueFindings),
    ...Result.match(libraryFindings(sounds, effect.sound, 'one-shot'), {
      onFailure: (e) => once(effect.sound, [e]),
      onSuccess: ({ entry, findings }) => [
        ...once(effect.sound, [...findings, ...silentSeeds(effect.sound, entry, sounds)]),
        ...leadIn(id, effect, entry, sounds),
      ],
    }),
  ]);
  return [...beds, ...effects];
};

const creditFindings = (
  sound: Sound,
  library: Library,
  credits: Option.Option<ReadonlyArray<Credit>>,
): ReadonlyArray<SoundCreditMissing> => {
  const owed = soundCredits(library, sound);
  return Option.match(credits, {
    onNone: () =>
      owed.map((credit) => SoundCreditMissing.make({ line: creditLine(credit), roll: false })),
    onSome: (roll) =>
      missingSoundCredits(roll, owed).map((credit) =>
        SoundCreditMissing.make({ line: creditLine(credit), roll: true }),
      ),
  });
};

const MASTER_TOLERANCE = 1 / 60;

export interface MasterAudio {
  readonly master: Option.Option<Master>;
  readonly key: Option.Option<string>;
  readonly file: string;
}

const masterFindings = (
  placed: ReadonlyArray<Placed>,
  audio: MasterAudio,
): ReadonlyArray<AudioMissing | AudioStale> => {
  if (!everyTakeRecorded(placed)) return [];
  return Option.toArray(
    masterFinding(
      audio.file,
      audio.master,
      { seconds: filmEnd(placed), key: audio.key },
      MASTER_TOLERANCE,
    ),
  );
};

const TAIL_MIN = 20;
const CARD_MIN = 5;

export const endShort = (placed: ReadonlyArray<Placed>): ReadonlyArray<EndShort> => {
  const last = Arr.last(placed);
  if (Option.isNone(last)) return [];
  const spoken = placed.filter((p) => p.voice.duration > 0);
  const lastWord = Math.max(0, ...spoken.map((p) => p.start + p.speechStart + p.voice.duration));
  const tail = filmEnd(placed) - lastWord;
  const card = Option.match(
    Option.liftPredicate(last.value, (p) => p.voice.duration <= 0),
    { onNone: () => 0, onSome: (p) => p.dur },
  );
  return [
    ...Arr.filter(
      [EndShort.make({ part: 'after the last word', secs: tail, min: TAIL_MIN })],
      () => spoken.length > 0 && tail < TAIL_MIN,
    ),
    ...Arr.filter(
      [EndShort.make({ part: 'end card', secs: card, min: CARD_MIN })],
      () => card < CARD_MIN,
    ),
  ];
};

const DEAD_FLOOR = -60;
export const DEAD_MAX = 1.5;
const DEAD_WINDOW = 0.05;

export const designedSilences = (placed: ReadonlyArray<Placed>): ReadonlyArray<Interval> =>
  placed.flatMap((p) =>
    Object.entries(p.spec.timeline ?? {})
      .filter(([, span]) => span.silence === true)
      .flatMap(([name]) =>
        Option.toArray(Option.fromNullishOr(p.cues.get(name))).map((c): Interval => ({
          from: p.start + c.start,
          to: p.start + c.end,
        })),
      ),
  );

const without = (run: Interval, cut: ReadonlyArray<Interval>): ReadonlyArray<Interval> =>
  cut.reduce<ReadonlyArray<Interval>>(
    (pieces, gone) =>
      pieces.flatMap((piece): ReadonlyArray<Interval> => {
        if (gone.to <= piece.from || gone.from >= piece.to) return [piece];
        const kept: ReadonlyArray<Interval> = [
          { from: piece.from, to: gone.from },
          { from: gone.to, to: piece.to },
        ];
        return kept.filter((k) => k.to > k.from);
      }),
    [run],
  );

export const deadAir = (
  levels: ArrayLike<number>,
  window: number,
  designed: ReadonlyArray<Interval>,
): ReadonlyArray<DeadAir> => {
  const runs: Interval[] = [];
  let from = -1;
  for (let i = 0; i <= levels.length; i++) {
    const quiet = i < levels.length && (levels[i] ?? 0) < DEAD_FLOOR;
    if (quiet && from < 0) from = i;
    if (!quiet && from >= 0) {
      runs.push({ from: from * window, to: i * window });
      from = -1;
    }
  }
  return runs
    .flatMap((run) => without(run, designed))
    .filter((run) => run.to - run.from > DEAD_MAX)
    .map((run) => DeadAir.make({ ...run, floor: DEAD_FLOOR, max: DEAD_MAX }));
};

export const staticFindings = (
  film: MeasuredFilm,
  placed: ReadonlyArray<Placed>,
  audio: MasterAudio,
): ReadonlyArray<StaticFinding> => {
  const sound = Option.toArray(film.sound).flatMap((s) => [
    ...Option.toArray(Option.fromNullishOr(s.score)).flatMap((score) =>
      musicFindings(score, placed, film.manifest),
    ),
    ...soundFindings(s, placed, film.sounds),
    ...creditFindings(s, film.sounds.library, film.credits),
  ]);
  const master = masterFindings(placed, audio);
  const takes = [...unknownVoices(film, placed), ...staleTakes(film, placed)];
  return [
    ...lateCues(placed),
    ...longSeams(placed),
    ...farPins(placed),
    ...durOnWords(placed),
    ...cueTwins(placed),
    ...storyboards(placed),
    ...repeatedKnobs(placed),
    ...takes,
    ...sound,
    ...master,
    ...endShort(placed),
  ];
};

export const mixFindings = (
  placed: ReadonlyArray<Placed>,
  plan: MixPlan<Pcm>,
  mixed: Mixed,
): ReadonlyArray<MixFinding> => {
  const levels = windowPowers(mixed.master, Math.round(DEAD_WINDOW * mixed.master.rate));
  return [
    ...deadAir(levels, DEAD_WINDOW, designedSilences(placed)),
    ...balanceFindings(placed, plan, mixed),
  ];
};

export type Sample = SceneMoment;

export const layoutSamples = (placed: ReadonlyArray<Placed>, fps: number): ReadonlyArray<Sample> =>
  sceneMoments(placed, fps, { marks: true });

const VISIBLE_ALPHA = 0.3;
const OVERLAP_TOLERANCE = 4;

const visible = (box: TextBox) => box.alpha > VISIBLE_ALPHA;

type Quad = TextBox['corners'];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];

const signedArea = (poly: ReadonlyArray<Point>): number =>
  poly.reduce((sum, p, i) => sum + cross(p, Arr.getUnsafe(poly, (i + 1) % poly.length)), 0) / 2;

const clipPolygon = (
  subject: ReadonlyArray<Point>,
  clip: ReadonlyArray<Point>,
): ReadonlyArray<Point> => {
  const winding = Math.sign(signedArea(clip));
  return clip.reduce<ReadonlyArray<Point>>((poly, a, i) => {
    if (poly.length === 0) return poly;
    const b = Arr.getUnsafe(clip, (i + 1) % clip.length);
    const inside = (p: Point) => winding * cross(sub(b, a), sub(p, a)) >= 0;
    const meet = (p: Point, q: Point): Point => {
      const d = sub(q, p);
      const k = cross(sub(b, a), sub(a, p)) / cross(sub(b, a), d);
      return [p[0] + d[0] * k, p[1] + d[1] * k];
    };
    return poly.flatMap((p, j) => {
      const prev = Arr.getUnsafe(poly, (j + poly.length - 1) % poly.length);
      if (inside(p)) {
        if (inside(prev)) return [p];
        return [meet(prev, p), p];
      }
      if (inside(prev)) return [meet(prev, p)];
      return [];
    });
  }, subject);
};

const sharedArea = (a: Quad, b: Quad): number => {
  if (signedArea(a) === 0 || signedArea(b) === 0) return 0;
  return Math.abs(signedArea(clipPolygon(a, b)));
};

const inset = (q: Quad, by: number): Option.Option<Quad> => {
  const [tl, tr, br, bl] = q;
  const across = Math.hypot(...sub(tr, tl));
  const down = Math.hypot(...sub(bl, tl));
  if (across <= 2 * by || down <= 2 * by) return Option.none();
  const u = sub(tr, tl).map((c) => (c / across) * by);
  const v = sub(bl, tl).map((c) => (c / down) * by);
  const move = (p: Point, su: number, sv: number): Point => [
    p[0] + su * Arr.getUnsafe(u, 0) + sv * Arr.getUnsafe(v, 0),
    p[1] + su * Arr.getUnsafe(u, 1) + sv * Arr.getUnsafe(v, 1),
  ];
  return Option.some([move(tl, 1, 1), move(tr, -1, 1), move(br, -1, -1), move(bl, 1, -1)]);
};

export const overlapArea = (a: TextBox, b: TextBox): number => {
  const deep = Option.zipWith(
    inset(a.corners, OVERLAP_TOLERANCE / 2),
    inset(b.corners, OVERLAP_TOLERANCE / 2),
    sharedArea,
  );
  if (Option.getOrElse(deep, () => 0) <= 0) return 0;
  return sharedArea(a.corners, b.corners);
};

const offFrame = (
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  width: number,
  height: number,
) => box.x >= width || box.y >= height || box.x + box.w <= 0 || box.y + box.h <= 0;

export const pastFrame = (
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  width: number,
  height: number,
) => {
  if (offFrame(box, width, height)) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.max(0, -box.x),
    top: Math.max(0, -box.y),
    right: Math.max(0, box.x + box.w - width),
    bottom: Math.max(0, box.y + box.h - height),
  };
};

const showing = (stroke: InkMark, layers: ReadonlyArray<InkMark>): number =>
  layers.reduce((left, layer) => left * (1 - layer.alpha), stroke.alpha);
const UNDER_ALPHA = 0.5;
const TEXTURE_WIDTH = 1 / 3;
const CROSS_STEP = 2;

const clipSegment = (
  p: Point,
  q: Point,
  poly: ReadonlyArray<Point>,
): Option.Option<readonly [number, number]> => {
  const winding = Math.sign(signedArea(poly));
  if (winding === 0) return Option.none();
  const d = sub(q, p);
  let enter = 0;
  let leave = 1;
  for (const [i, a] of poly.entries()) {
    const edge = sub(Arr.getUnsafe(poly, (i + 1) % poly.length), a);
    const at = winding * cross(edge, sub(p, a));
    const rate = winding * cross(edge, d);
    if (rate === 0) {
      if (at < 0) return Option.none();
      continue;
    }
    const t = -at / rate;
    if (rate > 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return Option.none();
  }
  return Option.some([enter, leave]);
};

const nearestOnSegment = (a: Point, b: Point, p: Point): Point => {
  const d = sub(b, a);
  const span = d[0] * d[0] + d[1] * d[1];
  if (span === 0) return a;
  const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / span));
  return [a[0] + d[0] * t, a[1] + d[1] * t];
};

const nearestIn = (q: Quad, p: Point): Point => {
  if (insidePolygon(q, p)) return p;
  const candidates = q.map((a, i) => nearestOnSegment(a, Arr.getUnsafe(q, (i + 1) % q.length), p));
  return Arr.reduce(candidates.slice(1), Arr.getUnsafe(candidates, 0), (best, c) => {
    if (Math.hypot(...sub(c, p)) < Math.hypot(...sub(best, p))) return c;
    return best;
  });
};

const crossing = (stroke: InkMark, text: TextBox, covers: ReadonlyArray<InkMark>): number => {
  const box = inset(text.corners, OVERLAP_TOLERANCE / 2 - stroke.width / 2);
  if (Option.isNone(box)) return 0;
  const over = covers.filter((c) => c.order > stroke.order);
  const letters = Option.getOrElse(inset(text.corners, OVERLAP_TOLERANCE / 2), () => text.corners);
  const hidden = (at: Point) => {
    const meets = nearestIn(letters, at);
    const layers = over.filter((c) => insidePolygon(c.points, meets));
    return showing(stroke, layers) <= VISIBLE_ALPHA;
  };
  return stroke.points.slice(1).reduce((sum, q, i) => {
    const p = Arr.getUnsafe(stroke.points, i);
    return Option.match(clipSegment(p, q, box.value), {
      onNone: () => sum,
      onSome: ([enter, leave]) => {
        const len = Math.hypot(...sub(q, p)) * (leave - enter);
        const steps = Math.max(1, Math.ceil(len / CROSS_STEP));
        const shown = Arr.range(0, steps - 1).filter((k) => {
          const t = enter + ((leave - enter) * (k + 0.5)) / steps;
          return !hidden([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }).length;
        return sum + (len * shown) / steps;
      },
    });
  }, 0);
};

const near = (
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  pad: number,
) =>
  a.x - pad <= b.x + b.w &&
  b.x <= a.x + a.w + pad &&
  a.y - pad <= b.y + b.h &&
  b.y <= a.y + a.h + pad;

const boundsOf = (marks: ReadonlyArray<InkMark>) => {
  const x = Math.min(...marks.map((m) => m.x));
  const y = Math.min(...marks.map((m) => m.y));
  return {
    x,
    y,
    w: Math.max(...marks.map((m) => m.x + m.w)) - x,
    h: Math.max(...marks.map((m) => m.y + m.h)) - y,
  };
};

const lettersHeight = (text: TextBox) => Math.hypot(...sub(text.corners[3], text.corners[0]));

const marksLine = (stroke: InkMark, text: TextBox) =>
  text.scene === stroke.scene &&
  Option.exists(Option.fromUndefinedOr(text.hand), (hand) =>
    Option.exists(Option.fromUndefinedOr(stroke.marks), (marks) => marks.includes(hand)),
  );

const textureUnder = (stroke: InkMark, text: TextBox) =>
  stroke.order < text.order &&
  stroke.alpha <= UNDER_ALPHA &&
  stroke.width <= lettersHeight(text) * TEXTURE_WIDTH;

const inkOverText = (sample: Sample, probed: Probed): ReadonlyArray<InkOverText> => {
  const texts = probed.texts.filter(visible);
  const strokes = probed.inks.filter((m) => m.kind === 'stroke' && m.alpha > VISIBLE_ALPHA);
  const covers = probed.inks.filter((m) => m.kind !== 'stroke');
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const byText = new Map<string, Array<readonly [InkMark, number]>>();
  for (const text of texts)
    for (const stroke of strokes) {
      if (marksLine(stroke, text) || !near(stroke, text, stroke.width)) continue;
      if (textureUnder(stroke, text)) continue;
      const length = crossing(stroke, text, covers);
      if (length <= OVERLAP_TOLERANCE) continue;
      const found = Option.getOrElse(Option.fromNullishOr(byText.get(text.text)), () => []);
      byText.set(text.text, [...found, [stroke, length]]);
    }
  return [...byText].map(([text, crossed]) => {
    const marks = Arr.dedupe(crossed.map(([m]) => m));
    return InkOverText.make({
      ...where,
      text,
      strokes: marks.length,
      length: crossed.reduce((sum, [, len]) => sum + len, 0),
      ...boundsOf(marks),
    });
  });
};

const FACE_CORE = 0.7;

const distanceTo = (points: ReadonlyArray<Point>, p: Point): number =>
  Arr.match(points, {
    onEmpty: () => Number.POSITIVE_INFINITY,
    onNonEmpty: (all) =>
      Math.min(
        Math.hypot(...sub(Arr.headNonEmpty(all), p)),
        ...all
          .slice(1)
          .map((b, i) => Math.hypot(...sub(nearestOnSegment(Arr.getUnsafe(all, i), b, p), p))),
      ),
  });

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

export const seenFace = (f: FaceMark, scene: string, frame: FrameSize) =>
  f.scene === scene &&
  f.alpha > 0.5 &&
  f.x >= 0 &&
  f.x <= frame.width &&
  f.y >= 0 &&
  f.y <= frame.height;

export const inkOverFace = (
  sample: Sample,
  probed: Probed,
  frame: FrameSize,
): ReadonlyArray<InkOverFace> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const faces = Option.getOrElse(Option.fromUndefinedOr(probed.faces), () => []);
  return faces
    .filter((face) => seenFace(face, sample.scene, frame))
    .flatMap((face) => {
      const centre: Point = [face.x, face.y];
      const core = (face.size / 2) * FACE_CORE;
      const after = (mark: { readonly scene: string; readonly order: number }) =>
        mark.scene === face.scene && mark.order >= face.order;
      const strokes = probed.inks.filter(
        (m) =>
          m.kind === 'stroke' &&
          m.alpha > VISIBLE_ALPHA &&
          after(m) &&
          Option.isNone(Option.fromUndefinedOr(m.marks)) &&
          distanceTo(m.points, centre) <= core + m.width / 2,
      );
      const texts = probed.texts.filter(
        (t) =>
          visible(t) &&
          after(t) &&
          t.caption !== true &&
          Math.hypot(...sub(nearestIn(t.corners, centre), centre)) <= core,
      );
      if (strokes.length === 0 && texts.length === 0) return [];
      return [
        InkOverFace.make({
          ...where,
          x: face.x,
          y: face.y,
          size: face.size,
          strokes: strokes.length,
          texts: Arr.dedupe(texts.map((t) => t.text)),
        }),
      ];
    });
};

const plateUnder = (probed: Probed, text: TextBox) => {
  const centre: Point = [text.x + text.w / 2, text.y + text.h / 2];
  return Arr.last(
    probed.inks.filter(
      (m) =>
        m.kind !== 'stroke' &&
        m.alpha > VISIBLE_ALPHA &&
        m.order < text.order &&
        insidePolygon(m.points, centre),
    ),
  );
};

const BACKDROP = 0.5;
const AT_REST = 1;

export const platesOffFrame = (
  sample: Sample,
  probed: Probed,
  size: FrameSize,
  next: Probed = probed,
): ReadonlyArray<PlateOffFrame> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const still = (plate: InkMark, text: TextBox) =>
    Arr.some(next.texts, (later) => {
      if (later.text !== text.text) return false;
      return Option.match(plateUnder(next, later), {
        onNone: () => false,
        onSome: (moved) =>
          Math.max(
            Math.abs(moved.x - plate.x),
            Math.abs(moved.y - plate.y),
            Math.abs(moved.w - plate.w),
            Math.abs(moved.h - plate.h),
          ) <= AT_REST,
      });
    });
  return probed.texts.filter(visible).flatMap((text) => {
    if (offFrame(text, size.width, size.height)) return [];
    const inside = pastFrame(text, size.width, size.height);
    if (Math.max(inside.left, inside.top, inside.right, inside.bottom) > 0) return [];
    return Option.match(plateUnder(probed, text), {
      onNone: () => [],
      onSome: (plate) => {
        if (plate.w >= size.width * BACKDROP && plate.h >= size.height * BACKDROP) return [];
        const past = pastFrame(plate, size.width, size.height);
        if (Math.max(past.left, past.top, past.right, past.bottom) <= OVERLAP_TOLERANCE) return [];
        const across = past.left > OVERLAP_TOLERANCE && past.right > OVERLAP_TOLERANCE;
        const down = past.top > OVERLAP_TOLERANCE && past.bottom > OVERLAP_TOLERANCE;
        if (across || down) return [];
        if (!still(plate, text)) return [];
        return [PlateOffFrame.make({ ...where, text: text.text, ...past })];
      },
    });
  });
};

const pastBox = (
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
) => ({
  left: Math.max(0, b.x - a.x),
  top: Math.max(0, b.y - a.y),
  right: Math.max(0, a.x + a.w - (b.x + b.w)),
  bottom: Math.max(0, a.y + a.h - (b.y + b.h)),
});

const textsOffPlate = (sample: Sample, probed: Probed): ReadonlyArray<TextOffPlate> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const plates = new Map(probed.texts.map((t) => [t.order, t] as const));
  return probed.texts.filter(visible).flatMap((text) =>
    Option.match(
      Option.flatMap(Option.fromUndefinedOr(text.on), (on) =>
        Option.fromUndefinedOr(plates.get(on)),
      ),
      {
        onNone: () => [],
        onSome: (plate) => {
          const inner = Option.getOrElse(
            inset(text.corners, OVERLAP_TOLERANCE),
            () => text.corners,
          );
          if (inner.every((corner) => insidePolygon(plate.corners, corner))) return [];
          return [TextOffPlate.make({ ...where, text: text.text, ...pastBox(text, plate) })];
        },
      },
    ),
  );
};

const carries = (a: TextBox, b: TextBox) => a.on === b.order || b.on === a.order;

export const frameFindings = (
  sample: Sample,
  probed: Probed,
  size: FrameSize,
  next: Probed = probed,
): ReadonlyArray<FrameFinding> => {
  const shown = probed.texts.filter(visible);
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const overlaps = shown.flatMap((a, i) =>
    shown.slice(i + 1).flatMap((b) => {
      if (a.text === b.text || carries(a, b)) return [];
      const area = overlapArea(a, b);
      if (area <= 0) return [];
      const [first, second] = Arr.sort([a.text, b.text], Order.String);
      return [TextOverlap.make({ ...where, a: first ?? a.text, b: second ?? b.text, area })];
    }),
  );
  const off = shown.flatMap((box) => {
    const past = pastFrame(box, size.width, size.height);
    if (past.left + past.top + past.right + past.bottom <= 0) return [];
    return [TextOffFrame.make({ ...where, text: box.text, ...past })];
  });
  return [
    ...overlaps,
    ...off,
    ...inkOverText(sample, probed),
    ...platesOffFrame(sample, probed, size, next),
    ...textsOffPlate(sample, probed),
  ];
};

const matchFinding = Match.type<FrameFinding>();

const keyOf = matchFinding.pipe(
  Match.tagsExhaustive({
    TextOverlap: (f) => `overlap\u0000${f.scene}\u0000${f.a}\u0000${f.b}`,
    TextOffFrame: (f) => `off\u0000${f.scene}\u0000${f.text}`,
    InkOverText: (f) => `ink\u0000${f.scene}\u0000${f.text}`,
    PlateOffFrame: (f) => `plate\u0000${f.scene}\u0000${f.text}`,
    TextOffPlate: (f) => `offplate\u0000${f.scene}\u0000${f.text}`,
  }),
);

const edges = (f: { left: number; top: number; right: number; bottom: number }) =>
  f.left + f.top + f.right + f.bottom;

const size = matchFinding.pipe(
  Match.tagsExhaustive({
    TextOverlap: (f) => f.area,
    InkOverText: (f) => f.length,
    TextOffFrame: edges,
    PlateOffFrame: edges,
    TextOffPlate: edges,
  }),
);

const withFrames = (f: FrameFinding, frames: number): FrameFinding => {
  const where = { scene: f.scene, time: f.time, at: f.at, frames };
  return matchFinding.pipe(
    Match.tagsExhaustive({
      TextOverlap: (o): FrameFinding =>
        TextOverlap.make({ ...where, a: o.a, b: o.b, area: o.area }),
      InkOverText: (o): FrameFinding =>
        InkOverText.make({
          ...where,
          text: o.text,
          strokes: o.strokes,
          length: o.length,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
        }),
      TextOffFrame: (o): FrameFinding =>
        TextOffFrame.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
      PlateOffFrame: (o): FrameFinding =>
        PlateOffFrame.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
      TextOffPlate: (o): FrameFinding =>
        TextOffPlate.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
    }),
  )(f);
};

export const mergeFindings = (
  findings: ReadonlyArray<FrameFinding>,
): ReadonlyArray<FrameFinding> => {
  const merged = new Map<string, FrameFinding>();
  for (const f of findings) {
    const key = keyOf(f);
    const seen = Option.fromNullishOr(merged.get(key));
    const frames = Option.match(seen, { onNone: () => 0, onSome: (s) => s.frames }) + f.frames;
    const worst = Option.match(seen, {
      onNone: () => f,
      onSome: (s) => {
        if (size(f) > size(s)) return f;
        return s;
      },
    });
    merged.set(key, withFrames(worst, frames));
  }
  return [...merged.values()];
};

export const HOLD = 4;
export const STILL_DRIFT = 2 * STROKE_JITTER;
const STILL_FADE = 0.02;

export interface HoldCandidate {
  readonly scene: string;
  readonly from: number;
  readonly to: number;
}

const busySpans = (p: Placed): ReadonlyArray<Interval> => {
  const cues = [...p.cues.values()].map((c): Interval => ({ from: c.start, to: c.end }));
  const arriving = Math.min(p.index, 1) * transitionDur(p.spec.enter);
  if (arriving <= 0) return cues;
  return [{ from: 0, to: arriving }, ...cues];
};

const spokenSpan = (p: Placed): Option.Option<Interval> =>
  Option.zipWith(Arr.head(p.voice.words), Arr.last(p.voice.words), (first, last): Interval => ({
    from: p.speechStart + first.start,
    to: p.speechStart + last.end,
  }));

const gapsIn = (within: Interval, busy: ReadonlyArray<Interval>): ReadonlyArray<Interval> => {
  const sorted = Arr.sort(
    busy,
    Order.mapInput(Order.Number, (s: Interval) => s.from),
  );
  const swept = sorted.reduce<{ readonly gaps: ReadonlyArray<Interval>; readonly at: number }>(
    ({ gaps, at }, span) => {
      const until = Math.min(span.from, within.to);
      const next = Math.max(at, span.to);
      if (until > at) return { gaps: [...gaps, { from: at, to: until }], at: next };
      return { gaps, at: next };
    },
    { gaps: [], at: within.from },
  );
  if (swept.at >= within.to) return swept.gaps;
  return [...swept.gaps, { from: swept.at, to: within.to }];
};

export const holdCandidates = (placed: ReadonlyArray<Placed>): ReadonlyArray<HoldCandidate> =>
  placed.flatMap((p) => {
    if (p.spec.storyboard === true) return [];
    return Option.match(spokenSpan(p), {
      onNone: () => [],
      onSome: (spoken) => {
        const gaps = gapsIn(spoken, busySpans(p)).filter(
          (g) => g.to - g.from > HOLD + CLOCK_EPSILON,
        );
        return gaps.map((g) => ({ scene: p.spec.id, from: p.start + g.from, to: p.start + g.to }));
      },
    });
  });

export const holdTicks = (hold: Interval, fps: number): ReadonlyArray<number> => {
  const { first, last } = framesOf(hold, fps);
  const per = fps / BOIL_FPS;
  const ticks = Arr.range(0, Math.floor((last - first) / per)).map(
    (k) => first + Math.round(k * per),
  );
  return Arr.dedupe([...ticks, last]).filter((f) => f >= first && f <= last);
};

export const holdGrid = (ticks: ReadonlyArray<number>): ReadonlyArray<number> => {
  const step = Math.round((HOLD / 2) * BOIL_FPS);
  return Arr.dedupe([
    ...ticks.filter((_, i) => i % step === 0),
    ...Option.toArray(Arr.last(ticks)),
  ]);
};

export const stillSpan = (
  hold: Interval,
  ticks: ReadonlyArray<number>,
  lo: number,
  hi: number,
  fps: number,
): Interval => {
  const edge = (end: Option.Option<number>, tick: number, whole: number) => {
    if (Option.exists(end, (f) => f === tick)) return whole;
    return secondsAt(tick, fps);
  };
  return { from: edge(Arr.head(ticks), lo, hold.from), to: edge(Arr.last(ticks), hi, hold.to) };
};

type Mark = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly alpha: number;
  readonly scale: number;
};

const BOX_NOISE = 1e-9; // oxlint-disable-line film/one-clock-epsilon -- a box's units, not a time

const boxAtRest = (a: Mark, b: Mark) =>
  Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.x + a.w - (b.x + b.w)),
    Math.abs(a.y + a.h - (b.y + b.h)),
  ) <=
    STILL_DRIFT * Math.min(a.scale, b.scale) + BOX_NOISE &&
  Math.abs(a.alpha - b.alpha) <= STILL_FADE;

const pictureOf = (probed: Probed): Required<Pick<Probed, 'texts' | 'inks' | 'footage'>> => ({
  texts: probed.texts.filter((t) => t.caption !== true),
  inks: probed.inks.filter((m) => m.caption !== true),
  footage: probed.footage ?? [],
});

const atRest = (a: ReturnType<typeof pictureOf>, b: ReturnType<typeof pictureOf>) =>
  a.texts.length === b.texts.length &&
  a.inks.length === b.inks.length &&
  a.footage.length === b.footage.length &&
  Arr.zip(a.texts, b.texts).every(([s, t]) => s.text === t.text && boxAtRest(s, t)) &&
  Arr.zip(a.inks, b.inks).every(([m, n]) => m.kind === n.kind && boxAtRest(m, n)) &&
  Arr.zip(a.footage, b.footage).every(([s, t]) => s.source === t.source && s.at === t.at);

export const heldStill = (frames: ReadonlyArray<Probed>): boolean => {
  const pictures = frames.map(pictureOf);
  return Option.match(Arr.head(pictures), {
    onNone: () => true,
    onSome: (first) => pictures.slice(1).every((p) => atRest(first, p)),
  });
};
