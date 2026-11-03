import {
  Array as Arr,
  Context,
  Deferred,
  Effect,
  type FileSystem,
  Layer,
  Option,
  type Path,
  Result,
  Schema,
  String as Str,
} from 'effect';
import {
  Etag,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import * as NodeHttpCompression from '@effect/platform-node-shared/NodeHttpCompression';
import {
  type Refusal,
  Refusal as RefusalSchema,
  RequestInvalid,
  RequestRefused,
  RouteUnknown,
  ServerFailed,
  WriteNotJson,
  isRefusal,
  pageHref,
  pageAt,
  prefixesOf,
  statusOf,
} from '../core/api.ts';
import type * as HttpApi from 'effect/http-api/HttpApi';
import * as HttpApiError from 'effect/http-api/HttpApiError';
import type * as HttpApiGroup from 'effect/http-api/HttpApiGroup';
import { NetAddress } from 'effect/net';
import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import { BodyTooLarge } from '../core/refusals.ts';
import { STUDIO_MAX_BODY } from '../core/studio.ts';
import { urlPath } from './review-file.ts';

interface LabBound {
  readonly hostname?: string;
  readonly port?: number;
}

type LabHandler = (request: Request, server: LabBound) => Promise<Response>;

interface ConnectionService {
  readonly hostname: Option.Option<string>;
  readonly port: Option.Option<number>;
}

class Connection extends Context.Service<Connection, ConnectionService>()(
  '@manna/film/tools/Connection',
) {}

const connectionOf = (server: LabBound): ConnectionService => ({
  hostname: Option.fromUndefinedOr(server.hostname),
  port: Option.fromUndefinedOr(server.port),
});

const LOOPBACK: ReadonlyArray<string> = ['127.0.0.1', 'localhost'];
const OWN_FETCH: ReadonlyArray<string> = ['same-origin', 'none'];
const SAFE_METHODS: ReadonlyArray<string> = ['GET', 'HEAD'];

const header = (request: HttpServerRequest.HttpServerRequest, name: string) =>
  Option.fromUndefinedOr(request.headers[name]);

const hostOf = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrElse(
    Option.orElse(header(request, 'host'), () =>
      Option.map(Result.getSuccess(HttpServerRequest.toWebResult(request)), (web) =>
        Result.getOrElse(
          Result.try(() => new URL(web.url).host),
          () => '',
        ),
      ),
    ),
    () => '',
  );

const refused = (reason: string) => Option.some<Refusal>(RequestRefused.make({ reason }));

const isNavigation = (request: HttpServerRequest.HttpServerRequest) =>
  SAFE_METHODS.includes(request.method) &&
  Option.contains(header(request, 'sec-fetch-mode'), 'navigate') &&
  Option.contains(header(request, 'sec-fetch-dest'), 'document') &&
  (Option.isSome(pageAt(urlPath(request.url))) || urlPath(request.url) === pageHref.home());

const carriesBody = (request: HttpServerRequest.HttpServerRequest) =>
  request.method === 'POST' ||
  Option.isSome(header(request, 'transfer-encoding')) ||
  Option.exists(header(request, 'content-length'), (n) => Number(n) !== 0) ||
  Result.match(HttpServerRequest.toWebResult(request), {
    onFailure: () => true,
    onSuccess: (web) => Option.isSome(Option.fromNullishOr(web.body)),
  });

const hostName = (name: string) =>
  Option.match(Option.liftPredicate(name, Str.includes(':')), {
    onNone: () => name,
    onSome: (ipv6) => `[${ipv6}]`,
  });

const admit = (
  request: HttpServerRequest.HttpServerRequest,
  connection: ConnectionService,
): Option.Option<Refusal> =>
  Option.match(connection.port, {
    onNone: () => refused('the server has no port to check the Host against'),
    onSome: (port) => {
      const hosts = Arr.dedupe([...Option.toArray(connection.hostname), ...LOOPBACK]).map(
        (name) => `${hostName(name)}:${port}`,
      );
      const origins = hosts.map((h) => `http://${h}`);
      const host = hostOf(request);
      if (!hosts.includes(host))
        return refused(`Host ${host} is not the server's (${hosts.join(', ')})`);
      const site = header(request, 'sec-fetch-site');
      if (Option.exists(site, (s) => !OWN_FETCH.includes(s)) && !isNavigation(request))
        return refused(`a ${Option.getOrElse(site, () => '')} request`);
      if (SAFE_METHODS.includes(request.method)) return Option.none();
      const origin = header(request, 'origin');
      if (Option.exists(origin, (o) => !origins.includes(o)))
        return refused(`Origin ${Option.getOrElse(origin, () => '')} is not the server's`);
      if (!carriesBody(request)) return Option.none();
      const type = Option.getOrElse(
        Option.map(header(request, 'content-type'), (t) =>
          Arr.headNonEmpty(Str.split(t, ';')).trim().toLowerCase(),
        ),
        () => 'no body type',
      );
      if (type !== 'application/json') return Option.some(WriteNotJson.make({ type }));
      return Option.none();
    },
  });

const bounded = Effect.fn('api.bounded')(function* (request: HttpServerRequest.HttpServerRequest) {
  const tooLarge = BodyTooLarge.make({ limit: STUDIO_MAX_BODY });
  const web = HttpServerRequest.toWebResult(request);
  if (Result.isFailure(web)) return Option.none<Request>();
  const source = web.success;
  const declared = Option.map(header(request, 'content-length'), Number);
  if (Option.exists(declared, (n) => n > STUDIO_MAX_BODY)) return yield* tooLarge;
  const body = Option.fromNullishOr(source.body);
  if (Option.isNone(body)) return Option.none<Request>();
  const reader = body.value.getReader();
  const unreadable = (cause: unknown) =>
    ServerFailed.make({
      tag: 'BodyUnread',
      reason: `the request body could not be read: ${String(cause)}`,
    });
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  while (true) {
    const next = yield* Effect.tryPromise({ try: () => reader.read(), catch: unreadable });
    if (next.done) break;
    total += next.value.byteLength;
    if (total > STUDIO_MAX_BODY) {
      yield* Effect.tryPromise({ try: () => reader.cancel(), catch: unreadable }).pipe(
        Effect.ignore,
      );
      return yield* tooLarge;
    }
    chunks.push(next.value);
  }
  const whole = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  const headers = new Headers(source.headers);
  headers.delete('content-length');
  return Option.some(
    new Request(source.url, { method: source.method, headers, body: whole, signal: source.signal }),
  );
});

const encodeRefusal = Schema.encodeSync(RefusalSchema);

const answerRefused = (request: HttpServerRequest.HttpServerRequest, refusal: Refusal) =>
  Effect.logWarning(
    `api.request.refused method=${request.method} path=${urlPath(request.url)} status=${statusOf(refusal)} tag=${refusal._tag} reason="${refusal.message}"`,
  ).pipe(
    Effect.as(HttpServerResponse.jsonUnsafe(encodeRefusal(refusal), { status: statusOf(refusal) })),
  );

const REQUEST_PARTS: ReadonlyArray<string> = ['Params', 'Headers', 'Query', 'Payload'];

const decodedOrRefused = <E, R>(
  request: HttpServerRequest.HttpServerRequest,
  routes: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.catchDefect(routes, (defect) => {
    if (!HttpApiError.HttpApiSchemaError.is(defect)) return Effect.die(defect);
    const reason = defect.cause.message.replace(/\s*\n\s*/g, ' ');
    if (REQUEST_PARTS.includes(defect.kind))
      return answerRefused(request, RequestInvalid.make({ part: defect.kind, reason }));
    const failed = ServerFailed.make({
      tag: 'AnswerUnencoded',
      reason: `${defect.kind}: ${reason}`,
    });
    return Effect.logWarning(
      `api.request.failed method=${request.method} path=${urlPath(request.url)} status=${statusOf(failed)} tag=${failed.tag} reason="${failed.reason}"`,
    ).pipe(
      Effect.as(HttpServerResponse.jsonUnsafe(encodeRefusal(failed), { status: statusOf(failed) })),
    );
  });

class BodyRead extends Context.Service<BodyRead, { readonly limit: number }>()(
  '@manna/film/tools/BodyRead',
) {}

export const bodyAdmitted = Effect.map(Effect.serviceOption(BodyRead), Option.isSome);

const gate = (self: Deferred.Deferred<OwnHandler>) =>
  HttpRouter.middleware(
    (routes) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const connection = yield* Connection;
        const refusal = admit(request, connection);
        if (Option.isSome(refusal)) return yield* answerRefused(request, refusal.value);
        if (
          SAFE_METHODS.includes(request.method) ||
          Option.isSome(yield* Effect.serviceOption(BodyRead))
        )
          return yield* decodedOrRefused(request, routes);
        const whole = yield* Effect.result(bounded(request));
        if (Result.isFailure(whole)) return yield* answerRefused(request, whole.failure);
        if (Option.isNone(whole.success)) return yield* decodedOrRefused(request, routes);
        const read = whole.success.value;
        const handler = yield* Deferred.await(self);
        const response = yield* Effect.promise(() =>
          handler(
            read,
            Context.make(Connection, connection).pipe(
              Context.add(BodyRead, { limit: STUDIO_MAX_BODY }),
            ),
          ),
        );
        return HttpServerResponse.raw(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }),
    { global: true },
  );

const asRefusal = (error: { readonly _tag: string; readonly message: string }): Refusal => {
  if (isRefusal(error)) return error;
  return ServerFailed.make({ tag: error._tag, reason: error.message });
};

export const answered = <A, E extends { readonly _tag: string; readonly message: string }, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, Refusal, R> =>
  Effect.catch(self, (error) => {
    const refusal = asRefusal(error);
    return Effect.flatMap(Effect.serviceOption(HttpServerRequest.HttpServerRequest), (request) => {
      const asked = Option.match(request, {
        onNone: () => '',
        onSome: (r) => `method=${r.method} path=${urlPath(r.url)} `,
      });
      return Effect.logWarning(
        `api.request.failed ${asked}status=${statusOf(refusal)} tag=${error._tag} reason="${error.message}"`,
      );
    }).pipe(Effect.andThen(Effect.fail(refusal)));
  });

export class PageReads extends Context.Service<
  PageReads,
  { readonly read: (path: string) => Effect.Effect<Response> }
>()('@manna/film/tools/PageReads') {}

export type PageAnswer = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  | HttpServerRequest.HttpServerRequest
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
  | PageReads
>;

type OwnHandler = (request: Request, context: Context.Context<Connection>) => Promise<Response>;

const readsOf = (
  self: Deferred.Deferred<OwnHandler>,
  own: ReadonlyArray<string>,
  request: HttpServerRequest.HttpServerRequest,
  connection: ConnectionService,
): Context.Context<PageReads> =>
  Context.make(
    PageReads,
    PageReads.of({
      read: (path) => {
        const url = new URL(path, `http://${hostOf(request)}`);
        if (!own.some((prefix) => url.pathname.startsWith(prefix)))
          return Effect.map(
            answerRefused(
              HttpServerRequest.fromWeb(new Request(url)),
              RouteUnknown.make({ path: url.pathname }),
            ),
            (refusal) => HttpServerResponse.toWeb(refusal),
          );
        return Effect.flatMap(Deferred.await(self), (handler) =>
          Effect.promise((signal) =>
            handler(
              new Request(url, { headers: { accept: 'application/json' }, signal }),
              Context.make(Connection, connection),
            ),
          ),
        );
      },
    }),
  );

const PAGE_CODINGS: ReadonlyArray<HttpPlatform.CompressionAlgorithm> = ['br', 'gzip'];

const ACCEPT_MEMBER = /^([a-z0-9!#$%&'*+.^_`|~-]+)(?:;q=(0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?))?$/;

const acceptedOf = (header: string): Option.Option<ReadonlyMap<string, number>> =>
  Option.flatMap(
    Option.liftPredicate(header.trim(), (trimmed) => trimmed !== ''),
    (trimmed) =>
      Option.map(
        Option.all(
          trimmed
            .split(',')
            .filter((part) => part.trim() !== '')
            .map((part) =>
              Option.map(
                Option.fromNullishOr(
                  ACCEPT_MEMBER.exec(
                    part
                      .trim()
                      .toLowerCase()
                      .replace(/[ \t]*;[ \t]*/g, ';'),
                  ),
                ),
                ([, coding = '', weight]) =>
                  [
                    coding,
                    Option.match(Option.fromUndefinedOr(weight), {
                      onNone: () => 1,
                      onSome: Number,
                    }),
                  ] as const,
              ),
            ),
        ),
        (members) => new Map(members),
      ),
  );

export const pageCodingOf = (
  accept: Option.Option<string>,
): Option.Option<HttpPlatform.CompressionAlgorithm> =>
  Option.flatMap(Option.flatMap(accept, acceptedOf), (accepted) =>
    Arr.findFirst(PAGE_CODINGS, (coding) => (accepted.get(coding) ?? accepted.get('*') ?? 0) > 0),
  );

const varyWith = (vary: Option.Option<string>, dimension: string): string =>
  Option.match(vary, {
    onNone: () => dimension,
    onSome: (kept) => {
      const members = kept.split(',').map((member) => member.trim().toLowerCase());
      if (members.includes('*') || members.includes(dimension.toLowerCase())) return kept;
      return `${kept}, ${dimension}`;
    },
  });

const FLUSHED: HttpPlatform.Compression = (() => {
  const made = NodeHttpCompression.make(
    HttpPlatform.makeCompressionWeb({
      algorithms: PAGE_CODINGS,
      transform: NodeHttpCompression.compressTransformWeb,
    }),
  );
  return {
    algorithms: made.algorithms,
    compressResponse: (response, algorithm, options) =>
      Effect.map(made.compressResponse(response, algorithm, options), (compressed) => {
        if (compressed === response) return response;
        const vary = varyWith(
          Option.fromUndefinedOr(compressed.headers['vary']),
          'Accept-Encoding',
        );
        const etag = Option.filter(
          Option.fromUndefinedOr(compressed.headers['etag']),
          (tag) => !tag.startsWith('W/'),
        );
        return HttpServerResponse.setHeaders(compressed, {
          'content-encoding': algorithm,
          vary,
          ...Option.match(etag, { onNone: () => ({}), onSome: (tag) => ({ etag: `W/${tag}` }) }),
        });
      }),
  };
})();

const compressed = <E, R>(
  answer: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  platform: HttpPlatform.HttpPlatform['Service'],
) =>
  HttpMiddleware.compression({ algorithms: PAGE_CODINGS })(answer).pipe(
    Effect.provideService(HttpPlatform.HttpPlatform, { ...platform, compression: FLUSHED }),
  );

const pageRoute = (
  page: PageAnswer,
  own: ReadonlyArray<string>,
  self: Deferred.Deferred<OwnHandler>,
) =>
  HttpRouter.add(
    '*',
    '/*',
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const path = urlPath(request.url);
      if (own.some((prefix) => path.startsWith(prefix)))
        return yield* answerRefused(request, RouteUnknown.make({ path }));
      if (!SAFE_METHODS.includes(request.method))
        return HttpServerResponse.text('a page is only read', {
          status: 405,
          headers: { allow: SAFE_METHODS.join(', ') },
        });
      const reads = readsOf(self, own, request, yield* Connection);
      return yield* compressed(
        page.pipe(Effect.provideContext(reads)),
        yield* HttpPlatform.HttpPlatform,
      );
    }),
  );

type ServedBy = FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform;

export type BesideRoutes = Layer.Layer<never, never, HttpRouter.HttpRouter>;

export const serveApi = <
  Id extends string,
  Groups extends HttpApiGroup.Constraint,
  Needs extends HttpRouter.Request<
    'Requires' | 'Error' | 'GlobalRequires' | 'GlobalError',
    unknown
  >,
>(
  api: HttpApi.HttpApi<Id, Groups>,
  routes: Layer.Layer<never, never, HttpRouter.HttpRouter | Etag.Generator | ServedBy | Needs>,
  options: {
    readonly page: PageAnswer;
    readonly beside: BesideRoutes;
  },
) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<
      | ServedBy
      | HttpRouter.Request.Only<'Requires', Needs>
      | HttpRouter.Request.Only<'GlobalRequires', Needs>
    >();
    const self = yield* Deferred.make<OwnHandler>();
    const app = Layer.mergeAll(
      routes,
      options.beside,
      gate(self),
      pageRoute(options.page, prefixesOf(api), self),
    ).pipe(Layer.provide(Etag.layerWeak), Layer.provideMerge(Layer.succeedContext(services)));
    const web = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(app, { disableLogger: true })),
      (opened) => Effect.promise(() => opened.dispose()),
    );
    // oxlint-disable-next-line effect/noAs -- the handler's context is `Needs`' Requires and GlobalRequires markers, all in `services` above, over a generic `Needs` the checker cannot reduce to `Connection`
    const handler = web.handler as OwnHandler;
    yield* Deferred.succeed(self, handler);
    const own = prefixesOf(api);
    const answer: LabHandler = (request, server) => {
      const context = Context.make(Connection, connectionOf(server));
      if (
        request.method !== 'HEAD' ||
        !own.some((prefix) => new URL(request.url).pathname.startsWith(prefix))
      )
        return handler(request, context);
      const asked = new Request(request.url, {
        method: 'GET',
        headers: request.headers,
        signal: request.signal,
      });
      return handler(asked, context).then((response) => {
        Option.map(Option.fromNullishOr(response.body), (body) => body.cancel().catch(() => false));
        return new Response('', {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      });
    };

    return answer;
  });

const LAB_IDLE_SECONDS = 255;

export const MAX_REQUEST_BODY = STUDIO_MAX_BODY + 1024 * 1024;

export interface LabAt {
  readonly hostname: string;
  readonly port: number;
}

class LabUnbound extends Schema.TaggedError<LabUnbound>()('LabUnbound', {
  at: Schema.String,
  cause: Schema.String,
}) {
  override get message() {
    return `could not bind ${this.at}, no interface here has the address or the port is held: ${this.cause}`;
  }
}

export const labServer = (at: LabAt) =>
  Layer.effect(
    HttpServer.HttpServer,
    BunHttpServer.make({
      hostname: at.hostname,
      port: at.port,
      development: false,
      reusePort: false,
      idleTimeout: LAB_IDLE_SECONDS,
      maxRequestBodySize: MAX_REQUEST_BODY,
    }).pipe(
      Effect.catchDefect((cause) => Effect.fail(unboundAt(at, cause))),
      Effect.catchTag('ServeError', (error) => Effect.fail(unboundAt(at, error.cause))),
    ),
  );

const unboundAt = (at: LabAt, cause: unknown) =>
  LabUnbound.make({
    at: `${at.hostname.replace(/^(.*:.*)$/, '[$1]')}:${at.port}`,
    cause: String(cause),
  });

const boundOf = (address: NetAddress.SocketAddress): LabBound => {
  if (address._tag === 'UnixPathAddress') return {};
  return { hostname: address.address.toString(), port: address.port };
};

const LOCAL_BINDS: ReadonlyArray<string> = ['127.0.0.1', '[::1]', '0.0.0.0', '[::]'];

export const localLink = (bound: string): string => {
  const url = new URL(bound);
  if (LOCAL_BINDS.includes(url.hostname)) url.hostname = 'localhost';
  return url.href;
};

export const boundUrl = Effect.map(
  HttpServer.HttpServer,
  (server) => `${NetAddress.formatUrlUnsafe(server.address)}/`,
);

export const serveLab = Effect.fn('lab.serve')(function* (handler: LabHandler) {
  const server = yield* HttpServer.HttpServer;
  const bound = boundOf(server.address);
  yield* server.serve(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const web = yield* Effect.fromResult(HttpServerRequest.toWebResult(request));
      const response = yield* Effect.promise(() => handler(web, bound));
      return HttpServerResponse.raw(response);
    }),
  );
  return `${NetAddress.formatUrlUnsafe(server.address)}/`;
});
