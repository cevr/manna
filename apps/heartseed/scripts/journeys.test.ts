/* oxlint-disable effect/noNodeBuiltinImport -- the test reads verify-heartseed's feature files from disk, synchronously, as `hidden-ids.test.ts` does. */

/**
 * verify-heartseed's journeys hold the rules of `journey-rules.ts`: every
 * shipped `features/*.journey.json` waits for a first-minute heading only
 * after the welcome is left (R1), names no node hidden from VoiceOver (R2),
 * starts with an open that shows (R3), names only what the app's sources
 * can draw (R4), and is run by its feature file, whose cites name its steps
 * (R6), and ends with home at its top after a scroll to its foot (R7); and
 * the feature files drive in prose only where `LEGACY` says (R5).
 * R1, R2, R5 and R7 are held to plain models over generated journeys and texts,
 * and each rule names a mutant of the `first` journey.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'effect-bun-test';
import { type Journey, loadJourneys, type Step } from '@manna/sim/check';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

import {
  citeFaults,
  firstRunFaults,
  type Hidden,
  hiddenFaults,
  hiddenOfApp,
  holeFaults,
  journeyOfText,
  LEGACY,
  ownerFaults,
  proseDrives,
  REFERENCE_HOLES,
  handbookListTitles,
  shippedJourneys,
  sourcesOfApp,
  startFaults,
  footFaults,
  undrawn,
  wordHolesOf,
} from './journey-rules.ts';
import { footOf } from './foot.ts';
import { formatBibleReference, Reference } from '@manna/core/bible';
import { HANDBOOK } from '../src/handbook.ts';
import { readVerses } from '../vite/passage.ts';
import { app } from './sim-app.ts';

const SKILL = join(import.meta.dir, '../../../.claude/skills/verify-heartseed');
const FEATURES = join(SKILL, 'features');

const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** `SKILL.md` and each `features/*.md`, by its path from the skill's folder, with its text. */
const markdown = (): ReadonlyMap<string, string> =>
  new Map(
    [
      'SKILL.md',
      ...readdirSync(FEATURES)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => `features/${name}`),
    ].map((file) => [file, readFileSync(join(SKILL, file), 'utf8')]),
  );

/** An expect as a journey file holds it. */
type RawExpect = { readonly shows: string } | { readonly hides: string };

/** A step as a journey file holds it, before the schema fills its defaults. */
interface Raw {
  readonly name: string;
  readonly action: string;
  readonly receipt?: string;
  readonly link?: string;
  readonly relaunch?: boolean;
  readonly target?: string;
  readonly from?: string;
  readonly at?: string;
  readonly direction?: string;
  readonly value?: string;
  readonly dx?: number;
  readonly dy?: number;
  readonly scale?: number;
  readonly expect?: ReadonlyArray<RawExpect>;
}

/** `steps` as the journey of `feature`, loaded as `sim journey` loads it for Heartseed. */
const loaded = (steps: ReadonlyArray<Raw | Step>, feature = 'gen') =>
  journeyOfText(feature, toJson({ feature, platform: 'ios', steps }));

/** Each of `journeys` loaded at once, from one folder, each its own feature `g<n>`, in order. */
const loadedAll = (journeys: ReadonlyArray<ReadonlyArray<Raw>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    const named = journeys.map((steps, at) => ({
      feature: `g${String(at).padStart(3, '0')}`,
      platform: 'ios',
      steps,
    }));
    yield* Effect.forEach(named, (journey) =>
      fs.writeFileString(path.join(dir, `${journey.feature}.journey.json`), toJson(journey)),
    );
    return yield* loadJourneys(app, dir);
  });

/** The step names a rule's faults name: each fault starts `<feature>/<step> `. */
const stepsOf = (faults: ReadonlyArray<string>) => [
  ...new Set(faults.map((fault) => (fault.split(' ')[0] ?? '').split('/')[1] ?? fault)),
];

/** The model's selector: an id, or a label folded, after an optional role. */
const modelParse = (text: string) => {
  const rest = /^role=\w+ (.*)$/s.exec(text)?.[1] ?? text;
  const unquote = (value: string) => value.replace(/^"(.*)"$/s, '$1');
  if (rest.startsWith('id=')) return { id: unquote(rest.slice(3)), label: '' };
  if (rest.startsWith('label=')) return { id: '', label: unquote(rest.slice(6)).toLowerCase() };
  return { id: '', label: rest.toLowerCase() };
};

const POINT = /^[\d.,-]+$/;

/** The model's acted-on selectors: a target that is not `screen`, a start that is no point. */
const modelActed = (step: Raw): ReadonlyArray<string> => [
  ...Option.toArray(Option.fromUndefinedOr(step.target)).filter((target) => target !== 'screen'),
  ...[step.from, step.at].flatMap((start) =>
    Option.toArray(Option.fromUndefinedOr(start)).filter((text) => !POINT.test(text)),
  ),
];

const modelShows = (step: Raw) =>
  (step.expect ?? []).flatMap((each) => {
    if ('shows' in each) return [each.shows];
    return [];
  });
const modelHides = (step: Raw) =>
  (step.expect ?? []).flatMap((each) => {
    if ('hides' in each) return [each.hides];
    return [];
  });

const HEADINGS = ['hear it', 'say it with help', 'say it alone', 'planted'];
const WAYS_ON = ['skip', 'plant your first verse'];

/** R1's model: the steps that wait for a heading while the launch they are in has not left the welcome. */
const modelFirstRun = (steps: ReadonlyArray<Raw>) => {
  let left = false;
  const faults: Array<string> = [];
  for (const step of steps) {
    if (step.action === 'relaunch' || (step.action === 'open' && step.relaunch !== false))
      left = false;
    if (step.action === 'tap' && WAYS_ON.includes(modelParse(step.target ?? '').label)) left = true;
    const waits = [...modelActed(step), ...modelShows(step)];
    if (!left && waits.some((each) => HEADINGS.includes(modelParse(each).label)))
      faults.push(step.name);
  }
  return faults;
};

/** R2's model: the steps any selector of which is a hidden id or a hidden family's numbered id. */
const modelHidden = (steps: ReadonlyArray<Raw>, hidden: Hidden) =>
  steps
    .filter((step) =>
      [...modelActed(step), ...modelShows(step), ...modelHides(step)].some((selector) => {
        const { id } = modelParse(selector);
        return (
          hidden.ids.has(id) ||
          [...hidden.families].some(
            (family) => id.startsWith(family) && /^\d+(-\d+)*$/.test(id.slice(family.length)),
          )
        );
      }),
    )
    .map((step) => step.name);

const rng = (seed: number) => {
  let state = seed;
  return (below: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Math.floor(state / 65536) % below;
  };
};
type Next = ReturnType<typeof rng>;
const pick = <A>(next: Next, of: ReadonlyArray<A>): A => of[next(of.length)] as A;

const LABELS = [
  'Hear it',
  'Say it with help',
  'Say it alone',
  'Planted',
  'Skip',
  'Plant your first verse',
  'Begin',
  'Listen',
  'Hear it soon',
  'Planted seeds',
];
const IDS = [
  'tip-1',
  'reading',
  'word-8',
  'break-8',
  'break-3-2',
  'break-',
  'break-a',
  'growing',
  'growing-image',
  'plant',
];
const HIDDEN: Hidden = { ids: new Set(['growing', 'plant']), families: new Set(['break-']) };

/** One selector, spelled any way `sim` reads: an id quoted or not, a label quoted, bare or prefixed in any case, a role before either. */
const selector = (next: Next) => {
  let body: string;
  if (next(3) === 0) {
    const id = pick(next, IDS);
    body = pick(next, [`id=${id}`, `id="${id}"`]);
  } else {
    const label = pick(next, LABELS);
    const cased = pick(next, [label, label.toLowerCase(), label.toUpperCase()]);
    body = pick(next, [`label=${cased}`, `label="${cased}"`, cased]);
  }
  if (next(4) === 0) return `role=${pick(next, ['button', 'heading'])} ${body}`;
  return body;
};

/** One generated step of every action: a pan's or pinch's start a point or a selector, a scroll's target the screen or one. */
const genStep = (next: Next, at: number): Raw => {
  const expect = Array.from({ length: next(3) }, (): RawExpect =>
    pick(next, [{ hides: selector(next) }, ...[1, 2, 3].map(() => ({ shows: selector(next) }))]),
  );
  const base = { name: `s${at}`, receipt: pick(next, ['snapshot', 'none']), expect };
  const start = () => pick(next, ['10,20', selector(next), selector(next)]);
  const made: ReadonlyArray<() => Raw> = [
    () => ({ ...base, action: 'open', link: '/' }),
    () => ({ ...base, action: 'open', link: '/', relaunch: true }),
    () => ({ ...base, action: 'open', link: '/', relaunch: false }),
    () => ({ ...base, action: 'tap', target: selector(next) }),
    () => ({ ...base, action: 'tap', target: selector(next) }),
    () => ({ ...base, action: 'fill', target: selector(next), value: 'x' }),
    () => ({ ...base, action: 'back' }),
    () => ({
      ...base,
      action: 'scroll',
      target: pick(next, ['screen', selector(next)]),
      direction: 'up',
    }),
    () => ({ ...base, action: 'gesture', from: start(), dx: 0, dy: 40 }),
    () => ({ ...base, action: 'pinch', at: start(), scale: 2 }),
    () => ({ ...base, action: 'hold', target: selector(next) }),
    () => ({ ...base, action: 'relaunch' }),
  ];
  return pick(next, made)();
};

const generated = (seed: number, count: number) => {
  const next = rng(seed);
  return Array.from({ length: count }, () =>
    Array.from({ length: 1 + next(8) }, (_, at) => genStep(next, at)),
  );
};

const INVOKES = [
  'sim',
  'bun run --cwd apps/heartseed sim',
  'HOME=$H bun run --cwd apps/heartseed sim',
  'bun ./apps/heartseed/scripts/sim.ts',
  'lockf -k /tmp/manna-sim-hs.lock bun run --cwd apps/heartseed sim',
  'cd apps/heartseed && bun run sim',
];
const DRIVES = [
  'open / --expect "label=Begin"',
  'open / --expect "id=today-card" --no-relaunch',
  'tap "label=Skip"',
  '-- tap Skip',
  'fill "id=field" x',
  'back',
  'scroll "label=Settings" down',
  'gesture 10,20 --dx 0 --dy -100',
  'pinch 10,20 --scale 2',
  'hold "label=Listen"',
  'relaunch',
];
const READS = [
  'snapshot tap',
  'doctor',
  'journey first --skip-video',
  'install',
  'read home',
  'down',
];
const OTHER_DRIVES = [
  'agent-device press \'role=switch label="Voice"\'',
  'agent-device wait \'label="Hear it"\' 5000',
];
const OTHER_READS = [
  'agent-device snapshot --json --raw --session verify-heartseed',
  'xcrun simctl uninstall <udid> app.heartseed',
  'xcrun simctl launch <udid> app.heartseed',
];

/** A markdown text of commands, inline, fenced or continued over fenced lines, and how many of them drive. */
const genProse = (next: Next) => {
  const lines = ['# A feature', '', 'Tap Skip, then open the app and scroll to Settings.', ''];
  let drives = 0;
  const count = 1 + next(6);
  for (let at = 0; at < count; at++) {
    const kind = next(4);
    let command = pick(next, OTHER_READS);
    if (kind === 0) command = `${pick(next, INVOKES)} ${pick(next, DRIVES)}`;
    if (kind === 1) command = `${pick(next, INVOKES)} ${pick(next, READS)}`;
    if (kind === 2) command = pick(next, OTHER_DRIVES);
    if (kind === 0 || kind === 2) drives++;
    if (next(3) === 0) lines.push('```bash', command.replace(' --', ' \\\n  --'), '```', '');
    else lines.push(`${at + 1}. Then \`${command}\` and read the snapshot.`, '');
  }
  return { text: lines.join('\n'), drives };
};

/** What a scroll reaches that is not home's foot nor its top: a furrow's row, the sheets' rows, the chooser's books. */
const ELSEWHERE = [
  'label=Open Promises of God',
  'label=Promises of God',
  'label=About',
  'label=Voice',
  'label=John',
  'screen',
];

/** Whether `selector` names what `target` names, as `sim` reads both: an id exactly, a label folded. */
const spells = (selector: string, target: string) =>
  toJson(modelParse(selector)) === toJson(modelParse(target));

/** `target` spelled any way `sim` reads it: quoted or not, a label in any case or bare, a role before either. */
const spelling = (next: Next, target: string) => {
  const { id, label } = modelParse(target);
  const value = id || target.slice('label='.length);
  let body = pick(next, [`id=${id}`, `id="${id}"`]);
  if (id === '') {
    const cased = pick(next, [value, value.toLowerCase(), value.toUpperCase()]);
    body = pick(next, [`label=${cased}`, `label="${cased}"`, cased]);
  }
  if (label === 'your field' || next(4) !== 0) return body;
  return `role=button ${body}`;
};

/**
 * R7's model: the last step that scrolls to a node of home's foot, unless
 * a later scroll to `Your field` or a `relaunch` brings home back to its top.
 */
const modelFoot = (steps: ReadonlyArray<Raw>): Option.Option<string> => {
  let foot = Option.none<string>();
  for (const step of steps) {
    if (step.action === 'relaunch') foot = Option.none();
    if (step.action !== 'scroll') continue;
    const target = step.target ?? '';
    if (FOOT_TARGETS.some((one) => spells(target, one))) foot = Option.some(step.name);
    if (modelParse(target).label === 'your field') foot = Option.none();
  }
  return foot;
};

/**
 * Journeys from home: a scroll to any foot target in any spelling, then
 * what a journey does there (open a sheet at the foot, scroll inside it,
 * tap, go back, open again without a relaunch), with now and then a scroll
 * up to `Your field` or a `relaunch`; each with the step R7's model names.
 */
const footJourneys = (seed: number, count: number) => {
  const next = rng(seed);
  const made = (at: number): Raw => {
    const name = `s${at}`;
    const kind = next(10);
    const direction = pick(next, ['down', 'up']);
    if (kind < 3)
      return {
        name,
        action: 'scroll',
        target: spelling(next, pick(next, FOOT_TARGETS)),
        direction,
      };
    if (kind === 3) return { name, action: 'scroll', target: pick(next, ELSEWHERE), direction };
    if (kind === 4)
      return {
        name,
        action: 'scroll',
        target: spelling(next, 'label=Your field'),
        direction: 'up',
      };
    if (kind === 5) return { name, action: 'relaunch' };
    if (kind === 6) return { name, action: 'open', link: '/', relaunch: pick(next, [false, true]) };
    if (kind === 7) return { name, action: 'back' };
    return {
      name,
      action: 'tap',
      target: pick(next, ['label=Settings', 'id=add-list', 'label=Done', 'label=About']),
    };
  };
  return Array.from({ length: count }, () => {
    const steps: ReadonlyArray<Raw> = [
      {
        name: 'home',
        action: 'open',
        link: '/',
        relaunch: false,
        expect: [{ shows: 'id=today-card' }],
        receipt: 'none',
      },
      ...Array.from({ length: 1 + next(7) }, (_, at): Raw => ({ ...made(at), receipt: 'none' })),
    ];
    return { steps, foot: modelFoot(steps) };
  });
};

const hidden = hiddenOfApp();
const sources = sourcesOfApp();

/** Home's foot as the screen's sources draw it (`footOf`). */
const FOOT = footOf(sources);

/** Every node of home's foot as a selector: each id, each label. */
const FOOT_TARGETS = [
  ...[...FOOT.ids].map((id) => `id=${id}`),
  ...[...FOOT.labels].map((label) => `label=${label}`),
];

/**
 * Home's foot as today's `src/field/screen.tsx` draws it under the lists,
 * written out by hand from the screen, apart from `footOf`: `Add a list`
 * and tip 3, the limit line, and the end rows with their hidden `›`.
 */
const FOOT_TODAY = {
  ids: ['add-list', 'end-row', 'limit', 'tip-3'],
  labels: [
    '3 passages or lists, the most for now. remove one to add another.',
    'add a list',
    'add a psalm, a passage or a set of promises when you want more.',
    'how heartseed works',
    'settings',
    '›',
  ],
};

/** A foot as sorted ids, sorted labels and what it could not read. */
const sortedFoot = (foot: ReturnType<typeof footOf>) => ({
  ids: [...foot.ids].sort(),
  labels: [...foot.labels].sort(),
  unread: foot.unread,
});

/** `sources` with each `[anchor, added]` put after its anchor in `src/field/screen.tsx`, and `more` files beside them. */
const screenWith = (
  edits: ReadonlyArray<readonly [string, string]>,
  more: ReadonlyArray<readonly [string, string]> = [],
) => [
  ...sources.map(([path, text]): readonly [string, string] => {
    if (path !== 'src/field/screen.tsx') return [path, text];
    let out = text;
    for (const [anchor, added] of edits) {
      expect(out).toContain(anchor);
      out = out.replace(anchor, `${anchor}\n${added}`);
    }
    return [path, out];
  }),
  ...more,
];

/** The anchors in today's screen: the last end row, the body's first const, the last import. */
const LAST_ROW = '<EndRow label="How Heartseed works" onPress={onHow} />';
const FIRST_CONST = 'const [settings, setSettings] = useState(false);';
const LAST_IMPORT = "import { Tip } from './tips';";

/** A screen of its own, apart from the app's: each form a foot node takes, after its furrows. */
const FIXTURE_SCREEN = [
  "import { Pressable, ScrollView, Text, View } from 'react-native';",
  "import { Row, WORDS } from './parts';",
  "const KINDS = ['one', 'two'] as const;",
  'export function FieldScreen() {',
  '  const held = <Text testID="held">Held in a const</Text>;',
  '  return (',
  '    <ScrollView>',
  '      <Text testID="above">Above</Text>',
  '      <View><Furrows /></View>',
  '      <View testID="caption"><Text>A caption</Text></View>',
  '      {KINDS.map((kind) => <Text key={kind}>{kind}</Text>)}',
  '      {held}',
  '      <Row n={3} label="From a file" />',
  '      <Pressable aria-label={`Tap ${WORDS[3]}`} />',
  '    </ScrollView>',
  '  );',
  '}',
].join('\n');

const FIXTURE_ROW = [
  "import { Text, View } from 'react-native';",
  'export function Row({ n, label, testID }: { readonly n: number; readonly label: string; readonly testID?: string }) {',
  '  return (',
  '    <View testID={`row-${n}`}>',
  '      <Text testID={testID}>{label}</Text>',
  '      {n > 2 && <Text>Big</Text>}',
  '    </View>',
  '  );',
  '}',
].join('\n');

describe('verify-heartseed journeys', () => {
  it.effect(
    'every shipped journey holds R1-R4 and is run by its feature file, whose cites name its steps',
    () =>
      Effect.gen(function* () {
        const journeys = yield* shippedJourneys;
        expect([
          ...new Set(journeys.map((journey) => journey.feature.split('-')[0] ?? '')),
        ]).toEqual([
          'about',
          'appearance',
          'back',
          'dictation',
          'doctor',
          'field',
          'first',
          'grow',
          'handbook',
          'home',
          'light',
          'list',
          'natural',
          'passage',
          'peek',
          'phrase',
          'promise',
          'run',
          'sayit',
          'session',
          'today',
          'wake',
        ]);
        const files = markdown();
        expect(
          journeys.flatMap((journey) => [
            ...firstRunFaults(journey),
            ...hiddenFaults(journey, hidden),
            ...startFaults(journey),
            ...footFaults(journey, FOOT),
          ]),
        ).toEqual([]);
        expect(undrawn(journeys, sources)).toEqual([]);
        const holes = wordHolesOf(sources);
        expect(holeFaults(sources)).toEqual([]);
        expect(holes.filter((hole) => hole.words.length < 2).map((hole) => hole.file)).toEqual([]);
        expect(ownerFaults(journeys, files)).toEqual([]);
        expect(citeFaults(journeys, files)).toEqual([]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('R1 and R2 name the steps their models name, over generated journeys', () =>
    Effect.gen(function* () {
      const raws = generated(20261112, 160);
      const journeys = yield* loadedAll(raws);
      const disagree = raws.flatMap((raw, at) => {
        const journey = journeys[at] as Journey;
        const pairs = [
          [stepsOf(firstRunFaults(journey)), modelFirstRun(raw)],
          [stepsOf(hiddenFaults(journey, HIDDEN)), modelHidden(raw, HIDDEN)],
        ];
        return pairs
          .filter(([got, want]) => toJson(got) !== toJson(want))
          .map(([got, want]) => `${toJson(raw)} got ${toJson(got)} want ${toJson(want)}`);
      });
      expect(disagree.slice(0, 2)).toEqual([]);
      const share = (rule: (raw: ReadonlyArray<Raw>) => ReadonlyArray<string>) =>
        raws.filter((raw) => rule(raw).length > 0).length / raws.length;
      const shares = [share(modelFirstRun), share((raw) => modelHidden(raw, HIDDEN))];
      expect(shares.map((one) => one > 0.15 && one < 0.85)).toEqual([true, true]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'R7 names the last foot scroll that no scroll up to Your field or relaunch follows, over generated journeys reaching every foot target',
    () =>
      Effect.gen(function* () {
        const raws = footJourneys(20261114, 120);
        const journeys = yield* loadedAll(raws.map(({ steps }) => steps));
        const disagree = raws.flatMap(({ steps, foot }, at) => {
          const got = stepsOf(footFaults(journeys[at] as Journey, FOOT));
          const want = Option.toArray(foot);
          if (toJson(got) === toJson(want)) return [];
          return [`${toJson(steps)} got ${toJson(got)} want ${toJson(want)}`];
        });
        expect(disagree.slice(0, 2)).toEqual([]);
        const tripped = raws.filter(({ foot }) => Option.isSome(foot));
        expect(tripped.length / raws.length > 0.3 && tripped.length / raws.length < 0.8).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'R7 trips a journey that ends on a scroll to each node the screen draws under its lists, in each spelling, inside a sheet after it too, and none scrolled back up',
    () =>
      Effect.gen(function* () {
        const next = rng(20261115);
        const home: Raw = {
          name: 'home',
          action: 'open',
          link: '/',
          relaunch: false,
          expect: [{ shows: 'id=today-card' }],
          receipt: 'none',
        };
        const scroll = (name: string, target: string, direction = 'down'): Raw => ({
          name,
          action: 'scroll',
          target,
          direction,
          receipt: 'none',
        });
        const cases = FOOT_TARGETS.flatMap((target) =>
          [0, 2].map((count) => {
            const spelled = spelling(next, target);
            const foot = scroll('foot', spelled);
            const tail: ReadonlyArray<Raw> = [
              { name: 'sheet', action: 'tap', target: 'label=Settings', receipt: 'none' },
              scroll('inside', 'label=About'),
            ].slice(0, count);
            return [
              { target: spelled, steps: [home, foot, ...tail], want: ['foot'] },
              {
                target: spelled,
                steps: [home, foot, ...tail, scroll('top', 'label=Your field', 'up')],
                want: [],
              },
            ];
          }),
        ).flat();
        const journeys = yield* loadedAll(cases.map(({ steps }) => steps));
        expect(
          cases.flatMap(({ target, want }, at) => {
            const got = stepsOf(footFaults(journeys[at] as Journey, FOOT));
            if (toJson(got) === toJson(want)) return [];
            return [`${target}: got ${toJson(got)} want ${toJson(want)}`];
          }),
        ).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'the foot is what the screen draws after its furrows: a node added there is in it, one added above them is not',
    () =>
      Effect.sync(() => {
        const added = sortedFoot(
          footOf(
            screenWith(
              [
                [LAST_IMPORT, "import { AddedRow } from './added-row';"],
                [FIRST_CONST, 'const held = <Text testID="added-local">Added local</Text>;'],
                [
                  LAST_ROW,
                  [
                    '<EndRow label="Help" onPress={onHow} />',
                    '<Text testID="added-host">Added inline</Text>',
                    '<View><Text>Added words</Text></View>',
                    '{held}',
                    '<AddedRow label="Added row" />',
                  ].join('\n'),
                ],
              ],
              [
                [
                  'src/field/added-row.tsx',
                  'import { Text } from \'react-native\';\nexport function AddedRow({ label }: { readonly label: string }) {\n  return <Text testID="added-row">{label}</Text>;\n}\n',
                ],
              ],
            ),
          ),
        );
        expect(added).toEqual({
          ids: [...FOOT_TODAY.ids, 'added-host', 'added-local', 'added-row'].sort(),
          labels: [
            ...FOOT_TODAY.labels,
            'help',
            'added inline',
            'added words',
            'added local',
            'added row',
          ].sort(),
          unread: [],
        });
        const above = sortedFoot(
          footOf(
            screenWith([
              [
                '<Text style={styles.label}>Lists</Text>',
                '<Text testID="above">Above the lists</Text>',
              ],
            ]),
          ),
        );
        expect(above).toEqual({ ...FOOT_TODAY, unread: [] });
      }),
  );

  it.effect("footOf reads today's foot as it is written out by hand, with nothing unread", () =>
    Effect.sync(() => {
      expect(sortedFoot(FOOT)).toEqual({ ...FOOT_TODAY, unread: [] });
    }),
  );

  it.effect(
    'footOf reads a screen of its own: a text child, a .map over a constant, a node held in a const, a component from another file through re-exports with its props, a template label, a condition',
    () =>
      Effect.sync(() => {
        const fixture = sortedFoot(
          footOf([
            ['src/field/screen.tsx', FIXTURE_SCREEN],
            ['src/field/row.tsx', FIXTURE_ROW],
            ['src/field/parts.ts', "export * from './row';\nexport { WORDS } from './words';\n"],
            ['src/field/words.ts', "export const WORDS = { 3: 'Third words' } as const;\n"],
          ]),
        );
        expect(fixture).toEqual({
          ids: ['caption', 'held', 'row-3'],
          labels: [
            'a caption',
            'big',
            'from a file',
            'held in a const',
            'one',
            'tap third words',
            'two',
          ],
          unread: [],
        });
      }),
  );

  it.effect(
    'footOf names what it cannot read under the lists: a call, an unknown component, a name it cannot spell, an id it cannot evaluate; and a screen with no furrows',
    () =>
      Effect.sync(() => {
        const unknown = footOf(
          screenWith([
            [
              LAST_ROW,
              [
                '{wordsOf(field)}',
                '<Mystery />',
                '<Text>{field.sown}</Text>',
                '<View testID={idOf(field)} />',
              ].join('\n'),
            ],
          ]),
        );
        expect(unknown.unread).toEqual([
          'src/field/screen.tsx: wordsOf(field)',
          'src/field/screen.tsx: <Mystery />',
          'src/field/screen.tsx: field.sown',
          'src/field/screen.tsx: testID={idOf(field)}',
        ]);
        const gone = footOf([['src/field/screen.tsx', FIXTURE_SCREEN.replace('<Furrows />', '')]]);
        expect(gone.unread).toEqual([
          'src/field/screen.tsx: no FieldScreen ScrollView holding <Furrows>',
        ]);
      }),
  );

  it.effect(
    'R1: a hold or a pan on Skip leaves nothing, a default open is a launch, a hides waits for nothing',
    () =>
      Effect.gen(function* () {
        const open: Raw = {
          name: 'a',
          action: 'open',
          link: '/',
          expect: [{ shows: 'label=Begin' }],
        };
        const cases: ReadonlyArray<readonly [ReadonlyArray<Raw>, ReadonlyArray<string>]> = [
          [
            [
              open,
              { name: 'b', action: 'hold', target: 'label=Skip' },
              { name: 'c', action: 'tap', target: 'Hear it' },
            ],
            ['c'],
          ],
          [
            [
              open,
              { name: 'b', action: 'tap', target: 'SKIP' },
              { name: 'c', action: 'open', link: '/', expect: [{ shows: 'label=Planted' }] },
            ],
            ['c'],
          ],
          [
            [
              open,
              { name: 'b', action: 'tap', target: 'skip' },
              {
                name: 'c',
                action: 'open',
                link: '/',
                relaunch: false,
                expect: [{ shows: 'label=Planted' }],
              },
            ],
            [],
          ],
          [
            [
              open,
              { name: 'b', action: 'gesture', from: 'label=Skip', dx: 0, dy: 9 },
              {
                name: 'c',
                action: 'scroll',
                target: 'role=heading label="SAY IT ALONE"',
                direction: 'down',
              },
            ],
            ['c'],
          ],
          [
            [
              open,
              {
                name: 'b',
                action: 'tap',
                target: 'role=button label="Plant your first verse"',
                expect: [{ shows: 'Hear it' }],
              },
              { name: 'c', action: 'relaunch', expect: [{ hides: 'label=Hear it' }] },
            ],
            [],
          ],
          [
            [
              { ...open, expect: [{ hides: 'label=Planted' }, { shows: 'id=planted' }] },
              { name: 'b', action: 'pinch', at: 'label=Say it with help', scale: 2 },
            ],
            ['b'],
          ],
        ];
        for (const [steps, want] of cases) {
          const quiet = steps.map((step) => ({ receipt: 'none', ...step }));
          const got = stepsOf(firstRunFaults(yield* loaded(quiet)));
          expect([toJson(steps), got]).toEqual([toJson(steps), [...want]]);
        }
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'R4 takes a reference only of the bundled KJV: past a chapter’s last verse it faults, alone, ending a range or in a reference hole, and its neighbours pass, over generated chapters',
    () =>
      Effect.gen(function* () {
        const verses = readVerses();
        const last = new Map<string, number>();
        for (const row of verses) last.set(`${row.book}:${row.chapter}`, row.verse);
        const chapters = [...last].filter((_, at) => at % 113 === 7);
        expect(chapters.length).toBeGreaterThan(8);
        const cases = chapters.flatMap(([key, end]) => {
          const [book = 0, chapter = 0] = key.split(':').map(Number);
          const named = (verse: number) =>
            formatBibleReference(Reference.verse(book, chapter, verse));
          const past = named(end + 1);
          const ranged = (to: number) =>
            formatBibleReference(
              Reference.range(
                Reference.verse(book, chapter, 1),
                Reference.verse(book, chapter, to),
              ),
            );
          return [
            { label: named(end), drawn: true },
            { label: past, drawn: false },
            { label: ranged(end), drawn: true },
            { label: ranged(end + 1), drawn: false },
            { label: `${named(1)}, seed`, drawn: true },
            { label: `${past}, seed, ready today`, drawn: false },
          ];
        });
        const all = [
          ...cases,
          { label: 'Mark 4:99', drawn: false },
          { label: 'Isaiah 41:99', drawn: false },
          { label: 'Isaiah 41:20', drawn: true },
        ];
        const journey = yield* loaded(
          [
            {
              name: 'gen-open',
              action: 'open',
              link: '/',
              receipt: 'none',
              expect: all.map(({ label }) => ({ shows: `label=${label}` })),
            },
          ],
          'gen',
        );
        expect(undrawn([journey], sources)).toEqual(
          all.filter(({ drawn }) => !drawn).map(({ label }) => `gen/gen-open label=${label}`),
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'R4 takes the canon’s books and chapters, the Handbook’s titles, the theme probe’s schemes and the own furrow’s references, and faults their neighbours',
    () =>
      Effect.gen(function* () {
        const all = [
          { label: 'Genesis', drawn: true },
          { label: 'Genesiss', drawn: false },
          { label: 'Psalms 150', drawn: true },
          { label: 'Psalms 151', drawn: false },
          { label: 'Jude 1', drawn: true },
          { label: 'Jude 2', drawn: false },
          { label: 'Seven Churches', drawn: true },
          { label: 'Seven Churchs', drawn: false },
          { label: 'Plant Smyrna', drawn: true },
          { label: 'Plant Smyrnaa', drawn: false },
          { label: 'Open Smyrna', drawn: true },
          { label: 'Open John 15:1-5', drawn: true },
          { label: 'Remove John 15:1-5', drawn: true },
          { label: 'Remove John 15:1-99', drawn: false },
          { label: 'Plant Psalms 46:1-3', drawn: true },
          { label: 'Start with Isaiah 41:10', drawn: true },
          { label: 'Start with Isaiah 41:99', drawn: false },
          { label: 'scheme dark', drawn: true },
          { label: 'scheme dusk', drawn: false },
          { label: 'Plant seed', drawn: false },
          { label: 'Plant blade', drawn: false },
          { label: 'Open ear', drawn: false },
          { label: 'Remove seed', drawn: false },
          { label: 'Start with seed', drawn: false },
          { label: 'Start with Seven Churches', drawn: false },
          { label: 'Isaiah 41:10, Seven Churches', drawn: false },
          { label: 'Seven Churches, seed', drawn: false },
          { label: 'Isaiah 41:10, seed', drawn: true },
        ];
        const journey = yield* loaded(
          [
            {
              name: 'gen-open',
              action: 'open',
              link: '/',
              receipt: 'none',
              expect: all.map(({ label }) => ({ shows: `label=${label}` })),
            },
          ],
          'gen',
        );
        expect(undrawn([journey], sources)).toEqual(
          all.filter(({ drawn }) => !drawn).map(({ label }) => `gen/gen-open label=${label}`),
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'R4 takes in each hole only the classes its module fills it with, over every hole × every word class',
    () =>
      Effect.gen(function* () {
        const words = wordHolesOf(sources);
        const stageHole = words.find(({ parts }) => parts[0] === 'Stage: ');
        const lists = handbookListTitles();
        const collections = new Set(words.flatMap((hole) => hole.words));
        const verses = readVerses().filter((_, at) => at % 4111 === 17);
        const samples = {
          reference: [
            ...verses.map((row) =>
              formatBibleReference(Reference.verse(row.book, row.chapter, row.verse)),
            ),
            'John 15:1-5',
          ],
          stage: [...(stageHole?.words ?? [])],
          list: [...lists]
            .filter((title) => !/\d:\d/u.test(title) && !collections.has(title))
            .filter((_, at) => at % 29 === 3),
          section: HANDBOOK.map((section) => section.title).filter((title) => !lists.has(title)),
          book: ['Genesis', 'Jude 1'],
          typed: ['zz typed words'],
        } as const satisfies Record<string, ReadonlyArray<string>>;
        const KINDS = ['reference', 'stage', 'list', 'section', 'book', 'typed'] as const;
        type Kind = (typeof KINDS)[number] | 'own';
        expect(verses.length).toBeGreaterThan(5);
        expect(samples.stage.length).toBeGreaterThan(2);
        expect(samples.list.length).toBeGreaterThan(2);
        expect(samples.section.length).toBeGreaterThan(0);
        const takers = [
          ...REFERENCE_HOLES.map(({ parts, fills }) => ({
            parts,
            takes: fills.map(
              (classes) => (kind: Kind, _piece: string) => classes.some((one) => one === kind),
            ),
          })),
          ...words.map(({ parts, words: own }) => ({
            parts,
            takes: [(_kind: Kind, piece: string) => own.includes(piece)],
          })),
        ];
        const templates = new Map(takers.map(({ parts }) => [parts.join('\u0000'), parts]));
        const classed = KINDS.flatMap((kind) =>
          samples[kind].map((piece) => [kind, piece] as const),
        );
        const pool: ReadonlyArray<readonly [Kind, string]> = [
          ...classed,
          ...words
            .flatMap((hole) => hole.words.map((piece) => ['own', piece] as const))
            .filter(([, piece]) => !classed.some(([, one]) => one === piece)),
        ];
        const cases = [...templates.values()].flatMap((parts) => {
          const fillings = parts
            .slice(1)
            .reduce<ReadonlyArray<ReadonlyArray<readonly [Kind, string]>>>(
              (prefixes, _, hole) =>
                prefixes.flatMap((prefix) =>
                  pool
                    .filter((__, at) => parts.length === 2 || at % (5 + 2 * hole) === hole)
                    .map((one) => [...prefix, one]),
                ),
              [[]],
            );
          return fillings.map((filling) => {
            const label = parts.reduce(
              (text, part, at) => `${text}${part}${filling[at]?.[1] ?? ''}`,
              '',
            );
            const drawn = takers.some(
              (taker) =>
                taker.parts.join('\u0000') === parts.join('\u0000') &&
                filling.every(([kind, piece], at) => taker.takes[at]?.(kind, piece) === true),
            );
            return { label, drawn };
          });
        });
        expect(cases.filter(({ drawn }) => !drawn).length).toBeGreaterThan(100);
        expect(cases.filter(({ drawn }) => drawn).length).toBeGreaterThan(30);
        const journey = yield* loaded(
          [
            {
              name: 'gen-open',
              action: 'open',
              link: '/',
              receipt: 'none',
              expect: cases.map(({ label }) => ({ shows: `label=${label}` })),
            },
          ],
          'gen',
        );
        expect(undrawn([journey], sources)).toEqual(
          cases.filter(({ drawn }) => !drawn).map(({ label }) => `gen/gen-open label=${label}`),
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('each rule names its mutant of the first journey', () =>
    Effect.gen(function* () {
      const journeys = yield* shippedJourneys;
      const first = journeys.find((journey) => journey.feature === 'first');
      expect(first?.feature).toBe('first');
      const steps = first?.steps ?? [];
      const mutant = (change: (steps: ReadonlyArray<Step>) => ReadonlyArray<Raw | Step>) =>
        loaded(change(steps), 'first');
      const unleft = yield* mutant((all) =>
        all.map((step) => {
          if (!('target' in step)) return step;
          if (step.target !== 'label=Skip' && step.target !== 'label=Plant your first verse')
            return step;
          return { ...step, target: 'label=Begin' };
        }),
      );
      expect(stepsOf(firstRunFaults(unleft))).toEqual([
        'first-grows-plant',
        'first-launch',
        'first-letters',
        'first-alone',
        'first-planted',
      ]);
      const adding = (at: number, more: RawExpect) => (all: ReadonlyArray<Step>) =>
        all.map((step, index) => {
          if (index !== at) return step;
          return { ...step, expect: [...step.expect, more] };
        });
      const early = yield* mutant(adding(0, { shows: 'label=hear it' }));
      expect(stepsOf(firstRunFaults(early))).toEqual(['first-welcome']);
      const broken = yield* mutant(adding(1, { hides: 'id=break-8' }));
      expect(stepsOf(hiddenFaults(broken, hidden))).toEqual(['first-welcome-still']);
      const headless = yield* mutant((all) => [
        { name: 'first-start', action: 'back', receipt: 'none' },
        ...all.slice(1),
      ]);
      expect(startFaults(headless)).toEqual([
        'first/first-start is no open that shows where the journey starts',
      ]);
      const scrolling = (name: string, target: string, direction: string): Raw => ({
        name,
        action: 'scroll',
        target,
        direction,
        receipt: 'none',
      });
      const footed = yield* mutant((all) => [
        ...all,
        scrolling('first-foot', 'id=add-list', 'down'),
        { name: 'first-sheet', action: 'tap', target: 'id=add-list', receipt: 'none' },
      ]);
      expect(footFaults(footed, FOOT)).toEqual(['first/first-foot leaves home at its foot']);
      const backed = yield* mutant((all) => [
        ...all,
        scrolling('first-foot', 'id=add-list', 'down'),
        { name: 'first-list', action: 'tap', target: 'label=Open Isaiah 41:10', receipt: 'none' },
        { name: 'first-back', action: 'tap', target: 'label=Your field', receipt: 'none' },
      ]);
      expect(footFaults(backed, FOOT)).toEqual(['first/first-foot leaves home at its foot']);
      const relaunched = yield* mutant((all) => [
        ...all,
        scrolling('first-foot', 'id=add-list', 'down'),
        { name: 'first-again', action: 'relaunch', receipt: 'none' },
      ]);
      expect(footFaults(relaunched, FOOT)).toEqual([]);
      const limited = yield* mutant((all) => [...all, scrolling('first-line', 'id=limit', 'down')]);
      expect(footFaults(limited, FOOT)).toEqual(['first/first-line leaves home at its foot']);
      const sheeted = yield* mutant((all) => [
        ...all,
        scrolling('first-settings', 'label=Settings', 'down'),
        { name: 'first-sheet', action: 'tap', target: 'label=Settings', receipt: 'none' },
        scrolling('first-about', 'label=About', 'down'),
      ]);
      expect(footFaults(sheeted, FOOT)).toEqual(['first/first-settings leaves home at its foot']);
      const shipped = (feature: string) =>
        journeys.find((journey) => journey.feature === feature)?.steps ?? [];
      const unscrolled = yield* loaded(
        shipped('session-restore').filter((step) => step.name !== 'session-restore-top'),
        'session-restore',
      );
      expect(footFaults(unscrolled, FOOT)).toEqual([
        'session-restore/session-restore-sheet leaves home at its foot',
      ]);
      const closed = yield* loaded(
        [...shipped('natural-sheet'), scrolling('natural-sheet-top', 'label=Your field', 'up')],
        'natural-sheet',
      );
      expect(footFaults(closed, FOOT)).toEqual([
        "natural-sheet hands on no sheet over home's foot",
      ]);
      const topped = yield* mutant((all) => [
        ...all,
        scrolling('first-foot', 'id=add-list', 'down'),
        scrolling('first-top', 'label=Your field', 'up'),
      ]);
      expect(footFaults(topped, FOOT)).toEqual([]);
      const last = steps.length - 1;
      const renamed = yield* mutant(adding(last, { shows: 'id=today-kard' }));
      expect(undrawn([renamed], sources)).toEqual(['first/first-home id=today-kard']);
      const restaged = yield* mutant(adding(last, { shows: 'label=Stage: sprout' }));
      expect(undrawn([restaged], sources)).toEqual(['first/first-home label=Stage: sprout']);
      const misnamed = yield* mutant(adding(last, { shows: 'label=Isiah 41:10' }));
      expect(undrawn([misnamed], sources)).toEqual(['first/first-home label=Isiah 41:10']);
      const plants = yield* mutant(
        adding(last, { shows: 'role=button label=Isaiah 41:10, seed, ready today' }),
      );
      expect(undrawn([plants], sources)).toEqual([]);
      const unplanted = yield* mutant(adding(last, { shows: 'label=Isaiah 41:10, sprout' }));
      expect(undrawn([unplanted], sources)).toEqual([
        'first/first-home label=Isaiah 41:10, sprout',
      ]);
      const unnamed = yield* mutant(adding(last, { shows: 'label=Isaiah 41, seed' }));
      expect(undrawn([unnamed], sources)).toEqual(['first/first-home label=Isaiah 41, seed']);
      const files = markdown();
      const text = files.get('features/first.md') ?? '';
      const unowned = new Map(files).set(
        'features/first.md',
        text.replaceAll('sim journey first-again', 'sim journey first'),
      );
      expect(ownerFaults(journeys, unowned)).toEqual([
        'first-again is run by no features/<stem>.md of its name',
      ]);
      const cited = new Map(files).set(
        'features/first.md',
        `${text}\n\`first/first-lines\`, \`other/x\``,
      );
      expect(citeFaults(journeys, cited)).toEqual([
        'features/first.md: first/first-lines names no step of first',
      ]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'the Today and probe journeys name their mutants: a skipped welcome, a break, a list title, a probe line',
    () =>
      Effect.gen(function* () {
        const journeys = yield* shippedJourneys;
        const named = (feature: string) =>
          journeys.find((journey) => journey.feature === feature)?.steps ?? [];
        const changed = (
          feature: string,
          change: (steps: ReadonlyArray<Step>) => ReadonlyArray<Raw | Step>,
        ) => loaded(change(named(feature)), feature);
        const unskipped = yield* changed('natural-hear', (all) =>
          all.filter((step) => step.name !== 'natural-hear-skip'),
        );
        expect(stepsOf(firstRunFaults(unskipped))).toEqual(['today-read']);
        const showing = (name: string, more: RawExpect) => (all: ReadonlyArray<Step>) =>
          all.map((step) => {
            if (step.name !== name) return step;
            return { ...step, expect: [...step.expect, more] };
          });
        const read = yield* changed('light-lines', showing('lines-read', { shows: 'id=break-6' }));
        expect(stepsOf(hiddenFaults(read, hidden))).toEqual(['lines-read']);
        const said = yield* changed('sayit-lines', showing('lines-say', { hides: 'id=break-26' }));
        expect(stepsOf(hiddenFaults(said, hidden))).toEqual(['lines-say']);
        const listed = yield* changed(
          'today-lines',
          showing('lines-plain', { shows: 'label=Open Protection & Fears' }),
        );
        expect(undrawn([listed], sources)).toEqual([
          'today-lines/lines-plain label=Open Protection & Fears',
        ]);
        const ended = yield* changed(
          'dictation',
          showing('dictation-hear', { shows: 'label=ended finishing' }),
        );
        expect(undrawn([ended], sources)).toEqual([
          'dictation/dictation-hear label=ended finishing',
        ]);
        const scripted = yield* changed(
          'dictation',
          showing('dictation-hear', { shows: 'label=script heard' }),
        );
        expect(undrawn([scripted], sources)).toEqual([
          'dictation/dictation-hear label=script heard',
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'R5 counts the driving commands of generated prose, however the helper is reached',
    () =>
      Effect.sync(() => {
        const next = rng(7);
        const texts = Array.from({ length: 200 }, () => genProse(next));
        const disagree = texts.filter(
          ({ text, drives }) => proseDrives('a.md', text).length !== drives,
        );
        expect(disagree.slice(0, 2)).toEqual([]);
        const fixed = [
          ['Run `sim install && sim tap "label=Skip"`.', 1],
          ['The word sim, a `sim` alone, `id=open` and a tap in prose.', 0],
          ['`sim snapshot tap`, `sim journey first`, `(sim relaunch)`', 1],
          ['`./scripts/sim.ts -- relaunch` and `myscripts/sim.ts open /`', 2],
          ['`agent-device snapshot -i`; `agent-device press @e3`', 1],
          ['A `sim\n  tap "label=Begin"` over two lines.', 1],
          [
            '1. A step:\n\n   ```bash\n   sim open probe/home --expect "label=Home probe"\n   sim snapshot home-probe\n   ```\n\n   then `sim tap "label=Continue"` and `sim tap "label=Got it"`.',
            3,
          ],
        ] as const;
        for (const [text, want] of fixed)
          expect([text, proseDrives('a.md', text).length]).toEqual([text, want]);
      }),
  );

  it.effect('LEGACY lists exactly the files that still drive in prose, each with why', () =>
    Effect.sync(() => {
      const driving = [...markdown()]
        .filter(([file, text]) => proseDrives(file, text).length > 0)
        .map(([file]) => file);
      expect([...LEGACY.keys()].sort()).toEqual(driving.sort());
      expect([...LEGACY.values()].filter((why) => why.trim() === '')).toEqual([]);
    }),
  );
});
