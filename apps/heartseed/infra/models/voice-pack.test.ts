/**
 * A voice's rows become its pack, as a seeded property over packs written
 * by a hand encoder here: rows `"1"`…`"510"` in numeric order, each value a
 * little-endian fp32, whatever the JSON's spacing, key order or number
 * style, and whatever other keys it holds. Then every form the rule
 * refuses: a missing row, a row of another length, a cell that is not
 * exactly an fp32 or not a number, a top level that is not an object, text
 * that is not JSON or not UTF-8.
 */
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { voicePackOf } from './voice-pack.ts';

const ROWS = 510;
const COLUMNS = 256;

const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
type Next = ReturnType<typeof random>;
const below = (next: Next, n: number) => Math.floor(next() * n);

/** The extremes an fp32 holds: ±0, ±the least subnormal, the least normal, ±the greatest finite. */
const EXTREMES = [
  0, -0, 1.401298464324817e-45, -1.401298464324817e-45, 1.1754943508222875e-38,
  3.4028234663852886e38, -3.4028234663852886e38,
];

/** Small values, so a pack is short text; an extreme now and then. */
const valuesOf = (next: Next) =>
  Float32Array.from({ length: ROWS * COLUMNS }, () => {
    if (next() < 0.002) return Number(EXTREMES[below(next, EXTREMES.length)]);
    return (below(next, 64) - 32) / 16;
  });

/** The rule's pack, by hand: each value's fp32 bits as four bytes, the lowest first. */
const packOf = (values: Float32Array) => {
  const bits = new Uint32Array(values.buffer.slice(0));
  const out = new Uint8Array(values.length * 4);
  bits.forEach((word, at) => {
    out[at * 4] = word & 0xff;
    out[at * 4 + 1] = (word >>> 8) & 0xff;
    out[at * 4 + 2] = (word >>> 16) & 0xff;
    out[at * 4 + 3] = word >>> 24;
  });
  return out;
};

/** A number as Python's json writes it (`1.0`, `1e-05`) or as JavaScript does; -0 keeps its sign. */
const numberText = (value: number, python: boolean) => {
  if (Object.is(value, -0)) return '-0.0';
  const text = String(value);
  if (!python) return text;
  if (/^-?\d+$/.test(text)) return `${text}.0`;
  return text.replace(/e([+-])(\d)$/, 'e$10$2');
};

/** Each row's cells as text. */
const cellsOf = (values: Float32Array, python: boolean) =>
  Array.from({ length: ROWS }, (_, row) =>
    Array.from(values.subarray(row * COLUMNS, (row + 1) * COLUMNS), (value) =>
      numberText(value, python),
    ),
  );

/** How the text is spaced: Python's `json.dump` default or compact. */
const SPACED = { comma: ', ', colon: ': ' };
const COMPACT = { comma: ',', colon: ':' };

interface Style {
  readonly comma: string;
  readonly colon: string;
  readonly extras: ReadonlyArray<readonly [string, string]>;
}

/** The rows as `voices/<name>.json` holds them, with the extras, keys shuffled. */
const rowsText = (next: Next, rows: ReadonlyArray<ReadonlyArray<string>>, style: Style) => {
  const { comma, colon } = style;
  const entries = [
    ...style.extras,
    ...rows.map((cells, row) => [String(row + 1), `[${cells.join(comma)}]`] as const),
  ];
  for (let i = entries.length - 1; i > 0; i--) {
    const j = below(next, i + 1);
    [entries[i], entries[j]] = [entries[j] || ['', ''], entries[i] || ['', '']];
  }
  return `{${entries.map(([key, value]) => `"${key}"${colon}${value}`).join(comma)}}`;
};

/** The rows in order, row `row` changed by `change` or dropped when it answers `None`. */
const changedText = (
  rows: ReadonlyArray<ReadonlyArray<string>>,
  row: number,
  change: (cells: ReadonlyArray<string>) => Option.Option<ReadonlyArray<string>>,
) =>
  `{${rows
    .flatMap((cells, at) => {
      if (at + 1 !== row) return [`"${at + 1}":[${cells.join(',')}]`];
      return Option.match(change(cells), {
        onNone: () => [],
        onSome: (written) => [`"${at + 1}":[${written.join(',')}]`],
      });
    })
    .join(',')}}`;

const encode = (text: string) => new TextEncoder().encode(text);

describe('a voice’s pack from its rows', () => {
  it('is the rows in numeric order as little-endian fp32, whatever the text’s style or its other keys, over seeded packs', () => {
    const next = random(5_152);
    const extras: ReadonlyArray<readonly [string, string]> = [
      ['embedding', '[0.5, 0.25]'],
      ['0', '[1.0]'],
      ['511', '[2.0, 3.0]'],
      ['name', '"bm_george"'],
    ];
    for (const [i, spacing] of [SPACED, SPACED, COMPACT, COMPACT].entries()) {
      const values = valuesOf(next);
      const text = rowsText(next, cellsOf(values, i % 2 === 0), {
        ...spacing,
        extras: extras.filter(() => next() < 0.6),
      });
      const got = voicePackOf(encode(text));
      expect(Option.isSome(got), `pack ${i}`).toBe(true);
      expect(Option.getOrThrow(got), `pack ${i}`).toEqual(packOf(values));
    }
  });

  it('keeps -0’s sign and writes each extreme exactly', () => {
    const values = new Float32Array(ROWS * COLUMNS);
    EXTREMES.forEach((value, at) => {
      values[at] = value;
      values[values.length - 1 - at] = value;
    });
    values[COLUMNS] = 16_777_216;
    const text = rowsText(random(1), cellsOf(values, true), { ...COMPACT, extras: [] });
    const got = Option.getOrThrow(voicePackOf(encode(text)));
    expect(got.byteLength).toBe(522_240);
    expect([...got.subarray(4, 8)]).toEqual([0, 0, 0, 0x80]);
    expect([...got.subarray(20, 24)]).toEqual([0xff, 0xff, 0x7f, 0x7f]);
    expect(got).toEqual(packOf(values));
  });

  it('refuses a missing row, a row of another length, and any cell that is not exactly an fp32 number', () => {
    const next = random(77);
    const values = valuesOf(next);
    const rows = cellsOf(values, true);
    const at = 1 + below(next, ROWS);
    const cell = below(next, COLUMNS);
    const same = changedText(rows, at, Option.some);
    expect(Option.getOrThrow(voicePackOf(encode(same)))).toEqual(packOf(values));
    const dropped = (row: number) => changedText(rows, row, () => Option.none());
    const withCell = (text: string) =>
      changedText(rows, at, (cells) =>
        Option.some(cells.map((value, column) => (column === cell && text) || value)),
      );
    const refused: ReadonlyArray<readonly [string, string]> = [
      ['row 1 missing', dropped(1)],
      ['row 510 missing', dropped(510)],
      [`row ${at} missing`, dropped(at)],
      ['a row of 255', changedText(rows, at, (cells) => Option.some(cells.slice(1)))],
      ['a row of 257', changedText(rows, at, (cells) => Option.some([...cells, '0.5']))],
      ...[
        '0.1',
        '1e39',
        '-1e39',
        '1e-50',
        '1e400',
        '16777217',
        '"0.5"',
        'null',
        'true',
        '[0.5]',
        '{}',
      ].map((text) => [`a cell ${text}`, withCell(text)] as const),
    ];
    for (const [name, text] of refused)
      expect(Option.isNone(voicePackOf(encode(text))), name).toBe(true);
  });

  it('refuses a top level that is not an object, text that is not whole JSON, and bytes that are not UTF-8', () => {
    const rows = cellsOf(valuesOf(random(4)), true);
    const whole = rowsText(random(3), rows, { ...COMPACT, extras: [] });
    const named = encode(rowsText(random(5), rows, { ...COMPACT, extras: [['name', '"~"']] }));
    expect(Option.isSome(voicePackOf(named))).toBe(true);
    const notUtf8 = named.map((byte) => (byte === 0x7e && 0xff) || byte);
    const refused: ReadonlyArray<readonly [string, Uint8Array]> = [
      ['an array', encode('[[0.5]]')],
      ['a number', encode('42')],
      ['a string', encode('"rows"')],
      ['null', encode('null')],
      ['an empty object', encode('{}')],
      ['cut in half', encode(whole.slice(0, whole.length / 2))],
      ['no bytes', new Uint8Array()],
      ['not UTF-8 inside a string', notUtf8],
    ];
    for (const [name, bytes] of refused) expect(Option.isNone(voicePackOf(bytes)), name).toBe(true);
  });
});
