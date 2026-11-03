import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Deferred,
  Duration,
  Effect,
  FileSystem,
  Match,
  Option,
  Predicate,
  Result,
  Schema,
} from 'effect';
import { Base64 } from 'effect/encoding';
import { LabHttpApi, type AppPage, Refusal, pageAt, pageHref, statusOf } from '../../core/api.ts';
import { declares } from '../../core/testing.ts';
import type { PageBuild } from '../../core/schema.ts';
import { PAGE_CUT_MARK, PAGE_MOUNTED, type PageRender } from '../../core/page-render.ts';
import { appleAgent } from '../../browser/keys.ts';
import { splice } from '../../tools/lab-page.ts';
import { type Asset, asset, openTab, respond, scriptOf } from './browsers.ts';
import { bundled, served } from './bundles.ts';
import { CLOCK_SCRIPT, CLOCK_STOPPED } from './clock.ts';
import { PROBE } from './probe-film.ts';
import { tone } from './tone.ts';
import { type Request, type Response, type Tab } from './tab.ts';

const API = `/api/films/${PROBE}`;

export const URL_T = `Number(new URLSearchParams(location.hash.slice(1)).get('t'))`;

export type Json = Schema.Json;

const JsonText = Schema.fromJsonString(Schema.Json);

export interface Asked {
  readonly method: string;
  readonly path: string;
  readonly body: Option.Option<Json>;
}

type Answer =
  | { readonly _tag: 'Json'; readonly status: number; readonly json: Json }
  | { readonly _tag: 'Refused'; readonly refusal: Refusal }
  | { readonly _tag: 'Text'; readonly status: number; readonly text: string }
  | { readonly _tag: 'File'; readonly path: string }
  | { readonly _tag: 'Wav'; readonly bytes: Uint8Array }
  | { readonly _tag: 'Png'; readonly bytes: Uint8Array }
  | { readonly _tag: 'Hold' }
  | { readonly _tag: 'Later'; readonly gate: Deferred.Deferred<void>; readonly then: Answer }
  | { readonly _tag: 'Made'; readonly made: Effect.Effect<Answer> };

export const json = (value: Json, status = 200): Answer => ({
  _tag: 'Json',
  status,
  json: value,
});
export const refused = (refusal: Refusal): Answer => ({ _tag: 'Refused', refusal });
export const text = (value: string, status: number): Answer => ({
  _tag: 'Text',
  status,
  text: value,
});
export const hold: Answer = { _tag: 'Hold' };
export const later = (gate: Deferred.Deferred<void>, then: Answer): Answer => ({
  _tag: 'Later',
  gate,
  then,
});
export const file = (path: string): Answer => ({ _tag: 'File', path });
export const madeBy = (made: Effect.Effect<Answer>): Answer => ({ _tag: 'Made', made });
const madeOf = (found: Answer): Effect.Effect<Answer> => {
  if (found._tag === 'Made') return Effect.flatMap(found.made, madeOf);
  return Effect.succeed(found);
};
export const told = (tell: Effect.Effect<unknown>, then: Answer): Answer =>
  madeBy(Effect.tap(madeOf(then), () => tell));
export const TONE: Answer = { _tag: 'Wav', bytes: tone(10, 0.1) };
export const PANEL_PNG: Answer = {
  _tag: 'Png',
  bytes: Result.getOrThrow(
    Base64.decode(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR4nGN49+wGSYhhVMOg0AAAht6A0Nd4W2UAAAAASUVORK5CYII=',
    ),
  ),
};

export interface FakeRoute {
  readonly method: 'GET' | 'POST';
  readonly path: RegExp;
  readonly answer: (asked: Asked) => Answer;
  readonly after: Duration.Duration;
}

export const route = (
  method: FakeRoute['method'],
  path: RegExp,
  answer: FakeRoute['answer'],
  after: Duration.Input = Duration.zero,
): FakeRoute => ({ method, path, answer, after: Duration.fromInputUnsafe(after) });

const probeTry = (beat: string, at: string, n: number): Json => ({
  n,
  file: `${beat}.${at}.${n}.png`,
  sha256: `${beat}${at}${n}`,
  made: 'generate',
  refs: ['style.png'],
  at: '2026-10-14T00:00:00.000Z',
});

const probeBoard: Json = {
  film: PROBE,
  panels: [
    {
      id: 'one.start',
      beat: 'one',
      at: 'start',
      tries: [probeTry('one', 'start', 1), probeTry('one', 'start', 2)],
      kept: 1,
      why: 'the line reads at once',
    },
    {
      id: 'one.rise',
      beat: 'one',
      at: 'rise',
      tries: [],
      text: { _tag: 'Card', to: 'fall', payoff: 'slowly' },
    },
    {
      id: 'one.fall',
      beat: 'one',
      at: 'fall',
      tries: [probeTry('one', 'fall', 1), probeTry('one', 'fall', 2)],
    },
    {
      id: 'three.near',
      beat: 'three',
      at: 'near',
      tries: [],
      text: {
        _tag: 'Verse',
        ref: 'Probe 3:1',
        text: 'pushed in close on a face',
        phrase: 'a face',
      },
    },
  ],
  approvals: [],
};

export const PROBE_FACE_PATH = /^\/api\/review\/files\/probe-face\.woff2$/;

export const PROBE_FACE_FILE = Bun.resolveSync(
  '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2',
  import.meta.dir,
);

const defaults: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/board$/, () => json(probeBoard)),
  route('GET', PROBE_FACE_PATH, () => file(PROBE_FACE_FILE)),
];

export const bundleOf = (entry: string) => Effect.runSync(Effect.cached(bundled(entry)));

const scriptAsset = (entry: string, name: string): Effect.Effect<Asset> =>
  Effect.map(bundled(entry), (js) => asset(name, respond(js, 'text/javascript')));

// oxlint-disable-next-line effect/noAsyncFunction -- the module's own load waits for its setup, so no case's timeout counts it
const [askScript, tokens, playerCss] = await Effect.runPromise(
  Effect.all(
    [
      scriptAsset('ask-page.ts', 'ask.js'),
      FileSystem.FileSystem.use((fs) =>
        fs.readFileString(`${import.meta.dir}/../../player/tokens.css`),
      ).pipe(Effect.orDie, Effect.provide(BunServices.layer)),
      FileSystem.FileSystem.use((fs) =>
        fs.readFileString(`${import.meta.dir}/../../player/player.css`),
      ).pipe(Effect.orDie, Effect.provide(BunServices.layer)),
    ],
    { concurrency: 3 },
  ),
);

export const tokensCss: string = tokens;

const css = `${tokens}${playerCss}`;

const stampOf = (build: Option.Option<PageBuild>) =>
  Option.match(build, {
    onNone: () => '',
    onSome: (b) =>
      `<meta name="lab-build" content="${b.build}"><meta name="lab-server" content="${b.server}">`,
  });

const bodyOf = (request: Request): Option.Option<Json> =>
  Schema.decodeOption(JsonText)(request.body);

const encodeRefusal = Schema.encodeSync(Schema.fromJsonString(Refusal));

const fileAnswer = (path: string) =>
  FileSystem.FileSystem.use((fs) => fs.readFile(path)).pipe(
    Effect.map((bytes) => respond(bytes, typeOfFile(path))),
    Effect.orDie,
    Effect.provide(BunServices.layer),
  );

const TYPES = new Map([
  ['.wav', 'audio/wav'],
  ['.woff2', 'font/woff2'],
  ['.mp4', 'video/mp4'],
  ['.svg', 'image/svg+xml'],
]);

const typeOfFile = (path: string) =>
  Option.getOrElse(
    Option.fromUndefinedOr(TYPES.get(path.slice(path.lastIndexOf('.')))),
    () => 'application/octet-stream',
  );

const answer = (found: Answer): Effect.Effect<Option.Option<Response>> => {
  if (found._tag === 'Hold') return Effect.succeedNone;
  if (found._tag === 'Later') return Effect.andThen(Deferred.await(found.gate), answer(found.then));
  if (found._tag === 'Made') return Effect.flatMap(found.made, answer);
  if (found._tag === 'File') return Effect.asSome(fileAnswer(found.path));
  if (found._tag === 'Wav') return Effect.succeedSome(respond(found.bytes, 'audio/wav'));
  if (found._tag === 'Png') return Effect.succeedSome(respond(found.bytes, 'image/png'));
  if (found._tag === 'Text')
    return Effect.succeedSome(respond(found.text, 'text/plain', found.status));
  if (found._tag === 'Refused')
    return Effect.succeedSome(
      respond(encodeRefusal(found.refusal), 'application/json', statusOf(found.refusal)),
    );
  return Effect.succeedSome(
    respond(Schema.encodeSync(JsonText)(found.json), 'application/json', found.status),
  );
};

const ASK_PAGE = /^\/api\/asks\/(a[0-9a-f]{10})\/page$/;

const pageOfOne = (
  routes: ReadonlyArray<FakeRoute>,
  method: string,
  path: string,
): Option.Option<FakeRoute> =>
  Option.flatMap(
    Option.filter(Option.fromNullishOr(ASK_PAGE.exec(path)), () => method === 'GET'),
    ([, ask]) =>
      Option.map(
        Option.fromUndefinedOr(
          routes.find((f) => f.method === 'GET' && f.path.test(`/api/asks/${ask}`)),
        ),
        (one): FakeRoute => ({
          ...one,
          path: ASK_PAGE,
          answer: (asked) =>
            madeBy(
              Effect.map(madeOf(one.answer({ ...asked, path: `/api/asks/${ask}` })), (record) => {
                if (record._tag !== 'Json' || record.status !== 200) return record;
                return json({ page: ask ?? '', asks: [record.json] });
              }),
            ),
        }),
      ),
  );

const declared = declares(LabHttpApi);

const asGet = (method: string): string => {
  if (method === 'HEAD') return 'GET';
  return method;
};

const apiAnswer =
  (prefix: string, routes: ReadonlyArray<FakeRoute>, asked: Array<Asked>) =>
  (request: Request): Effect.Effect<Option.Option<Response>> => {
    const under = Option.liftPredicate(request.url.pathname, (p) => p.startsWith(`${prefix}/`));
    const made: Asked = {
      method: request.method,
      path: `${Option.getOrElse(
        Option.map(under, (p) => p.slice(prefix.length)),
        () => request.url.pathname,
      )}${request.url.search}`,
      body: bodyOf(request),
    };
    asked.push(made);
    const method = asGet(request.method);
    const found = Option.orElse(
      Option.fromUndefinedOr(routes.find((f) => f.method === method && f.path.test(made.path))),
      () => pageOfOne(routes, method, made.path),
    );
    return Option.match(found, {
      onNone: () => Effect.succeedSome(respond('no fake route', 'text/plain', 404)),
      onSome: (f) => {
        if (!declared(method, request.url.pathname))
          return Effect.succeedSome(
            respond(
              `a fake route answers ${request.method} ${request.url.pathname}, which the lab's API does not declare`,
              'text/plain',
              500,
            ),
          );
        return Effect.delay(answer(f.answer(made)), f.after);
      },
    });
  };

const FACE_FILE = /^\/((geist-mono|geist)-[a-z0-9-]+\.woff2)$/;

const faceFiles =
  (held: Option.Option<Deferred.Deferred<void>>) =>
  (request: Request): Option.Option<Effect.Effect<Response>> =>
    Option.map(Option.fromNullishOr(FACE_FILE.exec(request.url.pathname)), ([, name, face]) =>
      Effect.andThen(
        Option.match(held, { onNone: () => Effect.void, onSome: Deferred.await }),
        fileAnswer(Bun.resolveSync(`@fontsource-variable/${face}/files/${name}`, import.meta.dir)),
      ),
    );

const fakeServer =
  (
    pageFor: (request: Request) => Option.Option<Effect.Effect<Response>>,
    prefix: string,
    routes: ReadonlyArray<FakeRoute>,
    asked: Array<Asked>,
    faceHeld = Option.none<Deferred.Deferred<void>>(),
  ) =>
  (request: Request): Effect.Effect<Option.Option<Response>> =>
    Option.match(Option.firstSomeOf([pageFor(request), faceFiles(faceHeld)(request)]), {
      onSome: Effect.asSome,
      onNone: () => apiAnswer(prefix, routes, asked)(request),
    });

const servedBy =
  (name: AppPage, answer: (request: Request) => Effect.Effect<Response>) =>
  (request: Request): Option.Option<Effect.Effect<Response>> =>
    Option.as(
      Option.filter(pageAt(request.url.pathname), (page) => page === name),
      answer(request),
    );

const servedAs = (name: AppPage, html: Response) => servedBy(name, () => Effect.succeed(html));

interface OpenPage {
  readonly page: Tab;
  readonly asked: ReadonlyArray<Asked>;
  readonly errors: ReadonlyArray<string>;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly coarse?: boolean;
}

export const DESK: Viewport = { width: 1440, height: 900 };

export const PHONE: Viewport = { width: 390, height: 844, coarse: true };

const playerPage = (
  style: string,
  script: Asset,
  build: Option.Option<PageBuild> = Option.none(),
) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${style}</style>${stampOf(build)}</head><body>${scriptOf(script)}</body></html>`;

const renderScript = Effect.runSync(Effect.cached(scriptAsset('render-page.ts', 'render.js')));

export const openRender = Effect.fn('lab.fixture.render')(function* (href: string) {
  const script = yield* renderScript;
  const asked: Array<Asked> = [];
  const page = yield* openTab({
    width: 1920,
    height: 1080,
    microphone: false,
    init: [CLOCK_SCRIPT],
    assets: [script],
    serve: fakeServer(
      servedAs('render', respond(playerPage(css, script), 'text/html')),
      API,
      defaults,
      asked,
    ),
  });
  yield* page.goto(href);
  yield* page.until('window.__film !== undefined', {
    now: `document.body.innerText.slice(0, 200)`,
    say: (now) => `the export page at ${href} installed no handle: it shows ${now}`,
  });
  const open: OpenPage = { page, asked, errors: page.errors };
  return open;
});

const askHtml = (script: Asset, build: Option.Option<PageBuild>) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${tokens}</style>${stampOf(build)}</head><body>${scriptOf(script)}</body></html>`;

interface AskAt {
  readonly href?: string;
  readonly viewport?: Viewport;
  readonly build?: PageBuild;
  readonly cut?: Duration.Input;
  readonly mountedOnly?: boolean;
  readonly faceHeld?: Deferred.Deferred<void>;
  readonly clockStopped?: boolean;
}

const askDefaults: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/api\/review\/(files|phone)\/[^?]*\.mp4/, () => TONE),
];

export const openAsk = Effect.fn('lab.fixture.ask')(function* (
  routes: ReadonlyArray<FakeRoute>,
  at: AskAt & { readonly href: string },
) {
  const script = askScript;
  const asked: Array<Asked> = [];
  const page = yield* openTab({
    ...(at.viewport ?? DESK),
    microphone: false,
    init: [CLOCK_SCRIPT],
    assets: [script],
    serve: fakeServer(
      servedAs('ask', respond(askHtml(script, Option.fromUndefinedOr(at.build)), 'text/html')),
      '',
      [...routes, ...askDefaults],
      asked,
    ),
  });
  yield* page.goto(at.href);
  yield* page.waitFor('.rv-main');
  const open: OpenPage = { page, asked, errors: page.errors };
  return open;
});
export type ServedName = 'ask';

interface ServedPage {
  readonly render: Effect.Effect<PageRender>;
  readonly script: Effect.Effect<Asset>;
  readonly html: (script: Asset, build: Option.Option<PageBuild>) => string;
  readonly prefix: string;
  readonly defaults: ReadonlyArray<FakeRoute>;
  readonly home: string;
}

const SERVED: Readonly<Record<ServedName, ServedPage>> = {
  ask: {
    render: Effect.runSync(Effect.cached(served('../ask/server.tsx', 'askRender'))),
    script: Effect.runSync(Effect.cached(scriptAsset('ask-hydrated-page.ts', 'ask-hydrated.js'))),
    html: (script, build) => askHtml(script, build),
    prefix: '',
    defaults: askDefaults,
    home: pageHref.askPage('a0'),
  },
};

interface Rendered {
  readonly head: string;
  readonly bodyClass: string;
  readonly body: string;
  readonly pieces: ReadonlyArray<string>;
}

const fetched = (response: Response): globalThis.Response =>
  new globalThis.Response(
    new Blob([
      Match.value(response.body).pipe(
        Match.when(Predicate.isString, (text) => text),
        Match.orElse((bytes) => new Uint8Array(bytes)),
      ),
    ]),
    {
      status: response.status,
      headers: { 'content-type': response.type, ...response.headers },
    },
  );

const rendered = (
  render: PageRender,
  url: URL,
  mac: boolean,
  read: (request: Request) => Effect.Effect<Option.Option<Response>>,
  cut: Option.Option<Duration.Duration>,
): Effect.Effect<Rendered> =>
  Effect.suspend(() => {
    const written: Written = { head: '', body: [] };
    const sofar = (): Rendered => ({
      head: written.head,
      bodyClass: render.bodyClass,
      body: written.body.join(''),
      pieces: written.body,
    });
    const whole = Effect.map(rendering(render, url, mac, read, written), sofar);
    return Option.match(cut, {
      onNone: () => whole,
      onSome: (after) =>
        Effect.map(Effect.timeoutOption(whole, after), (ended) =>
          Option.getOrElse(ended, () => {
            written.body.push(PAGE_CUT_MARK);
            return sofar();
          }),
        ),
    });
  });

const agentOf = (request: Request): string =>
  Option.getOrElse(
    Option.fromUndefinedOr(
      Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === 'user-agent'),
    ).pipe(Option.map(([, value]) => value)),
    () => '',
  );

interface Written {
  head: string;
  readonly body: Array<string>;
}

const readsOf =
  (read: (request: Request) => Effect.Effect<Option.Option<Response>>) =>
  (input: RequestInfo | URL) =>
    Effect.runPromise(
      read({ method: 'GET', url: new URL(new globalThis.Request(input).url), body: '' }).pipe(
        Effect.flatMap(Option.match({ onNone: () => Effect.never, onSome: Effect.succeed })),
        Effect.map(fetched),
      ),
    );

export const servedReads = (
  name: ServedName,
  routes: ReadonlyArray<FakeRoute>,
  read: Array<Asked>,
): ((input: RequestInfo | URL) => Promise<globalThis.Response>) =>
  readsOf(apiAnswer(SERVED[name].prefix, [...routes, ...SERVED[name].defaults], read));

const rendering = (
  render: PageRender,
  url: URL,
  mac: boolean,
  read: (request: Request) => Effect.Effect<Option.Option<Response>>,
  written: Written,
): Effect.Effect<void> =>
  Effect.callback<void>((resume, signal) => {
    render.render(
      {
        url: `${url.origin}${url.pathname}${url.search}`,
        mac,
        signal,
        fetch: Object.assign(readsOf(read), { preconnect: globalThis.fetch.preconnect }),
      },
      {
        head: (html) => {
          written.head = html;
        },
        write: (html) => {
          written.body.push(html);
        },
        end: () => resume(Effect.void),
        fail: (reason) => resume(Effect.die(`the page's server render failed: ${reason}`)),
      },
    );
  });

interface Document {
  readonly path: string;
  readonly html: string;
  readonly pieces: ReadonlyArray<string>;
}

interface OpenServed extends OpenPage {
  readonly read: ReadonlyArray<Asked>;
  readonly documents: ReadonlyArray<Document>;
  readonly land: (href: string) => Effect.Effect<void>;
  readonly reload: Effect.Effect<void>;
}

export const servedTitle = (page: Tab, html: string) =>
  page.evaluate<string>(
    `new Promise((done) => { const frame = document.createElement('iframe'); frame.onload = () => { done(frame.contentDocument.title); frame.remove(); }; frame.srcdoc = ${Schema.encodeSync(JsonText)(html.replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/g, ''))}; document.body.append(frame); })`,
  );

export const openServed = Effect.fn('lab.fixture.served')(function* (
  name: ServedName,
  routes: ReadonlyArray<FakeRoute>,
  at: AskAt = {},
) {
  const spec = SERVED[name];
  const build = Option.fromUndefinedOr(at.build);
  const cut = Option.map(Option.fromUndefinedOr(at.cut), Duration.fromInputUnsafe);
  const render = yield* spec.render;
  const script = yield* spec.script;
  const all = [...routes, ...spec.defaults];
  const asked: Array<Asked> = [];
  const read: Array<Asked> = [];
  const documents: Array<Document> = [];
  const failed = yield* Deferred.make<never>();
  const document = (request: Request) =>
    Effect.gen(function* () {
      const page = yield* rendered(
        render,
        request.url,
        appleAgent(agentOf(request)),
        apiAnswer(spec.prefix, all, read),
        cut,
      );
      const [before, after] = yield* Option.match(splice(spec.html(script, build), page), {
        onNone: () => Effect.die(`the ${name} page has no head or body to splice into`),
        onSome: Effect.succeed,
      });
      const html = `${before}${page.body}${after}`;
      documents.push({
        path: `${request.url.pathname}${request.url.search}`,
        html,
        pieces: page.pieces,
      });
      return respond(html, 'text/html');
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.as(
          Deferred.failCause(failed, cause),
          respond(`the ${name} page's server render failed`, 'text/plain', 500),
        ),
      ),
    );
  const page = yield* openTab({
    ...(at.viewport ?? DESK),
    microphone: false,
    init: [CLOCK_SCRIPT, ...Arr.filter([CLOCK_STOPPED], () => at.clockStopped === true)],
    assets: [script],
    serve: fakeServer(
      servedBy(name, document),
      spec.prefix,
      all,
      asked,
      Option.fromUndefinedOr(at.faceHeld),
    ),
  });
  const mounted = Effect.suspend(() => {
    const servedCut = Option.exists(Arr.last(documents), (served) =>
      served.html.includes(PAGE_CUT_MARK),
    );
    const how = Option.match(Option.liftPredicate(servedCut, Boolean), {
      onNone: () => 'hydrated',
      onSome: () => 'rendered',
    });
    return Effect.raceFirst(
      page.until(`document.body.getAttribute('${PAGE_MOUNTED}') === '${how}'`, {
        now: `document.body.getAttribute('${PAGE_MOUNTED}')`,
        say: (now) => `the ${name} page was not ${how}: its body says it was mounted ${now}`,
      }),
      Deferred.await(failed),
    );
  });
  const going = page.goto(at.href ?? spec.home);
  if (at.mountedOnly === true) yield* Effect.forkScoped(going);
  else yield* going;
  yield* mounted;
  const open: OpenServed = {
    page,
    asked,
    errors: page.errors,
    read,
    documents,
    land: (href) => Effect.andThen(page.goto(href), mounted),
    reload: Effect.andThen(page.reload, mounted),
  };
  return open;
});
