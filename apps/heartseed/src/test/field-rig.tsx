/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop, effect/noTernary -- the field's screen rig: it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` until the frame a test waits on lands, at most 3 s; it reads nodes whose absent attributes are null and writes the device's records as JSON text. */

/**
 * The field as a reader and a screen reader meet it, for the field's screen
 * tests: the root route mounted in happy-dom (react-native-web) under the
 * app's own layer over a scripted recital (the passage less its 11th word),
 * the app's real store on the device's `One.Database` (`one.tsx`) and a
 * silent chime. A relaunch is a new mount over the same disk.
 *
 * Every frame (each DOM mutation batch) is held to the rule and each fault
 * kept: `Your field` shows only on Today, only once the garden's read
 * completed, never while Say it listens, and never inside a scroll view
 * (so it is on screen however much Today holds); a field node only under the
 * field's heading, never beside Today's; the field holds exactly one
 * `Your field` heading and no `Today` heading, whatever its references
 * spell; and every field frame shows the
 * rule's field over the records the disk holds (`field-model.ts`): the
 * rows, each plant's label, its drawing's colours and its verse number and
 * nothing else, the days sown and the harvest as seen and as exposed, and no
 * other number or image. Opening the field must write nothing.
 */

import { RegistryProvider } from '@effect/atom-react';
import { expect } from 'bun:test';
import { Effect, Layer } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { Haptics, type Recall } from '../sayit';
import { store } from '../store';
import { voiceSource } from '../voice/source';
import { AA, contrastOf } from './contrast';
import { fieldRule, heldOn, verseNumberRule, type ModelPlantStage } from './field-model';
import { keyOf, PREFIX } from './garden-model';
import { device } from './one';

const PASSAGES = [{ title: passage.reference, verses: [passage.reference] }];

/** The plant's parts as the browser computes their colours. */
export const SOIL = 'rgba(138, 110, 75, 1.00)';
const GOLD = 'rgba(212, 166, 64, 1.00)';
const LEAF = 'rgba(111, 154, 74, 1.00)';
const GREEN_EAR = 'rgba(156, 191, 106, 1.00)';

/** Each stage as Today draws it, part by part; a verse not planted is the soil alone. */
const LOOK: Readonly<Record<ModelPlantStage, readonly string[]>> = {
  'not planted': [SOIL],
  seed: [SOIL, GOLD],
  blade: [SOIL, LEAF, LEAF],
  ear: [SOIL, LEAF, LEAF, GREEN_EAR],
  'full corn': [SOIL, LEAF, LEAF, GOLD, GOLD],
};

/** The record of `recall` as the garden writes it. */
export const record = (recall: Recall) => [keyOf(recall), JSON.stringify(recall)] as const;

/** Text as a reader sees it: whitespace collapsed. */
const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const hidden = (node: Element) => node.closest('[aria-hidden="true"]') !== null;

/** Whether a reader sees `node`: no ancestor out of the layout or transparent, its ink not transparent. */
const seen = (node: Element) => {
  for (let at: Element | null = node; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return false;
  }
  return !/rgba\(.*, 0(\.0+)?\)$|transparent/.test(getComputedStyle(node).color);
};

/** Whether `node` lies inside a scroll view: an ancestor that scrolls its overflow, so a reader may have to scroll to reach it. */
export const scrolled = (node: Element) => {
  for (let at = node.parentElement; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (/auto|scroll/.test(`${style.overflowY} ${style.overflow}`)) return true;
  }
  return false;
};

/** A count's text when it is one node, seen, and exposed as that text. */
const counted = (host: Element, id: string) => {
  const nodes = host.querySelectorAll(`[data-testid="${id}"]`);
  const node = nodes[0];
  if (nodes.length !== 1 || node === undefined) return `<${nodes.length} ${id}>`;
  const exposed = !hidden(node) && (node.getAttribute('aria-label') ?? text(node)) === text(node);
  return seen(node) && exposed ? text(node) : `<${id} not seen as exposed>`;
};

/** A plant as the reader gets it: its label when it is one exposed image, its one hidden drawing's colours, and the text it shows. */
const plantRead = (plant: Element) => {
  const drawings = plant.querySelectorAll('[data-testid="plant"]');
  const drawing = drawings[0];
  return {
    label:
      plant.getAttribute('role') === 'img' && !hidden(plant)
        ? plant.getAttribute('aria-label')
        : '<not one exposed image>',
    drawn:
      drawings.length === 1 && drawing !== undefined && hidden(drawing)
        ? [...drawing.children].map((part) => getComputedStyle(part).backgroundColor)
        : ['<not one hidden drawing>'],
    shown: [...plant.querySelectorAll('*')]
      .filter((node) => node.children.length === 0 && seen(node))
      .map(text)
      .join(''),
  };
};

const ALLOWED =
  '[data-testid="row-title"],[data-testid="field-plant"],[data-testid="sown"],[data-testid="harvest"]';

/** A field frame as the reader gets it: the counts, each row's title and plants, and the numbers and images outside them. */
export const readField = (host: Element) => {
  const rows = [...host.querySelectorAll('[data-testid="row"]')].map((row) => {
    const titles = row.querySelectorAll('[data-testid="row-title"]');
    const title = titles[0];
    return {
      title:
        titles.length === 1 && title !== undefined && seen(title) && !hidden(title)
          ? text(title)
          : '<title not one seen and exposed>',
      plants: [...row.querySelectorAll('[data-testid="field-plant"]')].map(plantRead),
    };
  });
  const strays = [...host.querySelectorAll('*')].filter(
    (node) =>
      (node.children.length === 0 &&
        /\d/.test(text(node)) &&
        text(node) !== 'Mark 4:28' &&
        node.closest(ALLOWED) === null) ||
      (node.getAttribute('role') === 'img' &&
        node.getAttribute('data-testid') !== 'field-plant' &&
        !hidden(node)),
  ).length;
  const faint = [...host.querySelectorAll('*')]
    .filter((node) => node.children.length === 0 && text(node) !== '' && seen(node))
    .filter((node) => contrastOf(node) < AA)
    .map((node) => node.closest('[data-testid]')?.getAttribute('data-testid') ?? 'text');
  return {
    sown: counted(host, 'sown'),
    harvest: counted(host, 'harvest'),
    rows,
    strays,
    faint: [...new Set(faint)],
  };
};

/** The field frame the rule gives over the disk as it stands. */
export const wantField = () => {
  const field = fieldRule(heldOn(device.disk), PASSAGES);
  return {
    sown: field.sown === 1 ? '1 day sown' : `${field.sown} days sown`,
    harvest: field.harvest === 1 ? '1 verse at full corn' : `${field.harvest} verses at full corn`,
    rows: field.rows.map((row) => ({
      title: row.title.replace(/\s+/g, ' ').trim(),
      plants: row.plants.map((plant) => ({
        label: `${plant.reference}, ${plant.stage}`,
        drawn: [...LOOK[plant.stage]],
        shown: verseNumberRule(plant.reference).replace(/\s+/g, ' ').trim(),
      })),
    })),
    strays: 0,
    faint: [],
  };
};

/**
 * The root over the scripted recital and the device's store (built once
 * `held` resolves); `read` is whether this launch's read completes. Every
 * frame is held to the field's rules; the faults found are kept.
 */
export const mount = async (read: boolean, held: Promise<void> = Promise.resolve()) => {
  const layer = appLayer({
    source: scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 3 })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: Layer.unwrap(
      Effect.as(
        Effect.promise(() => held),
        store,
      ),
    ),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voiceSource,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const faults: string[] = [];
  const fixed = new Map(device.disk);
  const frames = { control: 0, listening: 0, field: 0, pending: 0 };
  const state = { released: false };
  const headings = () => [...host.querySelectorAll('[role="heading"]')].map(text);
  const buttons = () =>
    [...host.querySelectorAll('[role="button"]')].map((node) => node.getAttribute('aria-label'));
  const control = () =>
    [...host.querySelectorAll('[role="button"]')].find(
      (node) => node.getAttribute('aria-label') === 'Your field',
    );
  const frame = () => {
    const shown = headings();
    const on = shown.join('|') || 'no heading';
    const onField = shown.includes('Your field');
    const offered = buttons().includes('Your field');
    const listening = buttons().includes('Listening');
    if (listening) frames.listening += 1;
    if (shown.length === 0) frames.pending += 1;
    if (offered) {
      frames.control += 1;
      if (!shown.includes('Today')) faults.push(`the control on ${on}`);
      if (!read || !state.released) faults.push('the control before a read completed');
      if (listening) faults.push('the control while Say it listens');
      const node = control();
      if (node !== undefined && scrolled(node)) faults.push('the control inside a scroll view');
    }
    const nodes = host.querySelector(
      '[data-testid="sown"],[data-testid="harvest"],[data-testid="row"],[data-testid="field-plant"]',
    );
    if (!onField && nodes !== null) faults.push(`a field node on ${on}`);
    if (!onField) return;
    frames.field += 1;
    const own = shown.filter((heading) => heading === 'Your field').length;
    if (own !== 1) faults.push(`${own} Your field headings on the field`);
    if (shown.includes('Today')) faults.push('Today and the field at once');
    const got = JSON.stringify(readField(host));
    const want = JSON.stringify(wantField());
    if (got !== want)
      faults.push(`a field frame ${got.slice(0, 400)} where the rule has ${want.slice(0, 400)}`);
  };
  const watch = new MutationObserver(frame);
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  void held.then(() => {
    state.released = true;
  });
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  const until = async (holds: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const button = (label: string) =>
    [...host.querySelectorAll('[role="button"],[role="radio"]')].find(
      (node) => node.getAttribute('aria-label') === label,
    );
  const tap = async (label: string) => {
    const node = button(label);
    expect([label, node !== undefined]).toEqual([label, true]);
    await act(async () => {
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  };
  const summary = () => text(host.querySelector('[data-testid="summary"]'));
  /** The grade checked on Today, none when no grade shows. */
  const checked = () =>
    host.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('aria-label') ?? null;
  const stage = () =>
    host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label') ?? null;
  /** Says the passage to a new summary. */
  const say = async () => {
    const before = host.querySelector('[data-testid="summary"]');
    await tap('Say it');
    expect(
      await until(() => {
        const now = host.querySelector('[data-testid="summary"]');
        return now !== null && now !== before && button('Say it') !== undefined;
      }),
    ).toBe(true);
  };
  /** The device's whole disk and its write, remove and clear counts. */
  const stored = () => ({
    disk: [...device.disk],
    set: device.calls.set,
    remove: device.calls.remove,
    clear: device.calls.clear,
  });
  /** Runs a field-only transition to `heading` and holds the device as it was across it, a moment past its frame included. */
  const still = async (label: string, heading: string) => {
    const before = stored();
    await tap(label);
    expect(await until(() => headings().includes(heading))).toBe(true);
    await until(() => false, 8);
    expect({ through: label, ...stored() }).toEqual({ through: label, ...before });
  };
  /** Opens the field and reads it whole; the device takes no write, remove or clear, and keeps its disk. */
  const field = async () => {
    await still('Your field', 'Your field');
    return readField(host);
  };
  /** Goes back to Today; the device takes no write, remove or clear, and keeps its disk. */
  const back = () => still('Today', 'Today');
  /** What the disk shows wrong against the launch's: a key removed, a key other than the passage's recalls changed or added, or a passage recall that is not one. */
  const diskFaults = () => {
    const own = `${PREFIX}${passage.reference}/`;
    const out: string[] = [];
    for (const [key, value] of fixed) {
      if (!device.disk.has(key)) out.push('a key removed');
      else if (!key.startsWith(own) && device.disk.get(key) !== value) out.push('a key changed');
    }
    for (const [key, value] of device.disk) {
      if (fixed.has(key)) continue;
      const recall = heldOn(new Map([[key, value]]))[0];
      if (!key.startsWith(own) || recall?.reference !== passage.reference)
        out.push('a key added that is no recall of the passage');
    }
    return out;
  };
  /** The lowest contrast among the seen text of the field's readouts: the days sown, the harvest, the row titles and the plants' verse numbers. */
  const readouts = () => {
    const lowest = (id: string) =>
      Math.min(
        ...[...host.querySelectorAll(`[data-testid="${id}"], [data-testid="${id}"] *`)]
          .filter((node) => node.children.length === 0 && text(node) !== '' && seen(node))
          .map(contrastOf),
      );
    return {
      sown: lowest('sown'),
      harvest: lowest('harvest'),
      titles: lowest('row-title'),
      numbers: lowest('field-plant'),
    };
  };
  /** Ends the launch, and answers what its disk shows wrong against the launch's start (`diskFaults`). */
  const leave = async () => {
    watch.disconnect();
    await act(async () => root.unmount());
    host.remove();
    return diskFaults();
  };
  return {
    faults,
    frames,
    headings,
    buttons,
    control,
    until,
    tap,
    say,
    field,
    back,
    summary,
    checked,
    stage,
    readouts,
    leave,
  };
};
