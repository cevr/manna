/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen rig: it mounts Today in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` until the frame the test waits on lands, at most 3 s; it reads nodes whose absent attributes are null and writes the device's records as JSON text. */

/**
 * Today's stage as a reader and a screen reader meet it, for the stage
 * tests (`src/garden/today.test.tsx`, `src/garden/today-reads.test.tsx`):
 * the route mounted in happy-dom (react-native-web) under the app's own
 * layer over the scripted recital (the passage less its 11th word), the
 * app's real store on the device's `One.Database` (`src/test/one.tsx`) and
 * a recording chime. A restart is a new registry over the same disk.
 *
 * Every frame (each DOM mutation batch) is watched: each counts as a claim
 * when it names a stage, a plant, planting or growth, and each files its
 * looks, a read plant's parts under its stage and every look of a frame
 * with no stage line as unread, over every mount of the test file's
 * process.
 */

import { RegistryProvider } from '@effect/atom-react';
import { expect } from 'bun:test';
import { Effect, Layer, Logger } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { NEW_CARD, review } from '../fsrs';
import { Chime, type Growth } from '../garden';
import { Haptics, type Recall } from '../sayit';
import { store } from '../store';
import { voiceSource } from '../voice/source';
import { clockOf, toDue, type Time } from './clock';
import { DAY } from './garden-model';
import { device } from './one';

export const PREFIX = 'heartseed/recall/';

/** A verse other than the passage, whose recall on the disk keeps the launch out of the first minute. */
export const OTHER = 'Made 1:1';

/** The instant a launch whose clock is set starts at: long after every record these disks hold. */
export const AT = Date.UTC(2026, 10, 5, 15);

/** The prototype's colours, as the browser computes them: the gold of a seed and a ripe ear, the leaf's green, the unripe ear's green, and the soil. */
export const GOLD = 'rgba(212, 166, 64, 1.00)';
export const LEAF = 'rgba(111, 154, 74, 1.00)';
export const GREEN_EAR = 'rgba(156, 191, 106, 1.00)';
export const SOIL = 'rgba(138, 110, 75, 1.00)';

/** Words that claim a stage, a plant, planting or growth, in any text or attribute (react-native-web's `r-flexGrow` class is no claim, so growth is matched as its own word). */
const CLAIM = /stage|plant|grew|\bgrow|growth|seed|blade|\bear\b|full corn/iu;

/** An element as drawn, read without a word: its tag, its exact class set and its inline style. */
const lookOf = (node: Element) =>
  `${node.tagName} ${[...node.classList].toSorted().join(' ')} | ${node.getAttribute('style') ?? ''}`;

/** Every look drawn inside a read plant, with the stages it was drawn at, over every mount of the test file's process. */
export const PLANT_LOOKS = new Map<string, Set<string>>();

/** Every look in a frame drawn before the garden's read completed or through an unread session, over every mount of the test file's process. */
export const UNREAD_LOOKS = new Set<string>();

/** A recall of the passage at `startedAt`, recalled alone with Good. */
export const recallAt = (startedAt: number, reference = passage.reference): Recall => ({
  reference,
  startedAt,
  grade: 3,
  suggested: 3,
  words: 20,
  missed: 0,
  peeked: 0,
  extra: 0,
});

/** The record of `recall` as the garden writes it. */
export const recordOf = (recall: Recall) =>
  [`${PREFIX}${recall.reference}/${recall.startedAt}`, JSON.stringify(recall)] as const;

/** The records of a verse said with Good on each due day until its card's stability reaches 21 days. */
export const fullCorn = (reference = passage.reference) => {
  const records: (readonly [string, string])[] = [];
  let card = NEW_CARD;
  let at = Date.UTC(2026, 0, 5, 9);
  while (card.stability < 21) {
    card = review(card, 3, at);
    records.push(recordOf(recallAt(at, reference)));
    at = Math.max(card.due, at + DAY);
  }
  return records;
};

/** The passage's records on the device's disk. */
export const passageKeys = () =>
  [...device.disk.keys()].filter((key) => key.startsWith(`${PREFIX}${passage.reference}/`));

/** The passage's recalls on the device's disk. */
export const passageRecalls = () =>
  passageKeys().flatMap((key) => {
    const value = device.disk.get(key);
    if (value === undefined || value === null) return [];
    return [JSON.parse(value) as Recall];
  });

/**
 * Today over the scripted recital, the app's store on the device (built
 * once `held` resolves, as a slow launch would) and a chime that records
 * into `chimes`; each mount is a fresh registry, a launch. Every frame is
 * read for a claim and filed by its looks.
 */
export const mount = async (
  chimes: Growth[],
  held: Promise<void> = Promise.resolve(),
  time: Time = { now: null },
) => {
  const layer = appLayer({
    source: scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 1 })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: Layer.unwrap(
      Effect.as(
        Effect.promise(() => held),
        store,
      ),
    ),
    chime: Layer.succeed(
      Chime,
      Chime.of({ grow: (growth) => Effect.sync(() => void chimes.push(growth)) }),
    ),
    voice: voiceSource,
  }).pipe(Layer.provide(Layer.merge(clockOf(time), Logger.layer([]))));
  const host = document.createElement('div');
  document.body.append(host);
  const frames = { seen: 0, claimed: 0 };
  /** Whether the tree claims anything: a pinned node, or a claiming word in any text or attribute. */
  const claims = () =>
    host.querySelector('[data-testid="stage"],[data-testid="plant"],[data-testid="growth"]') !==
      null ||
    CLAIM.test(host.textContent ?? '') ||
    [...host.querySelectorAll('*')].some((node) =>
      [...node.attributes].some((attribute) => CLAIM.test(attribute.value)),
    );
  /** Files the frame's looks: a read frame's plant parts under its stage, every look of a frame with no stage line as unread. */
  const file = () => {
    const label = host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label');
    if (label === undefined || label === null) {
      for (const node of host.querySelectorAll('*')) UNREAD_LOOKS.add(lookOf(node));
      return;
    }
    for (const node of host.querySelectorAll('[data-testid="plant"], [data-testid="plant"] *')) {
      const look = lookOf(node);
      PLANT_LOOKS.set(look, (PLANT_LOOKS.get(look) ?? new Set()).add(label));
    }
  };
  const watch = new MutationObserver(() => {
    frames.seen += 1;
    if (claims()) frames.claimed += 1;
    file();
  });
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  const one = (selector: string) => host.querySelector(selector);
  const until = async (holds: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const click = (node: Element | null | undefined) =>
    act(async () => {
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  const sayIt = () =>
    [...host.querySelectorAll('[role="button"]')].find(
      (node) => node.getAttribute('aria-label') === 'Say it',
    );
  const stage = () => one('[data-testid="stage"]')?.getAttribute('aria-label') ?? null;
  const growth = () => one('[data-testid="growth"]')?.textContent ?? null;
  const plant = () => one('[data-testid="plant"]');
  /** The plant's parts as drawn, by their colours, read without a word. */
  const drawn = () =>
    [...(plant()?.children ?? [])].map((part) => getComputedStyle(part).backgroundColor);
  const button = (name: string) =>
    [...host.querySelectorAll('[role="button"]')].find(
      (node) => node.getAttribute('aria-label') === name,
    );
  /** Says the passage to its summary, its recall kept: the action reads `Next` (`then`; `Say it` in an unread garden, which runs no plan). */
  const say = async (then: 'Next' | 'Say it' = 'Next') => {
    const summary = one('[data-testid="summary"]');
    await click(sayIt());
    expect(
      await until(
        () =>
          one('[data-testid="summary"]') !== null &&
          one('[data-testid="summary"]') !== summary &&
          button(then) !== undefined,
      ),
    ).toBe(true);
  };
  const radio = (name: string) =>
    [...host.querySelectorAll('[role="radiogroup"] [role="radio"]')].find(
      (node) => node.getAttribute('aria-label') === name,
    );
  /** `Next`, the clock set to the passage's due, and a tap on the Minutes radio checked: a new plan, which offers Say it on the passage again with no result shown. */
  const renew = async () => {
    await click(button('Next'));
    toDue(time, passageRecalls());
    await click(
      host.querySelector('[role="radiogroup"][aria-label="Minutes"] [aria-checked="true"]'),
    );
    expect(
      await until(() => sayIt() !== undefined && one('[data-testid="summary"]') === null),
    ).toBe(true);
  };
  const leave = async () => {
    watch.disconnect();
    await act(async () => root.unmount());
  };
  return { one, until, click, stage, growth, plant, drawn, say, renew, radio, frames, leave };
};
