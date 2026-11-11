/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop, effect/noTernary -- the chooser's rig: it mounts the screen in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work runs on the host's clock, so each turn is handed over in `act` until the frame a test waits on lands, at most 3 s; it reads nodes whose absent attributes are null. */

/**
 * The chooser as a reader and a screen reader meet it, for the chooser's
 * tests: `ChooserScreen` mounted in happy-dom (react-native-web) under the
 * app's own layer over the app's real store on the device's `One.Database`
 * (`one.tsx`), beside a stand-in of the field: a button `Add verses`
 * that opens the chooser again, shown while the chooser has handed the
 * reader back, by its first back (`onBack`, counted in `left.backs`) or by
 * an add (`onAdded`, counted in `left.adds`).
 *
 * Every frame (each DOM mutation batch) is held to the screen's rules and
 * each fault kept: at most one heading; no back, `Plant`, alert or limit
 * line inside a scroll view; `Plant` only over a shown reference of 1-20
 * verses; while a plant the rig tapped (`plantHeld`, which holds its write)
 * has not answered, `Plant`, every verse and the back shown as disabled; and
 * every seen text at WCAG AA against what lies behind it.
 */

import { RegistryProvider } from '@effect/atom-react';
import { Effect, Layer, Logger } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text } from 'react-native';
import passage from 'virtual:heartseed-passage';

import { appLayer, runtime } from '../app';
import { ChooserScreen } from '../chooser/screen';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { themed, useThemed } from '../look';
import { Haptics } from '../sayit';
import { store } from '../store';
import { voiceSource } from '../voice/source';
import { CAP, MOST, type ChooserSeen } from './choose-model';
import { clockOf, START, type Time } from './clock';
import { deadline } from './elapsed';
import { AA, contrastOf } from './contrast';
import { scrolled } from './field-rig';
import { KEPT_LOOKS, lookFaults } from './look';
import { KEY, NAMES } from './passages-model';
import { CORPUS, countIn } from './passages-rig';

/** The first chapter of the canon whose verse count is `count`, in the model's corpus. */
const chapterWith = (count: number) => {
  for (const book of CORPUS.books)
    for (let chapter = 1; chapter <= (CORPUS.counts.get(book) ?? 0); chapter++)
      if (countIn(book, chapter) === count) return { book, chapter };
  return { book: 1, chapter: 1 };
};

/** The chapters the chooser's tests lean on: Psalms 119 (176 verses) and 117 (2), the promise's chapter (book 23, chapter 41), and the first of exactly 20 verses and of 21. */
export const TARGETS = [
  { book: 19, chapter: 119 },
  { book: 19, chapter: 117 },
  { book: 23, chapter: 41 },
  chapterWith(20),
  chapterWith(21),
] as const;

/** A book's name as the model names it. */
export const bookName = (book: number) => NAMES.get(book) ?? `<book ${book}>`;

/** Text as a reader sees it: whitespace collapsed. */
export const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const CONTROL = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

/** A control's name: its label, else its text. */
export const labelOf = (node: Element) => node.getAttribute('aria-label') ?? text(node);

/** Whether a reader sees `node`: no ancestor out of the layout or transparent, its ink not transparent. */
const seen = (node: Element) => {
  for (let at: Element | null = node; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return false;
  }
  return !/rgba\(.*, 0(\.0+)?\)$|transparent/.test(getComputedStyle(node).color);
};

/** The chooser's screen as the reader gets it, or `closed` while the stand-in field shows. */
export const readChooser = (host: Element): ChooserSeen | 'closed' => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  const heading = headings[0];
  if (heading === undefined) return 'closed';
  const controls = [...host.querySelectorAll(CONTROL)];
  const backs = controls
    .filter((node) => node.closest('[data-testid]') === null && /^‹ /.test(text(node)))
    .map(labelOf);
  const one = (id: string) => {
    const nodes = host.querySelectorAll(`[data-testid="${id}"]`);
    if (nodes.length === 0) return undefined;
    if (nodes.length > 1) return `<${nodes.length} ${id}>`;
    return text(nodes[0]);
  };
  const verses = [...host.querySelectorAll('[data-testid="verse"]')];
  const leaves = [...host.querySelectorAll('*')].filter((node) => node.children.length === 0);
  const lines = [...host.querySelectorAll('[role="alert"]')].map(text);
  const labels = leaves
    .map(text)
    .filter((each) => each === 'Old Testament' || each === 'New Testament');
  return {
    heading: headings.length === 1 ? heading : headings.join('|'),
    back: backs.join('|'),
    labels,
    items: [...host.querySelectorAll('[data-testid="book"],[data-testid="chapter"]')].map(labelOf),
    verses: verses.map((node) => [labelOf(node), node.getAttribute('aria-checked') === 'true']),
    footer:
      verses.length === 0
        ? undefined
        : {
            reference: one('chosen-reference'),
            count: one('chosen-count'),
            cap: leaves.some((node) => text(node) === CAP),
            plant: controls.filter((node) => labelOf(node) === 'Plant').length === 1,
          },
    line: lines.length === 0 ? undefined : lines.join(' | '),
  };
};

/** `Plant` only over a shown reference of 1-20 verses: the fault `host` shows now of that rule, if any. */
export const plantFaults = (host: Element): string[] => {
  const plant = [...host.querySelectorAll(CONTROL)].find((node) => labelOf(node) === 'Plant');
  if (plant === undefined) return [];
  const reference = text(host.querySelector('[data-testid="chosen-reference"]'));
  const n = Number.parseInt(text(host.querySelector('[data-testid="chosen-count"]')), 10);
  if (reference === '' || !(n >= 1 && n <= MOST)) return [`Plant over ${reference} of ${n}`];
  return [];
};

/** While a plant the rig tapped has not answered: `Plant`, every verse and the back each shown as disabled. */
const pendingFaults = (host: Element): string[] =>
  [...host.querySelectorAll(CONTROL)]
    .filter(
      (node) =>
        labelOf(node) === 'Plant' ||
        node.getAttribute('data-testid') === 'verse' ||
        /^‹ /.test(text(node)),
    )
    .filter((node) => node.getAttribute('aria-disabled') !== 'true')
    .slice(0, 1)
    .map((node) => `${labelOf(node)} live while a plant is pending`);

/** The frame rules: the faults `host` shows now, `pending` whether a plant the rig tapped has not answered; `known` keeps each style chain's contrast verdict across frames. */
export const chooserFaults = (
  host: Element,
  known = new Map<string, boolean>(),
  pending = false,
): string[] => {
  const faults: string[] = [];
  if (pending) faults.push(...pendingFaults(host));
  const headings = host.querySelectorAll('[role="heading"]');
  if (headings.length > 1) faults.push(`${headings.length} headings`);
  for (const node of host.querySelectorAll(CONTROL)) {
    const id = node.getAttribute('data-testid') ?? '';
    if (id === 'book' || id === 'chapter' || id === 'verse') continue;
    if (scrolled(node)) faults.push(`the control ${labelOf(node)} inside a scroll view`);
  }
  for (const node of host.querySelectorAll('[role="alert"],[data-testid="limit"]'))
    if (scrolled(node)) faults.push(`the line ${text(node).slice(0, 30)} inside a scroll view`);
  faults.push(...plantFaults(host));
  const faint = faintIn(host, known);
  if (faint.length > 0) faults.push(`faint text: ${faint.slice(0, 3).join(', ')}`);
  return faults;
};

/** A node's styles as drawn: its classes and inline style, and each ancestor's, which decide its ink and the ground behind it. */
const styleChain = (node: Element) => {
  const parts: string[] = [];
  for (let at: Element | null = node; at !== null; at = at.parentElement)
    parts.push(`${at.getAttribute('class') ?? ''}/${at.getAttribute('style') ?? ''}`);
  return parts.join('>');
};

/** The seen texts of `host` that read under WCAG AA against what lies behind them, each by its first letters; each distinct style chain is computed once, its verdict kept in `known`. */
export const faintIn = (host: Element, known = new Map<string, boolean>()): string[] =>
  [...host.querySelectorAll('*')]
    .filter((node) => node.children.length === 0 && text(node) !== '')
    .filter((node) => {
      const chain = styleChain(node);
      const faint = known.get(chain) ?? (seen(node) && contrastOf(node) < AA);
      known.set(chain, faint);
      return faint;
    })
    .map((node) => text(node).slice(0, 12));

/** The stand-in field's look, in the scheme's roles as the screens draw them. */
const standIn = themed((color, face) => ({
  ground: { backgroundColor: color.ground },
  ink: { color: color.ink, fontFamily: face },
}));

/** The chooser beside a stand-in field, which offers `Add verses` while the chooser has handed the reader back; `onLeft` hears how it left, by its first back or by an add. */
function Stage({ onLeft }: { readonly onLeft: (how: 'back' | 'added') => void }) {
  const look = useThemed(standIn);
  const [open, setOpen] = useState(true);
  if (open)
    return (
      <ChooserScreen
        onBack={() => {
          onLeft('back');
          setOpen(false);
        }}
        onAdded={() => {
          onLeft('added');
          setOpen(false);
        }}
      />
    );
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

/** The chooser over the device's disk as it stands; every frame is held to the rules and the faults kept. */
export const mountChooser = async (time: Time = { now: START }) => {
  const hold: Hold = { armed: false, planting: false, waiting: [] };
  const layer = appLayer({
    source: scriptedSource(recite(passage.text, { skip: [], every: 5, pace: 3 })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: storeHeld(hold),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voiceSource,
  }).pipe(Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))));
  const host = document.createElement('div');
  document.body.append(host);
  const faults: string[] = [];
  const left = { backs: 0, adds: 0 };
  const known = new Map<string, boolean>();
  const looks = KEPT_LOOKS;
  const watch = new MutationObserver(() => {
    for (const fault of [
      ...chooserFaults(host, known, hold.planting),
      ...lookFaults(host, undefined, looks),
    ])
      if (faults.length < 8) faults.push(fault);
  });
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Stage
          onLeft={(how) => {
            if (how === 'back') left.backs += 1;
            else left.adds += 1;
          }}
        />
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
  /** The control named `label`, if one shows. */
  const control = (label: string) =>
    [...host.querySelectorAll(CONTROL)].find((node) => labelOf(node) === label);
  /** Taps the control named `label` (twice in one turn when `twice`); answers whether it showed. */
  const tap = async (label: string, twice = false) => {
    const node = control(label);
    if (node === undefined) return false;
    await act(async () => {
      click(node);
      if (twice) click(node);
    });
    return true;
  };
  /** Taps two controls in one turn. */
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
  /**
   * Taps `Plant` (twice, or then the back `back`, in one turn) and holds its
   * write until the screen shows the plant pending; every frame until the
   * write is let go is held to the pending rule, and so is the frame the hold
   * shows. Answers whether a write came to the hold within 3 s.
   */
  const plantHeld = async (how: 'once' | 'twice' | 'then-back', back: string) => {
    const plant = control('Plant');
    const other = how === 'then-back' ? control(back) : plant;
    if (plant === undefined || other === undefined) return false;
    hold.armed = true;
    hold.planting = true;
    await act(async () => {
      click(plant);
      if (how !== 'once') click(other);
    });
    const came = await until(() => hold.waiting.length > 0);
    for (const fault of chooserFaults(host, known, true)) if (faults.length < 8) faults.push(fault);
    hold.planting = false;
    hold.armed = false;
    await act(async () => {
      for (const resolve of hold.waiting.splice(0)) resolve();
    });
    return came;
  };
  /** Taps verse `verse` (1-based) of the chapter shown; answers whether it showed. */
  const tapVerseAt = async (verse: number) => {
    const node = host.querySelectorAll('[data-testid="verse"]')[verse - 1];
    if (node === undefined) return false;
    await act(async () => click(node));
    return true;
  };
  /** Waits for the screen `want`; answers the screen read when it never came. */
  const settle = async (want: ChooserSeen | 'closed') => {
    const goal = JSON.stringify(want);
    if (await until(() => JSON.stringify(readChooser(host)) === goal)) return undefined;
    return readChooser(host);
  };
  const leave = async () => {
    watch.disconnect();
    await act(async () => root.unmount());
    host.remove();
  };
  return { host, faults, left, until, control, tap, tapBoth, plantHeld, tapVerseAt, settle, leave };
};
