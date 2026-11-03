import { Effect, Schema, type Scope } from 'effect';
import { Base64 } from 'effect/encoding';
import type { RenderRequest } from './page.ts';
import { REST, type Pose } from './spec.ts';

/** The figure's page failed: its build, its Chrome, its script or a render. */
export class Toon3dFailed extends Schema.TaggedError<Toon3dFailed>()('Toon3dFailed', {
  reason: Schema.String,
}) {}

/** Renders one request to PNG bytes. */
export type RenderPng = (req: RenderRequest) => Effect.Effect<Uint8Array, Toon3dFailed>;

/** The six kept views' turns: the figure's yaw (radians) at each. */
export const YAWS = {
  front: 0,
  threeQuarterLeft: -Math.PI / 4,
  profileLeft: -Math.PI / 2,
  back: Math.PI,
  profileRight: Math.PI / 2,
  threeQuarterRight: Math.PI / 4,
} as const;

export type ViewName = keyof typeof YAWS;

/** One head unit in kept-view pixels: the front view's hair top to its chin. */
export const HEAD_PX = 189;

/**
 * Chrome's flags: WebGL through SwiftShader on the CPU, since Bun spawns
 * Chrome with the GPU off (the film's GPU launcher is private to
 * `@manna/film`), and a software rasterizer gives the same bytes every run.
 */
const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'];

const PAGE = `${import.meta.dir}/page.ts`;

const failed = (cause: unknown) => Toon3dFailed.make({ reason: String(cause) });

const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** The page's bundle: `page.ts` and three as one script that runs on a blank page. */
const pageScript = Effect.gen(function* () {
  const built = yield* Effect.tryPromise({
    try: () => Bun.build({ entrypoints: [PAGE], target: 'browser', format: 'iife' }),
    catch: failed,
  });
  const texts = yield* Effect.forEach(built.outputs, (o) =>
    Effect.tryPromise({ try: () => o.text(), catch: failed }),
  );
  return texts.join('\n');
});

/** An expression that runs `script` as the page's own script element and answers `ready`, or the error it threw. */
const loadScript = (script: string): string => `(() => {
  const failures = [];
  window.addEventListener('error', (e) => failures.push(String(e.message)));
  const tag = document.createElement('script');
  tag.textContent = ${jsonOf(script)};
  document.head.appendChild(tag);
  return window.ready === true ? 'ready' : 'page failed: ' + failures.join('; ');
})()`;

/** A PNG data URL's bytes. */
const pngOf = (dataUrl: string) =>
  Effect.fromResult(Base64.decode(dataUrl.slice(dataUrl.indexOf(',') + 1))).pipe(
    Effect.mapError(failed),
  );

/**
 * The figure's page in a headless Chrome, closed with the scope: its bundle
 * runs on a blank page and leaves `window.toon3d.render`, which the returned
 * renderer calls once per request.
 */
export const toon3dPage = (size: {
  readonly width: number;
  readonly height: number;
}): Effect.Effect<RenderPng, Toon3dFailed, Scope.Scope> =>
  Effect.gen(function* () {
    const script = yield* pageScript;
    const view = yield* Effect.acquireRelease(
      Effect.try({
        try: () =>
          new Bun.WebView({
            ...size,
            backend: { type: 'chrome', url: false, argv: [...SOFTWARE_GL] },
          }),
        catch: failed,
      }),
      (v) => Effect.sync(() => v.close()),
    );
    yield* Effect.tryPromise({ try: () => view.navigate('about:blank'), catch: failed });
    const loaded = yield* Effect.tryPromise({
      try: () => view.evaluate<string>(loadScript(script)),
      catch: failed,
    });
    if (loaded !== 'ready') return yield* Toon3dFailed.make({ reason: loaded });
    return (req: RenderRequest) =>
      Effect.tryPromise({
        try: () => view.evaluate<string>(`window.toon3d.render(${jsonOf(req)})`),
        catch: failed,
      }).pipe(Effect.flatMap(pngOf));
  });

/** A request at a kept view's size and scale, the soles' centre at (`ox`, `oy`). */
export const viewRequest = (
  view: ViewName,
  place: {
    readonly width: number;
    readonly height: number;
    readonly ox: number;
    readonly oy: number;
  },
  pose: Pose = REST,
): RenderRequest => ({
  ...place,
  scale: HEAD_PX,
  yaw: YAWS[view],
  pose,
  output: 'colour',
  palette: 'kept',
});
