// The stroke limbs' census: every arm of every cast member's cut view is a
// stroke limb, or says why it is not. Each view (`views.ts`) is loaded as the
// film loads it (`puppetFrom`), and each part its skeleton skins on an arm's
// chain (`shoulder<Side>`, `elbow<Side>`, `wrist<Side>`) is read: a stroke
// limb where its part carries one, else refused by `puppetOf` with the
// refusal's reason (`Puppet.refused`), else kept painted by its view with
// why (`painted`, `skeleton.ts`). An arm with none of the three fails here,
// as does one whose reason is empty. The last case prints the whole table
// (member, view, side, and what the arm is) with its counts. Each case
// decodes a view's sheets and measures its limbs, so they run in the slow
// suite.

import * as BunServices from '@effect/platform-bun/BunServices';
import type { PuppetSpec } from '@manna/film/canvas';
import { PuppetImagesBun, puppetFrom } from '@manna/film/tools';
import { Console, Effect, Layer, Option, Predicate } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { LEAST_VIEWS, cutViews } from './views.ts';

const layer = Layer.mergeAll(
  BunServices.layer,
  PuppetImagesBun.pipe(Layer.provide(BunServices.layer)),
);

const VIEWS: ReadonlyArray<PuppetSpec> =
  // oxlint-disable-next-line effect/noAsyncFunction -- read once as the file loads, so each view is a case of its own
  await Effect.runPromise(cutViews);

/** What an arm is: a stroke limb, refused with why, kept painted with why, or none of these. */
type Shown =
  | { readonly _tag: 'limb' }
  | { readonly _tag: 'refused'; readonly reason: string }
  | { readonly _tag: 'out'; readonly reason: string }
  | { readonly _tag: 'neither' };

/** One arm of one view, as the census reads it. */
interface Row {
  readonly member: string;
  readonly view: string;
  readonly side: string;
  readonly part: string;
  readonly shown: Shown;
}

/** The arms `spec`'s skeleton skins on a whole arm chain, each its part and side. */
const armsOf = (spec: PuppetSpec) =>
  Object.entries(spec.skeleton.skin).flatMap(([part, bones]) =>
    ['Right', 'Left'].flatMap((side) =>
      Option.toArray(
        Option.liftPredicate({ part, side }, () =>
          ['shoulder', 'elbow', 'wrist'].every((j) => bones.includes(`${j}${side}`)),
        ),
      ),
    ),
  );

/** The arms `spec`'s view keeps painted, by part, each with why (`skeleton.ts`'s `painted`). */
const paintedOf = (spec: PuppetSpec): ReadonlyMap<string, string> =>
  new Map(
    Option.match(
      Option.liftPredicate(spec.skeleton, (s) => Predicate.hasProperty(s, 'painted')),
      {
        onNone: () => [],
        onSome: (s) =>
          Array.from(Object(s).painted as ReadonlyArray<{ part: string; reason: string }>).map(
            (p) => [p.part, p.reason] as const,
          ),
      },
    ),
  );

/** Each arm of `spec`'s view, loaded as the film loads it. */
const rowsOf = (spec: PuppetSpec) =>
  Effect.gen(function* () {
    const puppet = yield* puppetFrom(spec);
    const painted = paintedOf(spec);
    const [member = spec.key, view = spec.key] = spec.key.split('/cutout/');
    return armsOf(spec).map(({ part, side }): Row => {
      const limbed = puppet.parts.some((p) => p.name === part && Predicate.isNotUndefined(p.limb));
      const refused = puppet.refused.filter((r) => r.part === part).map((r) => r.message);
      const shown = Option.liftPredicate<Shown>({ _tag: 'limb' }, () => limbed).pipe(
        Option.orElse(() =>
          Option.map(
            Option.liftPredicate(refused, (r) => r.length > 0),
            (r): Shown => ({ _tag: 'refused', reason: r.join('; ') }),
          ),
        ),
        Option.orElse(() =>
          Option.map(Option.fromUndefinedOr(painted.get(part)), (reason): Shown => ({
            _tag: 'out',
            reason,
          })),
        ),
        Option.getOrElse((): Shown => ({ _tag: 'neither' })),
      );
      return { member, view, side, part, shown };
    });
  });

const ROWS: Array<Row> = [];

/** An arm's line in the table: member, view, side, and what it is. */
const line = (r: Row) => `| ${r.member} | ${r.view} | ${r.side} | ${whatOf(r.shown)} |`;

/** What an arm is, in words: its tag, and the reason when it has one. */
const whatOf = (s: Shown): string => {
  switch (s._tag) {
    case 'limb':
    case 'neither':
      return s._tag;
    case 'refused':
    case 'out':
      return `${s._tag}: ${s.reason}`;
  }
};

describe('every cut-out arm is a stroke limb, or says why not', () => {
  it.effect(`finds at least ${LEAST_VIEWS} puppet views`, () =>
    Effect.sync(() => expect(VIEWS.length).toBeGreaterThanOrEqual(LEAST_VIEWS)),
  );

  for (const spec of VIEWS)
    it.effect.layer(layer)(`${spec.key}: each arm is a limb, or refused or out with a reason`, () =>
      Effect.gen(function* () {
        const rows = yield* rowsOf(spec);
        ROWS.push(...rows);
        expect(rows.filter((r) => r.shown._tag === 'neither').map((r) => r.part)).toEqual([]);
        expect(rows.filter((r) => whatOf(r.shown).trim().endsWith(':'))).toEqual([]);
      }),
    );

  it.effect('prints the census: limbs, refused and out, and no arm with none', () =>
    Effect.gen(function* () {
      const count = (tag: Shown['_tag']) => ROWS.filter((r) => r.shown._tag === tag).length;
      yield* Console.log(
        [
          `census: ${ROWS.length} arms; limbs ${count('limb')} / refused ${count('refused')} / out ${count('out')} / neither ${count('neither')}`,
          '| member | view | side | arm |',
          '| --- | --- | --- | --- |',
          ...ROWS.map(line),
        ].join('\n'),
      );
      expect(count('neither')).toBe(0);
    }),
  );
});
