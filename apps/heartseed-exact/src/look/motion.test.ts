/* oxlint-disable effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a regex group that did not match, a map entry and an Option's absent value are undefined. */

/**
 * Heartseed's motion (spec A1, README "Motion"): the brand's motion tokens
 * hold the audit's values, the light and the pulse the current app's own
 * (`@manna/heartseed/sayit/motion`); every motion row of the Contract is a
 * choice on reduced motion whose still arm moves nothing (an opacity fade
 * or `none`); no Contract file writes a motion literal; every press scales
 * to 0.97; no token a row names, of any family, nor any of the brand runs
 * past 250 ms but the listening loop, or overshoots; the run's end enters
 * as the current app's `endMotionOf` springs its plants. And each tick of
 * q114 stands (a selection on a grade, on each setting and on a verse of
 * the chooser), every one through the one gate that reads Sounds and
 * haptics (q116).
 */

import { describe, expect, it } from 'bun:test';
import type { Grown } from '@manna/heartseed/home/grown';
import { endMotionOf, MOTION } from '@manna/heartseed/home/motion';
import { SAYIT_MOTION } from '@manna/heartseed/sayit/motion';

import { readBrand, readContracts } from '../../tools/look';
import { themeLines } from './brand';

const TOKENS = {
  'duration.fade': '150ms',
  'duration.exit': '150ms',
  'duration.light': '180ms',
  'duration.rise': '250ms',
  'duration.ask': '200ms',
  'duration.pulse': '1200ms',
  'easing.out': 'cubic-bezier(0.23, 1, 0.32, 1)',
  'easing.pulse': 'cubic-bezier(0.5, 1, 0.89, 1)',
} as const;
const MOTION_ATTRS = [
  'animation',
  'transition',
  '-exact-exit-animation',
  '-exact-layout-transition',
] as const;
const PRESS_SCALE = 0.97;
const LONGEST_MS = 250;
const ROWS_CHECKED = 21;

const tokens = themeLines(readBrand());
const contracts = readContracts();

/** A token's milliseconds, from `150ms`. */
const msOf = (value: string | undefined) =>
  Number(/^(\d+)ms$/u.exec(value ?? '')?.[1] ?? Number.NaN);

/** The text from `open` (an opening paren) to its closing paren, quotes and templates skipped. */
const balanced = (text: string, open: number) => {
  let depth = 0;
  let quote = '';
  for (let at = open; at < text.length; at++) {
    const char = text[at] ?? '';
    if (quote !== '') {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === '`') quote = char;
    else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return text.slice(open, at + 1);
  }
  return text.slice(open);
};

/** A motion row: the file, its attribute and the value as written. */
interface Row {
  readonly path: string;
  readonly attr: string;
  readonly value: string;
}

/** A row's value from `start`: a parenthesised choice, or a quoted literal or a bare word. */
const valueAt = (text: string, start: number) => {
  if (text[start] === '(') return balanced(text, start);
  return /^("[^"]*"|`[^`]*`|\S+)/u.exec(text.slice(start))?.[1] ?? '';
};

/** Every motion row of `text`. */
const rowsOf = (path: string, text: string): Row[] =>
  [
    ...text.matchAll(
      /(?<=\s)(animation|transition|-exact-exit-animation|-exact-layout-transition)=/gu,
    ),
  ].map((match) => ({
    path,
    attr: match[1] ?? '',
    value: valueAt(text, (match.index ?? 0) + match[0].length),
  }));

/** `inner` split at its top-level `?` and `:`, or undefined when it is no choice. */
const choiceOf = (value: string) => {
  if (!value.startsWith('(') || !value.endsWith(')')) return undefined;
  const inner = value.slice(1, -1);
  const cuts: number[] = [];
  let depth = 0;
  let quote = '';
  for (const [at, char] of [...inner].entries()) {
    if (quote !== '') {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === '`') quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && (char === '?' || char === ':') && cuts.length < 2) cuts.push(at);
  }
  const [ask, colon] = cuts;
  if (ask === undefined || colon === undefined) return undefined;
  return {
    when: inner
      .slice(0, ask)
      .trim()
      .replace(/^\((.*)\)$/u, '$1'),
    still: inner.slice(ask + 1, colon).trim(),
    full: inner.slice(colon + 1).trim(),
  };
};

/** Each keyframes block of `text` by name, and whether it moves opacity alone. */
const keyframesOf = (text: string): ReadonlyMap<string, boolean> => {
  const blocks = new Map<string, boolean>();
  let name = '';
  for (const line of text.split('\n')) {
    const head = /^keyframes (\S+)/u.exec(line);
    if (head !== null) {
      name = head[1] ?? '';
      blocks.set(name, true);
    } else if (/^\S/u.test(line)) name = '';
    else if (name !== '' && line.trim() !== '') {
      const moved = [...line.matchAll(/(\S+)=/gu)].map((attr) => attr[1]);
      if (moved.some((attr) => attr !== 'opacity')) blocks.set(name, false);
    }
  }
  return blocks;
};

const keyframes = new Map([...contracts.values()].flatMap((text) => [...keyframesOf(text)]));

/** Why a motion row breaks the reduced-motion rule, or `""` when it keeps it. */
const breakOf = (row: Row, fades: ReadonlyMap<string, boolean>) => {
  const choice = choiceOf(row.value);
  if (choice === undefined) return 'not a choice';
  if (!/^(?:still|motionStill)(?: or .+)?$/u.test(choice.when)) return `chooses on ${choice.when}`;
  const still = /^"([^"]*)"$/u.exec(choice.still)?.[1];
  if (still === undefined) return `still arm ${choice.still} is no literal`;
  if (still === 'none') return '';
  if (/translate|scale|-exact-spring/u.test(still)) return `still arm ${still} moves`;
  if (row.attr === 'transition') {
    if (/^opacity /u.test(still)) return '';
    return `still arm ${still}`;
  }
  if (row.attr === '-exact-layout-transition') return `still arm ${still} slides`;
  if (fades.get(still.split(' ')[0] ?? '') === true) return '';
  return `still arm ${still} is no fade`;
};

/** The motion literals `text` writes: a time, a curve or a spring. */
const literalsOf = (text: string) =>
  text.match(/\b\d+ms\b|\b\d*\.?\d+s\b|cubic-bezier|-exact-spring/gu) ?? [];

const rows = [...contracts].flatMap(([path, text]) => rowsOf(path, text));

/** A token's value, a token it names followed through the brand's others. */
const resolved = (theme: ReadonlyMap<string, string>, name: string) => {
  let value = theme.get(name) ?? '';
  for (let hops = 0; theme.has(value) && hops < theme.size; hops++) value = theme.get(value) ?? '';
  return value;
};

/** A time unit's milliseconds. */
const UNIT_MS = new Map([
  ['ms', 1],
  ['s', 1000],
]);

/** A time's milliseconds, `150ms` or `0.6s`, else NaN. */
const timeOf = (value: string) => {
  const time = /^(\d*\.?\d+)(ms|s)$/u.exec(value.trim());
  if (time === null) return Number.NaN;
  return Number(time[1]) * (UNIT_MS.get(time[2] ?? '') ?? Number.NaN);
};

/** Whether a curve or a spring overshoots: a bezier's y outside [0, 1], or a spring's damping ratio under 1. */
const overshoots = (value: string) => {
  const bezier = /^cubic-bezier\(([^)]*)\)$/u.exec(value.trim());
  if (bezier !== null) {
    const [, y1, , y2] = (bezier[1] ?? '').split(',').map(Number);
    return [y1, y2].some((y) => y === undefined || !(y >= 0 && y <= 1));
  }
  const spring = /^-exact-spring\(([^)]*)\)$/u.exec(value.trim());
  if (spring !== null) {
    const [stiffness, damping, mass] = (spring[1] ?? '').split(',').map(Number);
    return !((damping ?? 0) / (2 * Math.sqrt((stiffness ?? 0) * (mass ?? 1))) >= 1);
  }
  return false;
};

/** Each token of the brand a row's value names, of any family, with its resolved value. */
const namedBy = (row: Row, theme: ReadonlyMap<string, string>) =>
  row.value
    .split(/[\s"`(),?:]+/u)
    .filter((word) => theme.has(word))
    .map((name) => ({ name, value: resolved(theme, name) }));

/** The listening loop's ring: the one row that may run past 250 ms. */
const isLoop = (row: Row, name: string) =>
  name === 'duration.pulse' && /"hs-pulse duration\.pulse easing\.pulse infinite"/u.test(row.value);

/** Each token a row names that runs past 250 ms (the loop apart) or overshoots. */
const timingFaults = (checked: readonly Row[], theme: ReadonlyMap<string, string>) =>
  checked.flatMap((row) =>
    namedBy(row, theme)
      .filter(
        ({ name, value }) =>
          (timeOf(value) > LONGEST_MS && !isLoop(row, name)) || overshoots(value),
      )
      .map(({ name, value }) => `${row.path} ${row.attr}: ${name} = ${value}`),
  );

/** Each token of the brand holding a time past 250 ms (the loop's own apart) or an overshooting curve. */
const tokenFaults = (theme: ReadonlyMap<string, string>) =>
  [...theme.keys()]
    .map((name) => ({ name, value: resolved(theme, name) }))
    .filter(
      ({ name, value }) =>
        (timeOf(value) > LONGEST_MS && name !== 'duration.pulse') || overshoots(value),
    )
    .map(({ name, value }) => `${name} = ${value}`);

describe('the motion tokens', () => {
  for (const [name, value] of Object.entries(TOKENS))
    it(`${name} is ${value}`, () => {
      expect(tokens.get(name)).toBe(value);
    });

  it("the light and the pulse are the current Say it's", () => {
    expect([msOf(tokens.get('duration.light')), msOf(tokens.get('duration.pulse'))]).toEqual([
      SAYIT_MOTION.light,
      SAYIT_MOTION.pulse,
    ]);
  });

  it('the ring grows as the current ring does', () => {
    const pulse = contracts.get('features/motion.contract') ?? '';
    const grown = /keyframes hs-pulse\n(?:.*\n)*?\s+to .*scale=([\d.]+)/u.exec(pulse)?.[1];
    expect(Number(grown)).toBeCloseTo(1 + SAYIT_MOTION.pulseGrowth, 10);
  });
});

describe('every motion row chooses on reduced motion, its still arm moving nothing', () => {
  it('finds the rows', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rows.map((row) => row.attr))).toEqual(new Set(MOTION_ATTRS));
  });
  for (const row of rows)
    it(`${row.path} ${row.attr}=${row.value}`, () => {
      expect(breakOf(row, keyframes)).toBe('');
    });

  it('finds a bare row, a moving still arm and a still arm that loops', () => {
    const planted = [
      'text "a" transition="color 180ms ease"',
      'column animation=(still ? "hs-rise duration.fade easing.out both" : "hs-rise duration.rise easing.out both")',
      'column animation=(still ? "hs-pulse duration.pulse easing.pulse infinite" : "none")',
      'column animation=(open ? "none" : "hs-rise duration.rise")',
    ];
    expect(
      planted
        .flatMap((line) => rowsOf('planted', ` ${line}`))
        .map((row) => breakOf(row, keyframes) !== ''),
    ).toEqual([true, true, true, true]);
  });
});

describe('the Contract names its timings by token', () => {
  for (const [path, text] of contracts)
    it(`${path} writes no motion literal`, () => {
      expect(literalsOf(text)).toEqual([]);
    });

  it('every press scales to 0.97', () => {
    const scales = [...contracts.values()].flatMap((text) =>
      [...text.matchAll(/-exact-press-scale=(\S+)/gu)].map((match) => Number(match[1])),
    );
    expect(scales.length).toBeGreaterThanOrEqual(2);
    expect(scales.filter((scale) => scale !== PRESS_SCALE)).toEqual([]);
  });

  it('finds the timing tokens the rows name', () => {
    const named = new Set(rows.flatMap((row) => namedBy(row, tokens).map(({ name }) => name)));
    expect([...named].toSorted()).toEqual(Object.keys(TOKENS).toSorted());
  });

  it('nothing runs past 250 ms but the listening loop, and nothing overshoots', () => {
    expect(timingFaults(rows, tokens)).toEqual([]);
  });

  it('no token of the brand runs past 250 ms but the loop, or overshoots', () => {
    expect(tokenFaults(tokens)).toEqual([]);
  });

  it('finds a 600 ms time and an overshooting curve under any token name', () => {
    const planted = new Map([
      ...tokens,
      ['hs.slow', '600ms'],
      ['hs.slower', 'hs.slow'],
      ['motion.long', '0.6s'],
      ['easing.bounce', 'cubic-bezier(0.34, 1.56, 0.64, 1)'],
      ['curve.dip', 'cubic-bezier(0.5, -0.4, 0.5, 1)'],
      ['easing.spring', '-exact-spring(190, 13, 0.9)'],
    ]);
    const plantedRows = [
      'text "a" transition=(still ? "none" : "color hs.slow ease")',
      'text "a" transition=(still ? "none" : "color hs.slower ease")',
      'column animation=(still ? "none" : "hs-rise motion.long easing.out both")',
      'column animation=(still ? "none" : "hs-rise duration.rise easing.bounce both")',
      'column animation=(still ? "none" : "hs-rise duration.rise curve.dip both")',
      'column animation=(still ? "none" : "hs-rise duration.rise easing.spring both")',
    ].map((line) => rowsOf('planted', ` ${line}`));
    expect(plantedRows.map((row) => timingFaults(row, planted).length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(tokenFaults(planted).map((fault) => fault.split(' ')[0])).toEqual([
      'hs.slow',
      'hs.slower',
      'motion.long',
      'easing.bounce',
      'curve.dip',
      'easing.spring',
    ]);
  });
});

describe("the run's end enters as the current app's end springs", () => {
  const session = contracts.get('features/session.contract') ?? '';
  const delay =
    /^fn sessionEndDelay\(i: number\): number = min\((\d+) \+ (\d+) \* i, (\d+)\)$/mu.exec(session);
  const enters = /^fn sessionEndEnters\(i: number\): bool = i < (\d+)$/mu.exec(session);

  it('writes its delay and its count as one expression each', () => {
    expect([delay !== null, enters !== null]).toEqual([true, true]);
  });

  it(`each of rows 0…${ROWS_CHECKED - 1} waits as endMotionOf's spring does, and none from row ${MOTION.sways} on`, () => {
    const [first, step, cap] = [1, 2, 3].map((group) => Number(delay?.[group]));
    const count = Number(enters?.[1]);
    const grown: Grown[] = Array.from({ length: ROWS_CHECKED }, (_, index) => ({
      reference: `Psalm 1:${index + 1}`,
      stage: 'blade',
    }));
    const contract = grown.map((_, i) => {
      if (i >= count) return 'none';
      return Math.min((first ?? 0) + (step ?? 0) * i, cap ?? 0);
    });
    const current = endMotionOf(grown).map(({ spring }) => {
      if (spring._tag === 'None') return 'none';
      return spring.value;
    });
    expect(contract).toEqual(current);
  });
});

/** The one action that plays a tick, and its whole body: a selection while Sounds and haptics is on. */
const GATE = 'feelTick';
const GATE_BODY = '    if settingsFeel\n      haptic("selection")';

/** A Contract text with its comment lines left out. */
const codeOf = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

/** Each action of `text` and its body. */
const actionsOf = (text: string) => {
  const actions = new Map<string, string>();
  for (const match of codeOf(text).matchAll(/^ {2}action (\w+)[^\n]*\n((?: {4,}[^\n]*\n?)*)/gmu))
    actions.set(match[1] ?? '', (match[2] ?? '').trimEnd());
  return actions;
};

/** How often `pattern` stands in `text`. */
const countOf = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

const HAPTIC = /\bhaptic\(/gu;

/** Each haptic of `text` that does not go through the gate: a `haptic(` anywhere but the gate's body, a press haptic, or a gate that plays without reading the setting. */
const gateFaults = (path: string, text: string) => {
  const actions = actionsOf(text);
  const faults = [...actions].flatMap(([name, body]) => {
    if (name === GATE && body !== GATE_BODY)
      return [`${path} ${GATE} is not one selection under settingsFeel`];
    if (name !== GATE && countOf(body, HAPTIC) > 0)
      return [`${path} ${name} plays a haptic of its own`];
    return [];
  });
  const inActions = [...actions.values()].reduce((sum, body) => sum + countOf(body, HAPTIC), 0);
  if (countOf(codeOf(text), HAPTIC) > inActions)
    faults.push(`${path} plays a haptic outside an action`);
  if (/-exact-press-haptic/u.test(codeOf(text))) faults.push(`${path} plays a press haptic`);
  return faults;
};

/** Whether an action's body ticks first: its first statement is the gate's call. */
const ticks = (body: string | undefined) => body?.split('\n')[0] === `    ${GATE}()`;

const actions = new Map([...contracts.values()].flatMap((text) => [...actionsOf(text)]));
const app = codeOf(contracts.get('app.contract') ?? '');

/** The action `app.contract` hands a component's prop. */
const handed = (component: string, prop: string) => {
  const call = new RegExp(`${component}\\(([^\\n]*)\\)`, 'u').exec(app)?.[1] ?? '';
  return new RegExp(`\\b${prop}=(\\w+)`, 'u').exec(call)?.[1] ?? '';
};

describe('every tick goes through the one gate that reads Sounds and haptics (q116)', () => {
  it('the gate is one action, playing one selection under settingsFeel', () => {
    expect(actions.get(GATE)).toBe(GATE_BODY);
    const all = [...contracts.values()].map(codeOf).join('\n');
    expect([countOf(all, new RegExp(`action ${GATE}\\b`, 'gu')), countOf(all, HAPTIC)]).toEqual([
      1, 1,
    ]);
  });

  for (const [path, text] of contracts)
    it(`${path} plays no haptic but through the gate`, () => {
      expect(gateFaults(path, text)).toEqual([]);
    });

  it('finds a direct haptic, a press haptic and a gate that does not read the setting', () => {
    const planted = [
      '  action todayGradeIt(grade: number)\n    haptic("selection")\n    send todayStepped = todayGrade(grade)\n',
      '    button press=go -exact-press-haptic="selection"\n',
      '  action feelTick\n    haptic("selection")\n',
      '  action feelTick\n    if settingsSheet\n      haptic("selection")\n',
      '  action todayGradeIt(grade: number)\n    if settingsFeel\n      haptic("selection")\n',
    ];
    expect(planted.map((text) => gateFaults('planted', text).length)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('Heartseed ticks as the hymnal does (q114)', () => {
  it('choosing a grade ticks a selection', () => {
    expect(ticks(actions.get('todayGradeIt'))).toBe(true);
  });

  for (const [prop, setting] of [
    ['minutes', 'settingsChooseMinutes'],
    ['voice', 'settingsChooseVoice'],
    ['appearance', 'settingsChooseAppearance'],
  ] as const)
    it(`choosing ${prop} in Settings ticks a selection, then chooses`, () => {
      const action = actions.get(handed('SettingsSheet', prop));
      expect(ticks(action)).toBe(true);
      expect(action?.split('\n').slice(1)).toEqual([`    ${setting}(value)`]);
    });

  it("ticking or unticking a verse of the chooser ticks a selection, then the chooser's tap", () => {
    const action = actions.get(handed('ChooserVersesPage', 'tap'));
    expect(ticks(action)).toBe(true);
    expect(action?.split('\n').slice(1)).toEqual(['    chooserTapIt(verse)']);
  });

  it('finds a grade with no tick', () => {
    const planted = actionsOf(
      '  action todayGradeIt(grade: number)\n    send todayStepped = todayGrade(grade)\n',
    );
    expect(ticks(planted.get('todayGradeIt'))).toBe(false);
  });
});
