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
}

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
    pinchHeld.set(e.element, mine);
    e.diagnostics.log(`built on <${e.element.localName}>, ${mine.enabled ? 'on' : 'off'}`);
  },
  elementEnded(e) {
    const held = pinchHeld.get(e.element);
    if (held === undefined) return;
    held.track('cancel', [], 0, false);
    for (const [type, listener] of held.listeners) e.element.removeEventListener(type, listener);
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

/** One `native.later` call: the op's answer, or a refusal for an op no part names. */
export async function later(request) {
  const op = String(request?.op ?? '');
  const part = tuner[op] ?? pinch[op];
  if (part === undefined) throw new Error(`Hymnal answers no op ${op}`);
  return part(request);
}
