import { Array as Arr, Effect, Option } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Marked } from 'marked';

export interface StoredFile {
  readonly body: ReadableStream<Uint8Array> | string;
  readonly text: Effect.Effect<string>;
}

export interface ReportStore {
  readonly names: Effect.Effect<readonly string[]>;
  readonly open: (key: string) => Effect.Effect<Option.Option<StoredFile>>;
}

export const reportKey = (name: string) => `reports/${name}.md`;

export const reportPageKey = (name: string) => `pages/${name}.html`;

export const nameOfKey = (key: string): Option.Option<string> =>
  Option.map(
    Option.fromNullishOr(/^reports\/([0-9TZ]+)\.md$/.exec(key)),
    (match) => match[1] ?? '',
  );

const NAME = /^[0-9TZ]+$/;

const HTML_SPECIAL = /[&<>"']/g;
const HTML_ENTITY = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);
const escapeHtml = (text: string) =>
  text.replace(HTML_SPECIAL, (character) => HTML_ENTITY.get(character) ?? character);

const markdown = new Marked({
  gfm: true,
  renderer: { html: ({ text }) => escapeHtml(text) },
});

const readableName = (name: string) =>
  name.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d*Z$/, '$1-$2-$3 $4:$5 UTC');

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #fbfaf7; --fg: #1d1b18; --muted: #6b665e; --rule: #e4e0d8;
  --quote: #f2efe8; --removed: #a3261b; --removed-bg: #fbe4e1; --added: #1d6b33; --added-bg: #dff3e4;
  --link: #1f5fa8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161513; --fg: #ece8e1; --muted: #a39d93; --rule: #34312c;
    --quote: #211f1c; --removed: #f2a69d; --removed-bg: #4a1f1a; --added: #9fdcae; --added-bg: #183a22;
    --link: #8ab8f0;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 17px/1.6 Charter, 'Iowan Old Style', Georgia, serif;
}
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
h1, h2, h3 { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.25; }
h1 { font-size: 1.6rem; margin: 0 0 1rem; }
h2 { font-size: 1.2rem; margin: 2.5rem 0 0.5rem; padding-top: 1rem; border-top: 1px solid var(--rule); }
h3 { font-size: 1rem; margin: 2rem 0 0.25rem; }
p { margin: 0.5rem 0; }
blockquote {
  margin: 0.25rem 0 1.25rem; padding: 0.6rem 0.9rem;
  background: var(--quote); border-radius: 6px; overflow-wrap: anywhere;
}
blockquote p { margin: 0; }
del { color: var(--removed); background: var(--removed-bg); text-decoration-thickness: 1px; }
blockquote strong { color: var(--added); background: var(--added-bg); font-weight: inherit; }
a { color: var(--link); }
nav { font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--muted); margin-bottom: 1.5rem; }
ul { padding-left: 1.25rem; }
`;

const document = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;

const page = (title: string, body: string) => HttpServerResponse.html(document(title, body));

const KEPT = { 'cache-control': 'public, max-age=86400' };
const MOVING = { 'cache-control': 'public, max-age=60' };

const notFound = () =>
  page('No such report', '<nav><a href="/sync/">All reports</a></nav><h1>No such report</h1>').pipe(
    HttpServerResponse.setStatus(404),
    HttpServerResponse.setHeaders(MOVING),
  );

const indexPage = (names: readonly string[]) => {
  const items = [...names]
    .reverse()
    .map((name) => `<li><a href="/sync/${name}">${escapeHtml(readableName(name))}</a></li>`);
  let list = '<p>No reports yet.</p>';
  if (items.length > 0) list = `<ul>${items.join('')}</ul>`;
  return page('EGW sync reports', `<h1>EGW sync reports</h1>${list}`).pipe(
    HttpServerResponse.setHeaders(MOVING),
  );
};

export const reportPage = (name: string, markdownText: string): string =>
  document(
    `EGW sync, ${readableName(name)}`,
    `<nav><a href="/sync/">All reports</a> · <a href="/sync/${name}.md">Markdown</a></nav>` +
      markdown.parse(markdownText, { async: false }),
  );

const sent = (file: StoredFile, contentType: string) =>
  HttpServerResponse.raw(file.body, { contentType, headers: KEPT });

export const syncAnswer = Effect.fn('SyncPages.answer')(function* (
  store: ReportStore,
  path: string,
) {
  const rest = path.replace(/^\/sync\/?/, '');
  if (rest === '') return indexPage(yield* store.names);
  const raw = rest.endsWith('.md');
  const name = rest.replace(/\.md$/, '');
  if (name === 'latest') {
    const newest = Arr.last(yield* store.names);
    if (Option.isNone(newest)) return notFound();
    let target = `/sync/${newest.value}`;
    if (raw) target = `${target}.md`;
    return HttpServerResponse.redirect(target, { status: 302, headers: MOVING });
  }
  if (!NAME.test(name)) return notFound();
  if (raw) {
    const whole = yield* store.open(reportKey(name));
    if (Option.isNone(whole)) return notFound();
    return sent(whole.value, 'text/plain; charset=utf-8');
  }
  const stored = yield* store.open(reportPageKey(name));
  if (Option.isSome(stored)) return sent(stored.value, 'text/html; charset=utf-8');
  const whole = yield* store.open(reportKey(name));
  if (Option.isNone(whole)) return notFound();
  return HttpServerResponse.html(reportPage(name, yield* whole.value.text)).pipe(
    HttpServerResponse.setHeaders(KEPT),
  );
});

export const syncRoutes = (store: ReportStore) =>
  HttpRouter.add(
    'GET',
    '/sync/*',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const path = new URL(request.url, 'http://local').pathname;
      return yield* syncAnswer(store, path);
    }),
  );
