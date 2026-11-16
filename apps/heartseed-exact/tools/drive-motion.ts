/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noTernary, effect/noUnknownParameters, node/no-process-env, no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): a host script that picks its port by host, drives the built app through `bun run exact agent`, awaits each launch in turn, and reads its untyped JSON replies by the fields it checks. */

/**
 * Heartseed's motion, live (spec B), on the host named
 * (`bun tools/drive-motion.ts web|ios`). Each check runs under full motion
 * and again under `prefer prefers-reduced-motion reduce`:
 *
 * 1. the ring behind Done pulses while Say it listens, and is gone after
 *    Done; under reduce it holds at opacity 1;
 * 2. after Next the next verse's column fades and rises in; under reduce
 *    it does not move;
 * 3. a word lit by Hear it is drawn mid-way between the quiet and the ink
 *    90 ms on, light and dark (a pixel of a screenshot); under reduce it is
 *    the ink at once;
 * 4. a scheme chosen in Settings leaves no word mid-way once the sheet
 *    closes;
 * 5. the run's end brings its rows in one after another; under reduce all
 *    show at once;
 * 6. home's ask fades in, and is gone after Keep;
 * 7. a plant pressed scales to 0.97.
 *
 * Opacity is read from `layout` (the animated nodes author `opacity=1` so
 * the driver reports it). iOS reads a native animation at its end value, so
 * there each check reads presence and end values, and films its moment
 * (`screenshot … over 600 every 50` under `--timing platform`) into
 * `.exact/shots/`. Exits 1 on any failed check.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { theme, type Scheme } from '@manna/heartseed/theme';

import { readPng, type Image } from './png';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
if (process.env.HEARTSEED_GARDEN_DRIVE !== '1') {
  const self = Bun.spawn(['bun', import.meta.path, ...process.argv.slice(2)], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, HEARTSEED_GARDEN_DRIVE: '1', SIMCTL_CHILD_HEARTSEED_GARDEN_DRIVE: '1' },
  });
  process.exit(await self.exited);
}
const drive = makeDrive({ name: 'drive-motion', host, appDir: app });
const ios = host === 'ios';
/** Chrome keeps a named store per port, so every web launch here takes one of the app's spare ports. */
const port = ios ? [] : ['--port', '8771'];
const SHOTS = join('.exact', 'shots');
const SAMPLES = join('.exact', 'drive-motion');
mkdirSync(join(app, SHOTS), { recursive: true });
mkdirSync(join(app, SAMPLES), { recursive: true });
const SOWN = Date.parse('2026-11-14T12:00:00Z');
const DAY = 86_400_000;
const LATER = 30 * DAY;
const ZONE = 'America/New_York';
const HEARD = new Map([
  ['thee', 'the'],
  ['thy', 'thigh'],
  ['yea', 'yeah'],
]);
const LIST = ['John-3-16', 'John-3-17', 'John-3-18'];
const REDUCE = 'prefer prefers-reduced-motion reduce';
const GRANTED = [
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
  'clock data',
  'clock settle',
];
const PRESS = 0.97;
const stamp = `${host}-${Date.now().toString(36)}`;

/** A verse's text as a recognizer writes it: lowercase words, archaic ones as heard. */
const spokenOf = (text: string) =>
  text
    .split(/\s+/u)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '')
    .map((word) => HEARD.get(word) ?? word)
    .join(' ');

/** A recital of `text` said through, then Done. */
const recite = (text: string) => [
  `prefer extension speech-recognition.heard=${JSON.stringify(spokenOf(text))}`,
  'tap say',
  'clock settle',
  'clock +15000',
  'clock settle',
  'tap finish',
  'clock settle',
];

/** A film of the next 600 ms, on iOS alone (the web's checks read the frames themselves). */
const film = (name: string) =>
  ios ? [`screenshot ${join(SHOTS, `ios-${name}.png`)} over 600 every 50`] : [];

/** iOS films under its native transitions. */
const timing = ios ? ['--timing', 'platform'] : [];

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
interface Laid {
  readonly viewport?: { readonly w?: number };
  readonly node?: {
    readonly space?: { readonly viewport?: Frame; readonly local?: { readonly w: number } };
    readonly style?: Record<
      string,
      { readonly computed?: string; readonly value?: string | number }
    >;
  };
}

/** A `layout` reply's opacity, as the driver reports an authored one: the web's computed in flight, iOS's its value. */
const opacityOf = (reply: unknown) => {
  const opacity = (reply as Laid | undefined)?.node?.style?.['opacity'];
  return Number(opacity?.computed ?? opacity?.value ?? Number.NaN);
};

/** A `layout` reply's frame in the viewport. */
const frameOf = (reply: unknown) => (reply as Laid | undefined)?.node?.space?.viewport;

/** A `layout` reply's drawn width over its laid-out width: its scale. */
const scaleOf = (reply: unknown) => {
  const space = (reply as Laid | undefined)?.node?.space;
  return (space?.viewport?.w ?? Number.NaN) / (space?.local?.w ?? Number.NaN);
};

/** Whether a whole `tree` reply holds a node of `testId`. */
const holds = (reply: unknown, testId: string) =>
  JSON.stringify(reply ?? null).includes(`"testId":"${testId}"`);

/** Strictly between 0 and 1. */
const midway = (value: number) => value > 0 && value < 1;

/** A drive's ops, each read back by the index `step` answers. */
const script = (...first: readonly string[]) => {
  const ops: string[] = [...first];
  const step = (...each: readonly string[]) => {
    ops.push(...each);
    return ops.length - 1;
  };
  return { ops, step };
};

/** The channels of `rgb(r, g, b)` or `#rrggbb`. */
const channelsOf = (colour: string) => {
  if (colour.startsWith('#'))
    return [1, 3, 5].map((at) => Number.parseInt(colour.slice(at, at + 2), 16));
  return (colour.match(/\d+/gu) ?? []).map(Number);
};

/** The distance of two colours, channel by channel. */
const distance = (one: readonly number[], other: readonly number[]) =>
  Math.hypot(...one.map((channel, at) => channel - (other[at] ?? 0)));

/** The pixel inside `frame` farthest from the ground: a glyph's full ink. */
const inkIn = (image: Image, frame: Frame, scale: number, ground: readonly number[]) => {
  let best: number[] = ground.slice();
  for (let y = Math.ceil(frame.y * scale); y < Math.floor((frame.y + frame.h) * scale); y++)
    for (let x = Math.ceil(frame.x * scale); x < Math.floor((frame.x + frame.w) * scale); x++) {
      const at = (y * image.width + x) * image.channels;
      const pixel = [image.rows[at] ?? 0, image.rows[at + 1] ?? 0, image.rows[at + 2] ?? 0];
      if (distance(pixel, ground) > distance(best, ground)) best = pixel;
    }
  return best;
};

/** Where `pixel` lies from `from` (0) to `to` (1), along the line between them. */
const along = (pixel: readonly number[], from: readonly number[], to: readonly number[]) => {
  const line = to.map((channel, at) => channel - (from[at] ?? 0));
  const length = line.reduce((sum, part) => sum + part * part, 0);
  return (
    pixel.reduce((sum, channel, at) => sum + (channel - (from[at] ?? 0)) * (line[at] ?? 0), 0) /
    length
  );
};

/** The ink a word's frame holds in a screenshot, given the `layout` reply and the shot's path. */
const wordInk = (layout: unknown, shot: string, scheme: Scheme) => {
  const frame = frameOf(layout);
  if (frame === undefined) return undefined;
  const image = readPng(join(app, shot));
  const scale = image.width / ((layout as Laid).viewport?.w ?? image.width);
  return inkIn(image, frame, scale, channelsOf(theme[scheme].ground));
};

const MARGIN = 0.08;

/** B1: the ring behind Done, under full and reduced motion. */
const pulse = async () => {
  for (const reduce of [false, true]) {
    const name = reduce ? 'reduced' : 'full';
    const s = script(
      ...(reduce ? [REDUCE] : []),
      ...GRANTED,
      'tap say',
      'clock data',
      'clock data',
    );
    s.step(...film(`1-pulse-${name}`));
    const early = s.step('clock +300', 'layout ring');
    const late = s.step('clock +600', 'layout ring');
    const after = s.step('tap finish', 'clock settle', 'tree');
    const got = await drive.run(
      [
        ...port,
        ...timing,
        '--storage',
        `motion-1-${stamp}`,
        '--reset-storage',
        '--url',
        '/cue/none',
      ],
      s.ops,
    );
    const [one, two] = [opacityOf(got[early]), opacityOf(got[late])];
    if (reduce)
      drive.check('B1 under reduce the ring holds at opacity 1', one === 1 && two === 1, [
        one,
        two,
      ]);
    else if (ios)
      drive.check(
        'B1 the ring shows while Say it listens',
        frameOf(got[early]) !== undefined,
        got[early],
      );
    else
      drive.check(
        'B1 the ring pulses: its opacity at +300 and +900 differs, each strictly between 0 and 1',
        one !== two && midway(one) && midway(two),
        [one, two],
      );
    drive.check(`B1 (${name}) the ring is gone after Done`, !holds(got[after], 'ring'), name);
  }
};

/** B3: a word lit by Hear it, 90 ms on, light, dark and under reduce. */
const words = async () => {
  for (const [scheme, reduce] of [
    ['light', false],
    ['dark', false],
    ['light', true],
  ] as const) {
    const name = `${scheme}${reduce ? '-reduced' : ''}`;
    const lead = [
      ...(reduce ? [REDUCE] : []),
      `prefer prefers-color-scheme ${scheme}`,
      'clock data',
      'clock settle',
      'tap hear',
      'clock +700',
    ];
    const flags = [
      ...port,
      '--storage',
      `motion-3-${stamp}`,
      '--reset-storage',
      '--url',
      '/cue/full',
    ];
    if (ios) {
      const filmed = script(...lead, ...film(`3-word-${name}`));
      const laid = filmed.step('layout word-0');
      const got = await drive.run([...flags, ...timing], filmed.ops);
      drive.check(
        `B3 (${name}) the lit word is drawn`,
        frameOf(got[laid]) !== undefined,
        got[laid],
      );
    }
    const probe = script(...lead);
    const reads = Array.from({ length: 60 }, () => probe.step('clock +10', 'state today.lit'));
    const probed = await drive.run(flags, probe.ops);
    const counts = reads.map((at) => Number(probed[at]));
    const turn = counts.findIndex((count, at) => at > 0 && count > (counts[at - 1] ?? 0));
    const lit = counts[turn] ?? 0;
    if (turn < 0 || lit < 1) {
      drive.check(`B3 (${name}) a word lights while the voice reads`, false, counts);
      continue;
    }
    const shot = join(SAMPLES, `${host}-3-${name}.png`);
    const s = script(...lead, ...Array.from({ length: turn + 1 }, () => 'clock +10'));
    const wait = reduce ? [] : Array.from({ length: 9 }, () => 'clock +10');
    const laid = s.step(...wait, `layout word-${lit - 1}`);
    s.step(`screenshot ${shot}`);
    const got = await drive.run(flags, s.ops);
    const ink = wordInk(got[laid], shot, scheme) ?? [];
    const at = along(ink, channelsOf(theme[scheme].quiet), channelsOf(theme[scheme].ink));
    if (reduce)
      drive.check(`B3 (${name}) under reduce the word is the ink at once`, at > 1 - MARGIN, {
        ink,
        at,
      });
    else
      drive.check(
        `B3 (${name}) the word just lit is drawn mid-way from the quiet to the ink`,
        at > MARGIN && at < 1 - MARGIN,
        { ink, at, word: lit - 1 },
      );
  }
};

/** B4: a scheme chosen in Settings with Today under the sheet. */
const scheme = async () => {
  const shot = join(SAMPLES, `${host}-4-scheme.png`);
  const lead = [
    'prefer prefers-color-scheme light',
    'clock data',
    'clock settle',
    'tap hear',
    'clock +3000',
    'tap gear',
    'clock settle',
    'tap appearance-dark',
    'clock data',
    'tap settings-done',
  ];
  const flags = [
    ...port,
    '--storage',
    `motion-4-${stamp}`,
    '--reset-storage',
    '--url',
    '/cue/full',
  ];
  if (ios) await drive.run([...flags, ...timing], script(...lead, ...film('4-scheme')).ops);
  const s = script(...lead);
  const laid = s.step('clock +90', 'layout word-0');
  s.step(`screenshot ${shot}`);
  const got = await drive.run(flags, s.ops);
  const ink = wordInk(got[laid], shot, 'dark') ?? [];
  const at = along(ink, channelsOf(theme.light.ink), channelsOf(theme.dark.ink));
  drive.check('B4 after a scheme switch no word is mid-way', at > 1 - MARGIN, { ink, at });

  const flipped = join(SAMPLES, `${host}-4-system.png`);
  const f = script('prefer prefers-color-scheme light', 'clock data', 'clock settle');
  const flipLaid = f.step('prefer prefers-color-scheme dark', 'clock +90', 'layout word-0');
  f.step(`screenshot ${flipped}`);
  const flip = await drive.run(flags, f.ops);
  const quiet = wordInk(flip[flipLaid], flipped, 'dark') ?? [];
  const flipAt = along(quiet, channelsOf(theme.light.quiet), channelsOf(theme.dark.quiet));
  drive.check('B4 after a system scheme flip no word is mid-way', flipAt > 1 - MARGIN, {
    ink: quiet,
    at: flipAt,
  });
};

/** B6 and B7: home's ask, and a plant's press. */
const home = async () => {
  const s = script(
    ...GRANTED,
    'type root /verses',
    'clock data',
    'tap plant-three',
    'clock data',
    'tap plant-one',
    'clock data',
    'type root /',
    'clock data',
    'clock settle',
    'tap single-remove-Psalms-119-1',
  );
  const asked = s.step('clock +60', 'layout ask-Psalms-119-1');
  s.step('clock settle', 'tap ask-no', ...film('6-ask'));
  const kept = s.step('clock settle', 'tree');
  const pressed = s.step('tap plant-John-3-16 down', 'clock settle', 'layout plant-John-3-16');
  s.step('tap up');
  const got = await drive.run(
    [
      ...port,
      ...timing,
      '--storage',
      `motion-6-${stamp}`,
      '--reset-storage',
      '--epoch',
      new Date(SOWN).toISOString(),
    ],
    s.ops,
  );
  if (!ios)
    drive.check(
      'B6 the ask fades in: at +60 its opacity is strictly between 0 and 1',
      midway(opacityOf(got[asked])),
      opacityOf(got[asked]),
    );
  drive.check('B6 after Keep the ask is gone', !holds(got[kept], 'ask-Psalms-119-1'), 'ask');
  drive.check(
    'B7 a plant pressed scales to 0.97',
    Math.abs(scaleOf(got[pressed]) - PRESS) < 0.005,
    scaleOf(got[pressed]),
  );
};

interface Today {
  readonly reference: string;
  readonly passage: string;
  readonly session: {
    readonly ended: boolean;
    readonly grown: readonly { readonly slug: string }[];
    readonly wire: { readonly items: readonly { readonly reference: string }[] };
  };
}

/** A verse's node name: its reference with spaces and colons as dashes (`John-3-16`). */
const slugOf = (reference: string) => reference.replace(/[ :]/gu, '-');

/** A store with John 3:16-18 sown and said Good that day and the next, and its launches a month on, a minute apart. */
const sown = async (store: string) => {
  await drive.run(
    [
      ...port,
      '--storage',
      store,
      '--reset-storage',
      '--epoch',
      new Date(SOWN).toISOString(),
      '--time-zone',
      ZONE,
    ],
    [
      ...GRANTED,
      'type root /verses',
      'clock data',
      'tap plant-three',
      'clock data',
      ...LIST.flatMap((slug) => [`tap good-${slug}`, 'clock data']),
      `clock +${DAY}`,
      'clock data',
      ...LIST.flatMap((slug) => [`tap good-${slug}`, 'clock data']),
    ],
  );
  let launches = 0;
  return (ops: readonly string[]) => {
    launches += 1;
    const at = new Date(SOWN + LATER + launches * 60_000).toISOString();
    return drive.run(
      [
        ...port,
        ...timing,
        '--storage',
        store,
        '--keep-storage',
        '--epoch',
        at,
        '--time-zone',
        ZONE,
      ],
      ops,
    );
  };
};

/** The plan a month on, and each of its verses' passage as `/start/<slug>` shows it. */
const planOf = async (later: (ops: readonly string[]) => Promise<unknown[]>) => {
  const s = script(...GRANTED, 'type root /today', 'clock data', 'clock settle');
  const today = s.step('state today');
  const passages = LIST.map((slug) =>
    s.step(`type root /start/${slug}`, 'clock data', 'clock settle', 'state today.passage'),
  );
  const got = await later(s.ops);
  const items = (got[today] as Today | undefined)?.session.wire.items ?? [];
  const passage = new Map(LIST.map((slug, at) => [slug, String(got[passages[at] ?? 0] ?? '')]));
  return items.map((item) => ({
    slug: slugOf(item.reference),
    passage: passage.get(slugOf(item.reference)) ?? '',
  }));
};

/** B2's reads: the next verse's column at +100 and settled; under reduce, its place, else its opacity. */
const nextVerse = (reduce: boolean, early: unknown, settled: unknown) => {
  if (reduce)
    drive.check(
      'B2 under reduce the next verse does not move: at +100 it stands where it rests',
      frameOf(early)?.y === frameOf(settled)?.y,
      [frameOf(early), frameOf(settled)],
    );
  else if (!ios)
    drive.check(
      'B2 the next verse comes in: at +100 its opacity is strictly between 0 and 1, then 1',
      midway(opacityOf(early)) && opacityOf(settled) === 1,
      [opacityOf(early), opacityOf(settled)],
    );
};

/** B5's reads: each grown row as the end first shows it and once settled. */
const ended = (reduce: boolean, first: readonly number[], rest: readonly number[]) => {
  const name = reduce ? 'reduced' : 'full';
  if (reduce)
    drive.check(
      'B5 under reduce every row shows at once',
      first.every((each) => each === 1),
      first,
    );
  else if (!ios)
    drive.check(
      'B5 at +350 the first row is coming in and the third waits',
      (first[0] ?? 0) > 0 && first[2] === 0,
      first,
    );
  drive.check(
    `B5 (${name}) after settling every row shows`,
    rest.every((each) => each === 1),
    rest,
  );
};

/**
 * B2 and B5: one launch a month on says the plan's three reviews through,
 * reading the second verse's entrance after the first Next and the end's
 * rows after the last (a launch keeps its own session, so the run and its
 * end are one launch's).
 */
const ending = async () => {
  for (const reduce of ios ? [false] : [false, true]) {
    const name = reduce ? 'reduced' : 'full';
    const later = await sown(`motion-5-${name}-${stamp}`);
    const plan = await planOf(later);
    drive.check(`B5 (${name}) the plan holds the three reviews`, plan.length === LIST.length, plan);
    if (plan.length !== LIST.length) continue;
    const s = script(...(reduce ? [REDUCE] : []), ...GRANTED, 'type root /today', 'clock data');
    s.step('clock settle', ...recite(plan[0]?.passage ?? ''), 'tap next', 'clock data');
    const early = s.step('clock +100', 'layout recital');
    const settled = s.step('clock settle', 'layout recital');
    for (const item of plan.slice(1)) s.step(...recite(item.passage), 'tap next', 'clock data');
    const end = s.step('state today.session');
    const rows = () => plan.map((item) => s.step(`layout grown-${item.slug}`));
    s.step(...film('5-end'));
    if (!reduce) s.step('clock +350');
    const first = ios ? [] : rows();
    s.step('clock settle', `screenshot ${join(SHOTS, `${host}-5-end-${name}-settled.png`)}`);
    const rest = rows();
    const got = await later(s.ops);
    nextVerse(reduce, got[early], got[settled]);
    const session = got[end] as Today['session'] | undefined;
    drive.check(
      `B5 (${name}) the run ends with the three grown`,
      session?.ended === true && session.grown.length === LIST.length,
      session,
    );
    ended(
      reduce,
      first.map((at) => opacityOf(got[at])),
      rest.map((at) => opacityOf(got[at])),
    );
  }
};

/** Each check by its name; `bun tools/drive-motion.ts web pulse,home` runs those alone. */
const CHECKS = { pulse, words, scheme, home, ending };
const chosen = (process.argv[3] ?? Object.keys(CHECKS).join(',')).split(',');
for (const [name, check] of Object.entries(CHECKS)) if (chosen.includes(name)) await check();

process.exit(drive.finish());
