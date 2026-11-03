import { Effect } from 'effect';
import { countIs, evaluates, waitFor } from './settled.ts';
import type { Tab } from './tab.ts';

const fire = <A>(page: Tab, selector: string, script: string) =>
  Effect.andThen(
    waitFor(page, selector),
    page.evaluate<A>(`(() => {
    const el = document.querySelector('${selector}');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    ${script}
  })()`),
  );

export const rightClick = (page: Tab, selector: string) =>
  fire<boolean>(
    page,
    selector,
    `el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, buttons: 2, pointerId: 1, isPrimary: true, clientX: x, clientY: y }));
     return el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y }));`,
  );

export const touch = (page: Tab, selector: string, dx: number) =>
  Effect.gen(function* () {
    const at = yield* page.box(selector);
    const x = at.x + at.width / 2;
    const y = at.y + at.height / 2;
    yield* page.finger.down(x, y);
    if (dx !== 0) yield* page.finger.move(x + dx, y, Math.ceil(Math.abs(dx) / 2));
  });

export const MENU_ITEMS = `[...document.querySelectorAll('[data-role="context-menu"] [data-command]')].map((e) => e.dataset.command)`;

export const menuEntry = (id: string) => `[data-role="command-menu"] [data-command="${id}"]`;

export const openCommandMenu = (page: Tab, query: string) =>
  Effect.gen(function* () {
    yield* page.press('Control+k');
    yield* waitFor(page, '.lab-command-query');
    yield* page.fill('.lab-command-query', query);
  });

export const closeCommandMenu = (page: Tab) =>
  Effect.andThen(page.press('Escape'), countIs(page, '[data-role="command-menu"]', 0));

export const menuOffers = (page: Tab, query: string, id: string, want: boolean) =>
  Effect.gen(function* () {
    yield* openCommandMenu(page, query);
    yield* evaluates(page, `document.querySelector('${menuEntry(id)}') !== null`, want);
    yield* closeCommandMenu(page);
  });
