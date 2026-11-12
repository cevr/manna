/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noNewPromise -- the scenes are drawn by Bun processes of their own, spawned at Bun's boundary and joined with their pipes drained; a script that fails says so on the test run's stderr. */

/**
 * Each verify-hymnal journey's targets are drawn where its steps meet them.
 * `targets.test.ts` (the gate's fast check) asks only whether some source
 * spells a target, and most of the journeys' whole labels are spelled in
 * more than one file, so a renamed tab or button there stays green while
 * the drive fails with `TargetMissing`. Here each step is given the scene it
 * leaves the app in (`SCENES`), and the phones' screens draw each scene
 * (`phone-scenes.tsx`, in a process of its own) for the names they draw:
 *
 * - a step's `shows` are drawn in its own scene;
 * - a step's target and pan start, which it acts on, are drawn in the scene
 *   before it (a scroll's target in its own: the scroll brings it in);
 * - a step's `hides`, gone there, are drawn in some scene of the journeys,
 *   or in the scene `DRAWN_ELSEWHERE` names, so a renamed one is not gone
 *   for good unseen.
 *
 * A name matches in any case, as agent-device matches it; a selector's role
 * is not read. Every step of every journey has its scene, and every scene
 * its step, so a new step or a renamed one is named until `SCENES` gives it
 * one.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Array as Arr, Effect, FileSystem, Match, Option, Schema } from 'effect';

import type { Scene } from './scene';

const FEATURES = `${import.meta.dir}/../../../../.claude/skills/verify-hymnal/features`;
const SUFFIX = '.journey.json';

/** Names iOS gives that the app draws none of, each with where it comes from. */
const RUNTIME_LABELS = new Map([
  ['Sheet Grabber', "UIKit's grabber on a form sheet with `sheetGrabberVisible`"],
]);

/** TestIDs the app no longer draws that a journey names in a `hides` to prove them gone, each with why. */
const GONE_IDS = new Map([
  ['find-play', 'browse-number: the drums hold `Open` alone, no Play (browse.md, by hand 11)'],
]);

const home = (more: Omit<Scene, 'route'> = {}): Scene => ({ route: 'home', ...more });
const hymn = (n = 100, more: Omit<Scene, 'route' | 'hymn'> = {}): Scene => ({
  route: 'hymn',
  hymn: n,
  ...more,
});
const player = (n = 100, more: Omit<Scene, 'route' | 'hymn'> = {}): Scene => ({
  route: 'player',
  hymn: n,
  ...more,
});
const settings = (more: Omit<Scene, 'route'> = {}): Scene => ({ route: 'settings', ...more });
const about: Scene = { route: 'about', hymn: 100 };

const chords = { chords: true } as const;
const dials = { chords: true, dials: true } as const;
const moved = { chords: true, dials: true, moved: true } as const;
const playing = { playing: true } as const;

/**
 * The scene each step of each shipped journey leaves the app in, by
 * feature and step. A sheet's grabber gestures leave the sheet up (half),
 * then close it to the scene under it.
 */
const SCENES = {
  about: {
    hymn: hymn(),
    'about-sheet': about,
    'about-close': hymn(),
    'sheet-again': about,
    'about-tunes': about,
    'about-topics': home({ topic: 'Faith and Trust' }),
    'tab-row': home(),
    'tab-put-back': home(),
    'hymn-again': hymn(),
    'sheet-third': about,
    'scripture-row': about,
    'about-scripture': home({ search: '' }),
    'search-cancel': home(),
  },
  browse: {
    'browse-tabs': home(),
    'browse-topics': home({ tab: 'Topics' }),
    'browse-metres': home({ tab: 'Metres' }),
    'browse-scripture': home({ tab: 'Scripture' }),
    'browse-lists': home({ tab: 'Lists' }),
    'browse-sections': home(),
    'browse-all-at-once': home({ tiles: true }),
    'all-at-once-done': home(),
    'browse-number': home({ drums: true }),
    'drums-close': home(),
    'past-recent': home(),
    'drums-outside': home({ drums: true }),
    'browse-number-outside': home(),
    'drums-again': home({ drums: true }),
    'browse-number-open': hymn(1),
    'back-home': home(),
    'list-top': home(),
    'tab-topics': home({ tab: 'Topics' }),
    'browse-tab-kept': home({ tab: 'Topics' }),
    'tab-put-back': home(),
  },
  'chords-and-capo': {
    off: hymn(),
    chords: hymn(100, chords),
    'chords-key': hymn(100, dials),
    transpose: hymn(100, moved),
    'chords-reset': hymn(100, chords),
    'reset-home': hymn(100, dials),
    'dials-close': hymn(100, chords),
    'chords-kept': hymn(100, chords),
    'kept-after-relaunch': hymn(100, chords),
    'chords-levels': hymn(181, chords),
    'chords-simple': hymn(3, chords),
    'chords-tap': { route: 'chord', hymn: 3, chords: true },
    'chord-sheet-done': hymn(3, chords),
    'chords-off-sheet': player(3, chords),
    'chords-off-switch': player(3, chords),
    'chords-off': player(3),
    'chords-off-half': player(3),
    'chords-off-close': hymn(3),
    'chords-mode-simple': hymn(),
    'chords-mode-simple-sheet': player(),
    'chords-mode-simple-switch': player(),
    'chords-mode-simple-half': player(),
    'chords-mode-simple-close': hymn(),
    'chords-mode-on': hymn(100, chords),
    'chords-mode-on-sheet': player(100, chords),
    'chords-mode-on-dials': player(100, chords),
    'chords-mode-off': player(),
    'chords-mode-off-half': player(),
    'chords-mode-off-close': hymn(),
    'chords-mode-kept-on': hymn(100, chords),
    'chords-mode-kept-relaunch': hymn(100, chords),
    'chords-mode-kept': hymn(100, chords),
    'chords-mode-kept-sheet': player(100, chords),
    'chords-mode-kept-switch': player(100, chords),
    'chords-mode-kept-off': player(),
    'chords-mode-kept-half': player(),
    'chords-mode-kept-close': hymn(),
  },
  feel: {
    'feel-voice': hymn(),
    'chords-on': hymn(100, chords),
    dials: hymn(100, dials),
    'feel-cues': hymn(100, moved),
    'capo-down': hymn(100, dials),
    'key-up': hymn(100, moved),
    reset: hymn(100, chords),
    settings: settings(chords),
    'feel-switch': settings(chords),
    'feel-off': settings(chords),
    'settings-half': settings(chords),
    'settings-close': hymn(100, chords),
    'hymn-off': hymn(100, chords),
    'dials-off': hymn(100, dials),
    'capo-off': hymn(100, moved),
    'reset-off': hymn(100, chords),
    'chords-put-back-sheet': player(100, chords),
    'chords-put-back-switch': player(100, chords),
    'chords-put-back': player(),
    'chords-put-back-half': player(),
    'chords-put-back-close': hymn(),
    'settings-again': settings(),
    'feel-switch-again': settings(),
    'feel-put-back': settings(),
    close: hymn(),
  },
  follow: {
    hymn: hymn(),
    'sound-off': hymn(),
    'follow-play': hymn(100, playing),
    'follow-hand': hymn(100, { playing: true, hand: true }),
    'follow-resume': hymn(100, playing),
    pause: hymn(),
    'sound-put-back': hymn(),
  },
  'hymn-list': {
    'hymn-list': home(),
    'past-recent': home(),
    scroll: home({ recent: [31, 100] }),
    'open-row': hymn(31),
    'back-keeps-place': home({ recent: [31, 100] }),
    'list-top': home(),
    'down-1': home(),
    'down-2': home(),
    'down-3': home(),
    'list-tabs-hide': home(),
    'list-tabs-reveal': home(),
    'list-tabs-tap': home({ tab: 'Lists' }),
    'list-tabs-back': home(),
    'list-tabs-gone': home(),
  },
  'hymn-reader': {
    'hymn-reader': hymn(),
    'scroll-end': hymn(),
    'scroll-back': hymn(),
    reading: player(),
    'reading-controls': player(),
    'reading-half': player(),
    'reading-close': hymn(),
    list: home(),
    'past-recent': home(),
    'to-row': home({ recent: [33, 100] }),
    'from-list': hymn(33),
    'swipe-next': hymn(34),
    'swipe-back': hymn(33),
    'reader-back': home({ recent: [33, 100] }),
    'from-list-again': hymn(33),
    'left-edge': home({ recent: [33, 100] }),
    'reader-syllables': hymn(),
  },
  player: {
    'player-idle': home(),
    'stanzas-hymn': hymn(78),
    'stanzas-sheet': player(78),
    'stanzas-scroll': player(78),
    'player-stanzas': player(78, { stanzas: [2] }),
    'stanzas-all': player(78),
    'player-start': player(78),
    'stanzas-half': player(78),
    'stanzas-close': hymn(78),
    'player-bar': hymn(),
    'player-full': player(),
    'player-tempo': hymn(),
    'sound-off': hymn(),
    'player-spring': hymn(100, playing),
    'player-seek-bar': hymn(100, playing),
    'player-seek-tap': hymn(100, playing),
    'player-sheet-reader': player(100, playing),
    'player-reading': player(100, playing),
    'sheet-half-again': player(100, playing),
    'sheet-close-again': hymn(100, playing),
    pause: hymn(),
    'sound-put-back': hymn(),
    'player-stack': hymn(3),
    'stack-back': hymn(),
  },
  search: {
    home: home(),
    search: home({ search: '' }),
    'search-number': home({ search: 'no 100' }),
    'search-number-forms': home({ search: '#100' }),
    'search-number-hymn': home({ search: 'Hymn #100' }),
    'search-about': home({ search: 'hymns about the second coming' }),
    'search-scripture': home({ search: 'Psalm 23' }),
    'search-number-again': home({ search: 'no 100' }),
    'search-open': hymn(),
    'query-kept': home({ search: 'no 100' }),
    'search-empty': home({ search: 'zzzz' }),
    'search-cancel': home(),
    'search-past-recent': home(),
    'search-to-row': home({ recent: [36, 100] }),
    'search-in-hymn': hymn(36),
    'search-in-hymn-box': hymn(36, { search: '' }),
    'search-in-hymn-fill': hymn(36, { search: '100' }),
    'search-in-hymn-cancel': hymn(36),
    'search-in-hymn-box-again': hymn(36, { search: '' }),
    'search-in-hymn-fill-again': hymn(36, { search: '100' }),
    'search-in-hymn-open': hymn(),
    'search-in-hymn-same-box': hymn(100, { search: '' }),
    'search-in-hymn-same-fill': hymn(100, { search: '100' }),
    'search-in-hymn-same': hymn(),
    'search-in-hymn-back': home({ recent: [36, 100] }),
    'search-in-hymn-folded': hymn(36),
    'search-in-hymn-number': hymn(36, { drums: true }),
    'search-in-hymn-number-same': hymn(36),
    'search-in-hymn-number-back': home({ recent: [36, 100] }),
  },
  settings: {
    home: home(),
    settings: settings(),
    dark: settings(),
    leave: home(),
    'second-view': settings(),
    system: settings(),
    'settings-chords-switch-off': settings(),
    'settings-chords-switch': settings(chords),
    about: settings(chords),
    'settings-chords': settings({ chords: true, advanced: true }),
    'settings-feel': settings({ chords: true, advanced: true }),
    relaunch: home(),
    kept: settings({ chords: true, advanced: true }),
    'style-put-back': settings(chords),
    'kept-feel': settings(chords),
    'feel-put-back': settings(chords),
    'chords-switch-again': settings(chords),
    'settings-chords-off': settings(),
    half: settings(),
    close: home(),
  },
} satisfies Readonly<Record<string, Readonly<Record<string, Scene>>>>;

/**
 * Where a target that the journeys only `hides` is drawn, when no step's
 * scene draws it: the scene that does.
 */
const DRAWN_ELSEWHERE: ReadonlyMap<string, Scene> = new Map([
  ['id=tempo-reset', player(100, { tempo: 120 })],
]);

const Expect = Schema.Union([
  Schema.Struct({ shows: Schema.String }),
  Schema.Struct({ hides: Schema.String }),
]);
const Step = Schema.Struct({
  name: Schema.String,
  action: Schema.String,
  target: Schema.optional(Schema.String),
  from: Schema.optional(Schema.String),
  at: Schema.optional(Schema.String),
  expect: Schema.optional(Schema.Array(Expect)),
});
const Journey = Schema.Struct({ feature: Schema.String, steps: Schema.Array(Step) });
type Journey = typeof Journey.Type;
type Step = typeof Step.Type;
const decodeJourney = Schema.decodeUnknownEffect(Schema.fromJsonString(Journey));

/** Every shipped journey, by its file's order. */
const readJourneys = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const files = (yield* fs.readDirectory(FEATURES)).filter((name) => name.endsWith(SUFFIX)).sort();
  return yield* Effect.forEach(files, (name) =>
    Effect.flatMap(fs.readFileString(`${FEATURES}/${name}`), decodeJourney),
  );
});

/** A selector as `sim` reads it: `id=`, `label=` or a bare label, its role left off. */
const parse = (text: string) => {
  const rest = /^role=\w+ (.*)$/s.exec(text)?.[1] ?? text;
  const unquote = (value: string) => value.replace(/^"(.*)"$/s, '$1');
  if (rest.startsWith('id=')) return { by: 'id' as const, value: unquote(rest.slice(3)) };
  if (rest.startsWith('label=')) return { by: 'label' as const, value: unquote(rest.slice(6)) };
  return { by: 'label' as const, value: rest };
};

/** A pan start that is a point, `x,y`, as `sim` reads one (`panStart` in `@manna/sim/journey`): no target. */
const POINTLIKE = /^[\d.,-]+$/;

/** The selectors a step acts on: its target, or its pan's start when it is not a point. */
const actedOn = (step: Step): ReadonlyArray<string> => [
  ...Option.toArray(Option.fromNullishOr(step.target)).filter((target) => target !== 'screen'),
  ...[step.from, step.at].flatMap((start) =>
    Option.toArray(
      Option.fromNullishOr(start).pipe(Option.filter((text) => !POINTLIKE.test(text))),
    ),
  ),
];

/** One check: a selector, the scene it must be drawn in, and the step that asks it. */
interface Check {
  readonly where: string;
  readonly selector: string;
  readonly scene: Scene;
}

/** A scene as one key, its fields in order, so two equal scenes are drawn once. */
const keyOf = (scene: Scene) =>
  toJson(Object.fromEntries(Object.entries(scene).toSorted(([a], [b]) => a.localeCompare(b))));

/** Whether iOS or the journeys' own record answers for `selector` with no scene drawn. */
const exempt = (selector: string) => {
  const { by, value } = parse(selector);
  if (by === 'id') return GONE_IDS.has(value);
  return RUNTIME_LABELS.has(value);
};

/**
 * One step's checks, met in `before` (the scene it acts on) and `now` (the
 * scene it leaves): what it acts on in `before`, a scroll's in `now`; its
 * `shows` in `now`; its `hides` with no scene.
 */
const stepChecks = (step: Step, where: string, before: Scene, now: Scene) => {
  const actedIn = Match.value(step.action).pipe(
    Match.when('scroll', () => now),
    Match.orElse(() => before),
  );
  const expects = Option.getOrElse(Option.fromNullishOr(step.expect), () => []);
  return {
    steps: [
      ...actedOn(step).map((selector): Check => ({ where, selector, scene: actedIn })),
      ...expects.flatMap((one): ReadonlyArray<Check> => {
        if ('shows' in one) return [{ where, selector: one.shows, scene: now }];
        return [];
      }),
    ],
    hidden: expects.flatMap((one): ReadonlyArray<Omit<Check, 'scene'>> => {
      if ('hides' in one) return [{ where, selector: one.hides }];
      return [];
    }),
  };
};

/**
 * The checks of `journeys` by `scenes`: each step's `shows` in its scene,
 * what it acts on in the scene before (a scroll's own), and each `hides`
 * in the scenes of all, or `DRAWN_ELSEWHERE`'s. Also the steps no scene is
 * given and the scenes no step has.
 */
const checksOf = (
  journeys: ReadonlyArray<Journey>,
  scenes: Readonly<Record<string, Readonly<Record<string, Scene>>>>,
) => {
  const steps: Array<Check> = [];
  const hidden: Array<Omit<Check, 'scene'>> = [];
  const unscened: Array<string> = [];
  for (const journey of journeys) {
    const own = Option.getOrElse(
      Option.fromNullishOr(scenes[journey.feature]),
      (): Readonly<Record<string, Scene>> => ({}),
    );
    let before = Option.none<Scene>();
    for (const step of journey.steps) {
      const where = `${journey.feature}/${step.name}`;
      const scene = Option.fromNullishOr(own[step.name]);
      if (Option.isNone(scene)) unscened.push(where);
      for (const now of Option.toArray(scene)) {
        const met = stepChecks(
          step,
          where,
          Option.getOrElse(before, () => now),
          now,
        );
        steps.push(...met.steps);
        hidden.push(...met.hidden);
      }
      before = scene;
    }
  }
  const named = new Set(
    journeys.flatMap((j) => j.steps.map((step) => `${j.feature}/${step.name}`)),
  );
  const stale = Object.entries(scenes).flatMap(([feature, steps]) =>
    Object.keys(steps)
      .map((name) => `${feature}/${name}`)
      .filter((where) => !named.has(where)),
  );
  return {
    steps: steps.filter((check) => !exempt(check.selector)),
    hidden: hidden.filter((check) => !exempt(check.selector)),
    unscened,
    stale,
  };
};

/** What a scene drew of the names it was asked. */
const Drawn = Schema.Struct({
  ids: Schema.Array(Schema.String),
  labels: Schema.Array(Schema.String),
});
type Drawn = typeof Drawn.Type;
const decodeDrawn = Schema.decodeSync(Schema.fromJsonString(Schema.Array(Drawn)));
const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** What a scene that was not drawn holds: nothing. */
const none: Drawn = { ids: [], labels: [] };

/** The start of the script's report line. */
const MARK = 'scenes ';

/** How many scripts draw the scenes at once, each its share. */
const SHARDS = 3;

/** The longest a script may take, ms: then it is ended and its scenes draw nothing. */
const LIMIT = 120_000;

/** The scenes `phone-scenes.tsx` draws in one process, each asked `ids` and `labels`: what each drew of them. */
const drawShard = async (
  scenes: ReadonlyArray<Scene>,
  ids: ReadonlyArray<string>,
  labels: ReadonlyArray<string>,
): Promise<ReadonlyArray<Drawn>> => {
  const asked = toJson(scenes.map((scene) => ({ scene, ids, labels })));
  const run = Bun.spawn(['bun', Bun.resolveSync('./phone-scenes.tsx', import.meta.dir), asked], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: LIMIT,
    killSignal: 'SIGKILL',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited,
  ]);
  if (run.exitCode !== 0)
    process.stderr.write(`phone-scenes.tsx exited ${run.exitCode}\n${stderr}`);
  const line = Option.fromNullishOr(stdout.split('\n').find((one) => one.startsWith(MARK)));
  return Option.match(line, {
    onNone: () => [],
    onSome: (found) => decodeDrawn(found.slice(MARK.length)),
  });
};

/** Draws each scene once, `SHARDS` processes at once, asking it every name a check asks of any scene. */
const drawAll = async (scenes: ReadonlyArray<Scene>, selectors: ReadonlyArray<string>) => {
  const parsed = selectors.map(parse);
  const ids = [...new Set(parsed.filter((one) => one.by === 'id').map((one) => one.value))];
  const labels = [...new Set(parsed.filter((one) => one.by === 'label').map((one) => one.value))];
  const shards = Array.from({ length: SHARDS }, (_, k) =>
    scenes.filter((__, at) => at % SHARDS === k),
  );
  const drawn = await Promise.all(shards.map((shard) => drawShard(shard, ids, labels)));
  return new Map(
    shards.flatMap((shard, k) =>
      shard.map((scene, at): [string, Drawn] => [
        keyOf(scene),
        Option.getOrElse(
          Option.flatMap(Arr.get(drawn, k), (one) => Arr.get(one, at)),
          () => none,
        ),
      ]),
    ),
  );
};

/** Whether `drawn` holds `selector`'s name, a label in any case. */
const holds = (drawn: Drawn, selector: string) => {
  const { by, value } = parse(selector);
  if (by === 'id') return drawn.ids.includes(value);
  return drawn.labels.some((label) => label.toLowerCase() === value.toLowerCase());
};

/** The checks a drawing fails, as `<feature>/<step> <selector>`, a hidden one `(hidden)`. */
const failed = (
  checks: ReturnType<typeof checksOf>,
  drawn: ReadonlyMap<string, Drawn>,
): ReadonlyArray<string> => {
  const everywhere = [...drawn.values()];
  const inScene = checks.steps
    .filter(
      (check) =>
        !holds(
          Option.getOrElse(Option.fromNullishOr(drawn.get(keyOf(check.scene))), () => none),
          check.selector,
        ),
    )
    .map((check) => `${check.where} ${check.selector}`);
  const hidden = checks.hidden
    .filter((check) => !everywhere.some((one) => holds(one, check.selector)))
    .map((check) => `${check.where} ${check.selector} (hidden)`);
  return [...inScene, ...hidden];
};

/** The checks of the shipped journeys by `SCENES`. */
const shipped = Effect.map(readJourneys, (journeys) => checksOf(journeys, SCENES));

/** The case that draws the scenes: a child's time is the machine's (`effect/requireSpawnBudget`, at least 20 s). */
const SPAWNS_MS = 30_000;

describe('verify-hymnal journeys against what the phones draw', () => {
  test('every step of every journey has a scene, and every scene a step', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const checks = yield* shipped;
        expect({ unscened: checks.unscened, stale: checks.stale }).toEqual({
          unscened: [],
          stale: [],
        });
      }).pipe(Effect.provide(BunServices.layer)),
    ));

  test(
    'each target is drawn where the step meets it',
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const checks = yield* shipped;
          const scenes = new Map<string, Scene>();
          for (const check of checks.steps) scenes.set(keyOf(check.scene), check.scene);
          for (const scene of DRAWN_ELSEWHERE.values()) scenes.set(keyOf(scene), scene);
          const selectors = [...checks.steps, ...checks.hidden].map((check) => check.selector);
          const drawn = yield* Effect.promise(() => drawAll([...scenes.values()], selectors));
          expect(failed(checks, drawn)).toEqual([]);
        }).pipe(Effect.provide(BunServices.layer)),
      ),
    SPAWNS_MS,
  );
});
