import { describe, expect, test } from 'effect-bun-test';
import { Effect, Match, Option, Random } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { Scrubber } from './Scrubber';

type Pointer = 'mouse' | 'touch';

const stepKeys = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
] as const;
type StepKey = (typeof stepKeys)[number];
type Modifier = 'Shift' | 'Alt' | 'Meta' | 'Control';

type Step =
  | { readonly _tag: 'Tick'; readonly seconds: number }
  | { readonly _tag: 'Play' }
  | { readonly _tag: 'Halt' }
  | { readonly _tag: 'Down'; readonly pointer: Pointer; readonly id: number }
  | { readonly _tag: 'Move'; readonly to: number | 'back' }
  | { readonly _tag: 'Up' }
  | { readonly _tag: 'Cancel' }
  | { readonly _tag: 'Lost' }
  | { readonly _tag: 'Late' }
  | { readonly _tag: 'Change'; readonly dropped: boolean }
  | { readonly _tag: 'KeyDown'; readonly key: StepKey }
  | { readonly _tag: 'KeyUp'; readonly key: StepKey; readonly lost: boolean }
  | { readonly _tag: 'Modifier'; readonly key: Modifier }
  | { readonly _tag: 'Hold'; readonly key: Modifier }
  | { readonly _tag: 'Free'; readonly key: Modifier }
  | {
      readonly _tag: 'Second';
      readonly phase: 'down' | 'up' | 'cancel' | 'lost';
      readonly id: number;
    }
  | { readonly _tag: 'Chord'; readonly button: 1 | 2; readonly phase: 'down' | 'up' }
  | { readonly _tag: 'Other'; readonly button: 1 | 2; readonly phase: 'down' | 'up' }
  | { readonly _tag: 'Assist' };

interface Run {
  readonly at: number;
  readonly playing: boolean;
  readonly steps: ReadonlyArray<Step>;
}

const said: (step: Step) => string = Match.type<Step>().pipe(
  Match.tagsExhaustive({
    Tick: ({ seconds }) => `tick ${seconds.toFixed(2)}`,
    Play: () => 'play',
    Halt: () => 'halt',
    Down: ({ pointer, id }) => `down ${pointer} ${id}`,
    Move: ({ to }) => `move ${to}`,
    Up: () => 'up',
    Cancel: () => 'cancel',
    Lost: () => 'lost capture',
    Late: () => 'late up',
    Change: ({ dropped }) =>
      `change${Option.match(Option.liftPredicate(dropped, Boolean), { onNone: () => '', onSome: () => ' dropped' })}`,
    KeyDown: ({ key }) => `${key} down`,
    KeyUp: ({ key, lost }) =>
      `${key} up${Option.match(Option.liftPredicate(lost, Boolean), { onNone: () => '', onSome: () => ' elsewhere' })}`,
    Modifier: ({ key }) => key,
    Hold: ({ key }) => `${key} down`,
    Free: ({ key }) => `${key} up`,
    Second: ({ phase, id }) => `second ${id} ${phase}`,
    Chord: ({ button, phase }) => `button ${button} ${phase} in press`,
    Other: ({ button, phase }) => `button ${button} ${phase}`,
    Assist: () => 'screen reader step',
  }),
);

const modifiers: ReadonlyArray<Modifier> = ['Shift', 'Alt', 'Meta', 'Control'];

const length = 239.82;
const top = Math.floor(length);

const valueOf = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

const fitted = (bar: HTMLInputElement, written: string) => {
  const max = Number(bar.max) || 0;
  const near = Math.round(Math.min(Math.max(Number(written), 0), max));
  return String(Math.min(near, Math.floor(max)));
};

const chromeRanges = () => {
  Object.defineProperty(HTMLInputElement.prototype, 'value', {
    ...valueOf,
    set(this: HTMLInputElement, written: string) {
      valueOf?.set?.call(
        this,
        Option.match(
          Option.liftPredicate(this, (input) => input.type === 'range'),
          {
            onNone: () => written,
            onSome: (range) => fitted(range, written),
          },
        ),
      );
    },
  });
  return {
    [Symbol.dispose]: () => {
      if (valueOf) Object.defineProperty(HTMLInputElement.prototype, 'value', valueOf);
    },
  };
};

interface Held {
  readonly kind: Pointer;
  readonly id: number;
}

interface Model {
  at: number;
  playing: boolean;
  pressed: Option.Option<Held>;
  lost: Option.Option<Held>;
  before: Option.Option<number>;
  owed: boolean;
  held: Option.Option<Held>;
  second: boolean;
  readonly seeks: Array<number>;
}

const mouseId = 1;
const firstTouch = 2;

const mounted = (model: Model) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const sent = new Array<number>();
  const draw = () =>
    act(() =>
      root.render(
        <Scrubber
          at={model.at}
          length={Option.some(length)}
          onSeek={(seconds) => {
            sent.push(seconds);
            model.at = seconds;
          }}
        />,
      ),
    );
  draw();
  return {
    bar: Option.getOrThrow(
      Option.liftPredicate(
        host.querySelector('input'),
        (found): found is HTMLInputElement => found instanceof HTMLInputElement,
      ),
    ),
    sent,
    draw,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const play = (run: Run): Option.Option<string> => {
  using _chrome = chromeRanges();
  const model: Model = {
    at: run.at,
    playing: run.playing,
    pressed: Option.none(),
    lost: Option.none(),
    before: Option.none(),
    owed: false,
    held: Option.none(),
    second: false,
    seeks: [],
  };
  using page = mounted(model);
  const { bar, sent } = page;
  const value = () => Number(bar.value);
  const fire = (event: Event, at: EventTarget = bar) => {
    let open = true;
    act(() => {
      open = at.dispatchEvent(event);
    });
    return open;
  };
  const down = new Set<string>();
  const modified = () => ({
    shiftKey: down.has('Shift'),
    altKey: down.has('Alt'),
    ctrlKey: down.has('Control'),
    metaKey: down.has('Meta'),
  });
  const pointer = (
    type: string,
    { kind, id }: Held,
    { button = 0, buttons = 0 }: { button?: number; buttons?: number } = {},
  ) =>
    fire(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button,
        buttons,
        pointerId: id,
        pointerType: kind,
        isPrimary:
          kind === 'mouse' ||
          Option.match(model.pressed, {
            onNone: () => true,
            onSome: (press) => press.id === id || press.kind === 'mouse',
          }),
        ...modified(),
      }),
    );
  const mouse: Held = { kind: 'mouse', id: mouseId };
  const key = (type: 'keydown' | 'keyup', name: string, at: EventTarget = bar) => {
    const repeat = type === 'keydown' && down.has(name);
    if (type === 'keydown') down.add(name);
    else down.delete(name);
    return fire(
      new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: name,
        repeat,
        ...modified(),
      }),
      at,
    );
  };
  const input = (to: number) => {
    valueOf?.set?.call(bar, fitted(bar, String(to)));
    fire(new Event('input', { bubbles: true }));
  };
  const owe = (to: number) => {
    model.seeks.push(to);
    if (Option.isSome(model.before)) model.before = Option.some(to);
  };
  const step = (to: number) => {
    owe(to);
    input(to);
    fire(new Event('change', { bubbles: true }));
  };
  const stepOf = (name: StepKey, from: number) => {
    const max = Number(bar.max) || 0;
    const page = Math.max(1, max / 10);
    const raw = Match.value(name).pipe(
      Match.when('ArrowRight', () => from + 1),
      Match.when('ArrowUp', () => from + 1),
      Match.when('ArrowLeft', () => from - 1),
      Match.when('ArrowDown', () => from - 1),
      Match.when('PageUp', () => from + page),
      Match.when('PageDown', () => from - page),
      Match.when('Home', () => 0),
      Match.when('End', () => max),
      Match.exhaustive,
    );
    return Number(fitted(bar, String(raw)));
  };
  const edit = (to: number) => {
    if (model.second || to === value()) return;
    if (Option.isNone(model.before)) model.before = Option.some(value());
    input(to);
  };
  const end = () => {
    model.owed = Option.exists(model.before, (before) => before !== value());
    model.pressed = Option.none();
    model.before = Option.none();
  };
  const pressing = () => Option.getOrElse(model.pressed, () => mouse);
  const broke = (rule: string, index: number) =>
    Option.some(
      [
        `${rule} at step ${index}: bar ${bar.value}, playback ${model.at.toFixed(2)},`,
        `seeks [${sent.join(', ')}], owed [${model.seeks.join(', ')}];`,
        `from ${run.at.toFixed(2)}, ${Option.match(Option.liftPredicate(run.playing, Boolean), { onNone: () => 'paused', onSome: () => 'playing' })}:`,
        run.steps
          .slice(0, index + 1)
          .map(said)
          .join(', '),
      ].join(' '),
    );
  const seeksHold = (index: number): Option.Option<string> =>
    Option.liftPredicate(
      index,
      () => sent.length !== model.seeks.length || sent.some((s, i) => s !== model.seeks[i]),
    ).pipe(Option.flatMap(() => broke('a seek not owed, or one owed and not sent', index)));
  const follows = (index: number): Option.Option<string> =>
    Option.liftPredicate(
      index,
      () => Option.isNone(model.pressed) && Math.abs(value() - model.at) > 1,
    ).pipe(Option.flatMap(() => broke('the bar is off playback with no press open', index)));
  const masks = { 1: 4, 2: 2 } as const;
  const held = { down: 1, up: 0 } as const;
  const events = { down: 'pointerdown', up: 'pointerup' } as const;
  const apply = Match.type<Step>().pipe(
    Match.tagsExhaustive({
      Tick: ({ seconds }) => {
        if (model.playing) model.at = Math.min(model.at + seconds, length);
        page.draw();
      },
      Play: () => void (model.playing = true),
      Halt: () => void (model.playing = false),
      Down: ({ pointer: kind, id }) => {
        const press: Held = { kind, id };
        model.pressed = Option.some(press);
        pointer('pointerdown', press, { buttons: 1 });
      },
      Move: ({ to }) =>
        edit(
          Match.value(to).pipe(
            Match.when('back', () => Option.getOrElse(model.before, value)),
            Match.orElse((second) => second),
          ),
        ),
      Up: () => {
        const press = pressing();
        if (Option.exists(model.before, (before) => before !== value())) model.seeks.push(value());
        end();
        pointer('pointerup', press);
        if (press.kind === 'touch') pointer('lostpointercapture', press);
        else model.held = Option.some(press);
      },
      Cancel: () => {
        const press = pressing();
        end();
        pointer('pointercancel', press);
        if (press.kind === 'touch') pointer('lostpointercapture', press);
      },
      Lost: () => {
        const press = pressing();
        end();
        model.lost = Option.some(press);
        pointer('lostpointercapture', press);
      },
      Late: () => {
        for (const press of Option.toArray(model.lost)) pointer('pointerup', press);
        model.lost = Option.none();
      },
      Change: ({ dropped }) => {
        if (model.owed && !dropped) fire(new Event('change', { bubbles: true }));
        model.owed = false;
        if (Option.isSome(model.held)) pointer('lostpointercapture', model.held.value);
        model.held = Option.none();
      },
      KeyDown: ({ key: name }) => {
        const to = stepOf(name, value());
        const moves = to !== value();
        if (moves) owe(to);
        if (key('keydown', name) && moves) {
          input(to);
          fire(new Event('change', { bubbles: true }));
        }
      },
      KeyUp: ({ key: name, lost }) =>
        void Match.value(lost).pipe(
          Match.when(true, () => key('keyup', name, document.body)),
          Match.orElse(() => key('keyup', name)),
        ),
      Modifier: ({ key: name }) => {
        key('keydown', name);
        key('keyup', name);
      },
      Hold: ({ key: name }) => key('keydown', name),
      Free: ({ key: name }) => key('keyup', name),
      Second: ({ phase, id }) => {
        const touch: Held = { kind: 'touch', id };
        Match.value(phase).pipe(
          Match.when('down', () => {
            model.second = true;
            pointer('pointerdown', touch, { buttons: 1 });
          }),
          Match.when('up', () => {
            model.second = false;
            pointer('pointerup', touch);
            pointer('lostpointercapture', touch);
          }),
          Match.when('cancel', () => {
            model.second = false;
            pointer('pointercancel', touch);
            pointer('lostpointercapture', touch);
          }),
          Match.when('lost', () => {
            model.second = false;
            pointer('lostpointercapture', touch);
          }),
          Match.exhaustive,
        );
      },
      Chord: ({ button, phase }) =>
        pointer('pointermove', mouse, { button, buttons: 1 | (held[phase] * masks[button]) }),
      Other: ({ button, phase }) =>
        pointer(events[phase], mouse, { button, buttons: held[phase] * masks[button] }),
      Assist: () => step(value() + 1 - 2 * Number(value() >= top)),
    }),
  );
  for (const [index, next] of run.steps.entries()) {
    apply(next);
    const broken = Option.orElse(seeksHold(index), () =>
      Option.liftPredicate(next, (step) => step._tag === 'Tick').pipe(
        Option.flatMap(() => follows(index)),
      ),
    );
    if (Option.isSome(broken)) return broken;
  }
  return Option.orElse(seeksHold(run.steps.length - 1), () => follows(run.steps.length - 1));
};

const closing: ReadonlyArray<Step> = [
  { _tag: 'Tick', seconds: 0.25 },
  { _tag: 'Assist' },
  { _tag: 'Tick', seconds: 0.25 },
  { _tag: 'Play' },
  { _tag: 'Tick', seconds: 1 },
  { _tag: 'Tick', seconds: 1 },
  { _tag: 'Tick', seconds: 1 },
];

const weighted = <A,>(
  choices: readonly [readonly [number, A], ...ReadonlyArray<readonly [number, A]>],
) =>
  Effect.map(Random.nextBetween(0, 1), (drawn) => {
    const total = choices.reduce((sum, [weight]) => sum + weight, 0);
    let left = drawn * total;
    for (const [weight, choice] of choices) {
      if (left < weight) return choice;
      left -= weight;
    }
    return choices[0][1];
  });

const chance = (p: number) => Effect.map(Random.nextBetween(0, 1), (drawn) => drawn < p);

const tick = Effect.map(Random.nextBetween(0.05, 0.5), (seconds): Step => ({
  _tag: 'Tick',
  seconds,
}));

const ticks = Effect.gen(function* () {
  const count = yield* Random.nextIntBetween(0, 2);
  return yield* Effect.forEach(Array.from({ length: count }), () => tick);
});

interface Keys {
  held: Option.Option<StepKey>;
  readonly modifiers: Set<Modifier>;
  touch: number;
}

const touchId = (keys: Keys) => {
  keys.touch += 1;
  return keys.touch;
};

const keyUp = (key: StepKey) =>
  Effect.map(chance(0.25), (lost): Step => ({ _tag: 'KeyUp', key, lost }));

const keyed = (keys: Keys) =>
  Option.match(keys.held, {
    onSome: (key) =>
      Effect.gen(function* () {
        if (yield* chance(0.5)) return [{ _tag: 'KeyDown', key }] satisfies Array<Step>;
        keys.held = Option.none();
        return [yield* keyUp(key)];
      }),
    onNone: () =>
      Effect.gen(function* () {
        const key = yield* Random.choice(stepKeys);
        const repeat = yield* Random.nextIntBetween(1, 3);
        const downs = Array.from({ length: repeat }, (): Step => ({ _tag: 'KeyDown', key }));
        if (yield* chance(0.35)) {
          keys.held = Option.some(key);
          return downs;
        }
        return [...downs, yield* keyUp(key)];
      }),
  });

const free = (keys: Keys) => modifiers.filter((key) => !keys.modifiers.has(key));

const modifier = (keys: Keys) =>
  Option.match(
    Option.liftPredicate(free(keys), (left) => left.length > 0),
    {
      onNone: () => Effect.succeed<Array<Step>>([]),
      onSome: (left) =>
        Effect.map(Random.choice(left), (key): Array<Step> => [{ _tag: 'Modifier', key }]),
    },
  );

const holding = (keys: Keys) =>
  Effect.gen(function* () {
    const down = [...keys.modifiers];
    const lift = down.length > 0 && (down.length === modifiers.length || (yield* chance(0.5)));
    if (lift) {
      const key = yield* Random.choice(down);
      keys.modifiers.delete(key);
      return [{ _tag: 'Free', key }] satisfies Array<Step>;
    }
    const key = yield* Random.choice(free(keys));
    keys.modifiers.add(key);
    return [{ _tag: 'Hold', key }] satisfies Array<Step>;
  });

const press = (keys: Keys) =>
  Effect.gen(function* () {
    const pointer = yield* Random.choice(['mouse', 'touch'] as const);
    const id = Match.value(pointer).pipe(
      Match.when('mouse', () => mouseId),
      Match.orElse(() => touchId(keys)),
    );
    const count = yield* Random.nextIntBetween(0, 7);
    const run: Array<Step> = [{ _tag: 'Down', pointer, id }, ...(yield* ticks)];
    let second = Option.none<number>();
    let chord = Option.none<1 | 2>();
    let moved = false;
    for (const _ of Array.from({ length: count })) {
      const kind = yield* weighted([
        [0.35, 'move'],
        [0.2, 'key'],
        [0.06, 'modifier'],
        [0.07, 'hold'],
        [0.1, 'second'],
        [0.08, 'chord'],
        [0.07, 'play'],
        [0.07, 'halt'],
      ] as const);
      yield* Match.value(kind).pipe(
        Match.when('move', () =>
          Effect.map(Random.nextIntBetween(0, top), (to) => {
            moved = true;
            run.push({ _tag: 'Move', to });
          }),
        ),
        Match.when('key', () => Effect.map(keyed(keys), (steps) => void run.push(...steps))),
        Match.when('modifier', () =>
          Effect.map(modifier(keys), (steps) => void run.push(...steps)),
        ),
        Match.when('hold', () => Effect.map(holding(keys), (steps) => void run.push(...steps))),
        Match.when('second', () =>
          Option.match(second, {
            onNone: () =>
              Effect.sync(() => {
                const touch = touchId(keys);
                run.push({ _tag: 'Second', phase: 'down', id: touch });
                second = Option.some(touch);
              }),
            onSome: (touch) =>
              Effect.map(Random.choice(['up', 'cancel', 'lost'] as const), (phase) => {
                run.push({ _tag: 'Second', phase, id: touch });
                second = Option.none();
              }),
          }),
        ),
        Match.when('chord', () =>
          Match.value(pointer).pipe(
            Match.when('touch', () => Effect.void),
            Match.orElse(() =>
              Option.match(chord, {
                onSome: (button) =>
                  Effect.sync(() => {
                    run.push({ _tag: 'Chord', button, phase: 'up' });
                    chord = Option.none();
                  }),
                onNone: () =>
                  Effect.map(Random.choice([1, 2] as const), (button) => {
                    run.push({ _tag: 'Chord', button, phase: 'down' });
                    chord = Option.some(button);
                  }),
              }),
            ),
          ),
        ),
        Match.when('play', () => Effect.sync(() => void run.push({ _tag: 'Play' }))),
        Match.when('halt', () => Effect.sync(() => void run.push({ _tag: 'Halt' }))),
        Match.exhaustive,
      );
      run.push(...(yield* ticks));
    }
    if (Option.isSome(chord)) run.push({ _tag: 'Chord', button: chord.value, phase: 'up' });
    if (moved && (yield* chance(0.35))) run.push({ _tag: 'Move', to: 'back' }, ...(yield* ticks));
    const lastLifts = Option.isSome(second) && (yield* chance(0.5));
    const lifts = Option.map(second, (id): Step => ({ _tag: 'Second', phase: 'up', id }));
    if (!lastLifts) run.push(...Option.toArray(lifts));
    const ending = yield* weighted<Step>([
      [0.7, { _tag: 'Up' }],
      [0.15, { _tag: 'Cancel' }],
      [0.15, { _tag: 'Lost' }],
    ]);
    run.push(ending);
    if (ending._tag === 'Lost' && (yield* chance(0.5))) run.push({ _tag: 'Late' });
    if (lastLifts) run.push(...Option.toArray(lifts));
    run.push(...(yield* ticks));
    run.push({ _tag: 'Change', dropped: yield* chance(0.2) });
    return run;
  });

const otherPress = (keys: Keys) =>
  Effect.gen(function* () {
    const button = yield* Random.choice([1, 2] as const);
    const run: Array<Step> = [{ _tag: 'Other', button, phase: 'down' }, ...(yield* ticks)];
    const count = yield* Random.nextIntBetween(0, 3);
    for (const _ of Array.from({ length: count })) {
      const kind = yield* weighted([
        [0.4, 'key'],
        [0.3, 'assist'],
        [0.15, 'modifier'],
        [0.15, 'hold'],
      ] as const);
      run.push(
        ...(yield* Match.value(kind).pipe(
          Match.when('key', () => keyed(keys)),
          Match.when('assist', () => Effect.succeed<Array<Step>>([{ _tag: 'Assist' }])),
          Match.when('modifier', () => modifier(keys)),
          Match.when('hold', () => holding(keys)),
          Match.exhaustive,
        )),
        ...(yield* ticks),
      );
    }
    if (button === 1 || (yield* chance(0.5))) run.push({ _tag: 'Other', button, phase: 'up' });
    return run;
  });

const gesture = (keys: Keys) =>
  Effect.gen(function* () {
    const kind = yield* weighted([
      [0.42, 'press'],
      [0.1, 'other'],
      [0.15, 'key'],
      [0.06, 'assist'],
      [0.04, 'modifier'],
      [0.1, 'hold'],
      [0.08, 'play'],
      [0.05, 'halt'],
      [0.08, 'tick'],
    ] as const);
    return yield* Match.value(kind).pipe(
      Match.when('press', () => press(keys)),
      Match.when('other', () => otherPress(keys)),
      Match.when('key', () => keyed(keys)),
      Match.when('assist', () => Effect.succeed<Array<Step>>([{ _tag: 'Assist' }])),
      Match.when('modifier', () => modifier(keys)),
      Match.when('hold', () => holding(keys)),
      Match.when('play', () => Effect.succeed<Array<Step>>([{ _tag: 'Play' }])),
      Match.when('halt', () => Effect.succeed<Array<Step>>([{ _tag: 'Halt' }])),
      Match.when('tick', () => Effect.map(tick, (step) => [step])),
      Match.exhaustive,
    );
  });

const runOf = (seed: number): Run =>
  Effect.runSync(
    Effect.gen(function* () {
      const at = yield* Effect.flatten(
        weighted([
          [0.5, Random.nextBetween(0, length)],
          [0.2, Effect.succeed(0)],
          [0.3, Random.nextBetween(top, length)],
        ]),
      );
      const playing = yield* Random.nextBoolean;
      const count = yield* Random.nextIntBetween(1, 8);
      const keys: Keys = { held: Option.none(), modifiers: new Set(), touch: firstTouch - 1 };
      const run = new Array<Step>();
      for (const _ of Array.from({ length: count })) {
        run.push(...(yield* gesture(keys)), ...(yield* ticks));
      }
      if (Option.isSome(keys.held) && (yield* chance(0.5))) run.push(yield* keyUp(keys.held.value));
      return { at, playing, steps: [...run, ...closing] };
    }).pipe(Random.withSeed(seed)),
  );

const runs = 400;
const slice = 10;

describe('the web position bar under any run of input', () => {
  for (const from of Array.from({ length: runs / slice }, (_, i) => i * slice)) {
    test(`keeps its rules over seeded runs ${from} to ${from + slice - 1} of presses, keys, pointers and ticks`, () => {
      const broken = Array.from({ length: slice }, (_, i) => from + i)
        .map((seed) => Option.map(play(runOf(seed)), (line) => `seed ${seed}: ${line}`))
        .filter(Option.isSome);
      expect(broken.slice(0, 3).map((it) => it.value)).toEqual([]);
    });
  }

  const drag = (to: ReadonlyArray<number>): Array<Step> =>
    to.map((second): Step => ({ _tag: 'Move', to: second }));
  const playFor = (seconds: number): Array<Step> =>
    Array.from({ length: Math.round(seconds / 0.25) }, (): Step => ({
      _tag: 'Tick',
      seconds: 0.25,
    }));
  const tap = (key: StepKey): Array<Step> => [
    { _tag: 'KeyDown', key },
    { _tag: 'KeyUp', key, lost: false },
  ];

  test('r1 M1: a drag back from 2:31 to 0:05, a tick between the release and its change', () => {
    expect(
      play({
        at: 151.3,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'mouse', id: 1 },
          ...drag([120, 60, 5]),
          { _tag: 'Up' },
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Change', dropped: false },
          ...playFor(3),
          { _tag: 'Modifier', key: 'Shift' },
          ...playFor(1),
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r2 M1: paused at 0:34, a drag out to 1:20 and back, let go with no change, then play', () => {
    expect(
      play({
        at: 34.2,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'mouse', id: 1 },
          ...drag([35, 50, 80, 50]),
          { _tag: 'Move', to: 'back' },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          { _tag: 'Play' },
          ...playFor(9),
          ...tap('ArrowRight'),
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r2 M1: playing at 0:53, a nudge out and back, let go with no change', () => {
    expect(
      play({
        at: 53.4,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'mouse', id: 1 },
          ...drag([59]),
          { _tag: 'Move', to: 'back' },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...playFor(6),
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('a touch drag whose capture is lost before its release, then a change', () => {
    expect(
      play({
        at: 45,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'touch', id: 2 },
          ...drag([123, 210, 85]),
          { _tag: 'Lost' },
          { _tag: 'Change', dropped: false },
          ...playFor(2),
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r3 M1: paused at 1:00, ArrowRight with the mouse held on the thumb seeks at once', () => {
    expect(
      play({
        at: 60,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'mouse', id: 1 },
          ...tap('ArrowRight'),
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r3 M1: a touch moved to 0:24, ArrowLeft, then its capture lost: the step is sent', () => {
    expect(
      play({
        at: 100,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'touch', id: 2 },
          { _tag: 'Move', to: 24 },
          { _tag: 'Tick', seconds: 0.38 },
          ...tap('ArrowLeft'),
          { _tag: 'Lost' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('r3 m3: a second pointer down and up ends nothing; the first one’s release sends', () => {
    expect(
      play({
        at: 30,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'touch', id: 2 },
          { _tag: 'Move', to: 75 },
          { _tag: 'Second', phase: 'down', id: 3 },
          { _tag: 'Second', phase: 'up', id: 3 },
          { _tag: 'Move', to: 80 },
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('a drag with Shift held is a drag: nothing is sent until the release', () => {
    expect(
      play({
        at: 30,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'mouse', id: 1 },
          { _tag: 'Hold', key: 'Shift' },
          ...drag([90, 120]),
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Free', key: 'Shift' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r1 M3 (C3a): paused at the end, ArrowRight held while the mouse drags back to 1:40, then 1:30', () => {
    expect(
      play({
        at: 239.5,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'mouse', id: 1 },
          { _tag: 'KeyDown', key: 'ArrowRight' },
          ...drag([100, 90]),
          { _tag: 'KeyUp', key: 'ArrowRight', lost: false },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r1 M3 (C3b): End at the end, its keyup lost to a focus move; later a touch moves to 0:50 and cancels', () => {
    expect(
      play({
        at: 239.5,
        playing: false,
        steps: [
          { _tag: 'KeyDown', key: 'End' },
          { _tag: 'KeyUp', key: 'End', lost: true },
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Down', pointer: 'touch', id: 2 },
          ...drag([50]),
          { _tag: 'Cancel' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r1 M3 (C3c): Home at 0:00 with no keyup; later a mouse drag to 2:00 and back to the start', () => {
    expect(
      play({
        at: 0,
        playing: false,
        steps: [
          { _tag: 'KeyDown', key: 'Home' },
          { _tag: 'Down', pointer: 'mouse', id: 1 },
          ...drag([120, 0]),
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r1 M3 (wide seed 86): End held across a touch press, repeated, then a move', () => {
    expect(
      play({
        at: 239.5,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'touch', id: 2 },
          { _tag: 'KeyDown', key: 'End' },
          { _tag: 'Tick', seconds: 0.18 },
          { _tag: 'KeyDown', key: 'End' },
          ...drag([23]),
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r2 M3: ArrowRight held for three repeats inside a mouse press: three steps sent at once', () => {
    expect(
      play({
        at: 60,
        playing: false,
        steps: [
          { _tag: 'Down', pointer: 'mouse', id: 1 },
          { _tag: 'KeyDown', key: 'ArrowRight' },
          { _tag: 'KeyDown', key: 'ArrowRight' },
          { _tag: 'KeyDown', key: 'ArrowRight' },
          { _tag: 'KeyUp', key: 'ArrowRight', lost: false },
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r2 M3: Shift held, then ArrowLeft inside a touch press: one step sent at once', () => {
    expect(
      play({
        at: 100,
        playing: true,
        steps: [
          { _tag: 'Down', pointer: 'touch', id: 2 },
          { _tag: 'Hold', key: 'Shift' },
          ...tap('ArrowLeft'),
          { _tag: 'Tick', seconds: 0.25 },
          { _tag: 'Up' },
          { _tag: 'Free', key: 'Shift' },
          { _tag: 'Change', dropped: false },
          ...closing,
        ],
      }),
    ).toEqual(Option.none());
  });

  test('playerfix r3 M3: Shift held from before the pointerdown, a mouse drag from 0:30 to 2:00: one seek, at the release', () => {
    const steps: Array<Step> = [
      { _tag: 'Hold', key: 'Shift' },
      { _tag: 'Down', pointer: 'mouse', id: 1 },
      ...drag([60, 90, 120]),
      { _tag: 'Tick', seconds: 0.25 },
      { _tag: 'Up' },
      { _tag: 'Change', dropped: false },
      { _tag: 'Free', key: 'Shift' },
    ];
    expect(play({ at: 30, playing: false, steps: [...steps, ...closing] })).toEqual(Option.none());
  });

  test('playerfix r3 M3: a touch press with Chromium’s id 2 drags from 0:30 to 2:00: one seek, at the release', () => {
    const steps: Array<Step> = [
      { _tag: 'Down', pointer: 'touch', id: 2 },
      ...drag([60, 90, 120]),
      { _tag: 'Tick', seconds: 0.25 },
      { _tag: 'Up' },
      { _tag: 'Change', dropped: false },
    ];
    expect(play({ at: 30, playing: false, steps: [...steps, ...closing] })).toEqual(Option.none());
  });

  for (const key of ['PageUp', 'PageDown', 'Home', 'End'] as const) {
    test(`playerfix r1 M3: ${key} inside a mouse drag at 1:40 seeks at once`, () => {
      expect(
        play({
          at: 60,
          playing: false,
          steps: [
            { _tag: 'Down', pointer: 'mouse', id: 1 },
            ...drag([100]),
            ...tap(key),
            { _tag: 'Tick', seconds: 0.25 },
            { _tag: 'Up' },
            { _tag: 'Change', dropped: false },
            ...closing,
          ],
        }),
      ).toEqual(Option.none());
    });
  }
});
