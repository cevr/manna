/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noTernary, effect/noAsyncFunction, effect/noGlobals -- the page's module (host/web/native-glue.js) imports no effect: it answers a Promise, a refused op is its rejection, and its timer and clock are the page's. */

/**
 * The page the module is connected to: its topic's `changed`, whether the
 * agent drives it, and its clock (the agent's under the agent).
 */
let host = { changed: () => {}, agent: false, now: () => performance.now() };

/**
 * The hymnal's app module on the page (Exact's `native.later`,
 * host/web/native-glue.js): each op goes to the part its prefix names, as
 * modules/apple/Hymnal.swift does. The tuner's ear (`tuner.`) hears on the
 * web only under the agent, as the current hymnal's web has no tuner: there
 * a fed tone's frames are counted on the agent's clock (`now()`) at the
 * rate the data module names, and the data module makes each one (the
 * current app's `feedFrame`); the screen is told `tuner` changed on the
 * wall's time, each frame's length, so a moved clock is heard. Off the
 * agent `tuner.ear` says no ear, and the three ways in do not show.
 */
export function connect({ changed, agent, now }) {
  host = { changed, agent, now };
  savedHere()
    .then((saved) => saved && readAppURL())
    .catch(() => {});
}

/**
 * Exact's file that turns an `app:/` source into something the audio
 * element plays (`picker-glue.js`'s `appURL`, `host/web/glue.js`'s
 * `picker`), beside the page's script; the file store it opens
 * (`storage-environment.js`, `storage-fs.js`) the page has read at launch.
 * Exact fetches it on the first such source, and it carries no digest in
 * its name, so the host serves it to be asked again (`tools/web/serve.ts`):
 * a reader who goes offline before that first Play gets no saved recording,
 * the bar loading for ever. Read once, it stays in the page's module map,
 * so a saved recording plays with no network, as One's web, whose bundle
 * holds its OPFS reader (`apps/hymnal/src/offline/media.ts`), does. A page
 * that cannot read it is left to Exact's own load on first use.
 */
const readAppURL = () => {
  const read = import(new URL('../picker-glue.js', import.meta.url).href);
  read.catch(() => {});
};

/** The saved recordings' folder, the data module's store's `ROOT` (`src/offline/store.ts`). */
export const RECORDINGS = 'app:/data/recordings';

/**
 * Whether `readdir` (a file store's) finds a saved recording: an `.mp3` in
 * a folder under `RECORDINGS`, as the store publishes one; a part file
 * still downloading is none. A folder that cannot be read holds none.
 */
export async function holdsSaved(readdir) {
  const inAny = async ([folder, ...rest]) => {
    if (folder === undefined) return false;
    const names = await readdir(`${RECORDINGS}/${folder}`).catch(() => []);
    return names.some((name) => name.endsWith('.mp3')) || inAny(rest);
  };
  return inAny(await readdir(RECORDINGS).catch(() => []));
}

/**
 * Whether this browser holds a saved recording, read once as the page
 * module connects from the app's own file store, the one the data module
 * saves into (Exact's `storage-environment.js` `storageKey` and
 * `storage-fs.js` `createFileStore`, which the page has read at launch, so
 * their import asks nothing more): a page that saved none, or deleted every
 * one, never reads `picker-glue.js` before it needs it. A page whose store
 * cannot open holds none.
 */
const savedHere = async () => {
  const environment = import(new URL('../storage-environment.js', import.meta.url).href);
  const store = await environment
    .then(({ storageKey }) => {
      const key = storageKey(globalThis.exact?.compat?.inputs?.app);
      if (key == null) return null;
      const fs = import(new URL('../storage-fs.js', import.meta.url).href);
      return fs.then(({ createFileStore }) => createFileStore(key));
    })
    .catch(() => null);
  if (store === null) return false;
  const saved = await holdsSaved((path) => store.readdir(path));
  store.close();
  return saved;
};

/**
 * The saved recordings' op: `recordings.saved`, sent by the data module
 * once a launch when its store first holds a saved file
 * (`src/offline/sources.ts`), reads `picker-glue.js` now, so a recording
 * saved in this launch plays offline before the next.
 */
const recordings = {
  'recordings.saved': () => {
    readAppURL();
    return { read: true };
  },
};

/** The ear as it stands: listening or not, its feed's rate and frame, when it started, its ends. */
const ear = {
  listening: false,
  rate: 0,
  frame: 2048,
  from: 0,
  ends: 0,
  timer: null,
};

/** Tells the page `tuner` changed, and again each frame's length while listening. */
const tell = () => {
  if (!ear.listening) return;
  host.changed('tuner');
  ear.timer = setTimeout(tell, (ear.frame / ear.rate) * 1000);
};

const stop = () => {
  ear.listening = false;
  if (ear.timer !== null) clearTimeout(ear.timer);
  ear.timer = null;
};

/** The tuner's ops, by name. */
const tuner = {
  'tuner.ear': () => ({ ear: host.agent }),
  'tuner.listen': (request) => {
    if (!host.agent) throw new Error('the web has no ear');
    stop();
    ear.rate = Number(request.feedRate) || 0;
    ear.frame = Number(request.frame) || 2048;
    ear.from = host.now();
    ear.listening = ear.rate > 0;
    tell();
    return { rate: ear.rate, ends: ear.ends };
  },
  'tuner.take': () => ({
    fed: ear.listening ? Math.floor((((host.now() - ear.from) / 1000) * ear.rate) / ear.frame) : 0,
    ends: ear.ends,
    ended: '',
  }),
  'tuner.stop': () => {
    stop();
    return { ends: ear.ends };
  },
};

/** The most reports the pinch keeps for a take: far more than one gesture sends between two takes. */
const PINCH_KEPT = 256;

/**
 * The pinch's reports as the home list's step reads them (`src/pinch/run.ts`),
 * each with its serial: `b` a gesture began, `m <scale>` its fingers moved,
 * `e <scale> <velocity>` they lifted (velocity in scale per second), `c` it
 * was cancelled. Each report says the topic `pinch` changed.
 */
const pinchLog = { serial: 0, reports: [] };

/** Records one report and tells the page. */
const pinchReport = (word) => {
  pinchLog.serial += 1;
  pinchLog.reports = [...pinchLog.reports.slice(1 - PINCH_KEPT), { serial: pinchLog.serial, word }];
  host.changed('pinch');
};

/** The distance between a touch's two points. */
const spread = ([a, b]) => Math.hypot(b.x - a.x, b.y - a.y);

/** A number as a report carries it: short, and never `-0`. */
const said = (n) => String(Math.round(n * 10000) / 10000 || 0);

/**
 * A two-finger gesture's tracker, fed each touch as `(kind, points, time,
 * enabled)`: `kind` the touch's phase (`start`, `move`, `end`, `cancel`),
 * `points` the fingers down after it, `time` its time in milliseconds. Two
 * fingers down begin a gesture whose scale is their spread over the spread
 * they began at; each move reports its scale; a finger lifted ends it with
 * the speed between its last two samples, the begin counted as one at scale
 * 1 (UIKit's pinch's `velocity`, scale per second; 0 with no move); the touch cancelled, a third finger or
 * the node turned off cancels it. One finger reports nothing, so a scroll
 * is left alone. It answers the report it makes, or "" with none.
 */
export function pinchTracker(report = pinchReport) {
  let from = 0;
  let last = { scale: 1, time: 0 };
  let before = last;
  let moves = 0;
  return (kind, points, time, enabled) => {
    const say = (word) => {
      report(word);
      return word;
    };
    if (from > 0) {
      if (!enabled || kind === 'cancel' || points.length > 2) {
        from = 0;
        return say('c');
      }
      if (points.length < 2) {
        from = 0;
        const span = (last.time - before.time) / 1000;
        const velocity = moves > 0 && span > 0 ? (last.scale - before.scale) / span : 0;
        return say(`e ${said(last.scale)} ${said(velocity)}`);
      }
      if (kind !== 'move') return '';
      before = last;
      last = { scale: spread(points) / from, time };
      moves += 1;
      return say(`m ${said(last.scale)}`);
    }
    if (!enabled || points.length !== 2 || kind === 'end' || kind === 'cancel') return '';
    const at = spread(points);
    if (!(at > 0)) return '';
    from = at;
    last = { scale: 1, time };
    before = last;
    moves = 0;
    return say('b');
  };
}

/** The pinch hatch's touch listeners and its tracker, by the node's element. */
const pinchHeld = new WeakMap();

/** The fingers down, as points. */
const pointsOf = (event) => Array.from(event.touches, (t) => ({ x: t.clientX, y: t.clientY }));

/**
 * The `pinch` hatch on the home list's column (`features/list.contract`):
 * two fingers on it are tracked as `pinchTracker` says, while its
 * `data-pinchable` is `on` (the step's `pinchable`, `features/find.contract`).
 * Its listeners are passive: a one-finger scroll and a tap are the page's.
 * It sets the node's `touch-action` to `pan-x pan-y` while it lives, so a
 * pinch there zooms the list to its tiles and never the browser's page, as
 * no pinch zooms the current app's screen; its end puts back what was there.
 */
const pinchHatch = {
  element(e) {
    const held = pinchHeld.get(e.element);
    if (held !== undefined) {
      held.enabled = e.data.pinchable === 'on';
      if (!held.enabled) held.track('cancel', [], 0, false);
      return;
    }
    const mine = { enabled: e.data.pinchable === 'on', track: pinchTracker(), listeners: [] };
    for (const [type, kind] of [
      ['touchstart', 'start'],
      ['touchmove', 'move'],
      ['touchend', 'end'],
      ['touchcancel', 'cancel'],
    ]) {
      const listener = (event) => mine.track(kind, pointsOf(event), event.timeStamp, mine.enabled);
      e.element.addEventListener(type, listener, { passive: true });
      mine.listeners.push([type, listener]);
    }
    mine.touchAction = e.element.style.touchAction;
    e.element.style.touchAction = 'pan-x pan-y';
    pinchHeld.set(e.element, mine);
    e.diagnostics.log(`built on <${e.element.localName}>, ${mine.enabled ? 'on' : 'off'}`);
  },
  elementEnded(e) {
    const held = pinchHeld.get(e.element);
    if (held === undefined) return;
    held.track('cancel', [], 0, false);
    for (const [type, listener] of held.listeners) e.element.removeEventListener(type, listener);
    e.element.style.touchAction = held.touchAction;
    pinchHeld.delete(e.element);
  },
};

/** The page module's hatches, by word. */
const hatches = { pinch: pinchHatch };

/** A hatched node mounted, or its `data-*` words changed. */
export function element(e) {
  hatches[e.hatch]?.element(e);
}

/** A hatched node is leaving: its hatch takes back what it added. */
export function elementEnded(e) {
  hatches[e.hatch]?.elementEnded(e);
}

/** The pinch's ops: `pinch.take { since }` answers the serial so far and the reports after `since`, `;`-joined. */
const pinch = {
  'pinch.take': (request) => {
    const since = Number(request.since) || 0;
    return {
      serial: pinchLog.serial,
      run: pinchLog.reports
        .filter((r) => r.serial > since)
        .map((r) => r.word)
        .join(';'),
    };
  },
};

/** The saved recordings' backup mark: the web has no device backup, so nothing is marked, as the current hymnal's `offline/backup.ts` marks nothing off iOS. */
const backup = {
  'backup.exclude': () => ({ excluded: false }),
};

/**
 * The Feel's voice: the web holds none, as the current hymnal's web has no
 * voice (`feel/native.ts`): it loads and plays nothing and fetches no
 * sound, so the page sends none (`features/feel.contract`). Under the
 * agent it says it holds every sound named, so a drive reads what would be
 * sent, and still plays none.
 */
const feel = {
  'feel.load': (request) => ({
    loaded: host.agent
      ? String(request.names ?? '')
          .split(' ')
          .filter(Boolean).length
      : 0,
  }),
  'feel.play': () => ({ played: false }),
};

/** How often each hymn's timing file was asked for: a read after a refused one imports it afresh. */
const timingTries = new Map();

/**
 * The timing's op: `timing.read { n }` answers hymn `n`'s whole timing
 * string, `text`, its words' syllable times kept, from the module the web
 * build ships beside this one (`timing/<n>.js`, written by
 * `tools/timing.ts`; the development host serves only `.js` files here, the
 * built site the whole folder), imported the first time the data module
 * asks (`src/timing/sources.ts`), as the iOS app reads its file. A hymn with
 * no such file is refused. The browser keeps a failed import by its
 * address, so each later try asks a new one.
 */
const timing = {
  'timing.read': async (request) => {
    const n = Number(request.n);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`no hymn ${request.n}`);
    const tries = timingTries.get(n) ?? 0;
    timingTries.set(n, tries + 1);
    const url = new URL(`./timing/${n}.js`, import.meta.url);
    if (tries > 0) url.searchParams.set('try', String(tries));
    const file = await import(url.href);
    if (file.default === undefined) throw new Error(`hymn ${n} ships no timing`);
    return { text: String(file.default) };
  },
};

/**
 * The page's own copy of each shipped file it has read, by the file's
 * address, in the page's Cache Storage (`hymnal-shipped`): the files carry
 * no digest in their names, so the host serves them to be asked again
 * (`tools/web/serve.ts`), and offline that ask fails. A read whose import
 * fails answers the copy, so a hymn read once still draws its chords with
 * no network, as One's web, whose bundle holds every hymn's chords, does.
 * A page with no Cache Storage, or one that refuses a write, keeps none.
 */
const shippedKept = {
  keep: (address, text) =>
    globalThis.caches
      ?.open('hymnal-shipped')
      .then((cache) => cache.put(address, new Response(text)))
      .catch(() => {}),
  read: async (address) => {
    if (globalThis.caches === undefined) return undefined;
    return globalThis.caches
      .open('hymnal-shipped')
      .then((cache) => cache.match(address))
      .then((kept) => kept?.text())
      .catch(() => undefined);
  },
};

/** How often each shipped file was asked for, by its address: a read after a refused one imports it afresh. */
const shippedTries = new Map();

/**
 * The shipped folders' ops (`src/shipped/load.ts`): `<folder>.read { n }`
 * answers the text of the file `n` the web build ships beside this module
 * (`<folder>/<n>.js`, written by `src/shipped/files.ts`), imported the
 * first time the data module asks, as the iOS app reads its file
 * (`bundle:/Resources/<folder>/<n>`), and kept (`shippedKept`). A name that
 * is no plain word is refused, and so is a file that is not there and was
 * never kept; the browser keeps a failed import by its address, so each
 * later try asks a new one.
 */
const shipped = Object.fromEntries(
  ['chords', 'indexes'].map((folder) => [
    `${folder}.read`,
    async (request) => {
      const n = String(request.n ?? '');
      if (!/^[a-z0-9]+$/.test(n)) throw new Error(`no ${folder} file ${request.n}`);
      const path = `./${folder}/${n}.js`;
      const tries = shippedTries.get(path) ?? 0;
      shippedTries.set(path, tries + 1);
      const address = new URL(path, import.meta.url).href;
      const url = new URL(path, import.meta.url);
      if (tries > 0) url.searchParams.set('try', String(tries));
      const imported = import(url.href);
      const file = await imported.catch((failed) =>
        shippedKept.read(address).then((text) => {
          if (text === undefined) throw failed;
          return { default: text, kept: true };
        }),
      );
      if (file.default === undefined) throw new Error(`no ${folder} file ${n}`);
      const text = String(file.default);
      if (file.kept !== true) void shippedKept.keep(address, text);
      return { text };
    },
  ]),
);

/** One `native.later` call: the op's answer, or a refusal for an op no part names. */
export async function later(request) {
  const op = String(request?.op ?? '');
  const part =
    tuner[op] ?? backup[op] ?? pinch[op] ?? timing[op] ?? shipped[op] ?? feel[op] ?? recordings[op];
  if (part === undefined) throw new Error(`Hymnal answers no op ${op}`);
  return part(request);
}
