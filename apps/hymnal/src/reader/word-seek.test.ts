import { describe as group, expect, it } from 'bun:test';
import { Option } from 'effect';

import type { SeekLine, SeekTarget, SeekTargets } from '~/follow/seek-targets';

import {
  anchorOf,
  centerOffset,
  type Choice,
  choiceAt,
  Contact,
  contactAfter,
  describe,
  isChoice,
  LINE_STEP,
  PointerInput,
  type PointerEffect,
  SLOP,
  spoken,
  stepFrom,
  WORD_STEP,
} from './word-seek';

/** Words at even onsets; `shared` pairs a word with the one before on one onset. */
const timed = (line: number, count: number, shared = -1): SeekLine => {
  const ms = Array.from(
    { length: count },
    (_, k) => line * 1000 + (k - Number(k === shared)) * 100,
  );
  return {
    _tag: 'WordTimed',
    line,
    start: line * 1000,
    until: line * 1000 + 1000,
    words: ms.map((at, word) => ({
      word,
      ms: at,
      shared: ms.flatMap((other, k) => [k].filter(() => other === at)),
    })),
  };
};
const whole = (line: number): SeekLine => ({
  _tag: 'LineOnly',
  line,
  start: line * 1000,
  until: line * 1000 + 1000,
});

/** Sparse sung lines (2, 5 and 6 are not eligible), unequal word counts, a line timed whole and a shared onset. */
const targets: SeekTargets = {
  number: 1,
  choice: [],
  lines: [timed(0, 3), timed(1, 6, 2), whole(3), timed(4, 1), timed(7, 5), whole(8)],
};

/** Steps of `unit` a distance covers, counted one by one toward zero. */
const steps = (distance: number, unit: number) => {
  let n = 0;
  while (n < 1000 && (n + 1) * unit <= Math.abs(distance)) n++;
  return Math.sign(distance) * n;
};

/** How many columns a line offers a hold: its words, or the one place of a line timed whole. */
const columns = (line: SeekLine) => {
  if (line._tag === 'WordTimed') return line.words.length;
  return 1;
};

/** The reference choice: the ordered list of eligible lines, counted steps, each axis clamped alone. */
const reference = (row: number, column: number, dx: number, dy: number) => {
  const order = targets.lines.map((line) => line.line);
  const at = Math.max(0, Math.min(order.length - 1, row - steps(dy, LINE_STEP)));
  const line = targets.lines[at] as SeekLine;
  if (line._tag === 'LineOnly') return [order[at], -1];
  return [order[at], Math.max(0, Math.min(line.words.length - 1, column + steps(dx, WORD_STEP)))];
};

const flat = (choice: Option.Option<Choice>) =>
  Option.match(choice, {
    onNone: () => [Number.NaN, Number.NaN],
    onSome: (one) => [one.line, Option.getOrElse(one.word, () => -1)],
  });

const word = (line: number, w: number): SeekTarget => ({ _tag: 'Word', line, word: w, ms: 0 });
const lineOnly = (line: number): SeekTarget => ({ _tag: 'Line', line, ms: 0 });

group('a drag from the hold', () => {
  it('moves lines and words together, each clamped alone, at every threshold side', () => {
    const near = (unit: number) =>
      [-9, -2, -1, 0, 1, 2, 9].flatMap((n) => [-0.001, 0, 0.001].map((e) => n * unit + e));
    const anchors = targets.lines.flatMap((line, row) =>
      Array.from({ length: columns(line) }, (_, column) => ({ row, column, line: line.line })),
    );
    const drags = near(WORD_STEP).flatMap((dx) => near(LINE_STEP).map((dy) => [dx, dy] as const));
    const cases = anchors.flatMap(({ row, column, line }) =>
      drags.map(([dx, dy]) => {
        const got = flat(choiceAt(targets, { row, column }, dx, dy));
        const want = reference(row, column, dx, dy);
        return {
          wrong: got[0] !== want[0] || got[1] !== want[1],
          diagonal: want[0] !== line && want[1] !== column && want[1] !== -1,
        };
      }),
    );
    expect([
      cases.filter((one) => one.wrong).length,
      cases.length,
      cases.some((one) => one.diagonal),
    ]).toEqual([0, 17 * 21 * 21, true]);
  });

  it('ignores a drag that is not finite and never rebases on a clamp', () => {
    const anchor = { row: 1, column: 4 };
    const trail = [
      [0, -1e9],
      [1e9, 0],
      [Number.NaN, 0],
      [0, Number.POSITIVE_INFINITY],
      [-1e9, 1e9],
      [0, -LINE_STEP],
      [0, 0],
    ].map(([dx, dy]) => flat(choiceAt(targets, anchor, dx ?? 0, dy ?? 0)));
    expect(trail).toEqual([
      [8, -1],
      [1, 5],
      [Number.NaN, Number.NaN],
      [Number.NaN, Number.NaN],
      [0, 0],
      [3, -1],
      [1, 4],
    ]);
  });

  it('anchors on the initial target, column 0 on a line timed whole', () => {
    expect([
      Option.getOrNull(anchorOf(targets, word(7, 3))),
      Option.getOrNull(anchorOf(targets, lineOnly(3))),
      Option.isNone(anchorOf(targets, lineOnly(2))),
    ]).toEqual([{ row: 4, column: 3 }, { row: 2, column: 0 }, true]);
  });
});

group('an accessible step', () => {
  it('keeps the column clamped, stops at the ends and never invents a word', () => {
    const at = (target: SeekTarget, step: Parameters<typeof stepFrom>[2]) =>
      flat(stepFrom(targets, target, step));
    expect([
      at(word(1, 5), 'next-line'),
      at(lineOnly(3), 'next-line'),
      at(word(4, 0), 'prev-line'),
      at(word(1, 5), 'prev-line'),
      at(word(0, 0), 'prev-line'),
      at(lineOnly(8), 'next-line'),
      at(word(0, 0), 'prev-word'),
      at(word(0, 2), 'next-word'),
      at(word(0, 1), 'next-word'),
      at(lineOnly(3), 'next-word'),
      at(lineOnly(2), 'next-line'),
    ]).toEqual([
      [3, -1],
      [4, 0],
      [3, -1],
      [0, 2],
      [Number.NaN, Number.NaN],
      [Number.NaN, Number.NaN],
      [Number.NaN, Number.NaN],
      [Number.NaN, Number.NaN],
      [0, 2],
      [Number.NaN, Number.NaN],
      [Number.NaN, Number.NaN],
    ]);
  });

  it('names lines and words by number, timing whole and shared', () => {
    const said = (target: SeekTarget) => Option.map(describe(targets, target), spoken);
    expect([said(word(1, 2)), said(lineOnly(3)), said(word(7, 0)), said(lineOnly(5))]).toEqual([
      Option.some('Line 2 of 6, sung line 2, word 3 of 6, timing shared with word 2'),
      Option.some('Line 3 of 6, sung line 4, Line timing only'),
      Option.some('Line 5 of 6, sung line 8, word 1 of 5'),
      Option.none(),
    ]);
    expect([
      isChoice(word(1, 2), { line: 1, word: Option.some(2) }),
      isChoice(lineOnly(3), { line: 3, word: Option.some(0) }),
    ]).toEqual([true, false]);
  });
});

group('the middle', () => {
  it('sets every block mid-viewport within 2 points, never below 0, and refuses bad measures', () => {
    let cases = 0;
    for (const viewport of [1, 320, 667, 1200])
      for (const height of [0, 1, 24, 333, 2000])
        for (const top of [0, 0.5, 48, 5000]) {
          const pad = viewport / 2;
          const offset = Option.getOrThrow(centerOffset(top, height, viewport, pad));
          const middle = pad + top + height / 2 - offset;
          expect([Math.abs(middle - viewport / 2) <= 2, offset >= 0]).toEqual([true, true]);
          cases++;
        }
    expect(cases).toBe(80);
    expect(
      [
        [Number.NaN, 1, 1, 0],
        [0, -1, 1, 0],
        [0, 1, 0, 0],
        [0, 1, Number.POSITIVE_INFINITY, 0],
      ].map(([t, h, v, p]) => Option.isNone(centerOffset(t ?? 0, h ?? 0, v ?? 0, p ?? 0))),
    ).toEqual([true, true, true, true]);
  });
});

group('the pointer that holds', () => {
  const run = (inputs: ReadonlyArray<PointerInput>) => {
    let contact: Contact = Contact.Idle();
    const effects: Array<string> = [];
    for (const input of inputs) {
      const [next, effect] = contactAfter(contact, input);
      contact = next;
      effects.push(label(effect));
    }
    return { contact: contact._tag, effects };
  };
  const label = (effect: PointerEffect) => {
    if (effect._tag === 'Drag') return `Drag ${effect.dx} ${effect.dy}`;
    return effect._tag;
  };
  const down = (
    id = 1,
    extra: Partial<{ primary: boolean; button: number; startable: boolean }> = {},
  ) =>
    PointerInput.Down({ id, primary: true, button: 0, x: 100, y: 100, startable: true, ...extra });

  it('takes only a still primary main-button pointer on the words, at its deadline', () => {
    expect([
      run([down(1, { primary: false })]),
      run([down(1, { button: 2 })]),
      run([down(1, { startable: false })]),
      run([
        down(),
        PointerInput.Move({ id: 1, x: 100 + SLOP, y: 100 }),
        PointerInput.Deadline({ id: 1, acquired: true }),
      ]),
      run([
        down(),
        PointerInput.Move({ id: 1, x: 108, y: 107 }),
        PointerInput.Deadline({ id: 1, acquired: true }),
      ]),
      run([
        down(),
        PointerInput.Up({ id: 1, button: 0 }),
        PointerInput.Deadline({ id: 1, acquired: true }),
      ]),
      run([down(), PointerInput.Deadline({ id: 1, acquired: false })]),
    ]).toEqual([
      { contact: 'Idle', effects: ['None'] },
      { contact: 'Idle', effects: ['None'] },
      { contact: 'Idle', effects: ['None'] },
      { contact: 'Held', effects: ['Arm', 'None', 'Capture'] },
      { contact: 'Idle', effects: ['Arm', 'Disarm', 'None'] },
      { contact: 'Idle', effects: ['Arm', 'Disarm', 'None'] },
      { contact: 'Idle', effects: ['Arm', 'None'] },
    ]);
  });

  it('lets no other pointer or button move or end the hold, and ends it once', () => {
    expect(
      run([
        down(),
        PointerInput.Deadline({ id: 1, acquired: true }),
        down(2),
        PointerInput.Move({ id: 2, x: 0, y: 0 }),
        PointerInput.Up({ id: 2, button: 0 }),
        PointerInput.Lost({ id: 2 }),
        PointerInput.Up({ id: 1, button: 2 }),
        PointerInput.Move({ id: 1, x: 150, y: 4 }),
        PointerInput.Up({ id: 1, button: 0 }),
        PointerInput.Lost({ id: 1 }),
        PointerInput.Escape(),
        PointerInput.Up({ id: 1, button: 0 }),
      ]),
    ).toEqual({
      contact: 'Idle',
      effects: [
        'Arm',
        'Capture',
        'None',
        'None',
        'None',
        'None',
        'None',
        'Drag 50 -96',
        'Release',
        'None',
        'None',
        'None',
      ],
    });
    expect([
      run([
        down(),
        PointerInput.Deadline({ id: 1, acquired: true }),
        PointerInput.Lost({ id: 1 }),
      ]).effects.at(-1),
      run([
        down(),
        PointerInput.Deadline({ id: 1, acquired: true }),
        PointerInput.Escape(),
      ]).effects.at(-1),
      run([down(), PointerInput.Escape()]).effects.at(-1),
    ]).toEqual(['Cancel', 'Cancel', 'Disarm']);
  });
});
