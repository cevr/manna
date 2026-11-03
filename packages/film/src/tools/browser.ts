import {
  Context,
  Deferred,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  type Scope,
  Semaphore,
} from 'effect';
import { openView, thrownBy } from './chrome.ts';
import { GPU_FLAG } from './chrome-gpu.ts';
import {
  type CallAnswers,
  type CallArgs,
  type ExportCall,
  ExportAnswers,
  type LumaArea,
  type WireAnswers,
  ExportInfo,
} from '../core/export-handle.ts';
import {
  type BrowserFailed,
  type BrowserMissing,
  ContactFailed,
  EncodeFailed,
  EncoderMissing,
  FrameFailed,
  LookbookFailed,
  PageCrashed,
  PageError,
  PageLoadFailed,
} from './errors.ts';

export class CallRefused extends Schema.TaggedError<CallRefused>()('CallRefused', {
  reason: Schema.String,
}) {}

export interface CallErrors {
  readonly frame: FrameFailed;
  readonly probe: FrameFailed;
  readonly lookbook: LookbookFailed;
  readonly encoder: EncoderMissing;
  readonly encode: EncodeFailed;
  readonly contact: ContactFailed;
  readonly look: FrameFailed;
  readonly luma: FrameFailed;
  readonly drawTimes: FrameFailed;
  readonly scenes: FrameFailed;
  readonly still: FrameFailed;
  readonly figures: FrameFailed;
  readonly filmTimed: FrameFailed;
}

interface CallPolicy<K extends ExportCall> {
  readonly timeout: Duration.Duration;
  readonly fail: (args: CallArgs[K], reason: string) => CallErrors[K];
}

const FRAME_TIMEOUT = Duration.minutes(2);
const SHEET_TIMEOUT = Duration.minutes(5);
const ENCODE_TIMEOUT = Duration.minutes(5);

const batchFailed = (
  [frames]: readonly [ReadonlyArray<number>, ...ReadonlyArray<unknown>],
  reason: string,
) => FrameFailed.make({ frame: frames[0] ?? 0, reason });

type CallPolicies = { readonly [K in ExportCall]: CallPolicy<K> };

const CALLS: CallPolicies = {
  frame: { timeout: FRAME_TIMEOUT, fail: ([frame], reason) => FrameFailed.make({ frame, reason }) },
  probe: { timeout: FRAME_TIMEOUT, fail: ([frame], reason) => FrameFailed.make({ frame, reason }) },
  lookbook: { timeout: SHEET_TIMEOUT, fail: (_, reason) => LookbookFailed.make({ reason }) },
  encoder: { timeout: FRAME_TIMEOUT, fail: (_, reason) => EncoderMissing.make({ reason }) },
  encode: {
    timeout: ENCODE_TIMEOUT,
    fail: ([from, to], reason) => EncodeFailed.make({ from, to, reason }),
  },
  contact: { timeout: SHEET_TIMEOUT, fail: (_, reason) => ContactFailed.make({ reason }) },
  look: { timeout: SHEET_TIMEOUT, fail: batchFailed },
  luma: { timeout: FRAME_TIMEOUT, fail: ([frame], reason) => FrameFailed.make({ frame, reason }) },
  drawTimes: { timeout: SHEET_TIMEOUT, fail: batchFailed },
  scenes: { timeout: FRAME_TIMEOUT, fail: (_, reason) => FrameFailed.make({ frame: 0, reason }) },
  still: { timeout: FRAME_TIMEOUT, fail: ([frame], reason) => FrameFailed.make({ frame, reason }) },
  figures: {
    timeout: FRAME_TIMEOUT,
    fail: ([frame], reason) => FrameFailed.make({ frame, reason }),
  },
  filmTimed: {
    timeout: FRAME_TIMEOUT,
    fail: ([frame], reason) => FrameFailed.make({ frame, reason }),
  },
};

export type Invoke = <K extends ExportCall>(
  name: K,
  args: CallArgs[K],
  timeout: Duration.Duration,
) => Effect.Effect<unknown, PageError | PageCrashed | CallRefused>;

export interface FramePage {
  readonly info: ExportInfo;
  readonly title: string;
  readonly call: <K extends ExportCall>(
    name: K,
    ...args: CallArgs[K]
  ) => Effect.Effect<CallAnswers[K], PageError | PageCrashed | CallErrors[K]>;
}

const answerOf = <K extends ExportCall>(
  answers: { readonly [P in K]: Schema.Codec<CallAnswers[P], WireAnswers[P]> },
  name: K,
): Schema.Codec<CallAnswers[K], WireAnswers[K]> => answers[name];

export const framePage = (info: ExportInfo, title: string, invoke: Invoke): FramePage => ({
  info,
  title,
  call: <K extends ExportCall>(name: K, ...args: CallArgs[K]) => {
    const policy: CallPolicy<K> = CALLS[name];
    const answer = answerOf(ExportAnswers, name);
    const failed = (reason: string) => policy.fail(args, reason);
    return invoke(name, args, policy.timeout).pipe(
      Effect.catchTag('CallRefused', (refused) => Effect.fail(failed(refused.reason))),
      Effect.flatMap((wire) =>
        Schema.decodeUnknownEffect(answer)(wire).pipe(
          Effect.mapError((error) => failed(`the export handle answered: ${error.message}`)),
        ),
      ),
    );
  },
});

export const lumaGrid = (area: LumaArea) =>
  Schema.Array(Schema.Finite).check(
    Schema.makeFilter(
      (cells) =>
        cells.length === area.cols * area.rows ||
        `${cells.length} luma cells for a ${area.cols}×${area.rows} grid`,
    ),
  );

export const lumaOf = (page: FramePage, i: number, area: LumaArea) =>
  page
    .call('luma', i, area)
    .pipe(
      Effect.flatMap((cells) =>
        Schema.decodeEffect(lumaGrid(area))(cells).pipe(
          Effect.mapError((error) => FrameFailed.make({ frame: i, reason: error.message })),
        ),
      ),
    );

export type PageOpenError =
  | PageLoadFailed
  | PageError
  | PageCrashed
  | BrowserFailed
  | BrowserMissing;

interface BrowserService {
  readonly open: (url: string) => Effect.Effect<FramePage, PageOpenError, Scope.Scope>;
}

const LOAD_TIMEOUT = Duration.minutes(1);
const SETTLE = Duration.seconds(1);

export const launchArgs: ReadonlyArray<string> = [
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  GPU_FLAG,
  '--use-angle=metal',
];

const frameView = openView(launchArgs, { width: 1920, height: 1080 });

const HANDLE = `new Promise((done) => {
  const look = () => (window.__film ? done(true) : setTimeout(look, 50));
  look();
})`;

const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const openPage = (view: Bun.WebView, url: string) =>
  Effect.gen(function* () {
    const broken = yield* Deferred.make<never, PageError | PageCrashed>();
    const loadFailed = (cause: unknown) => PageLoadFailed.make({ url, reason: String(cause) });
    const one = yield* Semaphore.make(1);
    const evaluate = <A>(script: string) =>
      one.withPermits(1)(Effect.tryPromise(() => view.evaluate<A>(script)));

    yield* Effect.tryPromise({ try: () => view.navigate('about:blank'), catch: loadFailed });
    view.addEventListener('Runtime.exceptionThrown', (event: Event) => {
      Option.map(thrownBy(event), (reason) =>
        Deferred.doneUnsafe(broken, Effect.fail(PageError.make({ reason }))),
      );
    });
    view.addEventListener('Inspector.targetCrashed', () => {
      Deferred.doneUnsafe(
        broken,
        Effect.fail(PageCrashed.make({ reason: 'the renderer process died' })),
      );
    });
    for (const domain of ['Runtime', 'Inspector'])
      yield* Effect.tryPromise({ try: () => view.cdp(`${domain}.enable`), catch: loadFailed });

    const guarded = <A, E>(call: Effect.Effect<A, E>) =>
      Effect.raceFirst(
        call.pipe(
          Effect.catch((error) =>
            Effect.timeoutOrElse(Deferred.await(broken), {
              duration: SETTLE,
              orElse: () => Effect.fail(error),
            }),
          ),
        ),
        Deferred.await(broken),
      );

    const loading = <A>(step: Effect.Effect<A, unknown>) =>
      guarded(
        step.pipe(
          Effect.mapError(loadFailed),
          Effect.timeoutOrElse({
            duration: LOAD_TIMEOUT,
            orElse: () => Effect.fail(loadFailed('the player did not load in time')),
          }),
        ),
      );

    yield* loading(Effect.tryPromise(() => view.navigate(url)));
    yield* loading(evaluate(HANDLE));
    const title = yield* loading(evaluate<string>('document.title'));
    const reported = yield* loading(evaluate('window.__film.info'));
    const info = yield* Schema.decodeUnknownEffect(ExportInfo)(reported).pipe(
      Effect.mapError((error) => PageLoadFailed.make({ url, reason: error.message })),
    );

    const invoke: Invoke = (name, args, timeout) =>
      guarded(
        evaluate(`window.__film[${jsonOf(name)}](...${jsonOf(args)})`).pipe(
          Effect.mapError((cause) => CallRefused.make({ reason: String(cause) })),
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () => Effect.fail(CallRefused.make({ reason: 'timed out' })),
          }),
        ),
      );

    return framePage(info, title, invoke);
  });

export const browserReady: Effect.Effect<
  void,
  BrowserMissing | BrowserFailed,
  FileSystem.FileSystem | Path.Path
> = Effect.scoped(Effect.asVoid(frameView)).pipe(Effect.withSpan('Browser.ready'));

export class Browser extends Context.Service<Browser, BrowserService>()(
  '@manna/film/tools/Browser',
) {
  static readonly layer = Layer.effect(
    Browser,
    Effect.suspend(() => makeBrowser),
  );
}

export const makeBrowser: Effect.Effect<BrowserService, never, FileSystem.FileSystem | Path.Path> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const open = Effect.fn('Browser.open')(function* (url: string) {
      const view = yield* frameView.pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      return yield* openPage(view, url);
    });
    return Browser.of({ open });
  });
