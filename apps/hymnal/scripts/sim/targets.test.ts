/**
 * The verify-hymnal journeys name only what the app can draw: each `id=` a
 * step names is a testID the app's source gives, and each `label=` an
 * accessible name its source, its compiled hymns or topics, or iOS itself
 * gives; so a renamed testID or label fails the gate, not the verifier's
 * drive with `TargetMissing`. And no iOS journey turns a hymn page with a
 * sideways `scroll screen`: agent-device's scroll drags with its controlled
 * scroll profile, which the pager at times does not take (the page stays),
 * where a `gesture` pan of the same length turns it every time.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Drive, type DriveMembers, type Place } from '@manna/sim/drive';
import { loadJourney, panStart } from '@manna/sim/journey';
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';

import { beatOf } from '../../src/player/tempo.ts';
import { shelvesOf } from '../../src/reader/lists.ts';
import { app } from '../sim-app.ts';

const SUFFIX = '.journey.json';
const PROBE = '/nonexistent/loop-probe-x';
const ROOT = import.meta.dir + '/../../../..';
const FEATURES = `${ROOT}/.claude/skills/verify-hymnal/features`;
const HYMNS = `${ROOT}/packages/hymnal/data/sdah-1985`;

const APP = `${ROOT}/apps/hymnal`;

/** The app's own source folders under `APP`, whose testIDs and names a journey may select. */
const SOURCES = ['src', 'app'];

/**
 * Names iOS gives that no source of the app spells, each with where it comes
 * from: a journey may select them as it selects the app's own.
 */
const RUNTIME_LABELS = new Map([
  ['Sheet Grabber', "UIKit's grabber on a form sheet with `sheetGrabberVisible`"],
]);

/**
 * A label template whose hole holds a word: the file that spells it, its
 * parts between holes, and the words its holes take, read from the module
 * that names them. No other source string fills it, so renaming the word
 * where it is named fails, though the word is spelled elsewhere.
 */
interface WordHole {
  readonly file: string;
  readonly parts: ReadonlyArray<string>;
  readonly words: ReadonlyArray<string>;
}

/** The meters a hymn may beat in: simple and compound, over each note the dial names. */
const METERS = [1, 2, 4, 8, 16].flatMap((denominator) =>
  [3, 6].map((numerator) => ({ numerator, denominator })),
);

/**
 * The strings of the array `export const <name> = [...]` in `file` of
 * `sources`, read from its text: `tabs.ts` types its tabs by the indexes the
 * app builds, so a script cannot import it. None when it is gone or moved.
 */
const constStrings = (sources: ReadonlyArray<Source>, file: string, name: string) => {
  const text = sources.find(([one]) => one === file)?.[1] ?? '';
  const array = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(text)?.[1] ?? '';
  return [...array.matchAll(STRING)].map((match) => match[1] ?? match[2] ?? '');
};

/** The app's label templates whose hole holds a word, each filled from its own module. */
const wordHolesOf = (sources: ReadonlyArray<Source>): ReadonlyArray<WordHole> => [
  {
    file: 'src/reader/HymnList.native.tsx',
    parts: ['', ', see all'],
    words: shelvesOf([], () => Option.none()).map((shelf) => shelf.name),
  },
  {
    file: 'src/home/AllAtOnce.tsx',
    parts: ['', ', all at once'],
    words: constStrings(sources, 'src/home/tabs.ts', 'TAB_NAMES'),
  },
  {
    file: 'src/player/TempoDial.tsx',
    parts: ['', ' = ', ''],
    words: METERS.map((meter) => beatOf(meter).name),
  },
];

/**
 * TestIDs the app no longer draws that a journey names on purpose, in a
 * `hides`, to prove they stay gone, each with why.
 */
const GONE_IDS = new Map([
  ['find-play', 'browse-number: the drums hold `Open` alone, no Play (browse.md, by hand 11)'],
]);

const noStep = () => Effect.die('a journey file is only loaded here, never driven');

/** The drive `sim journey` loads a journey on: a booted iOS session, and no step taken. */
const booted: DriveMembers = {
  readSession: () =>
    Effect.succeed({
      platform: 'ios',
      out: `${PROBE}/out`,
      port: app.ports.default,
      serverPid: 1,
      udid: 'STAND-IN',
      bootedAt: '2026-10-30T00:00:00.000Z',
    }),
  boot: noStep,
  install: noStep,
  open: noStep,
  tap: noStep,
  fill: noStep,
  back: noStep,
  scroll: noStep,
  shot: noStep,
  snapshot: noStep,
  record: noStep,
  log: noStep,
  doctor: noStep,
  down: noStep,
  sees: noStep,
  gesture: noStep,
  pinch: noStep,
  hold: noStep,
  relaunch: noStep,
  clean: noStep,
};

/** The journey file of `feature` in `dir`, loaded as `sim journey <feature>` loads it. */
const load = (dir: string, feature: string) =>
  loadJourney(
    {
      app: `${PROBE}/app`,
      state: `${PROBE}/state`,
      script: `${PROBE}/app/scripts/sim.ts`,
      features: dir,
      warm: [],
      config: app,
    } satisfies Place,
    feature,
  ).pipe(
    Effect.map(({ journey }) => journey),
    Effect.provideService(Drive, booted),
  );

type Journey = Effect.Success<ReturnType<typeof load>>;
type Step = Journey['steps'][number];

/** Every journey file in `dir`, loaded. */
const loadAll = Effect.fn('loadAll')(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const files = (yield* fs.readDirectory(dir)).filter((name) => name.endsWith(SUFFIX)).sort();
  return yield* Effect.forEach(files, (name) => load(dir, name.slice(0, -SUFFIX.length)));
});

/** `text` as the journey file of `feature`, loaded. */
const loadText = (feature: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(path.join(dir, `${feature}${SUFFIX}`), text);
    return yield* load(dir, feature);
  });

/** A selector as `sim` reads it (`parseTarget` in `@manna/sim/drive`): `id=`, `label=`, or a bare label. */
const parse = (text: string) => {
  const rest = /^role=\w+ (.*)$/s.exec(text)?.[1] ?? text;
  const unquote = (value: string) => value.replace(/^"(.*)"$/s, '$1');
  if (rest.startsWith('id=')) return { by: 'id' as const, value: unquote(rest.slice(3)) };
  if (rest.startsWith('label=')) return { by: 'label' as const, value: unquote(rest.slice(6)) };
  return { by: 'label' as const, value: rest };
};

/** The selectors a step names: its target, its pan's start when not a point, and each expect's. */
const selectorsOf = (step: Step): ReadonlyArray<string> => {
  const own: Array<string> = [];
  if ('target' in step && step.target !== 'screen') own.push(step.target);
  let start = '';
  if ('from' in step) start = step.from;
  if ('at' in step) start = step.at;
  own.push(...Option.toArray(Option.filter(panStart(start), Predicate.isString)));
  for (const expect of step.expect) {
    if ('shows' in expect) own.push(expect.shows);
    else own.push(expect.hides);
  }
  return own;
};

/** What the app's sources spell: exact strings, and template literals as their parts between holes. */
interface Spelled {
  readonly exact: ReadonlySet<string>;
  readonly templates: ReadonlyArray<Template>;
}

/** A template literal or JSX text: the file that spells it, and its parts between holes. */
interface Template {
  readonly file: string;
  readonly parts: ReadonlyArray<string>;
}

/** What a hole may hold besides a number: the journey's typed text and the word holes' words. */
interface Fills {
  /** What the journey types (`fill`): a label's hole may show it back (`No hymn matches “${q}”.`). */
  readonly typed: ReadonlyArray<string>;
  readonly holes: ReadonlyArray<WordHole>;
}

const STRING = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
const TEMPLATE = /`((?:[^`\\]|\\.)*)`/g;
/** A JSX text between tags, its `{…}` expressions its holes. */
const JSX_TEXT = />((?:[^<>{}]|\{[^{}]*\})+)</g;
const JSX_HOLE = /\{[^{}]*\}/;
const HOLE = /\$\{[^}]*\}/;
/** Comments, taken out first: an apostrophe in one would pair with a quote in the code. */
const COMMENT = /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm;
/**
 * A word of two letters or more: a template whose own text has none (`${a}
 * ${b}`) names nothing, unless `wordHolesOf` gives its holes their words.
 */
const WORD = /\p{L}{2,}/u;

/** A source file: its path from the app's folder (`src/…`, `app/…`) and its text. */
type Source = readonly [file: string, text: string];

/** The strings, template literals and JSX texts of `sources`, their comments left out. */
const spelled = (sources: ReadonlyArray<Source>): Spelled => {
  const exact = new Set<string>();
  const templates: Array<Template> = [];
  for (const [file, text] of sources) {
    const source = text.replace(COMMENT, '');
    for (const match of source.matchAll(STRING)) exact.add(match[1] ?? match[2] ?? '');
    for (const match of source.matchAll(JSX_TEXT)) {
      const parts = (match[1] ?? '').trim().split(JSX_HOLE);
      if (parts.length === 1) exact.add(parts[0] ?? '');
      else templates.push({ file, parts });
    }
    for (const match of source.matchAll(TEMPLATE)) {
      const parts = (match[1] ?? '').split(HOLE);
      if (parts.length === 1) exact.add(parts[0] ?? '');
      else templates.push({ file, parts });
    }
  }
  return { exact, templates };
};

/** Whether two templates' parts are the same. */
const sameParts = (one: ReadonlyArray<string>, other: ReadonlyArray<string>) =>
  one.length === other.length && one.every((part, at) => part === other[at]);

/**
 * Whether `value` is spelled whole, as a string, or fills a template. A
 * testID's hole holds numbers joined by `-` (`chord-${at}-${n}`, `at` being
 * `1-1`), so `hymn-${…}` gives no word-named id. A label's hole holds a
 * number, the journey's typed text, or, in a template `wordHolesOf` lists for
 * its file, one of that entry's words: never any other text, so `Play ${n}`
 * does not draw `Play hymn 100`, and `${name}, see all` draws `Recent, see
 * all` only while the shelf is named `Recent`. A label matches in any case,
 * as agent-device matches it.
 */
const isSpelled = (from: Spelled, fills: Fills, value: string, by: 'id' | 'label') => {
  if (from.exact.has(value)) return true;
  const worded = (parts: ReadonlyArray<string>) => WORD.test(parts.join(' '));
  if (by === 'id')
    return from.templates.some(
      ({ parts }) => worded(parts) && fillsTemplate(value, parts, (piece) => ID_HOLE.test(piece)),
    );
  const fold = (text: string) => text.toLowerCase();
  if ([...from.exact].some((one) => fold(one) === fold(value))) return true;
  const typed = new Set(fills.typed.map(fold));
  return from.templates.some(({ file, parts }) => {
    const listed = fills.holes.filter((hole) => hole.file === file && sameParts(hole.parts, parts));
    if (listed.length === 0 && !worded(parts)) return false;
    const words = new Set(listed.flatMap((hole) => hole.words.map(fold)));
    const fill = (piece: string) => NUMBER.test(piece) || typed.has(piece) || words.has(piece);
    return fillsTemplate(fold(value), parts.map(fold), fill);
  });
};

/** The `wordHolesOf` entries whose file no longer spells their template, as `<file> <parts>`. */
const staleHoles = (from: Spelled, holes: ReadonlyArray<WordHole>) =>
  holes
    .filter(
      (hole) =>
        !from.templates.some(
          (template) => template.file === hole.file && sameParts(template.parts, hole.parts),
        ),
    )
    .map((hole) => `${hole.file} ${hole.parts.join('…')}`);

/** A testID's hole: numbers joined by `-`. */
const ID_HOLE = /^\d+(?:-\d+)*$/;

/** A label's number hole. */
const NUMBER = /^\d+$/;

/**
 * Whether `value` is `parts` joined by holes, each hole a non-empty piece
 * `fills` takes, trying every place a hole may end.
 */
const fillsTemplate = (
  value: string,
  parts: ReadonlyArray<string>,
  fills: (piece: string) => boolean,
): boolean => {
  const [head = '', ...rest] = parts;
  if (!value.startsWith(head)) return false;
  const after = value.slice(head.length);
  if (rest.length === 0) return after === '';
  for (let end = 1; end <= after.length; end++)
    if (fills(after.slice(0, end)) && fillsTemplate(after.slice(end), rest, fills)) return true;
  return false;
};

/** The compiled data a label may come from: each hymn's title by number, and the topics' names. */
interface Data {
  readonly titles: ReadonlyMap<number, string>;
  readonly topics: ReadonlySet<string>;
}

/** A hymn's row or link: `<number>, <title>`. */
const ROW = /^(\d+), (.+)$/s;

/**
 * Whether the app can draw `selector`: an `id` its source gives as a testID
 * string or template; a hymn's row `<n>, <title>` with hymn n's own title; a
 * label its source spells (any case: a style may set it in capitals), a
 * topic's name, or a name iOS gives.
 */
const drawable = (from: Spelled, fills: Fills, data: Data, selector: string) => {
  const { by, value } = parse(selector);
  if (by === 'id') return GONE_IDS.has(value) || isSpelled(from, fills, value, 'id');
  const row = ROW.exec(value);
  if (row) return data.titles.get(Number(row[1])) === row[2];
  if (RUNTIME_LABELS.has(value)) return true;
  if ([...data.topics].some((topic) => topic.toLowerCase() === value.toLowerCase())) return true;
  return isSpelled(from, fills, value, 'label');
};

/**
 * The selectors of each journey the app cannot draw, as `<feature>/<step>
 * <selector>`, a word hole taking only the words `holes` gives it.
 */
const undrawn = (
  journeys: ReadonlyArray<Journey>,
  from: Spelled,
  data: Data,
  holes: ReadonlyArray<WordHole>,
) =>
  journeys.flatMap((journey) => {
    const typed = journey.steps.flatMap((step) => {
      if (step.action !== 'fill') return [];
      return [step.value];
    });
    return journey.steps.flatMap((step) =>
      selectorsOf(step)
        .filter((selector) => !drawable(from, { typed, holes }, data, selector))
        .map((selector) => `${journey.feature}/${step.name} ${selector}`),
    );
  });

/**
 * The steps of an iOS journey that turn a page with a sideways `scroll
 * screen`: agent-device's controlled scroll, which the pager does not
 * always take. A page turn is a `gesture` pan.
 */
const sidewaysScreenScrolls = (journey: Journey) => {
  if (journey.platform !== 'ios') return [];
  return journey.steps
    .filter(
      (step) =>
        step.action === 'scroll' &&
        step.target === 'screen' &&
        (step.direction === 'left' || step.direction === 'right'),
    )
    .map((step) => `${journey.feature}/${step.name}`);
};

const Title = Schema.Struct({ number: Schema.Int, title: Schema.String });
const decodeTitle = Schema.decodeUnknownEffect(Schema.fromJsonString(Title));
const Topics = Schema.Struct({ topics: Schema.Array(Schema.Struct({ name: Schema.String })) });
const decodeTopics = Schema.decodeUnknownEffect(Schema.fromJsonString(Topics));

/**
 * The app's sources under `SOURCES`, read: no test and no declaration file,
 * since the dev server writes `app/routes.d.ts`, which git ignores and the
 * task's hash leaves out.
 */
const readSources = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const texts: Array<Source> = [];
  for (const root of SOURCES) {
    const names = yield* fs.readDirectory(path.join(APP, root), { recursive: true });
    const own = (one: string) => /\.tsx?$/.test(one) && !/\.test\.|\.d\.ts$|(^|\/)test\//.test(one);
    for (const name of names.filter(own).sort())
      texts.push([`${root}/${name}`, yield* fs.readFileString(path.join(APP, root, name))]);
  }
  return texts;
});

/** The titles of the hymns `numbers` names, and every topic's name. */
const readData = (numbers: ReadonlyArray<number>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const titles = new Map<number, string>();
    for (const number of new Set(numbers)) {
      const file = `${HYMNS}/${String(number).padStart(3, '0')}.json`;
      if (!(yield* fs.exists(file))) continue;
      const hymn = yield* decodeTitle(yield* fs.readFileString(file));
      titles.set(hymn.number, hymn.title);
    }
    const topics = yield* decodeTopics(yield* fs.readFileString(`${HYMNS}/topics.json`));
    return { titles, topics: new Set(topics.topics.map((topic) => topic.name)) } satisfies Data;
  });

/** The hymn numbers the row selectors of `journeys` name. */
const rowNumbers = (journeys: ReadonlyArray<Journey>) =>
  journeys.flatMap((journey) =>
    journey.steps.flatMap((step) =>
      selectorsOf(step).flatMap((selector) =>
        Option.toArray(
          Option.map(Option.fromNullishOr(ROW.exec(parse(selector).value)), (row) =>
            Number(row[1]),
          ),
        ),
      ),
    ),
  );

const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

describe('verify-hymnal journey targets', () => {
  it.effect('every target a shipped journey names is one the app can draw', () =>
    Effect.gen(function* () {
      const journeys = yield* loadAll(FEATURES);
      const sources = yield* readSources;
      const from = spelled(sources);
      const holes = wordHolesOf(sources);
      const data = yield* readData(rowNumbers(journeys));
      expect(undrawn(journeys, from, data, holes)).toEqual([]);
      expect(staleHoles(from, holes)).toEqual([]);
      expect(holes.filter((hole) => hole.words.length === 0).map((hole) => hole.file)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'a renamed testID, one in a comment, a wrong title, an unspelled label and a word its hole is not given are named',
    () =>
      Effect.gen(function* () {
        const from = spelled([
          [
            'src/a.tsx',
            'const a = <View testID="pager-page" accessibilityLabel={`Play hymn ${n}`} />;',
          ],
          ['src/b.tsx', '<Text>Keep screen on</Text>'],
          ['src/c.ts', "const b = { name: 'Settings', id: `chord-${p}-${l}` };"],
          [
            'src/d.ts',
            '/** The page\'s head, `id="hymn-head"`. */\nconst c = `hymn-${name}`;\n// it\'s "hymn-said"',
          ],
          ['src/e.ts', 'const d = `${a} ${b}`;'],
          ['src/home/AllAtOnce.tsx', '<Text>{tab.name}, all at once</Text>'],
          ['src/home/tabs.ts', "const tab = { name: 'Lists' }; const s = 'Sections';"],
          ['src/f.tsx', '<Text>{`Pause ${track.number}`}</Text>'],
          ['src/g.ts', "const e = `No hymn matches “${query}”.`; const f = '';"],
          ['src/reader/HymnList.native.tsx', 'const l = <P aria-label={`${name}, see all`} />;'],
          ['src/reader/lists.ts', "const shelf = { name: 'Recent', href: '/recent' };"],
          ['src/h.tsx', 'const k = `${kind}, see all`; const m = `${kind}, see more`;'],
          ['src/player/TempoDial.tsx', 'const t = `${beat.name} = ${bpm}`;'],
        ]);
        const holes: ReadonlyArray<WordHole> = [
          { file: 'src/home/AllAtOnce.tsx', parts: ['', ', all at once'], words: ['Lists'] },
          { file: 'src/reader/HymnList.native.tsx', parts: ['', ', see all'], words: ['History'] },
          { file: 'src/player/TempoDial.tsx', parts: ['', ' = ', ''], words: ['quarter note'] },
          { file: 'src/reader/HymnList.native.tsx', parts: ['', ', see more'], words: ['Later'] },
        ];
        const data: Data = {
          titles: new Map([[33, 'Song']]),
          topics: new Set(['Faith and Trust']),
        };
        const text = toJson({
          feature: 'hymn-reader',
          platform: 'ios',
          steps: [
            {
              name: 'good',
              action: 'tap',
              target: 'role=link label=33, Song',
              expect: [
                { shows: 'id=pager-page' },
                { shows: 'label=Play hymn 33' },
                { shows: 'label=Keep screen on' },
                { shows: 'role=button label=Settings' },
                { shows: 'id=chord-1-2' },
                { shows: 'label=FAITH AND TRUST' },
                { hides: 'role=button label=Sheet Grabber' },
                { shows: 'label=Lists, all at once' },
                { shows: 'label=quarter note = 90' },
              ],
            },
            {
              name: 'renamed',
              action: 'tap',
              target: 'id=hymn-pager',
              expect: [
                { shows: 'id=hymn-head' },
                { shows: 'id=hymn-said' },
                { shows: 'id=hymn-7' },
              ],
            },
            { name: 'title', action: 'tap', target: 'role=link label=33, Psalm' },
            {
              name: 'pan',
              action: 'gesture',
              from: 'label=Pause hymn 33',
              dx: 10,
              dy: 0,
              expect: [
                { shows: 'id=PAGER-PAGE' },
                { hides: 'label=Keep awake' },
                { shows: 'label=Open the player' },
                { shows: 'label=Pause 7' },
                { shows: 'label=Pause hymn 7' },
                { shows: 'label=Sections, all at once' },
                { shows: 'label=No hymn matches “qq”.' },
                { shows: 'label=No hymn matches “rr”.' },
                { shows: 'label=Pause 7 now' },
                { shows: 'label=, all at once' },
                { shows: 'label=History, see all' },
                { shows: 'label=Recent, see all' },
                { shows: 'label=crotchet = 90' },
                { shows: 'label=Quarter note = 72' },
                { shows: 'label=Later, see more' },
                { shows: 'label=7 8' },
              ],
            },
            { name: 'point', action: 'gesture', from: '3,437', dx: 10, dy: 0 },
            { name: 'type', action: 'fill', target: 'id=pager-page', value: 'qq' },
          ],
        });
        const journey = yield* loadText('hymn-reader', text);
        expect(undrawn([journey], from, data, holes)).toEqual([
          'hymn-reader/renamed id=hymn-pager',
          'hymn-reader/renamed id=hymn-head',
          'hymn-reader/renamed id=hymn-said',
          'hymn-reader/title role=link label=33, Psalm',
          'hymn-reader/pan label=Pause hymn 33',
          'hymn-reader/pan id=PAGER-PAGE',
          'hymn-reader/pan label=Keep awake',
          'hymn-reader/pan label=Open the player',
          'hymn-reader/pan label=Pause hymn 7',
          'hymn-reader/pan label=Sections, all at once',
          'hymn-reader/pan label=No hymn matches “rr”.',
          'hymn-reader/pan label=Pause 7 now',
          'hymn-reader/pan label=, all at once',
          'hymn-reader/pan label=Recent, see all',
          'hymn-reader/pan label=crotchet = 90',
          'hymn-reader/pan label=Later, see more',
          'hymn-reader/pan label=7 8',
        ]);
        expect(staleHoles(from, holes)).toEqual(['src/reader/HymnList.native.tsx …, see more']);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  test('a template is filled only by non-empty holes that end where the value ends', () => {
    let seed = 7;
    const next = (below: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % below;
    };
    const pick = <A>(from: ReadonlyArray<A>): A => from[next(from.length)] as A;
    const PIECES = ['', 'a', 'b', 'ab', ' ', 'a b'];
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const disagree: Array<string> = [];
    for (let round = 0; round < 400; round++) {
      const parts = Array.from({ length: 2 + next(3) }, () => pick(PIECES));
      const holes = parts.slice(1).map(() => pick(PIECES));
      const value = parts.reduce((text, part, at) => text + (holes[at - 1] ?? '') + part, '');
      const suffixed = value + pick(PIECES);
      const oracle = new RegExp(`^${parts.map(escape).join('(.+)')}$`, 's');
      for (const one of [value, suffixed])
        if (fillsTemplate(one, parts, () => true) !== oracle.test(one))
          disagree.push(`${toJson(parts)} ${toJson(one)}`);
    }
    expect(disagree.slice(0, 5)).toEqual([]);
  });

  it.effect('no shipped iOS journey turns a page with a sideways scroll of the screen', () =>
    Effect.gen(function* () {
      const journeys = yield* loadAll(FEATURES);
      expect(journeys.flatMap(sidewaysScreenScrolls)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'a sideways scroll of the screen is named; a pan, an upward one and a target are not',
    () =>
      Effect.gen(function* () {
        const text = toJson({
          feature: 'hymn-reader',
          platform: 'ios',
          steps: [
            { name: 'next', action: 'scroll', target: 'screen', direction: 'right' },
            { name: 'back', action: 'scroll', target: 'screen', direction: 'left' },
            { name: 'up', action: 'scroll', target: 'screen', direction: 'up' },
            { name: 'row', action: 'scroll', target: 'label=Stanza 3', direction: 'right' },
            { name: 'pan', action: 'gesture', from: '332,437', dx: -262, dy: 0, ms: 400 },
          ],
        });
        const journey = yield* loadText('hymn-reader', text);
        expect(sidewaysScreenScrolls(journey)).toEqual(['hymn-reader/next', 'hymn-reader/back']);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
