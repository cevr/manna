// The browser in memory for the tool tests (`browser.ts`): a render host whose
// pages answer the export handle's calls (`core/export-handle.ts`) and record
// each in a ledger, the marks a page reports, and the render's media. No
// Chromium.

import { Array as Arr, Effect, Exit, Layer, Option, Schema } from 'effect';
import { silence } from '../../core/audio.ts';
import { MIX_RATE } from '../../core/mix.ts';
import {
  type ExportInfo,
  type FaceMark,
  type HandMark,
  type InkMark,
  type Probed,
  type TextBox,
  type CallAnswers,
  type CallArgs,
  type ExportCall,
  ExportAnswers,
  type LumaArea,
} from '../../core/export-handle.ts';
import { type SceneTimes, type StillView } from '../../core/easel.ts';
import type { FigureMark } from '../../core/match.ts';
import { Browser, CallRefused, type Invoke, framePage } from '../browser.ts';
import {
  type Encoder,
  type EncoderChoice,
  copiesInPage,
  hasMaster,
  hasShare,
} from '../../core/encoder.ts';
import type { MediaFailed } from '../../core/refusals.ts';
import {
  type EncodeFailed,
  type EncoderMissing,
  type FrameFailed,
  type PageCrashed,
  type PageError,
} from '../errors.ts';
import { type JoinedFilm, Media } from '../media.ts';
import { PreviewServer } from '../preview-server.ts';
import { text } from '../host/testing.ts';
import { noRecording } from '../media/testing.ts';

/** How a fake page answers the export handle's calls: decoded answers, or the failure a page would give. */
type FakeHandle = {
  readonly [K in ExportCall]: (
    ...args: CallArgs[K]
  ) => Effect.Effect<
    CallAnswers[K],
    PageError | PageCrashed | FrameFailed | EncodeFailed | EncoderMissing
  >;
};

/**
 * `handle` behind the same path a tab takes (`Invoke`): each answer
 * encoded by its call's schema as the page would hand it across, a failure
 * the page itself gives kept, any other refused with its message.
 */
const fakeInvoke =
  (handle: FakeHandle): Invoke =>
  (name, args) =>
    handle[name](...args).pipe(
      Effect.flatMap((answer) =>
        Schema.encodeEffect(ExportAnswers[name])(answer).pipe(Effect.orDie),
      ),
      Effect.catchTags({
        FrameFailed: ({ reason }) => Effect.fail(CallRefused.make({ reason })),
        EncodeFailed: ({ reason }) => Effect.fail(CallRefused.make({ reason })),
        EncoderMissing: ({ reason }) => Effect.fail(CallRefused.make({ reason })),
      }),
    );

/** Everything the fake render host opened and closed, so a test can check nothing leaked. */
export interface RenderLedger {
  readonly server: { started: number; stopped: number };
  readonly browser: { launched: number; closed: number };
  readonly pages: { opened: number; closed: number };
  /** Chunks a page began to encode: each finished, or was cut off (killed). */
  readonly encoders: { spawned: number; finished: number; killed: number };
  /** The encoder each chunk was handed, in the order they began. */
  readonly encodedBy: Array<Encoder['_tag']>;
  /** The encoders each page choosing one was allowed, in order. */
  readonly encoderAsked: Array<ReadonlyArray<Encoder['_tag']>>;
  /** Every share copy made by x264 from a joined master. */
  /** Every frame drawn, by any page. */
  readonly frames: Array<number>;
  /** Look-books composed, by any page. */
  readonly lookbooks: { composed: number };
  /** The frames of every contact sheet composed. */
  readonly contacts: Array<ReadonlyArray<number>>;
  /** Every film joined. */
  readonly joins: Array<JoinedFilm>;
  /** Every video whose sound was replaced, in order. */
  readonly remuxes: Array<string>;
  /** Every file decoded, in order. */
  readonly decodes: Array<string>;
  /** The frames of every track encoded to AAC. */
  readonly aac: Array<number>;
  /** The URL of every page opened. */
  readonly urls: Array<string>;
  /** Every look's still drawn: its frame and how it was shown. */
  readonly stills: Array<{ readonly frame: number; readonly view: StillView }>;
  /** AAC encodes cut off before they ended. */
  readonly aacInterrupted: { count: number };
}

export const emptyLedger = (): RenderLedger => ({
  server: { started: 0, stopped: 0 },
  browser: { launched: 0, closed: 0 },
  pages: { opened: 0, closed: 0 },
  encoders: { spawned: 0, finished: 0, killed: 0 },
  encodedBy: [],
  encoderAsked: [],
  frames: [],
  lookbooks: { composed: 0 },
  contacts: [],
  joins: [],
  remuxes: [],
  decodes: [],
  aac: [],
  aacInterrupted: { count: 0 },
  urls: [],
  stills: [],
});

export const testExportInfo: ExportInfo = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 20,
  frames: 600,
};

/** A frame as a fake page's look pass draws it: one flat grey, and the faces it declares. */
interface FakeLook {
  readonly grey: number;
  readonly faces: ReadonlyArray<FaceMark>;
  readonly hands?: ReadonlyArray<HandMark>;
}

export interface FakeRenderHost {
  readonly info?: ExportInfo;
  /** The info the page at `url` hands out, where it is not `info` (a short's page and its film's). */
  readonly infoAt?: (url: string) => Option.Option<ExportInfo>;
  /**
   * How page number `page` (1 for the first page opened) draws frame `i`:
   * fail to break it. Every frame first yields for a millisecond, so pages and
   * encoders really run side by side.
   */
  readonly frame?: (
    i: number,
    page: number,
  ) => Effect.Effect<void, PageError | PageCrashed | FrameFailed>;
  /** What a probe of frame `i` reports (nothing by default); failing breaks the page. */
  readonly probe?: (i: number) => Effect.Effect<Probed, PageError | PageCrashed | FrameFailed>;
  /** How long the audio master measures (default: the film's length). */
  readonly master?: number;
  /** The encoders the browser has (both by default): a page chooses the first it is allowed that it has. */
  readonly encoders?: ReadonlyArray<Encoder['_tag']>;
  /** What an AAC encode does once it is recorded (nothing by default). */
  readonly aac?: Effect.Effect<void, MediaFailed>;
  /** What a join does once it is recorded (nothing by default). */
  readonly join?: (film: JoinedFilm) => Effect.Effect<void, MediaFailed>;
  /**
   * Frame `i` as the look pass sees it: the grey its `w` × `h` thumb is filled
   * with, and the faces it declares (default mid grey, no faces).
   */
  readonly looked?: (i: number) => FakeLook;
  /** The luma every sample of frame `i`'s `area` reads, as `luma` reports it (default 128). */
  readonly luma?: (i: number, area: LumaArea) => number;
  /** The scenes the page reports (`scenes`, a look's clocks; none by default). */
  readonly scenes?: ReadonlyArray<SceneTimes>;
  /** What page `page`'s `scenes` waits on before it answers (nothing by default): a page still opening. */
  readonly opening?: (page: number) => Effect.Effect<void>;
  /** The figures frame `i` declares (`figures`, a match's boxes; none by default). */
  readonly figures?: (i: number) => ReadonlyArray<FigureMark>;
  /** The bytes a still of frame `i` encodes to (`still`; the frame's one byte by default): a real PNG for a match. */
  readonly still?: (i: number, view: StillView) => Uint8Array;
  /** Whether frame `i` reads the film's own seconds (`filmTimed`; every frame by default, as a drawn film's). */
  readonly filmTimed?: (i: number) => boolean;
}

/**
 * A preview server, and a browser whose pages draw one-byte frames and encode
 * chunks of them, each recording in `ledger` when it opens and closes; and
 * media that measures the master and records every film it joins.
 */
export const fakeRenderHost = (ledger: RenderLedger, host: FakeRenderHost = {}) => {
  const info = Option.getOrElse(Option.fromNullishOr(host.info), () => testExportInfo);
  const draw = Option.getOrElse(Option.fromNullishOr(host.frame), () => () => Effect.void);
  const has = Option.getOrElse(
    Option.fromNullishOr(host.encoders),
    (): ReadonlyArray<Encoder['_tag']> => ['Hardware', 'Software'],
  );
  /** The first of `candidates` this browser has, as a page chooses; `Missing` when it has none. */
  const encoder = (candidates: ReadonlyArray<Encoder>): Effect.Effect<EncoderChoice> =>
    Effect.sync(() => {
      ledger.encoderAsked.push(candidates.map((c) => c._tag));
      return Option.getOrElse(
        Arr.findFirst(candidates, (c): boolean => has.includes(c._tag)),
        (): EncoderChoice => ({
          _tag: 'Missing',
          reason: `no ${candidates.map((c) => c._tag.toLowerCase()).join(' or ')} H.264 encoder`,
        }),
      );
    });
  const looked = Option.getOrElse(Option.fromNullishOr(host.looked), () => (): FakeLook => ({
    grey: 128,
    faces: [],
  }));
  const luma = Option.getOrElse(Option.fromNullishOr(host.luma), () => () => 128);
  const scenes = Option.getOrElse(
    Option.fromNullishOr(host.scenes),
    (): ReadonlyArray<SceneTimes> => [],
  );
  const opening = Option.getOrElse(Option.fromNullishOr(host.opening), () => () => Effect.void);
  const probe = Option.getOrElse(
    Option.fromNullishOr(host.probe),
    () => (): Effect.Effect<Probed> => Effect.succeed({ texts: [], inks: [] }),
  );
  const server = Layer.effect(
    PreviewServer,
    Effect.acquireRelease(
      Effect.sync(() => {
        ledger.server.started += 1;
        return PreviewServer.of({ url: 'http://preview.test/' });
      }),
      () => Effect.sync(() => void (ledger.server.stopped += 1)),
    ),
  );
  /** Page number `page`'s handle: frames of one byte each, every call recorded in `ledger`. */
  const handleOf = (page: number): FakeHandle => {
    const frame = (i: number) =>
      Effect.sleep('1 millis').pipe(
        Effect.andThen(draw(i, page)),
        Effect.map(() => {
          ledger.frames.push(i);
          return new Uint8Array([i % 256]);
        }),
      );
    return {
      frame,
      probe: (i) =>
        Effect.sleep('1 millis').pipe(
          Effect.andThen(probe(i)),
          Effect.tap(() => Effect.sync(() => void ledger.frames.push(i))),
        ),
      lookbook: () =>
        Effect.sync(() => {
          ledger.lookbooks.composed += 1;
          return new Uint8Array([0xff, 0xd8]);
        }),
      encoder: (_scale, _copies, candidates) => encoder(candidates),
      encode: (from, to, _scale, copies, by) =>
        Effect.acquireUseRelease(
          Effect.sync(() => {
            ledger.encoders.spawned += 1;
            ledger.encodedBy.push(by._tag);
          }),
          () =>
            Effect.forEach(
              Array.from({ length: to - from }, (_, k) => from + k),
              frame,
              { discard: true },
            ),
          (_, exit) =>
            Effect.sync(() =>
              Exit.match(exit, {
                onSuccess: () => void (ledger.encoders.finished += 1),
                onFailure: () => void (ledger.encoders.killed += 1),
              }),
            ),
        ).pipe(
          Effect.as({
            // As the page: each copy asked for that the encoder makes there.
            master: Option.filter(Option.some(text(`mp4 ${from}-${to}`)), () =>
              hasMaster(copiesInPage(copies, by)),
            ),
            share: Option.filter(Option.some(text(`share ${from}-${to}`)), () =>
              hasShare(copiesInPage(copies, by)),
            ),
            timing: { draw: to - from, page: 2 * (to - from) },
          }),
        ),
      contact: (frames) =>
        Effect.sync(() => {
          ledger.contacts.push(frames);
          return new Uint8Array([0xff, 0xd8]);
        }),
      look: (frames, w, h) =>
        Effect.forEach(frames, (i) => Effect.as(frame(i), looked(i))).pipe(
          Effect.map((drawn) => {
            const thumbs = new Uint8Array(frames.length * w * h * 4);
            drawn.forEach(({ grey }, k) => {
              thumbs.fill(grey, k * w * h * 4, (k + 1) * w * h * 4);
            });
            return {
              thumbs,
              faces: drawn.map((d) => d.faces),
              hands: drawn.map((d) => d.hands ?? []),
            };
          }),
        ),
      luma: (i, area) =>
        Effect.as(
          frame(i),
          Array.from({ length: area.cols * area.rows }, () => luma(i, area)),
        ),
      drawTimes: (frames) => Effect.forEach(frames, (i) => Effect.as(frame(i), 1)),
      scenes: () => Effect.as(opening(page), scenes),
      still: (i, view) =>
        Effect.map(frame(i), (bytes) => {
          ledger.stills.push({ frame: i, view });
          return Option.match(Option.fromUndefinedOr(host.still), {
            onNone: () => bytes,
            onSome: (still) => still(i, view),
          });
        }),
      figures: (i) =>
        Effect.as(
          frame(i),
          Option.match(Option.fromUndefinedOr(host.figures), {
            onNone: (): ReadonlyArray<FigureMark> => [],
            onSome: (figures) => figures(i),
          }),
        ),
      filmTimed: (from, to) =>
        Effect.sync(() =>
          Array.from({ length: Math.max(0, to - from) }, (_, k) =>
            Option.match(Option.fromUndefinedOr(host.filmTimed), {
              onNone: () => true,
              onSome: (timed) => timed(from + k),
            }),
          ),
        ),
    };
  };
  const browser = Layer.effect(
    Browser,
    Effect.acquireRelease(
      Effect.sync(() => {
        ledger.browser.launched += 1;
        return Browser.of({
          open: (url: string) =>
            Effect.acquireRelease(
              Effect.sync(() => {
                ledger.urls.push(url);
                // The page is its number, made here: the open it counts.
                const page = ledger.pages.opened + 1;
                ledger.pages.opened = page;
                return page;
              }),
              () => Effect.sync(() => void (ledger.pages.closed += 1)),
            ).pipe(
              Effect.map((page) =>
                framePage(
                  Option.getOrElse(
                    Option.flatMap(Option.fromNullishOr(host.infoAt), (at) => at(url)),
                    () => info,
                  ),
                  'Test film',
                  fakeInvoke(handleOf(page)),
                ),
              ),
            ),
        });
      }),
      () => Effect.sync(() => void (ledger.browser.closed += 1)),
    ),
  );
  return Layer.mergeAll(server, browser, fakeRenderMedia(ledger, host));
};

/** The render host's media alone: it measures the master and records every film it joins. */
export const fakeRenderMedia = (ledger: RenderLedger, host: FakeRenderHost = {}) => {
  const info = Option.getOrElse(Option.fromNullishOr(host.info), () => testExportInfo);
  return Layer.succeed(
    Media,
    Media.of({
      ...noRecording,
      timing: () =>
        Effect.succeed({
          seconds: Option.getOrElse(Option.fromNullishOr(host.master), () => info.duration),
          fps: Option.none(),
        }),
      decode: (file) =>
        Effect.sync(() => void ledger.decodes.push(file)).pipe(
          Effect.as(silence(MIX_RATE, MIX_RATE * info.duration, 2)),
        ),
      writeWav: () => Effect.void,
      encodeAac: (pcm) =>
        Effect.sync(() => void ledger.aac.push(pcm.frames)).pipe(
          Effect.andThen(Option.getOrElse(Option.fromNullishOr(host.aac), () => Effect.void)),
          Effect.onInterrupt(() => Effect.sync(() => void (ledger.aacInterrupted.count += 1))),
          Effect.as({ packets: [], meta: {} }),
        ),
      remux: (video) => Effect.sync(() => void ledger.remuxes.push(video)),
      join: (film) =>
        Effect.sync(() => void ledger.joins.push(film)).pipe(
          Effect.andThen(
            Option.match(Option.fromNullishOr(host.join), {
              onNone: () => Effect.void,
              onSome: (join) => join(film),
            }),
          ),
        ),
    }),
  );
};

/**
 * A probed line of text: a `w` × `h` box at (`x`, `y`), turned `rot` radians
 * about its centre, in scene `scene`.
 */
export const textBox = (
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: {
    readonly alpha?: number;
    readonly rot?: number;
    readonly scene?: string;
    readonly order?: number;
    /** The seed of the hand that wrote it: what a stroke's `marks` names. */
    readonly hand?: number;
    /** The `order` of the plate it sits on. */
    readonly on?: number;
    /** Canvas pixels per unit of the space it was drawn in (default 1). */
    readonly scale?: number;
    /** The caption line. */
    readonly caption?: true;
  } = {},
): TextBox => {
  const rot = Option.getOrElse(Option.fromNullishOr(options.rot), () => 0);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const turn = (px: number, py: number): readonly [number, number] => [
    cx + (px - cx) * Math.cos(rot) - (py - cy) * Math.sin(rot),
    cy + (px - cx) * Math.sin(rot) + (py - cy) * Math.cos(rot),
  ];
  const corners: TextBox['corners'] = [
    turn(x, y),
    turn(x + w, y),
    turn(x + w, y + h),
    turn(x, y + h),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    text,
    scene: Option.getOrElse(Option.fromNullishOr(options.scene), () => 'a'),
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    corners,
    alpha: Option.getOrElse(Option.fromNullishOr(options.alpha), () => 1),
    order: Option.getOrElse(Option.fromNullishOr(options.order), () => 0),
    ...Option.match(Option.fromNullishOr(options.hand), {
      onNone: () => ({}),
      onSome: (hand) => ({ hand }),
    }),
    ...Option.match(Option.fromNullishOr(options.on), {
      onNone: () => ({}),
      onSome: (on) => ({ on }),
    }),
    scale: Option.getOrElse(Option.fromNullishOr(options.scale), () => 1),
    ...Option.match(Option.fromNullishOr(options.caption), {
      onNone: () => ({}),
      onSome: (caption) => ({ caption }),
    }),
  };
};

/**
 * A probed mark of ink along `points`: a stroke `width` wide (a fill or a
 * plate takes the points as its outline), drawn `order`-th in the frame.
 */
export const inkMark = (
  kind: InkMark['kind'],
  points: ReadonlyArray<readonly [number, number]>,
  options: {
    readonly width?: number;
    readonly alpha?: number;
    readonly order?: number;
    /** The seeds of the hands whose text this stroke marks on purpose. */
    readonly marks?: ReadonlyArray<number>;
    /** Canvas pixels per unit of the space it was drawn in (default 1). */
    readonly scale?: number;
    /** The caption line's plate. */
    readonly caption?: true;
  } = {},
): InkMark => {
  const xs = points.map((c) => c[0]);
  const ys = points.map((c) => c[1]);
  const mark: InkMark = {
    kind,
    scene: 'a',
    points,
    width: Option.getOrElse(Option.fromNullishOr(options.width), () => 4),
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    alpha: Option.getOrElse(Option.fromNullishOr(options.alpha), () => 1),
    order: Option.getOrElse(Option.fromNullishOr(options.order), () => 0),
    scale: Option.getOrElse(Option.fromNullishOr(options.scale), () => 1),
    ...Option.match(Option.fromNullishOr(options.caption), {
      onNone: () => ({}),
      onSome: (caption) => ({ caption }),
    }),
  };
  return Option.match(Option.fromNullishOr(options.marks), {
    onNone: () => mark,
    onSome: (marks) => ({ ...mark, marks }),
  });
};
