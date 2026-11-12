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
import { describe, expect, it } from 'effect-bun-test';
import { Drive, type DriveMembers, type Place } from '@manna/sim/drive';
import { loadJourney, panStart } from '@manna/sim/journey';
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';

import { app } from '../sim-app.ts';

const SUFFIX = '.journey.json';
const PROBE = '/nonexistent/loop-probe-x';
const ROOT = import.meta.dir + '/../../../..';
const FEATURES = `${ROOT}/.claude/skills/verify-hymnal/features`;
const HYMNS = `${ROOT}/packages/hymnal/data/sdah-1985`;

/** The app's own source folders, whose testIDs and names a journey may select. */
const SOURCES = [`${ROOT}/apps/hymnal/src`, `${ROOT}/apps/hymnal/app`];

/**
 * Names iOS gives that no source of the app spells, each with where it comes
 * from: a journey may select them as it selects the app's own.
 */
const RUNTIME_LABELS = new Map([
  ['Sheet Grabber', "UIKit's grabber on a form sheet with `sheetGrabberVisible`"],
]);

/**
 * Labels the app joins from parts no one literal spells, each as a pattern
 * with where it is joined.
 */
const JOINED_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /^(dotted )?(whole|half|quarter|eighth|sixteenth) note = \d+$/,
    'TempoDial.tsx: `{beat.name}{` = ${bpm}`}`, the names of tempo.ts `NOTES`',
  ],
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
  readonly templates: ReadonlyArray<ReadonlyArray<string>>;
  /** What the journey types (`fill`): a label's hole may show it back (`No hymn matches “${q}”.`). */
  readonly typed: ReadonlyArray<string>;
}

const STRING = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
const TEMPLATE = /`((?:[^`\\]|\\.)*)`/g;
/** A JSX text between tags, its `{…}` expressions its holes. */
const JSX_TEXT = />((?:[^<>{}]|\{[^{}]*\})+)</g;
const JSX_HOLE = /\{[^{}]*\}/;
const HOLE = /\$\{[^}]*\}/;
/** Comments, taken out first: an apostrophe in one would pair with a quote in the code. */
const COMMENT = /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm;
/** A word of two letters or more: a template whose own text has none (`${a} ${b}`) names nothing. */
const WORD = /\p{L}{2,}/u;

/** The strings, template literals and JSX texts of `sources`, their comments left out. */
const spelled = (sources: ReadonlyArray<string>): Spelled => {
  const exact = new Set<string>();
  const templates: Array<ReadonlyArray<string>> = [];
  for (const source of sources.map((text) => text.replace(COMMENT, ''))) {
    for (const match of source.matchAll(STRING)) exact.add(match[1] ?? match[2] ?? '');
    for (const match of source.matchAll(JSX_TEXT)) {
      const parts = (match[1] ?? '').trim().split(JSX_HOLE);
      if (parts.length === 1) exact.add(parts[0] ?? '');
      else if (WORD.test(parts.join(' '))) templates.push(parts);
    }
    for (const match of source.matchAll(TEMPLATE)) {
      const parts = (match[1] ?? '').split(HOLE);
      if (parts.length === 1) exact.add(parts[0] ?? '');
      else if (WORD.test(parts.join(' '))) templates.push(parts);
    }
  }
  return { exact, templates, typed: [] };
};

/**
 * Whether `value` is spelled whole, as a string, or fills a template. A
 * testID's hole holds numbers joined by `-` (`chord-${at}-${n}`, `at` being
 * `1-1`), so `hymn-${…}` gives no word-named id. A label's hole holds a
 * number or one whole string the source spells (`{tab.name}` is `Sections`),
 * never any text, so `Play ${n}` does not draw `Play hymn 100`; a label
 * matches in any case, as agent-device matches it.
 */
const isSpelled = (from: Spelled, value: string, by: 'id' | 'label') => {
  if (from.exact.has(value)) return true;
  const anyCase = by === 'label';
  const fold = (text: string) => {
    if (anyCase) return text.toLowerCase();
    return text;
  };
  const known = new Set([...from.exact].map(fold));
  const typed = new Set(from.typed.map(fold));
  if (known.has(fold(value))) return true;
  const fills = (piece: string) =>
    ID_HOLE.test(piece) ||
    (anyCase && (/^\d+$/.test(piece) || known.has(piece) || typed.has(piece)));
  return from.templates.some((parts) => fillsTemplate(fold(value), parts.map(fold), fills));
};

/** A testID's hole: numbers joined by `-`. */
const ID_HOLE = /^\d+(?:-\d+)*$/;

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
const drawable = (from: Spelled, data: Data, selector: string) => {
  const { by, value } = parse(selector);
  if (by === 'id') return GONE_IDS.has(value) || isSpelled(from, value, 'id');
  const row = ROW.exec(value);
  if (row) return data.titles.get(Number(row[1])) === row[2];
  if (RUNTIME_LABELS.has(value)) return true;
  if (JOINED_LABELS.some(([pattern]) => pattern.test(value))) return true;
  if ([...data.topics].some((topic) => topic.toLowerCase() === value.toLowerCase())) return true;
  return isSpelled(from, value, 'label');
};

/** The selectors of each journey the app cannot draw, as `<feature>/<step> <selector>`. */
const undrawn = (journeys: ReadonlyArray<Journey>, from: Spelled, data: Data) =>
  journeys.flatMap((journey) => {
    const typed = journey.steps.flatMap((step) => {
      if (step.action !== 'fill') return [];
      return [step.value];
    });
    const own: Spelled = { exact: from.exact, templates: from.templates, typed };
    return journey.steps.flatMap((step) =>
      selectorsOf(step)
        .filter((selector) => !drawable(own, data, selector))
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
  const texts: Array<string> = [];
  for (const root of SOURCES) {
    const names = yield* fs.readDirectory(root, { recursive: true });
    const own = (one: string) => /\.tsx?$/.test(one) && !/\.test\.|\.d\.ts$|(^|\/)test\//.test(one);
    for (const name of names.filter(own).sort())
      texts.push(yield* fs.readFileString(path.join(root, name)));
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
      const from = spelled(yield* readSources);
      const data = yield* readData(rowNumbers(journeys));
      expect(undrawn(journeys, from, data)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'a renamed testID, one in a comment, a wrong title and an unspelled label are named',
    () =>
      Effect.gen(function* () {
        const from = spelled([
          'const a = <View testID="pager-page" accessibilityLabel={`Play hymn ${n}`} />;',
          '<Text>Keep screen on</Text>',
          "const b = { name: 'Settings', id: `chord-${p}-${l}` };",
          '/** The page\'s head, `id="hymn-head"`. */\nconst c = `hymn-${name}`;\n// it\'s "hymn-said"',
          'const d = `${a} ${b}`;',
          '<Text>{tab.name}, all at once</Text>',
          "const tab = { name: 'Lists' };",
          '<Text>{`Pause ${track.number}`}</Text>',
          'const e = `No hymn matches “${query}”.`;',
        ]);
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
              ],
            },
            { name: 'point', action: 'gesture', from: '3,437', dx: 10, dy: 0 },
            { name: 'type', action: 'fill', target: 'id=pager-page', value: 'qq' },
          ],
        });
        const journey = yield* loadText('hymn-reader', text);
        expect(undrawn([journey], from, data)).toEqual([
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
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

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
