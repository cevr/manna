/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop, effect/noTernary -- the Add verses sheet's rig: it mounts the sheet in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work runs on the host's clock, so each turn is handed over in `act` until the frame a test waits on lands, at most 3 s; it reads the whole document, whose absent nodes and attributes are null. */

/**
 * The Add verses sheet as a reader and a screen reader meet it, for the
 * sheet's tests: `AddSheet` mounted in happy-dom (react-native-web) under
 * the app's own layer over the app's real store on the device's
 * `One.Database` (`one.tsx`), beside a stand-in of home. The stand-in
 * reads the garden, the passages and the collections taught, and hands the
 * sheet home's field (`fieldOf` over `fieldPassagesOf` of the app's own
 * row) and the passages, or the props a test gives in their place
 * (`show`). While the sheet is closed it shows a button `Add verses` that
 * opens it again, at any count held. It counts `Done`, `Any passage` and a
 * landed plant apart.
 *
 * The sheet is a `Modal`, which react-native-web draws in a portal outside
 * the rig's host, so every frame of the whole document (each DOM mutation
 * batch under its body) is held to `addSheetFaults` and each fault kept,
 * with a tap under the open sheet, and a sheet shown with no frame whose
 * look was checked.
 */

import { RegistryProvider, useAtomValue } from '@effect/atom-react';
import { Effect, Layer, Logger, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text } from 'react-native';
import passage from 'virtual:heartseed-passage';

import { appLayer, gardenView, passagesView, runtime, taughtView } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { fieldOf, type Field } from '../field';
import { Chime, type GardenView, type ReadGarden } from '../garden';
import { themed, useThemed } from '../look';
import type { PassagesView } from '../passages';
import { fieldPassagesOf } from '../promises/taught';
import { Haptics } from '../sayit';
import { AddSheet } from '../shelves/sheet';
import { store } from '../store';
import type { Scheme } from '../theme';
import { voiceSource } from '../voice/source';
import { clockOf, type Time } from './clock';
import { scrolled } from './field-rig';
import { shelvesModel } from './home-model';
import { lookFaults, systemScheme } from './look';
import { KEY } from './passages-model';
import type { SheetSeen } from './shelves-model';

const CONTROL = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

/** The app's own row, as home shows it first. */
const OWN = [{ title: passage.reference, verses: [passage.reference] }];

/** The shelf heads' titles, in the model's order. */
const TITLES = shelvesModel().map((shelf) => shelf.title);

const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const nameOf = (node: Element) => node.getAttribute('aria-label') ?? text(node);

/** The open modal, if one shows. */
const modalOf = () => document.querySelector('[aria-modal]');

/** The Add verses sheet's modal, if it shows. */
const sheetOf = () => {
  const modal = modalOf();
  if (modal === null || modal.querySelector('[data-testid="add-sheet"]') === null) return null;
  return modal;
};

/** The control named `label` inside the open sheet, if it shows. */
const sheetControl = (label: string) =>
  [...(sheetOf()?.querySelectorAll(CONTROL) ?? [])].find((node) => nameOf(node) === label);

/** Whether the sheet is drawn: react-native-web's first frame of a modal holds it at opacity 0, and no reader sees that frame's look. */
const drawn = (modal: Element) => {
  for (let at: Element | null = modal; at !== null; at = at.parentElement)
    if (getComputedStyle(at).opacity === '0') return false;
  return true;
};

const tall = (node: Element) => parseFloat(getComputedStyle(node).minHeight) >= 44;

/** A node's styles as drawn: its own and each ancestor's classes and inline style. */
const chainOf = (node: Element) => {
  const parts: string[] = [];
  for (let at: Element | null = node; at !== null; at = at.parentElement)
    parts.push(`${at.getAttribute('class') ?? ''}/${at.getAttribute('style') ?? ''}`);
  return parts.join('>');
};

/** `holds` of `node`, kept in `known` by what it asks and the node's style chain. */
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

/** The sheet root's look faults against `scheme`, kept by its markup and its ancestors' styles. */
const lookOf = (root: Element, scheme: Scheme, known: Map<string, readonly string[]>) => {
  const key = `look|${scheme}|${chainOf(root)}|${root.outerHTML}`;
  const kept = known.get(key);
  if (kept !== undefined) return kept;
  const found = lookFaults(root, scheme, known).map((fault) => `${fault} in the sheet`);
  known.set(key, found);
  return found;
};

/** Each offer out of place: after a head not expanded, or before any head. */
const offerPlaceFaults = (modal: Element) => {
  const out: string[] = [];
  let head: Element | null = null;
  for (const node of modal.querySelectorAll('[data-testid="shelf"],[data-testid="offer"]')) {
    if (node.getAttribute('data-testid') === 'shelf') {
      head = node;
      continue;
    }
    const title = text(node.querySelector('[data-testid="offer-title"]'));
    if (head === null || head.getAttribute('aria-expanded') !== 'true')
      out.push(`the offer ${title} under ${head === null ? 'no shelf' : nameOf(head)}, not open`);
  }
  return out;
};

/** Each offer showing more than its one state, or a control but its own `Plant`. */
const offerFaults = (modal: Element) => {
  const out: string[] = [];
  for (const offer of modal.querySelectorAll('[data-testid="offer"]')) {
    const title = text(offer.querySelector('[data-testid="offer-title"]'));
    const controls = [...offer.querySelectorAll(CONTROL)].map(nameOf);
    const states = offer.querySelectorAll('[data-testid="offer-state"]').length;
    if (controls.some((name) => name !== `Plant ${title}`))
      out.push(`the offer ${title} offers ${controls.join('|')}`);
    if (controls.length + states > 1)
      out.push(`the offer ${title} shows ${controls.length + states} states`);
  }
  return out;
};

/** What the open sheet shows wrong, `modal` being the one modal. */
const openFaults = (
  modal: Element,
  scheme: Scheme,
  known: Map<string, readonly string[]>,
  pending: boolean,
) => {
  const roots = modal.querySelectorAll('[data-testid="add-sheet"]');
  const root = roots[0];
  if (roots.length !== 1 || root === undefined) return [`${roots.length} add-sheet roots`];
  const out: string[] = [];
  const headings = [...modal.querySelectorAll('[role="heading"]')].map(text);
  if (headings.join('|') !== 'Add verses') out.push(`the sheet's headings ${headings.join('|')}`);
  const done = sheetControl('Done');
  if (done === undefined) out.push('no Done');
  else if (scrolled(done)) out.push('Done inside the scroll view');
  const heads = [...modal.querySelectorAll('[data-testid="shelf"]')].map(nameOf);
  if (heads.join('|') !== TITLES.join('|')) out.push(`the shelves ${heads.join('|')}`);
  const expanded = modal.querySelectorAll('[aria-expanded="true"]').length;
  if (expanded > 1) out.push(`${expanded} shelves open`);
  out.push(...offerPlaceFaults(modal), ...offerFaults(modal));
  const lines = [...modal.querySelectorAll('[role="alert"]')];
  if (lines.length > 1) out.push(`${lines.length} lines`);
  if (lines.some(scrolled)) out.push('the line inside the scroll view');
  for (const node of root.querySelectorAll(CONTROL)) {
    if (!remembered(known, 'tall', node, tall))
      out.push(`${nameOf(node)} under 44 tall in the sheet`);
    if (pending && node.getAttribute('aria-disabled') !== 'true')
      out.push(`${nameOf(node)} live while a plant is pending`);
  }
  if (remembered(known, 'drawn', modal, drawn)) out.push(...lookOf(root, scheme, known));
  return out;
};

/**
 * The sheet's frame rule over the whole document, against `scheme`,
 * `pending` while a plant the rig held has not answered: while a modal
 * holds `add-sheet`, one modal holding one heading `Add verses`, `Done`
 * outside the scroll view, the shelf heads by title in order, at most one
 * open, every offer under the open head and none with none open, each offer
 * showing at most one of its own `Plant` and `In your field`, at most one
 * line outside the scroll view, every control at least 44 tall, the look
 * at AA in `scheme`, and while pending every control disabled. While
 * closed, no `add-sheet` and no heading `Add verses` anywhere.
 */
export const addSheetFaults = (
  page: Document,
  scheme: Scheme,
  known = new Map<string, readonly string[]>(),
  pending = false,
): string[] => {
  const modals = page.querySelectorAll('[aria-modal]');
  const modal = modals[0];
  if (modal !== undefined && modal.querySelector('[data-testid="add-sheet"]') !== null) {
    if (modals.length > 1) return [`${modals.length} modals`];
    return openFaults(modal, scheme, known, pending);
  }
  const out: string[] = [];
  if (page.querySelector('[data-testid="add-sheet"]') !== null)
    out.push('an add-sheet outside a modal');
  if ([...page.querySelectorAll('[role="heading"]')].some((node) => text(node) === 'Add verses'))
    out.push('a heading Add verses with no sheet');
  return out;
};

/** The open sheet as a reader gets it, or `closed`. */
export const readSheet = (): SheetSeen => {
  const modal = sheetOf();
  if (modal === null) return 'closed';
  return {
    headings: [...modal.querySelectorAll('[role="heading"]')].map(text),
    shelves: [...modal.querySelectorAll('[data-testid="shelf"]')].map(
      (node) => [nameOf(node), node.getAttribute('aria-expanded')] as const,
    ),
    offers: [...modal.querySelectorAll('[data-testid="offer"]')].map((row) => {
      const plant = [...row.querySelectorAll(CONTROL)].map(nameOf);
      return [
        text(row.querySelector('[data-testid="offer-title"]')),
        text(row.querySelector('[data-testid="offer-count"]')),
        plant.join('|') || text(row.querySelector('[data-testid="offer-state"]')),
      ] as const;
    }),
    line: [...modal.querySelectorAll('[role="alert"]')].map(text).join(' | '),
  };
};

const click = (node: Element) =>
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

/** A rig's wait: answers whether `holds` came true within `ms`, a turn handed over at a time. */
type Until = (holds: () => boolean, ms?: number) => Promise<boolean>;

/** Waits for the Add verses sheet and plays the end of its slide-in as a browser would (one bubbling `animationend` on the modal's grandparent), so its dialog becomes active; answers whether it did. */
export const activateSheet = async (until: Until) => {
  if (!(await until(() => sheetOf() !== null))) return false;
  const animated = sheetOf()?.parentElement?.parentElement;
  await act(async () => {
    animated?.dispatchEvent(new Event('animationend', { bubbles: true }));
  });
  return sheetOf()?.getAttribute('role') === 'dialog';
};

/** Waits for the sheet `want`; answers the sheet read when it never came. */
export const settleSheet = async (until: Until, want: SheetSeen) => {
  const goal = JSON.stringify(want);
  if (await until(() => JSON.stringify(readSheet()) === goal)) return undefined;
  return readSheet();
};

/** Taps the control named `label` in the open sheet; answers whether it showed. */
export const tapSheet = async (label: string) => {
  const node = sheetControl(label);
  if (node === undefined) return false;
  await act(async () => {
    click(node);
  });
  return true;
};

/** The sheet's props a test gives in place of the stand-in's own. */
export interface SheetProps {
  readonly field: Field;
  readonly passages: PassagesView;
}

/** What the stand-in counts: `Done` (or Escape), `Any passage`, and a landed plant. */
interface Counts {
  done: number;
  any: number;
  added: number;
}

/** The stand-in home's look, in the scheme's roles. */
const standIn = themed((color, face) => ({
  ground: { backgroundColor: color.ground, minHeight: 44 },
  ink: { color: color.ink, fontFamily: face },
}));

const readOf = (garden: Option.Option<GardenView>): Option.Option<ReadGarden> =>
  Option.filter(garden, (view): view is ReadGarden => view._tag === 'Read');

/** The sheet beside a stand-in home, open at first; the props `given` stand in for the stand-in's own when present. */
function Stage({ given, counts }: { readonly given: SheetProps | null; readonly counts: Counts }) {
  const look = useThemed(standIn);
  const garden = readOf(AsyncResult.value(useAtomValue(gardenView)));
  const passages = AsyncResult.value(useAtomValue(passagesView));
  const taught = AsyncResult.value(useAtomValue(taughtView));
  const [open, setOpen] = useState(true);
  const close = (count: keyof Counts) => () => {
    counts[count] += 1;
    setOpen(false);
  };
  if (!open)
    return (
      <Pressable
        role="button"
        aria-label="Add verses"
        onPress={() => setOpen(true)}
        style={look.ground}
      >
        <Text style={look.ink}>Add verses</Text>
      </Pressable>
    );
  return Option.match(Option.all({ garden, passages, taught }), {
    onNone: () => false,
    onSome: (known) => {
      const own = {
        field: fieldOf(known.garden, fieldPassagesOf(OWN, known.passages, known.taught)),
        passages: known.passages,
      };
      const shown = given ?? own;
      return (
        <AddSheet
          field={shown.field}
          passages={shown.passages}
          onDone={close('done')}
          onAny={close('any')}
          onAdded={close('added')}
        />
      );
    },
  });
}

/** A plant's write held by the rig: while `armed`, a write of the passages' key waits in `waiting` until the rig lets it go. */
type Hold = { armed: boolean; planting: boolean; readonly waiting: Array<() => void> };

/** The app's store, whose writes of the passages' key wait while `hold` is armed; every other call is the store's own. */
const storeHeld = (hold: Hold) =>
  Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.map(KeyValueStore.KeyValueStore, (real) =>
      KeyValueStore.KeyValueStore.of({
        ...real,
        set: (key, value) =>
          Effect.suspend(() => {
            if (key !== KEY || !hold.armed) return real.set(key, value);
            return Effect.promise(
              () => new Promise<void>((resolve) => hold.waiting.push(resolve)),
            ).pipe(Effect.andThen(real.set(key, value)));
          }),
      }),
    ),
  ).pipe(Layer.provide(store));

/**
 * The sheet over the device's disk as it stands, open, beside the stand-in
 * home; `scheme` is the scheme its look is held to (the system's by
 * default), `promises` the collections the app's layer teaches. Every frame
 * of the document is held to `addSheetFaults` and each fault kept, at most
 * 8, with `a tap under the open sheet` and `a sheet shown with its look
 * never checked`.
 */
export const mountShelves = async (
  options: {
    readonly time?: Time;
    readonly promises?: readonly string[];
    readonly scheme?: () => Scheme;
  } = {},
) => {
  const scheme = options.scheme ?? systemScheme;
  const hold: Hold = { armed: false, planting: false, waiting: [] };
  const layer = appLayer({
    source: scriptedSource(recite(passage.text, { skip: [], every: 5, pace: 3 })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: storeHeld(hold),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voiceSource,
    promises: options.promises ?? [],
  }).pipe(
    Layer.provideMerge(Layer.merge(clockOf(options.time ?? { now: null }), Logger.layer([]))),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const faults: string[] = [];
  const known = new Map<string, readonly string[]>();
  const counts: Counts = { done: 0, any: 0, added: 0 };
  const frames = { open: 0, looked: 0 };
  const shown = { modal: null as Element | null, looked: false };
  const keep = (fault: string) => {
    if (faults.length < 8 && !faults.includes(fault)) faults.push(fault);
  };
  const ended = () => {
    if (shown.modal !== null && !shown.looked) keep('a sheet shown with its look never checked');
  };
  const frame = () => {
    const modal = sheetOf();
    if (modal !== shown.modal) {
      ended();
      shown.modal = modal;
      shown.looked = false;
    }
    if (modal !== null) {
      frames.open += 1;
      if (remembered(known, 'drawn', modal, drawn)) {
        frames.looked += 1;
        shown.looked = true;
      }
    }
    for (const fault of addSheetFaults(document, scheme(), known, hold.planting)) keep(fault);
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
  const root = createRoot(host);
  const tree = (given: SheetProps | null) => (
    <RegistryProvider initialValues={[[runtime.layer, layer]]}>
      <Stage given={given} counts={counts} />
    </RegistryProvider>
  );
  await act(async () => root.render(tree(null)));
  const until = async (holds: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const activate = () => activateSheet(until);
  /** Gives the sheet `given` as its props in place of the stand-in's own (none: its own again). */
  const show = async (given: SheetProps | null) => {
    await act(async () => root.render(tree(given)));
  };
  /** Taps the control named `label` in the sheet (twice in one turn when `twice`); answers whether it showed. */
  const tap = async (label: string, twice = false) => {
    const node = sheetControl(label);
    if (node === undefined) return false;
    await act(async () => {
      click(node);
      if (twice) click(node);
    });
    return true;
  };
  /** Taps two controls of the sheet in one turn. */
  const tapBoth = async (first: string, second: string) => {
    const one = sheetControl(first);
    const two = sheetControl(second);
    if (one === undefined || two === undefined) return false;
    await act(async () => {
      click(one);
      click(two);
    });
    return true;
  };
  /** Escape, as the web's `onRequestClose` hears it: a key up on the page. */
  const escape = async () => {
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Escape' }),
      );
    });
  };
  /** The stand-in's `Add verses` while the sheet is closed, then the sheet made active; answers whether it showed. */
  const openAgain = async () => {
    const node = [...host.querySelectorAll(CONTROL)].find((each) => nameOf(each) === 'Add verses');
    if (node === undefined) return false;
    await act(async () => {
      click(node);
    });
    return activate();
  };
  /**
   * Taps `label` (a `Plant`) once, twice, or then `Done`, in one turn, and
   * holds its write until it comes; every frame until the write is let go
   * is held to the pending rule, as is the frame the hold shows, and
   * `during` runs while it is held. Answers whether a write came within 3 s.
   */
  const plantHeld = async (
    label: string,
    how: 'once' | 'twice' | 'then-Done',
    during: () => Promise<void> = async () => {},
  ) => {
    const plant = sheetControl(label);
    const other = how === 'then-Done' ? sheetControl('Done') : plant;
    if (plant === undefined || other === undefined) return false;
    hold.armed = true;
    hold.planting = true;
    await act(async () => {
      click(plant);
      if (how !== 'once') click(other);
    });
    const came = await until(() => hold.waiting.length > 0);
    for (const fault of addSheetFaults(document, scheme(), known, true)) keep(fault);
    await during();
    hold.planting = false;
    hold.armed = false;
    await act(async () => {
      for (const resolve of hold.waiting.splice(0)) resolve();
    });
    return came;
  };
  const settle = (want: SheetSeen) => settleSheet(until, want);
  const leave = async () => {
    ended();
    watch.disconnect();
    document.removeEventListener('click', under, true);
    await act(async () => root.unmount());
    host.remove();
  };
  return {
    host,
    faults,
    counts,
    frames,
    until,
    activate,
    show,
    tap,
    tapBoth,
    escape,
    openAgain,
    plantHeld,
    settle,
    leave,
  };
};
