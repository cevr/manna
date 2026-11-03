import { Effect, Option } from 'effect';
import type { Scope } from 'effect';
import type { CallArgs, ExportCall, WireAnswers } from '../../core/export-handle.ts';
import { asset, openTab, respond, scriptOf, servePaths } from './browsers.ts';
import { bundled } from './bundles.ts';
import { jsonOf } from './tab.ts';

const renderScript = Effect.runSync(
  Effect.cached(
    Effect.map(bundled('render-page.ts'), (js) =>
      asset('render.js', respond(js, 'text/javascript')),
    ),
  ),
);

interface RenderPage {
  readonly call: <K extends ExportCall>(
    name: K,
    ...args: CallArgs[K]
  ) => Effect.Effect<WireAnswers[K]>;
  readonly errors: ReadonlyArray<string>;
}

const typeOf = (path: string): string =>
  Option.match(
    Option.liftPredicate(path, (p) => p.endsWith('.json')),
    {
      onNone: () => 'video/mp4',
      onSome: () => 'application/json',
    },
  );

export const openRender = (
  film: string,
  files: Readonly<Record<string, Uint8Array | string>> = {},
): Effect.Effect<RenderPage, never, Scope.Scope> =>
  Effect.gen(function* () {
    const script = yield* renderScript;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${scriptOf(script)}</body></html>`;
    const tab = yield* openTab({
      width: 800,
      height: 600,
      microphone: false,
      init: [],
      assets: [script],
      serve: servePaths({
        ...Object.fromEntries(
          Object.entries(files).map(([path, body]) => [path, respond(body, typeOf(path))]),
        ),
        '/': respond(html, 'text/html'),
      }),
    });
    yield* tab.goto(`/?film=${film}&export`);
    yield* tab.until('window.__film !== undefined', {
      now: 'document.body.innerText',
      say: (now) => `the render page never handed out its handle: ${now}`,
    });
    const page: RenderPage = {
      call: (name, ...args) => tab.evaluate(`window.__film[${jsonOf(name)}](...${jsonOf(args)})`),
      errors: tab.errors,
    };
    return page;
  });
