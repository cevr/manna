/* oxlint-disable effect/noNullish, effect/noAsyncFunction, effect/noThrowStatement, effect/noNewError -- the Settings sheet's rig: it reads happy-dom's whole document, whose absent nodes and attributes are null, drives the sheet through React's promise-based `act`, and stops a case whose sheet never became active. */

/**
 * Home's Settings sheet as a reader and a screen reader meet it, for any
 * rig that mounts the root (`{ host, until }`). The sheet is a `Modal`,
 * which react-native-web draws in a portal outside the rig's host, so this
 * rig reads the whole document.
 *
 * `sheetFaults` is the sheet's frame rule. While a sheet is open the
 * document holds one modal (`[aria-modal]`) and in it: one `settings`
 * root, one heading `Settings`, `Done` outside its scroll view, the
 * `Minutes` and `Appearance` groups once each in the whole document (each
 * once its choice is read), their radios in order with one checked, at most
 * one `Voice` of the pill's form, the parts in the sheet's order, every
 * control at least 44 tall, the root's look (`lookFaults`, from the root
 * down: react-native-web's own white container lies outside it), and no
 * node of home's, with home's heading alone under it. While closed, no
 * modal and no heading `Settings` anywhere.
 *
 * Happy-dom runs no CSS animation, so react-native-web never learns that
 * the slide-in ended, and its dialog stays inactive (no role, Escape
 * ignored); `openSettings` plays that end (`animationend` on the node its
 * `ModalAnimation` draws) and fails loudly when the dialog does not become
 * active.
 */

import { act } from 'react';

import type { Scheme } from '../theme';
import { lookFaults, systemScheme } from './look';
import { HOME_NODES } from './root-rule';
import { choicesOf, MINUTE_NAMES, scrolled, text } from './session-rig';

/** A rig that mounts the root: its host and its wait on the host's clock. */
export interface Rig {
  readonly host: Element;
  readonly until: (holds: () => boolean, ms?: number) => Promise<boolean>;
}

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

/** The appearance radios' names, in the order the group shows them. */
const APPEARANCE_NAMES = ['System', 'Light', 'Dark'];

/** The sheet's lines, each over its choice. */
const LINES = ["A day's tending", 'Reads new verses aloud', 'Appearance'];

const nameOf = (node: Element) => node.getAttribute('aria-label') ?? text(node);

/** The open sheet's modal, if one shows. */
export const modalOf = () => document.querySelector('[aria-modal]');

/** The control named `label` inside the open sheet, if it shows. */
export const sheetControl = (label: string) =>
  [...(modalOf()?.querySelectorAll(CONTROLS) ?? [])].find((node) => nameOf(node) === label);

/** A line of the sheet: a node with no child holding `words`, outside every control, group and heading. */
const lineOf = (root: Element, words: string) =>
  [...root.querySelectorAll('*')].find(
    (node) =>
      node.children.length === 0 &&
      text(node) === words &&
      node.closest('[role="button"],[role="radio"],[role="radiogroup"],[role="heading"]') === null,
  );

/** What a group of radios named `name` shows wrong: not its names in order, or not exactly one checked. */
const groupFaults = (modal: Element, name: string, names: readonly string[]) => {
  const all = document.querySelectorAll(`[role="radiogroup"][aria-label="${name}"]`);
  const inside = modal.querySelectorAll(`[role="radiogroup"][aria-label="${name}"]`);
  if (all.length > 1 || all.length !== inside.length)
    return [`${all.length} ${name} groups, ${inside.length} in the sheet`];
  const group = inside[0];
  if (group === undefined) return [];
  const radios = [...group.querySelectorAll('[role="radio"]')];
  const out: string[] = [];
  if (radios.map(nameOf).join(',') !== names.join(','))
    out.push(`${name} radios ${radios.map(nameOf).join(',')}`);
  const checked = radios.filter((radio) => radio.getAttribute('aria-checked') === 'true');
  if (checked.length !== 1) out.push(`${checked.length} ${name} radios checked`);
  return out;
};

/** The sheet's parts in its order, those shown: the heading, `Done`, each line over its choice, then `About`. */
const partsOf = (modal: Element, root: Element) => {
  const group = (name: string) =>
    modal.querySelector(`[role="radiogroup"][aria-label="${name}"]`) ?? undefined;
  return [
    ['the heading', modal.querySelector('[role="heading"]') ?? undefined],
    ['Done', sheetControl('Done')],
    [LINES[0], lineOf(root, LINES[0] ?? '')],
    ['Minutes', group('Minutes')],
    [LINES[1], lineOf(root, LINES[1] ?? '')],
    ['Voice', sheetControl('Voice')],
    [LINES[2], lineOf(root, LINES[2] ?? '')],
    ['Appearance', group('Appearance')],
    ['About', sheetControl('About')],
  ] as const;
};

/** Each part shown out of the sheet's order. */
const orderFaults = (modal: Element, root: Element) => {
  const shown = partsOf(modal, root).filter(
    (part): part is readonly [string, Element] => part[1] !== undefined,
  );
  const out: string[] = [];
  const following = Node.DOCUMENT_POSITION_FOLLOWING;
  for (let at = 1; at < shown.length; at += 1) {
    const [before, first] = shown[at - 1] ?? ['', root];
    const [after, next] = shown[at] ?? ['', root];
    if ((first.compareDocumentPosition(next) & following) !== following)
      out.push(`${after} before ${before}`);
  }
  if (sheetControl('About') === undefined) out.push('no About in the sheet');
  return out;
};

/** Whether the sheet is drawn: react-native-web's first frame of a modal, before its animation starts, holds it at opacity 0, and no reader sees that frame's look. */
const drawn = (modal: Element) => {
  for (let at: Element | null = modal; at !== null; at = at.parentElement)
    if (getComputedStyle(at).opacity === '0') return false;
  return true;
};

/** A node's styles as drawn: its own and each ancestor's classes and inline style, which decide its computed size, overflow and opacity. */
const chainOf = (node: Element) => {
  const parts: string[] = [];
  for (let at: Element | null = node; at !== null; at = at.parentElement)
    parts.push(`${at.getAttribute('class') ?? ''}/${at.getAttribute('style') ?? ''}`);
  return parts.join('>');
};

/** `holds` of `node`, kept in `known` by what it asks and the node's style chain, so a frame computes styles only for chains it has not seen. */
const remembered = (
  known: Map<string, readonly string[]>,
  asked: string,
  node: Element,
  holds: (node: Element) => boolean,
) => {
  const key = `${asked}|${chainOf(node)}`;
  const kept = known.get(key);
  if (kept !== undefined) return kept.length > 0;
  const found = holds(node);
  known.set(
    key,
    [asked].filter(() => found),
  );
  return found;
};

const tall = (node: Element) => parseFloat(getComputedStyle(node).minHeight) >= 44;

/** The sheet root's look faults against `scheme`, kept in `known` by the root's whole markup and its ancestors' styles, so a frame that draws a sheet already seen computes nothing. */
const lookOf = (root: Element, scheme: Scheme, known: Map<string, readonly string[]>) => {
  const key = `look|${scheme}|${chainOf(root)}|${root.outerHTML}`;
  const kept = known.get(key);
  if (kept !== undefined) return kept;
  const found = lookFaults(root, scheme, known).map((fault) => `${fault} in the sheet`);
  known.set(key, found);
  return found;
};

/** What the open sheet shows wrong, `modal` being the one modal. */
const openFaults = (modal: Element, scheme: Scheme, known: Map<string, readonly string[]>) => {
  const roots = modal.querySelectorAll('[data-testid="settings"]');
  const root = roots[0];
  if (roots.length !== 1 || root === undefined) return [`${roots.length} settings roots`];
  const out: string[] = [];
  const headings = [...modal.querySelectorAll('[role="heading"]')].map(text);
  if (headings.join('|') !== 'Settings') out.push(`the sheet's headings ${headings.join('|')}`);
  const done = sheetControl('Done');
  if (done === undefined) out.push('no Done');
  else if (remembered(known, 'scrolled', done, scrolled)) out.push('Done inside the scroll view');
  out.push(
    ...groupFaults(modal, 'Minutes', MINUTE_NAMES),
    ...groupFaults(modal, 'Appearance', APPEARANCE_NAMES),
  );
  const voices = choicesOf(modal).voices;
  if (voices.length > 1) out.push(`${voices.length} Voice nodes`);
  if (voices.some((each) => !/^Voice:(Off|Her|Him)$/.test(each)))
    out.push(`a Voice node ${voices.join(',')}`);
  out.push(...orderFaults(modal, root));
  for (const node of root.querySelectorAll(CONTROLS))
    if (!remembered(known, 'tall', node, tall))
      out.push(`${nameOf(node)} under 44 tall in the sheet`);
  if (remembered(known, 'drawn', modal, drawn)) out.push(...lookOf(root, scheme, known));
  for (const id of HOME_NODES)
    if (modal.querySelector(`[data-testid="${id}"]`) !== null)
      out.push(`home's ${id} in the sheet`);
  const under = [...document.querySelectorAll('[role="heading"]')]
    .filter((node) => !modal.contains(node))
    .map(text);
  if (under.join('|') !== 'Your field') out.push(`the sheet over ${under.join('|') || 'nothing'}`);
  return out;
};

/**
 * The sheet's frame rule over the whole document, against `scheme`: while
 * open, one modal holding the sheet as the sheet shows it; while closed,
 * no modal and no heading `Settings`. `known` keeps each style chain's
 * look across frames.
 */
export const sheetFaults = (
  page: Document,
  scheme: Scheme,
  known = new Map<string, readonly string[]>(),
): string[] => {
  const modals = page.querySelectorAll('[aria-modal]');
  const modal = modals[0];
  if (modals.length > 1) return [`${modals.length} modals`];
  if (modal !== undefined) return openFaults(modal, scheme, known);
  const settings = [...page.querySelectorAll('[role="heading"]')].filter(
    (node) => text(node) === 'Settings',
  );
  if (settings.length > 0) return ['a heading Settings with no sheet'];
  return [];
};

/**
 * Holds every frame of the document (each DOM mutation batch under its
 * body) from now on to `sheetFaults` against `scheme` (the system's by
 * default), keeping each fault once, at most 8, and counting the frames
 * that showed the sheet open. A tap of anything outside the open sheet is
 * a fault too: iOS lets no tap reach home under it.
 */
export const watchSheet = (scheme: () => Scheme = systemScheme) => {
  const faults: string[] = [];
  const seen = new Set<string>();
  const known = new Map<string, readonly string[]>();
  const frames = { open: 0 };
  const keep = (fault: string) => {
    if (faults.length >= 8 || seen.has(fault)) return;
    seen.add(fault);
    faults.push(fault);
  };
  const frame = () => {
    if (modalOf() !== null) frames.open += 1;
    for (const fault of sheetFaults(document, scheme(), known)) keep(fault);
  };
  const under = (event: Event) => {
    const modal = modalOf();
    if (modal === null || !(event.target instanceof Node) || modal.contains(event.target)) return;
    keep('a tap under the open sheet');
  };
  const watch = new MutationObserver(frame);
  watch.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  document.addEventListener('click', under, true);
  return {
    faults,
    frames,
    stop: () => {
      watch.disconnect();
      document.removeEventListener('click', under, true);
    },
  };
};

const click = (node: Element) =>
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

/** Taps the control named `label` inside the open sheet; answers whether it showed. */
export const tapInSheet = async (label: string) => {
  const node = sheetControl(label);
  if (node === undefined) return false;
  await act(async () => {
    click(node);
  });
  return true;
};

/**
 * Taps the gear on `rig`'s home and waits for the sheet, then plays the
 * end of its slide-in as a browser would: one bubbling `animationend` on
 * the node react-native-web's `ModalAnimation` draws (the modal's
 * grandparent), which makes the dialog active. Fails `the sheet never
 * became active` when its role is not then `dialog`.
 */
export const openSettings = async (rig: Rig) => {
  const gear = [...rig.host.querySelectorAll(CONTROLS)].find((node) => nameOf(node) === 'Settings');
  if (gear === undefined) throw new Error('no Settings on the screen');
  await act(async () => {
    click(gear);
  });
  if (!(await rig.until(() => modalOf() !== null))) throw new Error('no sheet after Settings');
  const animated = modalOf()?.parentElement?.parentElement;
  await act(async () => {
    animated?.dispatchEvent(new Event('animationend', { bubbles: true }));
  });
  if (modalOf()?.getAttribute('role') !== 'dialog')
    throw new Error('the sheet never became active');
};

/** Closes the open sheet by `Done` or by Escape (a key up on the page), and waits until no modal shows; answers whether it closed. */
export const closeSettings = async (rig: Rig, way: 'Done' | 'Escape') => {
  if (way === 'Done') await tapInSheet('Done');
  else
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Escape' }),
      );
    });
  return rig.until(() => modalOf() === null);
};

/** Chooses `minutes` in the sheet: open, the radio, `Done`; answers whether each step showed. */
export const minutesBySettings = async (rig: Rig, minutes: number) => {
  await openSettings(rig);
  const tapped = await tapInSheet(`${minutes} min`);
  return tapped && (await closeSettings(rig, 'Done'));
};

/** Takes the voice's next choice in the sheet: open, `Voice`, `Done`; answers whether each step showed. */
export const voiceBySettings = async (rig: Rig) => {
  await openSettings(rig);
  const tapped = await tapInSheet('Voice');
  return tapped && (await closeSettings(rig, 'Done'));
};
