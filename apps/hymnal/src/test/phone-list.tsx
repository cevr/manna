/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noNullish, effect/noTernary -- a script at Bun's boundary: the list is imported only once the phone's stand-ins are registered (`phone.ts`), it drives React one step after another and reads the elements the document holds, and it prints its report on stdout. */

/**
 * Mounts the phones' hymn list (`HymnList.native.tsx`) as an iPhone draws
 * it, changes one value a row reads from outside its item while the list
 * stays mounted, and prints the rows on screen as JSON: before the change,
 * live after it, and freshly mounted under the new value. It does so for
 * each change in turn: `scheme` (light to dark), `fontScale` (1 to 1.5) and
 * `hrefOf` (a new link for each row), on the phone `phone.ts` stands in
 * for. It also prints, under `end`, the space each list keeps after its
 * last row at a bottom inset.
 *
 * Run as `bun phone-list.tsx cover`, it mounts the home list's top instead
 * (`pullDown`, with its `scroll` and `cover` shared values) under the
 * Reanimated stand-in (`reanimated.tsx`), where a style reads the values
 * as they are set, scrolls it to a topic's end, then covers its top by 0,
 * 26 and 52 points, and prints under `cover` each step's values and the
 * pinned row's place: its line's offset, its topic and how far it is
 * pushed up.
 */

import { plugin } from 'bun';

import { phone } from './phone';

const { device } = phone();
const covering = process.argv.includes('cover');
if (covering) {
  const reanimated = Bun.resolveSync('./reanimated.tsx', import.meta.dir);
  plugin({
    name: 'hymnal-phone-reanimated',
    setup(build) {
      build.module('react-native-reanimated', () => ({
        contents: `export * from ${JSON.stringify(reanimated)}; export { default } from ${JSON.stringify(reanimated)};`,
        loader: 'js',
      }));
      build.module('react-native-worklets', () => ({
        contents: `export { scheduleOnRN, runOnJS } from ${JSON.stringify(reanimated)};`,
        loader: 'js',
      }));
    },
  });
}

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const Atom = await import('effect/reactivity/Atom');
const { HymnList } = await import('../reader/HymnList.native');
const { safeArea } = await import('./one');

/** Forty hymns in two topics: more rows than the screen holds. */
const hymns = Array.from({ length: 40 }, (_, i) => ({
  number: i + 1,
  title: `Hymn ${i + 1}`,
  firstLine: '',
  topic: `Topic ${Math.floor(i / 20) + 1}`,
  sections: [],
}));

const elements = (parents: ReadonlyArray<Element>) =>
  parents.flatMap((parent) => [...parent.children]).filter((e) => e instanceof HTMLElement);

/**
 * The rows on screen by their labels: each hymn row's link, its number's
 * colour and its height; each topic row's height.
 */
const rowsOn = (host: HTMLElement) => ({
  hymns: Object.fromEntries(
    [...host.querySelectorAll('[role="link"]')].map((row) => {
      const frame = elements([row]);
      return [
        String(row.getAttribute('aria-label')),
        {
          href: String(row.getAttribute('href')),
          colour: elements(frame)
            .slice(0, 1)
            .map((number) => number.style.color)
            .join(),
          height: frame.map((view) => view.style.height).join(),
        },
      ];
    }),
  ),
  topics: Object.fromEntries(
    [...host.querySelectorAll<HTMLElement>('[role="heading"]')].map((row) => [
      String(row.getAttribute('aria-label')),
      { height: row.style.height },
    ]),
  ),
});

const hrefs = {
  first: (n: number) => `/hymns/${n}`,
  second: (n: number) => `/elsewhere/${n}`,
};
const offset = Atom.make(0);

const mount = async (hrefOf: (n: number) => string) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = async (next: (n: number) => string) => {
    await act(async () => {
      root.render(createElement(HymnList, { hymns, hrefOf: next, offset, byTopic: true }));
    });
  };
  await show(hrefOf);
  return {
    host,
    show,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

type List = Awaited<ReturnType<typeof mount>>;

/** Each change made to a mounted list, and the links a list mounted after it draws. */
const changes = {
  scheme: {
    make: (_: List) => act(async () => device.set({ scheme: 'dark' })),
    after: hrefs.first,
  },
  fontScale: {
    make: (_: List) => act(async () => device.set({ fontScale: 1.5 })),
    after: hrefs.first,
  },
  hrefOf: { make: (list: List) => list.show(hrefs.second), after: hrefs.second },
};

/** The rows before `change`, live after it, and in a list mounted after it. */
const observe = async (change: keyof typeof changes) => {
  device.set({ scheme: 'light', fontScale: 1 });
  const list = await mount(hrefs.first);
  const before = rowsOn(list.host);
  await changes[change].make(list);
  const live = rowsOn(list.host);
  list.unmount();
  const after = await mount(changes[change].after);
  const fresh = rowsOn(after.host);
  after.unmount();
  return { before, live, fresh };
};

/** The heights the first of `found` draws at, in points: none when nothing was found. */
const px = (found: ReadonlyArray<Element>) =>
  found
    .slice(0, 1)
    .filter((e) => e instanceof HTMLElement)
    .map((e) => Number.parseFloat(e.style.height));

/**
 * The end of a list mounted at a bottom inset: where its rows end (the
 * rows' frame, and the last row drawn when every row is drawn), and the
 * height of the space after them.
 */
const endOf = async (
  bottom: number,
  shown: ReadonlyArray<(typeof hymns)[number]>,
  byTopic: boolean,
) => {
  safeArea.bottom = bottom;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(HymnList, { hymns: shown, hrefOf: hrefs.first, offset, byTopic }));
  });
  const space = [...host.querySelectorAll('[data-testid="list-end"]')];
  const frame = space.flatMap((end) =>
    [end.parentElement?.previousElementSibling].filter((e) => e instanceof Element),
  );
  const drawn = elements(frame).map(
    (row) =>
      Number.parseFloat(row.style.top) +
      px([...row.querySelectorAll('[style*="height"]')]).reduce((a, b) => a + b, 0),
  );
  const result = {
    bottom,
    rows: shown.length,
    frame: px(frame),
    lastDrawn: Math.max(0, ...drawn),
    space: px(space),
  };
  act(() => root.unmount());
  host.remove();
  safeArea.bottom = 0;
  return result;
};

/** The translateY of an element's own style, in points. */
const shift = (element: Element | null | undefined) =>
  element instanceof HTMLElement
    ? Number.parseFloat(/translateY\((-?[\d.]+)px\)/.exec(element.style.transform)?.[1] ?? '0')
    : Number.NaN;

/**
 * The home list's top over forty hymns (a header 100 pt tall, resting at
 * 50), scrolled to 990, 26 pt above the second topic's row, then covered
 * by each of `covers` in turn: each step's values and where the pinned
 * row is drawn.
 */
const coverOf = async (covers: ReadonlyArray<number>) => {
  const { makeMutable } = await import('react-native-reanimated');
  const scroll = makeMutable(0);
  const cover = makeMutable(0);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(HymnList, {
        hymns,
        hrefOf: hrefs.first,
        offset,
        byTopic: true,
        pullDown: { node: createElement('div'), height: 100, rest: 50, scroll, cover },
      }),
    );
  });
  await act(async () => {
    scroll.value = 990;
  });
  const steps = [];
  for (const covered of covers) {
    await act(async () => {
      cover.value = covered;
    });
    const pin = host.querySelector('[aria-hidden="true"]');
    const place = pin?.firstElementChild;
    const strip = place?.firstElementChild;
    steps.push({
      scroll: scroll.value,
      cover: cover.value,
      line: shift(pin),
      y: shift(place),
      topic: -shift(strip) / 36,
    });
  }
  act(() => root.unmount());
  host.remove();
  return steps;
};

if (covering) {
  process.stdout.write(JSON.stringify({ cover: await coverOf([0, 26, 52]) }));
  process.exit(0);
}

/**
 * Three results of a search, the second found by a line other than its
 * title, at text size `fontScale`: each row's name, height and whether it
 * draws a found line.
 */
const foundOf = async (fontScale: number) => {
  device.set({ scheme: 'light', fontScale });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(HymnList, {
        hymns: hymns.slice(0, 3),
        hrefOf: hrefs.first,
        offset,
        lines: new Map([[2, 'A line found']]),
      }),
    );
  });
  const rows = [...host.querySelectorAll('[role="link"]')].map((row) => ({
    name: String(row.getAttribute('aria-label')),
    height: elements([row])
      .map((view) => view.style.height)
      .join(),
    line: row.querySelectorAll('[data-testid="row-line"]').length,
  }));
  act(() => root.unmount());
  host.remove();
  device.set({ fontScale: 1 });
  return rows;
};

/**
 * Seven results of a search and two hymns about it, one of them among the
 * strongest five: the rows in the order drawn, a hymn's as its number, a
 * section's as its name, and each section row's height.
 */
const aboutOf = async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(HymnList, {
        hymns: hymns.slice(0, 7),
        hrefOf: hrefs.first,
        offset,
        about: [hymns[9], hymns[2]].filter((h) => h !== undefined),
      }),
    );
  });
  const drawn = [...host.querySelectorAll('[role="heading"], [role="link"]')];
  const rows = drawn.map((row) =>
    row.getAttribute('role') === 'heading'
      ? String(row.getAttribute('aria-label'))
      : Number(/^(\d+),/.exec(String(row.getAttribute('aria-label')))?.[1]),
  );
  const sections = drawn
    .filter((row) => row.getAttribute('role') === 'heading')
    .map((row) => (row instanceof HTMLElement ? row.style.height : ''));
  act(() => root.unmount());
  host.remove();
  return { rows, sections };
};

process.stdout.write(
  JSON.stringify({
    about: await aboutOf(),
    scheme: await observe('scheme'),
    fontScale: await observe('fontScale'),
    hrefOf: await observe('hrefOf'),
    end: [
      await endOf(34, hymns, true),
      await endOf(0, hymns, true),
      await endOf(34, hymns.slice(0, 3), false),
    ],
    found: [await foundOf(1), await foundOf(1.5)],
  }),
);
process.exit(0);
