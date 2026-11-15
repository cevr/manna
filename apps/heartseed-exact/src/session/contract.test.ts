/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals, effect/noTernary, effect/noNullish, no-await-in-loop -- a Bun test reading one tracked contract file beside it, as the gate's other source checks do, under the zone the contract pins; each Minutes is chosen on the oracle in turn, and the host's zone, unset or named, is restored. */

/**
 * `session.test.contract` writes what Today shows as literals: the counts at
 * each Minutes, the first item, its words, and a new verse's cue. This test
 * holds each to the current Heartseed's own answer for the same garden and
 * instant (the A1 oracle: John 3:16-18 and Psalm 119:1 planted at the
 * contract's epoch in its zone), so the contract restates nothing the
 * current app does not give.
 */

import { expect, it } from 'bun:test';
import { cueIn } from '@manna/heartseed/garden';
import { countsOf, type Minutes } from '@manna/heartseed/session';
import { Option } from 'effect';
import { join } from 'node:path';

import { appPlant } from '../test/garden-model';
import { makeSessionOracle, seenOf, setZone, showingOf } from '../test/session-model';

const CONTRACT = join(import.meta.dir, '../../session.test.contract');

/** The test block of `name` in the contract. */
const blockOf = (contract: string, name: string) =>
  contract.split('\ntest ').find((block) => block.startsWith(`"${name}`)) ?? '';

it("the contract's counts, first item, words and cue are the current app's", async () => {
  const contract = await Bun.file(CONTRACT).text();
  const epoch = Date.parse(/^epoch "(?<at>[^"]+)"/mu.exec(contract)?.groups?.['at'] ?? '');
  const zone = /^time-zone "(?<zone>[^"]+)"/mu.exec(contract)?.groups?.['zone'] ?? '';
  const zoneWas = process.env.TZ;
  setZone(zone);
  const oracle = await makeSessionOracle();
  await oracle.at(epoch, appPlant({ book: 43, chapter: 3, first: 16, last: 18 }));
  await oracle.at(epoch, appPlant({ book: 19, chapter: 119, first: 1, last: 1 }));
  await oracle.session(epoch, (each) => each.begin);
  const first = await oracle.viewAt(epoch);
  const seen = seenOf(first.session, first.garden);
  const showing = showingOf(first.session, first.garden);

  const items = blockOf(contract, "The plan's first item shows");
  expect(items).toContain(`expect text "item-reference" == "${seen.shown.reference}"`);
  expect(items).toContain(
    `expect state today.words.length == ${Option.getOrElse(
      Option.map(showing, (each) => each.piece.words),
      () => -1,
    )}`,
  );
  expect(items).toContain(`expect text "counts" == "${seen.shown.counts}"`);

  const minutes = blockOf(contract, 'Minutes shape the plan');
  const lines = [
    ...minutes.matchAll(
      /tap "minutes-(?<minutes>\d+)"[\s\S]*?expect text "counts" == "(?<counts>[^"]*)"/gu,
    ),
  ];
  expect(lines.length).toBe(2);
  for (const line of lines) {
    const chosen = Number(line.groups?.['minutes']) as Minutes;
    await oracle.session(epoch, (each) => each.choose(chosen));
    const view = await oracle.viewAt(epoch);
    const counts = Option.match(view.session.plan, {
      onNone: () => '',
      onSome: (plan) => (view.garden._tag === 'Read' ? countsOf(plan, view.garden) : ''),
    });
    expect({ chosen, counts: line.groups?.['counts'] }).toEqual({ chosen, counts });
  }

  const cue = blockOf(contract, 'The cue follows the stage');
  const garden = (await oracle.viewAt(epoch)).garden;
  expect(garden._tag).toBe('Read');
  if (garden._tag === 'Read')
    expect(cue).toContain(`expect state today.cue == "${cueIn(garden, 'Psalms 119:1')}"`);
  if (zoneWas === undefined) Reflect.deleteProperty(process.env, 'TZ');
  else setZone(zoneWas);
});
