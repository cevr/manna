import { Deferred, Effect, Exit } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { PAGE_ROOT } from '../../src/core/page-render.ts';
import { openServed } from '../../src/lab/fixtures/harness.ts';
import { evaluates, until } from '../../src/lab/fixtures/settled.ts';
import { STUDIO_ASK, studioRoutes } from '../../src/lab/fixtures/studio-film.ts';
import { targetBoxes } from '../../src/lab/fixtures/touch-targets.ts';
import { faceHold } from '../../src/player/face.ts';
import { ASK_READY, DEVICES, SLOW } from './studio-states.ts';

const SHIFT_PX = 0.5;

const { shown: FACES_SHOWN, capMs: FACE_CAP_MS } = faceHold(`[${PAGE_ROOT}]`);

const FAMILIES = ['Geist', 'Geist Mono'];

const filesOf = (family: string) =>
  `[...document.fonts].filter((f) => f.family.replaceAll('"', '') === '${family}')`;

const UI_FACES = `[${FAMILIES.map((family) => `...${filesOf(family)}`).join(', ')}]`;

const EACH_LOADED = FAMILIES.map(
  (family) => `${filesOf(family)}.some((f) => f.status === 'loaded')`,
).join(' && ');

const ROOT = `document.querySelector('[${PAGE_ROOT}]')`;

const ALONE = `[${FAMILIES.map(
  (family) => `(() => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;white-space:pre;font:12px "${family}", serif';
    probe.textContent = 'Record the frame 00:00:12:04';
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  })()`,
).join(', ')}]`;

const LABEL = '[data-face-label]';

const ARM = `(() => {
  if (window.__armed) return true;
  const root = ${ROOT};
  if (root === null) return false;
  const label = [...root.querySelectorAll('button, a[href]')].find((el) => {
    const r = el.getBoundingClientRect();
    return el.textContent.trim() !== '' && r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  });
  if (label === undefined) return false;
  label.setAttribute('data-face-label', '');
  const html = document.documentElement;
  window.__alone = ${ALONE};
  new MutationObserver((_, observer) => {
    if (!html.hasAttribute('${FACES_SHOWN}')) return;
    observer.disconnect();
    window.__first = {
      how: html.getAttribute('${FACES_SHOWN}'),
      loaded: ${EACH_LOADED},
      boxes: ${targetBoxes('exact')},
    };
  }).observe(html, { attributes: true, attributeFilter: ['${FACES_SHOWN}'] });
  window.__armed = true;
  return true;
})()`;

const SHOWN = `(document.documentElement.getAttribute('${FACES_SHOWN}') ?? 'none')`;

const HELD = `[getComputedStyle(${ROOT}).visibility, ${SHOWN}, ${UI_FACES}.length > 0, ${UI_FACES}.filter((f) => f.status === 'loaded').length]`;

const settled = (then: string) => `(() => {
  window.__settling ??= document.fonts.ready
    .then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
    .then(() => { window.__settled = ${then}; });
  return window.__settled !== undefined;
})()`;

const AGAINST_FIRST = `(() => {
  const first = window.__first;
  const now = ${targetBoxes('exact')};
  const alone = ${ALONE};
  const keys = [...new Set([...Object.keys(first.boxes), ...Object.keys(now)])];
  const box = (r) => (r ?? []).map((v) => v.toFixed(2)).join(',') || 'none';
  return [
    'shown ' + first.how,
    'each face loaded at the first paint ' + first.loaded,
    ...window.__alone.map((width, i) => 'held without face ' + i + ' ' + (width !== alone[i])),
    ...keys
      .filter((key) => {
        const a = first.boxes[key] ?? [];
        const b = now[key] ?? [];
        return a.length !== 4 || b.length !== 4 || a.some((v, i) => Math.abs(v - b[i]) > ${SHIFT_PX});
      })
      .map((key) => key + ': ' + box(first.boxes[key]) + ' → ' + box(now[key])),
  ];
})()`;

const STILL = [
  'shown in',
  'each face loaded at the first paint true',
  ...FAMILIES.map((_, i) => `held without face ${i} true`),
];

const LATE = `[lab] fonts.late reason=cap cap_ms=${FACE_CAP_MS}`;

for (const device of DEVICES) {
  describe(`the UI faces as they load on ${device.name} (G10)`, () => {
    const PAGES = [['an ask', 'ask', studioRoutes, pageHref.ask(STUDIO_ASK), [ASK_READY]]] as const;
    for (const [name, served, routes, href, ready] of PAGES) {
      it.live(
        `${name}: the root paints nothing while the faces are held, then first paints in them, and no target moves after`,
        () =>
          Effect.gen(function* () {
            const faceHeld = yield* Deferred.make<void>();
            const { page } = yield* openServed(served, routes, {
              href,
              viewport: device.viewport,
              mountedOnly: true,
              faceHeld,
              clockStopped: true,
            });
            yield* until(page, ARM);
            yield* evaluates(page, HELD, ['hidden', 'none', true, 0]);
            expect(yield* page.ink(LABEL)).toBe(0);
            yield* evaluates(page, SHOWN, 'none');
            yield* Deferred.done(faceHeld, Exit.void);
            yield* until(page, `window.__first !== undefined && ${EACH_LOADED}`);
            yield* page.clock.release;
            yield* until(page, settled(AGAINST_FIRST));
            yield* evaluates(page, 'window.__settled', STILL);
            for (const selector of ready) yield* page.waitFor(selector);
          }).pipe(Effect.scoped),
        SLOW,
      );

      it.live(
        `${name}: held past the cap, the root shows in the fallbacks and the page says so once`,
        () =>
          Effect.gen(function* () {
            const faceHeld = yield* Deferred.make<void>();
            const { page } = yield* openServed(served, routes, {
              href,
              viewport: device.viewport,
              mountedOnly: true,
              faceHeld,
            });
            yield* until(
              page,
              `document.documentElement.getAttribute('${FACES_SHOWN}') === 'late'`,
            );
            yield* evaluates(
              page,
              `[getComputedStyle(${ROOT}).visibility, ${UI_FACES}.filter((f) => f.status === 'loaded').length]`,
              ['visible', 0],
            );
            for (const selector of ready) yield* page.waitFor(selector);
            yield* Deferred.done(faceHeld, Exit.void);
            yield* until(page, EACH_LOADED);
            yield* until(page, settled(SHOWN));
            yield* evaluates(page, 'window.__settled', 'late');
            expect(page.logged.filter((line) => line.text.includes('[lab] fonts.late'))).toEqual([
              expect.objectContaining({ text: LATE }),
            ]);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}
