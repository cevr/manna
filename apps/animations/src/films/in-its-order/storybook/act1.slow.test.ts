import * as BunServices from '@effect/platform-bun/BunServices';
import { labOf } from '@manna/film/core';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';
import sharp from 'sharp';

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

/** How long after its last word's voiced end a card may hold (CRAFT rule 1: a hard cut out on the last word). */
const CARD_TAIL = 0.15;

/** The share of a film still's pixels within ΔE 2 of the storybook verify's frame at the same film frame. */
const PARITY = 0.995;

/** The members each shot must cast (it may cast more), and the fewest figures it draws (the kept panels' density). */
const CASTS: ReadonlyArray<readonly [string, ReadonlyArray<string>, number]> = [
  ['cold-baby', ['feast-mother', 'filler-dressed'], 5],
  [
    'cold-table',
    ['lead-feast', 'feast-guest-man', 'feast-guest-woman', 'feast-mother', 'filler-dressed'],
    8,
  ],
  [
    'cold-letter',
    ['lead-feast', 'feast-guest-man', 'feast-guest-woman', 'feast-mother', 'filler-dressed'],
    8,
  ],
  ['cold-ouch', ['lead-feast'], 1],
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

/** The two cards of act 1: their scene, their words as KJV sets them (punctuation and case aside), and the payoff. */
const CARDS: ReadonlyArray<readonly [string, ReadonlyArray<string>, string]> = [
  [
    'cold',
    ['such', 'as', 'have', 'need', 'of', 'milk', 'and', 'not', 'of', 'strong', 'meat'],
    'meat',
  ],
  [
    'milk',
    [
      'desire',
      'the',
      'sincere',
      'milk',
      'of',
      'the',
      'word',
      'that',
      'ye',
      'may',
      'grow',
      'thereby',
    ],
    'grow',
  ],
];

const Word = Schema.Struct({
  text: Schema.String,
  start: Schema.Finite,
  voiced: Schema.Struct({ start: Schema.Finite, end: Schema.Finite }),
});

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
  const tail = (t: number): readonly [number, number] => [t - frame, t + CARD_TAIL + frame];
  const grown = c.word('cold', 7, 'But', 'start');
  const letter = c.word('cold', 24, 'And', 'start');
  const such = c.word('cold', 42, 'such', 'voicedStart');
  const meat = c.word('cold', 52, 'meat.”', 'voicedEnd');
  const what = c.word('cold', 58, 'So', 'start');
  const desire = c.word('milk', 9, 'desire', 'voicedStart');
  const thereby = c.word('milk', 20, 'thereby.”', 'voicedEnd');
  const need = c.word('milk', 42, 'A', 'start');
  return [
    { label: 'shot cold-baby', from: at(c.start('cold')), to: at(grown) },
    { label: 'shot cold-table', from: at(grown), to: at(letter) },
    { label: 'shot cold-letter', from: at(letter), to: at(such) },
    { label: 'card cold', from: at(such), to: tail(meat) },
    { label: 'shot cold-ouch', from: tail(meat), to: at(what) },
    { label: 'shot cold-what', from: at(what), to: at(c.end('cold')) },
    { label: 'shot title', from: at(c.start('title')), to: at(c.end('title')) },
    { label: 'shot milk-cup', from: at(c.start('milk')), to: at(desire) },
    { label: 'card milk', from: at(desire), to: tail(thereby) },
    { label: 'shot milk-pour', from: tail(thereby), to: at(need) },
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

const said = (text: string) => text.toLowerCase().replace(/[^a-z']/g, '');

/** Every way a card's words, payoff or timing differ from the take and the rule, named. */
const cardMisses = (shots: Shots, timings: Timings) =>
  CARDS.flatMap(([scene, words, payoff]) => {
    const card = shots.cards.find((c) => c.scene === scene);
    if (!card) return [`no card in ${scene}`];
    const misses = [];
    if (card.words.map((w) => said(w.text)).join(' ') !== words.join(' '))
      misses.push(`${scene} card says ${card.words.map((w) => w.text).join(' ')}`);
    if (card.words.length > 12) misses.push(`${scene} card holds ${card.words.length} words`);
    if (said(card.payoff) !== payoff) misses.push(`${scene} card payoff ${card.payoff}`);
    const layout = shots.scenes.find((s) => s.id === scene);
    const take = timings.scenes[scene]?.words ?? [];
    for (const w of card.words) {
      const heard = take.filter(
        (x) =>
          said(x.text) === said(w.text) &&
          Math.abs((layout?.start ?? 0) + (layout?.speechStart ?? 0) + x.voiced.start - w.at) <=
            1 / shots.fps,
      );
      if (heard.length === 0)
        misses.push(`${scene} card word ${w.text} at ${w.at} is not heard then`);
    }
    return misses;
  });

describe('In Its Order act 1 in style B: the clock', () => {
  it.effect(
    'lays act 1 out as base did, its shots and two cards tiling it on the narration’s marks and words, the cards verbatim KJV',
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
        expect(cardMisses(shots, timings)).toEqual([]);
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

/** Every sheet a figure names that is not listed, every listed sheet no figure uses, and every record whose prompt lacks a house rule. */
const sheetMisses = Effect.fn('Act1.sheetMisses')(function* (shots: Shots) {
  const fs = yield* FileSystem.FileSystem;
  const misses: Array<string> = [];
  const named = new Set(shots.shots.flatMap((s) => s.figures.map((f) => `${f.member}/${f.sheet}`)));
  const listed = new Set(shots.sheets.map((s) => `${s.member}/${s.id}`));
  misses.push(...[...named].filter((n) => !listed.has(n)).map((n) => `${n} is not listed`));
  misses.push(...[...listed].filter((n) => !named.has(n)).map((n) => `${n} is used by no shot`));
  for (const sheet of shots.sheets) {
    const file = `${APP}/${sheet.dir}/record.json`;
    if (!(yield* fs.exists(file))) {
      misses.push(`${sheet.member}/${sheet.id} has no record`);
      continue;
    }
    const record = yield* Schema.decodeEffect(RecordJson)(yield* fs.readFileString(file));
    for (const rule of ['no fingers', 'wrist', CARDS_RULE])
      if (!record.prompt.includes(rule))
        misses.push(`${sheet.member}/${sheet.id} prompt lacks ${rule}`);
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

/** The share of two frames' pixels within ΔE76 2 of each other; 0 when their sizes differ. */
const parityOf = Effect.fn('Act1.parity')(function* (a: string, b: string) {
  const p = yield* pixelsOf(a);
  const q = yield* pixelsOf(b);
  if (p.info.width !== q.info.width || p.info.height !== q.info.height) return 0;
  let near = 0;
  const n = p.info.width * p.info.height;
  for (let i = 0; i < n; i++) {
    const x = labOf([p.data[3 * i] ?? 0, p.data[3 * i + 1] ?? 0, p.data[3 * i + 2] ?? 0]);
    const y = labOf([q.data[3 * i] ?? 0, q.data[3 * i + 1] ?? 0, q.data[3 * i + 2] ?? 0]);
    if (Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) <= 2) near++;
  }
  return near / n;
});

/** A still's file name as the film's render writes it (`stillName` in `@manna/film/tools`). */
const stillName = (t: number): string => `t${t.toFixed(2).padStart(7, '0')}.png`;

describe('In Its Order act 1 in style B: the bars and the film', () => {
  it.effect(
    'verifies every shot PASS 9/9, and the film draws each shot’s middle frame as the verify rendered it',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const tmp = yield* fs.makeTempDirectoryScoped();
        const shots = yield* shotsOf(tmp);
        const middles: Array<readonly [string, number, string]> = [];
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
          middles.push([
            shot.id,
            (frames.first + i) / shots.fps,
            `${out}/frames/f${String(i).padStart(4, '0')}.png`,
          ]);
        }
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
        for (const [id, t, frame] of middles) {
          const share = yield* parityOf(`${stills}/${stillName(Number(t.toFixed(4)))}`, frame);
          if (share < PARITY) off.push(`${id} at ${t.toFixed(3)} s: ${share.toFixed(4)}`);
        }
        expect(off).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    7_200_000,
  );
});
