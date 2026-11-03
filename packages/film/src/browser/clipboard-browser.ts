import { Effect, Layer } from 'effect';
import { Clipboard, ClipboardRefused } from './clipboard.ts';

export const clipboardLayer: Layer.Layer<Clipboard> = Layer.succeed(
  Clipboard,
  Clipboard.of({
    copyLink: (href) =>
      Effect.tryPromise({
        try: () => navigator.clipboard.writeText(new URL(href, document.baseURI).href),
        catch: (cause) => new ClipboardRefused({ reason: String(cause) }),
      }),
  }),
);
