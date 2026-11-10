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
 * with no stage line and no home heading as unread, over every mount of
 * the test file's process. Home's frames are neither: home draws plants of
 * its own, read, under no stage line. The done state's and the end of a
 * run's frames are filed as unread, so no look of Today's plant may show
 * there either; the end's are also counted in `frames.end`. Each `renew`'s
 * `Next` ends the run, the passage its one item, and Today then shows the
 * end exactly as `tendedModel` has it (kept in `ends`).
 *
 * The root opens as it opens for a reader: a read launch lands on home,
 * where `begin` takes `Begin` to Today, and an unread one (every listing
 * or open failing) opens Today with no `Your field` in any frame. Every
 * frame, from before the root's first render, is also held to the root's
 * frame rule (`rootFaults` through `watchRoot`), its faults failing the
 * case at `begin` and at `leave`.
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
import { theme } from '../theme';
import { voiceSource } from '../voice/source';
import { clockOf, toDue, type Time } from './clock';
import { DAY } from './garden-model';
import { computed } from './look';
import { device } from './one';
import { END, endShown, watchRoot } from './root-rule';
import { grewLine, tendedModel } from './run-model';
import { renewBySettings } from './settings-rig';

export const PREFIX = 'heartseed/recall/';

/** A verse other than the passage, whose recall on the disk keeps the launch out of the first minute. */
export const OTHER = 'Made 1:1';

/** The instant a launch whose clock is set starts at: long after every record these disks hold. */
export const AT = Date.UTC(2026, 10, 5, 15);

/** The plant's colours in the light scheme (`src/theme.ts`), as the browser computes them: the gold of a seed and a ripe ear, the leaf's green, the unripe ear's green, and the soil. */
export const GOLD = computed(theme.light.gold);
export const LEAF = computed(theme.light.leaf);
export const GREEN_EAR = computed(theme.light.greenEar);
export const SOIL = computed(theme.light.soil);

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
 * read for a claim and filed by its looks. `garden` is whether the launch's
 * read completes; a read launch not held is taken from home to Today by
 * `begin` before the mount answers, a held one is the test's to take once
 * released.
 */
export const mount = async (
  chimes: Growth[],
  held?: Promise<void>,
  time: Time = { now: null },
  garden: 'read' | 'unread' = 'read',
) => {
  const layer = appLayer({
    source: scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 1 })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: Layer.unwrap(
      Effect.as(
        Effect.promise(() => held ?? Promise.resolve()),
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
  const frames = { seen: 0, claimed: 0, end: 0 };
  /** The passage's recalls when the plan Today runs was made: at the launch, then at each `renew`'s Minutes radio. */
  const planned = { recalls: passageRecalls().length };
  /** Each end of a run `renew` met after its `Next`, as Today read: its grew line and grown verses. */
  const ends: { readonly grew: readonly string[]; readonly grown: readonly string[] }[] = [];
  /** Whether the tree claims anything: a pinned node, or a claiming word in any text or attribute. */
  const claims = () =>
    host.querySelector('[data-testid="stage"],[data-testid="plant"],[data-testid="growth"]') !==
      null ||
    CLAIM.test(host.textContent ?? '') ||
    [...host.querySelectorAll('*')].some((node) =>
      [...node.attributes].some((attribute) => CLAIM.test(attribute.value)),
    );
  const headings = () =>
    [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent ?? '');
  /** Files the frame's looks: a read frame's plant parts under its stage, every look of a frame with no stage line and no home heading as unread. */
  const file = () => {
    const label = host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label');
    if (label === undefined || label === null) {
      if (headings().includes('Your field')) return;
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
    if (headings().includes(END)) frames.end += 1;
    file();
  });
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  const rootRule = watchRoot(host, garden);
  /** Holds every frame so far to the root's rule: no fault, and on an unread launch no `Your field` heading in any frame. */
  const rooted = () =>
    expect({
      faults: rootRule.faults,
      field:
        garden === 'unread' && rootRule.frames.some((each) => each.headings.includes('Your field')),
    }).toEqual({ faults: [], field: false });
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
  /**
   * After `Next` on the plan's one item, the passage: Today held to the end
   * of the run exactly as `tendedModel` gives it over that item's recalls
   * when the plan was made and the disk's recalls now (the heading `The
   * field is tended`, no counts line, the grew line and the grown verses by
   * name), kept in `ends`.
   */
  const ended = async () => {
    const tended = tendedModel(
      { plan: [{ reference: passage.reference, recalls: planned.recalls }], hold: null },
      [],
      passageRecalls(),
    );
    let want = '<no end over the run>';
    if (tended !== null)
      want = JSON.stringify({
        headings: [END],
        counts: [],
        grew: [grewLine(tended.length)],
        grown: tended.map((each) => `${each.reference}, ${each.stage}`),
      });
    const shown = () => JSON.stringify(endShown(host));
    await until(() => shown() === want);
    expect({ after: 'Next', shown: shown() }).toEqual({ after: 'Next', shown: want });
    const end = endShown(host);
    ends.push({ grew: end.grew, grown: end.grown });
  };
  /** `Next`, the end of the run it gives (`ended`), the clock set to the passage's due, and the reader's trip through the Settings sheet (`renewBySettings`: `Your field`, the Minutes radio checked, `Done`, `Begin`), ending on Today with the sheet held and its look checked: a new plan, which offers Say it on the passage again with no result shown. */
  const renew = async () => {
    await click(button('Next'));
    await ended();
    toDue(time, passageRecalls());
    const trip = await renewBySettings({ host, until });
    expect({ at: trip.at, sheet: trip.sheet, looked: trip.looked > 0 }, 'the trip').toEqual({
      at: 'Today',
      sheet: [],
      looked: true,
    });
    expect(
      await until(() => sayIt() !== undefined && one('[data-testid="summary"]') === null),
    ).toBe(true);
    planned.recalls = passageRecalls().length;
  };
  const leave = async () => {
    watch.disconnect();
    rootRule.stop();
    await act(async () => root.unmount());
    rooted();
  };
  /**
   * The step from home to Today on a read launch: home shows with its
   * heading alone and `Begin`, no frame faulting the root's rule, and
   * `Begin` taken lands on Today with Say it.
   */
  const begin = async () => {
    expect(await until(() => headings().join('|') === 'Your field')).toBe(true);
    expect({
      headings: headings(),
      begin: button('Begin') !== undefined,
      faults: rootRule.faults,
    }).toEqual({ headings: ['Your field'], begin: true, faults: [] });
    await click(button('Begin'));
    expect(await until(() => headings().join('|') === 'Today' && sayIt() !== undefined)).toBe(true);
  };
  if (garden === 'read' && held === undefined) await begin();
  return {
    one,
    until,
    click,
    stage,
    growth,
    plant,
    drawn,
    say,
    renew,
    radio,
    frames,
    ends,
    begin,
    leave,
  };
};
