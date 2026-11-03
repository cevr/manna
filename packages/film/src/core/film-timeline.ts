import {
  Array as Arr,
  Boolean as Bool,
  DateTime,
  Match,
  Option,
  Order,
  Predicate,
  Record,
  Result,
} from 'effect';
import { type Address, addressKey } from './address-schema.ts';
import { Shot, type TimedBeat, shotsOf } from './animatic.ts';
import { pageHref } from './api.ts';
import { type AskRecord, askStatus, blocksOf, materialsIn } from './ask.ts';
import {
  type BoardFile,
  PANEL_START,
  type Panel,
  type PanelText,
  approvalOf,
  approveBeat,
  shownTry,
} from './board.ts';
import {
  type Catalogue,
  MAIN_VARIANT,
  approvalState,
  renderIn,
  sceneSlot,
  subjectOf,
} from './catalogue.ts';
import { type PartError, stretchesOf } from './acts.ts';
import { gist } from './lab-events.ts';
import type { Placed } from './layout.ts';
import { cardSaid } from './narration.ts';
import { noteT, unresolved } from './notes.ts';
import { type ProductionFile, decidedSince, decisionsIn } from './production.ts';
import { FilmVersionUnkept, FilmVersionUnknown } from './refusals.ts';
import type { NotesFile } from './schema.ts';
import {
  type BeatVoice,
  type ClockBeat,
  type ClockPart,
  type FilmClock,
  type VersionFiles,
  type FilmVersion,
  Stage,
  type Track,
  type ClipState,
  type ClipClock,
  type ScriptClip,
  type BoardClip,
  type VoiceClip,
  type SceneClip,
  type SoundClip,
  type RenderClip,
  type Lane,
  FlowStage,
  type NextRow,
  type Marker,
  type Waiting,
  type FilmTimeline,
} from './timeline-schema.ts';

interface PartOf {
  readonly from: string;
  readonly name: string;
}

const partsOn = (
  parts: ReadonlyArray<PartOf>,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<ClockPart>, PartError> =>
  Result.map(stretchesOf(parts, placed), (stretches) =>
    stretches.map((s) => ({ name: s.part.name, from: s.part.from, start: s.from, end: s.to })),
  );

const voiceOf = (p: Placed): BeatVoice => {
  if (p.voice.spoken.length === 0) return 'silent';
  if (!p.voice.recorded) return 'estimated';
  if (p.voice.source === 'recorded') return 'owner';
  return 'staging';
};

export const clockBeat = (p: Placed, drawn: boolean): ClockBeat => {
  const speechStart = p.start + p.speechStart;
  return {
    id: p.spec.id,
    start: p.start,
    dur: p.dur,
    hold: {
      lead: p.speechStart,
      tail: Math.max(0, p.dur - p.speechStart - p.voice.duration),
      declared: (['lead', 'tail'] as const).filter((edge) =>
        Predicate.isNotUndefined(p.spec[edge]),
      ),
      asked: p.tail,
      min: p.min,
    },
    ...Option.match(
      Option.liftPredicate(p.voice.duration, (d) => d > 0),
      {
        onNone: () => ({}),
        onSome: (d) => ({ speech: { start: speechStart, end: speechStart + d } }),
      },
    ),
    marks: [...p.voice.marks].map(([name, at]) => ({ name, at: speechStart + at })),
    words: p.voice.words.map((w) => ({ text: w.text, start: speechStart + w.start })),
    voice: voiceOf(p),
    drawn,
  };
};

export const filmClock = (
  placed: ReadonlyArray<Placed>,
  fps: number,
  parts: {
    readonly acts: ReadonlyArray<PartOf>;
    readonly movements: ReadonlyArray<PartOf>;
    readonly drawn: (p: Placed) => boolean;
  },
): Result.Result<FilmClock, PartError> =>
  Result.gen(function* () {
    const beats = placed.map((p) => clockBeat(p, parts.drawn(p)));
    return {
      fps,
      beats,
      acts: yield* partsOn(parts.acts, placed),
      movements: yield* partsOn(parts.movements, placed),
    };
  });

export const versionsOf = (
  ledger: Option.Option<{ readonly versions: ReadonlyArray<{ readonly title: string }> }>,
  folders: ReadonlyArray<number>,
  film: string,
): ReadonlyArray<FilmVersion> =>
  Option.match(ledger, {
    onNone: (): ReadonlyArray<FilmVersion> => [{ n: 1, title: film, open: true, files: 'film' }],
    onSome: ({ versions }) => {
      const numbers = versions.map((_, i) => i + 1);
      const registered = Arr.last(numbers.filter((n) => !folders.includes(n)));
      const filesOf = (n: number): VersionFiles => {
        if (folders.includes(n)) return 'folder';
        if (Option.contains(registered, n)) return 'film';
        return 'none';
      };
      return versions.map((v, i): FilmVersion => ({
        n: i + 1,
        title: v.title,
        open: i + 1 === versions.length,
        files: filesOf(i + 1),
      }));
    },
  });

export const pickVersion = (
  film: string,
  versions: ReadonlyArray<FilmVersion>,
  asked: Option.Option<number>,
): Result.Result<FilmVersion, FilmVersionUnknown | FilmVersionUnkept> => {
  const open = Arr.findFirst(versions, (v) => v.open);
  const found = Option.match(asked, {
    onNone: () => open,
    onSome: (n) => Arr.findFirst(versions, (v) => v.n === n),
  });
  return Result.flatMap(
    Result.fromOption(found, () =>
      FilmVersionUnknown.make({
        film,
        version: Option.getOrElse(asked, () => 0),
        versions: versions.map((v) => v.n),
      }),
    ),
    (version) =>
      Bool.match(version.files === 'none', {
        onTrue: () =>
          Result.fail(
            FilmVersionUnkept.make({
              film,
              version: version.n,
              kept: versions.filter((v) => v.files !== 'none').map((v) => v.n),
            }),
          ),
        onFalse: () => Result.succeed(version),
      }),
  );
};

const STAGES: ReadonlyArray<Stage> = Stage.literals;

interface TimelineSources {
  readonly film: string;
  readonly ledger: Option.Option<ProductionFile>;
  readonly version: FilmVersion;
  readonly versions: ReadonlyArray<FilmVersion>;
  readonly clock: FilmClock;
  readonly board: BoardFile;
  readonly openBoard: BoardFile;
  readonly catalogue: Catalogue;
  readonly notes: NotesFile;
  readonly asks: ReadonlyArray<AskRecord>;
}

const STARTS: Readonly<Record<Stage, string>> = {
  script: 'Script starts from the series draft the owner keeps',
  concept: 'Concept starts from the kept script',
  board: 'Board starts from the kept concept frames',
  voice: 'Voice is staged once the Board holds',
  animatic: 'Animatic plays once the Board and the voice hold',
  scenes: 'Scenes are drawn from the approved Board',
  sound: 'Sound follows the scenes',
  render: 'Render comes once the scenes are approved',
  shorts: 'Shorts are cut from the approved render',
};

const STARTS_WITHOUT: Readonly<Partial<Record<Stage, string>>> = {
  board: 'Board starts from kept concept frames, and none is kept yet',
};

const CONCEPT_GAP =
  'no decision on the production keeps a concept frame yet (the frames keep no record of their own)';

const clockOfBeat = (beat: ClockBeat): ClipClock =>
  Bool.match(beat.voice === 'estimated', {
    onTrue: (): ClipClock => 'estimated',
    onFalse: (): ClipClock => 'measured',
  });

const end = (beat: ClockBeat) => beat.start + beat.dur;

const scriptLane = (clock: FilmClock, kept: boolean): ReadonlyArray<ScriptClip> =>
  clock.beats.map((b) => ({
    start: b.start,
    dur: b.dur,
    state: Bool.match(kept, { onTrue: (): ClipState => 'kept', onFalse: (): ClipState => 'made' }),
    clock: clockOfBeat(b),
    beat: b.id,
    ...Option.match(Option.fromUndefinedOr(b.speech), {
      onNone: () => ({}),
      onSome: (speech) => ({ speech }),
    }),
    marks: b.marks,
    hold: b.hold,
  }));

const isCard = (panel: Panel) => Option.isSome(Option.fromUndefinedOr(panel.text));

export const timedBeat = (beat: ClockBeat): TimedBeat => ({
  id: beat.id,
  start: beat.start,
  end: end(beat),
  markAt: (name) =>
    Option.map(
      Arr.findFirst(beat.marks, (m) => m.name === name),
      (m) => m.at,
    ),
});

const cardWordsOf = (
  beat: ClockBeat,
  at: string,
  text: PanelText,
): Option.Option<ReadonlyArray<{ readonly text: string; readonly payoff: boolean }>> => {
  if (text._tag !== 'Card') return Option.none();
  const marks = new Map(beat.marks.map((m) => [m.name, m.at]));
  if (at === PANEL_START && !marks.has(PANEL_START))
    marks.set(PANEL_START, Number.NEGATIVE_INFINITY);
  return Result.match(
    cardSaid(beat.id, beat.words ?? [], marks, {
      from: at,
      payoff: text.payoff,
      ...Option.match(Option.fromUndefinedOr(text.to), {
        onNone: () => ({}),
        onSome: (to) => ({ to }),
      }),
    }),
    {
      onSuccess: ({ said, payoff }) =>
        Option.some(said.map((w, i) => ({ text: w.text, payoff: i === payoff }))),
      onFailure: () => Option.none(),
    },
  );
};

const boardLane = (clock: FilmClock, board: BoardFile): ReadonlyArray<BoardClip> => {
  const boarded = shotsOf(clock.beats.map(timedBeat), board).flatMap((shot) =>
    Shot.$match(shot, { Boarded: (b) => [b], Unboarded: () => [] }),
  );
  return clock.beats.flatMap((beat) => {
    const approved = approvalOf(board, beat.id) === 'approved';
    const shots = boarded.filter((s) => s.beat === beat.id);
    return shots.map(({ panel, at, from }, i): BoardClip => {
      const until = Option.getOrElse(
        Option.map(Arr.get(shots, i + 1), (next) => next.from),
        () => end(beat),
      );
      const card = isCard(panel);
      const kept = card || Option.isSome(Option.fromUndefinedOr(panel.kept));
      return {
        start: from,
        dur: Math.max(0, until - from),
        state: Bool.match(approved, {
          onTrue: (): ClipState => 'approved',
          onFalse: () =>
            Bool.match(kept, { onTrue: (): ClipState => 'kept', onFalse: (): ClipState => 'made' }),
        }),
        clock: clockOfBeat(beat),
        panel: panel.id,
        beat: beat.id,
        mark: panel.at,
        markAt: at,
        ...Option.match(
          Option.filter(shownTry(panel), () => !card),
          {
            onNone: () => ({}),
            onSome: (t) => ({ try: t.n, file: t.file }),
          },
        ),
        card,
        ...Option.match(Option.fromUndefinedOr(panel.text), {
          onNone: () => ({}),
          onSome: (text) => ({
            text,
            ...Option.match(cardWordsOf(beat, panel.at, text), {
              onNone: () => ({}),
              onSome: (words) => ({ words }),
            }),
          }),
        }),
      };
    });
  });
};

const voiceLane = (clock: FilmClock): ReadonlyArray<VoiceClip> =>
  clock.beats.flatMap((b) =>
    Option.toArray(
      Option.flatMap(Option.fromUndefinedOr(b.speech), (speech) =>
        Match.value(b.voice).pipe(
          Match.when(
            (v) => v === 'staging' || v === 'owner',
            (source): Option.Option<VoiceClip> =>
              Option.some({
                start: speech.start,
                dur: speech.end - speech.start,
                state: Bool.match(source === 'owner', {
                  onTrue: (): ClipState => 'kept',
                  onFalse: (): ClipState => 'made',
                }),
                clock: 'measured',
                beat: b.id,
                source: Bool.match(source === 'owner', {
                  onTrue: (): VoiceClip['source'] => 'owner',
                  onFalse: (): VoiceClip['source'] => 'staging',
                }),
              }),
          ),
          Match.orElse(() => Option.none()),
        ),
      ),
    ),
  );

const sceneApproved = (catalogue: Catalogue, beat: string): boolean =>
  Option.exists(
    renderIn(catalogue, sceneSlot(beat, MAIN_VARIANT)),
    (render) => approvalState(catalogue, subjectOf(render)) === 'approved',
  );

const scenesLane = (clock: FilmClock, catalogue: Catalogue): ReadonlyArray<SceneClip> =>
  clock.beats
    .filter((b) => b.drawn)
    .map((b) => ({
      start: b.start,
      dur: b.dur,
      state: Bool.match(sceneApproved(catalogue, b.id), {
        onTrue: (): ClipState => 'approved',
        onFalse: (): ClipState => 'made',
      }),
      clock: clockOfBeat(b),
      beat: b.id,
    }));

const estimatedOver = (clock: FilmClock, start: number, until: number): ClipClock =>
  Bool.match(
    clock.beats.some((b) => b.start < until && end(b) > start && b.voice === 'estimated'),
    { onTrue: (): ClipClock => 'estimated', onFalse: (): ClipClock => 'measured' },
  );

const soundLane = (clock: FilmClock): ReadonlyArray<SoundClip> =>
  clock.movements.map((m) => ({
    start: m.start,
    dur: m.end - m.start,
    state: 'made',
    clock: estimatedOver(clock, m.start, m.end),
    movement: m.name,
    from: m.from,
  }));

const spanOf = (
  clock: FilmClock,
  address: Address,
  span: Option.Option<{ readonly from: number; readonly to: number }>,
  duration: number,
): Option.Option<{ readonly from: number; readonly to: number }> =>
  Option.orElse(span, () =>
    Match.valueTags(address, {
      Film: () => Option.some({ from: 0, to: duration }),
      Act: ({ act }) =>
        Option.map(
          Arr.findFirst(clock.acts, (a) => a.name === act),
          (a) => ({ from: a.start, to: a.end }),
        ),
      Scenes: ({ ids }) => {
        const beats = clock.beats.filter((b) => ids.includes(b.id));
        return Option.map(Option.all([Arr.head(beats), Arr.last(beats)]), ([first, last]) => ({
          from: first.start,
          to: end(last),
        }));
      },
      Short: () => Option.none(),
    }),
  );

const renderApproved = (catalogue: Catalogue, render: Catalogue['renders'][number]) =>
  approvalState(catalogue, subjectOf(render)) === 'approved';

const renderLane = (
  clock: FilmClock,
  catalogue: Catalogue,
  duration: number,
): ReadonlyArray<RenderClip> =>
  Arr.sort(
    catalogue.renders
      .filter((r) => r.kind === 'video' && r.address._tag !== 'Short')
      .flatMap((r) =>
        Option.toArray(
          Option.map(spanOf(clock, r.address, r.span, duration), (span): RenderClip => ({
            start: span.from,
            dur: Math.max(0, span.to - span.from),
            state: Bool.match(renderApproved(catalogue, r), {
              onTrue: (): ClipState => 'approved',
              onFalse: (): ClipState => 'made',
            }),
            clock: 'measured',
            address: addressKey(r.address),
            variant: r.variant,
            kind: r.kind,
          })),
        ),
      ),
    Order.mapInput(Order.Number, (c: RenderClip) => c.start),
  );

const NO_RENDERS: Catalogue = { film: '', renders: [], approvals: [], comments: [] };

const catalogueOf = (sources: TimelineSources): Catalogue =>
  Bool.match(sources.version.files === 'film', {
    onTrue: () => sources.catalogue,
    onFalse: () => NO_RENDERS,
  });

const laterLanes = (sources: TimelineSources, duration: number): ReadonlyArray<Lane> => {
  const { clock } = sources;
  const catalogue = catalogueOf(sources);
  const lanes: ReadonlyArray<Lane> = [
    { track: 'board', clips: boardLane(clock, sources.board) },
    { track: 'voice', clips: voiceLane(clock) },
    { track: 'scenes', clips: scenesLane(clock, catalogue) },
    { track: 'sound', clips: soundLane(clock) },
    { track: 'render', clips: renderLane(clock, catalogue, duration) },
  ];
  return lanes.filter((lane) => lane.clips.length > 0);
};

const keptBy = (ask: AskRecord): Option.Option<'script' | 'concept'> => {
  const materials = materialsIn(ask.ask);
  if (materials.some(({ block }) => block.kind === 'script')) return Option.some('script');
  const pictures = Record.values(ask.ask.steps)
    .flatMap(blocksOf)
    .some(
      (b) =>
        b.kind === 'image' &&
        Option.isSome(Option.fromUndefinedOr(b.image.src)) &&
        Option.isNone(Option.fromUndefinedOr(b.image.board)),
    );
  return Option.liftPredicate('concept' as const, () => materials.length === 0 && pictures);
};

const keptIn = (sources: TimelineSources): ReadonlySet<Stage> =>
  new Set(
    Option.match(sources.ledger, {
      onNone: () => [],
      onSome: (file) =>
        decisionsIn(file, sources.version.n).flatMap((d) =>
          Option.toArray(
            Option.flatMap(
              Option.flatMap(d.ask, (id) => Arr.findFirst(sources.asks, (a) => a.id === id)),
              keptBy,
            ),
          ),
        ),
    }),
  );

const reachedOf = (
  sources: TimelineSources,
  lanes: ReadonlyArray<Lane>,
  kept: ReadonlySet<Stage>,
): Readonly<Record<Stage, boolean>> => {
  const has = (track: Track) => lanes.some((l) => l.track === track);
  return {
    script: Arr.isReadonlyArrayNonEmpty(sources.clock.beats),
    concept: kept.has('concept'),
    board: has('board'),
    voice: has('voice'),
    animatic: has('board') && has('voice'),
    scenes: has('scenes'),
    sound: has('sound'),
    render: has('render'),
    shorts: catalogueOf(sources).renders.some((r) => r.address._tag === 'Short'),
  };
};

const flowOf = (reached: Readonly<Record<Stage, boolean>>): ReadonlyArray<FlowStage> =>
  STAGES.map((stage): FlowStage => {
    if (reached[stage]) return { state: 'reached', stage };
    if (stage === 'concept') return { state: 'gap', stage, why: CONCEPT_GAP };
    return { state: 'ahead', stage, starts: STARTS[stage] };
  });

const doneOf = (
  sources: TimelineSources,
  reached: Readonly<Record<Stage, boolean>>,
  kept: ReadonlySet<Stage>,
): Readonly<Record<Stage, boolean>> => {
  const { clock, board } = sources;
  const catalogue = catalogueOf(sources);
  const later = (stage: Stage) => STAGES.slice(STAGES.indexOf(stage) + 1).some((s) => reached[s]);
  const beats = clock.beats;
  const approvedRender = (tag: 'Film' | 'Short') =>
    catalogue.renders.some((r) => r.address._tag === tag && renderApproved(catalogue, r));
  return {
    script: kept.has('script') || later('script'),
    concept: kept.has('concept') || later('concept'),
    board:
      reached.board &&
      Arr.isReadonlyArrayNonEmpty(beats) &&
      beats.every((b) => approvalOf(board, b.id) === 'approved'),
    voice:
      reached.voice &&
      beats.every((b) => Option.isNone(Option.fromUndefinedOr(b.speech)) || b.voice === 'owner'),
    animatic: later('animatic'),
    scenes: reached.scenes && beats.every((b) => b.drawn && sceneApproved(catalogue, b.id)),
    sound: later('sound'),
    render: approvedRender('Film'),
    shorts: approvedRender('Short'),
  };
};

const stageOf = (done: Readonly<Record<Stage, boolean>>): Stage =>
  Option.getOrElse(
    Arr.findFirst(STAGES, (s) => !done[s]),
    (): Stage => 'shorts',
  );

const nextOf = (flow: ReadonlyArray<FlowStage>): Option.Option<NextRow> => {
  const ahead = flow.flatMap((f) =>
    FlowStage.match(f, { reached: () => [], gap: () => [], ahead: (a) => [a] }),
  );
  return Option.map(Arr.head(ahead), (first) => {
    const gap = Option.flatMap(
      Arr.get(flow, STAGES.indexOf(first.stage) - 1),
      FlowStage.match({
        reached: () => Option.none(),
        ahead: () => Option.none(),
        gap: (g) => Option.some(g),
      }),
    );
    return {
      stage: first.stage,
      starts: Option.getOrElse(
        Option.flatMap(gap, () => Option.fromUndefinedOr(STARTS_WITHOUT[first.stage])),
        () => first.starts,
      ),
      ...Option.match(gap, {
        onNone: () => ({}),
        onSome: (g) => ({ gap: { stage: g.stage, why: g.why } }),
      }),
      later: ahead.slice(1).map((f) => f.stage),
    };
  });
};

const asksAbout = (sources: TimelineSources): ReadonlyArray<AskRecord> =>
  sources.asks.filter(
    (a) =>
      a.film === sources.film ||
      Option.exists(sources.ledger, (file) => a.production === file.production),
  );

const madeAt = (ask: AskRecord): Option.Option<number> =>
  Option.map(DateTime.make(ask.created), (t) => t.epochMilliseconds);

const waitingAsks = (sources: TimelineSources): ReadonlyArray<AskRecord> =>
  asksAbout(sources).filter(
    (ask) =>
      askStatus(ask.state) === 'asking' &&
      !Option.exists(
        Option.all({
          file: sources.ledger,
          set: Option.fromUndefinedOr(ask.set),
          since: madeAt(ask),
        }),
        ({ file, set, since }) =>
          decidedSince(file.said, set, Option.fromUndefinedOr(ask.point), since),
      ),
  );

const askBeat = (film: string, ask: AskRecord): Option.Option<string> =>
  Arr.findFirst(materialsIn(ask.ask), ({ block }): Option.Option<string> =>
    Match.value(block).pipe(
      Match.discriminators('kind')({
        script: (s) =>
          Option.flatMap(
            Option.liftPredicate(s, (b) => b.film === film),
            (b) => Option.flatMap(Option.fromUndefinedOr(b.beats), Arr.head),
          ),
        board: (b) =>
          Option.flatMap(
            Option.liftPredicate(b, (on) => on.film === film),
            (on) =>
              Option.flatMap(Option.fromUndefinedOr(on.panels), (panels) =>
                Option.flatMap(Arr.head(panels), (id) => Arr.head(id.split('.'))),
              ),
          ),
        audio: (a) =>
          Option.map(
            Option.liftPredicate(a, (on) => on.film === film),
            (on) => on.beat,
          ),
      }),
      Match.orElse(() => Option.none<string>()),
    ),
  );

const markersOf = (
  sources: TimelineSources,
  asks: ReadonlyArray<AskRecord>,
): ReadonlyArray<Marker> => {
  const { clock, film } = sources;
  const startOf = (beat: string) =>
    Option.map(
      Arr.findFirst(clock.beats, (b) => b.id === beat),
      (b) => b.start,
    );
  const asked = asks.map((ask): Marker => ({
    kind: 'ask',
    id: ask.id,
    title: ask.title,
    at: Option.getOrElse(Option.flatMap(askBeat(film, ask), startOf), () => 0),
    href: pageHref.ask(ask.id),
  }));
  const placed = clock.beats.map((b) => ({ spec: { id: b.id }, start: b.start, dur: b.dur }));
  const notes = Bool.match(sources.version.files === 'film', {
    onFalse: (): ReadonlyArray<Marker> => [],
    onTrue: () =>
      unresolved(sources.notes).map((note): Marker => ({
        kind: 'note',
        id: note.id,
        text: gist(note.text),
        beat: note.scene,
        at: noteT(placed, clock.fps, note),
        status: Bool.match(note.status === 'replied', {
          onTrue: () => 'replied' as const,
          onFalse: () => 'open' as const,
        }),
        href: pageHref.home(),
      })),
  });
  return Arr.sort(
    [...asked, ...notes],
    Order.mapInput(Order.Number, (m: Marker) => m.at),
  );
};

const beatsToApprove = (board: BoardFile): ReadonlyArray<string> =>
  Arr.dedupe(board.panels.map((p) => p.beat)).filter(
    (beat) =>
      Result.isSuccess(approveBeat(board, beat, '')) && approvalOf(board, beat) !== 'approved',
  );

const waitingOf = (
  sources: TimelineSources,
  asks: ReadonlyArray<AskRecord>,
): ReadonlyArray<Waiting> => [
  ...asks.map((ask): Waiting => ({
    kind: 'ask',
    id: ask.id,
    title: ask.title,
    href: pageHref.ask(ask.id),
  })),
  ...sources.notes.notes
    .filter((n) => n.status === 'replied')
    .map((n): Waiting => ({ kind: 'note', id: n.id, text: gist(n.text), href: pageHref.home() })),
  ...beatsToApprove(sources.openBoard).map((beat): Waiting => ({
    kind: 'approve',
    beat,
    href: pageHref.home(),
  })),
];

export const timelineOf = (sources: TimelineSources): FilmTimeline => {
  const duration = Option.getOrElse(Option.map(Arr.last(sources.clock.beats), end), () => 0);
  const kept = keptIn(sources);
  const later = laterLanes(sources, duration);
  const reached = reachedOf(sources, later, kept);
  const done = doneOf(sources, reached, kept);
  const lanes = [
    { track: 'script' as const, clips: scriptLane(sources.clock, done.script) },
    ...later,
  ].filter((lane) => lane.clips.length > 0);
  const flow = flowOf(reached);
  const asks = waitingAsks(sources);
  const waits = waitingOf(sources, asks);
  return {
    film: sources.film,
    ...Option.match(sources.ledger, {
      onNone: () => ({}),
      onSome: (file) => ({ production: file.production }),
    }),
    version: sources.version,
    versions: sources.versions,
    duration,
    bands: sources.clock.acts,
    lanes,
    flow,
    ...Option.match(nextOf(flow), { onNone: () => ({}), onSome: (next) => ({ next }) }),
    markers: markersOf(sources, asks),
    header: {
      stage: stageOf(done),
      ...Option.match(Arr.match(waits, { onEmpty: Option.none, onNonEmpty: Option.some }), {
        onNone: () => ({}),
        onSome: (items) => ({ waits: { count: items.length, items } }),
      }),
    },
  };
};

export const onlyTracks = (
  timeline: FilmTimeline,
  tracks: Option.Option<ReadonlyArray<Track>>,
): FilmTimeline =>
  Option.match(tracks, {
    onNone: () => timeline,
    onSome: (only) => ({
      ...timeline,
      lanes: timeline.lanes.filter((l) => only.includes(l.track)),
    }),
  });
