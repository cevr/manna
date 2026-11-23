/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, import/no-unassigned-import -- a host script that imports the tests' chapters preload for the words it says, drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * Home and the session joined (the joins file's J1 drive), on the host
 * named (`bun tools/drive-join.ts web|ios`), the microphone and recognizer
 * granted to the agent's substitute and the speech scripted
 * (`speech-recognition.heard`): John 3:16-18 planted, home's card Start
 * opens Today on the plan's first item, John 3:16 is said through and Next
 * taken, and back on home its plant names the stage the garden (the current
 * app's services) holds for it, and the card's line moves on. Exits 1 on
 * any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { fromHome } from './from-home';

import './setup';

const { versesOf } = await import('@manna/heartseed/kjv');

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const drive = fromHome(makeDrive({ name: 'drive-join', host, appDir: app }));
const store = `join-${host}-${Date.now().toString(36)}`;
const HEARD = new Map([
  ['thee', 'the'],
  ['thy', 'thigh'],
  ['yea', 'yeah'],
]);

/** A verse's text as a recognizer writes it: lowercase words, archaic ones as heard. */
const spokenOf = (text: string) =>
  text
    .split(/\s+/u)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '')
    .map((word) => HEARD.get(word) ?? word)
    .join(' ');

const ops = [
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
  'clock data',
  'clock settle',
  'tap add-list',
  'clock data',
  'clock settle',
  'tap shelf-any',
  'clock settle',
  'tap book-43',
  'clock data',
  'clock settle',
  'tap chapter-3',
  'clock data',
  'clock settle',
  'tap verse-16',
  'clock data',
  'tap verse-18',
  'clock data',
  'tap plant-list',
  'clock data',
  'clock settle',
  'tap tab-garden',
  'clock data',
  'clock settle',
  'back',
  'clock data',
  'clock settle',
  'state homeShown',
  'tap today-action',
  'clock data',
  'clock settle',
  'state today.reference',
  `prefer extension speech-recognition.heard=${JSON.stringify(spokenOf(versesOf(43, 3)[15] ?? ''))}`,
  'tap say',
  'clock settle',
  'clock +15000',
  'clock settle',
  'tap finish',
  'clock settle',
  'tap next',
  'clock data',
  'clock settle',
  'back',
  'clock data',
  'clock settle',
  'state garden',
  'state homeShown',
];

interface Home {
  readonly card: { readonly line: string; readonly action: string };
  readonly rows: readonly {
    readonly plants: readonly { readonly reference: string; readonly label: string }[];
  }[];
}
interface Garden {
  readonly lists: readonly {
    readonly verses: readonly {
      readonly reference: string;
      readonly stage: string;
      readonly recalls: number;
    }[];
  }[];
}

const at = (op: string, nth = 0) => {
  let seen = -1;
  return ops.findIndex((each) => each === op && ++seen === nth);
};
const ran = await drive.launch(store, ops);
const before = ran[at('state homeShown')] as Home | undefined;
const reference = ran[at('state today.reference')];
drive.check(
  "home's card offers Start, and Start opens Today on the plan's first item",
  before?.card.action === 'start' && reference === 'John 3:16',
  { card: before?.card, reference },
);

const garden = ran[at('state garden')] as Garden | undefined;
const home = ran[at('state homeShown', 1)] as Home | undefined;
const verse = garden?.lists[0]?.verses.find((each) => each.reference === 'John 3:16');
const plant = home?.rows[0]?.plants.find((each) => each.reference === 'John 3:16');
drive.check(
  "after the try and Next, home's plant names the garden's stage for the verse",
  verse !== undefined &&
    verse.recalls === 1 &&
    plant?.label.startsWith(`John 3:16, ${verse.stage}`) === true,
  { verse, plant },
);
drive.check(
  "the card's line moves on from the plan's first line",
  home !== undefined && before !== undefined && home.card.line !== before.card.line,
  { before: before?.card, after: home?.card },
);

process.exit(drive.finish());
