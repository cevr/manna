/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noTryCatch -- a React screen test: it mounts the root in happy-dom through the wake rig's promise-based steps over a disk whose recall is written as the garden writes it (JSON), and sets the host's zone through `process.env.TZ`, put back in a `finally` even when a step throws (to UTC, bun test's own zone, when it was unset: an unset `TZ` would leave the cases after it in the host machine's zone). */

/**
 * The greeting at each return to the foreground (hshomeroot R9), through the
 * wake rig (`src/test/wake-rig.tsx`), whose host holds the foreground's one
 * subscription: a second subscriber makes its `send` throw. Every frame is
 * held to the root's frame rule (`watchedLaunch`). Each case names the
 * greeting it expects, words and icon: read at home's mount, kept while the
 * clock moves with no return, and read again at a return (a `background`,
 * then an `active`) across 12:00, 18:00 and 04:00; kept across an
 * `inactive` alone and a `background` with no `active` after it; in New
 * York and in Kolkata across their own noon; and, after a return while
 * Today shows, read at home's next mount by the clock then.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { keyOf } from '../test/garden-model';
import { watchedLaunch } from '../test/root-rule';
import { deviceOf, PASSAGE, text } from '../test/run-rig';
import { wakeLaunch } from '../test/wake-rig';
import { hostZone, offsetIn, travel } from '../test/zone';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = Date.UTC(2026, 10, 5);

const ICON = /\/assets\/home\/([a-z]+)-(?:light|dark)\.png$/u;

/** A device whose garden holds the passage, recalled long ago, so a read launch opens home with `Begin`. */
const planted = () => {
  const recall = recallOf(passage.reference, Date.UTC(2020, 0, 1, 12), 3, 0);
  return deviceOf([[keyOf(recall), JSON.stringify(recall)]]);
};

/** A launch on home at `time.now`, held to the root's rule, the host's state sent by the test. */
const launchHome = async (time: { now: number }) => {
  const launched = await watchedLaunch('read', () =>
    wakeLaunch(planted(), { unread: false, refuse: false }, time, [PASSAGE]),
  );
  expect(await launched.app.until(launched.home)).toBe(true);
  return launched;
};

type Home = Awaited<ReturnType<typeof launchHome>>;

/** The greeting home shows: its words and its icon's name. */
const greeted = (home: Home) => {
  const greeting = home.host.querySelector('[data-testid="greeting"]');
  const icon = ICON.exec(greeting?.querySelector('img')?.getAttribute('src') ?? '');
  return [text(greeting), icon?.[1] ?? '<no home icon>'];
};

/** The greeting once it shows `words`, or as it stands after a short wait when it never does. */
const greetedAs = async (home: Home, words: string) => {
  await home.app.until(() => greeted(home)[0] === words, 500);
  return greeted(home);
};

/** The greeting after a few frames with nothing more done, so a change that would come has come. */
const settled = async (home: Home) => {
  await home.app.until(() => false, 8);
  return greeted(home);
};

/** Every fault the launch's frames showed: the root's rule, then the run rig's. */
const faultsOf = (home: Home) => [...home.watch.faults, ...home.app.faults];

/** The instant the wall clock in `zone` reads `minutes` past midnight on `DAY`. */
const wallIn = (zone: string, minutes: number) =>
  DAY + minutes * MINUTE - offsetIn(zone, DAY + 12 * HOUR) * MINUTE;

describe('the greeting at each return', () => {
  it('reads the clock at home’s mount and again at each return across 12:00, 18:00 and 04:00, never in between', async () => {
    const time = { now: DAY + 11 * HOUR + 59 * MINUTE };
    const home = await launchHome(time);
    expect(greeted(home)).toEqual(['Good morning', 'sun']);

    time.now = DAY + 12 * HOUR;
    expect(await settled(home)).toEqual(['Good morning', 'sun']);
    await home.app.send(['inactive', 'active']);
    expect(await settled(home)).toEqual(['Good morning', 'sun']);
    await home.app.send(['background']);
    expect(await settled(home)).toEqual(['Good morning', 'sun']);
    await home.app.send(['active']);
    expect(await greetedAs(home, 'Good afternoon')).toEqual(['Good afternoon', 'sun']);

    time.now = DAY + 17 * HOUR + 59 * MINUTE;
    await home.app.send(['background', 'active']);
    expect(await settled(home)).toEqual(['Good afternoon', 'sun']);
    time.now = DAY + 18 * HOUR;
    expect(await settled(home)).toEqual(['Good afternoon', 'sun']);
    await home.app.send(['background', 'active']);
    expect(await greetedAs(home, 'Good evening')).toEqual(['Good evening', 'moon']);

    time.now = DAY + 27 * HOUR + 59 * MINUTE;
    await home.app.send(['background', 'active']);
    expect(await settled(home)).toEqual(['Good evening', 'moon']);
    time.now = DAY + 28 * HOUR;
    await home.app.send(['background', 'active']);
    expect(await greetedAs(home, 'Good morning')).toEqual(['Good morning', 'sun']);

    expect(faultsOf(home)).toEqual([]);
    expect(await home.end()).toEqual([]);
  });

  for (const zone of ['America/New_York', 'Asia/Kolkata'])
    it(`reads it again at a return across 12:00 in ${zone}`, async () => {
      const before = hostZone();
      travel(zone);
      try {
        const time = { now: wallIn(zone, 11 * 60 + 59) };
        const home = await launchHome(time);
        expect(greeted(home)).toEqual(['Good morning', 'sun']);
        time.now = wallIn(zone, 12 * 60);
        expect(await settled(home)).toEqual(['Good morning', 'sun']);
        await home.app.send(['background', 'active']);
        expect(await greetedAs(home, 'Good afternoon')).toEqual(['Good afternoon', 'sun']);
        expect(faultsOf(home)).toEqual([]);
        expect(await home.end()).toEqual([]);
      } finally {
        travel(before ?? 'UTC');
      }
    });

  it('reads it at home’s next mount after a return while Today shows, by the clock then', async () => {
    const time = { now: DAY + 11 * HOUR + 59 * MINUTE };
    const home = await launchHome(time);
    expect(greeted(home)).toEqual(['Good morning', 'sun']);
    await home.app.tap('Begin');
    expect(await home.app.until(home.today)).toBe(true);
    time.now = DAY + 12 * HOUR;
    await home.app.send(['background', 'active']);
    time.now = DAY + 18 * HOUR;
    expect(await home.app.until(() => home.app.has('Your field'))).toBe(true);
    await home.app.tap('Your field');
    expect(await home.app.until(home.home)).toBe(true);
    expect(await settled(home)).toEqual(['Good evening', 'moon']);
    expect(faultsOf(home)).toEqual([]);
    expect(await home.end()).toEqual([]);
  });
});
