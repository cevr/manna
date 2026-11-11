/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop, effect/noTernary -- the field bar's rig: it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work runs on the host's clock, so each turn is handed over in `act` until the frame a test waits on lands, at most 3 s; it reads nodes whose absent attributes are null. */

/**
 * The field's bar and rows as a reader and a screen reader meet them, for
 * the bar's tests (`src/field/bar-*.test.tsx`): the root route mounted in
 * happy-dom (react-native-web) under the app's own layer over the app's
 * real store on the device's `One.Database` (`one.tsx`), whose read of the
 * passages' key alone fails `passageReads` times, so the garden reads
 * whole while the passages may read as `Unread`. A launch lands on home.
 *
 * Every frame (each DOM mutation batch) is held to the root's frame rule
 * (`rootFaults`, over the garden read) and to the screens' rules, and each
 * fault kept (`barFaults`): at most one heading; on Today, the footer
 * rule (`footerFaults`: no control but a missed word's mark inside the scroll
 * view) and no node of the field or the chooser; off Today (the end of a
 * run, `The field is tended`, among them), no control but a
 * list control (a book, a chapter, a verse, a plant, a row's own `Remove`,
 * `Add a list`, the end rows `Settings` and `How Heartseed works`) and no
 * alert inside a scroll view;
 * `Plant` only over a shown reference of 1-20 verses; never `Add a list`
 * beside the limit line or with 3 rows' `Remove`s, and at most one; over
 * unread passages, no add, remove, `Keep`, `Plant` or limit line; while
 * the ask's `Remove` is disabled (a remove pending), every other field
 * control (`Settings`, `How Heartseed works`, `Keep`, a row's `Remove`,
 * every plant, `Start`, `Practice …`, `Learn …`) disabled too and no
 * `Add a list`; `Listening` only on Today; on
 * the field, home A's layout rules (`homeFaults`); and every seen text of
 * every screen but Today (the field, the chooser, the end of a run) at WCAG
 * AA against what lies behind it.
 */

import { RegistryProvider } from '@effect/atom-react';
import { Effect, Layer, Logger } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { Haptics } from '../sayit';
import { store } from '../store';
import { voiceSource } from '../voice/source';
import type { FieldSeen } from './choose-model';
import { faintIn, labelOf, plantFaults, text } from './chooser-rig';
import { clockOf, START, type Time } from './clock';
import { deadline } from './elapsed';
import { homeFaults, scrolled } from './field-rig';
import { KEPT_LOOKS, lookFaults } from './look';
import { KEY } from './passages-model';
import { rootFaults } from './root-rule';
import { footerFaults } from './run-rig';

const CONTROL = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

const idOf = (node: Element) => node.getAttribute('data-testid') ?? '';

/** A list control: a book, a chapter, a verse, a plant, a row's own `Remove`, `Add a list`, or an end row of the field; these scroll with their list by nature. */
const listed = (node: Element) => {
  const id = idOf(node);
  if (['book', 'chapter', 'verse', 'field-plant', 'add-list'].includes(id)) return true;
  if (END_ROWS.includes(labelOf(node))) return true;
  return labelOf(node).startsWith('Remove ') && node.closest('[data-testid="row"]') !== null;
};

const disabled = (node: Element) => node.getAttribute('aria-disabled') === 'true';

const READY = ', ready today';

/** A plant's name with its ready mark cut off: readiness is the home walk's to judge. */
const unready = (label: string) => (label.endsWith(READY) ? label.slice(0, -READY.length) : label);

const ADD = 'Add a list';

const END_ROWS = ['Settings', 'How Heartseed works'];

/** The field as the reader gets it, or the heading shown (`no heading` before one) off the field. */
export const readBar = (host: Element): FieldSeen | string => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  if (headings.join('|') !== 'Your field') return headings.join('|') || 'no heading';
  const one = (id: string) => {
    const nodes = host.querySelectorAll(`[data-testid="${id}"]`);
    if (nodes.length === 0) return undefined;
    if (nodes.length > 1) return `<${nodes.length} ${id}>`;
    return text(nodes[0]);
  };
  const alerts = [...host.querySelectorAll('[role="alert"]')].map(text);
  return {
    rows: [...host.querySelectorAll('[data-testid="row"]')].map((row) => ({
      title: text(row.querySelector('[data-testid="row-title"]')),
      plants: [...row.querySelectorAll('[data-testid="field-plant"]')].map((plant) =>
        unready(plant.getAttribute('aria-label') ?? '<no label>'),
      ),
      controls: [...row.querySelectorAll(CONTROL)]
        .filter((node) => idOf(node) !== 'field-plant')
        .map(labelOf),
    })),
    add: [...host.querySelectorAll(CONTROL)].filter((node) => labelOf(node) === ADD).length,
    card: host.querySelectorAll('[data-testid="today-card"]').length,
    limit: one('limit'),
    ask: one('ask'),
    alert: alerts.length === 0 ? undefined : alerts.join(' | '),
  };
};

/** Off Today: every control but a list control, and every alert, outside the scroll views. */
const scrollFaults = (host: Element, on: string, controls: readonly Element[]) => {
  if (on === 'Today' || on === '') return [];
  const out = controls
    .filter((node) => !listed(node) && scrolled(node))
    .map((node) => `the control ${labelOf(node)} inside a scroll view on ${on}`);
  for (const node of host.querySelectorAll('[role="alert"]'))
    if (scrolled(node)) out.push(`the line ${text(node).slice(0, 30)} inside a scroll view`);
  return out;
};

/** Whether `label` names a control that adds or removes a passage. */
const changes = (label: string) =>
  [ADD, 'Plant', 'Keep', 'Remove'].includes(label) || label.startsWith('Remove ');

/** What the field offers wrong: an add beside the limit line, with 3 rows' `Remove`s or more than once, and anything offered over unread passages. */
const offerFaults = (host: Element, on: string, unread: boolean, controls: readonly Element[]) => {
  const out: string[] = [];
  const labels = controls.map(labelOf);
  const limit = host.querySelector('[data-testid="limit"]');
  const added = controls.filter((node) => labelOf(node) === ADD);
  const adds = added.length > 0;
  if (adds && limit !== null) out.push('Add a list beside the limit line');
  const removes = controls.filter((node) => listed(node) && labelOf(node).startsWith('Remove '));
  if (on === 'Your field' && adds && removes.length >= 3) out.push('Add a list with 3 held');
  if (added.length > 1) out.push(`${added.length} Add a list`);
  const offered = labels.filter(changes);
  if (unread && (offered.length > 0 || limit !== null))
    out.push(`${offered[0] ?? 'the limit line'} offered over unread passages`);
  return out;
};

/** A field control S7 holds while a remove is pending: an end row, `Keep`, `Start`, a row's `Remove …`, `Practice …`, `Learn …` or a plant. */
const held = (node: Element) => {
  const label = labelOf(node);
  if ([...END_ROWS, 'Keep', 'Start'].includes(label)) return true;
  return /^(Remove|Practice|Learn) /u.test(label) || idOf(node) === 'field-plant';
};

/** While the ask's `Remove` is disabled (a remove pending): every other field control disabled, and no add. */
const pendingFaults = (controls: readonly Element[]) => {
  const confirm = controls.find((node) => labelOf(node) === 'Remove');
  if (confirm === undefined || !disabled(confirm)) return [];
  const live = controls.filter((node) => !disabled(node) && held(node));
  const out = live.map((node) => `${labelOf(node)} live while a remove is pending`);
  if (controls.some((node) => labelOf(node) === ADD))
    out.push('Add a list while a remove is pending');
  return out;
};

/** On Today, no node of the field or the chooser: no row, plant, book, chapter or verse, and no control that adds, removes or plants. */
const strayOnToday = (host: Element, controls: readonly Element[]) => {
  const out: string[] = [];
  const nodes = host.querySelectorAll(
    ['row', 'field-plant', 'add-list', 'book', 'chapter', 'verse', 'limit']
      .map((id) => `[data-testid="${id}"]`)
      .join(','),
  );
  if (nodes.length > 0) out.push(`${nodes.length} field or chooser nodes on Today`);
  const offered = controls.map(labelOf).find(changes);
  if (offered !== undefined) out.push(`${offered} on Today`);
  return out;
};

/** The frame rules, on every screen: the faults `host` shows now, over passages read or not; `known` keeps each style chain's contrast verdict across frames. */
export const barFaults = (host: Element, unread: boolean, known: Map<string, boolean>) => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  const on = headings[0] ?? '';
  const controls = [...host.querySelectorAll(CONTROL)];
  const faults = [
    ...scrollFaults(host, on, controls),
    ...offerFaults(host, on, unread, controls),
    ...pendingFaults(controls),
  ];
  faults.push(...plantFaults(host));
  if (headings.length > 1) faults.push(`${headings.length} headings`);
  if (on !== 'Today' && controls.some((node) => labelOf(node) === 'Listening'))
    faults.push(`Listening on ${on}`);
  if (on === 'Today') faults.push(...footerFaults(host), ...strayOnToday(host, controls));
  if (on === 'Today' || on === '') return faults;
  if (on === 'Your field') faults.push(...homeFaults(host));
  const faint = faintIn(host, known);
  if (faint.length > 0) faults.push(`faint text on ${on}: ${faint.slice(0, 3).join(', ')}`);
  return faults;
};

/** The app's store, whose next `passageReads` reads of the passages' key fail; every other call is the store's own. */
const storeFailing = (passageReads: number) =>
  Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.map(KeyValueStore.KeyValueStore, (real) => {
      const left = { reads: passageReads };
      return KeyValueStore.KeyValueStore.of({
        ...real,
        get: (key) =>
          Effect.suspend(() => {
            if (key !== KEY || left.reads === 0) return real.get(key);
            left.reads -= 1;
            return Effect.fail(
              new KeyValueStore.KeyValueStoreError({ message: 'get', method: 'get', key }),
            );
          }),
      });
    }),
  ).pipe(Layer.provide(store));

/** The root over the device's disk as it stands, its passages' key failing `passageReads` reads; `unread` is whether the model reads the passages as `Unread`; `beside` renders next to the root under the same registry; the runtime's clock reads `time` (the host's while `time.now` is null); the app's layer teaches the collections `promises` (none by default). Every frame is held to the rules and the faults kept. */
export const mountBar = async (
  passageReads: number,
  unread: boolean,
  beside: ReactNode = null,
  time: Time = { now: START },
  promises: readonly string[] = [],
) => {
  const layer = appLayer({
    source: scriptedSource(recite(passage.text, { skip: [], every: 5, pace: 3 })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: storeFailing(passageReads),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voiceSource,
    promises,
  }).pipe(Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))));
  const host = document.createElement('div');
  document.body.append(host);
  const faults: string[] = [];
  const known = new Map<string, boolean>();
  const looks = KEPT_LOOKS;
  const watch = new MutationObserver(() => {
    for (const fault of [
      ...rootFaults(host, 'read'),
      ...barFaults(host, unread, known),
      ...lookFaults(host, undefined, looks),
    ])
      if (faults.length < 8) faults.push(fault);
  });
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
        {beside}
      </RegistryProvider>,
    ),
  );
  const until = async (holds: () => boolean, ms = 3000) => {
    const late = deadline(ms);
    while (!holds()) {
      if (late()) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const click = (node: Element) =>
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  /** The `nth` control named `label` (from 0), if it shows. */
  const control = (label: string, nth = 0) =>
    [...host.querySelectorAll(CONTROL)].filter((node) => labelOf(node) === label)[nth];
  /** Taps the `nth` control named `label` (twice in one turn when `twice`); answers whether it showed. */
  const tap = async (label: string, nth = 0, twice = false) => {
    const node = control(label, nth);
    if (node === undefined) return false;
    await act(async () => {
      click(node);
      if (twice) click(node);
    });
    return true;
  };
  /** Taps the one control of testID `id`; answers whether it showed. */
  const tapId = async (id: string) => {
    const node = [...host.querySelectorAll(CONTROL)].find((each) => idOf(each) === id);
    if (node === undefined) return false;
    await act(async () => {
      click(node);
    });
    return true;
  };
  /** Taps two controls in one turn; answers whether both showed. */
  const tapBoth = async (first: string, second: string) => {
    const one = control(first);
    const two = control(second);
    if (one === undefined || two === undefined) return false;
    await act(async () => {
      click(one);
      click(two);
    });
    return true;
  };
  /** Waits for the screen `want`; answers the screen read when it never came. */
  const settle = async (want: FieldSeen | string) => {
    const goal = JSON.stringify(want);
    if (await until(() => JSON.stringify(readBar(host)) === goal)) return undefined;
    return readBar(host);
  };
  const leave = async () => {
    watch.disconnect();
    await act(async () => root.unmount());
    host.remove();
  };
  return { host, faults, until, control, tap, tapId, tapBoth, settle, leave };
};
