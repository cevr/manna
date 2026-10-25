// The ask page's root: its one runtime over the lab's client, the place its
// URL names (`place.ts`), and the reads its sections share, each made once
// for the page's life: the page of asks shown, the review's index (the
// videos and documents a section shows), a film's script and Board, a series
// draft, a video's length and phone copy, a document's text. The page reads
// them through `useAskRoot`; the reads the server's render makes are sent
// with the page and adopted by the browser (`served`).

import { RegistryProvider, useAtomSet, useAtomValue, useRegistry } from '@manna/atom-solid';
import * as UrlAtom from '@manna/url-state/atom';
import { Array as Arr, Effect, Equal, Exit, Function, Layer, Match, Option, Schema } from 'effect';
import type { HttpClient } from 'effect/http';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, createSignal, useContext } from 'solid-js';
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
import type { Hub } from '../../command/hub.ts';
import { type LabClient, type LabFailure, served } from '../api.ts';
import { PHONE } from '../viewport.ts';
import { AskApi, askApiLayer } from './api.ts';
import type { Quality } from './format.ts';
import { copyAwaited } from './phone.ts';
import { type AskPlace, askPlaceOf } from './place.ts';

type Loaded<A> = Atom.Atom<AsyncResult.AsyncResult<A, LabFailure>>;

/** A file as the index names its content: its ref, and when it was written. */
type Written = Pick<ReviewFile, 'ref' | 'mtime'>;

/**
 * The page of asks shown, as its header names it: its id (its first ask's),
 * its asks' ids, its title, and the film its asks are of, if any.
 */
export interface AskShown {
  readonly page: string;
  readonly asks: ReadonlyArray<string>;
  readonly title: string;
  readonly film: Option.Option<string>;
}

/** A page of asks as the header names it: one ask by its title, more by how many and who asked. */
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
  /** The place the URL names: none on a path that is no ask's. */
  readonly place: Accessor<Option.Option<AskPlace>>;
  /** The page of asks the place is on (its read, `askPage`): none until it is read. */
  readonly ask: Accessor<Option.Option<AskShown>>;
  /** Every folder with something to review, as the newest read answered it: the videos and documents a section shows. */
  readonly index: Accessor<AsyncResult.AsyncResult<ReviewIndex, LabFailure>>;
  /** The app's series and their drafts: a draft's title. */
  readonly series: Accessor<AsyncResult.AsyncResult<SeriesList, LabFailure>>;
  /** The copy a video plays: its phone copy, or the original. */
  readonly quality: Accessor<Quality>;
}

interface AskRootActions {
  /** Keep the copy videos play in this browser. */
  readonly quality: (quality: Quality) => void;
  /** Read the index again (a phone copy made or failed): the newest read answers. */
  readonly indexChanged: () => void;
}

interface AskRootMeta {
  /** A page of asks by an ask's id. */
  readonly askPage: (id: string) => Loaded<AsksPage>;
  /** A film's storyboard as its record stands. */
  readonly board: (film: string) => Loaded<BoardFile>;
  /** A film's script: the page's alone, never waited on by the server's render. */
  readonly script: (film: string) => Loaded<ScriptBeats>;
  /** A series draft as its Markdown reads now. */
  readonly draft: (series: string, draft: string) => Loaded<DraftRead>;
  /** A doc's text, keyed by what names its content. */
  readonly text: (file: Written) => Loaded<string>;
  /** A video's length and frames a second, read by the browser alone (the server's render shows none). */
  readonly timedHere: (video: Written) => Loaded<ReviewDuration>;
  /** A video's phone copy, asked after while a section waits on it. */
  readonly phoneCopy: (ref: string) => Atom.Atom<AsyncResult.AsyncResult<PhoneCopy, unknown>>;
  readonly runtime: Atom.AtomRuntime<AskApi | BrowserServices>;
  readonly host: Host;
  readonly hub: Hub;
}

export interface AskRootValue {
  readonly state: AskRootState;
  readonly actions: AskRootActions;
  readonly meta: AskRootMeta;
}

/** The ask page's root, given by `AskRoot`. */
export const AskRootContext = createContext<AskRootValue>();

/** The ask page's root: its reads, its place, its host and commands. */
export const useAskRoot = (): AskRootValue => useContext(AskRootContext);

const keptQuality = keptText(ViewerStore, 'film-review.quality');

/** The copy the page plays: the kept one, else 720p on a phone's width (`PHONE`). */
const qualityOf = (stored: Option.Option<string>, narrow: () => boolean): Quality =>
  Option.getOrElse(
    Option.filter(stored, (q): q is Quality => q === 'phone' || q === 'full'),
    (): Quality => {
      if (narrow()) return 'phone';
      return 'full';
    },
  );

/**
 * The copy a page rendered on the server plays, and the client while it
 * hydrates (a viewer's kept copy and their screen are their browser's): the
 * phone's, as the lab's pages are designed for first.
 */
const SERVED_QUALITY: Quality = 'phone';

/** The ask page's root around `children`: its runtime, its place and its reads. */
export const AskRoot = (
  props: ParentProps<{
    readonly host: Host;
    readonly hub: Hub;
    /**
     * The page's one client of the lab's API (`LabClient.layer` in the
     * browser, `LabClient.layerRendering` for a render on the server).
     */
    readonly client: Layer.Layer<LabClient | HttpClient.HttpClient>;
  }>,
) => {
  const runtime = Atom.runtime(
    Layer.mergeAll(askApiLayer, hostLayer(props.host)).pipe(Layer.provide(props.client)),
  );
  // A page of asks is the page's alone: the server's render never waits on it.
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
  // A first read takes the server's cache; a read again asks it to walk its roots again.
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
    // The index as the newest read answered it: until a read again has, the first read's.
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
    // The viewer's copy once the page is the client's; the phone's until then.
    const quality = createMemo(() => qualityOf(kept(), narrow), {
      ssrSource: 'client',
      loadingValue: SERVED_QUALITY,
    });
    const value: AskRootValue = {
      state: { place, ask, index, series, quality },
      actions: { quality: keep, indexChanged },
      meta: {
        askPage: askPageOf,
        board: boardOf,
        script: scriptOf,
        draft: (series, draft) => draftOf(`${series}/${draft}`),
        text: (file) => textOf({ ref: file.ref, mtime: file.mtime }),
        timedHere: (file) => timedHereOf({ ref: file.ref, mtime: file.mtime }),
        phoneCopy: phoneOf,
        runtime,
        host: props.host,
        hub: props.hub,
      },
    };
    return <AskRootContext value={value}>{inner.children}</AskRootContext>;
  };

  // The registry's URL atoms read and write through the host's own `UrlState`
  // (its layer carries it), so they and the page's effects share one address bar.
  return (
    <RegistryProvider initialValues={[[UrlAtom.layer, hostLayer(props.host)]]}>
      <Inner>{props.children}</Inner>
    </RegistryProvider>
  );
};
