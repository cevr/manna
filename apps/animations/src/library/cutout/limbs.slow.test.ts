// The stroke limbs' census: every arm of every cast member's cut view is a
// stroke limb, or says why it is not. Each view (`views.ts`) is loaded as the
// film loads it (`puppetFrom`). Skin chains, declarations, painted arms and
// refusals share one inventory, so a broken skin cannot erase an arm: a stroke
// limb where its part carries one, else refused by `puppetOf` with the
// refusal's reason (`Puppet.refused`), else kept painted by its view with
// why (`painted`, `skeleton.ts`). An arm with none of the three fails here,
// as does an empty reason, orphan refusal or declaration error. The last case prints the whole table
// (member, view, side, and what the arm is) with its counts. Each case
// decodes a view's sheets and measures its limbs, so they run in the slow
// suite.

import * as BunServices from '@effect/platform-bun/BunServices';
import type { PuppetSpec } from '@manna/film/canvas';
import { PuppetImagesBun, puppetFrom } from '@manna/film/tools';
import { Console, Effect, Layer } from 'effect';
import { censusOf, refusalErrors } from './limb-census.ts';
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

/** Each arm of a view, loaded as the film loads it. */
const rowsOf = (spec: PuppetSpec) =>
  Effect.gen(function* () {
    const puppet = yield* puppetFrom(spec);
    const census = censusOf(spec, puppet);
    expect(refusalErrors(puppet.refused, census)).toEqual([]);
    const [member = spec.key, view = spec.key] = spec.key.split('/cutout/');
    return census.map((r): Row => {
      if (r.tag === 'limb' || r.tag === 'neither')
        return { member, view, side: r.side, part: r.part, shown: { _tag: r.tag } };
      return { member, view, side: r.side, part: r.part, shown: { _tag: r.tag, reason: r.reason } };
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
