/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test's reader of the app's own Contract and design text, line by line. */

/**
 * The hymnal's motion and haptics are calm and kept to their rules (A1,
 * A2), read from `app.forma` and every Contract file:
 *
 * - the motion tokens are the calm basis (the owner's q113, 150–250 ms):
 *   each named one has exactly its value, no duration is over 250 ms and
 *   no spring overshoots (a damping ratio under 1); the tiles' times are
 *   the current `All at once`'s (`tileTimes`), and the find bar grows on
 *   a spring of ratio 1 that settles over `duration.growth`;
 * - every motion row (`animation=`, `transition=`, `-exact-exit-animation=`,
 *   `-exact-layout-transition=`) is a choice on `motionStill` whose still
 *   arm only fades (keyframes of opacity alone, a transition of opacity)
 *   or is `none`, and names its times by token: no Contract line writes a
 *   time, a curve or a spring;
 * - the filled buttons (the find drums' Open) press to the brand's
 *   `pressed` under `onPressed`, at a scale of 0.97;
 * - every `haptic(` stands under `if settingsFeel`, and plays the kind
 *   the current hymnal's Feel seam gives its cue (`bodyOf(plain(cue))`),
 *   by the table below, which names each call's cue.
 *
 * Each finder is first tried on a planted defect, so a finder that finds
 * nothing cannot pass.
 */

import { describe, expect, it } from 'bun:test';

import * as body from '@manna/hymnal-app/feel/body';
import * as cues from '@manna/hymnal-app/feel/cues';
import * as reveal from '@manna/hymnal-app/home/reveal';
import * as tiles from '@manna/hymnal-app/home/tile-times';
import * as wheelmotion from '@manna/hymnal-app/player/wheelmotion';

import type * as TilesDecl from '../find/decl/tile-times';
import type * as BodyDecl from './decl/body';
import type * as CuesDecl from './decl/cues';
import { appFile, brandOf, contractFiles } from './design.testing.ts';

/**
 * A module's declaration with each function's parameters compared both
 * ways: the declarations name a cue looser than the source does, while
 * what a function answers must meet its declaration.
 */
type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  body: { bodyOf: body.bodyOf } satisfies Held<typeof BodyDecl>,
  cues: { plain: cues.plain } satisfies Held<typeof CuesDecl>,
  tiles: { tileTimes: tiles.tileTimes } satisfies Held<typeof TilesDecl>,
};

/** The longest a transition or an animation may run (q113). */
const LONGEST_MS = 250;

/** The motion tokens, each with exactly its value. */
const TOKENS = {
  'duration.fade': '150ms',
  'duration.exit': '150ms',
  'duration.bar-in': '250ms',
  'duration.bar-out': '150ms',
  'easing.out': 'cubic-bezier(0.23, 1, 0.32, 1)',
  'easing.quad-out': 'cubic-bezier(0.5, 1, 0.89, 1)',
  'duration.panel': '250ms',
  'duration.growth': '250ms',
  'duration.press': '200ms',
  'duration.wheel-in': `${wheelmotion.BACKDROP.enter}ms`,
  'duration.wheel-out': `${wheelmotion.BACKDROP.exit}ms`,
};

/**
 * The tiles' tokens, each the current `All at once`'s time
 * (`tileTimes`): the zoom in and out, and the still cross-fade.
 */
const TILE_TOKENS = {
  'duration.tiles-in': tiles.tileTimes.in,
  'duration.tiles-out': tiles.tileTimes.out,
  'duration.fade': tiles.tileTimes.fade,
};

/**
 * The pinned tab row's tokens, each the current `PinnedTabs`'s time
 * (`revealTimes`): its slide, and the fade alone under Reduce Motion.
 */
const REVEAL_TOKENS = {
  'duration.slide': reveal.revealTimes.slide,
  'duration.fade': reveal.revealTimes.fade,
};

/** The current PinnedTabs' slide curve, Reanimated's `Easing.out(Easing.cubic)` (1 − (1 − t)³), as CSS's cubic Bézier of it. */
const OUT_CUBIC = 'cubic-bezier(0.33, 1, 0.68, 1)';

/**
 * The find bar's growth spring: critically damped (a ratio of 1, no
 * bounce) and settling over `duration.growth`, the current bar's 0.30 s
 * growth shortened by q113. For a mass of 1 over `d` seconds, the
 * stiffness is (2π/d)² and the damping 4π·ratio/d, each rounded.
 */
const growthSpring = (seconds: number) =>
  `-exact-spring(${Math.round(((2 * Math.PI) / seconds) ** 2)}, ${Math.round((4 * Math.PI) / seconds)}, 1)`;

/** The press of a filled button: q113's gentle one. */
const PRESS_SCALE = '0.97';

type Cue = Parameters<typeof body.bodyOf>[0];

/** A dial's detent cue, as the current app tells a turn of `dial`. */
const detent = (dial: 'key' | 'capo' | 'tempo' | 'hundreds' | 'tens' | 'ones') => {
  const cue = { _tag: 'detent', dial, at: 0 } as const;
  return cue;
};

/** The cues each `haptic(` call is told by, by its action and the condition it stands under. */
const HAPTICS: ReadonlyArray<{
  readonly action: string;
  readonly when: string;
  readonly cues: ReadonlyArray<Cue>;
}> = [
  {
    action: 'playerAsk',
    when: 'if kind == "page" or kind == "bar" or kind == "play"',
    cues: [cues.plain('play'), cues.plain('pause')],
  },
  { action: 'playerAsk', when: 'else if kind == "stanza"', cues: [cues.plain('choose')] },
  {
    action: 'playerAsk',
    when: 'else if kind == "chooseAll" or kind == "tap"',
    cues: [cues.plain('press')],
  },
  { action: 'playerAsk', when: 'else if kind == "tempoReset"', cues: [cues.plain('reset')] },
  {
    action: 'playerCounted',
    when: 'if player.count.beat == 0',
    cues: [{ _tag: 'beat', accent: true }],
  },
  { action: 'playerCounted', when: 'if playerClick', cues: [{ _tag: 'beat', accent: false }] },
  { action: 'scrolled', when: 'if i != at', cues: [detent('tempo')] },
  { action: 'followAct', when: 'if followNow.ask == "pause"', cues: [cues.plain('seek-grab')] },
  {
    action: 'followAct',
    when: 'else if followNow.ask == "seek"',
    cues: [cues.plain('seek-release')],
  },
  {
    action: 'followAct',
    when: 'else if followNow.ask == "lift"',
    cues: [cues.plain('seek-release')],
  },
  {
    action: 'followTook',
    when: 'if performanceNow() - followTickAt >= 30',
    cues: [cues.plain('seek-tick')],
  },
  { action: 'settingsChoose', when: '', cues: [cues.plain('choose')] },
  { action: 'downloadsAsk', when: '', cues: [cues.plain('choose')] },
  { action: 'settingsStyleChoose', when: '', cues: [cues.plain('choose')] },
  { action: 'settingsPlacementChoose', when: '', cues: [cues.plain('choose')] },
  { action: 'readingFontChoose', when: '', cues: [cues.plain('choose')] },
  { action: 'readingSpacingChoose', when: '', cues: [cues.plain('choose')] },
  {
    action: 'readingAwakeSet',
    when: '',
    cues: [cues.plain('switch-on'), cues.plain('switch-off')],
  },
  { action: 'sheetInherit', when: '', cues: [cues.plain('reset')] },
  {
    action: 'favouriteKeep',
    when: 'if f.numbers.length > favouriteList.length',
    cues: [cues.plain('favourite-on')],
  },
  {
    action: 'favouriteKeep',
    when: 'else if f.numbers.length < favouriteList.length',
    cues: [cues.plain('favourite-off')],
  },
  { action: 'listChoose', when: 'if name != listTab', cues: [cues.plain('tab')] },
  { action: 'railTook', when: 'if m.ticks > 0', cues: [cues.plain('rail-tick')] },
  { action: 'chordsSet', when: '', cues: [cues.plain('chords-on'), cues.plain('chords-off')] },
  {
    action: 'playerSoundSwitch',
    when: '',
    cues: [cues.plain('switch-on'), cues.plain('switch-off')],
  },
  {
    action: 'keysTook',
    when: 'if s.cue == "chords-on" or s.cue == "chords-off"',
    cues: [cues.plain('chords-on'), cues.plain('chords-off')],
  },
  { action: 'keysTook', when: 'else if s.cue == "press"', cues: [cues.plain('press')] },
  { action: 'keysTook', when: 'else if s.cue == "wall"', cues: [cues.plain('wall')] },
  { action: 'keysTook', when: 'else if s.cue == "reset"', cues: [cues.plain('reset')] },
  { action: 'keysPressTook', when: 'if p.enter != ""', cues: [cues.plain('choose')] },
  { action: 'keysKeyScrolled', when: 'if at != keysKeyAt', cues: [detent('key')] },
  { action: 'keysCapoScrolled', when: 'if at != keysCapoAt', cues: [detent('capo')] },
  {
    action: 'findTurn',
    when: '',
    cues: [detent('hundreds'), detent('tens'), detent('ones')],
  },
];

const brand = brandOf(appFile('app.forma'));
const files = contractFiles().map((file) => ({ file, text: appFile(file) }));

interface Line {
  readonly at: string;
  readonly indent: number;
  readonly text: string;
}

/** A file's lines but its comments and blanks, each with its place and indent. */
const linesOf = (file: string, text: string): ReadonlyArray<Line> =>
  text
    .split('\n')
    .map((line, index) => ({
      at: `${file}:${index + 1}`,
      indent: line.length - line.trimStart().length,
      text: line.trim(),
    }))
    .filter((line) => line.text !== '' && !line.text.startsWith('//'));

/** The lines that hold `lines[index]`, nearest first. */
const ancestors = (lines: ReadonlyArray<Line>, index: number): ReadonlyArray<Line> => {
  const holders: Array<Line> = [];
  let indent = lines[index]?.indent ?? 0;
  for (let at = index - 1; at >= 0; at--) {
    const line = lines[at];
    if (line !== undefined && line.indent < indent) {
      holders.push(line);
      indent = line.indent;
    }
  }
  return holders;
};

/** Each keyframes' properties, by its name. */
const keyframesOf = (text: string): ReadonlyMap<string, ReadonlySet<string>> => {
  const frames = new Map<string, Set<string>>();
  let open: Set<string> | undefined;
  for (const line of text.split('\n')) {
    const head = /^keyframes\s+([\w-]+)/u.exec(line);
    if (head) {
      open = new Set();
      frames.set(head[1] ?? '', open);
    } else if (/^\S/u.test(line)) open = undefined;
    else if (open !== undefined)
      for (const [, name] of line.matchAll(/([\w-]+)=/gu)) open.add(name ?? '');
  }
  return frames;
};

const ROW = /(?:^|\s)(animation|transition|-exact-exit-animation|-exact-layout-transition)=/gu;
const CHOICE = /^\(motionStill \? "([^"]*)" : "([^"]*)"\)/u;

interface Row {
  readonly at: string;
  readonly name: string;
  readonly still?: string;
  readonly full?: string;
}

/** Every motion row of a Contract text: its arms when it is a choice on `motionStill`. */
const rowsOf = (file: string, text: string): ReadonlyArray<Row> =>
  linesOf(file, text).flatMap((line) =>
    [...line.text.matchAll(ROW)].map((found) => {
      const choice = CHOICE.exec(line.text.slice((found.index ?? 0) + found[0].length));
      return { at: line.at, name: found[1] ?? '', still: choice?.[1], full: choice?.[2] };
    }),
  );

/** What is wrong with a row: not a choice on `motionStill`, or a still arm that moves. */
const rowFault = (row: Row, frames: ReadonlyMap<string, ReadonlySet<string>>): string => {
  if (row.still === undefined || row.full === undefined) return 'not a choice on motionStill';
  if (row.still === 'none') return '';
  if (row.name === '-exact-layout-transition') return 'a still layout transition moves';
  if (row.name === 'transition')
    return row.still.split(',').every((part) => part.trim().split(/\s+/u)[0] === 'opacity')
      ? ''
      : 'a still transition moves more than opacity';
  const name = row.still.split(/\s+/u)[0] ?? '';
  const props = frames.get(name);
  if (props === undefined) return `no keyframes ${name}`;
  return [...props].every((prop) => prop === 'opacity' || prop === 'animation-timing-function')
    ? ''
    : `still keyframes ${name} move more than opacity`;
};

const LITERAL = /\b\d+ms\b|(?<![\w.-])\d*\.?\d+s\b|cubic-bezier|-exact-spring/iu;

/** Each line of a Contract text that writes a time, a curve or a spring. */
const literalsOf = (file: string, text: string) =>
  linesOf(file, text)
    .filter((line) => LITERAL.test(line.text))
    .map((line) => `${line.at}: ${line.text}`);

/** A duration's milliseconds, by token or as written. */
const msOf = (value: string, motion: ReadonlyMap<string, string>): number => {
  const written = motion.get(value) ?? value;
  const time = /^(\d*\.?\d+)(ms|s)$/u.exec(written);
  if (!time) return Number.NaN;
  return Number(time[1]) * (time[2] === 's' ? 1000 : 1);
};

/** Every `duration.…` token a row's arms name. */
const durationsOf = (row: Row) =>
  [row.still ?? '', row.full ?? ''].flatMap((arm) => arm.match(/duration\.[\w-]+/gu) ?? []);

/** Each spring's damping ratio, from its stiffness, damping and mass. */
const springRatios = (text: string) =>
  [...text.matchAll(/-exact-spring\(([^)]*)\)/gu)].map((found) => {
    const [stiffness, damping, mass] = (found[1] ?? '').split(',').map(Number);
    return (damping ?? 0) / (2 * Math.sqrt((stiffness ?? 0) * (mass ?? 1)));
  });

/** The lines under the first line `opens` matches, as far as its indent holds them. */
const blockAfter = (text: string, opens: (line: string) => boolean): ReadonlyArray<string> => {
  const lines = text.split('\n');
  const start = lines.findIndex(opens);
  if (start < 0) return [];
  const indent = (lines[start] ?? '').search(/\S/u);
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() !== '' && line.search(/\S/u) <= indent,
  );
  return lines.slice(start + 1, end < 0 ? undefined : end);
};

/** A component's lines. */
const componentOf = (text: string, name: string) =>
  blockAfter(text, (line) => line.trim() === `component ${name}`);

/** The lines of the element whose `testId` is `testId`. */
const elementOf = (text: string, testId: string) =>
  blockAfter(text, (line) => line.includes(`testId="${testId}"`));

/** The first `:active` block among `body`'s lines: each of its rows, by name. */
const pressOf = (body: ReadonlyArray<string>): ReadonlyMap<string, string> => {
  const block = new Map<string, string>();
  const active = body.findIndex((line) => line.trim() === ':active');
  if (active < 0) return block;
  const indent = (body[active] ?? '').search(/\S/u);
  for (const line of body.slice(active + 1)) {
    if (line.search(/\S/u) <= indent) break;
    const row = /^\s*([\w-]+)\s*=\s*"?([^"]*)"?\s*$/u.exec(line);
    if (row) block.set(row[1] ?? '', row[2] ?? '');
  }
  return block;
};

interface Haptic {
  readonly at: string;
  readonly kind: string;
  readonly action: string;
  readonly when: string;
  readonly felt: boolean;
}

/** Every `haptic(` of a Contract text: its kind, its action, the condition it stands under, and whether `settingsFeel` holds it. */
const hapticsOf = (file: string, text: string): ReadonlyArray<Haptic> => {
  const lines = linesOf(file, text);
  return lines.flatMap((line, index) => {
    const call = /haptic\("([^"]*)"\)/u.exec(line.text);
    if (!call) return [];
    const holders = ancestors(lines, index);
    const felt = holders.some((each) => each.text === 'if settingsFeel');
    const when = holders.find(
      (each) => /^(?:else )?if /u.test(each.text) && each.text !== 'if settingsFeel',
    );
    const action = holders.find((each) => each.text.startsWith('action '));
    return [
      {
        at: line.at,
        kind: call[1] ?? '',
        action: /^action\s+(\w+)/u.exec(action?.text ?? '')?.[1] ?? '',
        when: when?.text ?? '',
        felt,
      },
    ];
  });
};

/** A haptic of the Feel seam, by Exact's name. */
const exactName = (haptic: ReturnType<typeof body.bodyOf>['haptic']): string => {
  if (haptic._tag === 'impact') return `impact-${haptic.style}`;
  if (haptic._tag === 'notification') return haptic.type;
  return haptic._tag;
};

const frames = new Map(files.flatMap(({ text }) => [...keyframesOf(text)]));
const rows = files.flatMap(({ file, text }) => rowsOf(file, text));
const haptics = files.flatMap(({ file, text }) => hapticsOf(file, text));

describe('the finders find a planted defect', () => {
  const planted = new Map([
    ['hy-move', new Set(['opacity', 'translate'])],
    ['hy-fade', new Set(['opacity'])],
  ]);
  const row = (line: string) => rowsOf('x', `    ${line}`)[0] ?? { at: '', name: '' };

  it('a row that is no choice, or whose still arm moves', () => {
    expect(rowFault(row('row transition="opacity duration.fade ease"'), planted)).not.toBe('');
    expect(
      rowFault(
        row('row animation=(motionStill ? "hy-move duration.fade" : "hy-move duration.bar-in")'),
        planted,
      ),
    ).not.toBe('');
    expect(
      rowFault(
        row('row -exact-layout-transition=(motionStill ? "duration.fade" : "duration.bar-in")'),
        planted,
      ),
    ).not.toBe('');
    expect(
      rowFault(
        row('row transition=(motionStill ? "scale duration.fade" : "scale duration.bar-in")'),
        planted,
      ),
    ).not.toBe('');
    expect(
      rowFault(
        row('row animation=(motionStill ? "hy-fade duration.fade" : "hy-move duration.bar-in")'),
        planted,
      ),
    ).toBe('');
    expect(
      rowFault(
        row('row -exact-exit-animation=(motionStill ? "none" : "hy-move duration.bar-out")'),
        planted,
      ),
    ).toBe('');
  });

  it('a time, a curve or a spring written in Contract', () => {
    for (const line of [
      'row transition="opacity 200ms ease"',
      'row animation=(motionStill ? "none" : "hy-move 0.3s ease")',
      'row transition="scale -exact-spring(190, 13, 0.9)"',
      'row animation="hy-move duration.fade cubic-bezier(0, 0, 1, 1)"',
    ])
      expect(literalsOf('x', `    ${line}`)).toHaveLength(1);
    expect(
      literalsOf(
        'x',
        '    row animation=(motionStill ? "none" : "hy-rise duration.bar-in easing.out both") gap=12 padding="8px 16px"',
      ),
    ).toEqual([]);
  });

  it('a bouncy spring, the current bar’s', () => {
    expect(springRatios('easing.bar = -exact-spring(190, 13, 0.9)')[0]).toBeLessThan(1);
    expect(springRatios('easing.growth = -exact-spring(632, 50, 1)')[0]).toBeGreaterThanOrEqual(
      0.99,
    );
  });

  it('a pressed look, on a component or on one element', () => {
    const text = [
      'component A',
      '  view',
      '    button testId="b"',
      '      :active',
      '        color = "onPressed"',
      '      text "B"',
      '    button testId="c"',
      '      text "C"',
    ].join('\n');
    expect(Object.fromEntries(pressOf(componentOf(text, 'A')))).toEqual({ color: 'onPressed' });
    expect(Object.fromEntries(pressOf(elementOf(text, 'b')))).toEqual({ color: 'onPressed' });
    expect(pressOf(elementOf(text, 'c')).size).toBe(0);
  });

  it('a haptic outside the setting, and its cue and action', () => {
    const text = [
      'members X',
      '  action a(kind: string)',
      '    if settingsFeel',
      '      if kind == "x"',
      '        haptic("selection")',
      '    haptic("impact-light")',
    ].join('\n');
    expect(
      hapticsOf('x', text).map(({ kind, action, when, felt }) => ({ kind, action, when, felt })),
    ).toEqual([
      { kind: 'selection', action: 'a', when: 'if kind == "x"', felt: true },
      { kind: 'impact-light', action: 'a', when: '', felt: false },
    ]);
  });
});

describe('the hymnal’s motion is calm', () => {
  it('holds each declaration to its current source', () => {
    expect(held.body.bodyOf).toBe(body.bodyOf);
    expect(held.cues.plain).toBe(cues.plain);
    expect(held.tiles.tileTimes).toBe(tiles.tileTimes);
  });

  it('has each motion token with exactly its value', () => {
    for (const [name, value] of Object.entries(TOKENS))
      expect({ name, value: brand.motion.get(name) }).toEqual({ name, value });
  });

  it(`runs nothing longer than ${LONGEST_MS} ms, and no spring overshoots`, () => {
    for (const [name, value] of brand.motion)
      if (name.startsWith('duration.'))
        expect({ name, short: msOf(value, brand.motion) <= LONGEST_MS }).toEqual({
          name,
          short: true,
        });
    for (const ratio of [appFile('app.forma'), ...files.map(({ text }) => text)].flatMap(
      springRatios,
    ))
      expect(ratio).toBeGreaterThanOrEqual(0.99);
  });

  it('makes every motion row a choice on motionStill whose still arm only fades', () => {
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows)
      expect({ at: row.at, fault: rowFault(row, frames) }).toEqual({ at: row.at, fault: '' });
  });

  it('names each row’s times by a token of the design, none over the longest', () => {
    for (const row of rows)
      for (const duration of durationsOf(row))
        expect({ at: row.at, duration, ms: msOf(duration, brand.motion) <= LONGEST_MS }).toEqual({
          at: row.at,
          duration,
          ms: true,
        });
    for (const { file, text } of files) expect(literalsOf(file, text)).toEqual([]);
  });

  it('times the pinned tab row as the current PinnedTabs does: its slide out-cubic, its still arm a linear fade', () => {
    for (const [name, ms] of Object.entries(REVEAL_TOKENS))
      expect({ name, value: brand.motion.get(name) }).toEqual({ name, value: `${ms}ms` });
    expect(brand.motion.get('easing.slide')).toBe(OUT_CUBIC);
    const pinned = componentOf(appFile('features/list.contract'), 'ListTabsPinned').join('\n');
    expect(pinned).toContain(
      'transition=(motionStill ? "opacity duration.fade linear" : "translate duration.slide easing.slide")',
    );
  });

  it('times the tiles as the current All at once does', () => {
    for (const [name, ms] of Object.entries(TILE_TOKENS))
      expect({ name, value: brand.motion.get(name) }).toEqual({ name, value: `${ms}ms` });
  });

  it('grows the find bar on a spring with no bounce, settling over duration.growth', () => {
    const seconds = msOf('duration.growth', brand.motion) / 1000;
    expect(brand.motion.get('easing.growth')).toBe(growthSpring(seconds));
    expect(springRatios(brand.motion.get('easing.growth') ?? '')[0]).toBeCloseTo(1, 1);
  });

  it('presses the filled buttons to the brand’s pressed roles, at 0.97', () => {
    for (const body of [elementOf(appFile('features/find.contract'), 'drums-open')])
      expect(Object.fromEntries(pressOf(body))).toEqual({
        'background-color': 'pressed',
        color: 'onPressed',
        '-exact-press-scale': PRESS_SCALE,
      });
    expect(brand.colours.has('pressed') && brand.colours.has('onPressed')).toBe(true);
  });
});

describe('the hymnal’s haptics are the current Feel seam’s, under Sounds and haptics', () => {
  it('plays every haptic under `if settingsFeel`', () => {
    expect(haptics.length).toBeGreaterThan(0);
    for (const haptic of haptics)
      expect({ at: haptic.at, felt: haptic.felt }).toEqual({ at: haptic.at, felt: true });
  });

  it('plays the kind the current app gives each call’s cue', () => {
    const site = ({ action, when }: { readonly action: string; readonly when: string }) =>
      `${action}: ${when}`;
    expect(haptics.map(site).toSorted()).toEqual(HAPTICS.map(site).toSorted());
    for (const haptic of haptics) {
      const named = HAPTICS.find(
        (each) => each.action === haptic.action && each.when === haptic.when,
      );
      for (const cue of named?.cues ?? [])
        expect({ at: haptic.at, cue, kind: haptic.kind }).toEqual({
          at: haptic.at,
          cue,
          kind: exactName(body.bodyOf(cue).haptic),
        });
    }
  });
});
