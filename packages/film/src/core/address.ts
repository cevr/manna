import { Array as Arr, Match, Option, Order, Result } from 'effect';
import type { ActName, Address } from './address-schema.ts';
import { type PartError, type Stretch, stretchesOf } from './acts.ts';
import {
  AddressConflict,
  ScenesApart,
  type ShortError,
  UnknownAct,
  UnknownShort,
  type UnknownScene,
} from './errors.ts';
import { type Placed, scenesOf } from './layout.ts';
import type { Act, Look, Short } from './schema.ts';
import { resolveShort } from './shorts.ts';
import type { Interval } from './time.ts';

export { Address, addressKey, addressOfKey, sceneAddress } from './address-schema.ts';

export interface AddressFlags {
  readonly act: Option.Option<ActName>;
  readonly scene: Option.Option<ReadonlyArray<string>>;
  readonly short: Option.Option<string>;
}

export const addressOf = (flags: AddressFlags): Result.Result<Address, AddressConflict> => {
  const named: ReadonlyArray<Option.Option<Address>> = [
    Option.map(flags.act, (act): Address => ({ _tag: 'Act', act })),
    Option.flatMap(flags.scene, (ids) =>
      Option.map(Option.liftPredicate(ids, Arr.isReadonlyArrayNonEmpty), (nonEmpty): Address => ({
        _tag: 'Scenes',
        ids: nonEmpty,
      })),
    ),
    Option.map(flags.short, (id): Address => ({ _tag: 'Short', id })),
  ];
  const given = Arr.getSomes(named);
  if (given.length > 1)
    return Result.fail(
      AddressConflict.make({
        given: given.map((a) => a._tag.toLowerCase()),
      }),
    );
  return Result.succeed(Option.getOrElse(Arr.head(given), (): Address => ({ _tag: 'Film' })));
};

export interface Addressable {
  readonly name: string;
  readonly placed: ReadonlyArray<Placed>;
  readonly look: Option.Option<Look>;
  readonly shorts: ReadonlyArray<Short>;
}

export interface Scope {
  readonly address: Address;
  readonly scenes: ReadonlyArray<Placed>;
  readonly span: Option.Option<Interval>;
  readonly acts: ReadonlyArray<Stretch<Act>>;
  readonly short: Option.Option<Short>;
}

export type AddressError =
  | UnknownScene
  | ScenesApart
  | UnknownAct
  | UnknownShort
  | PartError
  | ShortError;

const spanOf = (scenes: ReadonlyArray<Placed>): Interval => ({
  from: Math.min(...scenes.map((p) => p.start)),
  to: Math.max(...scenes.map((p) => p.start + p.dur)),
});

const inFilmOrder = (film: Addressable, ids: ReadonlySet<string>) =>
  film.placed.filter((p) => ids.has(p.spec.id));

export const resolveAddress = (
  film: Addressable,
  address: Address,
): Result.Result<Scope, AddressError> => {
  const acts = Option.match(film.look, {
    onNone: () => Result.succeed<ReadonlyArray<Stretch<Act>>>([]),
    onSome: (look) => stretchesOf(look.acts, film.placed),
  });
  return Match.valueTags(address, {
    Film: (whole) =>
      Result.map(acts, (all): Scope => ({
        address: whole,
        scenes: film.placed,
        span: Option.none(),
        acts: all,
        short: Option.none(),
      })),
    Act: (named) =>
      Result.flatMap(acts, (all) =>
        Result.fromOption(
          Option.map(
            Arr.findFirst(all, (a) => a.part.name === named.act),
            (act): Scope => ({
              address: named,
              scenes: inFilmOrder(film, new Set(act.scenes)),
              span: Option.some({ from: act.from, to: act.to }),
              short: Option.none(),
              acts: [act],
            }),
          ),
          () => UnknownAct.make({ act: named.act, known: all.map((a) => a.part.name) }),
        ),
      ),
    Scenes: (named) =>
      Result.flatMap(scenesOf(film.placed, named.ids), (): Result.Result<Scope, ScenesApart> => {
        const ids = new Set(named.ids);
        const first = film.placed.findIndex((p) => ids.has(p.spec.id));
        const last = film.placed.findLastIndex((p) => ids.has(p.spec.id));
        const run = film.placed.slice(first, last + 1);
        const between = run.filter((p) => !ids.has(p.spec.id)).map((p) => p.spec.id);
        if (between.length > 0)
          return Result.fail(
            ScenesApart.make({ named: inFilmOrder(film, ids).map((p) => p.spec.id), between }),
          );
        const played = Order.mapInput(Order.Number, (id: string) =>
          run.findIndex((p) => p.spec.id === id),
        );
        return Result.succeed({
          address: { _tag: 'Scenes', ids: Arr.sort(Arr.dedupe(named.ids), played) },
          scenes: run,
          span: Option.some(spanOf(run)),
          short: Option.none(),
          acts: [],
        });
      }),
    Short: (named) =>
      Result.flatMap(
        Result.fromOption(
          Arr.findFirst(film.shorts, (s) => s.id === named.id),
          () =>
            UnknownShort.make({
              film: film.name,
              id: named.id,
              known: film.shorts.map((s) => s.id),
            }),
        ),
        (short) =>
          Result.map(resolveShort(film.placed, short), (): Scope => ({
            address: named,
            scenes: inFilmOrder(film, new Set(short.spans.map((s) => s.scene))),
            span: Option.none(),
            acts: [],
            short: Option.some(short),
          })),
      ),
  });
};
