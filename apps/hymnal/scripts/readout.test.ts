/**
 * The verifier's readout (`scripts/readout.ts`, `readout/frames.ts`): it
 * gives frames, states and numerals of what is asked, on the screen only,
 * and never a word of a node the caller did not name; its press lands on
 * the shown Switch or Button; and its pace waits for a calm host, or fails
 * once the wait is spent.
 */
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Exit, Option, Ref, Schema } from 'effect';

import { type Node, nodesOf } from '@manna/sim/screen';

import { calm, pressTarget, readout } from './readout/frames.ts';

/** Words standing in for a hymn's: no readout may hold them. */
const WORDS = 'Alpha bravo charlie';

const NODES: ReadonlyArray<Node> = [
  { identifier: 'hymn-number', label: '33', rect: { x: -382, y: 140, width: 28, height: 26 } },
  { identifier: 'hymn-number', label: '34', rect: { x: 20, y: 140, width: 28, height: 26 } },
  {
    identifier: 'line',
    label: WORDS,
    rect: { x: 20, y: 300.04, width: 360, height: 30 },
    selected: true,
  },
  { identifier: 'line', label: WORDS, rect: { x: 422, y: 300, width: 360, height: 30 } },
  { identifier: 'chord-1-1-1', label: 'G', rect: { x: 24, y: 280, width: 12, height: 14 } },
  {
    type: 'Button',
    ref: 'e7',
    label: 'Play hymn 34',
    rect: { x: 346, y: 758, width: 44, height: 44 },
    enabled: true,
  },
  { type: 'StaticText', label: 'Play hymn 34', rect: { x: 346, y: 758, width: 44, height: 44 } },
  {
    type: 'Slider',
    label: 'Position',
    value: '12 seconds of 180',
    rect: { x: 20, y: 700, width: 360, height: 20 },
  },
  {
    type: 'Switch',
    ref: 'e9',
    label: 'Sounds and haptics',
    value: '0',
    rect: { x: 300, y: 200, width: 51, height: 31 },
  },
  {
    type: 'Other',
    ref: 'e10',
    label: 'Sounds and haptics',
    rect: { x: 0, y: 200, width: 402, height: 44 },
  },
  {
    type: 'Cell',
    label: 'Sound',
    value: 'unchecked',
    rect: { x: 0, y: 260, width: 402, height: 44 },
  },
];

const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** A readout as `readout.ts` prints it: its JSON line, read back. */
const printed = (value: ReturnType<typeof readout>) =>
  Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(encode(value));

const ASK = { ids: ['line', 'chord-*', 'absent'], labels: ['Play hymn 34'], width: 402 };

describe('readout', () => {
  test('reads the asked ids on the screen, the named chrome, the switches, the page and the bar', () => {
    expect(printed(readout(NODES, ASK))).toEqual({
      nodes: 11,
      ids: {
        line: [{ id: 'line', frame: [20, 300, 360, 30], selected: true, value: [] }],
        'chord-*': [{ id: 'chord-1-1-1', frame: [24, 280, 12, 14], value: [] }],
        absent: [],
      },
      labels: {
        'Play hymn 34': [{ type: 'Button', frame: [346, 758, 44, 44], enabled: true, value: [] }],
      },
      silent: { Sound: 'unchecked', 'Sounds and haptics': '0', Chords: 'absent' },
      page: [34],
      play: [{ state: 'idle', hymn: 34 }],
      position: [12, 180],
    });
  });

  test('holds no word of a node the caller did not name', () => {
    const text = encode(readout(NODES, { ids: ['line', 'hymn-number'], labels: [], width: 402 }));
    for (const word of WORDS.split(' ')) expect(text).not.toContain(word);
  });

  test('reads Pause as playing and an ended hymn as ended', () => {
    const nodes: ReadonlyArray<Node> = [
      { type: 'Button', label: 'Pause hymn 100' },
      { type: 'Button', label: 'Play hymn 101 again' },
    ];
    expect(readout(nodes, { ids: [], labels: [], width: 402 }).play).toEqual([
      { state: 'playing', hymn: 100 },
      { state: 'ended', hymn: 101 },
    ]);
  });

  it.effect('decodes the nodes of a raw snapshot', () =>
    Effect.gen(function* () {
      const nodes = yield* nodesOf(encode({ success: true, data: { nodes: NODES } }));
      expect(nodes.length).toBe(NODES.length);
    }),
  );
});

describe('pressTarget', () => {
  test('lands on the shown Switch before another node of that name, and on a Button before a text', () => {
    const refOf = (target: string) =>
      Option.match(pressTarget(NODES, target, 402), {
        onNone: () => 'none',
        onSome: (node) => String(node.ref),
      });
    expect([refOf('label=Sounds and haptics'), refOf('label=Play hymn 34')]).toEqual(['e9', 'e7']);
  });

  test('takes a Switch over a Button of its name, a Button over any other node, whatever their order', () => {
    const row = { x: 0, y: 200, width: 402, height: 44 };
    const named = (type: string, ref: string, label: string): Node => ({
      type,
      ref,
      label,
      rect: row,
    });
    const nodes: ReadonlyArray<Node> = [
      named('Other', 'a1', 'Sounds and haptics'),
      named('Button', 'a2', 'Sounds and haptics'),
      named('Switch', 'a3', 'Sounds and haptics'),
      named('Cell', 'b1', 'Open player'),
      named('Other', 'b2', 'Open player'),
      named('Button', 'b3', 'Open player'),
      named('Cell', 'c1', 'Done'),
      named('Other', 'c2', 'Done'),
    ];
    const refOf = (target: string) =>
      Option.match(pressTarget(nodes, target, 402), {
        onNone: () => 'none',
        onSome: (node) => String(node.ref),
      });
    expect(['label=Sounds and haptics', 'label=Open player', 'label=Done'].map(refOf)).toEqual([
      'a3',
      'b3',
      'c1',
    ]);
  });

  test('finds nothing for an id off the screen or a node with no ref', () => {
    expect(Option.isNone(pressTarget(NODES, 'id=hymn-number', 402))).toBe(true);
    expect(Option.isNone(pressTarget(NODES, 'label=Sound', 402))).toBe(true);
  });
});

describe('calm', () => {
  it.live('waits until the load falls to the limit, and answers it', () =>
    Effect.gen(function* () {
      const loads = yield* Ref.make([20, 14, 12, 3]);
      const read = Ref.modify(loads, ([head = 0, ...rest]) => [head, rest]);
      const load = yield* calm(read, 12, Duration.millis(1), Duration.seconds(5));
      expect({ load, left: yield* Ref.get(loads) }).toEqual({ load: 12, left: [3] });
    }),
  );

  it.live('fails as HostBusy, with the last load, once the wait is spent', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        calm(Effect.succeed(30), 12, Duration.millis(1), Duration.millis(5)),
      );
      expect(Exit.isFailure(exit) && String(exit.cause)).toContain('HostBusy');
    }),
  );
});
