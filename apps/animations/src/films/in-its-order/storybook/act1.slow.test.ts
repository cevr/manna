import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Layer, Option, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';
import { filmFolder, shotsOf as libraryShotsOf } from '../../../library/storybook/films.ts';
import { timesOf } from '../../../library/storybook/shot.ts';
import { film, fps } from '../film.ts';
import { inItsOrder } from './index.ts';
import { PARITY, grained, grainOf, parity } from './parity.ts';
import { stateFrames } from './testing.ts';

/** The app's root: every command runs from it and every file the shots name is relative to it. */
const APP = `${import.meta.dir}/../../../..`;

/** The storybook command (`bun run storybook`) and the film command (`bun cli.ts`). */
const STORYBOOK = `${APP}/src/library/storybook/cli.ts`;
const FILM_CLI = `${APP}/cli.ts`;

/** The film this check judges, and its recorded word timings: the clock every boundary is read from. */
const FILM = 'in-its-order';
const TIMINGS = `${import.meta.dir}/../narration/timings.json`;

/** The sentence every brief and image prompt of the film carries (CRAFT rule 1; `script.ts`). */
const CARDS_RULE =
  "The narration's words appear only as full-screen cards: nothing in the picture carries lettering.";

/** The verdict's checks, in the bars table's order (`storybook/verify/bars.ts`). */
const BAR_IDS = [
  'palette',
  'pockets',
  'colour-step',
  'proportions',
  'scale',
  'one-sheet',
  'light',
  'render-height',
  'determinism',
];

/** Each scene of act 1 as the film lays it out on base: this unit never moves the film's clock. */
const LAYOUT = [
  { id: 'cold', start: 0, dur: 30.4 },
  { id: 'title', start: 30.4, dur: 3 },
  { id: 'milk', start: 33.4, dur: 28.47 },
  { id: 'stones', start: 61.87, dur: 33.6 },
];

/** How far a figure's drawing may be enlarged on screen (its draw scale times its plane's zoom): orchestrator-proposed, 2026-11-04. */
const UPSCALE = 1.5;

/** The longest a figure may show one drawing with the same eyes: the longest wait between blinks (4.4 s) and one blink (0.125 s), rounded up. */
const ALIVE = 4.6;

/** The members each shot must cast (it may cast more), and the fewest figures it draws (the kept panels' density). */
const CASTS: ReadonlyArray<readonly [string, ReadonlyArray<string>, number]> = [
  ['cold-baby', ['feast-mother', 'filler-dressed'], 5],
  [
    'cold-table',
    ['lead-feast', 'feast-guest-man', 'feast-guest-woman', 'feast-mother', 'filler-dressed'],
    8,
  ],
  ['cold-smile', ['lead-feast', 'feast-guest-man', 'feast-guest-woman'], 3],
  [
    'cold-letter',
    ['lead-feast', 'feast-guest-man', 'feast-guest-woman', 'feast-mother', 'filler-dressed'],
    8,
  ],
  [
    'cold-ouch',
    ['lead-feast', 'feast-guest-man', 'feast-guest-woman', 'feast-mother', 'filler-dressed'],
    7,
  ],
  ['cold-what', [], 0],
  [
    'title',
    ['lead-feast', 'feast-mother', 'feast-guest-man', 'feast-guest-woman', 'filler-dressed'],
    8,
  ],
  ['milk-cup', ['idea-villagers'], 1],
  ['milk-pour', ['idea-villagers'], 1],
  ['milk-row', ['idea-villagers', 'villager-toddler', 'villager-child', 'lead-feast'], 5],
];

const Word = Schema.Struct({
  text: Schema.String,
  start: Schema.Finite,
  voiced: Schema.Struct({ start: Schema.Finite, end: Schema.Finite }),
});

/** A rectangle of the frame in film px: where the film draws over a shot (the title's name), which the verify does not render. */
const Box = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
});

type Overlay = typeof Box.Type;

const TimingsJson = Schema.fromJsonString(
  Schema.Struct({
    scenes: Schema.Record(Schema.String, Schema.Struct({ words: Schema.Array(Word) })),
  }),
);

const ShotsJson = Schema.fromJsonString(
  Schema.Struct({
    film: Schema.String,
    fps: Schema.Finite,
    width: Schema.Finite,
    height: Schema.Finite,
    scenes: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        start: Schema.Finite,
        dur: Schema.Finite,
        speechStart: Schema.Finite,
      }),
    ),
    shots: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        scene: Schema.String,
        from: Schema.Finite,
        to: Schema.Finite,
        figures: Schema.Array(
          Schema.Struct({ name: Schema.String, member: Schema.String, sheet: Schema.String }),
        ),
        overlays: Schema.Array(Box),
      }),
    ),
    cards: Schema.Array(
      Schema.Struct({
        scene: Schema.String,
        cue: Schema.String,
        from: Schema.Finite,
        to: Schema.Finite,
        payoff: Schema.String,
        words: Schema.Array(Schema.Struct({ text: Schema.String, at: Schema.Finite })),
      }),
    ),
    sheets: Schema.Array(
      Schema.Struct({
        member: Schema.String,
        id: Schema.String,
        dir: Schema.String,
        keys: Schema.Array(Schema.String),
        kept: Schema.Boolean,
      }),
    ),
  }),
);

type Shots = typeof ShotsJson.Type;

const RecordJson = Schema.fromJsonString(
  Schema.Struct({ member: Schema.String, id: Schema.String, prompt: Schema.String }),
);

const PlanJson = Schema.fromJsonString(
  Schema.Struct({
    fps: Schema.Finite,
    frames: Schema.Array(
      Schema.Struct({
        t: Schema.Finite,
        figures: Schema.Array(
          Schema.Struct({
            name: Schema.String,
            cell: Schema.String,
            eyes: Schema.String,
            scale: Schema.Finite,
            zoom: Schema.Finite,
          }),
        ),
      }),
    ),
  }),
);

type Plan = typeof PlanJson.Type;

const VerdictJson = Schema.fromJsonString(
  Schema.Struct({
    passed: Schema.Finite,
    total: Schema.Finite,
    checks: Schema.Array(Schema.Struct({ id: Schema.String, pass: Schema.Boolean })),
  }),
);

/** `bun <script> …args` from the app's root: its exit code. */
const run = Effect.fn('Act1.run')(function* (script: string, args: ReadonlyArray<string>) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return Number(
    yield* spawner.exitCode(
      ChildProcess.make('bun', [script, ...args], { cwd: APP, forceKillAfter: '5 seconds' }),
    ),
  );
});

/** The film's storybook shots, cards and sheets as `storybook shots` writes them. */
const shotsOf = Effect.fn('Act1.shots')(function* (tmp: string) {
  const fs = yield* FileSystem.FileSystem;
  const file = `${tmp}/shots.json`;
  expect(yield* run(STORYBOOK, ['shots', FILM, '--out', file])).toBe(0);
  return yield* Schema.decodeEffect(ShotsJson)(yield* fs.readFileString(file));
});

const timingsOf = Effect.fn('Act1.timings')(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* Schema.decodeEffect(TimingsJson)(yield* fs.readFileString(TIMINGS));
});

type Timings = typeof TimingsJson.Type;

/** A word's place in its scene's take, which edge of it a boundary sits on, and the word it must be. */
type Edge = 'start' | 'voicedStart' | 'voicedEnd';

/** The film seconds a scene starts and ends at, and a word's edge in film seconds, read from the layout and the take. */
const clockOf = (shots: Shots, timings: Timings) => {
  const scene = (id: string) => Option.fromUndefinedOr(shots.scenes.find((s) => s.id === id));
  const start = (id: string) =>
    Option.match(scene(id), { onNone: () => -1, onSome: (s) => s.start });
  const end = (id: string) =>
    Option.match(scene(id), { onNone: () => -1, onSome: (s) => s.start + s.dur });
  const word = (id: string, i: number, text: string, edge: Edge) => {
    const w = Option.fromUndefinedOr(timings.scenes[id]?.words[i]);
    expect(Option.map(w, (x) => x.text)).toEqual(Option.some(text));
    const at = Option.match(w, {
      onNone: () => -1,
      onSome: (x) =>
        ({ start: x.start, voicedStart: x.voiced.start, voicedEnd: x.voiced.end })[edge],
    });
    return Option.match(scene(id), {
      onNone: () => -1,
      onSome: (s) => s.start + s.speechStart + at,
    });
  };
  return { start, end, word };
};

type Clock = ReturnType<typeof clockOf>;

/** One span of act 1's picture: a shot or a card, and the window each of its edges must fall in. */
interface Span {
  readonly label: string;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}

/** Every span of act 1 in film order, each edge at the mark, word or card edge the narration puts it on. */
const spansOf = (c: Clock, frame: number): ReadonlyArray<Span> => {
  const at = (t: number): readonly [number, number] => [t - frame, t + frame];
  const grown = c.word('cold', 7, 'But', 'start');
  const smile = c.word('cold', 21, 'We', 'start');
  const letter = c.word('cold', 24, 'And', 'start');
  const ouch = c.word('cold', 53, 'Grown', 'start');
  const what = c.word('cold', 58, 'So', 'start');
  const desire = c.word('milk', 9, 'desire', 'start');
  const need = c.word('milk', 42, 'A', 'start');
  return [
    { label: 'shot cold-baby', from: at(c.start('cold')), to: at(grown) },
    { label: 'shot cold-table', from: at(grown), to: at(smile) },
    { label: 'shot cold-smile', from: at(smile), to: at(letter) },
    { label: 'shot cold-letter', from: at(letter), to: at(ouch) },
    { label: 'shot cold-ouch', from: at(ouch), to: at(what) },
    { label: 'shot cold-what', from: at(what), to: at(c.end('cold')) },
    { label: 'shot title', from: at(c.start('title')), to: at(c.end('title')) },
    { label: 'shot milk-cup', from: at(c.start('milk')), to: at(desire) },
    { label: 'shot milk-pour', from: at(desire), to: at(need) },
    { label: 'shot milk-row', from: at(need), to: at(c.end('milk')) },
  ];
};

const within = (t: number, w: readonly [number, number]) => t >= w[0] && t <= w[1];

/** What act 1 plays in film order: each shot and card with its span. */
const timelineOf = (shots: Shots) =>
  [
    ...shots.shots.map((s) => ({ label: `shot ${s.id}`, from: s.from, to: s.to })),
    ...shots.cards.map((c) => ({ label: `card ${c.scene}`, from: c.from, to: c.to })),
  ].toSorted((a, b) => a.from - b.from);

/** Every span whose label, order or edges differ from the narration's, named. */
const spanMisses = (shots: Shots, clock: Clock) => {
  const frame = 1 / shots.fps;
  const want = spansOf(clock, frame);
  const got = timelineOf(shots);
  const misses = [];
  if (got.map((s) => s.label).join() !== want.map((s) => s.label).join())
    misses.push(`spans ${got.map((s) => s.label).join(', ')}`);
  for (const [i, w] of want.entries()) {
    const g = Option.fromUndefinedOr(got[i]);
    if (Option.isNone(g)) continue;
    if (!within(g.value.from, w.from)) misses.push(`${w.label} from ${g.value.from}`);
    if (!within(g.value.to, w.to)) misses.push(`${w.label} to ${g.value.to}`);
    const next = Option.fromUndefinedOr(got[i + 1]);
    if (Option.isSome(next) && Math.abs(next.value.from - g.value.to) > frame)
      misses.push(`gap ${g.value.to} to ${next.value.from} after ${w.label}`);
  }
  return misses;
};

describe('In Its Order act 1 in style B: the clock', () => {
  it.effect(
    'lays act 1 out as base did, its shots alone tiling it on the narration’s marks and words, no card among them (the owner, ask a11de5e2b65: the quotes off black cards)',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const shots = yield* shotsOf(tmp);
        const timings = yield* timingsOf();
        expect(shots.film).toBe(FILM);
        expect([shots.width, shots.height]).toEqual([1920, 1080]);
        for (const want of LAYOUT) {
          const got = shots.scenes.find((s) => s.id === want.id);
          expect(Math.abs((got?.start ?? -9) - want.start)).toBeLessThanOrEqual(0.02);
          expect(Math.abs((got?.dur ?? -9) - want.dur)).toBeLessThanOrEqual(0.02);
        }
        expect(spanMisses(shots, clockOf(shots, timings))).toEqual([]);
        expect(shots.cards.filter((c) => LAYOUT.slice(0, 3).some((s) => s.id === c.scene))).toEqual(
          [],
        );
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    120_000,
  );
});

/** Every member a shot must cast that it does not, or a shot drawing fewer figures than its panels hold. */
const castMisses = (shots: Shots) =>
  CASTS.flatMap(([id, members, fewest]) => {
    const shot = shots.shots.find((s) => s.id === id);
    if (!shot) return [`no shot ${id}`];
    const cast = new Set(shot.figures.map((f) => f.member));
    return [
      ...members.filter((m) => !cast.has(m)).map((m) => `${id} casts no ${m}`),
      ...Option.toArray(
        Option.some(`${id} draws ${shot.figures.length} figures, fewer than ${fewest}`).pipe(
          Option.filter(() => shot.figures.length < fewest),
        ),
      ),
    ];
  });

/**
 * Sheets the owner kept before the cards rule (`CARDS_RULE`), each with why:
 * their records stay as they were drawn, so their prompts are held to the hand
 * rules alone (orchestrator ruling on fix 7, 2026-11-04).
 */
const BEFORE_CARDS: ReadonlyMap<string, string> = new Map([
  ['feast-guest-woman/feast-courtyard', 'drawn and kept in take 5, before CARDS_RULE'],
]);

/** Sheets act 1 lists that no shot draws, each with why: a kept sheet another sheet is drawn from and the film's checks read as its member's first. */
const REFERENCE_ONLY: ReadonlyMap<string, string> = new Map([
  [
    'feast-guest-woman/feast-courtyard',
    'her table sheet’s first reference, and her first sheet in the cross-sheet checks; the title casts her table sheet (critique 3, finding 7)',
  ],
]);

/** Each house rule a sheet's record prompt lacks, named: the hand rules for every sheet, the cards rule for each not kept before it. */
const promptMisses = (sheet: string, prompt: string) =>
  ['no fingers', 'wrist', ...[CARDS_RULE].filter(() => !BEFORE_CARDS.has(sheet))]
    .filter((rule) => !prompt.includes(rule))
    .map((rule) => `${sheet} prompt lacks ${rule}`);

/** Every sheet a figure names that is not listed, every listed sheet no figure uses, and every record whose prompt lacks a house rule. */
const sheetMisses = Effect.fn('Act1.sheetMisses')(function* (shots: Shots) {
  const fs = yield* FileSystem.FileSystem;
  const misses: Array<string> = [];
  const named = new Set(shots.shots.flatMap((s) => s.figures.map((f) => `${f.member}/${f.sheet}`)));
  const listed = new Set(shots.sheets.map((s) => `${s.member}/${s.id}`));
  misses.push(...[...named].filter((n) => !listed.has(n)).map((n) => `${n} is not listed`));
  misses.push(
    ...[...listed]
      .filter((n) => !named.has(n) && !REFERENCE_ONLY.has(n))
      .map((n) => `${n} is used by no shot`),
  );
  misses.push(
    ...[...REFERENCE_ONLY.keys()]
      .filter((n) => named.has(n) || !listed.has(n))
      .map((n) => `${n} is listed as a reference only, but a shot draws it or act 1 lists it not`),
  );
  for (const sheet of shots.sheets) {
    const file = `${APP}/${sheet.dir}/record.json`;
    if (!(yield* fs.exists(file))) {
      misses.push(`${sheet.member}/${sheet.id} has no record`);
      continue;
    }
    const record = yield* Schema.decodeEffect(RecordJson)(yield* fs.readFileString(file));
    misses.push(...promptMisses(`${sheet.member}/${sheet.id}`, record.prompt));
  }
  return misses;
});

/** The film frames a span of film seconds draws: each k with from ≤ k / fps < to. */
const filmFrames = (from: number, to: number, fps: number) => {
  const first = Math.ceil(from * fps - 1e-6);
  const last = Math.ceil(to * fps - 1e-6);
  return { first, count: last - first };
};

/** Every frame a figure draws a cell not of its sheet, is enlarged past the cap, or holds one drawing past the alive bound, named. */
const planMisses = (shots: Shots, id: string, plan: Plan) => {
  const shot = shots.shots.find((s) => s.id === id);
  if (!shot) return [`no shot ${id}`];
  const misses = [];
  const frames = filmFrames(shot.from, shot.to, shots.fps);
  if (plan.frames.length !== frames.count)
    misses.push(`${id} plans ${plan.frames.length} frames, the film draws ${frames.count}`);
  const keys = new Map(
    shot.figures.map((f) => [
      f.name,
      new Set(shots.sheets.find((s) => s.member === f.member && s.id === f.sheet)?.keys ?? []),
    ]),
  );
  const runs = new Map<string, { readonly drawn: string; readonly since: number }>();
  for (const frame of plan.frames)
    for (const f of frame.figures) {
      const sheet = keys.get(f.name) ?? new Set<string>();
      if (!sheet.has(f.cell) || !sheet.has(f.eyes))
        misses.push(`${id} ${f.name} draws ${f.cell}~${f.eyes} at ${frame.t}`);
      if (f.scale * f.zoom > UPSCALE)
        misses.push(`${id} ${f.name} enlarged ${(f.scale * f.zoom).toFixed(3)} at ${frame.t}`);
      const drawn = `${f.cell}~${f.eyes}`;
      const run = runs.get(f.name);
      if (!run || run.drawn !== drawn) runs.set(f.name, { drawn, since: frame.t });
      else if (frame.t - run.since > ALIVE)
        misses.push(`${id} ${f.name} holds ${drawn} from ${run.since} past ${frame.t}`);
    }
  return [...new Set(misses.map((m) => m.replace(/ at [0-9.]+$/, '')))].slice(0, 20);
};

describe('In Its Order act 1 in style B: the cast and the plans', () => {
  it.effect(
    'holds a sheet kept before the cards rule to the hand rules alone, and every other sheet to the cards rule too',
    () =>
      Effect.sync(() => {
        const hands = 'round hands, no fingers, each at the wrist of its sleeve.';
        expect(promptMisses('feast-guest-woman/feast-courtyard', hands)).toEqual([]);
        expect(promptMisses('feast-guest-man/iio-table', hands)).toEqual([
          `feast-guest-man/iio-table prompt lacks ${CARDS_RULE}`,
        ]);
        expect(promptMisses('feast-guest-man/iio-table', `${hands} ${CARDS_RULE}`)).toEqual([]);
        expect(promptMisses('feast-guest-woman/feast-courtyard', 'round hands.')).toEqual([
          'feast-guest-woman/feast-courtyard prompt lacks no fingers',
          'feast-guest-woman/feast-courtyard prompt lacks wrist',
        ]);
      }),
  );

  it.effect(
    'casts each shot as its panels do, every sheet recorded with the house rules, every plan frame of the film drawn from its own sheet, alive and never enlarged past the cap',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const shots = yield* shotsOf(tmp);
        expect(shots.shots.map((s) => s.id)).toEqual(CASTS.map(([id]) => id));
        expect(castMisses(shots)).toEqual([]);
        expect(yield* sheetMisses(shots)).toEqual([]);
        for (const shot of shots.shots) {
          const file = `${tmp}/plan-${shot.id}.json`;
          expect(yield* run(STORYBOOK, ['plan', `${FILM}/${shot.id}`, '--out', file])).toBe(0);
          const plan = yield* Schema.decodeEffect(PlanJson)(yield* fs.readFileString(file));
          expect(plan.fps).toBe(shots.fps);
          expect(planMisses(shots, shot.id, plan)).toEqual([]);
        }
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    300_000,
  );
});

/** A PNG's RGB pixels and size. */
const pixelsOf = Effect.fn('Act1.pixels')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs.readFile(file);
  return yield* Effect.promise(() =>
    sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  );
});

/** The grain the film lays over every frame, read from its own look (its timings play no part in it). */
const FILM_GRAIN = grainOf(film({ timings: { voice: '', scenes: {} }, audio: '', fps }).look);

/**
 * The share of a film still's pixels outside `overlays` within ΔE76 2 of the
 * verify's frame with the film's grain laid over it as at film second `t`
 * (the bars read the frame ungrained: grain is the film's finish, not the
 * drawing); 0 when their sizes differ.
 */
const parityOf = Effect.fn('Act1.parity')(function* (
  still: string,
  frame: string,
  overlays: ReadonlyArray<Overlay>,
  t: number,
) {
  const p = yield* pixelsOf(still);
  const q = yield* pixelsOf(frame);
  if (p.info.width !== q.info.width || p.info.height !== q.info.height) return 0;
  const { width, height } = p.info;
  const frameBox = { x: 0, y: 0, width, height };
  return parity(p.data, grained(q.data, frameBox, FILM_GRAIN, t), width, height, overlays);
});

/** The share of the frame a shot's drawings over it may cover, so the parity reads the rest: a tenth (the title's name), but the two quotes lettered in act 1 (the owner: the quotes off black cards; journal.md), a third each: the dusk band over cold-letter's sky and the parchment over milk-pour's book. */
const OVER_SHARES: ReadonlyMap<string, number> = new Map([
  ['cold-letter', 1 / 3],
  ['milk-pour', 1 / 3],
]);

/** A still's file name as the film's render writes it (`stillName` in `@manna/film/tools`). */
const stillName = (t: number): string => `t${t.toFixed(2).padStart(7, '0')}.png`;

describe('In Its Order act 1 in style B: the bars and the film', () => {
  it.effect(
    'verifies every shot PASS 9/9, and the film draws each shot’s middle frame, and each frame that shows a plate at its fullest or a figure key first (`stateFrames`), as the verify rendered it',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const shots = yield* shotsOf(tmp);
        const library = new Map(
          (yield* libraryShotsOf(inItsOrder)).map(({ shot }) => [shot.id, shot] as const),
        );
        const middles: Array<readonly [string, number, string, ReadonlyArray<Overlay>]> = [];
        for (const shot of shots.shots) {
          const out = `${tmp}/verify-${shot.id}`;
          expect(yield* run(STORYBOOK, ['verify', `${FILM}/${shot.id}`, '--out', out])).toBe(0);
          const verdict = yield* Schema.decodeEffect(VerdictJson)(
            yield* fs.readFileString(`${out}/verdict.json`),
          );
          expect(verdict.checks.map((c) => c.id)).toEqual(BAR_IDS);
          expect(verdict.checks.filter((c) => !c.pass).map((c) => `${shot.id} ${c.id}`)).toEqual(
            [],
          );
          expect((yield* fs.readFileString(`${out}/verdict.md`)).split('\n')[0]).toBe(
            `PASS ${BAR_IDS.length}/${BAR_IDS.length} pass`,
          );
          const frames = filmFrames(shot.from, shot.to, shots.fps);
          const i = Math.floor(frames.count / 2);
          const own = Option.fromUndefinedOr(library.get(shot.id));
          expect(Option.map(own, (s) => timesOf(s).length)).toEqual(Option.some(frames.count));
          const states = Option.match(own, { onNone: () => [], onSome: stateFrames });
          for (const k of [i, ...states.filter((k) => k !== i)])
            middles.push([
              shot.id,
              (frames.first + k) / shots.fps,
              `${out}/frames/f${String(k).padStart(4, '0')}.png`,
              shot.overlays,
            ]);
        }
        expect(middles.length).toBeGreaterThan(shots.shots.length);
        const stills = `${APP}/out/${FILM}/film/parity/stills`;
        yield* fs.remove(stills, { recursive: true, force: true });
        const times = middles.map(([, t]) => t.toFixed(4)).join(',');
        expect(
          yield* run(FILM_CLI, [
            'render',
            FILM,
            '--stills',
            times,
            '--variant',
            'parity',
            '--no-captions',
          ]),
        ).toBe(0);
        const off: Array<string> = [];
        expect(shots.shots.filter((s) => s.overlays.length > 0).map((s) => s.id)).toEqual([
          'cold-letter',
          'title',
          'milk-pour',
        ]);
        for (const shot of shots.shots)
          expect(shot.overlays.reduce((sum, o) => sum + o.width * o.height, 0)).toBeLessThanOrEqual(
            (OVER_SHARES.get(shot.id) ?? 0.1) * shots.width * shots.height,
          );
        for (const [id, t, frame, overlays] of middles) {
          const share = yield* parityOf(
            `${stills}/${stillName(Number(t.toFixed(4)))}`,
            frame,
            overlays,
            t,
          );
          if (share < PARITY) off.push(`${id} at ${t.toFixed(3)} s: ${share.toFixed(4)}`);
        }
        expect(off).toEqual([]);
      }).pipe(
        Effect.scoped,
        Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
      ),
    7_200_000,
  );
});
