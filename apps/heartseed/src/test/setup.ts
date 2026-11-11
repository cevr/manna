/* oxlint-disable effect/noGlobals, effect/noTestLifecycleHooks, effect/noThrowStatement, effect/noNewError -- Bun's loader takes each stand-in module for a package as source text, so its path is written into it as a JSON literal, and each data module as an object, handed over without a text round trip; every case passes through one check after it, which fails a case that left the host outside UTC by throwing to bun's runner. */

/**
 * The app's tests run its screens under Bun, mounted in a browser's
 * document (happy-dom) as the web build renders them, with `__DEV__` false
 * as in a release build (Reanimated reads it as it loads). Four boundaries
 * stand in, as the bundler and the router would provide them:
 * - `react-native` is react-native-web, as on the web;
 * - `react-native-gesture-handler` is `src/test/gesture.tsx`: a test plays
 *   a gesture's touch through its own callbacks (`gestureOf`);
 * - `virtual:heartseed-passage` is the passage the bundler plugin derives,
 *   by the same script (`vite/passage.ts`), and `virtual:heartseed-kjv` the
 *   corpus, by `vite/kjv.ts`, `virtual:heartseed-lexicon` the natural
 *   voice's list, by `vite/lexicon.ts`, and `virtual:heartseed-licence` the
 *   vendored licence, by `vite/licence.ts`, each derived only when a test
 *   imports it;
 * - `one` is `src/test/one.tsx`: a phone's safe area with no insets, its
 *   haptics felt by nothing, and device info that reads a phone.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';
import { afterEach, beforeEach } from 'bun:test';
import { Clock } from 'effect';

import { readChapters } from '../../vite/kjv';
import { readLexicon } from '../../vite/lexicon';
import { readLicence } from '../../vite/licence';
import { readPassage } from '../../vite/passage';

GlobalRegistrator.register({
  url: 'http://localhost/',
  settings: { device: { prefersReducedMotion: 'reduce' } },
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: false });

plugin({
  name: 'heartseed-test-boundaries',
  setup(build) {
    const web = Bun.resolveSync('react-native-web', import.meta.dir);
    build.module('react-native', () => ({
      contents: `export * from ${JSON.stringify(web)};`,
      loader: 'js',
    }));
    const one = Bun.resolveSync('./one.tsx', import.meta.dir);
    build.module('one', () => ({
      contents: `export * from ${JSON.stringify(one)};`,
      loader: 'js',
    }));
    const gesture = Bun.resolveSync('./gesture.tsx', import.meta.dir);
    build.module('react-native-gesture-handler', () => ({
      contents: `export * from ${JSON.stringify(gesture)};`,
      loader: 'js',
    }));
    build.module('virtual:heartseed-passage', () => ({
      exports: { default: readPassage() },
      loader: 'object',
    }));
    build.module('virtual:heartseed-kjv', () => ({
      exports: { default: readChapters() },
      loader: 'object',
    }));
    build.module('virtual:heartseed-lexicon', () => ({
      exports: { default: readLexicon() },
      loader: 'object',
    }));
    build.module('virtual:heartseed-licence', () => ({
      exports: { default: readLicence() },
      loader: 'object',
    }));
  },
});

const UTC_AT = [Date.UTC(2026, 0, 15, 12), Date.UTC(2026, 6, 15, 12)];

/** How many times Effect's default clock was asked the calendar milliseconds since the count was last read, and whether a case began whose end has not read it. */
const asked = { count: 0, unread: false };

/** Counts each ask of calendar milliseconds on the class `held` (here, the class every default clock is made from), before the class answers it; a clock made before the count began is counted too. */
export const hostAsked = (held: { currentTimeMillisUnsafe: () => number }) => {
  const millis = held.currentTimeMillisUnsafe;
  held.currentTimeMillisUnsafe = function counted(this: typeof held) {
    asked.count += 1;
    return millis.call(this);
  };
};
hostAsked(Object.getPrototypeOf(Clock.Clock.defaultValue()));

/** A case's count holds the asks made since the last case's end was read (a describe's own work among them), and starts at none when the zone's check failed the case before it first. */
beforeEach(() => {
  if (asked.unread) asked.count = 0;
  asked.unread = true;
});

/** Every case ends with the host in UTC, the zone bun test starts in: one that ends elsewhere fails, naming the zone, and UTC is put back first so the cases after it run where they expect. */
afterEach(() => {
  if (UTC_AT.every((at) => new Date(at).getTimezoneOffset() === 0)) return;
  const left = process.env.TZ ?? 'the host’s own zone';
  process.env.TZ = 'UTC';
  throw new Error(
    `the case ended in ${left}, not UTC: a zone it set was not put back, or a walk in it outlived it`,
  );
});

/** Throws when the running case asked Effect's default clock the calendar time, naming the count, after starting the count again. */
export const checkAsked = () => {
  const count = asked.count;
  asked.count = 0;
  asked.unread = false;
  if (count === 0) return;
  throw new Error(
    `the case asked the host’s clock the time through Effect’s default clock, ${count} in all: give its runtime the test’s clock (clockOf in src/test/clock.ts, merged with Layer.provideMerge)`,
  );
};

/** Every case ends having asked Effect's default clock nothing. It runs after the zone's check, so a case that fails both still leaves the host in UTC. */
afterEach(checkAsked);
