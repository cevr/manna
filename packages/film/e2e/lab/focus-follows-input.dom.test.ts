import { Effect, type Scope } from 'effect';
import { expect, it } from 'effect-bun-test';
import type { Input } from '../../src/browser/keys.ts';
import { pageHref } from '../../src/core/api.ts';
import { DESK, openAsk } from '../../src/lab/fixtures/harness.ts';
import {
  STUDIO_ASK,
  STUDIO_GUIDED,
  guidedRoutes,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import { until, waitFor } from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { LEFT_OPEN, pageAfterPage, registry, runFromMenu, sampled } from './registry.ts';
import { ASK_READY } from './studio-states.ts';

const SLOW = 30_000;
const REGISTRY = 240_000;

const INPUTS: ReadonlyArray<Input> = ['key', 'pointer'];

const NAME = `((el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() !== '' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.hasAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '') + (el.dataset.act === undefined ? '' : '[data-act=' + el.dataset.act + ']'))`;

const TEXT_FIELD = `input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image]), textarea, [contenteditable]:not([contenteditable=false])`;

const WATCH = `(() => {
  window.focusMoves = [];
  window.focusFrames = 0;
  window.focusLeaving = false;
  if (window.focusWatched !== true) {
    window.focusWatched = true;
    const name = ${NAME};
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      window.focusMoves.push([name(el), el.matches(':focus-visible'), el.matches('${TEXT_FIELD}')]);
    }, true);
    const frame = () => { window.focusFrames += 1; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    // A command that opens another part is kept on this page: it moves no focus here, and the
    // page it would open is not served.
    navigation.addEventListener('navigate', (e) => {
      if (new URL(e.destination.url).pathname === location.pathname || !e.cancelable) return;
      e.preventDefault();
      window.focusLeaving = true;
    });
  }
  return true;
})()`;

const SEEN = `({
  watching: Array.isArray(window.focusMoves),
  moves: Array.isArray(window.focusMoves) ? window.focusMoves : [],
  left: [document.activeElement].filter((el) => el !== null && el !== document.body).map((el) => [${NAME}(el), el.matches(':focus-visible'), el.matches('${TEXT_FIELD}')]),
  focused: document.hasFocus(),
  leaving: window.focusLeaving === true,
})`;

type Stop = readonly [element: string, shown: boolean, text: boolean];
interface Seen {
  readonly watching: boolean;
  readonly moves: ReadonlyArray<Stop>;
  readonly left: ReadonlyArray<Stop>;
  readonly focused: boolean;
  readonly leaving: boolean;
}

const LOOK = { true: 'shows the ring', false: 'shows none' } as const;

const wrong = (path: string, input: Input, seen: Seen): ReadonlyArray<string> => {
  if (!seen.focused)
    return [`${path} by ${input}: the window has no focus, so nothing can be read`];
  const off = (where: string) => (stop: Stop) =>
    [stop]
      .filter(([, shown, text]) => shown !== (text || input === 'key'))
      .map(([element, shown]) => `${path} by ${input}: ${where} ${element} ${LOOK[`${shown}`]}`);
  return [...seen.moves.flatMap(off('moved to')), ...seen.left.flatMap(off('left on'))];
};

const SETTLED = `window.focusFrames === undefined || window.focusFrames >= 3 || window.focusLeaving === true`;

const FRAMES_SETTLED = `new Promise((settled) => requestAnimationFrame(() => requestAnimationFrame(() => settled(true))))`;

const watchedThen = <A>(page: Tab, path: Effect.Effect<A>) =>
  Effect.gen(function* () {
    yield* page.evaluate(FRAMES_SETTLED);
    yield* page.evaluate(WATCH);
    const answered = yield* path;
    yield* until(page, SETTLED);
    yield* page.evaluate(`window.focusFrames = 0; true`);
    yield* until(page, SETTLED);
    return [answered, yield* page.evaluate<Seen>(SEEN)] as const;
  });

const watched = (page: Tab, path: Effect.Effect<void>) =>
  Effect.map(watchedThen(page, path), ([, seen]) => seen);

interface Opened {
  readonly name: string;
  readonly open: () => Effect.Effect<{ readonly page: Tab }, never, Scope.Scope>;
  readonly moves: ReadonlyArray<readonly [command: string, to: RegExp]>;
  readonly runs: ReadonlyArray<string>;
}

const everyCommand = (opened: Opened) =>
  Effect.gen(function* () {
    const walk = yield* pageAfterPage(opened.open);
    const start = yield* walk.page().evaluate<string>('location.pathname');
    const ids = sampled(yield* registry(walk.page()));
    const failures: Array<string> = [];
    const ran: Array<string> = [];
    const reached: Array<string> = [];
    const went = new Map<string, string>();
    for (const id of ids)
      for (const input of INPUTS) {
        const page = walk.page();
        const [offered, seen] = yield* watchedThen(page, runFromMenu(page, id, input));
        if (offered && seen.watching && !seen.leaving) {
          ran.push(`${id} by ${input}`);
          failures.push(...wrong(`${opened.name}: ${id}`, input, seen));
          for (const [command, to] of opened.moves.filter(([c]) => id.startsWith(c))) {
            if (seen.moves.some(([element]) => to.test(element)))
              reached.push(`${command} by ${input}`);
            went.set(
              `${command} by ${input}`,
              [...seen.moves, ...seen.left].map(([element]) => element).join(' → '),
            );
          }
        }
        const away = yield* page.evaluate<boolean>(
          `location.pathname !== '${start}' || window.focusMoves === undefined || window.focusLeaving === true || ${LEFT_OPEN}`,
        );
        if (away) yield* walk.again;
      }
    expect(ran.length).toBeGreaterThan(0);
    expect(failures).toEqual([]);
    const missing = opened.moves.flatMap(([command, to]) =>
      INPUTS.filter((input) => !reached.includes(`${command} by ${input}`)).map(
        (input) =>
          `${opened.name}: ${command} by ${input} never moved the focus to ${to} (it went: ${went.get(`${command} by ${input}`) ?? 'not run'})`,
      ),
    );
    expect(missing).toEqual([]);
    const unrun = opened.runs.flatMap((command) =>
      INPUTS.filter((input) => !ran.includes(`${command} by ${input}`)).map(
        (input) => `${opened.name}: ${command} by ${input} never ran`,
      ),
    );
    expect(unrun).toEqual([]);
  });

const PAGES: ReadonlyArray<Opened> = [
  {
    name: "an agent's ask",
    open: () =>
      Effect.tap(
        openAsk(studioRoutes, { href: pageHref.ask(STUDIO_ASK), viewport: DESK }),
        ({ page }) => waitFor(page, ASK_READY),
      ),
    moves: [],
    runs: [],
  },
];

const alone = <A, E>(name: string, body: Effect.Effect<A, E, Scope.Scope>, timeout = SLOW) =>
  it.scopedLive.serial(name, () => Effect.asVoid(body), timeout);

for (const opened of PAGES)
  alone(
    `on ${opened.name}, every command run from ⌘K shows the ring where it moves the focus iff the keyboard asked`,
    everyCommand(opened),
    REGISTRY,
  );

const ASKED = { key: 'pressed', pointer: 'clicked' } as const;

const holds = (path: string, input: Input, seen: Seen) =>
  Effect.sync(() => expect(wrong(path, input, seen)).toEqual([]));

const ASK_GOES = [
  {
    path: "an ask's index entry",
    ask: STUDIO_GUIDED,
    routes: guidedRoutes,
    press: '.ak-index li:last-child [data-act="go-section"]',
    lands: '.ak-step:last-child .ak-section-h',
  },
  {
    path: "an ask's Send with a question open",
    ask: STUDIO_ASK,
    routes: studioRoutes,
    press: ASK_READY,
    lands: '.ak-field[data-answer="take"] button',
  },
] as const;

for (const { path, ask, routes, press, lands } of ASK_GOES)
  for (const input of INPUTS)
    alone(
      `on an ask, ${path} ${ASKED[input]} moves the focus where it goes, which rings iff the keyboard asked`,
      Effect.gen(function* () {
        const { page, errors } = yield* openAsk(routes, { href: pageHref.ask(ask) });
        yield* waitFor(page, press);
        if (input === 'key') yield* page.focus(press);
        const seen = yield* watched(
          page,
          Effect.gen(function* () {
            if (input === 'key') yield* page.press('Enter');
            else yield* page.click(press);
            yield* until(page, `document.activeElement?.matches('${lands}') === true`);
          }),
        );
        yield* holds(path, input, seen);
        expect(errors).toEqual([]);
      }),
    );
