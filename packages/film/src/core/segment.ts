import { Option, Schema } from 'effect';

const FOLDERS: ReadonlySet<string> = new Set(['.', '..']);

const PROTOTYPE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const refusalOf = (name: string): Option.Option<string> => {
  if (name === '') return Option.some('a name is never empty');
  if (FOLDERS.has(name)) return Option.some(`"${name}" names a folder, never a name`);
  if (name.includes('/') || name.includes('\\'))
    return Option.some(`"${name}" holds a "/" or a "\\": a name is one path segment`);
  if (name === '__proto__')
    return Option.some(
      '"__proto__" sets an object\'s prototype in a literal, so a record never holds it',
    );
  if (PROTOTYPE_KEYS.has(name))
    return Option.some(
      `every object answers to "${name}" from its prototype, so a record keyed by it finds what it never held`,
    );
  return Option.none();
};

export const isSegment = (name: string): boolean => Option.isNone(refusalOf(name));

export const Segment = Schema.String.check(
  Schema.makeFilter((name: string) =>
    Option.match(refusalOf(name), { onNone: () => true, onSome: (why) => why }),
  ),
).pipe(Schema.brand('Segment'));
export type Segment = typeof Segment.Type;
