import {
  Array as Arr,
  Effect,
  Match,
  Option,
  Result,
  Schema,
  SchemaIssue,
  SchemaTransformation,
} from 'effect';
import { type LineRead, type Mark, marksRefusal } from './delivery.ts';
import { parse, withDelivery } from './narration.ts';

const Said = Schema.Struct({
  text: Schema.String,
  start: Schema.Int,
  end: Schema.Int,
});
type Said = typeof Said.Type;

const DraftBeat = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  say: Schema.Option(Said),
  brief: Schema.Option(Schema.String),
  cite: Schema.Array(Schema.String),
});
type DraftBeat = typeof DraftBeat.Type;

export const Draft = Schema.Struct({
  markdown: Schema.String,
  title: Schema.String,
  beats: Schema.Array(DraftBeat),
});
export type Draft = typeof Draft.Type;

interface Unread {
  readonly beat: Option.Option<string>;
  readonly reason: string;
}

const unread = (reason: string, beat: Option.Option<string> = Option.none()): Unread => ({
  beat,
  reason,
});

export const unreadText = (u: Unread): string =>
  Option.match(u.beat, { onNone: () => u.reason, onSome: (beat) => `beat ${beat}: ${u.reason}` });

interface Row {
  readonly text: string;
  readonly at: number;
}

const rowsOf = (markdown: string): ReadonlyArray<Row> =>
  markdown.split('\n').reduce<{ readonly rows: ReadonlyArray<Row>; readonly at: number }>(
    (acc, line) => ({
      rows: [...acc.rows, { text: line.replace(/\r$/, ''), at: acc.at }],
      at: acc.at + line.length + 1,
    }),
    { rows: [], at: 0 },
  ).rows;

const titleOf = (rows: ReadonlyArray<Row>): string =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(rows, (r) => r.text.startsWith('# ')),
      (r) => r.text.slice(2).trim(),
    ),
    () => '',
  );

interface Cell {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const cellsOf = (row: Row): ReadonlyArray<Cell> => {
  const bars = [...row.text.matchAll(/(?<!\\)\|/g)].map((m) => m.index);
  return bars.slice(0, -1).map((bar, i) => {
    const raw = row.text.slice(bar + 1, bars[i + 1]);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    const start = row.at + bar + 1 + lead;
    return { text, start, end: start + text.length };
  });
};

const matchOf = (pattern: RegExp, text: string) => Option.fromNullishOr(pattern.exec(text));

const isTableRow = (row: Row) => row.text.trimStart().startsWith('|');

const cellRead = (text: string) => text.replaceAll('\\|', '|');

const cellWritten = (text: string) => text.replaceAll('|', '\\|');

const COLUMNS = {
  id: /^#$/,
  say: /^(say|spoken)\b/i,
  brief: /^(picture|on screen)\b/i,
  cite: /^source\b/i,
} as const;

const scriptHeader = (cells: ReadonlyArray<Cell>) =>
  cells.some((c) => COLUMNS.id.test(c.text)) && cells.some((c) => COLUMNS.say.test(c.text));

const columnOf = (cells: ReadonlyArray<Cell>, pattern: RegExp) =>
  Arr.findFirstIndex(cells, (c) => pattern.test(c.text));

const cellAt = (cells: ReadonlyArray<Cell>, column: Option.Option<number>) =>
  Option.filter(
    Option.flatMap(column, (i) => Arr.get(cells, i)),
    (c) => c.text.length > 0,
  );

const tableBeats = (
  rows: ReadonlyArray<Row>,
): Option.Option<Result.Result<ReadonlyArray<DraftBeat>, Unread>> =>
  Option.map(
    Arr.findFirstIndex(rows, (r) => isTableRow(r) && scriptHeader(cellsOf(r))),
    (head) => {
      const header = Option.match(Arr.get(rows, head), { onNone: () => [], onSome: cellsOf });
      const headers = rows.filter((r) => isTableRow(r) && scriptHeader(cellsOf(r))).length;
      if (headers > 1)
        return Result.fail(unread(`it has ${headers} script tables: keep the beats in one`));
      const named = Arr.findFirst(
        Object.entries(COLUMNS),
        ([, pattern]) => header.filter((c) => pattern.test(c.text)).length > 1,
      );
      if (Option.isSome(named))
        return Result.fail(unread(`its table names its ${named.value[0]} column twice: keep one`));
      const column = {
        id: columnOf(header, COLUMNS.id),
        say: columnOf(header, COLUMNS.say),
        brief: columnOf(header, COLUMNS.brief),
        cite: columnOf(header, COLUMNS.cite),
      };
      const body = Arr.takeWhile(rows.slice(head + 2), isTableRow);
      return Result.all(body.map((row) => tableBeat(cellsOf(row), column)));
    },
  );

const tableBeat = (
  cells: ReadonlyArray<Cell>,
  column: Readonly<Record<keyof typeof COLUMNS, Option.Option<number>>>,
): Result.Result<DraftBeat, Unread> => {
  const number = Option.getOrElse(
    Option.map(cellAt(cells, column.id), (c) => c.text),
    () => '',
  );
  const matched = matchOf(/^(\d+)\s*(?:·\s*(.*))?$/, number);
  if (Option.isNone(matched))
    return Result.fail(unread(`a row's # reads "${number}", not a beat's number`));
  const found = matched.value;
  const id = found[1] ?? '';
  return Result.map(
    lineOf(
      id,
      Option.map(cellAt(cells, column.say), (c) => ({
        text: cellRead(c.text),
        start: c.start,
        end: c.end,
      })),
    ),
    (say): DraftBeat => ({
      id,
      label: (found[2] ?? '').trim(),
      say,
      brief: Option.map(cellAt(cells, column.brief), (c) => cellRead(c.text)),
      cite: Option.toArray(Option.map(cellAt(cells, column.cite), (c) => cellRead(c.text))),
    }),
  );
};

const listBeats = (rows: ReadonlyArray<Row>): Result.Result<ReadonlyArray<DraftBeat>, Unread> => {
  const heads = rows.flatMap((row, i) =>
    Option.toArray(
      Option.map(matchOf(/^### `([^`]+)`\s*(?:·\s*(.*))?$/, row.text), (found) => ({
        i,
        id: found[1] ?? '',
        label: (found[2] ?? '').trim(),
      })),
    ),
  );
  return Result.all(
    heads.map((head) => {
      const lines = Arr.takeWhile(rows.slice(head.i + 1), (r) => !r.text.startsWith('#'));
      const field = (name: string) =>
        Option.map(
          Arr.findFirst(lines, (r) => r.text.startsWith(`**${name}:** `)),
          (r) => {
            const lead = `**${name}:** `.length;
            const text = r.text.slice(lead).trimEnd();
            return { text, start: r.at + lead, end: r.at + lead + text.length };
          },
        );
      const sayAt = Arr.findFirstIndex(lines, (r) => r.text.startsWith('**say:** '));
      const carried = Option.flatMap(sayAt, (i) =>
        Option.filter(
          Arr.get(lines, i + 1),
          (next) => next.text.trim().length > 0 && !/^\*\*[^*]+:\*\*/.test(next.text),
        ),
      );
      if (Option.isSome(carried))
        return Result.fail(
          unread('its say runs onto a second line: keep the line on one', Option.some(head.id)),
        );
      return Result.map(lineOf(head.id, field('say')), (say): DraftBeat => ({
        id: head.id,
        label: head.label,
        say,
        brief: Option.map(field('picture'), (f) => f.text),
        cite: Option.getOrElse(
          Option.map(field('cite'), (f) => f.text.split(/;\s+/).filter((s) => s.length > 0)),
          () => [],
        ),
      }));
    }),
  );
};

const EMPHASIS = /(?:^|[\s"“(])(_[^_\s][^_]*_|\*[^*\s{}][^*{}]*\*)(?=$|[\s.,;:!?"”)])/;

const DIRECTION = /\(\s*\d+(?:\.\d+)?\s*s\b[^)]*\)/;

const lineOf = (
  beat: string,
  said: Option.Option<Said>,
): Result.Result<Option.Option<Said>, Unread> => {
  if (Option.isNone(said)) return Result.succeed(said);
  const text = said.value.text;
  const outside = text.replace(/\{[^}]*\}/g, ' ');
  const emphasis = matchOf(EMPHASIS, outside);
  if (Option.isSome(emphasis))
    return Result.fail(
      unread(
        `stresses ${emphasis.value[1]} the Markdown way: write {*} before the word`,
        Option.some(beat),
      ),
    );
  const direction = matchOf(DIRECTION, outside);
  if (Option.isSome(direction))
    return Result.fail(
      unread(
        `writes the pause ${direction.value[0]} as a direction: write {//} in its gap`,
        Option.some(beat),
      ),
    );
  return Result.match(parse(beat, text), {
    onFailure: (e) => Result.fail(unread(e.message, Option.some(beat))),
    onSuccess: () => Result.succeed(said),
  });
};

const twice = (beats: ReadonlyArray<DraftBeat>) =>
  Arr.findFirst(beats, (b, i) => beats.findIndex((o) => o.id === b.id) !== i);

const readDraft = (markdown: string): Result.Result<Draft, Unread> => {
  const rows = rowsOf(markdown);
  const beats = Option.getOrElse(tableBeats(rows), () => listBeats(rows));
  return Result.flatMap(beats, (found) => {
    if (found.length === 0)
      return Result.fail(
        unread('it has no beats: no table with a # and a Say column, and no ### `beat` headings'),
      );
    return Option.match(twice(found), {
      onSome: (b) => Result.fail(unread('names two beats alike', Option.some(b.id))),
      onNone: () => Result.succeed({ markdown, title: titleOf(rows), beats: found }),
    });
  });
};

const inCell = (markdown: string, said: Said): boolean => {
  const lineStart = markdown.lastIndexOf('\n', said.start - 1) + 1;
  return markdown.slice(lineStart, said.start).trimStart().startsWith('|');
};

const writeDraft = (draft: Draft): string =>
  draft.beats
    .flatMap((b) => Option.toArray(b.say))
    .toSorted((a, b) => b.start - a.start)
    .reduce((text, said) => {
      const written = Match.value(inCell(draft.markdown, said)).pipe(
        Match.when(true, () => cellWritten(said.text)),
        Match.orElse(() => said.text),
      );
      return `${text.slice(0, said.start)}${written}${text.slice(said.end)}`;
    }, draft.markdown);

export const DraftMarkdown = Schema.String.pipe(
  Schema.decodeTo(
    Draft,
    SchemaTransformation.transformEffect({
      decode: (markdown: string) =>
        Effect.mapError(
          Effect.fromResult(readDraft(markdown)),
          (u) => new SchemaIssue.InvalidValue({ message: unreadText(u) }, markdown),
        ),
      encode: (draft: Draft) => Effect.succeed(writeDraft(draft)),
    }),
  ),
);

const lineIn = (draft: Draft, beat: string) =>
  Option.flatMap(
    Option.flatMap(
      Arr.findFirst(draft.beats, (b) => b.id === beat),
      (b) => b.say,
    ),
    (said) => Result.getSuccess(parse(beat, said.text)),
  );

export const draftMissed = (
  after: string,
  before: string,
  beat: string,
  marks: ReadonlyArray<Mark>,
): ReadonlyArray<string> => {
  const was = readDraft(before);
  const now = readDraft(after);
  if (Result.isFailure(now)) return [`the draft no longer reads: ${unreadText(now.failure)}`];
  if (Result.isFailure(was)) return [`the draft did not read: ${unreadText(was.failure)}`];
  const line = (draft: Draft, id: string) =>
    Option.getOrElse(
      Option.map(lineIn(draft, id), (l) => withDelivery(l.spoken, l.delivery)),
      () => '',
    );
  const others = was.success.beats.filter(
    (b) => b.id !== beat && line(was.success, b.id) !== line(now.success, b.id),
  );
  return Option.match(
    Option.zipWith(lineIn(was.success, beat), lineIn(now.success, beat), (a, b) => ({ a, b })),
    {
      onNone: () => [`beat ${beat} says nothing now`],
      onSome: ({ a, b }) => [
        ...Arr.filter([`beat ${beat} no longer says what it said`], () => a.spoken !== b.spoken),
        ...Arr.filter(
          [
            `beat ${beat} reads “${withDelivery(a.spoken, b.delivery)}”, not “${withDelivery(a.spoken, marks)}”`,
          ],
          () => withDelivery(a.spoken, b.delivery) !== withDelivery(a.spoken, marks),
        ),
        ...others.map((o) => `beat ${o.id} changed too`),
      ],
    },
  );
};

export const draftMarked = (
  markdown: string,
  beat: string,
  marks: ReadonlyArray<Mark>,
  read: Option.Option<LineRead>,
): Result.Result<string, Unread> =>
  Result.flatMap(readDraft(markdown), (draft) => {
    const found = Arr.findFirst(draft.beats, (b) => b.id === beat);
    if (Option.isNone(found))
      return Result.fail(unread('the draft has no such beat', Option.some(beat)));
    if (Option.isNone(found.value.say))
      return Result.fail(unread('says nothing to mark', Option.some(beat)));
    const said = found.value.say.value;
    const now = Option.getOrElse(
      Option.map(lineIn(draft, beat), (l): LineRead => ({ spoken: l.spoken, marks: l.delivery })),
      (): LineRead => ({ spoken: '', marks: [] }),
    );
    const refused = marksRefusal(marks, now, read);
    if (Option.isSome(refused)) return Result.fail(unread(refused.value, Option.some(beat)));
    const remarked = Option.some({ ...said, text: withDelivery(said.text, marks) });
    const marked: Draft = {
      ...draft,
      beats: draft.beats.map((b): DraftBeat =>
        Match.value(b.id).pipe(
          Match.when(beat, () => ({ ...b, say: remarked })),
          Match.orElse(() => b),
        ),
      ),
    };
    const written = writeDraft(marked);
    return Result.map(readDraft(written), () => written);
  });
