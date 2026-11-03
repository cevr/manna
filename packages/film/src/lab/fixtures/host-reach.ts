import { SourceMap } from 'node:module';
import { Array as Arr, Option, Predicate, Schema } from 'effect';

const PREFIX = '[host-reach] ';

const Frame = Schema.Struct({ url: Schema.String, line: Schema.Finite, col: Schema.Finite });
type Frame = typeof Frame.Type;

const Told = Schema.Struct({ api: Schema.String, frames: Schema.Array(Frame) });
type Told = typeof Told.Type;

export const toldOf = (text: string): Option.Option<Told> =>
  Option.flatMap(
    Option.liftPredicate(text, (line) => line.startsWith(PREFIX)),
    (line) => Schema.decodeOption(Schema.fromJsonString(Told))(line.slice(PREFIX.length)),
  );

const Payload = Schema.Struct({
  version: Schema.Finite,
  sources: Schema.Array(Schema.String),
  names: Schema.Array(Schema.String),
  mappings: Schema.String,
});

const INLINE = /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/;

export const mapOf = (body: Uint8Array | string): Option.Option<SourceMap> => {
  const encoded = Option.flatMap(
    Option.flatMap(Option.liftPredicate(body, Predicate.isString), (text) =>
      Option.fromNullishOr(INLINE.exec(text)),
    ),
    (m) => Option.fromUndefinedOr(m[1]),
  );
  return Option.flatMap(encoded, (base64) =>
    Option.flatMap(
      Schema.decodeOption(Schema.fromJsonString(Payload))(
        Buffer.from(base64, 'base64').toString('utf8'),
      ),
      (payload) =>
        Option.liftThrowable(
          () =>
            new SourceMap({
              file: '',
              sourceRoot: '',
              sourcesContent: [],
              version: payload.version,
              mappings: payload.mappings,
              sources: [...payload.sources],
              names: [...payload.names],
            }),
        )(),
    ),
  );
};

const FILM_SRC = 'src/';
const OWNERS: ReadonlyArray<string> = ['src/browser/', 'src/lab/fixtures/'];

const sourceOf = (
  frames: ReadonlyArray<Frame>,
  maps: (url: string) => Option.Option<SourceMap>,
): Option.Option<string> =>
  Arr.findFirst(frames, (frame) =>
    Option.flatMap(maps(frame.url), (map) => {
      const entry: object = map.findEntry(frame.line - 1, frame.col - 1);
      return Option.filter(
        Option.fromUndefinedOr<unknown>(Reflect.get(entry, 'originalSource')),
        Predicate.isString,
      );
    }),
  );

const refused = (source: string): boolean =>
  source.startsWith(FILM_SRC) && !OWNERS.some((owner) => source.startsWith(owner));

export const failureOf = (
  told: Told,
  maps: (url: string) => Option.Option<SourceMap>,
): Option.Option<string> =>
  Option.flatMap(Option.filter(sourceOf(told.frames, maps), refused), (source) =>
    Option.some(`host reach: ${told.api} from ${source}`),
  );

export const HOST_REACH = `(() => {
  const PREFIX = '${PREFIX}';
  const ON_HOST = new Set(['popstate', 'hashchange', 'keydown', 'keyup', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']);
  const PRESS_END = new Set(['pointerup', 'pointercancel', 'lostpointercapture']);
  const FRAME = /(https?:\\/\\/[^\\s()]+?):(\\d+):(\\d+)/;
  const tell = (api) => {
    const frames = [];
    for (const line of String(new Error().stack).split('\\n').slice(1)) {
      const m = FRAME.exec(line);
      if (m) frames.push({ url: m[1], line: Number(m[2]), col: Number(m[3]) });
      if (frames.length >= 6) break;
    }
    console.debug(PREFIX + JSON.stringify({ api, frames }));
  };
  const wrap = (proto, name, when) => {
    if (!proto) return;
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (!d || typeof d.value !== 'function') return;
    const original = d.value;
    Object.defineProperty(proto, name, {
      ...d,
      value: function (...args) {
        const api = when(this, args);
        if (api) tell(api);
        return original.apply(this, args);
      },
    });
  };
  const always = (api) => () => api;
  // The host is the window and the document, and the body and root element, which hear the window's navigation and every key.
  const isHost = (target) => target === window || target === document || target === document.body || target === document.documentElement;
  wrap(EventTarget.prototype, 'addEventListener', (self, [type]) => {
    if (PRESS_END.has(type)) return 'addEventListener(' + type + ')';
    if (isHost(self) && ON_HOST.has(type)) return 'addEventListener(' + type + ') on the host';
    return '';
  });
  // The same reach by a handler property: \`window.onkeydown = h\` listens as addEventListener does.
  const wrapSetter = (target, type) => {
    const name = 'on' + type;
    const d = Object.getOwnPropertyDescriptor(target, name);
    if (!d || typeof d.set !== 'function') return;
    const set = d.set;
    Object.defineProperty(target, name, {
      ...d,
      set: function (handler) {
        if (PRESS_END.has(type)) tell(name);
        else if (isHost(this) && ON_HOST.has(type)) tell(name + ' on the host');
        return set.call(this, handler);
      },
    });
  };
  // The body and a frameset have the window's event handlers (\`onpopstate\`, \`onhashchange\`) of their own.
  for (const type of ON_HOST)
    for (const target of [window, Document.prototype, HTMLElement.prototype, SVGElement.prototype, HTMLBodyElement.prototype, HTMLFrameSetElement.prototype])
      wrapSetter(target, type);
  wrap(Element.prototype, 'setPointerCapture', always('setPointerCapture'));
  wrap(Element.prototype, 'releasePointerCapture', always('releasePointerCapture'));
  for (const name of ['pushState', 'replaceState', 'go', 'back', 'forward'])
    wrap(History.prototype, name, always('history.' + name));
  if (typeof Navigation === 'function')
    for (const name of ['navigate', 'back', 'forward', 'traverseTo', 'reload', 'updateCurrentEntry'])
      wrap(Navigation.prototype, name, always('navigation.' + name));
})();`;
