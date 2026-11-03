/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noNewPromise, effect/noThrowStatement, effect/noNewError, effect/noNullish, effect/noTernary, effect/noTestLifecycleHooks -- a browser harness, a host boundary: it builds the page with Bun, serves it, and drives Chromium one step after another through Playwright's promises, as packages/ui's browser tests do. */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { BunPlugin } from 'bun';

import type { First } from './page';
import { type ListName, lists } from './routes';
import {
  type Cold,
  type Move,
  type Press,
  type Visit,
  type Way,
  coldDomain,
  coldsOf,
  heights,
  uncovered,
  visitDomain,
  visitsOf,
} from './visits';

const rowHeight = 44;

const windowOf = (height: number) => ({ width: height > 1000 ? 1024 : 402, height });

const boundaries = (data: Readonly<Record<string, string>>): BunPlugin => ({
  name: 'hymnal-browser-boundaries',
  setup(build) {
    const web = Bun.resolveSync('react-native-web', import.meta.dir);
    const one = Bun.resolveSync('../../src/test/one.tsx', import.meta.dir);
    build.onResolve({ filter: /^react-native$/ }, () => ({ path: web }));
    build.onResolve({ filter: /^one$/ }, () => ({ path: one }));
    build.onResolve({ filter: /^virtual:hymnal(-indexes)?$/ }, ({ path }) => ({
      path,
      namespace: 'hymnal',
    }));
    build.onLoad({ filter: /.*/, namespace: 'hymnal' }, ({ path }) => ({
      contents: `export default ${data[path] ?? '{}'};`,
      loader: 'js',
    }));
  },
});

const bundle = async (data: Readonly<Record<string, string>>): Promise<string> => {
  const output = await Bun.build({
    entrypoints: [`${import.meta.dir}/page.tsx`],
    plugins: [boundaries(data)],
    target: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  const [script] = output.outputs;
  if (!output.success || !script) throw new Error(output.logs.map(String).join('\n'));
  return script.text();
};

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

const places = Math.ceil((navigator.hardwareConcurrency * 4) / 3);
let taken = 0;
const queue: Array<() => void> = [];
const take = () =>
  taken < places
    ? Promise.resolve(void (taken += 1))
    : new Promise<void>((done) => queue.push(done));
const give = () => {
  const next = queue.shift();
  if (next) next();
  else taken -= 1;
};

const open = async ({
  path = '/',
  height = 874,
  hold = false,
  touch = false,
}: { path?: string; height?: number; hold?: boolean; touch?: boolean } = {}) => {
  await take();
  const context: BrowserContext = await browser
    .newContext({ viewport: windowOf(height), hasTouch: touch })
    .catch((error: Error) => {
      give();
      return Promise.reject(error);
    });
  const close = () => context.close().finally(give);
  const fail = (error: Error) =>
    close().then(
      () => Promise.reject(error),
      () => Promise.reject(error),
    );
  context.setDefaultTimeout(3000);
  const page: Page = await context.newPage().catch(fail);
  let size = windowOf(height);

  const settle = (ms: number) =>
    page.evaluate(
      (wait) =>
        new Promise<void>((done) =>
          setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => done())), wait),
        ),
      ms,
    );

  const shown = async () => {
    await page.waitForFunction(() => window.hymnal?.showing() === true);
    await settle(0);
  };

  const hydrated = () => page.waitForFunction(() => window.hymnal.hydrated);

  const resize = async (to: number) => {
    size = windowOf(to);
    await page.setViewportSize(size);
    await settle(0);
    await page.evaluate(() => window.hymnal.jumps.splice(0));
  };

  const place = async () => {
    const now = await page.evaluate(() => window.hymnal.place());
    if (now === undefined) throw new Error('the list is not shown');
    return now;
  };

  const scroll = (top: number) => page.evaluate((y) => window.hymnal.scroll(y), top);

  const scrollTo = async (top: number) => {
    const step = (to: number | undefined, ms: number) =>
      page.evaluate(
        ([y, wait]) => {
          if (y !== undefined) window.hymnal.scroll(y);
          return new Promise<{ top: number; max: number } | undefined>((done) =>
            setTimeout(
              () =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => done(window.hymnal.place())),
                ),
              wait,
            ),
          );
        },
        [to, ms] as const,
      );
    let now = await place();
    for (let steps = 0; steps < 200; steps++) {
      const to =
        top > now.top
          ? Math.min(top, now.top + size.height * 16, now.max)
          : Math.max(top, now.top - size.height * 16);
      const done = now.top === to && (to === top || to === now.max);
      const after = await step(done ? undefined : to, done ? 40 : 0);
      if (after === undefined) throw new Error('the list is not shown');
      if (done && after.max === now.max && after.top === now.top) return now.top;
      now = after;
    }
    return now.top;
  };

  const jumps = () => page.evaluate(() => window.hymnal.jumps.splice(0));

  const blank = async () => {
    await page
      .waitForFunction(() => window.hymnal.blank() === 0, undefined, { timeout: 1000 })
      .catch(() => undefined);
    return page.evaluate(() => window.hymnal.blank());
  };

  const errors = () => page.evaluate(() => [...window.hymnal.errors]);

  const middleRow = async () => {
    await page.waitForFunction(() => window.hymnal.showing(), undefined, { timeout: 2000 });
    return page.evaluate(() => window.hymnal.middle());
  };

  const opened = (list: ListName, label: string) => {
    const want = `${list === 'hymns' ? '/hymns' : '/search'}/${label.split(',')[0]}`;
    return page.waitForFunction((path) => window.hymnal.on(path), want, { timeout: 2000 });
  };

  const leaveAtOnce = async (at: number, tab?: string) => {
    await middleRow();
    await page.evaluate((y) => window.hymnal.away(y), at);
    return page.evaluate(
      ([y, link]) =>
        new Promise<number>((frame) => requestAnimationFrame(frame)).then(() =>
          window.hymnal.leave(y, link),
        ),
      [at, tab] as const,
    );
  };

  const press = async (list: ListName, when: Press, at: number) => {
    if (when === 'now') {
      const left = await leaveAtOnce(at);
      await opened(list, left.label);
      return left;
    }
    const row = await middleRow();
    const { top } = await place();
    await page.mouse.click(row.x, row.y);
    await opened(list, row.label);
    return { top, label: row.label };
  };

  const tab = (list: ListName) =>
    page.getByRole('navigation').getByText(lists[list].title, { exact: true }).click();

  const comeBack = async (list: ListName, label: string, go: () => Promise<unknown>) => {
    await page.evaluate(
      ([path, name]) => {
        window.hymnal.watching = window.hymnal.watch(path, name);
      },
      [lists[list].path, label] as const,
    );
    await go();
    const first = await page.evaluate(() => window.hymnal.watching);
    await shown();
    if (first === undefined) throw new Error('no frame drew the list');
    return first;
  };

  const load = async () => {
    await page.goto(`${server.url.href.replace(/\/$/, '')}${path}${hold ? '?hold' : ''}`);
    if (!hold) await hydrated();
    await shown();
  };

  await load().catch(fail);
  return {
    page,
    context,
    settle,
    hydrated,
    resize,
    place,
    scroll,
    scrollTo,
    jumps,
    blank,
    errors,
    middleRow,
    leaveAtOnce,
    press,
    tab,
    comeBack,
    load,
    [Symbol.asyncDispose]: close,
  };
};

type Session = Awaited<ReturnType<typeof open>>;

beforeAll(async () => {
  const launching = chromium.launch({ args: ['--js-flags=--no-opt'] }).then((launched) => {
    browser = launched;
  });
  const { render, data } = await import('./server');
  const [script] = await Promise.all([bundle(data), launching]);
  server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      return pathname === '/page.js'
        ? new Response(script, {
            headers: {
              'content-type': 'text/javascript',
              'cache-control': 'max-age=3600, immutable',
            },
          })
        : new Response(render(pathname), { headers: { 'content-type': 'text/html' } });
    },
  });
});

afterAll(async () => {
  await browser?.close();
  await server?.stop(true);
});

const seed = ((given) =>
  given !== undefined && given !== '' ? Number(given) >>> 0 : Math.floor(Math.random() * 2 ** 32))(
  process.env['HYMNAL_LIST_SEED'],
);
console.log(`hymnal browser test: HYMNAL_LIST_SEED=${seed}`);

const paths = {
  back: async (app: Session, list: ListName, when: Press, at: number) => {
    const { top, label } = await app.press(list, when, at);
    return { top, first: await app.comeBack(list, label, () => app.page.goBack()) };
  },
  header: async (app: Session, list: ListName, when: Press, at: number) => {
    const { top, label } = await app.press(list, when, at);
    const first = await app.comeBack(list, label, () =>
      app.page.getByText(`‹ ${lists[list].title}`, { exact: true }).click(),
    );
    return { top, first };
  },
  tab: async (app: Session, list: ListName, when: Press, at: number) => {
    const other = list === 'hymns' ? 'search' : 'hymns';
    const { top, label } =
      when === 'now'
        ? await app.leaveAtOnce(at, lists[other].title)
        : { top: (await app.place()).top, label: (await app.middleRow()).label };
    if (when === 'later') await app.tab(other);
    await app.page.waitForFunction(
      (path) => window.hymnal.on(path) && window.hymnal.place() !== undefined,
      lists[other].path,
    );
    return { top, first: await app.comeBack(list, label, () => app.tab(list)) };
  },
} as const satisfies Record<
  Way,
  (app: Session, list: ListName, when: Press, at: number) => Promise<{ top: number; first: First }>
>;

const moves = {
  top: async (app: Session) => {
    await app.scroll(0);
    await app.settle(100);
    return { blank: await app.blank(), top: (await app.place()).top, goal: 0 };
  },
  fling: async (app: Session) => {
    const { top } = await app.place();
    const row = await app.middleRow();
    await app.page.mouse.move(row.x, row.y);
    const turns = [
      ...Array.from({ length: Math.ceil(top / 2400) }, () => 2400),
      400,
      200,
      100,
      50,
      25,
      12,
    ];
    for (const turn of turns) await app.page.mouse.wheel(0, -turn);
    await app.settle(150);
    return { blank: await app.blank(), top: (await app.place()).top, goal: 0 };
  },
  nothing: async (app: Session) => {
    const field = app.page.getByRole('searchbox');
    await field.fill('zzqxj');
    await app.page.getByText('No hymn matches', { exact: false }).waitFor();
    await app.scroll(0);
    await field.fill('');
    await app.page.waitForFunction(() => window.hymnal.showing());
    await app.settle(150);
    return { blank: await app.blank(), top: (await app.place()).top, goal: 0 };
  },
  onward: async (app: Session) => {
    const { top, max } = await app.place();
    for (const want of [top / 2, max]) {
      await app.scrollTo(Math.round(want));
      await app.settle(0);
    }
    await app.settle(150);
    const now = await app.place();
    return { blank: await app.blank(), top: now.top, goal: now.max };
  },
} as const satisfies Record<
  Move,
  (app: Session) => Promise<{ blank: number; top: number; goal: number }>
>;

type Pressed =
  | { readonly press: 'later' }
  | { readonly press: 'now'; readonly leftBeforeScrollEvent: boolean; readonly tries: number };

export type Seen = Omit<Visit, 'press'> & Pressed & Found;

interface Found {
  readonly target: number;
  readonly left: number;
  readonly found: number;
  readonly first: First;
  readonly jumps: ReadonlyArray<unknown>;
  readonly after: { readonly blank: number; readonly top: number; readonly goal: number };
}

const wrong = (v: Seen) =>
  Math.abs(v.left - v.target) > 1 ||
  Math.abs(v.found - v.left) > rowHeight ||
  !v.first.drawn ||
  v.first.blank > 0 ||
  v.first.empty > 0 ||
  v.jumps.length > 0 ||
  v.after.blank > 0 ||
  Math.abs(v.after.top - v.after.goal) > 1;

const labelled = (v: Seen) => v.press === 'later' || v.leftBeforeScrollEvent;

const missed = (visits: ReadonlyArray<Seen>) => visits.filter((v) => wrong(v) || !labelled(v));

const tries = 3;

const atOnce = { tries: 0, again: 0 };

afterAll(() => {
  console.log(
    `hymnal browser test: HYMNAL_LIST_SEED=${seed}, presses at once: ${atOnce.tries} tries, ${atOnce.again} made again`,
  );
});

const visit = async (list: ListName, visits: ReadonlyArray<Visit>) => {
  await using app = await open({ path: lists[list].path });
  const hydration = await app.errors();
  const seen: Array<Seen> = [];
  for (const v of visits) {
    for (let attempt = 1; ; attempt += 1) {
      await app.resize(v.height);
      const { max } = await app.place();
      const target = Math.round(max * v.share);
      await app.scrollTo(target);
      if (v.press === 'later') await app.settle(150);
      const { top: left, first } = await paths[v.way](app, list, v.press, target);
      const pressed: Pressed =
        v.press === 'now'
          ? {
              press: 'now',
              leftBeforeScrollEvent: await app.page.evaluate(() =>
                window.hymnal.leftBeforeScrollEvent(),
              ),
              tries: attempt,
            }
          : { press: 'later' };
      const { top: found } = await app.place();
      const after = await moves[v.move](app);
      const s: Seen = {
        ...v,
        ...pressed,
        target,
        left,
        found,
        first,
        jumps: await app.jumps(),
        after,
      };
      if (v.press === 'now') atOnce.tries += 1;
      if (labelled(s) || wrong(s) || attempt === tries) {
        seen.push(s);
        break;
      }
      atOnce.again += 1;
    }
  }
  return { seed, hydration, misses: missed(seen) };
};

const groups = <T>(cases: ReadonlyArray<T>, size: number): Array<ReadonlyArray<T>> =>
  Array.from({ length: Math.ceil(cases.length / size) }, (_, i) =>
    cases.slice(i * size, (i + 1) * size),
  );

describe('a list comes back where the reader left it', () => {
  it('in visits and cold loads that meet every pair of values their domains name', () => {
    const missing = (['hymns', 'search'] as const).flatMap((list) => [
      ...uncovered(visitDomain(list), visitsOf(list, seed)).map((pair) => `${list} visit ${pair}`),
      ...uncovered(coldDomain, coldsOf(list, seed)).map((pair) => `${list} cold ${pair}`),
    ]);
    expect({ seed, missing }).toEqual({ seed, missing: [] });
  });

  for (const list of ['hymns', 'search'] as const) {
    for (const [page, part] of groups(visitsOf(list, seed), 3).entries()) {
      it.concurrent(`the ${list} list, visits ${page * 3 + 1} to ${page * 3 + part.length}`, async () => {
        expect(await visit(list, part)).toEqual({ seed, hydration: [], misses: [] });
      });
    }
  }

  it.concurrent('the search list, its results shorter than the window grown while he was away, draws every row once he clears the search', async () => {
    await using app = await open({ path: lists.search.path, height: 320 });
    await app.page.getByRole('searchbox').fill('shepherd');
    await app.page.waitForFunction(() => {
      const max = window.hymnal.place()?.max ?? 0;
      return max > 0 && max < 10_000;
    });
    const { max } = await app.place();
    const left = await app.scrollTo(max);
    await app.settle(150);
    const row = await app.press('search', 'later', left);
    await app.resize(320 + max + 2 * rowHeight);
    await app.comeBack('search', row.label, () => app.page.goBack());
    const found = (await app.place()).top;
    await app.page.getByRole('searchbox').fill('');
    await app.page.waitForFunction(() => (window.hymnal.place()?.max ?? 0) > 10_000);
    await app.settle(150);
    expect({ left: left > 0, found, blank: await app.blank(), jumps: await app.jumps() }).toEqual({
      left: true,
      found: 0,
      blank: 0,
      jumps: [],
    });
  });
});

describe('a list loaded cold hydrates the server’s list', () => {
  const loads = async (list: ListName, height: number, cases: ReadonlyArray<Cold>) => {
    await using app = await open({ path: lists[list].path, height, hold: true });
    const misses: Array<unknown> = [];
    for (const [index, c] of cases.entries()) {
      if (index > 0) await app.load();
      const { max } = await app.place();
      const before = await app.scroll(Math.round(max * c.before));
      const waited = await app.page
        .evaluate(() => window.hymnal.heard())
        .then(
          () => 'heard',
          (error: Error) => error.message,
        );
      await app.page.evaluate(() => window.hymnal.hydrate());
      await app.hydrated();
      await app.settle(150);
      const kept = (await app.place()).top - before;
      const blankBefore = await app.blank();
      const after = await app.scroll(Math.round(max * c.after));
      await app.settle(150);
      const seen = {
        ...c,
        eventBeforeHydration: await app.page.evaluate(() => window.hymnal.eventBeforeHydration),
        waited,
        errors: await app.errors(),
        kept,
        blankBefore,
        moved: (await app.place()).top - after,
        blankAfter: await app.blank(),
        jumps: await app.jumps(),
      };
      const clean =
        waited === 'heard' &&
        seen.eventBeforeHydration &&
        seen.errors.length === 0 &&
        kept === 0 &&
        blankBefore === 0 &&
        seen.moved === 0 &&
        seen.blankAfter === 0 &&
        seen.jumps.length === 0;
      if (!clean) misses.push(seen);
    }
    return { seed, misses };
  };

  for (const list of ['hymns', 'search'] as const) {
    for (const height of heights) {
      const cases = coldsOf(list, seed).filter((c) => c.height === height);
      for (const [page, part] of groups(cases, Math.ceil(cases.length / 2)).entries()) {
        it.concurrent(`the ${list} list, ${height} px high, keeps a scroll made before and after hydration, page ${page + 1}`, async () => {
          expect(await loads(list, height, part)).toEqual({ seed, misses: [] });
        });
      }
    }
  }
});

describe('a list come back', () => {
  for (const list of ['hymns', 'search'] as const) {
    const other = list === 'hymns' ? 'search' : 'hymns';
    for (const way of ['back', 'header', 'tab'] as const) {
      it.concurrent(`the ${list} list, moved to its top as it is drawn back deep by ${way}, stays at its top`, async () => {
        await using app = await open({ path: lists[list].path });
        await app.scrollTo(20_000);
        await app.settle(150);
        if (way === 'tab') {
          await app.tab(other);
          await app.page.waitForFunction(
            (path) => window.hymnal.on(path) && window.hymnal.place() !== undefined,
            lists[other].path,
          );
        } else await app.press(list, 'later', 20_000);
        const early = app.page.evaluate(() => window.hymnal.early());
        await (way === 'back'
          ? app.page.goBack()
          : way === 'header'
            ? app.page.getByText(`‹ ${lists[list].title}`, { exact: true }).click()
            : app.tab(list));
        const restored = await early;
        await app.settle(150);
        expect({ restored, top: (await app.place()).top, jumps: await app.jumps() }).toEqual({
          restored: 20_000,
          top: 0,
          jumps: [],
        });
      });
    }
  }
});

describe('the search field', () => {
  const typed = async (app: Session, text: string) => {
    await app.page.keyboard.type(text);
    return {
      focused: await app.page.evaluate(() => document.activeElement?.getAttribute('role')),
      text: await app.page.getByRole('searchbox').inputValue(),
    };
  };

  for (const pressed of [false, true]) {
    it.concurrent(`keeps the reader's focus and takes his keys after hydration, the list scrolled before it${pressed ? ' and the field pressed' : ''}`, async () => {
      await using app = await open({ path: lists.search.path, hold: true });
      const { max } = await app.place();
      await app.scroll(Math.round(max * 0.33));
      if (pressed) await app.page.getByRole('searchbox').click();
      await app.page.evaluate(() => window.hymnal.hydrate());
      await app.hydrated();
      await app.settle(150);
      expect(await typed(app, 'lord')).toEqual({ focused: 'searchbox', text: 'lord' });
    });
  }

  it.concurrent('keeps its focus and takes the reader’s keys when the list comes back deep', async () => {
    await using app = await open({ path: lists.search.path });
    const { max } = await app.place();
    await app.scrollTo(Math.round(max * 0.6));
    await app.settle(150);
    await app.tab('hymns');
    await app.page.waitForFunction(() => window.hymnal.on('/'));
    await app.tab('search');
    await app.page.waitForFunction(() => window.hymnal.on('/search') && window.hymnal.showing());
    await app.settle(150);
    expect(await typed(app, 'lord')).toEqual({ focused: 'searchbox', text: 'lord' });
  });

  it.concurrent('lets go of the reader’s focus, putting the keyboard away, when he drags the list with a finger', async () => {
    await using app = await open({ path: lists.search.path, touch: true });
    const row = await app.middleRow();
    const before = await app.page.evaluate(() => document.activeElement?.getAttribute('role'));
    const touch = await app.context.newCDPSession(app.page);
    const at = (y: number) => [{ x: row.x, y }];
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(row.y) });
    for (const step of [10, 20, 40, 80])
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: at(row.y - step),
      });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await app.settle(150);
    const after = await app.page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect({ before, after }).toEqual({ before: 'searchbox', after: null });
  });
});

describe('a press at once', () => {
  it.concurrent('whose link is not there fails at once, saying so', async () => {
    await using app = await open();
    const outcome = await app.leaveAtOnce(2000, 'Nowhere').then(
      () => 'pressed',
      (error: Error) => error.message,
    );
    expect(outcome).toContain('no link to Nowhere');
  });
});

describe('a row', () => {
  const second = '[aria-label="2, All Creatures of Our God and King"]';

  it.concurrent('is an anchor to its hymn', async () => {
    await using app = await open();
    const link = await app.page.evaluate((selector) => {
      const row = document.querySelector(selector);
      return { tag: row?.tagName, href: row?.getAttribute('href') };
    }, second);
    expect(link).toEqual({ tag: 'A', href: '/hymns/2' });
  });

  it.concurrent('keeps a long title on one line, in a row of the height the list counts on', async () => {
    await using app = await open({ height: 568 });
    await app.page.setViewportSize({ width: 320, height: 568 });
    await app.settle(0);
    const sizes = await app.page.evaluate(() => {
      const row = document.querySelector(
        '[aria-label="9, Let All the World in Every Corner Sing"]',
      );
      const texts = [...(row?.querySelectorAll('div[dir]') ?? [])];
      return {
        row: row?.getBoundingClientRect().height,
        lines: texts.map((text) => Math.round(text.getBoundingClientRect().height)),
      };
    });
    expect(sizes).toEqual({ row: rowHeight, lines: [22, 22] });
  });

  it.concurrent('opens its hymn inside the app on Enter, never loading the page anew', async () => {
    await using app = await open();
    await app.page.evaluate(() => Object.assign(window, { kept: true }));
    await app.page.focus(second);
    await app.page.keyboard.press('Enter');
    await app.page.getByText('Hymn 2', { exact: true }).waitFor();
    const after = await app.page.evaluate(() => ({
      kept: 'kept' in window,
      path: location.pathname,
    }));
    expect(after).toEqual({ kept: true, path: '/hymns/2' });
  });

  it.concurrent('leaves a Cmd- or Ctrl-click to the browser, which opens the hymn in a new tab', async () => {
    await using app = await open();
    const [tab] = await Promise.all([
      app.context.waitForEvent('page', { timeout: 5000 }),
      app.page.locator(second).click({ modifiers: ['ControlOrMeta'] }),
    ]);
    await tab.getByText('Hymn 2', { exact: true }).waitFor();
    expect({
      tab: new URL(tab.url()).pathname,
      here: new URL(app.page.url()).pathname,
    }).toEqual({ tab: '/hymns/2', here: '/' });
  });
});
