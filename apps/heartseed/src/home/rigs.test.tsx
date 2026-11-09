/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction -- a React screen test: it drives a rig's promise-based launch and waits one after another, over a disk whose recall is written as the garden writes it (JSON); a parsed node's absent label is null. */

/**
 * The rig contract (hshomerigs R2, R3), for every rig of Today's run: a
 * launch on a read garden with the passage due lands on home with `Begin`,
 * and the rig's own step takes it to Today, which shows the passage with
 * `Say it`; the screens, pending dropped, are home then Today. A passage
 * planted at the launch shows home's done state, with no `Begin` and no
 * Today after it. A launch on an unread garden opens Today alone, with no
 * `Your field` in any frame. Every frame holds to the root's frame rule
 * (`watchedLaunch`).
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { keyOf } from '../test/garden-model';
import { screensOf, watchedLaunch } from '../test/root-rule';
import { deviceOf, launch, PASSAGE, text } from '../test/run-rig';
import { wakeLaunch } from '../test/wake-rig';

const T0 = Date.UTC(2026, 3, 1, 9);

/** The passage's one record, recalled with Good at `at`. */
const recordAt = (at: number) => {
  const recall = recallOf(passage.reference, at, 3, 0);
  return [keyOf(recall), JSON.stringify(recall)] as const;
};

/** A record recalled long before `T0`, so the passage is due at `T0`. */
const DUE = recordAt(Date.UTC(2020, 0, 1, 12));

/** A record recalled at `T0`, so nothing is due at `T0`. */
const FRESH = recordAt(T0);

const READ = { unread: false, refuse: false };

/** A launch watched by the root's rule, as `watchedLaunch` answers it. */
interface Watched {
  readonly host: Element;
  readonly watch: {
    readonly faults: readonly string[];
    readonly frames: readonly { readonly headings: readonly string[] }[];
  };
  readonly home: () => boolean;
  readonly today: () => boolean;
  readonly reference: () => string;
}

/** The rig's own waits: until `holds`, at most `ms`. */
type Until = (holds: () => boolean, ms?: number) => Promise<boolean>;

const named = (host: Element, label: string) =>
  [...host.querySelectorAll('[role="button"]')].find(
    (node) => (node.getAttribute('aria-label') ?? text(node)) === label,
  );

/** Whether `host` shows a button named `label`. */
const shows = (host: Element, label: string) => named(host, label) !== undefined;

/**
 * Holds one launch to the contract: home shows with `Begin` before the
 * rig's `step`, then Today shows the passage with `Say it`; the screens,
 * pending dropped, are home then Today, and no frame faults the root's rule.
 */
const throughHome = async (watched: Watched, until: Until, step: () => Promise<unknown>) => {
  expect(await until(() => watched.home() || watched.today())).toBe(true);
  const begun = watched.home() && shows(watched.host, 'Begin');
  await step();
  expect(await until(() => watched.today() && shows(watched.host, 'Say it'))).toBe(true);
  expect({
    begun,
    screens: screensOf(watched.watch.frames).filter((each) => each !== 'pending'),
    reference: watched.reference(),
    sayIt: shows(watched.host, 'Say it'),
    faults: watched.watch.faults,
  }).toEqual({
    begun: true,
    screens: ['Your field', 'Today'],
    reference: passage.reference,
    sayIt: true,
    faults: [],
  });
};

describe('every rig of Today’s run launches through home', () => {
  it('run-rig’s launch shows home, then Today by Begin', async () => {
    const w = await watchedLaunch('read', () => launch(deviceOf([DUE]), READ, { now: T0 }));
    await throughHome(w, w.app.until, async () => expect(await w.app.tap('Begin')).toBe(true));
    expect(await w.end()).toEqual([]);
  });

  it('wake-rig’s launch shows home, then Today by Begin', async () => {
    const w = await watchedLaunch('read', () =>
      wakeLaunch(deviceOf([DUE]), READ, { now: T0 }, [PASSAGE]),
    );
    await throughHome(w, w.app.until, async () => expect(await w.app.tap('Begin')).toBe(true));
    expect(await w.end()).toEqual([]);
  });

  it('a passage planted at the launch shows home’s done state, and no Today follows', async () => {
    const w = await watchedLaunch('read', () => launch(deviceOf([FRESH]), READ, { now: T0 }));
    expect(await w.app.until(w.home)).toBe(true);
    await w.app.until(() => w.today(), 50);
    expect({
      counts: w.counts(),
      begin: w.app.has('Begin'),
      screens: screensOf(w.watch.frames).filter((each) => each !== 'pending'),
      faults: w.watch.faults,
    }).toEqual({
      counts: 'Nothing to tend now',
      begin: false,
      screens: ['Your field'],
      faults: [],
    });
    expect(await w.end()).toEqual([]);
  });

  it('an unread garden opens Today alone, with no Your field in any frame', async () => {
    const w = await watchedLaunch('unread', () =>
      launch(deviceOf([DUE]), { unread: true, refuse: false }, { now: T0 }),
    );
    expect(await w.app.until(() => w.today() && w.app.has('Say it'))).toBe(true);
    expect({
      screens: screensOf(w.watch.frames).filter((each) => each !== 'pending'),
      field: w.watch.frames.some((frame) => frame.headings.includes('Your field')),
      faults: w.watch.faults,
    }).toEqual({ screens: ['Today'], field: false, faults: [] });
    expect(await w.end()).toEqual([]);
  });
});
