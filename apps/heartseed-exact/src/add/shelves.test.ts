/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noTernary, no-await-in-loop -- each garden is planted step by step, as Exact asks its sources one by one, in the data host's turn; a row is drawn by a coin. */

/**
 * Every shelf is the current Heartseed's (spec A2). Add verses lists
 * `SHELVES` in its order, with its titles and notes, each shelf of picks
 * or promises its lists in place and each Handbook section its lists on
 * its own page; and over generated gardens (0 to 3 lists, 0 to 20 single
 * verses, rows planted or not) every row's offer is `offerStateOf`'s over
 * the field the current home draws, a row plants singly exactly when
 * `plantsSingly` says, and the foot's line is the current sheet's.
 */

import { runCall } from '@manna/exact-kit/effect';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { LIMIT_LINE, SINGLES_LIMIT_LINE } from '@manna/heartseed/chooser';
import { fieldOf } from '@manna/heartseed/field';
import { fieldPassagesWith } from '@manna/heartseed/home';
import { listsOf, singleVersesOf } from '@manna/heartseed/lists';
import { heldCount, MOST_PASSAGES, MOST_SINGLES } from '@manna/heartseed/passages';
import { offerStateOf, plantsSingly, SHELVES } from '@manna/heartseed/shelves';
import { expect, it } from 'bun:test';

import { readGarden, type Held } from '../garden/program';
import { slugOf } from '../garden/view';
import { ROWS } from '../test/add-history';
import { makePort } from '../test/garden-model';
import { seeded } from '../test/random';
import { addSectionOf, addShownOf } from './shelves';

const START = Date.UTC(2026, 10, 15, 13, 0, 0);
const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const SHORT_ROWS = ROWS.filter(plantsSingly);

/** What the current sheet shows for `held`: each row's offer, and the foot's line. */
const appSheet = (held: Held) => {
  if (held.garden._tag === 'Unread' || held.passages._tag === 'Unread')
    return { offers: ROWS.map(() => 'unread'), line: '' };
  const passages = held.passages;
  const field = fieldOf(
    held.garden,
    fieldPassagesWith(listsOf([], passages, []), singleVersesOf([], passages)),
  );
  let line = '';
  if (heldCount(passages) >= MOST_PASSAGES) line = LIMIT_LINE;
  else if (passages.singles.length >= MOST_SINGLES) line = SINGLES_LIMIT_LINE;
  return { offers: ROWS.map((list) => offerStateOf(list, passages, field)), line };
};

/** Every row the port shows for `held`, in shelf order, Handbook sections opened. */
const portRows = (held: Held) =>
  addShownOf(held).shelves.flatMap((shelf) => {
    if (shelf.kind === 'handbook') return addSectionOf(shelf.slug, held).rows;
    return shelf.rows;
  });

it('lists the shelves in the order, titles and notes of SHELVES, every row in place', async () => {
  const port = makePort();
  const held = await runCall(readGarden(port.storage), { now: START, seed: 1 }, HOST);
  const shown = addShownOf(held);
  expect(shown.shelves.map((each) => [each.id, each.title, each.note])).toEqual(
    SHELVES.map((each) => [each.id, each.title, each.note]),
  );
  expect(shown.shelves.map((each) => each.kind)).toEqual(
    SHELVES.map((each) => {
      if (each.source._tag === 'Bible') return 'bible';
      if (each.id.startsWith('handbook:')) return 'handbook';
      return 'lists';
    }),
  );
  const rows = portRows(held);
  expect(rows.map((row) => [row.id, row.title, row.slug, row.singly])).toEqual(
    ROWS.map((list) => [list.id, list.title, slugOf(list.id), plantsSingly(list)]),
  );
  expect(new Set(rows.map((row) => row.slug)).size).toBe(rows.length);
  expect(addSectionOf('nowhere', held)).toMatchObject({ found: false, rows: [] });
});

it("offers every row as offerStateOf over the current home's field, in generated gardens", async () => {
  const lines = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) {
    const random = seeded(seed);
    const port = makePort();
    let now = START;
    const plants = 4 + random.below(28);
    for (let n = 0; n <= plants; n++) {
      const row = random.chance(0.75) ? random.pick(SHORT_ROWS) : random.pick(ROWS);
      await port.call('addPlant', [slugOf(row.id), now, 0, seed]);
      now += 60_000;
      if (n % 4 !== 0 && n !== plants) continue;
      const held = await runCall(readGarden(port.storage), { now, seed }, HOST);
      const app = appSheet(held);
      lines.add(app.line);
      const shown = addShownOf(held);
      expect({ seed, n, line: shown.line }).toEqual({ seed, n, line: app.line });
      expect({ seed, n, offers: portRows(held).map((row) => row.offer) }).toEqual({
        seed,
        n,
        offers: app.offers,
      });
    }
  }
  expect([...lines].sort()).toEqual(['', LIMIT_LINE, SINGLES_LIMIT_LINE].sort());
});
