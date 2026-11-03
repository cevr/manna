import { Effect } from 'effect';
import { Base64 } from 'effect/encoding';
import { describe, expect, it } from 'effect-bun-test';
import {
  asset,
  openTab,
  respond,
  scriptOf,
  servePaths,
} from '../../../src/lab/fixtures/browsers.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';

const writtenBy = (js: string, source: string) => {
  const map = `{"version":3,"sources":["${source}"],"names":[],"mappings":"AAAA"}`;
  return `${js};window.ran=true\n//# sourceMappingURL=data:application/json;base64,${Base64.encode(map)}`;
};

const FILM_FILE = 'src/lab/shell.tsx';

const outcome = (js: string) =>
  Effect.gen(function* () {
    const script = asset('reach.js', respond(js, 'text/javascript'));
    const exit = yield* Effect.exit(
      Effect.scoped(
        Effect.gen(function* () {
          const tab = yield* openTab({
            width: 500,
            height: 400,
            microphone: false,
            init: [],
            assets: [script],
            serve: servePaths({
              '/': respond(
                `<!doctype html><html><body><div id="a"></div>${scriptOf(script)}</body></html>`,
                'text/html',
              ),
            }),
          });
          yield* tab.goto('/');
          yield* evaluates(tab, 'window.ran === true', true);
          yield* tab.evaluate('true');
        }),
      ),
    );
    return String(exit);
  });

describe('the host-reach check, on the body', () => {
  for (const [api, js] of [
    ['onpopstate on the host', 'document.body.onpopstate = () => {}'],
    ['onhashchange on the host', 'document.body.onhashchange = () => {}'],
    ['onkeydown on the host', 'document.body.onkeydown = () => {}'],
    ['onkeyup on the host', 'document.documentElement.onkeyup = () => {}'],
    [
      'addEventListener(keydown) on the host',
      "document.body.addEventListener('keydown', () => {})",
    ],
    [
      'addEventListener(popstate) on the host',
      "document.documentElement.addEventListener('popstate', () => {})",
    ],
  ] as const)
    it.live(`fails a case whose film file calls ${api} on the body`, () =>
      Effect.gen(function* () {
        const failed = yield* outcome(writtenBy(js, FILM_FILE));
        expect(failed).toContain(`host reach: ${api} from `);
        expect(failed).toContain('from src/lab/shell.tsx');
      }),
    );

  it.live('lets the body hear its own element events and a click handler through', () =>
    Effect.gen(function* () {
      const quiet = yield* outcome(
        writtenBy(
          "document.body.addEventListener('click', () => {});document.body.onclick = () => {}",
          FILM_FILE,
        ),
      );
      expect(quiet).not.toContain('host reach');
    }),
  );
});
