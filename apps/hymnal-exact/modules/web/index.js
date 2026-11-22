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

/** One `native.later` call: the op's answer, or a refusal for an op no part names. */
export async function later(request) {
  const op = String(request?.op ?? '');
  const part = tuner[op];
  if (part === undefined) throw new Error(`Hymnal answers no op ${op}`);
  return part(request);
}
