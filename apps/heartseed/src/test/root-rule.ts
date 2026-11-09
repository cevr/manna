/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction -- the frame rule reads happy-dom nodes whose absent attributes are null; a rig's launch is promise-based, and a rig that added no host cannot be watched, which stops its case. */

/** Text as a reader sees it: whitespace collapsed. */
const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A control's name: its label, else its text. */
const nameOf = (node: Element) => node.getAttribute('aria-label') ?? text(node);

/** Whether `node` lies inside a scroll view: an ancestor that scrolls its overflow. */
const scrolled = (node: Element) => {
  for (let at = node.parentElement; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (/auto|scroll/.test(`${style.overflowY} ${style.overflow}`)) return true;
  }
  return false;
};

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"],[role="link"]';

/** The first minute's headings, whose screen holds a recital, a summary and a stage of its own. */
const FIRST = new Set(['Hear it', 'Say it with help', 'Say it alone', 'Planted']);

/** The screens on which `Your field` is a way back besides Today and When I need…. */
const BACKS = new Set(['Add a passage', 'About']);

/** Home's own nodes, by test id. */
export const HOME_NODES = [
  'greeting',
  'sown',
  'harvest',
  'row',
  'field-plant',
  'foot',
  'begin-card',
  'chosen',
];

/** Today's own nodes, by test id, beside its action button. */
const TODAY_NODES = ['session', 'summary', 'stage'];

/** Today's action button's names. */
const ACTIONS = new Set(['Say it', 'Next', 'Listening']);

const ids = (host: Element, list: readonly string[]) =>
  list.filter((id) => host.querySelector(`[data-testid="${id}"]`) !== null);

/** What the pending frame shows wrong: a control, or any node of its own but the reference. */
const pendingFaults = (host: Element, controls: readonly Element[]) => {
  const out: string[] = [];
  if (controls.length > 0) out.push(`the pending frame with ${controls.map(nameOf).join('|')}`);
  const references = host.querySelectorAll('[data-testid="reference"]');
  const others = [...host.querySelectorAll('[data-testid]')].filter(
    (node) => node.getAttribute('data-testid') !== 'reference',
  );
  if (references.length !== 1) out.push(`the pending frame with ${references.length} references`);
  if (others.length > 0)
    out.push(
      `the pending frame with ${[...new Set(others.map((node) => node.getAttribute('data-testid')))].join('|')}`,
    );
  if (text(host) !== text(references[0]))
    out.push('the pending frame with more than its reference');
  return out;
};

/** What `Your field` shows wrong on the screen `on`: off its screens, on an unread garden, on Today while listening, missing from Today or When I need…, not one, or in a scroll view. */
const backFaults = (
  on: string,
  garden: 'read' | 'unread',
  backs: readonly Element[],
  listening: boolean,
) => {
  const out: string[] = [];
  const offered = backs.length > 0;
  const allowed = on === 'Today' || on === 'When I need…' || BACKS.has(on);
  if (offered && !allowed) out.push(`Your field on ${on}`);
  if (offered && garden === 'unread') out.push(`Your field on an unread garden (${on})`);
  if (on === 'Today' && offered && listening) out.push('Your field on Today while listening');
  const owed = on === 'When I need…' || (on === 'Today' && garden === 'read' && !listening);
  if (owed && !offered) out.push(`no Your field on ${on}`);
  if (backs.length > 1) out.push(`${backs.length} Your field controls on ${on}`);
  if (backs.some(scrolled)) out.push(`Your field inside a scroll view on ${on}`);
  return out;
};

/** What the gear `Settings` shows wrong on the screen `on`: not exactly one on home, any on another screen, or one inside a scroll view. */
const settingsFaults = (on: string, gears: readonly Element[]) => {
  const out: string[] = [];
  if (on === 'Your field' && gears.length !== 1)
    out.push(`${gears.length} Settings controls on Your field`);
  if (on !== 'Your field' && gears.length > 0) out.push(`Settings on ${on}`);
  if (gears.some(scrolled)) out.push('Settings inside a scroll view');
  return out;
};

const CHOICE_NAME = /^(\d+ min|Voice)$/;

/** What the reader's choices show wrong on the screen `on`: a `Minutes` group, an `<n> min` control or a `Voice` control under the host, on every screen. */
const choicesFaults = (on: string, host: Element, controls: readonly Element[]) => {
  const groups = [...host.querySelectorAll('[role="radiogroup"][aria-label="Minutes"]')];
  const choices = controls.filter((node) => CHOICE_NAME.test(nameOf(node)));
  return [...groups, ...choices].map((node) => `${nameOf(node)} on ${on}`);
};

/**
 * The root's frame rule (hshomeroot), for every rig that mounts the root:
 * what one frame shows wrong, `garden` being whether the launch's garden
 * read completes. A frame shows one screen, by its one heading, or the
 * pending frame (no heading), which holds the reference alone. `Your field`
 * is a way back from Today (on a read garden while nothing listens, and then
 * always), When I need… (its one back), the chooser's `Add a passage` and
 * About, never in a scroll view, and nowhere else: never on home, never on
 * an unread garden (`backFaults`). `Listening`, Today's action and Today's
 * nodes show only on Today (or in the first minute, whose recitals are its
 * own), home's nodes only on home, `When I need…` only on home outside the
 * scroll view, exactly one `Settings` on home outside the scroll view and
 * none elsewhere (`settingsFaults`), no `Minutes` group, `<n> min` or
 * `Voice` on any screen (`choicesFaults`), and no screen has a control named `Today`. The
 * Settings sheet lies outside the host, so its nodes are the sheet rule's
 * (`settings-rig.ts`).
 */
export const rootFaults = (host: Element, garden: 'read' | 'unread'): string[] => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  const controls = [...host.querySelectorAll(CONTROLS)];
  if (headings.length === 0) return pendingFaults(host, controls);
  const out: string[] = [];
  if (headings.length > 1) out.push(`the headings ${headings.join('|')}`);
  const on = headings[0] ?? '';
  const named = (name: string) => controls.filter((node) => nameOf(node) === name);
  const listening = named('Listening').length > 0;
  out.push(...backFaults(on, garden, named('Your field'), listening));
  const today = on === 'Today' || FIRST.has(on);
  for (const node of controls)
    if (ACTIONS.has(nameOf(node)) && !today) out.push(`${nameOf(node)} on ${on}`);
  for (const id of ids(host, TODAY_NODES)) if (!today) out.push(`Today's ${id} on ${on}`);
  if (named('Today').length > 0) out.push(`a control named Today on ${on}`);
  const needs = named('When I need…');
  if (needs.length > 0 && on !== 'Your field') out.push(`When I need… on ${on}`);
  if (needs.some(scrolled)) out.push('When I need… inside a scroll view');
  for (const id of ids(host, HOME_NODES))
    if (on !== 'Your field') out.push(`home's ${id} on ${on}`);
  out.push(...settingsFaults(on, named('Settings')));
  out.push(...choicesFaults(on, host, controls));
  return out;
};

/**
 * Holds every frame (each DOM mutation batch) under `host` to `rootFaults`,
 * keeping each fault once, at most 8, with the frame's heading. A frame that
 * draws nothing (before the first render) is no frame. `stop` ends the
 * watch before the launch's unmount.
 */
export const watchRoot = (host: Element, garden: 'read' | 'unread') => {
  const faults: string[] = [];
  const seen = new Set<string>();
  const frames: { headings: string[]; counts: string; listening: boolean }[] = [];
  const frame = () => {
    if (text(host) === '' && host.querySelector('[role]') === null) return;
    const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
    frames.push({
      headings,
      counts: text(host.querySelector('[data-testid="counts"]')),
      listening: [...host.querySelectorAll(CONTROLS)].some((node) => nameOf(node) === 'Listening'),
    });
    for (const fault of rootFaults(host, garden)) {
      if (faults.length >= 8 || seen.has(fault)) continue;
      seen.add(fault);
      faults.push(`${fault} (frame ${frames.length}: ${headings.join('|') || 'pending'})`);
    }
  };
  const watch = new MutationObserver(frame);
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  return { faults, frames, stop: () => watch.disconnect() };
};

/** The screens a launch's frames showed, in order, by heading (`pending` for none), repeats collapsed. */
export const screensOf = (frames: readonly { readonly headings: readonly string[] }[]) =>
  frames
    .map((frame) => frame.headings.join('|') || 'pending')
    .filter((each, index, all) => each !== all[index - 1]);

/** The host a rig adds and the watch over it, once added. */
interface Added {
  host?: Element;
  watch?: ReturnType<typeof watchRoot>;
}

/**
 * A rig's launch (`start`) with every frame of its host held to the root's
 * rule (`watchRoot`): the host is the element the rig adds to the
 * document's body, watched from the turn it is added, before the root's
 * first render. It answers the rig's launch, the host, the watch, what the
 * host shows (home with its counts, Today, the reference, the counts), and
 * `end`, which stops the watch, then leaves.
 */
export const watchedLaunch = async <App extends { readonly leave: () => Promise<unknown> }>(
  garden: 'read' | 'unread',
  start: () => Promise<App>,
) => {
  const added: Added = {};
  const found = new MutationObserver((records) => {
    const node = records
      .flatMap((each) => [...each.addedNodes])
      .find((each) => each instanceof Element);
    if (!(node instanceof Element) || added.host !== undefined) return;
    added.host = node;
    added.watch = watchRoot(node, garden);
    found.disconnect();
  });
  found.observe(document.body, { childList: true });
  const app = await start();
  found.disconnect();
  const { host, watch } = added;
  if (host === undefined || watch === undefined) throw new Error('the rig added no host');
  const headings = () => [...host.querySelectorAll('[role="heading"]')].map(text).join('|');
  const counts = () => text(host.querySelector('[data-testid="counts"]'));
  return {
    app,
    host,
    watch,
    counts,
    home: () => headings() === 'Your field' && counts() !== '',
    today: () => headings() === 'Today',
    reference: () => text(host.querySelector('[data-testid="reference"]')),
    end: () => {
      watch.stop();
      return app.leave();
    },
  };
};
