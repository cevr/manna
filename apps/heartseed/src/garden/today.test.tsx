/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen test: it mounts Today in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` until the frame the test waits on lands, at most 3 s; it reads nodes whose absent attributes are null and writes the device's records as JSON text. */

/**
 * Today's stage as a reader and a screen reader meet it: the route mounted
 * in happy-dom (react-native-web) under the app's own layer over the
 * scripted recital (the passage less its 11th word), the app's real store
 * on the device's `One.Database` (`src/test/one.tsx`) and a recording
 * chime. A restart is a new registry over the same disk. A disk with no
 * recall of any verse opens the first minute (`src/first`), so each launch
 * here starts with a recall on the disk: the passage's, or, for the passage
 * not planted, another verse's.
 *
 * The stage line reads `Stage: <stage>`, the plant beside it is hidden from
 * the screen reader and drawn one way per stage in the prototype's
 * colours, and the growth line shows only while the finished recital it
 * names is on the screen. Every frame (each DOM mutation batch) is watched:
 * until the garden's read completes, and for the whole session when it
 * failed, no frame names a stage, a plant, planting or growth. Another
 * verse's plant never shows as the passage's. It counts words without
 * printing one.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer } from 'effect';
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
import { DAY } from '../test/garden-model';
import { device } from '../test/one';
import { voiceSource } from '../voice/source';

const PREFIX = 'heartseed/recall/';

/** A verse other than the passage, whose recall on the disk keeps the launch out of the first minute. */
const OTHER = 'Made 1:1';

/** The prototype's colours, as the browser computes them: the gold of a seed and a ripe ear, the leaf's green, the unripe ear's green, and the soil. */
const GOLD = 'rgba(212, 166, 64, 1.00)';
const LEAF = 'rgba(111, 154, 74, 1.00)';
const GREEN_EAR = 'rgba(156, 191, 106, 1.00)';
const SOIL = 'rgba(138, 110, 75, 1.00)';

/** Words that claim a stage, a plant, planting or growth, in any text or attribute (react-native-web's `r-flexGrow` class is no claim, so growth is matched as its own word). */
const CLAIM = /stage|plant|grew|\bgrow|growth|seed|blade|\bear\b|full corn/iu;

/** An element as drawn, read without a word: its tag, its exact class set and its inline style. */
const lookOf = (node: Element) =>
  `${node.tagName} ${[...node.classList].toSorted().join(' ')} | ${node.getAttribute('style') ?? ''}`;

/** Every look drawn inside a read plant, with the stages it was drawn at, over every mount of this file. */
const PLANT_LOOKS = new Map<string, Set<string>>();

/** Every look in a frame drawn before the garden's read completed or through an unread session, over every mount of this file. */
const UNREAD_LOOKS = new Set<string>();

/** A recall of the passage at `startedAt`, recalled alone with Good. */
const recallAt = (startedAt: number, reference = passage.reference): Recall => ({
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
const recordOf = (recall: Recall) =>
  [`${PREFIX}${recall.reference}/${recall.startedAt}`, JSON.stringify(recall)] as const;

/** The records of a verse said with Good on each due day until its card's stability reaches 21 days. */
const fullCorn = (reference = passage.reference) => {
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
const passageKeys = () =>
  [...device.disk.keys()].filter((key) => key.startsWith(`${PREFIX}${passage.reference}/`));

/**
 * Today over the scripted recital, the app's store on the device (built
 * once `held` resolves, as a slow launch would) and a chime that records
 * into `chimes`; each mount is a fresh registry, a launch. Every frame is
 * read for a claim while the garden is not read.
 */
const mount = async (chimes: Growth[], held: Promise<void> = Promise.resolve()) => {
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
  });
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
  /** Says the passage to its summary. */
  const say = async () => {
    const summary = one('[data-testid="summary"]');
    await click(sayIt());
    expect(
      await until(
        () =>
          one('[data-testid="summary"]') !== null &&
          one('[data-testid="summary"]') !== summary &&
          sayIt() !== undefined,
      ),
    ).toBe(true);
  };
  const radio = (name: string) =>
    [...host.querySelectorAll('[role="radiogroup"] [role="radio"]')].find(
      (node) => node.getAttribute('aria-label') === name,
    );
  const leave = async () => {
    watch.disconnect();
    await act(async () => root.unmount());
  };
  return { one, until, click, stage, growth, plant, drawn, say, radio, frames, leave };
};

describe('Today’s stage over the device’s store', () => {
  it('reads not planted, then a gold seed, grows to a blade under its letters and then to a green ear, a chime each, falls back to a blade at a peek, keeps it through a restart, falls to a seed at Again, and climbs back silently', async () => {
    device.launch([recordOf(recallAt(Date.UTC(2026, 0, 5, 9), OTHER))]);
    const chimes: Growth[] = [];
    const today = await mount(chimes);
    expect(await today.until(() => today.stage() !== null)).toBe(true);
    expect([today.stage(), today.growth(), today.plant() !== null]).toEqual([
      'Stage: not planted',
      null,
      false,
    ]);

    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: seed')).toBe(true);
    expect([today.growth(), today.plant()?.getAttribute('aria-hidden'), chimes]).toEqual([
      null,
      'true',
      [],
    ]);
    expect(today.drawn()).toEqual([SOIL, GOLD]);
    expect(passageKeys()).toHaveLength(1);

    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: blade')).toBe(true);
    expect([today.growth(), today.drawn()]).toEqual(['Grew to a blade.', [SOIL, LEAF, LEAF]]);
    expect(chimes.map(({ reference, from, to }) => [reference, from, to])).toEqual([
      [passage.reference, 'seed', 'blade'],
    ]);

    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: ear')).toBe(true);
    expect([today.growth(), today.drawn()]).toEqual([
      'Grew to an ear.',
      [SOIL, LEAF, LEAF, GREEN_EAR],
    ]);
    expect(chimes.map(({ reference, from, to }) => [reference, from, to])).toEqual([
      [passage.reference, 'seed', 'blade'],
      [passage.reference, 'blade', 'ear'],
    ]);

    await today.click(today.one('[data-testid="word-10"]'));
    expect(await today.until(() => today.stage() === 'Stage: blade')).toBe(true);
    expect([today.growth(), chimes.length, passageKeys().length, today.drawn()]).toEqual([
      null,
      2,
      3,
      [SOIL, LEAF, LEAF],
    ]);
    await today.leave();

    device.launch();
    const again = await mount(chimes);
    expect(await again.until(() => again.stage() === 'Stage: blade')).toBe(true);
    expect([again.growth(), again.plant()?.getAttribute('aria-hidden')]).toEqual([null, 'true']);

    await again.say();
    expect(await again.until(() => again.stage() === 'Stage: ear')).toBe(true);
    expect(again.growth()).toBe('Grew to an ear.');
    expect(chimes.map(({ from, to }) => [from, to])).toEqual([
      ['seed', 'blade'],
      ['blade', 'ear'],
      ['blade', 'ear'],
    ]);

    await again.click(again.radio('Again'));
    expect(await again.until(() => again.stage() === 'Stage: seed')).toBe(true);
    expect([again.growth(), chimes.length]).toEqual([null, 3]);

    await again.click(again.radio('Good'));
    expect(await again.until(() => again.stage() === 'Stage: ear')).toBe(true);
    expect([again.growth(), chimes.length, passageKeys().length]).toEqual([
      'Grew to an ear.',
      3,
      4,
    ]);
    await again.leave();
  });

  it('claims nothing in any frame while the launch is held, opens nothing, and reads full corn once released, drawn as a gold ear with its awn', async () => {
    device.launch(fullCorn());
    const gate = Promise.withResolvers<void>();
    const today = await mount([], gate.promise);
    expect(await today.until(() => false, 20)).toBe(false);
    expect([
      today.one('[data-testid="reference"]') !== null,
      today.frames.seen > 0,
      today.frames.claimed,
      device.calls.open,
    ]).toEqual([true, true, 0, 0]);

    gate.resolve();
    expect(await today.until(() => today.stage() === 'Stage: full corn')).toBe(true);
    expect([today.plant()?.getAttribute('aria-hidden'), today.growth(), today.drawn()]).toEqual([
      'true',
      null,
      [SOIL, LEAF, LEAF, GOLD, GOLD],
    ]);
    expect(today.frames.claimed).toBeGreaterThan(0);
    await today.leave();
  });

  it('claims nothing for the session when every listing fails, says it all the same, writes its recital silently, and reads it at the next launch', async () => {
    device.launch([recordOf(recallAt(Date.now() - DAY))]).fail('keys', 3);
    const chimes: Growth[] = [];
    const today = await mount(chimes);
    expect(await today.until(() => device.calls.keys === 3)).toBe(true);
    await today.say();
    expect(await today.until(() => passageKeys().length === 2)).toBe(true);
    await today.until(() => false, 20);
    expect([today.stage(), today.growth(), today.plant(), today.frames.claimed, chimes]).toEqual([
      null,
      null,
      null,
      0,
      [],
    ]);
    expect(device.calls.keys).toBe(3);
    await today.leave();

    device.launch();
    const next = await mount(chimes);
    expect(await next.until(() => next.stage() === 'Stage: blade')).toBe(true);
    expect([next.growth(), chimes]).toEqual([null, []]);
    await next.leave();
  });

  it('claims nothing for the session when the open fails every attempt, and a recital with the device down keeps nothing', async () => {
    device.launch([recordOf(recallAt(Date.UTC(2026, 0, 5, 9)))]).fail('open', 6);
    const chimes: Growth[] = [];
    const today = await mount(chimes);
    expect(await today.until(() => device.calls.open === 4)).toBe(true);
    await today.say();
    await today.until(() => false, 20);
    expect([
      today.stage(),
      today.plant(),
      today.frames.claimed,
      chimes,
      passageKeys().length,
    ]).toEqual([null, null, 0, [], 1]);
    await today.leave();
  });

  it('reads the passage’s own plant, never another verse’s: with another verse at full corn on the disk, the passage is not planted, then a seed, then grows to a blade and an ear', async () => {
    const other = 'Made 1:1';
    const theirs = fullCorn(other);
    device.launch(theirs);
    const chimes: Growth[] = [];
    const today = await mount(chimes);
    expect(await today.until(() => today.stage() !== null)).toBe(true);
    expect([today.stage(), today.growth(), today.plant() !== null]).toEqual([
      'Stage: not planted',
      null,
      false,
    ]);

    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: seed')).toBe(true);
    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: blade')).toBe(true);
    expect(today.growth()).toBe('Grew to a blade.');
    await today.say();
    expect(await today.until(() => today.stage() === 'Stage: ear')).toBe(true);
    expect(today.growth()).toBe('Grew to an ear.');
    expect(chimes.map(({ reference, from, to }) => [reference, from, to])).toEqual([
      [passage.reference, 'seed', 'blade'],
      [passage.reference, 'blade', 'ear'],
    ]);
    expect([...device.disk].filter(([key]) => key.startsWith(`${PREFIX}${other}/`))).toEqual<
      (readonly [string, string | null])[]
    >(theirs);
    await today.leave();
  });

  it('draws no part of a plant, with or without a test id or label, in any frame of the held, pending and unread launches above, though each of the four stages drew its parts once read', () => {
    const stages = new Set([...PLANT_LOOKS.values()].flatMap((each) => [...each]));
    expect([...stages].toSorted()).toEqual([
      'Stage: blade',
      'Stage: ear',
      'Stage: full corn',
      'Stage: seed',
    ]);
    expect(PLANT_LOOKS.size).toBeGreaterThanOrEqual(6);
    expect(UNREAD_LOOKS.size).toBeGreaterThan(10);
    expect([...PLANT_LOOKS.keys()].filter((look) => UNREAD_LOOKS.has(look))).toEqual([]);
  });
});
