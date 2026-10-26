// The lab's controls as assistive tech and the keyboard meet them, over the
// studio film with the lab API faked: whatever the keyboard focuses (a
// control, a link, a scroll box, a dialog, a receipt) shows the studio's
// ring on every page and in every portal, never the browser's; and every
// floating root (a dialog, a menu, a sheet, a receipt) shows it over its own
// shadow, exactly, on every page that opens it, inside its edge when its box
// fills the view.

import { Effect, type Scope } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { DESK, PHONE, type Viewport, openAsk } from '../../src/lab/fixtures/harness.ts';
import {
  STUDIO_ASK,
  STUDIO_GUIDED,
  guidedRoutes,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import { rightClick } from '../../src/lab/fixtures/gestures.ts';
import { FOCUS_SHOWN, evaluates, waitFor } from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { FLOATING, LEFT_OPEN, pageAfterPage, registry, runFromMenu, sampled } from './registry.ts';
import { ASK_READY } from './studio-states.ts';

const SLOW = 30_000;
/** A page's every root, its registry run once. */
const REGISTRY = 180_000;

/** An agent's ask, `viewport` wide, once it is read. */
const anAsk = (viewport: Viewport = DESK) =>
  Effect.tap(openAsk(studioRoutes, { href: pageHref.ask(STUDIO_ASK), viewport }), ({ page }) =>
    waitFor(page, ASK_READY),
  );

/** An ask with a receipt on it: Copy link run from ⌘K, the page's clock held so it stays. */
const receipted = (viewport: Viewport) =>
  Effect.gen(function* () {
    const { page } = yield* anAsk(viewport);
    yield* page.press('Control+k');
    yield* page.fill('.lab-command-query', 'copy link');
    yield* waitFor(page, '[data-role="command-menu"] [data-command="link.copy"]');
    yield* page.press('Enter');
    yield* waitFor(page, '[data-role="receipt"]');
    yield* page.clock.hold;
    return page;
  });

describe("the kit's focus ring", () => {
  it.live(
    'on an ask and in its ⌘K portal, a kit control focused from the keyboard shows the studio’s ring',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* anAsk();
        // The ask's Send (a kit button) and the header's Go to….
        for (const control of ['.ak-send [data-act="send"]', '.sh-header [data-act="search"]']) {
          yield* page.focus(control);
          yield* evaluates(page, FOCUS_SHOWN, 'ring');
        }
        // The ⌘K sheet is portalled to the body, outside every page's scope: its query field too.
        yield* page.press('Control+k');
        yield* waitFor(page, '.lab-command-query:focus');
        yield* evaluates(page, FOCUS_SHOWN, 'ring');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

/** A page-side function: the box-shadow a value (`var(--focus-ring)`) computes to. */
const RESOLVED = `((v) => { const i = document.createElement('i'); i.style.boxShadow = v; document.body.append(i); const s = getComputedStyle(i).boxShadow; i.remove(); return s; })`;

/** A page-side function: an element's name, as `tag.class.class[role=…]`. */
const NAME = `((el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() !== '' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.hasAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : ''))`;

/**
 * A script that, from now on, keeps every focus the keyboard shows (`:focus-visible`) as
 * `[element, shown]`: `ring` when its shadow begins with the studio's ring (`--focus-ring`, or
 * `--focus-ring-inset` inside a clipping edge) and it draws no `auto` outline; `browser` when it
 * draws the user agent's own ring (an `auto` outline); else `none`.
 */
const WATCH_FOCUS = `(() => {
  const resolved = ${RESOLVED};
  const rings = [resolved('var(--focus-ring)'), resolved('var(--focus-ring-inset)')];
  const name = ${NAME};
  window.focusStops = [];
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof Element) || !el.matches(':focus-visible')) return;
    const s = getComputedStyle(el);
    const shown = s.outlineStyle === 'auto' ? 'browser' : rings.some((r) => s.boxShadow.startsWith(r)) ? 'ring' : 'none';
    window.focusStops.push([name(el), shown]);
  }, true);
  return true;
})()`;

/** Each stop the watch kept that showed no studio ring, as `element: shown`. */
const UNRINGED = `window.focusStops.filter(([, shown]) => shown !== 'ring').map(([el, shown]) => el + ': ' + shown)`;

/** Whether the watch kept a stop on an element whose name has `part`. */
const stoppedOn = (part: string) => `window.focusStops.some(([el]) => el.includes('${part}'))`;

/** Press Tab until the focused element matches `selector`, at most `most` times. */
const tabTo = (page: Tab, selector: string, most: number) =>
  Effect.gen(function* () {
    for (let i = 0; i < most; i++) {
      if (yield* page.evaluate<boolean>(`document.activeElement.matches('${selector}')`)) return;
      yield* page.press('Tab');
    }
  });

/** A script that keeps `root`'s shadow as it rests, unfocused, for `RINGED_OVER_REST` to read. */
const keepRest = (root: string) =>
  `(() => { window.restingShadow = getComputedStyle(document.querySelector('${root}')).boxShadow; return true; })()`;

/**
 * How the focused element shows its focus: `exact` when it is `root`, draws no outline, and its
 * shadow is exactly `--focus-ring` over the shadow `keepRest` kept (a shadow that merely begins
 * with the ring, its own lost, is not); else what it drew.
 */
const ringedOverRest = (root: string) =>
  `((el) => { const s = getComputedStyle(el); const ring = ${RESOLVED}('var(--focus-ring)'); const want = window.restingShadow === 'none' ? ring : ring + ', ' + window.restingShadow; return el.matches('${root}') && s.outlineStyle === 'none' && s.boxShadow === want ? 'exact' : ${NAME}(el) + ': outline ' + s.outlineStyle + ', shadow ' + s.boxShadow + ', not ' + want; })(document.activeElement)`;

describe('every focus the keyboard shows is the studio’s ring', () => {
  for (const viewport of [DESK, PHONE])
    it.live(
      `a Tab walk through an ask at ${viewport.width}: every stop, control, scroll box or root, shows the ring, never the browser’s`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* anAsk(viewport);
          yield* page.evaluate(WATCH_FOCUS);
          for (let i = 0; i < 60; i++) yield* page.press('Tab');
          yield* evaluates(page, 'window.focusStops.length > 5', true);
          yield* evaluates(page, UNRINGED, []);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

  it.live(
    'a receipt reached by Tab shows the ring over its own shadow, exactly',
    () =>
      Effect.gen(function* () {
        const page = yield* receipted(DESK);
        yield* page.evaluate(WATCH_FOCUS);
        yield* page.evaluate(keepRest('.lab-receipt'));
        yield* tabTo(page, '.lab-receipt', 80);
        yield* evaluates(page, stoppedOn('lab-receipt'), true);
        yield* evaluates(page, UNRINGED, []);
        yield* evaluates(page, ringedOverRest('.lab-receipt'), 'exact');
        expect(page.errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

/**
 * A case that runs alone, its scope closed at its end, a timeout's included (`it.scopedLive.serial`):
 * `:focus-visible` matches only in the window that has the focus, and a sibling case opening
 * its own tab at once takes it.
 */
const alone = <A, E>(name: string, body: Effect.Effect<A, E, Scope.Scope>, timeout = SLOW) =>
  it.scopedLive.serial(name, () => Effect.asVoid(body), timeout);

/**
 * Every floating root open now, outermost only (⌘K's listbox sits in its dialog), each focused
 * from the keyboard in turn: `exact` when it draws no outline and its shadow is exactly
 * `--focus-ring` over the shadow it rests with, unfocused; else what it drew. A root whose box
 * fills the view (the lightbox) has no edge on screen for a ring outside it, so it shows
 * `--focus-ring-inset` inside its edge, and nothing outside. The focus goes back where it
 * was, with the look it had. Answers `[root, how]` pairs.
 */
const ROOTS_RINGED = `(() => {
  const ring = ${RESOLVED}('var(--focus-ring)');
  const inset = ${RESOLVED}('var(--focus-ring-inset)');
  const name = (el) => ${NAME}(el) + (el.dataset.role === undefined ? '' : '[data-role=' + el.dataset.role + ']');
  const floating = '${FLOATING}';
  const open = [...document.querySelectorAll(floating)].filter((e) => e.checkVisibility() && !e.matches('[data-ending-style], [data-closed]') && (e.parentElement === null || e.parentElement.closest(floating) === null));
  const had = document.activeElement;
  const hadRing = had instanceof Element && had.matches(':focus-visible');
  const answers = open.map((root) => {
    if (root === document.activeElement) root.blur();
    const rest = getComputedStyle(root).boxShadow;
    root.focus({ focusVisible: true, preventScroll: true });
    if (document.activeElement !== root) return [name(root), 'takes no focus'];
    const s = getComputedStyle(root);
    const box = root.getBoundingClientRect();
    // The page's own box: a scroll lock's gutter on a desk is no part of what a root can cover.
    const page = document.documentElement.getBoundingClientRect();
    const fills = box.left <= 0 && box.top <= 0 && box.right >= Math.min(innerWidth, page.right) && box.bottom >= innerHeight;
    const want = fills ? inset : rest === 'none' ? ring : ring + ', ' + rest;
    return [name(root), s.outlineStyle === 'none' && s.boxShadow === want ? 'exact' : 'outline ' + s.outlineStyle + ', shadow ' + s.boxShadow + ', not ' + want];
  });
  if (had instanceof HTMLElement) had.focus({ focusVisible: hadRing, preventScroll: true });
  return answers;
})()`;

/** Three animation frames: a root opened has drawn, its opening's styles settled. */
const FRAMES = `new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))))`;

/** Mark the `i`th visible trigger of a floating root on the page (`aria-haspopup`), outside any root. */
const markTrigger = (i: number) =>
  `(() => { document.querySelectorAll('[data-guard]').forEach((e) => e.removeAttribute('data-guard')); const t = [...document.querySelectorAll('[aria-haspopup]:not([aria-haspopup=false]):not(:disabled)')].filter((e) => e.checkVisibility() && e.closest('${FLOATING}') === null)[${i}]; if (t === undefined) return false; t.dataset.guard = 'trigger'; return true; })()`;

/**
 * Mark the first visible thing the page's context menu is about (`data-target`), else the
 * page's own sections, where a press on no thing opens the page's commands.
 */
const MARK_TARGET = `(() => { const t = [...document.querySelectorAll('[data-target]')].find((e) => e.checkVisibility()) ?? document.querySelector('.ak-sections'); if (t === null) return false; t.dataset.guard = 'target'; return true; })()`;

/** A page the guard walks, by its name, and the roots it opens, by their `data-role`. */
interface Walked {
  readonly name: string;
  readonly open: () => Effect.Effect<{ readonly page: Tab }, never, Scope.Scope>;
  /** The roots the walk meets on this page: one it meets and does not name fails it. */
  readonly roots: ReadonlyArray<string>;
  /** Only the roots the page opens on (a link to a still, a phone's open view), not the walk. */
  readonly opening?: true;
}

/** The pages that open floating roots, at a desk, and at a phone's width. */
const WALKED: ReadonlyArray<Walked> = [
  ...(
    [
      ['a desk', DESK],
      ['a phone', PHONE],
    ] as const
  ).flatMap(([where, viewport]): ReadonlyArray<Walked> => [
    {
      name: `an ask at ${where}`,
      open: () => anAsk(viewport),
      roots: ['command-menu', 'context-menu', 'keys-sheet', 'receipt', 'view-menu'],
    },
    {
      name: `an ask at ${where}, a Board panel's still in its lightbox`,
      open: () =>
        Effect.tap(
          openAsk([...guidedRoutes, ...studioRoutes], {
            href: `${pageHref.ask(STUDIO_GUIDED)}?still=board-open.breath`,
            viewport,
          }),
          ({ page }) => waitFor(page, '[data-role="lightbox"]'),
        ),
      roots: ['lightbox'],
      opening: true,
    },
  ]),
];

/** The roots the pages open, by their `data-role`: each page's together. */
const ROOTS = ['command-menu', 'context-menu', 'keys-sheet', 'lightbox', 'receipt', 'view-menu'];

/**
 * On the page `walked` opens, open every floating root it offers, one at a time: the keys
 * dialog (`?`), ⌘K, the page's context menu, every trigger of a root on the page (a menu, a
 * chip, the film switcher, a lightbox), and every command of its registry run from ⌘K that
 * leaves a root open (a findings sheet, a scene's palette). Each root open shows the ring over
 * its own shadow, exactly. A path that leaves the page, or leaves a root Escape does not close,
 * has the page opened again.
 */
const everyRoot = (walked: Walked) =>
  Effect.gen(function* () {
    const walk = yield* pageAfterPage(walked.open);
    const start = yield* walk.page().evaluate<string>('location.pathname');
    const failures: Array<string> = [];
    const errors: Array<string> = [];
    const seen = new Set<string>();
    const check = (path: string) =>
      Effect.gen(function* () {
        const page = walk.page();
        yield* page.evaluate(FRAMES);
        for (const [root, how] of yield* page.evaluate<ReadonlyArray<readonly [string, string]>>(
          ROOTS_RINGED,
        )) {
          seen.add(root.replace(/^.*\[data-role=([^\]]+)\]$/, '$1'));
          if (how !== 'exact') failures.push(`${walked.name}, ${path}: ${root}: ${how}`);
        }
        for (let i = 0; i < 3 && (yield* page.evaluate<boolean>(LEFT_OPEN)); i++) {
          yield* page.press('Escape');
          yield* page.evaluate(FRAMES);
        }
        const away = yield* page.evaluate<boolean>(
          `location.pathname !== '${start}' || ${LEFT_OPEN}`,
        );
        if (away) {
          errors.push(...page.errors);
          yield* walk.again;
        }
      });
    yield* check('as it opens');
    if (walked.opening !== true) {
      yield* walk.page().press('?');
      yield* check('the keys dialog');
      yield* walk.page().press('Control+k');
      yield* check('⌘K');
      if (yield* walk.page().evaluate<boolean>(MARK_TARGET)) {
        yield* rightClick(walk.page(), '[data-guard="target"]');
        yield* check('the context menu');
      }
      for (let i = 0; yield* walk.page().evaluate<boolean>(markTrigger(i)); i++) {
        yield* walk.page().click('[data-guard="trigger"]');
        yield* check(`trigger ${i}`);
      }
      for (const id of sampled(yield* registry(walk.page()))) {
        if (yield* runFromMenu(walk.page(), id, 'key')) yield* check(id);
      }
    }
    errors.push(...walk.page().errors);
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    expect([...seen].toSorted()).toEqual(walked.roots.toSorted());
  });

describe('every floating root shows the ring over its own shadow, exactly, on every page that opens it', () => {
  for (const walked of WALKED) alone(`on ${walked.name}`, everyRoot(walked), REGISTRY);

  // A root a page opens that its row does not name fails it: name it, so the list stays the
  // roots the pages open.
  it.effect('the roots walked are the ones the design language names', () =>
    Effect.sync(() =>
      expect([...new Set(WALKED.flatMap((w) => w.roots))].toSorted()).toEqual(ROOTS),
    ),
  );
});
