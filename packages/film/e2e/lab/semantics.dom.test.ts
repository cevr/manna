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
const REGISTRY = 180_000;

const anAsk = (viewport: Viewport = DESK) =>
  Effect.tap(openAsk(studioRoutes, { href: pageHref.ask(STUDIO_ASK), viewport }), ({ page }) =>
    waitFor(page, ASK_READY),
  );

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
        for (const control of ['.ak-send [data-act="send"]', '.sh-header [data-act="search"]']) {
          yield* page.focus(control);
          yield* evaluates(page, FOCUS_SHOWN, 'ring');
        }
        yield* page.press('Control+k');
        yield* waitFor(page, '.lab-command-query:focus');
        yield* evaluates(page, FOCUS_SHOWN, 'ring');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

const RESOLVED = `((v) => { const i = document.createElement('i'); i.style.boxShadow = v; document.body.append(i); const s = getComputedStyle(i).boxShadow; i.remove(); return s; })`;

const NAME = `((el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() !== '' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.hasAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : ''))`;

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

const UNRINGED = `window.focusStops.filter(([, shown]) => shown !== 'ring').map(([el, shown]) => el + ': ' + shown)`;

const stoppedOn = (part: string) => `window.focusStops.some(([el]) => el.includes('${part}'))`;

const tabTo = (page: Tab, selector: string, most: number) =>
  Effect.gen(function* () {
    for (let i = 0; i < most; i++) {
      if (yield* page.evaluate<boolean>(`document.activeElement.matches('${selector}')`)) return;
      yield* page.press('Tab');
    }
  });

const keepRest = (root: string) =>
  `(() => { window.restingShadow = getComputedStyle(document.querySelector('${root}')).boxShadow; return true; })()`;

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

const alone = <A, E>(name: string, body: Effect.Effect<A, E, Scope.Scope>, timeout = SLOW) =>
  it.scopedLive.serial(name, () => Effect.asVoid(body), timeout);

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
    let want = ring + ', ' + rest;
    if (rest === 'none') want = ring;
    if (fills) want = inset;
    if (s.outlineStyle === 'none' && s.boxShadow === want) return [name(root), 'exact'];
    return [name(root), 'outline ' + s.outlineStyle + ', shadow ' + s.boxShadow + ', not ' + want];
  });
  if (had instanceof HTMLElement) had.focus({ focusVisible: hadRing, preventScroll: true });
  return answers;
})()`;

const FRAMES = `new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))))`;

const markTrigger = (i: number) =>
  `(() => { document.querySelectorAll('[data-guard]').forEach((e) => e.removeAttribute('data-guard')); const t = [...document.querySelectorAll('[aria-haspopup]:not([aria-haspopup=false]):not(:disabled)')].filter((e) => e.checkVisibility() && e.closest('${FLOATING}') === null)[${i}]; if (t === undefined) return false; t.dataset.guard = 'trigger'; return true; })()`;

const MARK_TARGET = `(() => { const t = [...document.querySelectorAll('[data-target]')].find((e) => e.checkVisibility()) ?? document.querySelector('.ak-sections'); if (t === null) return false; t.dataset.guard = 'target'; return true; })()`;

interface Walked {
  readonly name: string;
  readonly open: () => Effect.Effect<{ readonly page: Tab }, never, Scope.Scope>;
  readonly roots: ReadonlyArray<string>;
  readonly opening?: true;
}

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

const ROOTS = ['command-menu', 'context-menu', 'keys-sheet', 'lightbox', 'receipt', 'view-menu'];

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

  it.effect('the roots walked are the ones the design language names', () =>
    Effect.sync(() =>
      expect([...new Set(WALKED.flatMap((w) => w.roots))].toSorted()).toEqual(ROOTS),
    ),
  );
});
