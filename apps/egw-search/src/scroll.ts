/* oxlint-disable effect/noNullish -- `sessionStorage.getItem` returns `string | null`; that is the platform's signature. */
/* oxlint-disable effect/noNewPromise -- `settled` hands a promise to the traversal below, which waits on it beside a timer; both are plain browser callbacks. */

import { useRegistry } from '@manna/atom-solid';
import * as UrlAtom from '@manna/url-state/atom';
import { Option, Result, Schema as S } from 'effect';
import { onCleanup } from 'solid-js';

const TRAVERSAL_READ_LIMIT = 3000;

const STORAGE_KEY = 'egw-search:scroll';
const KEPT_ENTRIES = 100;
const StoredPositions = S.fromJsonString(S.Array(S.Tuple([S.String, S.Finite])));
const decodeStored = S.decodeUnknownOption(StoredPositions);
const encodeStored = S.encodeSync(StoredPositions);

const loadPositions = (): Map<string, number> => {
  const stored = Result.getOrElse(
    Result.try(() => window.sessionStorage.getItem(STORAGE_KEY)),
    () => null,
  );
  return new Map(Option.getOrElse(decodeStored(stored), () => []));
};

const positions = loadPositions();

const persist = (): void => {
  const kept = [...positions].slice(-KEPT_ENTRIES);
  void Result.try(() => window.sessionStorage.setItem(STORAGE_KEY, encodeStored(kept)));
};

const keep = (key: string, y: number): void => {
  positions.delete(key);
  positions.set(key, y);
};

let reads = 0;
let waiting: (() => void)[] = [];

export const trackRead = <A>(read: Promise<A>): Promise<A> => {
  reads += 1;
  const done = (): void => {
    reads -= 1;
    if (reads > 0) return;
    const wake = waiting;
    waiting = [];
    for (const resume of wake) resume();
  };
  read.then(done, done);
  return read;
};

const settled = (): Promise<void> =>
  new Promise((resolve) => {
    if (reads === 0) {
      resolve();
      return;
    }
    waiting.push(resolve);
    window.setTimeout(resolve, TRAVERSAL_READ_LIMIT);
  });

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

export const useScrollMemory = (): void => {
  const registry = useRegistry();
  let onScreen = registry.get(UrlAtom.entry).key;
  let traversals = 0;

  const restore = (key: string): void => {
    traversals += 1;
    const traversal = traversals;
    const target = Option.getOrElse(Option.fromUndefinedOr(positions.get(key)), () => 0);
    void nextFrame()
      .then(settled)
      .then(nextFrame)
      .then(() => {
        if (traversal !== traversals || onScreen !== key) return;
        window.scrollTo(0, target);
      });
  };

  const onScroll = (): void => keep(onScreen, window.scrollY);
  const onPageHide = (): void => {
    keep(onScreen, window.scrollY);
    persist();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', onPageHide);

  const unsubscribeWrites = registry.subscribe(UrlAtom.href, () => keep(onScreen, window.scrollY));

  const unsubscribe = registry.subscribe(UrlAtom.entry, (entry) => {
    if (entry.key === onScreen) return;
    if (entry.navigation === 'traverse') keep(onScreen, window.scrollY);
    onScreen = entry.key;
    persist();
    if (entry.navigation === 'traverse') restore(entry.key);
  });

  if (positions.has(onScreen)) restore(onScreen);

  onCleanup(() => {
    unsubscribeWrites();
    unsubscribe();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pagehide', onPageHide);
  });
};
