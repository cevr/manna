import { RegistryProvider, useAtomSet, useAtomValue, useRegistry } from '@manna/atom-solid';
import * as UrlAtom from '@manna/url-state/atom';
import { Array as Arr, Effect, Equal, Exit, Function, Layer, Match, Option, Schema } from 'effect';
import type { HttpClient } from 'effect/http';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, createSignal, onCleanup, useContext } from 'solid-js';
import type { AsksPage } from '../../core/ask.ts';
import { newestAsked } from '../../core/asked.ts';
import type { BoardFile } from '../../core/board.ts';
import { DraftRead, type ScriptBeats, SeriesList } from '../../core/api.ts';
import { ReviewDuration, type ReviewFile, ReviewIndex } from '../../core/review.ts';
import type { PhoneCopy } from '../../core/served.ts';
import { type BrowserServices, type Host, hostLayer } from '../../browser/host.ts';
import { keptText } from '../../browser/storage.ts';
import { ViewerStore } from '../../browser/storage-browser.ts';
import { Viewport } from '../../browser/viewport.ts';
import { type Command, quietly, said } from '../../command/command.ts';
import type { Hub } from '../../command/hub.ts';
import { type LabClient, type LabFailure, served } from '../api.ts';
import { PHONE } from '../viewport.ts';
import { AskApi, askApiLayer } from './api.ts';
import type { Quality } from './format.ts';
import { copyAwaited } from './phone.ts';
import { type AskPlace, askPlaceOf } from './place.ts';

type Loaded<A> = Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>;

type Written = Pick<ReviewFile, 'ref' | 'mtime'>;

interface AskShown {
  readonly page: string;
  readonly asks: ReadonlyArray<string>;
  readonly title: string;
  readonly film: Option.Option<string>;
}

const askShown = (read: AsksPage): AskShown => {
  const asks = read.asks.map((a) => a.id);
  return {
    page: read.page,
    asks,
    title: Arr.match(read.asks, {
      onEmpty: () => 'asks',
      onNonEmpty: ([first, ...more]) =>
        Arr.match(more, {
          onEmpty: () => first.title,
          onNonEmpty: () => `${asks.length} asks from ${first.by}`,
        }),
    }),
    film: Arr.findFirst(read.asks, (a) => Option.fromUndefinedOr(a.film)),
  };
};

interface AskRootState {
  readonly place: Accessor<Option.Option<AskPlace>>;
  readonly ask: Accessor<Option.Option<AskShown>>;
  readonly index: Accessor<AsyncResult.AsyncResult<ReviewIndex, LabFailure>>;
  readonly series: Accessor<AsyncResult.AsyncResult<SeriesList, LabFailure>>;
  readonly quality: Accessor<Quality>;
}

interface AskRootActions {
  readonly quality: (quality: Quality) => void;
  readonly indexChanged: () => void;
  readonly refresh: () => void;
}

interface AskRootMeta {
  readonly askPage: (id: string) => Loaded<AsksPage>;
  readonly board: (film: string) => Loaded<BoardFile>;
  readonly script: (film: string) => Loaded<ScriptBeats>;
  readonly draft: (series: string, draft: string) => Loaded<DraftRead>;
  readonly text: (file: Written) => Loaded<string>;
  readonly timedHere: (video: Written) => Loaded<ReviewDuration>;
  readonly phoneCopy: (ref: string) => Atom.Atom<AsyncResult.AsyncResult<PhoneCopy, unknown>>;
  readonly runtime: Atom.AtomRuntime<AskApi | BrowserServices>;
  readonly host: Host;
  readonly hub: Hub;
}

interface AskRootValue {
  readonly state: AskRootState;
  readonly actions: AskRootActions;
  readonly meta: AskRootMeta;
}

const AskRootContext = createContext<AskRootValue>();

export const useAskRoot = (): AskRootValue => useContext(AskRootContext);

const keptQuality = keptText(ViewerStore, 'film-review.quality');

const qualityOf = (stored: Option.Option<string>, narrow: () => boolean): Quality =>
  Option.getOrElse(
    Option.filter(stored, (q): q is Quality => q === 'phone' || q === 'full'),
    (): Quality => {
      if (narrow()) return 'phone';
      return 'full';
    },
  );

const SERVED_QUALITY: Quality = 'phone';

const OTHER_QUALITY: Readonly<Record<Quality, Quality>> = { phone: 'full', full: 'phone' };
const QUALITY_LABEL: Readonly<Record<Quality, string>> = {
  phone: 'Play the originals',
  full: 'Play the proxies',
};
const QUALITY_SAID: Readonly<Record<Quality, string>> = {
  phone: 'Playing the proxies (720p copies)',
  full: 'Playing the originals',
};

const pageCommands = (root: AskRootValue): ReadonlyArray<Command> => [
  {
    id: 'ask.refresh',
    label: 'Refresh',
    group: 'View',
    about: ['Page'],
    touch: 'long-press the page, then Refresh',
    when: () => true,
    run: quietly(() => root.actions.refresh()),
  },
  {
    id: 'ask.quality',
    label: 'Playback: Proxy or Original',
    labelIn: () => QUALITY_LABEL[root.state.quality()],
    group: 'View',
    about: ['Page'],
    touch: 'long-press the page, then Play the originals',
    when: () => true,
    run: () =>
      Effect.sync(() => {
        const next = OTHER_QUALITY[root.state.quality()];
        root.actions.quality(next);
        return said(QUALITY_SAID[next]);
      }),
  },
];

export const AskRoot = (
  props: ParentProps<{
    readonly host: Host;
    readonly hub: Hub;
    readonly client: Layer.Layer<LabClient | HttpClient.HttpClient>;
  }>,
) => {
  const runtime = Atom.runtime(
    Layer.mergeAll(askApiLayer, hostLayer(props.host)).pipe(Layer.provide(props.client)),
  );
  const askPageOf = Atom.family((id: string) =>
    runtime
      .atom(AskApi.use((api) => api.askPage(id)))
      .pipe(Atom.withServerValue(() => AsyncResult.initial<AsksPage, LabFailure>())),
  );
  const noAsk = Atom.make(AsyncResult.initial<AsksPage, LabFailure>());
  const phoneOf = Atom.family((ref: string) =>
    runtime
      .atom(copyAwaited(AskApi.use((api) => api.phoneCopy(ref))))
      .pipe(Atom.withServerValue(() => AsyncResult.initial<PhoneCopy, never>())),
  );
  const firstIndexAtom = runtime
    .atom(AskApi.use((api) => api.index(false)))
    .pipe(served('ask.index', ReviewIndex));
  const againAtom = runtime.fn(() => AskApi.use((api) => api.index(true)));
  const timingOf = Atom.family((file: Written) =>
    runtime
      .atom(AskApi.use((api) => api.duration(file.ref)))
      .pipe(served(`ask.duration:${file.ref}@${file.mtime}`, ReviewDuration)),
  );
  const timedHereOf = Atom.family((file: Written) =>
    Atom.make((get) => get(timingOf(file))).pipe(
      Atom.withServerValue(() => AsyncResult.initial<ReviewDuration, LabFailure>()),
    ),
  );
  const textOf = Atom.family((file: Written) =>
    runtime
      .atom(AskApi.use((api) => api.text(file.ref)))
      .pipe(served(`ask.text:${file.ref}@${file.mtime}`, Schema.String)),
  );
  const boardOf = Atom.family((film: string) =>
    runtime
      .atom(AskApi.use((api) => api.board(film)))
      .pipe(Atom.withServerValue(() => AsyncResult.initial<BoardFile, LabFailure>())),
  );
  const scriptOf = Atom.family((film: string) =>
    runtime
      .atom(AskApi.use((api) => api.script(film)))
      .pipe(Atom.withServerValue(() => AsyncResult.initial<ScriptBeats, LabFailure>())),
  );
  const seriesAtom = runtime
    .atom(AskApi.use((api) => api.series))
    .pipe(served('ask.series', SeriesList));
  const draftOf = Atom.family((key: string) => {
    const [series = '', draft = ''] = key.split('/');
    return runtime
      .atom(AskApi.use((api) => api.draft(series, draft)))
      .pipe(served(`ask.draft:${key}`, DraftRead));
  });
  const Inner = (inner: ParentProps) => {
    const href = useAtomValue(() => UrlAtom.href);
    const place = createMemo(() => askPlaceOf(href()), { equals: Equal.equals });
    const askRead = useAtomValue(() =>
      Option.match(place(), {
        onNone: () => noAsk,
        onSome: (p) =>
          Match.value(p).pipe(
            Match.tagsExhaustive({
              Ask: (at) => askPageOf(at.ask),
              AskPage: (at) => askPageOf(at.page),
            }),
          ),
      }),
    );
    const ask = (): Option.Option<AskShown> => Option.map(AsyncResult.value(askRead()), askShown);
    const firstIndex = useAtomValue(() => firstIndexAtom);
    const registry = useRegistry();
    const [again, setAgain] = createSignal(Option.none<ReviewIndex>());
    const asked = newestAsked();
    const index = createMemo(() =>
      Option.match(again(), {
        onNone: firstIndex,
        onSome: (ix) => AsyncResult.success<ReviewIndex, LabFailure>(ix),
      }),
    );
    const indexChanged = () => {
      const turn = asked.ask();
      registry.set(againAtom, Function.constVoid());
      void Effect.runPromiseExit(
        AtomRegistry.getResult(registry, againAtom, { suspendOnWaiting: true }),
      ).then((exit) => {
        if (Exit.isSuccess(exit)) turn.answer(() => setAgain(Option.some(exit.value)));
      });
    };
    const series = useAtomValue(() => seriesAtom);
    const kept = useAtomValue(() => keptQuality);
    const keep = useAtomSet(() => keptQuality);
    const narrow = () => Effect.runSyncWith(props.host)(Viewport.use((v) => v.matches(PHONE)));
    const quality = createMemo(() => qualityOf(kept(), narrow), {
      ssrSource: 'client',
      loadingValue: SERVED_QUALITY,
    });
    const boardsRead = new Set<string>();
    const scriptsRead = new Set<string>();
    const draftsRead = new Set<string>();
    const value: AskRootValue = {
      state: { place, ask, index, series, quality },
      actions: {
        quality: keep,
        indexChanged,
        refresh: () => {
          registry.refresh(seriesAtom);
          for (const film of boardsRead) registry.refresh(boardOf(film));
          for (const film of scriptsRead) registry.refresh(scriptOf(film));
          for (const key of draftsRead) registry.refresh(draftOf(key));
          indexChanged();
        },
      },
      meta: {
        askPage: askPageOf,
        board: (film) => {
          boardsRead.add(film);
          return boardOf(film);
        },
        script: (film) => {
          scriptsRead.add(film);
          return scriptOf(film);
        },
        draft: (series, draft) => {
          const key = `${series}/${draft}`;
          draftsRead.add(key);
          return draftOf(key);
        },
        text: (file) => textOf({ ref: file.ref, mtime: file.mtime }),
        timedHere: (file) => timedHereOf({ ref: file.ref, mtime: file.mtime }),
        phoneCopy: phoneOf,
        runtime,
        host: props.host,
        hub: props.hub,
      },
    };
    onCleanup(props.hub.commands.register(...pageCommands(value)));
    return <AskRootContext value={value}>{inner.children}</AskRootContext>;
  };

  return (
    <RegistryProvider initialValues={[[UrlAtom.layer, hostLayer(props.host)]]}>
      <Inner>{props.children}</Inner>
    </RegistryProvider>
  );
};
