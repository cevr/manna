import { Context, Data, Effect, Layer } from 'effect';

export class ClipboardRefused extends Data.TaggedError('ClipboardRefused')<{
  readonly reason: string;
}> {}

interface ClipboardOps {
  readonly copyLink: (href: string) => Effect.Effect<void, ClipboardRefused>;
}

export class Clipboard extends Context.Service<Clipboard, ClipboardOps>()(
  '@manna/film/browser/Clipboard',
) {
  static readonly memory = (written: Array<string>, origin: string): Layer.Layer<Clipboard> =>
    Layer.succeed(
      Clipboard,
      Clipboard.of({
        copyLink: (href) =>
          Effect.sync(() => {
            written.push(new URL(href, origin).href);
          }),
      }),
    );
}
