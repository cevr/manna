/* oxlint-disable effect/noNodeBuiltinImport -- the test reads verify-heartseed's feature files from disk, synchronously, as `hidden-ids.test.ts` does. */

/**
 * verify-heartseed's journeys hold the rules of `journey-rules.ts`: every
 * shipped `features/*.journey.json` waits for a first-minute heading only
 * after the welcome is left (R1), names no node hidden from VoiceOver (R2),
 * starts with an open that shows (R3), names only what the app's sources
 * can draw (R4), and is run by its feature file, whose cites name its steps
 * (R6); and the feature files drive in prose only where `LEGACY` says (R5).
 * R1, R2 and R5 are held to plain models over generated journeys and texts,
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
  shippedJourneys,
  sourcesOfApp,
  startFaults,
  undrawn,
  wordHolesOf,
} from './journey-rules.ts';
import { formatBibleReference, Reference } from '@manna/core/bible';
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

const hidden = hiddenOfApp();
const sources = sourcesOfApp();

describe('verify-heartseed journeys', () => {
  it.effect(
    'every shipped journey holds R1-R4 and is run by its feature file, whose cites name its steps',
    () =>
      Effect.gen(function* () {
        const journeys = yield* shippedJourneys;
        expect(journeys.map((journey) => journey.feature)).toEqual([
          'first-again',
          'first-cue',
          'first-reading',
          'first-whole',
          'first',
        ]);
        const files = markdown();
        expect(
          journeys.flatMap((journey) => [
            ...firstRunFaults(journey),
            ...hiddenFaults(journey, hidden),
            ...startFaults(journey),
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
