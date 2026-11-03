import { Effect, Schema } from 'effect';

export class WebsterCompileError extends Schema.TaggedError<WebsterCompileError>()(
  'WebsterCompileError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

const delimiter = (char: string): boolean => char === ',' || char === '\r' || char === '\n';

const quotedField = Effect.fn('WebsterCompiler.quotedField')(function* (
  text: string,
  start: number,
) {
  let value = '';
  for (let index = start + 1; index < text.length; index++) {
    const char = text.charAt(index);
    if (char !== '"') {
      value += char;
      continue;
    }
    if (text.charAt(index + 1) === '"') {
      value += '"';
      index++;
      continue;
    }
    const end = index + 1;
    if (end < text.length && !delimiter(text.charAt(end)))
      return yield* WebsterCompileError.make({
        message: 'Unexpected text after closing CSV quote',
      });
    return { value, end };
  }
  return yield* WebsterCompileError.make({ message: 'Unterminated CSV quote' });
});

const readField = Effect.fn('WebsterCompiler.readField')(function* (text: string, start: number) {
  if (text.charAt(start) === '"') return yield* quotedField(text, start);
  let end = start;
  while (end < text.length && !delimiter(text.charAt(end))) {
    if (text.charAt(end) === '"')
      return yield* WebsterCompileError.make({ message: 'Quote inside unquoted CSV field' });
    end++;
  }
  return { value: text.slice(start, end), end };
});

/** RFC 4180 quoting, including CRLF, doubled quotes and embedded newlines. */
export const parseCsv = Effect.fn('WebsterCompiler.parseCsv')(function* (text: string) {
  const records: string[][] = [];
  let fields: string[] = [];
  let index = 0;
  while (index < text.length) {
    const field = yield* readField(text, index);
    fields.push(field.value);
    index = field.end;
    const separator = text.charAt(index++);
    if (separator === ',') {
      if (index === text.length) fields.push('');
      continue;
    }
    records.push(fields);
    fields = [];
    if (separator === '\r' && text.charAt(index) === '\n') index++;
  }
  if (fields.length > 0) records.push(fields);
  if (records.length === 0) return yield* WebsterCompileError.make({ message: 'CSV is empty' });
  return records;
});
