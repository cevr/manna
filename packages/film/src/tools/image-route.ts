import { Context, Duration, Effect, FileSystem, Layer, Option, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { collectWithin } from './process.ts';

interface ImageRequest {
  readonly prompt: string;
  readonly refs: ReadonlyArray<string>;
  readonly size: string;
  readonly out: string;
}

export const PANEL_SIZE = '1536x1024';

export const PORTRAIT = { width: 1024, height: 1536 } as const;

export const editRequest = (prompt: string, picture: string, out: string): ImageRequest => ({
  prompt,
  refs: [picture],
  size: `${PORTRAIT.width}x${PORTRAIT.height}`,
  out,
});

const IMAGE_LIMIT = Duration.minutes(6);

class ImageRouteFailed extends Schema.TaggedError<ImageRouteFailed>()('ImageRouteFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `okra image drew nothing: ${this.reason}`;
  }
}

class PromptPersonal extends Schema.TaggedError<PromptPersonal>()('PromptPersonal', {
  found: Schema.String,
}) {
  override get message() {
    return `the prompt names something private (${this.found}); it was not sent`;
  }
}

const PERSONAL: ReadonlyArray<readonly [string, RegExp]> = [
  ['a home path', /(?:\/Users\/|\/home\/|~\/)[^\s]*/],
  ['an email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['a key', /\b(?:sk|pk|rk|ghp|gho|ghs|xox[abprs])[-_][A-Za-z0-9_-]{10,}/],
  ['a token', /\b[A-Za-z0-9+/_-]{40,}={0,2}/],
];

const personalIn = (prompt: string): Option.Option<string> =>
  Option.fromUndefinedOr(PERSONAL.find(([, re]) => re.test(prompt))?.[0]);

const okraArgs = (request: ImageRequest): ReadonlyArray<string> => [
  'image',
  request.prompt,
  '--size',
  request.size,
  ...request.refs.flatMap((ref) => ['--ref', ref]),
  '-o',
  request.out,
];

export const okraCommand = (request: ImageRequest): ReadonlyArray<string> => [
  'okra',
  ...okraArgs(request),
];

interface ImageRouteService {
  readonly draw: (request: ImageRequest) => Effect.Effect<void, ImageRouteFailed | PromptPersonal>;
}

export class ImageRoute extends Context.Service<ImageRoute, ImageRouteService>()(
  '@manna/film/tools/ImageRoute',
) {
  static readonly layer = Layer.effect(
    ImageRoute,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fs = yield* FileSystem.FileSystem;
      const draw = Effect.fn('ImageRoute.draw')(function* (request: ImageRequest) {
        const found = personalIn(request.prompt);
        if (Option.isSome(found)) return yield* PromptPersonal.make({ found: found.value });
        const done = yield* collectWithin(
          spawner,
          'okra image',
          ChildProcess.make('okra', [...okraArgs(request)], { forceKillAfter: '5 seconds' }),
          IMAGE_LIMIT,
        ).pipe(Effect.mapError((e) => ImageRouteFailed.make({ reason: e.message })));
        const made = yield* fs.exists(request.out).pipe(Effect.orElseSucceed(() => false));
        if (done.exitCode !== 0 || !made)
          return yield* ImageRouteFailed.make({
            reason: `exit ${done.exitCode}: ${done.stderr.trim().split('\n').slice(-3).join(' | ')}`,
          });
      });
      return ImageRoute.of({ draw });
    }),
  );

  static readonly fake = (bytes: (request: ImageRequest) => Uint8Array) =>
    Layer.effect(
      ImageRoute,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return ImageRoute.of({
          draw: (request) =>
            Effect.gen(function* () {
              const found = personalIn(request.prompt);
              if (Option.isSome(found)) return yield* PromptPersonal.make({ found: found.value });
              yield* fs
                .writeFile(request.out, bytes(request))
                .pipe(Effect.mapError((e) => ImageRouteFailed.make({ reason: e.message })));
            }),
        });
      }),
    );
}
