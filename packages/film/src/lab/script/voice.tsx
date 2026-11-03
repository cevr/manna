import { useAtomRefresh, useAtomSet, useAtomValue } from '@manna/atom-solid';
import { Array as Arr, Data, Effect, Exit, Fiber, Match, Option, Schedule, Stream } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import { Media, type Playable, Played } from '../../browser/media.ts';
import type { Host } from '../../browser/host.ts';
import type { MarksPost, ScriptVoice, StagingTake } from '../../core/api.ts';
import { type LineRead, type Mark, sameMarks } from '../../core/delivery.ts';
import type { TakeWord } from '../../core/schema.ts';
import { type LabFailure, reasonOf } from '../api.ts';
import type { WordAt } from '../transcript/lit.ts';
import { heardAt, retaken, spanOf } from './delivery.ts';
import { type MarkWrite, MarkingEvent, type MarkingState, spawnMarking } from './marking.ts';

const ASKED_AGAIN = { voicing: '4 seconds', resting: '1 minute' } as const;

type Ready = Extract<StagingTake, { readonly _tag: 'Ready' }>;

type Heard = Data.TaggedEnum<{
  Quiet: {};
  Blocked: { readonly beat: string };
  Hearing: {
    readonly beat: string;
    readonly words: ReadonlyArray<TakeWord>;
    readonly end: number;
    readonly next: ReadonlyArray<string>;
    readonly index: Option.Option<number>;
  };
}>;
const Heard = Data.taggedEnum<Heard>();

export type Marking = Data.TaggedEnum<{
  Idle: {};
  Writing: { readonly beat: string };
  Written: { readonly beat: string };
  Failed: { readonly beat: string; readonly reason: string };
}>;
export const Marking = Data.taggedEnum<Marking>();

interface Wrote {
  readonly read: ReadonlyArray<Mark>;
  readonly now: ReadonlyArray<Mark>;
}

interface VoiceContextValue {
  readonly take: (id: string) => Option.Option<StagingTake>;
  readonly takes: Accessor<ReadonlyArray<StagingTake>>;
  readonly spend: Accessor<Option.Option<{ readonly spent: number; readonly cap: number }>>;
  readonly unread: Accessor<Option.Option<string>>;
  readonly heard: Accessor<Option.Option<WordAt>>;
  readonly hearing: Accessor<Option.Option<string>>;
  readonly blocked: Accessor<Option.Option<string>>;
  readonly hear: (
    id: string,
    words: Option.Option<{ readonly from: number; readonly to: number }>,
    on: boolean,
  ) => void;
  readonly stop: () => void;
  readonly marking: Accessor<Marking>;
  readonly mark: (beat: string, marks: ReadonlyArray<Mark>, read: LineRead) => void;
  readonly marksOf: (beat: string, read: ReadonlyArray<Mark>) => ReadonlyArray<Mark>;
  readonly written: string;
}

const VoiceContext = createContext<VoiceContextValue>();

export const useVoice = (): VoiceContextValue => useContext(VoiceContext);

const voicing = (voice: ScriptVoice): boolean => voice.beats.some((b) => b.take._tag === 'Voicing');

const sameRead = (a: Option.Option<ScriptVoice>, b: Option.Option<ScriptVoice>): boolean =>
  Option.isSome(a) && Option.isSome(b) && a.value === b.value;

const voicingOrResting = (voice: ScriptVoice): keyof typeof ASKED_AGAIN => {
  if (voicing(voice)) return 'voicing';
  return 'resting';
};

export const polled = <R,>(read: Effect.Effect<ScriptVoice, LabFailure, R>) =>
  Stream.fromEffectSchedule(
    read,
    Schedule.forever.pipe(
      Schedule.modifyDelay(({ input }: Schedule.InputMetadata<ScriptVoice>) =>
        Effect.succeed(ASKED_AGAIN[voicingOrResting(input)]),
      ),
    ),
  );

interface Gives {
  readonly pause: () => void;
  readonly playing: () => boolean;
}

export interface VoiceSource {
  readonly reading: Atom.Atom<AsyncResult.AsyncResult<ScriptVoice, unknown>>;
  readonly write: Atom.AtomResultFn<MarksPost, unknown, LabFailure>;
  readonly takeUrl: (file: string) => string;
  readonly beats: Accessor<ReadonlyArray<string>>;
  readonly host: Host;
  readonly player: Option.Option<Gives>;
  readonly written: string;
  readonly reread: Option.Option<() => void>;
}

export const VoiceOver = (props: ParentProps<{ readonly source: VoiceSource }>) => {
  const source = props.source;
  const result = useAtomValue(() => source.reading);
  const readAgain = useAtomRefresh(() => source.reading);
  const voice = createMemo(() => AsyncResult.value(result()));
  const takes = createMemo(
    (): ReadonlyMap<string, StagingTake> =>
      new Map(
        Option.getOrElse(
          Option.map(voice(), (v) => v.beats.map((b) => [b.id, b.take])),
          () => [],
        ),
      ),
  );
  let seen: ReadonlyMap<string, StagingTake> = new Map();
  let pastWrite = Option.none<Option.Option<ScriptVoice>>();
  createEffect(
    () => ({ now: takes(), read: voice() }),
    ({ now, read }) => {
      const before = seen;
      seen = now;
      const landed = Option.exists(pastWrite, (had) => Option.isSome(read) && !sameRead(had, read));
      if (landed) pastWrite = Option.none();
      if (landed || retaken(before, now)) Option.map(source.reread, (reread) => reread());
    },
  );
  const take = (id: string) => Option.fromUndefinedOr(takes().get(id));
  const readyOf = (id: string): Option.Option<Ready> =>
    Option.filter(take(id), (t): t is Ready => t._tag === 'Ready');

  const audios = new Map<string, Playable>();
  const audioOf = (file: string): Playable =>
    Option.getOrElse(Option.fromUndefinedOr(audios.get(file)), () => {
      const made = Effect.runSyncWith(source.host)(
        Media.useSync((m) => m.audio(source.takeUrl(file))),
      );
      audios.set(file, made);
      return made;
    });
  const [heard, setHeard] = createSignal<Heard>(Heard.Quiet(), { ownedWrite: true });
  let current = Option.none<Playable>();
  let loop = Option.none<Fiber.Fiber<void>>();
  const stopLoop = () => {
    Option.map(loop, (f) => Effect.runFork(Fiber.interrupt(f)));
    loop = Option.none();
  };
  const halt = () => {
    stopLoop();
    Option.map(current, (media) => Effect.runFork(media.pause));
  };
  const stop = () => {
    halt();
    setHeard(Heard.Quiet());
  };

  let plays = 0;
  const play = (
    beat: string,
    take: Ready,
    start: number,
    end: number,
    next: ReadonlyArray<string>,
  ) => {
    stopLoop();
    const media = audioOf(take.file);
    current = Option.some(media);
    const n = ++plays;
    const mine = () => n === plays;
    setHeard(Heard.Hearing({ beat, words: take.words, end, next, index: Option.none() }));
    Option.map(source.player, (p) => p.pause());
    const hushed = Effect.sync(() => {
      if (mine()) stop();
    });
    const blocked = Effect.sync(() => {
      if (!mine()) return;
      halt();
      setHeard(Heard.Blocked({ beat }));
    });
    let then = stop;
    const heardThrough = Frames.use((f) =>
      f.loop(() =>
        Option.match(step(media), {
          onNone: () => true,
          onSome: (after) => {
            then = after;
            return false;
          },
        }),
      ),
    ).pipe(Effect.andThen(Effect.sync(() => then())));
    loop = Option.some(
      Effect.runForkWith(source.host)(
        media.seek(start).pipe(
          Effect.andThen(Media.use((m) => m.hear(media, hushed))),
          Effect.flatMap((played) =>
            Played.$match(played, {
              Playing: () => heardThrough,
              Muted: () => heardThrough,
              Aborted: () => Effect.void,
              Blocked: () => blocked,
              Failed: () => hushed,
            }),
          ),
        ),
      ),
    );
  };
  const playNext = (next: ReadonlyArray<string>) =>
    Option.match(
      Arr.findFirst(
        next.map((id, i) => ({ id, i, take: readyOf(id) })),
        (b) => Option.isSome(b.take),
      ),
      {
        onNone: stop,
        onSome: (b) => Option.map(b.take, (t) => play(b.id, t, 0, t.duration, next.slice(b.i + 1))),
      },
    );
  const step = (media: Playable): Option.Option<() => void> => {
    const now = untrack(heard);
    if (now._tag !== 'Hearing' || Option.exists(source.player, (p) => p.playing()))
      return Option.some(stop);
    const t = media.time();
    if (media.ended() || t >= now.end) return Option.some(() => playNext(now.next));
    const index = heardAt(now.words, t);
    if (Option.getOrElse(index, () => -1) !== Option.getOrElse(now.index, () => -1))
      setHeard(Heard.Hearing({ ...now, index }));
    return Option.none();
  };
  onCleanup(halt);

  const hear: VoiceContextValue['hear'] = (id, words, on) =>
    Option.map(readyOf(id), (t) => {
      const span = Option.getOrElse(
        Option.flatMap(words, (w) => spanOf(t.words, w.from, w.to)),
        () => ({ start: 0, end: t.duration }),
      );
      const after = Arr.dropWhile(source.beats(), (b) => b !== id).slice(1);
      play(
        id,
        t,
        span.start,
        span.end,
        Arr.filter(after, () => on),
      );
    });

  const [wrote, setWrote] = createSignal<ReadonlyMap<string, Wrote>>(new Map(), {
    ownedWrite: true,
  });
  const moved = new WeakSet<Wrote>();
  const stillAhead = (w: Wrote, read: ReadonlyArray<Mark>): boolean => {
    if (moved.has(w)) return false;
    if (sameMarks(w.read, read)) return true;
    moved.add(w);
    return false;
  };
  const marksOf = (beat: string, read: ReadonlyArray<Mark>): ReadonlyArray<Mark> =>
    Option.getOrElse(
      Option.map(
        Option.filter(Option.fromUndefinedOr(wrote().get(beat)), (w) => stillAhead(w, read)),
        (w) => w.now,
      ),
      () => read,
    );

  const post = useAtomSet(() => source.write, { mode: 'promiseExit' });
  const write = (w: MarkWrite): Effect.Effect<void, string> =>
    Effect.flatMap(
      Effect.promise(() => post(w.post)),
      (exit) => {
        if (Exit.isFailure(exit)) return Effect.fail(reasonOf(exit.cause));
        return Effect.sync(() => {
          setWrote((was) => new Map(was).set(w.post.beat, { read: w.read, now: w.post.marks }));
          pastWrite = Option.some(untrack(voice));
          readAgain();
        });
      },
    );
  const spawned = Atom.make(Machine.scoped(spawnMarking(write)));
  const live = Atom.map(spawned, (made) => Option.map(AsyncResult.value(made), ActorAtom.make));
  const markingAtom = Atom.writable(
    (get) => Option.map(get(live), (actor) => get(actor)),
    (ctx, event: MarkingEvent) => {
      Option.map(ctx.get(live), (actor) => ctx.set(actor, event));
    },
  ).pipe(Atom.withServerValue(() => Option.none<MarkingState>()));
  const machine = useAtomValue(() => markingAtom);
  const sendMarking = useAtomSet(() => markingAtom);
  const marking = (): Marking =>
    Option.match(machine(), {
      onNone: () => Marking.Idle(),
      onSome: (state) =>
        Match.value(state).pipe(
          Match.tagsExhaustive({
            Idle: () => Marking.Idle(),
            Writing: (s) => Marking.Writing({ beat: s.beat }),
            Written: (s) => Marking.Written({ beat: s.beat }),
            Failed: (s) => Marking.Failed({ beat: s.beat, reason: s.reason }),
          }),
        ),
    });
  const mark = (beat: string, marks: ReadonlyArray<Mark>, read: LineRead) => {
    const on: LineRead = { spoken: read.spoken, marks: untrack(() => marksOf(beat, read.marks)) };
    sendMarking(
      MarkingEvent.Mark({ write: { post: { beat, marks, read: on }, read: read.marks } }),
    );
  };

  const value: VoiceContextValue = {
    take,
    takes: () => [...takes().values()],
    spend: () => Option.map(voice(), (v) => ({ spent: v.spent, cap: v.cap })),
    unread: () =>
      AsyncResult.match(result(), {
        onInitial: () => Option.none<string>(),
        onFailure: (f) => Option.some(reasonOf(f.cause)),
        onSuccess: () => Option.none<string>(),
      }),
    heard: () =>
      Heard.$match(heard(), {
        Quiet: () => Option.none<WordAt>(),
        Blocked: () => Option.none<WordAt>(),
        Hearing: (h) => Option.map(h.index, (index): WordAt => ({ section: h.beat, index })),
      }),
    hearing: () =>
      Heard.$match(heard(), {
        Quiet: () => Option.none<string>(),
        Blocked: () => Option.none<string>(),
        Hearing: (h) => Option.some(h.beat),
      }),
    blocked: () =>
      Heard.$match(heard(), {
        Quiet: () => Option.none<string>(),
        Blocked: (b) => Option.some(b.beat),
        Hearing: () => Option.none<string>(),
      }),
    hear,
    stop,
    marking,
    mark,
    marksOf,
    written: source.written,
  };
  return <VoiceContext value={value}>{props.children}</VoiceContext>;
};
