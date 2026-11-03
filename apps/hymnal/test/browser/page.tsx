/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noTernary, effect/noGlobals, effect/noNewPromise -- the browser test's page, a host boundary: plain DOM code that finds the list's scroller and rows, which the DOM gives as nullable elements, and answers the test's waits as promises. */

// oxlint-disable-next-line import/no-unassigned-import -- it changes the page's console and Error before React reads them.
import './traces';

import { useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { App } from './app';

export interface Jump {
  readonly left: number;
  readonly went: number;
}

export interface Seen {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

export interface First {
  readonly drawn: boolean;
  readonly blank: number;
  readonly empty: number;
}

export interface Hymnal {
  readonly errors: Array<string>;
  hydrated: boolean;
  eventBeforeHydration: boolean;
  readonly heard: () => Promise<void>;
  readonly hydrate: () => void;
  readonly place: () => { readonly top: number; readonly max: number } | undefined;
  readonly scroll: (top: number) => number;
  readonly jumps: Array<Jump>;
  readonly on: (path: string) => boolean;
  readonly showing: () => boolean;
  readonly middle: () => Seen;
  readonly blank: () => number;
  readonly watch: (path: string, label: string) => Promise<First>;
  watching?: Promise<First>;
  readonly away: (top: number) => Promise<number>;
  readonly early: () => Promise<number>;
  readonly leave: (top: number, tab?: string) => { readonly top: number; readonly label: string };
  readonly leftBeforeScrollEvent: () => boolean;
}

declare global {
  interface Window {
    hymnal: Hymnal;
  }
}

const scroller = (): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('#root div')].find((node) =>
    /(auto|scroll)/.test(getComputedStyle(node).overflowY),
  );

const rows = (node: HTMLElement) =>
  [...node.querySelectorAll<HTMLElement>('[aria-label]')].filter((row) =>
    /^\d+, /.test(row.getAttribute('aria-label') ?? ''),
  );

const shown = (node: HTMLElement) => {
  const view = node.getBoundingClientRect();
  return rows(node)
    .map((row) => ({ row, box: row.getBoundingClientRect() }))
    .filter(({ box }) => box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5);
};

const middleOf = (node: HTMLElement) => {
  const seen = shown(node);
  const found = seen[Math.floor(seen.length / 2)];
  if (!found) throw new Error('no row on screen');
  return found;
};

const blankOf = (node: HTMLElement) => {
  const view = node.getBoundingClientRect();
  const top = view.top;
  const bottom = Math.min(view.bottom, view.top + node.scrollHeight - node.scrollTop);
  const covered = rows(node)
    .map((row) => row.getBoundingClientRect())
    .map((box) => [Math.max(top, box.top), Math.min(bottom, box.bottom)] as const)
    .filter(([from, to]) => to > from)
    .toSorted(([a], [b]) => a - b);
  let reached = top;
  let gaps = 0;
  for (const [from, to] of covered) {
    if (from > reached) gaps += from - reached;
    reached = Math.max(reached, to);
  }
  if (bottom > reached) gaps += bottom - reached;
  return Math.round(gaps);
};

const errors: Array<string> = [];
const jumps: Array<Jump> = [];

let left: { readonly node: HTMLElement; readonly top: number } | undefined;

let wheeled = -Infinity;

let departure: { readonly node: HTMLElement; heard: boolean } | undefined;

addEventListener('wheel', () => void (wheeled = performance.now()), {
  capture: true,
  passive: true,
});

document.addEventListener(
  'scroll',
  (event) => {
    const node = scroller();
    if (node === undefined || event.target !== node) return;
    if (performance.now() - wheeled < 300) {
      left = { node, top: node.scrollTop };
      return;
    }
    if (left === undefined || left.node !== node) return;
    if (Math.abs(node.scrollTop - left.top) > 1)
      jumps.push({ left: left.top, went: node.scrollTop });
  },
  true,
);

let hydrating = false;

let onHeard: (() => void) | undefined;

document.addEventListener(
  'scroll',
  (event) => {
    if (hydrating || !event.isTrusted || event.target !== scroller()) return;
    window.hymnal.eventBeforeHydration = true;
    onHeard?.();
  },
  true,
);

const report = console.error.bind(console);
console.error = (...args: Array<unknown>) => {
  const said = args.map(String).join(' ');
  if (/hydrat/i.test(said)) errors.push(said);
  report(...args);
};

function Hydrated() {
  useEffect(() => {
    window.hymnal.hydrated = true;
  }, []);
  return null;
}

window.hymnal = {
  errors,
  hydrated: false,
  eventBeforeHydration: false,
  heard: () =>
    new Promise<void>((done, fail) => {
      const late = setTimeout(() => {
        onHeard = undefined;
        fail(new Error('no scroll event on the list before hydration within a second'));
      }, 1000);
      const heard = () => {
        onHeard = undefined;
        clearTimeout(late);
        done();
      };
      if (window.hymnal.eventBeforeHydration) heard();
      else onHeard = heard;
    }),
  hydrate: () => {
    if (hydrating) return;
    hydrating = true;
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    hydrateRoot(
      root,
      <>
        <App path={location.pathname} />
        <Hydrated />
      </>,
      { onRecoverableError: (error) => void errors.push(String(error)) },
    );
  },
  place: () => {
    const node = scroller();
    return node && { top: node.scrollTop, max: node.scrollHeight - node.clientHeight };
  },
  scroll: (top) => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    node.scrollTop = top;
    left = { node, top: node.scrollTop };
    return node.scrollTop;
  },
  jumps,
  on: (path) => document.getElementById(`screen:${path}`) !== null,
  showing: () => {
    const node = scroller();
    return node !== undefined && shown(node).length > 0;
  },
  middle: () => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    const { row, box } = middleOf(node);
    return {
      label: row.getAttribute('aria-label') ?? '',
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      height: box.height,
    };
  },
  blank: () => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    return blankOf(node);
  },
  watch: (path, label) =>
    new Promise<First>((done) => {
      let empty = 0;
      const look = () => {
        const node = window.hymnal.on(path) ? scroller() : undefined;
        if (node === undefined || rows(node).length === 0) {
          if (node !== undefined) empty += 1;
          requestAnimationFrame(look);
          return;
        }
        done({
          drawn: shown(node).some(({ row }) => row.getAttribute('aria-label') === label),
          blank: blankOf(node),
          empty,
        });
      };
      requestAnimationFrame(look);
    }),
  early: () =>
    new Promise<number>((done) => {
      const late = setTimeout(() => {
        observer.disconnect();
        done(0);
      }, 2000);
      const observer = new MutationObserver(() => {
        const node = scroller();
        if (node === undefined || node.scrollTop <= 0) return;
        observer.disconnect();
        clearTimeout(late);
        const at = node.scrollTop;
        node.scrollTop = 0;
        left = { node, top: node.scrollTop };
        done(at);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }),
  away: (top) => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    const nudge = 3 * 44;
    const max = node.scrollHeight - node.clientHeight;
    node.scrollTop = top > max / 2 ? top - nudge : top + nudge;
    left = { node, top: node.scrollTop };
    const at = node.scrollTop;
    return new Promise<number>((done, fail) => {
      const late = setTimeout(() => fail(new Error(`no scroll event at ${at}`)), 1000);
      node.addEventListener(
        'scroll',
        () => {
          clearTimeout(late);
          setTimeout(() => done(at), 150);
        },
        { once: true },
      );
    });
  },
  leave: (top, tab) => {
    const node = scroller();
    if (node === undefined) throw new Error('the list is not shown');
    const heard = { node, heard: false };
    departure = heard;
    node.addEventListener('scroll', () => {
      if (node.isConnected) heard.heard = true;
    });
    node.scrollTop = top;
    left = { node, top: node.scrollTop };
    const { row } = middleOf(node);
    const target =
      tab === undefined
        ? row
        : [...document.querySelectorAll<HTMLElement>('[role="navigation"] a')].find(
            (link) => link.textContent === tab,
          );
    if (target === undefined) throw new Error(`no link to ${tab}`);
    target.click();
    return { top: left.top, label: row.getAttribute('aria-label') ?? '' };
  },
  leftBeforeScrollEvent: () =>
    departure !== undefined && !departure.node.isConnected && !departure.heard,
};

if (!new URLSearchParams(location.search).has('hold')) window.hymnal.hydrate();
