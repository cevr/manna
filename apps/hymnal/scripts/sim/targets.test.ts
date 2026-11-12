/**
 * The verify-hymnal journeys name only what the app can draw: each `id=` a
 * step names is a testID the app's source gives, and each `label=` an
 * accessible name its source, its compiled hymns or topics, or iOS itself
 * gives; so a renamed testID or label fails the gate, not the verifier's
 * drive with `TargetMissing`. And no iOS journey turns a hymn page with a
 * sideways `scroll screen`: agent-device's scroll drags with its controlled
 * scroll profile, which the pager at times does not take (the page stays),
 * where a `gesture` pan of the same length turns it every time. And each
 * journey starts with a relaunch, so it passes after any other journey.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import {
  type Fills,
  isSpelled,
  type Journey,
  loadJourneys,
  loadJourneyText,
  parseSelector,
  selectorsOf,
  type Source,
  type Spelled,
  spelled,
  staleHoles,
  STRING,
  type WordHole,
} from '@manna/sim/check';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

import { beatOf } from '../../src/player/tempo.ts';
import { shelvesOf } from '../../src/reader/lists.ts';
import { app } from '../sim-app.ts';

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

/** `text` as the hymnal's journey file of `feature`, loaded as `sim journey` loads it. */
const loadText = (feature: string, text: string) => loadJourneyText(app, feature, text);

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
  const { by, value } = parseSelector(selector);
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

/**
 * The journeys whose first step is no relaunch. A journey that opens a link
 * first starts wherever the journey before it left the app: the home list
 * screens down, a sheet up, a hymn's stack under the page; a relaunch starts
 * it at the list's top, with only the stored choices kept, whatever ran before.
 */
const unstarted = (journeys: ReadonlyArray<Journey>) =>
  journeys
    .filter((journey) => journey.steps[0]?.action !== 'relaunch')
    .map((journey) => journey.feature);

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
          Option.map(Option.fromNullishOr(ROW.exec(parseSelector(selector).value)), (row) =>
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
      const journeys = yield* loadJourneys(app, FEATURES);
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

  it.effect('no shipped iOS journey turns a page with a sideways scroll of the screen', () =>
    Effect.gen(function* () {
      const journeys = yield* loadJourneys(app, FEATURES);
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

  it.effect('every shipped journey starts with a relaunch', () =>
    Effect.gen(function* () {
      const journeys = yield* loadJourneys(app, FEATURES);
      expect(unstarted(journeys)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('a journey that opens a link or taps first is named; one that relaunches is not', () =>
    Effect.gen(function* () {
      const journeyOf = (feature: string, first: Readonly<Record<string, string>>) =>
        loadText(
          feature,
          toJson({
            feature,
            platform: 'ios',
            steps: [first, { name: 'next', action: 'back' }],
          }),
        );
      const journeys = [
        yield* journeyOf('search', { name: 'home', action: 'open', link: '/' }),
        yield* journeyOf('about', { name: 'hymn', action: 'open', link: 'hymns/100' }),
        yield* journeyOf('browse', { name: 'tab', action: 'tap', target: 'label=Topics' }),
        yield* journeyOf('player', { name: 'start', action: 'relaunch' }),
      ];
      expect(unstarted(journeys)).toEqual(['search', 'about', 'browse']);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
