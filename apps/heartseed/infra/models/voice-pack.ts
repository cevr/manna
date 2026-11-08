/**
 * A voice's pack from its rows, as FluidInference's `voices/<name>.json`
 * holds them at the pinned revision: an object whose keys `"1"`…`"510"` are
 * rows of 256 numbers, each exactly an fp32. The pack the chain reads is
 * those rows in numeric order, each value a little-endian fp32: 510 × 256 ×
 * 4 = 522,240 bytes. Every other key (`"embedding"`, `"0"`, `"511"`, a name)
 * is ignored; anything else is refused, so a missing row is never filled
 * and a value is never rounded.
 */
import { Option, Schema } from 'effect';

const ROWS = 510;
const COLUMNS = 256;

/** The row keys in numeric order: `"1"`, `"2"`, …, `"510"`, never string order. */
const ROW_KEYS = Array.from({ length: ROWS }, (_, at) => String(at + 1));

/** A finite number that is exactly an fp32. */
const Cell = Schema.Number.check(
  Schema.isFinite(),
  Schema.makeFilter((value: number) => Math.fround(value) === value, {
    expected: 'a number that is exactly an fp32',
  }),
);

const Row = Schema.Array(Cell).check(Schema.isBetweenLength(COLUMNS, COLUMNS));

const Rows = Schema.fromJsonString(
  Schema.Struct(Object.fromEntries(ROW_KEYS.map((key) => [key, Row]))),
);

const decodeRows = Schema.decodeUnknownOption(Rows);

const utf8 = Option.liftThrowable((bytes: Uint8Array) =>
  new TextDecoder('utf-8', { fatal: true }).decode(bytes),
);

/** The pack of a voice's rows, or `None` when the bytes are not the rows the rule names. */
export const voicePackOf = (bytes: Uint8Array): Option.Option<Uint8Array> =>
  utf8(bytes).pipe(
    Option.flatMap(decodeRows),
    Option.map((rows) => {
      const out = new Uint8Array(ROWS * COLUMNS * 4);
      const view = new DataView(out.buffer);
      ROW_KEYS.forEach((key, row) => {
        (rows[key] ?? []).forEach((value, column) => {
          view.setFloat32((row * COLUMNS + column) * 4, value, true);
        });
      });
      return out;
    }),
  );
