import { Array as Arr, Option, Predicate, Result } from 'effect';
import type { ObjectExpression, Program } from 'oxc-parser';
import type { SourceRefused } from '../core/refusals.ts';
import {
  declarations,
  keyName,
  objectOf,
  parseModule,
  propertyOf,
  refuse,
  spliced,
  stringText,
  textOf,
  valueOf,
} from './scene-source.ts';

const exportedObject = (
  file: string,
  program: Program,
  name: string,
  target: string,
): Result.Result<ObjectExpression, SourceRefused> => {
  const found = declarations(program)
    .filter(({ exported }) => exported)
    .flatMap(({ decl }) => decl.declarations)
    .find((d) => d.id.type === 'Identifier' && d.id.name === name);
  const init = Option.flatMap(Option.fromUndefinedOr(found), (d) => Option.fromNullishOr(d.init));
  return Option.match(Option.flatMap(init, objectOf), {
    onNone: () => refuse(file, target, `it exports no \`${name}\` object literal`),
    onSome: (obj) => Result.succeed(obj),
  });
};

const objectAt = (
  file: string,
  target: string,
  obj: ObjectExpression,
  path: ReadonlyArray<string>,
): Result.Result<ObjectExpression, SourceRefused> => {
  const root: Result.Result<ObjectExpression, SourceRefused> = Result.succeed(obj);
  return Arr.reduce(path, root, (at, key) =>
    Result.flatMap(at, (o) =>
      Result.flatMap(propertyOf(file, target, o, key), (prop) =>
        Option.match(Option.flatMap(Option.flatMap(prop, valueOf), objectOf), {
          onNone: () =>
            refuse<ObjectExpression>(file, target, `its \`${key}\` is not an object literal`),
          onSome: (inner) => Result.succeed(inner),
        }),
      ),
    ),
  );
};

interface PickSite {
  readonly exported: string;
  readonly path: ReadonlyArray<string>;
  readonly target: string;
}

export const SCORE_PLAY: PickSite = { exported: 'sound', path: ['score'], target: 'score play' };

export const lookPlay = (look: string): PickSite => ({
  exported: 'looks',
  path: [look],
  target: `look ${look} play`,
});

interface PlayLiteral {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

const playLiteral = (
  file: string,
  source: string,
  site: PickSite,
): Result.Result<PlayLiteral, SourceRefused> =>
  Result.flatMap(parseModule(file, source), (program) =>
    Result.flatMap(exportedObject(file, program, site.exported, site.target), (root) =>
      Result.flatMap(objectAt(file, site.target, root, site.path), (obj) =>
        Result.flatMap(propertyOf(file, site.target, obj, 'play'), (play) => {
          const value = Option.flatMap(play, valueOf);
          if (Option.isNone(value)) return refuse(file, site.target, 'it names no `play`');
          const e = value.value;
          if (e.type !== 'Literal' || !Predicate.isString(e.value))
            return refuse(file, site.target, `it is \`${textOf(source, e)}\`, not a string`);
          return Result.succeed({ start: e.start, end: e.end, value: e.value });
        }),
      ),
    ),
  );

export const readPick = (
  file: string,
  source: string,
  site: PickSite,
): Result.Result<string, SourceRefused> =>
  Result.map(playLiteral(file, source, site), (literal) => literal.value);

export const editPick = (
  file: string,
  source: string,
  site: PickSite,
  option: string,
): Result.Result<string, SourceRefused> =>
  Result.flatMap(playLiteral(file, source, site), (literal) =>
    spliced(file, source, [{ start: literal.start, end: literal.end, text: stringText(option) }]),
  );

const keysOf = (
  file: string,
  target: string,
  obj: ObjectExpression,
): Result.Result<ReadonlyArray<string>, SourceRefused> =>
  Result.all(
    obj.properties.map((p) => {
      if (p.type === 'SpreadElement')
        return refuse<string>(
          file,
          target,
          'its object has a spread, so its keys are not provable',
        );
      return Option.match(keyName(p), {
        onNone: () =>
          refuse<string>(
            file,
            target,
            'its object has a computed key, so its keys are not provable',
          ),
        onSome: (name) => Result.succeed(name),
      });
    }),
  );

export const lookLevels = (
  file: string,
  source: string,
): Result.Result<ReadonlyMap<string, ReadonlyArray<string>>, SourceRefused> =>
  Result.flatMap(parseModule(file, source), (program) => {
    const target = 'looks';
    const declared = declarations(program)
      .filter(({ exported }) => exported)
      .flatMap(({ decl }) => decl.declarations)
      .some((d) => d.id.type === 'Identifier' && d.id.name === target);
    if (!declared) return Result.succeed(new Map());
    return Result.flatMap(exportedObject(file, program, target, target), (root) =>
      Result.flatMap(keysOf(file, target, root), (looks) =>
        Result.map(
          Result.all(
            looks.map((look) =>
              Result.flatMap(objectAt(file, `look ${look}`, root, [look, 'options']), (options) =>
                Result.map(
                  keysOf(file, `look ${look}`, options),
                  (levels) => [look, levels] as const,
                ),
              ),
            ),
          ),
          (entries) => new Map(entries),
        ),
      ),
    );
  });
