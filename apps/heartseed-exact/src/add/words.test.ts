/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals, effect/noNewPromise -- a Bun test reading tracked source files, as the gate's other source checks do, over a read made in the data host's turn. */

/**
 * Add verses' and the chooser's words (spec A4). Every shelf row's page
 * shows each verse's words as `versesOf` gives them; the Add verses answer
 * names lists by title and reference alone, holds no verse's words and is
 * under 60 KB with any one shelf open; and the words the port
 * writes that the current Heartseed keeps in its React files (the sheet's
 * `Plant`, `In your field`, its counts and alert; the chooser's heading,
 * testaments, cap and alert) are held to those files' own text.
 */

import { runCall } from '@manna/exact-kit/effect';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { versesOf } from '@manna/heartseed/kjv';
import { placeOf } from '@manna/heartseed/lists';
import { SHELVES } from '@manna/heartseed/shelves';
import { expect, it } from 'bun:test';
import { Option } from 'effect';
import { join } from 'node:path';

import { CHOOSER_HEADING, chooserBooks, chooserShown, countText } from '../chooser/chooser';
import { readGarden, type Held } from '../garden/program';
import { slugOf } from '../garden/view';
import { ROWS } from '../test/add-history';
import { makePort } from '../test/garden-model';
import { addListOf, addShownOf, plantLineOf, type AddShown } from './shelves';

const CURRENT = join(import.meta.dir, '../../../heartseed/src');

/** A first launch's read: nothing planted. */
const EMPTY: Held = await runCall(
  readGarden(makePort().storage),
  { now: Date.UTC(2026, 10, 15, 13), seed: 1 },
  { turn: withDataHost, wait: () => Promise.resolve() },
);

const bytesOf = (value: AddShown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** The words of a canon reference, read apart from the port. */
const wordsAt = (reference: string) =>
  Option.match(placeOf(reference), {
    onNone: () => '',
    onSome: (place) => versesOf(place.book, place.chapter)[place.verse - 1] ?? '',
  });

it("shows every shelf row's verses with versesOf's words", () => {
  for (const list of ROWS) {
    const page = addListOf(slugOf(list.id), EMPTY, '');
    expect({ id: list.id, found: page.found }).toEqual({ id: list.id, found: true });
    expect(page.verses.map((each) => each.reference)).toEqual([...list.verses]);
    for (const verse of page.verses) {
      expect({ ref: verse.reference, empty: verse.text === '' }).toEqual({
        ref: verse.reference,
        empty: false,
      });
      expect(verse.text).toBe(wordsAt(verse.reference));
    }
  }
});

it('answers Add verses, with any one shelf open, by titles and references, no words, under 60 KB', () => {
  const answers = ['', ...SHELVES.map((shelf) => slugOf(shelf.id))].map((open) =>
    addShownOf(EMPTY, open),
  );
  const words = ROWS.flatMap((list) => list.verses.map(wordsAt)).filter((text) => text.length > 24);
  expect(words.length).toBeGreaterThan(500);
  for (const answer of answers) {
    const text = JSON.stringify(answer);
    expect(bytesOf(answer)).toBeLessThan(60_000);
    expect(words.filter((each) => text.includes(each))).toEqual([]);
  }
});

it("writes the current sheet's and chooser's words", async () => {
  const sheet = await Bun.file(join(CURRENT, 'shelves/sheet.tsx')).text();
  const screen = await Bun.file(join(CURRENT, 'chooser/screen.tsx')).text();
  expect(sheet).toContain('>Plant<');
  expect(sheet).toContain('In your field');
  expect(sheet).toContain("return '1 verse';");
  expect(sheet).toContain('return `${list.verses.length} verses`;');
  expect(sheet).toContain('{`${title} was not planted. Try again.`}');
  const row = {
    id: 'x',
    slug: 'x',
    title: 'T',
    count: '',
    offer: 'plant',
    offerText: '',
    singly: false,
  };
  expect(plantLineOf('Failed', row).line).toBe('T was not planted. Try again.');
  expect(screen).toContain(`heading: '${CHOOSER_HEADING}'`);
  expect(chooserBooks().testaments.map((each) => each.label)).toEqual([
    'Old Testament',
    'New Testament',
  ]);
  expect(screen).toContain("label: 'Old Testament'");
  expect(screen).toContain("label: 'New Testament'");
  expect(screen).toContain("if (verses === 1) return '1 verse';");
  expect([countText(1), countText(3)]).toEqual(['1 verse', '3 verses']);
  expect(screen).toContain('{`${LEAST_VERSES} to ${MOST_VERSES} verses`}');
  expect(screen).toContain('`${passageReference(each)} was not planted. Try again.`');
  expect(chooserShown('43', '3', { first: 16, last: 18 }, 'Failed', [])).toMatchObject({
    cap: '3 to 20 verses',
    line: 'John 3:16-18 was not planted. Try again.',
  });
});
